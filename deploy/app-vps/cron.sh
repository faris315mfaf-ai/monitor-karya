#!/usr/bin/env bash
# Pengganti cron Vercel (vercel.json). Memanggil endpoint cron dari DALAM
# kontainer, sehingga CRON_SECRET tidak pernah ditulis di crontab host dan
# /api/cron/* tetap ditolak dari internet oleh Caddy.
#
#   bash cron.sh remind-divisions
#   bash cron.sh reminder-rules
#   bash cron.sh kpi-snapshot      # KpiSnapshot harian per PT (setelah kunci 17.00 WIB)
#
# Pasang di crontab user admin (host sudah WIB lewat harden.sh):
#   crontab -e
#   0 9 * * 1-5      bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh remind-divisions >> /srv/apps/monitor-karya/cron.log 2>&1
#   */30 * * * * bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh reminder-rules  >> /srv/apps/monitor-karya/cron.log 2>&1
#   30 17 * * *      bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh kpi-snapshot    >> /srv/apps/monitor-karya/cron.log 2>&1
set -euo pipefail
JOB="${1:?nama job cron}"
[[ "$JOB" == remind-divisions || "$JOB" == reminder-rules || "$JOB" == kpi-snapshot ]] || { echo "nama job tidak sah"; exit 1; }

docker exec monitor-karya-monitor-karya-1 node -e "
if (!process.env.CRON_SECRET) { console.error('CRON_SECRET belum diisi'); process.exit(1); }
fetch('http://127.0.0.1:3000/api/cron/$JOB', {
  headers: { authorization: 'Bearer ' + process.env.CRON_SECRET },
  redirect: 'error', signal: AbortSignal.timeout(650000)
}).then(async (r) => {
  const body = await r.json();
  const ok = r.status === 200 && body.ok === true;
  console.log(new Date().toISOString(), '$JOB', ok ? 'berhasil' : 'gagal');
  process.exit(ok ? 0 : 1);
}).catch(() => { console.error('$JOB gagal: periksa status operasional internal'); process.exit(1); });
"
