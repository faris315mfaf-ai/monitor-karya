// Merender setiap SVG di sebuah folder menjadi PNG (untuk memeriksa tampilan diagram).
// Pakai: Chrome headless dengan --remote-debugging-port=9334, lalu
//   node render-svg.mjs <folder-svg> <folder-png> [saring-nama]
import { writeFileSync, readFileSync, readdirSync } from 'node:fs'
const dir = process.argv[2], out = process.argv[3], only = process.argv[4]
const ver = await (await fetch('http://127.0.0.1:9334/json/version')).json()
const ws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })) })
for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg') && (!only || f.includes(only)))) {
  const svg = readFileSync(`${dir}/${f}`, 'utf8')
  const w = +svg.match(/width="(\d+)"/)[1], h = +svg.match(/height="(\d+)"/)[1]
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p) => send(m, p, sessionId)
  await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await s('Page.navigate', { url: `file://${dir}/${f}` })
  await new Promise((r) => setTimeout(r, 600))
  const { data } = await s('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${out}/${f}.png`, Buffer.from(data, 'base64'))
  await send('Target.closeTarget', { targetId })
}
process.exit(0)
