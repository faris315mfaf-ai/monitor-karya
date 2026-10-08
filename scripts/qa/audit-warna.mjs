#!/usr/bin/env node

/**
 * Audit warna Monitor Karya (tugas T2-B3).
 *
 * Skrip Node murni, tanpa dependensi baru. Tiga pemeriksaan:
 *
 *  1. Kontras teks (WCAG 2.1) dihitung dari variabel token:
 *     - --ink dan --ink-2 di atas --bg, --surface, --surface-2 (kedua tema);
 *     - --on-accent di atas --accent-fill untuk keenam aksen (kedua tema).
 *     Target 4.5:1 untuk teks kecil (<18px) dan 3:1 untuk teks besar, sesuai
 *     DESIGN.md dan docs/design/09-aksesibilitas.md.
 *     Nilai aksen didefinisikan di design-system/components/bundle.css
 *     ([data-accent="…"] mengikat --accent-fill dan --on-accent; grafit memakai
 *     --on-grafit), jadi dua berkas itu ikut diurai.
 *
 *  2. Invarian "warna tidak pernah sendirian" — verifikasi struktural pada
 *     sumber komponen (src/components/mk/core.tsx dan data.tsx):
 *     - StatusBadge selalu ikon + kata;
 *     - Heatmap selalu menulis angka (tabel sr + caption) untuk pembaca layar;
 *     - AreaChart selalu menampilkan angka tertulis (tip + aria-label).
 *
 *  3. Keadaan kosong — berkas view yang merender komponen data juga menyediakan
 *     EmptyNote/ErrorNote (heuristik, bersifat informasi; tidak memengaruhi exit).
 *
 * Keterbatasan (dijujurkan, nilai tidak pernah dikarang):
 *  - Hanya hex (#rgb/#rrggbb) yang bisa diurai. rgba(), color-mix(), dan
 *    oklch() tidak bisa dihitung statis — pasangan yang bergantung padanya
 *    dilaporkan "tidakTerurai", bukan gagal.
 *  - Material kaca (--glass*, rgba di atas latar tembus + blur) tidak dimodelkan.
 *  - Sel peta panas memakai color-mix runtime antara aksen dan fill-1; hanya
 *    diverifikasi struktural, angka kontrasnya tidak dihitung.
 *
 * Keluaran: ringkasan + laporan JSON lengkap ke stdout. Exit 1 bila ada
 * kegagalan kontras nyata atau invarian struktural gagal.
 *
 * Jalankan: node scripts/qa/audit-warna.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const BERKAS_TOKEN = 'design-system/tokens.css'
const BERKAS_BUNDLE = 'design-system/components/bundle.css'
const BERKAS_CORE = 'src/components/mk/core.tsx'
const BERKAS_DATA = 'src/components/mk/data.tsx'
const BERKAS_LAYOUT = 'src/components/mk/layout.tsx'
const DIR_VIEWS = 'src/components/views'

const TARGET_TEKS_KECIL = 4.5
const TARGET_TEKS_BESAR = 3
const TEMA = ['light', 'dark']
const AKSEN = ['merah', 'biru', 'hijau', 'ungu', 'oranye', 'grafit']

/* ---------- Alat umum ---------- */

const baca = (p) => readFileSync(join(AKAR, p), 'utf8')

/** Buang komentar CSS agar tidak mengaburkan pemecahan deklarasi. */
const tanpaKomentar = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Pecah isi CSS menjadi pasangan [nama, nilai] deklarasi. */
function pecahDeklarasi(isi) {
  const hasil = []
  for (const bagian of isi.split(';')) {
    const kopi = bagian.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/)
    if (kopi) hasil.push([kopi[1], kopi[2]])
  }
  return hasil
}

/** Parse blok datar `selector { deklarasi }` (tokens.css tanpa at-rule bersarang). */
function parseBlok(css) {
  const blok = []
  css = tanpaKomentar(css)
  const re = /([^{}]*)\{([^{}]*)\}/g
  for (let m; (m = re.exec(css)); ) {
    blok.push({ selector: m[1].trim(), deklarasi: pecahDeklarasi(m[2]) })
  }
  return blok
}

/** #rgb / #rrggbb (case-insensitive) → [r,g,b]; selain itu null. */
function parseHex(nilai) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(nilai.trim())
  if (!m) return null
  const h = m[1]
  if (h.length === 3) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16))
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

