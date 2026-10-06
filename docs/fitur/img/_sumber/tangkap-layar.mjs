// Tangkapan layar /pratinjau untuk docs/fitur/img/layar/ lewat Chrome DevTools
// Protocol (memakai WebSocket bawaan Node ≥ 22, tanpa dependensi).
//
// Pakai:
//   1. Jalankan dev server (npm run dev) — pratinjau tidak butuh basis data.
//   2. Jalankan Chrome headless dengan profil sementara:
//        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//          --user-data-dir=/tmp/mk-shot --remote-debugging-port=9333 about:blank &
//   3. PRATINJAU_URL=http://localhost:3000/pratinjau?peran= node tangkap-layar.mjs docs/fitur/img/layar
//
// Setiap tangkapan memakai prefers-reduced-motion, menunggu splash (2,4 dtk) dan
// kompilasi dev, mengklik tab menurut labelnya, lalu membuang tombol dev Next.js.
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2]
const BASE = process.env.PRATINJAU_URL || 'http://localhost:3000/pratinjau?peran='
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const shots = [
  ['pic-ringkasan-ponsel', 'PIC_PROYEK', 390, 844, 'Hari ini', true],
  ['pic-meja-kerja-ponsel', 'PIC_PROYEK', 390, 844, 'Kerja', true],
  ['kadiv-ringkasan-ponsel', 'KEPALA_DIVISI', 390, 844, 'Ringkasan', true],
  ['admin-ringkasan-ponsel', 'ADMIN_PT', 390, 844, 'Ringkasan', true],
  ['admin-meja-kerja-ponsel', 'ADMIN_PT', 390, 844, 'Kerja', true],
  ['direktur-ringkasan-ponsel', 'DIREKTUR_ENTITAS', 390, 844, 'Ringkasan', true],
  ['manajemen-ringkasan-ponsel', 'MANAJEMEN', 390, 844, 'Ringkasan', true],
  ['superadmin-perusahaan-ponsel', 'SUPERADMIN', 390, 844, 'Perusahaan', true],
  ['superadmin-perusahaan-desktop', 'SUPERADMIN', 1440, 1000, 'Perusahaan & akun', false],
  ['pic-ringkasan-desktop', 'PIC_PROYEK', 1440, 1000, 'Hari ini', false],
  ['kadiv-ringkasan-desktop', 'KEPALA_DIVISI', 1440, 1000, 'Ringkasan', false],
  ['admin-ringkasan-desktop', 'ADMIN_PT', 1440, 1000, 'Ringkasan', false],
  ['direktur-ringkasan-desktop', 'DIREKTUR_ENTITAS', 1440, 1000, 'Ringkasan', false],
  ['manajemen-ringkasan-desktop', 'MANAJEMEN', 1440, 1000, 'Ringkasan', false],
  ['pic-meja-kerja-desktop', 'PIC_PROYEK', 1440, 1000, 'Meja kerja', false],
  ['kadiv-meja-kerja-desktop', 'KEPALA_DIVISI', 1440, 1000, 'Meja kerja', false],
  ['kadiv-capaian-mingguan-tablet', 'KEPALA_DIVISI', 900, 1100, 'Mingguan', false],
  ['admin-meja-kerja-desktop', 'ADMIN_PT', 1440, 1000, 'Meja kerja', false],
]

const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json()
const ws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
})
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })

for (const [name, role, w, h, tab, phone, tabFromPhoneSafe] of shots) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p) => send(m, p, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: phone })
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await s('Page.navigate', { url: BASE + role })
  await sleep(9000) // splash 2.4 dtk + kompilasi dev
  const label = tab ?? tabFromPhoneSafe
  if (label) {
    await s('Runtime.evaluate', {
      expression: `(() => { const b = [...document.querySelectorAll('button, a')].find(e => e.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b })()`,
      returnByValue: true,
    })
    await sleep(4500)
  }
  // sembunyikan tombol dev Next.js agar tidak ikut di gambar
  await s('Runtime.evaluate', { expression: `document.querySelectorAll('nextjs-portal').forEach(e => e.remove())` })
  const { data } = await s('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'))
  console.log('ok', name)
  await send('Target.closeTarget', { targetId })
}
ws.close()
process.exit(0)
