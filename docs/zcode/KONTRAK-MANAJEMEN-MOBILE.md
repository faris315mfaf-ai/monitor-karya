# Kontrak dashboard Manajemen & Superuser — tablet & ponsel (16 Okt 2026)

Mockup pemilik (kanvas https://claude.ai/artifact/2vej4mKj3RD8v5QcFGXU9e):
- halaman **"Manajemen — tablet & ponsel"**: papan `M-Ponsel-*`, `M-Tablet-*`, `F-Ponsel*`, `F-Tablet*`
- halaman **"Manajemen — 3 lapis"**: papan `Lapis-Supervisor-Ponsel` (sakelar sorotan supervisor)
Salinan lokal (HTML statis, hex inline — terjemahkan ke token, JANGAN salin hex):
`/private/tmp/claude-501/-Users-godam-PROYEK-monitor-karya--claude-worktrees-zcode-memory-update-5805eb/29a79309-d79f-44fc-90fc-db202b16d574/scratchpad/artifact-files/0f96ceb7-6033-4bed-a223-2be50f51b661/project/`
Baca papan yang relevan untuk zona Anda dan tiru tata letak, ukuran, jarak, hierarki teks SEPRESISI
mungkin dengan token desain.

Menggantikan tampilan minimalis untuk peran `SUPERUSER` & `MANAJEMEN` (tab `sh-overview`).
Basis: branch `claude/subholding` HEAD `39fbc29`. Model bersama sudah ditulis:
`src/components/views/sh-overview/model.ts` (tipe V2*, WeekData, Filter, flatten, scoped,
validFilter, highlightFirst, statusSummary, ptBuckets, matchesQuery, isWeekend, dayLabel,
silentStreak, weekNote, loadFilter/saveFilter). Pakai, jangan duplikasi. Butuh fungsi murni baru?
Taruh di berkas zona Anda sendiri.

## Konsep layar (dari mockup)
Tiga lapis informasi: **status melapor** (siapa sudah/belum) → **sorotan supervisor** (laporan
yang ditandai penting + catatan) → **semua laporan**. Rentang: Hari ini / Kemarin / 7 hari.
Penyaring dua tingkat: **subholding → PT** (Sentra di produksi punya 25 PT; daftar PT wajib bisa
dicari dan dibagi "Melapor hari ini" / "Belum melapor"). Pilihan penyaring diingat per perangkat
(`loadFilter/saveFilter`).

## Integrasi (integrator Claude utama — JANGAN disentuh agen)
`sh-overview-view.tsx` menjadi pengalih: mengambil data lalu merender
`<MobileOverview {...props}/>` bila lebar < 600px, selain itu `<TabletOverview {...props}/>`.
```ts
export type OverviewScreenProps = {
  roleName: string                      // ROLE_LABELS[user.role]
  range: 'today' | 'yesterday' | 'week'
  onRange: (r: 'today' | 'yesterday' | 'week') => void
  dateKey: string                       // 'YYYY-MM-DD' WIB untuk today/yesterday; = week.end saat week
  data: V2Data | null                   // GET /api/sh/overview?date=dateKey (selalu dimuat, juga saat week → hari ini)
  week: WeekData | null                 // hanya saat range === 'week'
  loading: boolean
  error: string | null
  reload: () => void
  filter: Filter                        // sudah divalidasi (validFilter)
  onFilter: (f: Filter) => void         // integrator menyimpan via saveFilter
}
```
Tipe ini didefinisikan integrator di `src/components/views/sh-overview/screen-types.ts`
(sudah ada saat Anda mulai; impor dari sana).

## D1 — Server (zona: prisma/schema.prisma bagian SubholdingReport, prisma/migrations/0035_sorotan_laporan/,
`src/app/api/sh/overview/route.ts`, `src/app/api/sh/overview/week/route.ts` (baru),
`src/app/api/sh/reports/[id]/decision/route.ts`, `src/app/api/sh/review/route.ts`, `src/lib/subholding/*`,
tes `tests/api/sh-sorotan.test.ts` (baru) + penyesuaian minimal tes sh yang ada)
1. Migrasi 0035 aditif: `SubholdingReport.highlight Boolean @default(false)`, `highlightNote String?`,
   `highlightedAt DateTime?`; indeks `(status, reportDate, highlight)`. Tulis SQL lewat
   `prisma migrate diff` (JANGAN `migrate dev` ke DB pengguna); `npx prisma generate`.
