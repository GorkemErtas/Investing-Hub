"""Isolated operational tests; never registers a real Windows task or uses the network."""
import io
import json
import os
import subprocess
import sys
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from daily import DailyLog, daily_status, MAX_LOGS
from job_lock import job_lock
from json_store import atomic_json
from common import DAY_MS, digest
from pipeline import main
from provider import Binance, ProviderError
from test_lifecycle import DatabaseTests


class DailyOperationalTests(DatabaseTests):
    @unittest.skipUnless(os.name=='nt','Windows runner')
    def test_real_windows_runner_returns_failure_and_safe_readable_log(self):
        missing=Path(self.tmp.name)/'not-present.sqlite3'
        result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('run.ps1')),'-Task','Daily','-DatabasePath',str(missing)],capture_output=True,text=True,timeout=40)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Daily execution failed',result.stdout)
        status=daily_status(missing.parent/'logs'/'daily')
        self.assertEqual(status['status'],'failure')
        self.assertEqual(status['lastEvent']['code'],'existing_database_required')
        self.assertNotIn(str(missing),result.stdout+result.stderr)
        self.assertFalse(missing.exists())

    def test_lock_excludes_an_independent_process_and_is_released(self):
        command=[sys.executable,'-c',"from job_lock import job_lock; import sys;\nwith job_lock(sys.argv[1]): print('acquired')",str(self.path)]
        with job_lock(self.path):
            result=subprocess.run(command,cwd=Path(__file__).parent,capture_output=True,text=True,timeout=30)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('JobBusy',result.stderr)
            with patch('sys.stdout',new_callable=io.StringIO): self.assertEqual(main(['daily','--db',str(self.path)]),1)
        result=subprocess.run(command,cwd=Path(__file__).parent,capture_output=True,text=True,timeout=30)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_log_retention_and_readonly_status_with_interrupted_execution(self):
        directory=Path(self.tmp.name)/'logs'
        for index in range(MAX_LOGS+5):
            log=DailyLog(directory,1700000000000+index)
            log.record('started',1700000000000+index); log.close()
            os.utime(log.path,((1700000000000+index)/1000,)*2)
        self.assertLessEqual(len(list(directory.glob('*.jsonl'))),MAX_LOGS)
        self.assertEqual(daily_status(directory)['status'],'interrupted_or_running')
        before={p.name:p.read_bytes() for p in directory.glob('*')}
        daily_status(directory)
        self.assertEqual(before,{p.name:p.read_bytes() for p in directory.glob('*')})
        with closing(DailyLog(directory,1700000000000+31*DAY_MS)):
            pass
        self.assertEqual(len(list(directory.glob('*.jsonl'))),1)

    def test_atomic_writer_preserves_envelope_and_previous_file_on_replace_error(self):
        path=Path(self.tmp.name)/'predictions.json'; atomic_json(path,{'price':123.45})
        original=path.read_bytes(); envelope=json.loads(original)
        self.assertEqual(digest(envelope['payload'].encode()),envelope['sha256'])
        with patch('json_store.os.replace',side_effect=OSError('isolated failure')):
            with self.assertRaises(OSError): atomic_json(path,{'price':9})
        self.assertEqual(path.read_bytes(),original)
        self.assertEqual(list(path.parent.glob('*.tmp')),[])

    def test_network_retries_are_bounded_and_reported_without_content(self):
        retries=[]; pauses=[]
        with self.assertRaises(ProviderError):
            Binance(opener=lambda *a,**k: (_ for _ in ()).throw(TimeoutError()),pause=pauses.append,on_retry=retries.append).download('https://data-api.binance.vision/test')
        self.assertEqual(retries,[1,2]); self.assertEqual(pauses,[.5,1.])


@unittest.skipUnless(os.name=='nt','Windows Task Scheduler management')
class SchedulerTests(unittest.TestCase):
    def test_xml_and_management_with_mocked_task_scheduler(self):
        result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('test_schedule.ps1'))],capture_output=True,text=True,timeout=45)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        self.assertIn('scheduler_mocks_passed',result.stdout)