/** Luminansi relatif WCAG 2.1. */
function luminansi(rgb) {
  const f = (c) => {
    c /= 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
}

/** Rasio kontras WCAG 2.1 dari dua warna hex. */
export function rasioKontras(hexA, hexB) {
  const a = parseHex(hexA)
  const b = parseHex(hexB)
  if (!a || !b) throw new Error(`Warna bukan hex statis: ${hexA} / ${hexB}`)
  const la = luminansi(a)
  const lb = luminansi(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/* ---------- Pemetaan token per tema ---------- */

/**
 * Bangun peta token mentah per tema dari tokens.css.
 * Blok `:root, [data-theme="light"]` → light; `[data-theme="dark"]` → dark.
 */
export function petaTema(cssTokens) {
  const peta = { light: new Map(), dark: new Map() }
  for (const blok of parseBlok(cssTokens)) {
    const sel = blok.selector
    const tujuan =
      /\[data-theme="dark"\]/.test(sel) ? 'dark' : /:root|\[data-theme="light"\]/.test(sel) ? 'light' : null
    if (!tujuan) continue
    for (const [nama, nilai] of blok.deklarasi) peta[tujuan].set(nama, nilai)
  }
  return peta
}

/**
 * Peta aksen dari bundle.css: [data-accent="x"] → deklarasi alias aksennya.
 * Hanya aturan datar dengan satu pemilih atribut; aturan gabungan tema+aksen
 * (yang hanya menghitung ulang aurora/glow) tidak ikut.
 */
export function petaAksen(cssBundle) {
  const peta = new Map()
  cssBundle = tanpaKomentar(cssBundle)
  const re = /(?:^|[,{}\n])\s*\[data-accent="([a-z]+)"\]\s*\{([^{}]*)\}/g
  for (let m; (m = re.exec(cssBundle)); ) {
    if (!peta.has(m[1])) peta.set(m[1], pecahDeklarasi(m[2]))
  }
  return peta
}

/**
 * Selesaikan satu token ke hex statis di dalam satu tema (ikuti var(–x)).
 * Mengembalikan { ok, hex, jejak } atau { ok: false, alasan, jejak }.
 * Nilai yang butuh runtime (rgba/color-mix/oklch) dilaporkan tidak terurai.
 */
export function selesaikan(nama, peta, jejak = []) {
  if (jejak.includes(nama)) return { ok: false, alasan: `referensi melingkar: ${[...jejak, nama].join(' → ')}`, jejak }
  const mentah = peta.get(nama)
  if (mentah === undefined) return { ok: false, alasan: `token ${nama} tidak didefinisikan di tema ini`, jejak }
  const v = mentah.match(/^var\((--[\w-]+)\)$/)
  if (v) return selesaikan(v[1], peta, [...jejak, nama])
  const hex = parseHex(mentah)
  if (hex) return { ok: true, hex: mentah.trim(), jejak: [...jejak, nama] }
  return { ok: false, alasan: `nilai bukan hex statis: ${mentah.trim()}`, jejak: [...jejak, nama] }
}

/** Gabungkan peta tema dengan deklarasi alias aksen (aksen menang bila ada). */
function petaDenganAksen(petaTemaIni, deklarasiAksen) {
  const peta = new Map(petaTemaIni)
  for (const [nama, nilai] of deklarasiAksen ?? []) peta.set(nama, nilai)
  return peta
}

/* ---------- Pemeriksaan 1: kontras ---------- */

const PASANGAN_TEKS = [
  { teks: '--ink', latar: '--bg', peran: 'teks utama (body 15px) di latar halaman' },
  { teks: '--ink', latar: '--surface', peran: 'teks utama di kartu/sheet' },
  { teks: '--ink', latar: '--surface-2', peran: 'teks utama di header tabel / area bertingkat' },
  { teks: '--ink-2', latar: '--bg', peran: 'teks sekunder kecil (footnote 13px, caption 12px) di latar' },
  { teks: '--ink-2', latar: '--surface', peran: 'teks sekunder kecil di kartu' },
  { teks: '--ink-2', latar: '--surface-2', peran: 'teks sekunder kecil di permukaan bertingkat' },
]

/**
 * Audit kontras seluruh kombinasi yang dipakai UI.
 * Mengembalikan { pasangan, jumlahLolos, jumlahGagal, jumlahTidakTerurai, terburuk }.
 */
export function auditKontras({ cssTokens, cssBundle }) {
  const tema = petaTema(cssTokens)
  const aksen = petaAksen(cssBundle)
  const hasil = []
  const tidakTerurai = []

  const catat = ({ id, tema: t, peran, tokenTeks, tokenLatar, rTeks, rLatar }) => {
    if (!rTeks.ok || !rLatar.ok) {
      tidakTerurai.push({
        id,
        tema: t,
        peran,
        alasan: !rTeks.ok ? `teks: ${rTeks.alasan}` : `latar: ${rLatar.alasan}`,
      })
      return
    }
    const rasio = rasioKontras(rTeks.hex, rLatar.hex)
    hasil.push({
      id,
      tema: t,
      peran,
      tokenTeks,
      tokenLatar,
      nilaiTeks: rTeks.hex,
      nilaiLatar: rLatar.hex,
      jejakTeks: rTeks.jejak.join(' → '),
      jejakLatar: rLatar.jejak.join(' → '),
      rasio: Math.round(rasio * 100) / 100,
      lolosTeksKecil: rasio >= TARGET_TEKS_KECIL,
      lolosTeksBesar: rasio >= TARGET_TEKS_BESAR,
    })
  }

  for (const t of TEMA) {
    const peta = tema[t]
    for (const p of PASANGAN_TEKS) {
      catat({
        id: `${p.teks} di atas ${p.latar} (${t})`,
        tema: t,
        peran: p.peran,
        tokenTeks: p.teks,
        tokenLatar: p.latar,
        rTeks: selesaikan(p.teks, peta),
        rLatar: selesaikan(p.latar, peta),
      })
    }
    for (const a of AKSEN) {
      const petaA = petaDenganAksen(peta, aksen.get(a))
      catat({
        id: `--on-accent di atas --accent-fill [aksen ${a}] (${t})`,
        tema: t,
        peran: `label tombol primer / angka di isian aksen ${a} (callout 14px)`,
        tokenTeks: '--on-accent',
        tokenLatar: `--accent-fill (aksen ${a})`,
        rTeks: selesaikan('--on-accent', petaA),
        rLatar: selesaikan('--accent-fill', petaA),
      })
    }
  }

  const gagal = hasil.filter((p) => !p.lolosTeksKecil)
  const terurut = [...hasil].sort((a, b) => a.rasio - b.rasio)
  return {
    targetTeksKecil: TARGET_TEKS_KECIL,
    targetTeksBesar: TARGET_TEKS_BESAR,
    pasangan: terurut,
    jumlahLolos: hasil.length - gagal.length,
    jumlahGagal: gagal.length,
    jumlahTidakTerurai: tidakTerurai.length,
    tidakTerurai,
    terburuk: terurut[0] ?? null,
  }
}

/* ---------- Pemeriksaan 2: invarian struktural ---------- */

function potongan(sumber, mulai, selesai) {
  const i = sumber.indexOf(mulai)
  if (i < 0) return ''
  const j = selesai ? sumber.indexOf(selesai, i) : -1
  return sumber.slice(i, j > i ? j : i + 4000)
}

function cekStatusBadge(core) {
  const bukti = []
  const blok = potongan(core, 'export const STATUS', '\n}')
  const entri = [...blok.matchAll(/\n\s*(\w+):\s*\{\s*label:\s*'([^']*)'\s*,\s*icon:\s*'([^']*)'\s*\}/g)]
  const nama = entri.map((m) => m[1])
  const diharapkan = ['on', 'risk', 'late', 'done', 'info', 'neutral']
  const lengkap =
    diharapkan.every((s) => nama.includes(s)) &&
    entri.every((m) => m[2].trim() !== '' && m[3].trim() !== '')
  bukti.push(
    `STATUS mendefinisikan ${entri.length} status dengan label+ikon: ${nama.join(', ')}`
  )
  const tubuh = potongan(core, 'export function StatusBadge', 'export function Avatar')
  const ikonSelalu = /<Icon name=\{m\.icon\}/.test(tubuh)
  const kataSelalu = /\{children \|\| m\.label\}/.test(tubuh)
  bukti.push(
    ikonSelalu
      ? 'StatusBadge merender <Icon name={m.icon}> tanpa syarat'
      : 'StatusBadge tidak merender ikon tanpa syarat',
    kataSelalu
      ? "StatusBadge merender kata: {children || m.label} — teks selalu ada (bawaan dari STATUS)"
      : 'StatusBadge tidak menjamin kata pengganti bila children kosong'
  )
  return { lolos: lengkap && ikonSelalu && kataSelalu, bukti }
}

function cekHeatmap(data) {
  const tubuh = potongan(data, 'export function Heatmap', 'export function Timeline')
  const syarat = [
    ['tabel pembaca layar dengan class mk-sr', /className="mk-sr"/.test(tubuh)],
    ["caption tabel selalu ada", /<caption>\{label \|\| 'Peta panas'\}<\/caption>/.test(tubuh)],
    ['angka selalu tertulis: formatCell || String(v)', /formatCell \|\| \(\(v: number\) => String\(v\)\)/.test(tubuh)],
    ["sel null ditulis 'libur', bukan kosong", /v === null \|\| v === undefined \? 'libur'/.test(tubuh)],
    ['kisi visual disembunyikan dari pohon a11y', /mk-heat__grid"[\s\S]{0,120}aria-hidden/.test(tubuh)],
    ['title per sel untuk pointer', /title=\{\[rowLabels\[i\], colLabels\[j\]\]/.test(tubuh)],
  ]
  return {
    lolos: syarat.every(([, ok]) => ok),
    bukti: syarat.map(([nama, ok]) => `${ok ? 'ok' : 'GAGAL'} — ${nama}`),
  }
}

function cekAreaChart(data) {
  const tubuh = potongan(data, 'export function AreaChart', 'export function DonutChart')
  const syarat = [
    ['tip angka tertulis untuk titik terpilih', /mk-area__tip/.test(tubuh) && /\{fmt\(data\[sel\]\.value\)/.test(tubuh)],
    ['aria-label per titik memuat angka', /aria-label=\{d\.label \+ ': ' \+ fmt\(d\.value\)/.test(tubuh)],
    ['sumbu x memuat label tertulis', /mk-area__axis/.test(tubuh)],
  ]
  return {
    lolos: syarat.every(([, ok]) => ok),
    bukti: syarat.map(([nama, ok]) => `${ok ? 'ok' : 'GAGAL'} — ${nama}`),
  }
}

export function auditInvarian({ core, data, layout }) {
  const daftar = [
    { id: 'status-badge-ikon-kata', deskripsi: 'StatusBadge selalu merender ikon + kata (warna tidak pernah sendirian)', ...cekStatusBadge(core) },
    { id: 'heatmap-angka-caption', deskripsi: 'Heatmap menulis angka per sel di tabel pembaca layar dengan caption; kisi visual aria-hidden', ...cekHeatmap(data) },
    { id: 'areachart-angka-tertulis', deskripsi: 'AreaChart menampilkan angka tertulis (tip) dan aria-label bernaut angka', ...cekAreaChart(data) },
    {
      id: 'emptynote-tersedia',
      deskripsi: 'Komponen EmptyNote tersedia untuk keadaan kosong',
      lolos: /export function EmptyNote/.test(layout),
      bukti: [/export function EmptyNote/.test(layout) ? 'ok — layout.tsx mengekspor EmptyNote' : 'GAGAL — EmptyNote tidak ditemukan'],
    },
  ]
  return { daftar, jumlahGagal: daftar.filter((d) => !d.lolos).length }
}

/* ---------- Pemeriksaan 3: keadaan kosong di view (heuristik, informasi) ---------- */

const KOMPONEN_DATA = ['BarChart', 'AreaChart', 'DonutChart', 'Heatmap', 'ActivityRings', 'Timeline', 'Sparkline']

export function auditKeadaanKosong(daftarBerkas) {
  const baris = []
  for (const { berkas, isi } of daftarBerkas) {
    const dipakai = KOMPONEN_DATA.filter((k) => new RegExp(`<${k}[\\s/>]`).test(isi))
    if (!dipakai.length) continue
    const punyaEmpty = /EmptyNote/.test(isi)
    const punyaError = /ErrorNote/.test(isi)
    const adaPenjaga = /\.length\s*(===|!==|>|<)|\.length\b[^\n]*\?/.test(isi)
    baris.push({
      berkas,
      komponenData: dipakai,
      punyaEmptyNote: punyaEmpty,
      punyaErrorNote: punyaError,
      adaPenjagaPanjang: adaPenjaga,
      perluTinjauan: !(punyaEmpty || punyaError) || !adaPenjaga,
    })
  }
  return { sifat: 'heuristik — hanya informasi, tidak memengaruhi exit', berkas: baris }
}

/* ---------- Orkestrasi ---------- */

export function jalankanAudit(akar = AKAR) {
  const b = (p) => readFileSync(join(akar, p), 'utf8')
  const kontras = auditKontras({ cssTokens: b(BERKAS_TOKEN), cssBundle: b(BERKAS_BUNDLE) })
  const invarian = auditInvarian({ core: b(BERKAS_CORE), data: b(BERKAS_DATA), layout: b(BERKAS_LAYOUT) })
  const daftarViews = readdirSync(join(akar, DIR_VIEWS))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ berkas: `${DIR_VIEWS}/${f}`, isi: b(`${DIR_VIEWS}/${f}`) }))
  const kosong = auditKeadaanKosong(daftarViews)
  return {
    judul: 'Audit warna Monitor Karya',
    dibuat: new Date().toISOString(),
    sumber: { BERKAS_TOKEN, BERKAS_BUNDLE, BERKAS_CORE, BERKAS_DATA, BERKAS_LAYOUT, dirViews: DIR_VIEWS },
    kontras,
    invarian,
    keadaanKosong: kosong,
    keterbatasan: [
      'Hanya hex #rgb/#rrggbb yang diurai; rgba() (material kaca --glass*, --scrim), color-mix() (sel Heatmap, tone "putih", kilau), dan oklch() tidak bisa dihitung statis — dilaporkan tidakTerurai bila dipakai, tidak pernah dikarang.',
      'Latar bertumpuk (kaca + blur di atas bg, aurora, gradien) tidak dimodelkan; pasangan dihitung pada permukaan lega.',
      'Kontras sel peta panas (color-mix aksen↔fill-1 runtime) hanya diverifikasi struktural (angka tertulis + caption), angkanya tidak dihitung.',
      'Pemeriksaan keadaan kosong bersifat heuristik pada nama berkas view; penjaga bisa berada di komponen induk di luar berkas yang sama.',
    ],
  }
}

function ringkas(laporan) {
  const { kontras, invarian, keadaanKosong } = laporan
  const t = []
  t.push('Audit warna Monitor Karya')
  t.push('='.repeat(60))
  const total = kontras.pasangan.length
  t.push(
    `Kontras   : ${kontras.jumlahLolos}/${total} pasangan lolos ${kontras.targetTeksKecil}:1 (teks kecil); ` +
      `${kontras.jumlahGagal} gagal; ${kontras.jumlahTidakTerurai} tidak terurai`
  )
  if (kontras.terburuk) {
    const tb = kontras.terburuk
    t.push(`Terburuk  : ${tb.rasio.toFixed(2)}:1 — ${tb.id} (${tb.nilaiTeks} di atas ${tb.nilaiLatar})`)
  }
  for (const p of kontras.pasangan.filter((x) => !x.lolosTeksKecil)) {
    t.push(`  GAGAL    : ${p.rasio.toFixed(2)}:1 — ${p.id} (perlu ${kontras.targetTeksKecil}:1)`)
  }
  for (const p of kontras.tidakTerurai) t.push(`  LEWATI   : ${p.id} — ${p.alasan}`)
  t.push(
    `Invarian  : ${invarian.daftar.length - invarian.jumlahGagal}/${invarian.daftar.length} lolos`
  )
  for (const d of invarian.daftar.filter((x) => !x.lolos)) t.push(`  GAGAL    : ${d.id} — ${d.deskripsi}`)
  const perluTinjau = keadaanKosong.berkas.filter((f) => f.perluTinjauan)
  t.push(
    `Keadaan kosong: ${keadaanKosong.berkas.length} berkas view memakai komponen data; ` +
      `${keadaanKosong.berkas.length - perluTinjau.length} lengkap, ${perluTinjau.length} perlu tinjauan (heuristik)`
  )
  for (const f of perluTinjau) t.push(`  TINJAU   : ${f.berkas} (${f.komponenData.join(', ')})`)
  t.push('-'.repeat(60))
  return t.join('\n')
}

const dipanggilLangsung =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (dipanggilLangsung) {
  const laporan = jalankanAudit()
  const gagalKontras = laporan.kontras.jumlahGagal > 0
  const gagalInvarian = laporan.invarian.jumlahGagal > 0
  console.log(ringkas(laporan))
  console.log(JSON.stringify(laporan, null, 2))
  console.log(gagalKontras || gagalInvarian ? 'HASIL: GAGAL' : 'HASIL: LULUS')
  process.exitCode = gagalKontras || gagalInvarian ? 1 : 0
}