2. `POST /api/sh/reports/:id/decision` approve menerima `highlight?: boolean`, `highlightNote?: string`.
   highlight true → note wajib 5–280 huruf (422 bila tidak). Disimpan bersama persetujuan dalam
   transaksi yang sama. revise mengabaikan highlight. Audit log mencatat highlight.
3. `GET /api/sh/overview?date=` (kompatibel mundur): tiap laporan + `highlight`, `highlightNote`;
   tiap subholding + `allPts: [{id,name,lastReportDate}]` = SEMUA PT aktif di bawah path subholding (urut nama).
   `lastReportDate` ('YYYY-MM-DD' WIB) = laporan DISETUJUI terakhir PT itu SEBELUM `date`, jendela 90 hari
   ke belakang; `null` bila tak ada. Dipakai kategori "Belum melapor" (lintas subholding, urut paling lama diam)
   dan "Sudah melapor" di dashboard (rentang hari; rentang 7 hari tidak memakainya).
4. `GET /api/sh/overview/week?end=YYYY-MM-DD[&subholdingId=]` (cap `shreport:view-approved`):
   `WeekData` (lihat model.ts). `days` = 7 hari berakhir di `end` (bawaan hari ini WIB).
   `counts[i]` = laporan DISETUJUI per `reportDate`. Dengan `subholdingId`: subholding itu saja +
   `pts` (semua PT aktif) beserta counts. `highlights` = laporan sorotan dalam 7 hari (terbaru dulu, maks 50).
5. `GET /api/sh/review` (supervisor) menyertakan `highlight`, `highlightNote`. Endpoint admin
   subholding (reports, inbox) TIDAK menyertakan catatan sorotan (catatan untuk manajemen).

## D2 — Supervisor (zona: `src/components/views/sh-review/*`, `tests/ui/sh-review-logic.test.ts`)
Papan `Lapis-Supervisor-Ponsel`: di area keputusan, bagian "Tandai untuk manajemen" (sakelar
`role="switch"`, teks bantu "Muncul di bagian Sorotan dashboard Manajemen & Superuser"); saat aktif →
textarea "Catatan untuk manajemen" (wajib 5–280, penghitung huruf). Tombol menjadi "Setujui & sorot",
teks kecil di bawah tombol menjelaskan akibatnya. Kirim `{action:'approve', note?, highlight, highlightNote}`.
Laporan disetujui yang disorot menampilkan lencana bintang "Sorotan" + catatannya. Tombol keputusan
menempel di bawah layar di ponsel (di atas area aman). Validasi di logic.ts + tes.

## D3 — Ponsel (zona: `src/components/views/sh-overview/mobile/*` (baru), `tests/ui/sh-overview-mobile.test.ts`)
Ekspor `MobileOverview(props: OverviewScreenProps)`. Papan `M-Ponsel-Hari`, `M-Ponsel-Rincian`,
`M-Ponsel-7Hari`, `F-Ponsel*`:
- Judul besar ("Ringkasan" / nama subholding / nama PT), tanggal kecil di atasnya; kontrol segmen
  Hari ini/Kemarin/7 hari selebar layar; tombol penyaring "Semua subholding ▾" dan (bila subholding
  dipilih) "Semua PT (25) ▾" + "Reset".
- Kartu status (tingkat sesuai `statusSummary`): baris lingkaran inisial subholding dengan lencana
  centang/hijau atau cincin kuning; tingkat PT: "9 dari 25 PT melapor" + batang progres; baris peringatan.
- Sorotan: kartu digeser horizontal (scroll-snap), catatan supervisor di kotak berwarna sorotan.
- Semua laporan: daftar berkelompok (subholding atau PT), maks 3 baris per subholding + "Lihat semua…"
  (mengatur penyaring), baris: judul, jam·PT/pelapor, foto 40px, chevron; sorotan bintang & di atas.
- "Belum melapor · 16 PT" dapat dilipat (tingkat PT).
- Lembar pemilih subholding & PT: muncul dari bawah, **seret untuk menutup** (framer-motion `drag="y"`,
  proyeksi momentum seperti skill: tutup bila kecepatan/proyeksi melewati ambang, spring tanpa pantul
  saat kembali), kolom cari, bagian Melapor/Belum melapor, centang pada pilihan aktif.
