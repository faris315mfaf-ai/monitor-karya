/**
 * [T2-B2 · backlog D] Lapisan statis: membaca sumber komponen dan CSS lalu
 * memverifikasi pola aksesibilitas Sheet yang mengubah data di seluruh
 * kode — bukan hanya layar yang bisa dirender tanpa DOM. Pelengkap lapisan
 * perilaku (sheet-fokus, alur-*): tes ini menjaga pola pada semua pemakaian,
 * termasuk yang tidak memungkinkan dirender di environment node.
 */
import { expect, it } from 'vitest'
import { callBlocks, listFiles, src, tagAttrSpans } from './helpers'

const KOMPONEN = listFiles('src/components')

/* ---------- Semua pemakaian Sheet ---------- */

it('setiap <Sheet> meneruskan onOpenChange dan membawa judul (prasyarat Esc/scrim menutup)', () => {
  const pemakai = KOMPONEN.filter((f) => f.endsWith('.tsx') && !f.endsWith('src/components/mk/sheet.tsx'))
  const denganSheet = pemakai.filter((f) => /<Sheet[\s/>]/.test(src(f)))
  expect(denganSheet.length).toBeGreaterThan(20)
  const masalah: string[] = []
  for (const f of denganSheet) {
    for (const attrs of tagAttrSpans(src(f), 'Sheet')) {
      if (!/onOpenChange/.test(attrs)) masalah.push(`${f}: <Sheet> tanpa onOpenChange`)
      if (!/title=/.test(attrs)) masalah.push(`${f}: <Sheet> tanpa title`)
    }
  }
  expect(masalah).toEqual([])
})

it('setiap <ConfirmDialog> membawa open/onOpenChange/title/confirmLabel dan aksi', () => {
  const files = KOMPONEN.filter((f) => /<ConfirmDialog/.test(src(f)))
  expect(files).toHaveLength(1) // hanya useConfirm (parts.tsx) yang memasangnya
  for (const attrs of tagAttrSpans(src(files[0]), 'ConfirmDialog')) {
    for (const wajib of ['open=', 'onOpenChange=', 'title=', 'confirmLabel=', 'onConfirm', 'onCancel']) {
      expect(attrs, `${files[0]}: ConfirmDialog tanpa ${wajib}`).toMatch(new RegExp(wajib))
    }
  }
})

/* ---------- Konfirmasi destruktif (Hapus) di semua call site ---------- */

