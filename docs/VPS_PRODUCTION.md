# VPS production deployment (operator runbook)

This is an **opt-in** deployment overlay. It does not provision a VPS, configure DNS, install a scheduler, train models, or create accounts. The existing local Compose configuration remains unchanged.

## Prerequisites

- Linux VPS with Docker Engine and the Compose plugin, Git, Python 3.13 and enough disk/RAM for the offline ML pipeline. Size and benchmark the host before committing to a plan.
- A domain whose A/AAAA records resolve to the VPS. Inbound TCP 80/443 and UDP 443 must be allowed. Keep SSH restricted; do **not** expose port 5000 or MongoDB.
- A dedicated non-root operator account and persistent disk with backups. Protect Docker group membership as root-equivalent.
- Review and revoke any historical leaked credentials documented in [SECURITY.md](SECURITY.md).

## Prepare persistent ML state

Clone the repository at `/opt/investing-hub` (or adapt the systemd unit paths). Keep `ml/data` on persistent local disk, outside OneDrive/network sync, with permissions accessible to the `investinghub` systemd account. **Do not overwrite an existing database.** Back it up before migration; do not commit SQLite, model files, credentials or predictions.

Install Python dependencies and generate the initial snapshot on the host:

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r ml/requirements.txt
# For a fresh database only; with an existing database sync is incremental.
.venv/bin/python ml/pipeline.py sync
.venv/bin/python ml/pipeline.py train
.venv/bin/python ml/pipeline.py select
.venv/bin/python ml/pipeline.py predict
.venv/bin/python ml/pipeline.py status
```

For an existing database with valid selected models, do **not** retrain by default. Instead run `sh deploy/run-daily.sh` and inspect `daily-status`. The API reads the same host directory mounted read-only at `/app/ml/data`. Mounting the **directory**, not individual SQLite/JSON files, is important for atomic publication.

## HTTPS deployment

Set `DOMAIN` and `ACME_EMAIL` in a private local `.env` file or exported environment. Use only the hostname (no scheme) for DOMAIN, e.g. `hub.example.com`. Never commit real secrets. Confirm DNS resolves before requesting TLS.

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
curl -fsS https://YOUR_DOMAIN/api/health
```

Caddy terminates public TLS and proxies to the existing Nginx web service, which forwards `/api/` to the internal Node backend. The original Compose web binding remains `127.0.0.1:8080` for local-only inspection. No application container is directly published on the public interface. Caddy certificates/configuration persist in named Docker volumes. Do not delete these volumes casually.

The guest demo works without MongoDB, SMTP or Firebase. Accounts, verification emails and notifications require separate secured infrastructure and secret configuration; do not assume those integrations work in this guest stack. A missing/stale ML publication deliberately yields unavailable predictions, not fabricated numbers.

## Daily updates

First test `sh deploy/run-daily.sh` manually as the service user and confirm the publication is fresh. Adjust the `User`, `WorkingDirectory`, and `ExecStart` paths if using a different install layout. Then:

```sh
sudo cp deploy/investing-hub-daily.service deploy/investing-hub-daily.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now investing-hub-daily.timer
systemctl list-timers investing-hub-daily.timer
sudo journalctl -u investing-hub-daily.service -n 100 --no-pager
```

The timer starts at 00:20 UTC (after the completed daily candle), with up to two minutes randomized delay. It executes sync/validate/reconcile/predict without retraining or model reselection. A powered-off VPS catches up on the next boot via `Persistent=true`. The existing pipeline lock prevents concurrent mutating jobs. Monitor `daily-status` and the API's prediction availability; a successful timer activation does not guarantee fresh data.

## Operational checklist

1. Confirm HTTPS, DNS, `/api/health`, main navigation, price charts, and the eight prediction availability states on desktop and mobile.
2. Confirm only 80/443 and restricted SSH are reachable externally. Keep Docker daemon/socket private.
3. Verify database and JSON publication backups **and test restore**. Back up before upgrades; keep credentials and backups off Git.
4. Review `docker compose ... logs --tail=100`, disk space, certificate renewal and daily job failures regularly.
5. For deployment upgrades, pull reviewed commits, back up ML data, rebuild containers, check health and roll back to a known commit if needed.
6. Run CI and a real Docker build/health smoke test before merging; the documentation and Compose overlay alone do not prove production readiness.

## Limitations

This overlay intentionally does not configure automatic deployments, monitoring alerts, account infrastructure, secret injection, or ML retraining. No VPS or public deployment was created by this change.