- Rincian: **layar penuh didorong dari kanan** (spring `bounce:0, duration ~0.35`), tombol "‹ Ringkasan",
  **geser dari tepi kiri untuk kembali** (drag="x", lacak 1:1, lepas dengan kecepatan → selesai/batal);
  galeri foto horizontal scroll-snap dengan penanda n/N, klik → lightbox (`EvidenceLightbox`),
  catatan supervisor, judul, deskripsi, tabel PT/pelapor/disetujui, dokumen.
- 7 hari: tiap subholding (atau tiap PT bila subholding dipilih) satu baris 7 kotak (huruf hari di kepala),
  intensitas sesuai jumlah, kotak hari kerja kosong bergaris kuning, akhir pekan pudar; catatan `weekNote`.
  Lalu "Sorotan 7 hari".
- Tarik untuk memuat ulang opsional; tekan → umpan balik instan (scale 0.97 saat :active).
- Navigasi bawah aplikasi sudah disediakan shell — JANGAN membuat tab bar sendiri.

## D4 — Tablet & desktop (zona: `src/components/views/sh-overview/tablet/*` (baru),
`src/components/views/sh-overview/report-detail.tsx`, `tests/ui/sh-overview-tablet.test.ts`)
Ekspor `TabletOverview(props)`. Papan `M-Tablet-*`, `F-Tablet*`:
- Lebar kontainer ≥ 1000px: **3 panel** — subholding (±250px: "Semua subholding" + tiap subholding
  dengan titik status, "9/25 PT · 12 laporan", jumlah sorotan), PT (±290px: cari, Melapor/Belum
  melapor, lencana jumlah; hanya bila subholding dipilih — bila "Semua" panel PT disembunyikan),
  konten. 600–999px: **2 panel** — panel kiri berisi tombol pemilih subholding (popover) di atas daftar PT.
  Gunakan container query/ResizeObserver pada kontainer, bukan viewport (shell punya sidebar).
- Konten "Semua": Sorotan (grid kartu), kartu ringkas per subholding (3 laporan teratas, klik → pilih).
  Subholding/PT dipilih: kepala (inisial, nama, meta), sorotan, laporan per PT (foto 52–64px + lencana
  jumlah, judul, 2 baris deskripsi, jam·pelapor). 7 hari: tabel subholding×hari (atau PT×hari) + sorotan 7 hari.
- Rincian: `ReportDetail` (dialog tengah dua kolom) — tambahkan blok **"Catatan supervisor"** (warna
  sorotan) di atas tabel bila `highlight`. Panel berganti isi dengan transisi halus (crossfade + geser 8px,
  spring kritis), pilihan aktif disorot.
- Panel-panel bergulir sendiri-sendiri; tinggi mengikuti ruang konten shell.

## Aturan bersama
- Nilai visual HANYA token `design-system/tokens.css` / kelas bertoken; warna sorotan: tambahkan token
  bila belum ada? TIDAK — pakai `--peringatan`/`--kuning`-sejenis yang ada (cek tokens.css: cari warna
  kuning/amber dan `-soft`); hijau status = token sukses; kuning belum melapor = token peringatan.
  Tema terang+gelap wajib.
- Gerak: framer-motion (sudah terpasang). Spring kritis (`bounce: 0`) untuk navigasi; pantul kecil
  hanya setelah lemparan. Animasikan transform/opacity saja. `useReducedMotion()` → crossfade tanpa geser.
- Interaksi: target sentuh ≥44px, umpan balik saat ditekan, aria lengkap (dialog, switch, aria-current,
  aria-pressed, label foto). Indonesia, "Anda", tanpa emoji/tanda seru.
- `.t-*` kini di layer components (utilitas menimpanya); boleh pakai `t-*` + `font-semibold`.
- JANGAN menulis teks kelas berisi `*` di mana pun (Tailwind memindai berkas).
- Jangan commit, jangan jalankan server/DB, jangan sentuh zona lain.
- Gerbang zona: `export DATABASE_URL='postgresql://x:y@127.0.0.1:1/db' DIRECT_URL=$DATABASE_URL;`
  `npx tsc --noEmit --incremental false; npx eslint <berkas>; npx vitest run <tes Anda>`.
