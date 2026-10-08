// Hanya dimuat eksplisit oleh proses server E2E: node --import ./tests/e2e-lokal/clock.mjs …
// Folder tests dikecualikan Dockerfile produksi; tidak ada API/flag jam di kode aplikasi.
import { assertLocalTarget } from './guard.mjs'
assertLocalTarget()
const RealDate = globalThis.Date
const fixed = RealDate.parse(process.env.MK_E2E_NOW || '')
if (!Number.isFinite(fixed) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(process.env.MK_E2E_NOW || '')) {
  throw new Error('MK_E2E_NOW wajib ISO UTC lengkap, mis. 2026-10-08T09:30:00.000Z.')
}
const started = performance.now()
const now = () => Math.floor(fixed + performance.now() - started)
function TestDate(...args) {
  if (!new.target) return new RealDate(now()).toString()
  return Reflect.construct(RealDate, args.length ? args : [now()], new.target)
}
TestDate.prototype = RealDate.prototype
Object.setPrototypeOf(TestDate, RealDate)
// Next menyalin own statics saat membungkus Date: inheritance saja tidak cukup.
Object.defineProperties(TestDate, {
  now: { value: now, configurable: true, writable: true },
  parse: { value: RealDate.parse, configurable: true, writable: true },
  UTC: { value: RealDate.UTC, configurable: true, writable: true },
})
globalThis.Date = TestDate
