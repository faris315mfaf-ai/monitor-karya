// Executed through stdin inside the application container; credentials stay in its environment.
const actions = {
  'reminder-rules': 'periksa jadwal tiap 30 menit dan log cron',
  'remind-divisions': 'periksa jadwal hari kerja dan aturan pengingat',
  'kpi-snapshot': 'periksa jadwal 17.30 WIB dan log snapshot',
  backup: 'periksa pg-backup, salinan offsite, dan hook laporan',
};
try {
  const secret = process.env.OPS_HEALTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('configuration');
  const response = await fetch('http://127.0.0.1:3000/api/health/internal', {
    headers: { authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  let ok = response.status === 200 && body.ok === true;
  if (body.checks?.database !== true) { console.error('Basis data gagal: periksa koneksi, kredensial, dan batas pool.'); ok = false; }
  if (body.checks?.storage !== true || body.checks?.storageStatus !== 'ok') {
    const state = ['degraded', 'configmissing'].includes(body.checks?.storageStatus) ? body.checks.storageStatus : 'invalid';
    console.error(`Penyimpanan ${state}: periksa konfigurasi, objek probe, isi, bucket, dan izin baca.`); ok = false;
  }
  for (const [job, action] of Object.entries(actions)) {
    const matches = Array.isArray(body.jobs) ? body.jobs.filter(item => item?.job === job) : [];
    const row = matches[0];
    const states = ['missing', 'invalid', 'failure', 'stalled', 'running', 'stale', 'success'];
    const state = states.includes(row?.status) ? row.status : 'invalid';
    if (matches.length !== 1 || row?.ok !== true || !['success', 'running'].includes(state)) {
      console.error(`${job}: ${state}; ${action}.`); ok = false;
    }
  }
  if (ok) console.log('Operasional sehat: basis data, penyimpanan, cron, dan laporan backup tersedia.');
  else console.error('Pemeriksaan operasional gagal; tindak lanjuti komponen di atas.');
  process.exitCode = ok ? 0 : 1;
} catch {
  console.error('Status operasional tidak terbaca: periksa kontainer, OPS_HEALTH_SECRET, jaringan, dan batas waktu.');
  process.exitCode = 1;
}
