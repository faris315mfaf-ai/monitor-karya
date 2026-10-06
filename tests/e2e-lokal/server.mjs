// Bootstrap test-only untuk image build terisolasi, bukan entrypoint deployment.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertLocalTarget } from './guard.mjs'
const target = assertLocalTarget()
if ((process.env.AUTH_SECRET || '').length < 32) throw new Error('AUTH_SECRET uji minimal 32 karakter wajib eksplisit.')
const child = spawn(process.execPath, ['--import', fileURLToPath(new URL('./clock.mjs', import.meta.url)), 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', new URL(target.baseUrl).port], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', APP_ORIGINS: target.baseUrl, DATABASE_URL: target.databaseUrl, DIRECT_URL: target.databaseUrl, DAILY_CUTOFF_HOUR: '17', WEEKLY_CUTOFF_HOUR: '17', WEEKLY_HANDOVER_DAY: '4', WEEKLY_LOCK_DAY: '5', STORAGE_DRIVER: 'supabase', SUPABASE_SERVICE_ROLE_KEY: '', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_TELEMETRY_DISABLED: '1' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', err => { console.error(err.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