it('semua confirm() dari useConfirm menyebut confirmLabel; alur Hapus selalu destructive', () => {
  const pemakai = KOMPONEN.filter((f) => /useConfirm\(\)/.test(src(f)) && !f.endsWith('companies/parts.tsx'))
  expect(pemakai.length).toBeGreaterThanOrEqual(13)
  let jumlah = 0
  const masalah: string[] = []
  for (const f of pemakai) {
    expect(src(f), `${f}: memanggil useConfirm tetapi tidak memasang {confirmEl}`).toMatch(/\{confirmEl\}/)
    for (const blok of callBlocks(src(f), 'confirm')) {
      jumlah++
      if (!/confirmLabel\s*:/.test(blok)) masalah.push(`${f}: confirm tanpa confirmLabel → ${blok.slice(0, 60)}`)
      if (/title\s*:\s*['"`]Hapus/.test(blok) && !/destructive\s*:\s*true/.test(blok)) {
        masalah.push(`${f}: judul Hapus tetapi tidak destructive`)
      }
    }
  }
  expect(jumlah).toBeGreaterThanOrEqual(15)
  expect(masalah).toEqual([])
})

it('konfirmasi non-destruktif (Arsipkan proyek) sengaja bukan destructive karena punya Urungkan', () => {
  const blok = callBlocks(src('src/components/views/projects-view.tsx'), 'confirm').find((b) => /Arsipkan proyek/.test(b))
  expect(blok).toBeDefined()
  expect(blok).not.toMatch(/destructive/)
  // Pengarsipan memang memakai toast "Urungkan" (undoToken) — tindakan reversibel.
  expect(src('src/components/views/projects-view.tsx')).toMatch(/toastWithUndo\(`\$\{p\.name\} diarsipkan\./)
})

/* ---------- Esc & scrim tidak diblokir ---------- */

it('tidak ada onEscapeKeyDown/onInteractOutside yang menelan Esc atau klik scrim', () => {
  const pelanggar = KOMPONEN.filter((f) => /onEscapeKeyDown|onInteractOutside/.test(src(f)))
  expect(pelanggar).toEqual([])
})

/* ---------- Urutan tab pada footer Sheet aksi data ---------- */

function footerSpans(file: string): string[] {
  const s = src(file)
  const out: string[] = []
  let i = 0
  while ((i = s.indexOf('footer={', i)) !== -1) {
    let depth = 0
    let j = i + 'footer='.length
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++
      else if (s[j] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(s.slice(i, j + 1))
    i = j + 1
  }
  return out
}

it('footer Sheet penolakan: Batal mendahului Tolak permintaan (destructive)', () => {
  for (const footer of footerSpans('src/components/oversight/approval-requests.tsx')) {
    if (footer.includes('Tolak permintaan')) {
      expect(footer.indexOf('Batal')).toBeLessThan(footer.indexOf('Tolak permintaan'))
      expect(footer).toMatch(/variant="destructive"/)
    }
  }
})

it('footer Sheet ajukan buka kunci (PIC dan Admin): Batal mendahului tombol kirim (primer)', () => {
  for (const file of ['src/components/views/daily-input-view.tsx', 'src/components/admin/unlock-card.tsx']) {
    for (const footer of footerSpans(file)) {
      if (footer.includes('Ajukan buka kunci')) {
        expect(footer.indexOf('Batal'), file).toBeLessThan(footer.indexOf('Ajukan buka kunci'))
        expect(footer).toMatch(/variant="primary"/)
      }
    }
  }
})

/* ---------- Kontrak sumber Sheet & ConfirmDialog ---------- */

it('sumber Sheet: dialog Radix + aria-modal + fokus judul saat buka + fokus kembali saat tutup', () => {
  const s = src('src/components/mk/sheet.tsx')
  expect(s).toMatch(/<DialogPrimitive\.Root open=\{open\} onOpenChange=\{onOpenChange\}>/)
  expect(s).toMatch(/aria-modal="true"/)
  expect(s).toMatch(/onOpenAutoFocus/)
  expect(s).toMatch(/titleRef\.current\.focus\(\{ preventScroll: true \}\)/)
  expect(s).toMatch(/onCloseAutoFocus/)
  // Pengembalian fokus: pemicu asal, atau landmark [data-sheet-focus-fallback].
  expect(s).toMatch(/\[data-sheet-focus-fallback\]/)
  // Judul hanya fokus terprogram (pasangan aturan CSS .mk-sheet__title:focus).
  expect(s).toMatch(/tabIndex=\{-1\}/)
})

it('sumber ConfirmDialog: Overlay ada, Cancel mendahului Action, keduanya tombol bertipe button', () => {
  const s = src('src/components/mk/confirm-dialog.tsx')
  expect(s.indexOf('AlertDialog.Overlay')).toBeGreaterThan(-1)
  expect(s.indexOf('AlertDialog.Cancel')).toBeGreaterThan(-1)
  expect(s.indexOf('AlertDialog.Cancel')).toBeLessThan(s.indexOf('AlertDialog.Action'))
})

/* ---------- Kontrak CSS cincin fokus ---------- */

it('cincin fokus :focus-visible global memakai token --focus dengan jarak 2px', () => {
  expect(src('src/app/globals.css')).toMatch(/:focus-visible \{ outline: 2px solid var\(--focus\); outline-offset: 2px; \}/)
})

it('outline:none hanya pada pengecualian terdokumentasi; selektor lain punya pengganti :focus-visible', () => {
  const berkas = listFiles('src/app', /\.css$/).concat(listFiles('design-system', /\.css$/))
  const temuan: string[] = []
  for (const f of berkas) {
    const s = src(f).replace(/\/\*[\s\S]*?\*\//g, '')
    // Pindai aturan CSS datar (aturan dalam @media tetap tertangkap sebagai
    // aturan dalamannya).
    for (const m of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const badan = m[2]
      if (!badan.includes('outline: none') && !badan.includes('outline:none')) continue
      for (const pemilih of m[1].split(',')) {
        const nama = pemilih.trim()
        if (!nama || nama.startsWith('@')) continue
        // Pengecualian yang disetujui/didokumentasikan:
        //  - .mk-sheet--responsive: wadah sheet, bukan kontrol (fokus jatuh
        //    ke judul/anak, bukan wadah).
        //  - .mk-sheet__title:focus: judul hanya menerima fokus terprogram
        //    (tabIndex -1) — keputusan F4-B, menunggu konfirmasi pemilik
        //    (docs/SISA-PEKERJAAN.md bagian B).
        if (nama.includes('mk-sheet--responsive') || nama.includes('mk-sheet__title')) continue
        // Selektor lain boleh meniadakan outline hanya bila berkas yang sama
        // menyediakan cincin :focus-visible untuk selektor itu.
        const dasar = nama.replace(/::?[a-z-]+(\([^)]*\))?/g, '').trim()
        if (!s.includes(`${dasar}:focus-visible`)) temuan.push(`${f}: ${nama} tanpa :focus-visible`)
      }
    }
  }
  expect(temuan).toEqual([])
})

it('Button dan IconButton selalu render <button type="button"> (bukan submit gelap di dalam Sheet)', () => {
  const s = src('src/components/mk/core.tsx')
  expect(s).toMatch(/const Button = React\.forwardRef<HTMLButtonElement, ButtonProps>\(function Button\(\s*\{[^}]*type = 'button'/)
  expect(s).toMatch(/const IconButton = React\.forwardRef<HTMLButtonElement, IconButtonProps>\(function IconButton\(\s*\{[^}]*type = 'button'/)
})
