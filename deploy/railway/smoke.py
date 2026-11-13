"""Exercise the built image on a disposable volume; no live providers or training."""
import json
import subprocess
import time
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4

IMAGE = 'investing-hub-railway:test'

# Explicit synthetic HTTP-boundary fixture. ML algorithm behavior is covered by
# the Python suite; this checks Linux nanosecond stamps, routing and persistence.
SEED = '''
import sys, sqlite3, time
from pathlib import Path
sys.path.insert(0, '/app/ml')
from common import SYMBOLS, DAY_MS
from publication import stamp
from json_store import atomic_json
db = Path('/data/ml/lifecycle.sqlite3')
with sqlite3.connect(db) as connection:
    connection.execute('CREATE TABLE IF NOT EXISTS verification_marker (id INTEGER PRIMARY KEY)')
    connection.execute('INSERT OR IGNORE INTO verification_marker VALUES (1)')
now = int(time.time()*1000)
start = now//DAY_MS*DAY_MS
info = db.stat()
atomic_json('/data/ml/predictions.json', {
    'version': 'price-predictions-v1', 'generatedAt': stamp(now),
    'registry': {'size': info.st_size, 'mtimeNs': str(info.st_mtime_ns)},
    'forecasts': [{'symbol': symbol, 'target': 'next_daily_close', 'horizon': '1d',
        'predictionTimestamp': stamp(now), 'sourceDataTimestamp': stamp(start-1),
        'targetTimestamp': stamp(start+DAY_MS-1), 'modelVersion': symbol+'-DEPLOYMENT-FIXTURE',
        'algorithm': 'ridge', 'datasetFingerprint': 'a'*64, 'referencePrice': 100,
        'predictedReturn': .01, 'predictedValue': 101, 'evaluationReference': 'ml:DEPLOYMENT-FIXTURE',
        'status': 'experimental', 'reason': 'Synthetic container verification fixture.'} for symbol in SYMBOLS]})
'''


def docker(*arguments, **kwargs):
    return subprocess.run(['docker', *arguments], check=True, capture_output=True, text=True, **kwargs).stdout.strip()


def main():
    name = 'investing-hub-smoke-'+uuid4().hex[:10]
    volume = name+'-data'
    created = False
    try:
        missing = subprocess.run(['docker', 'run', '--rm', IMAGE], capture_output=True, text=True, timeout=30)
        assert missing.returncode != 0, 'image must refuse a missing persistent mount'
        docker('volume', 'create', volume)
        created = True
        docker('run', '-d', '--name', name, '--mount', f'source={volume},target=/data',
               '-e', 'PORT=8123', '-e', 'ML_DAILY_ENABLED=false', '-e', 'CORS_ORIGINS=http://localhost',
               '-p', '127.0.0.1::8123', IMAGE)

        def origin():
            bindings = json.loads(docker('inspect', name))[0]['NetworkSettings']['Ports']['8123/tcp']
            return 'http://127.0.0.1:'+bindings[0]['HostPort']

        def get(path):
            with urlopen(origin()+path, timeout=5) as response:
                return response.read().decode()

        def healthy():
            for _ in range(60):
                try:
                    if json.loads(get('/api/health'))['status'] == 'ok':
                        docker('exec', name, 'node', 'deploy/railway/healthcheck.mjs')
                        return
                except (URLError, OSError):
                    pass
                time.sleep(1)
            raise AssertionError('container did not become healthy')

        healthy()
        docker('exec', name, 'python', '-c', """
from pathlib import Path
found = 0
for process in Path('/proc').iterdir():
    if not process.name.isdigit():
        continue
    try:
        args = (process/'cmdline').read_bytes().split(bytes([0]))
        if len(args) > 1 and args[1] in (b'backend/dist/server.js', b'deploy/railway/runtime.py'):
            uid = next(line for line in (process/'status').read_text().splitlines() if line.startswith('Uid:')).split()[1]
            assert uid == '10001', 'application processes must run without root'
            found += 1
    except FileNotFoundError:
        pass
assert found == 2
""")
        assert '<html' in get('/') and '<html' in get('/predictions')
        assert json.loads(get('/api/capabilities'))['accounts'] is False
        assert json.loads(get('/api/predictions/BTCUSDT'))['status'] == 'unavailable'
        docker('exec', '-i', '--user', '10001:10001', name, 'python', '-', input=SEED)
        from pathlib import Path
        import re
        symbols = re.findall(r'symbol:\s*"([A-Z0-9]+USDT)"', (Path(__file__).resolve().parents[2]/'shared'/'contracts.ts').read_text())
        for symbol in symbols:
            result = json.loads(get('/api/predictions/'+symbol))
            assert result['status'] == 'experimental' and result['predictedValue'] == 101
        docker('restart', '--time', '20', name)
        healthy()
        assert json.loads(get('/api/predictions/BTCUSDT'))['status'] == 'experimental'
        docker('exec', '--user', '10001:10001', name, 'python', '-c',
               "import sys; sys.path.insert(0,'/app/ml'); from backup import create_backup; create_backup('/data/ml/lifecycle.sqlite3','/data/ml/backups')")
        assert json.loads(get('/api/predictions/BTCUSDT'))['status'] == 'experimental'
        docker('exec', '--user', '10001:10001', name, 'python', '-c',
               "import sqlite3; c=sqlite3.connect('/data/ml/lifecycle.sqlite3'); c.execute('INSERT INTO verification_marker VALUES (2)'); c.commit(); c.close()")
        assert json.loads(get('/api/predictions/BTCUSDT'))['reason'] == 'registry_changed_regenerate_predictions'
        docker('exec', '-i', '--user', '10001:10001', name, 'python', '-', input=SEED)
        docker('stop', '--time', '20', name)
        assert json.loads(docker('inspect', name))[0]['State']['ExitCode'] == 0
        docker('rm', name)
        # A new container on the same volume simulates redeployment, not just restart.
        docker('run', '-d', '--name', name, '--mount', f'source={volume},target=/data',
               '-e', 'PORT=8123', '-e', 'ML_DAILY_ENABLED=false', '-e', 'CORS_ORIGINS=http://localhost',
               '-p', '127.0.0.1::8123', IMAGE)
        healthy()
        assert json.loads(get('/api/predictions/BTCUSDT'))['status'] == 'experimental'
        docker('stop', '--time', '20', name)
        assert json.loads(docker('inspect', name))[0]['State']['ExitCode'] == 0
        print('Container health, custom PORT, SPA/API, all-eight publications, invalidation, backup, restart, redeploy and graceful shutdown passed.')
    except Exception:
        subprocess.run(['docker', 'logs', name], check=False)
        raise
    finally:
        subprocess.run(['docker', 'rm', '-f', name], check=False, capture_output=True)
        if created:
            subprocess.run(['docker', 'volume', 'rm', volume], check=False, capture_output=True)


if __name__ == '__main__':
    main()
