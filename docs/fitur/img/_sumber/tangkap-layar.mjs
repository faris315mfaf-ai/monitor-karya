// Tangkapan layar /pratinjau untuk docs/fitur/img/layar/ lewat Chrome DevTools
// Protocol (memakai WebSocket bawaan Node ≥ 22, tanpa dependensi).
//
// Pakai:
//   1. Dev server sudah berjalan (npm run dev) — pratinjau tidak butuh basis data.
//   2. Jalankan Chrome headless dengan profil sementara sendiri (jangan profil harian):
//        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//          --user-data-dir=/tmp/mk-shot --remote-debugging-port=9333 about:blank &
//   3. PRATINJAU_URL=http://localhost:3100/pratinjau?peran= CDP_PORT=9333 \
//        node tangkap-layar.mjs docs/fitur/img/layar [saring-nama]
//
// Setiap tangkapan:
//   - berjalan di konteks peramban terpisah (localStorage tidak saling bocor);
//   - memilih tab lewat localStorage `monitor-karya-ui` sebelum skrip halaman jalan,
//     jadi tidak bergantung pada label tombol;
//   - memakai prefers-reduced-motion dan prefers-color-scheme (light/dark). Tema
//     bawaan aplikasi "system", jadi data-theme mengikuti media yang diemulasikan;
//   - menunggu splash (2,4 dtk) dan kompilasi dev, lalu memeriksa bahwa data-theme
//     dan tab aktif benar sebelum menyimpan PNG.
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2]
const ONLY = process.argv[3]
const BASE = process.env.PRATINJAU_URL || 'http://localhost:3000/pratinjau?peran='
const PORT = process.env.CDP_PORT || '9333'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DESKTOP = [1440, 1000, false]
const PHONE = [390, 844, true]
const TABLET = [900, 1100, false]

// [nama berkas, peran, tab (NavTabId), ukuran]
const views = [
  ['pic-ringkasan', 'PIC_PROYEK', 'dashboard'],
  ['pic-meja-kerja', 'PIC_PROYEK', 'work-desk'],
  ['pic-laporan-harian', 'PIC_PROYEK', 'daily-input'],
  ['kadiv-ringkasan', 'KEPALA_DIVISI', 'dashboard'],
  ['kadiv-meja-kerja', 'KEPALA_DIVISI', 'work-desk'],
  ['kadiv-capaian-mingguan', 'KEPALA_DIVISI', 'weekly-input'],
  ['admin-ringkasan', 'ADMIN_PT', 'dashboard'],
  ['admin-meja-kerja', 'ADMIN_PT', 'work-desk'],
  ['admin-penerimaan', 'ADMIN_PT', 'inbox'],
  ['admin-laporan-harian', 'ADMIN_PT', 'daily-input'],
  ['admin-proyek', 'ADMIN_PT', 'projects'],
  ['admin-divisi', 'ADMIN_PT', 'divisions'],
  ['admin-eskalasi', 'ADMIN_PT', 'escalations'],
  ['direktur-ringkasan', 'DIREKTUR_ENTITAS', 'dashboard'],
  ['direktur-persetujuan', 'DIREKTUR_ENTITAS', 'approvals'],
  ['direktur-divisi', 'DIREKTUR_ENTITAS', 'divisions'],
  ['manajemen-ringkasan', 'MANAJEMEN', 'dashboard'],
  ['manajemen-eskalasi', 'MANAJEMEN', 'escalations'],
  ['manajemen-entitas', 'MANAJEMEN', 'entities'],
  ['sdmga-ringkasan', 'DIREKTUR_SDM_GA', 'dashboard'],
  ['ti-ringkasan', 'TI', 'dashboard'],
  ['ti-sistem', 'TI', 'system'],
  ['auditor-ringkasan', 'AUDITOR', 'dashboard'],
  ['auditor-log', 'AUDITOR', 'audit'],
  ['superadmin-perusahaan', 'SUPERADMIN', 'companies'],
]

// Desktop terang + gelap untuk setiap tab di atas; ponsel/tablet hanya terang.
const shots = []
for (const [name, role, tab] of views) {
  shots.push([`${name}-desktop`, role, tab, DESKTOP, 'light'])
  shots.push([`${name}-desktop-gelap`, role, tab, DESKTOP, 'dark'])
}
for (const [name, role, tab] of [
  ['pic-ringkasan', 'PIC_PROYEK', 'dashboard'],
  ['pic-meja-kerja', 'PIC_PROYEK', 'work-desk'],
  ['kadiv-ringkasan', 'KEPALA_DIVISI', 'dashboard'],
  ['admin-ringkasan', 'ADMIN_PT', 'dashboard'],
  ['admin-meja-kerja', 'ADMIN_PT', 'work-desk'],
  ['direktur-ringkasan', 'DIREKTUR_ENTITAS', 'dashboard'],
  ['manajemen-ringkasan', 'MANAJEMEN', 'dashboard'],
  ['superadmin-perusahaan', 'SUPERADMIN', 'companies'],
]) {
  shots.push([`${name}-ponsel`, role, tab, PHONE, 'light'])
}
shots.push(['kadiv-capaian-mingguan-tablet', 'KEPALA_DIVISI', 'weekly-input', TABLET, 'light'])

const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
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

let failed = 0
for (const [name, role, tab, [w, h, phone], theme] of shots) {
  if (ONLY && !name.includes(ONLY)) continue
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p) => send(m, p, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: phone })
  if (phone) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await s('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: theme },
    ],
  })
  await s('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('monitor-karya-ui', ${JSON.stringify(JSON.stringify({ activeTab: tab, selectedEntityId: null }))}) } catch {}`,
  })
  await s('Page.navigate', { url: BASE + role })
  await sleep(10000) // splash 2,4 dtk + kompilasi dev + data contoh
  await s('Runtime.evaluate', { expression: `document.querySelectorAll('nextjs-portal').forEach(e => e.remove()); window.scrollTo(0, 0)` })
  await sleep(400)
  const { result } = await s('Runtime.evaluate', {
    expression: `JSON.stringify({ theme: document.documentElement.getAttribute('data-theme'), tab: (() => { try { return JSON.parse(localStorage.getItem('monitor-karya-ui')).activeTab } catch { return null } })(), err: !!document.querySelector('.mk-error, [data-mk-error]') })`,
    returnByValue: true,
  })
  const state = JSON.parse(result.value)
  const ok = state.theme === theme && state.tab === tab
  if (!ok) failed++
  const { data } = await s('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'))
  console.log(ok ? 'ok   ' : 'CEK  ', name, JSON.stringify(state))
  await send('Target.closeTarget', { targetId })
  await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
}
ws.close()
process.exit(failed ? 1 : 0)
