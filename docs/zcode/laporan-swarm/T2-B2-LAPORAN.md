# Laporan T2-B2 — Uji keyboard/fokus otomatis untuk Sheet yang mengubah data

Dikerjakan Zcode (agen T2-B2), 8 Oktober 2026, worktree `monitor-karya-codex`,
cabang `codex/kerja`, tanpa commit. Menutup butir QA backlog D
(docs/SISA-PEKERJAAN.md): "Sheet di balik tombol yang mengubah data (Kirim,
Setujui, Hapus) dilewati uji keyboard otomatis".

## Berkas berubah

| Berkas | Isi |
|---|---|
| `tests/qa/keyboard/helpers.ts` (baru) | Pemandu bersama: penelusur pohon elemen React, pembaca sumber, pemindai atribut tag JSX/blok pemanggilan (kurung berpasangan), flush async |
| `tests/qa/keyboard/keyboard-util.test.ts` (baru) | 10 tes unit langsung `moveRovingFocus` (src/components/mk/keyboard.ts) |
| `tests/qa/keyboard/sheet-fokus.test.ts` (baru) | 11 tes kontrak Sheet + ConfirmDialog + useConfirm |
| `tests/qa/keyboard/alur-kirim-hapus.test.ts` (baru) | 7 tes alur Kirim laporan & Hapus laporan (DailyInputView + Sheet + useConfirm sungguhan) |
| `tests/qa/keyboard/alur-setujui-tolak.test.ts` (baru) | 8 tes alur Setujui/Tolak (ApprovalItem, RejectApprovalSheet, useApprovalDecisions, UnlockCard + Sheet Ajukan buka kunci) |
| `tests/qa/keyboard/statis-sheet.test.ts` (baru) | 12 tes statis pada seluruh sumber src/components + CSS |
| `docs/zcode/laporan-swarm/T2-B2-LAPORAN.md` | Laporan ini |

Tidak ada berkas sumber, konfigurasi, atau dependensi yang diubah. Tidak ada
dependensi npm baru (vitest tetap environment `node`; tidak ada jsdom/happy-dom/
testing-library — memang tidak ada di devDependencies).

## Metode

Infrastruktur yang ada diperiksa dulu: `vitest.config.mts` (environment `node`,
include `tests/**/*.test.ts`, alias `@/`), `package.json` devDependencies (tanpa
DOM library), dan pola `tests/cx/**` — khususnya `mk-accessibility.test.ts` dan
`account-sheet-presence.test.ts` yang memanggil komponen sebagai fungsi dengan
hook React dimock lewat `vi.mock('react')` dengan slot state stabil. Suite baru
mengikuti pola itu dalam dua lapis:

1. **Perilaku (pohon elemen + objek tiruan).** Komponen produksi dipanggil
   sebagai fungsi; `Sheet`, `Button`, `useConfirm`, `ConfirmDialog` dimuat
   sungguhan (hanya `useResource`/`useFetch`/`toast`/`refreshNavBadges`/deteksi
   lebar layar yang dimock), lalu pohon elemen diperiksa dan handler
   keyboard/fokus dijalankan: `onOpenAutoFocus`, `onOpenChange(false)`
   (= kontrak Radix untuk Esc/klik scrim), `onConfirm`/`onCancel`,
   `onChange` isian. Komponen dalam (ReportForm, UnlockRequestSheet) yang oleh
   JSX hanya menjadi deskriptor elemen dimaterialkan dengan memanggil
   `el.type(el.props)` sambil melanjutkan kursor hook supaya slot state stabil.
   `fetch` ditukar tiruan; janji `useConfirm` benar-benar ditunggi.
2. **Statis (membaca sumber).** Pemindai atribut menelusuri `<Sheet …>` pada 35
   berkas pemakai (36 berkas memuat `<Sheet`, termasuk definisi sheet.tsx) dan
   15 blok `confirm({…})` pada 13 berkas, memastikan
   `onOpenChange`+`title`, `confirmLabel`, `destructive` untuk judul "Hapus",
   serta tidak adanya `onEscapeKeyDown`/`onInteractOutside` yang menelan Esc atau
   scrim. Kontrak CSS cincin fokus (`:focus-visible` global var(--focus),
   `outline: none` hanya dengan pengganti/pengecualian terdokumentasi) dan
   default `type="button"` pada Button/IconButton juga diperiksa.

Fokus kembali ke pemicu saat sheet ditutup (jalur trigger lepas/tersembunyi/
fallback `[data-sheet-focus-fallback]`) sudah teruji otomatis di suite yang ada
(`tests/cx/mk-accessibility.test.ts`); suite ini melengkapinya dengan fokus masuk
ke judul, alur destruktif, dan cakupan seluruh pemakaian.

## Hasil tes

| Perintah | Hasil |
|---|---|
| `npx vitest run tests/qa/keyboard` | **5 berkas / 48 tes lulus** |
| `npx vitest run` (seluruh suite) | **86 berkas / 1.524 tes lulus** — tanpa regresi (termasuk tes swarm lain yang belum tercommit) |
| `npx tsc --noEmit --incremental false` (env dummy `postgresql://x:y@127.0.0.1:1/db`) | Lulus, exit 0 |
| `npx eslint tests/qa/keyboard` | Lulus, tanpa keluaran |

Alur yang terbukti otomatis (wiring kode produksi):

- **Kirim laporan** — baris proyek dibuka lewat tombol `aria-label="Buka laporan …"`;
  Sheet terbuka berisi tombol "Kirim laporan" (primer, `type="button"` default) yang
  mengirim `PUT /api/daily-input` `action=submit`; Esc pada Sheet menutup tanpa
  permintaan jaringan apa pun.
- **Hapus laporan** — tombol "Hapus laporan" (destructive) membuka ConfirmDialog
  destruktif berlabel; Esc dan Batal mengembalikan janji `false` dan **tidak**
  mengeksekusi `DELETE`; menyetujui mengeksekusi `DELETE /api/daily-input?projectId=…`.
- **Setujui/Tolak** — ApprovalItem: "Tolak" sekunder mendahului "Setujui",
  `aria-label` per baris ("Tolak: …"/"Setujui: …"), nonaktif saat `busy`, handler
  tersambung. RejectApprovalSheet: Esc → `cancelReject`; footer "Batal" sebelum
  "Tolak permintaan" (destructive); tombol tolak aktif mulai alasan 5 huruf;
  alasan terpangkas sebelum dikirim. `useApprovalDecisions`: PATCH approve/reject
  dengan isi benar; toast membawa aksi "Urungkan" yang benar-benar memanggil
  PATCH undo. UnlockCard: Tolak/Setujui → PATCH aksi benar; Sheet "Ajukan buka
  kunci": Esc menutup, Batal sebelum tombol kirim (primer), validasi mencegah
  POST kosong, POST terkirim setelah laporan+alasan dipilih, sheet tertutup
  kembali setelah terkirim.
- **Fokus masuk Sheet** — `onOpenAutoFocus` memindahkan fokus ke judul
  (`preventScroll`, judul `tabIndex={-1}`); tanpa referensi judul, fokus bawaan
  Radix dibiarkan (tidak dipaksa).
- **Struktur** — `aria-modal="true"`, judul tunggal, dua tombol tutup terlabel
  (kembali ponsel + Tutup), urutan baca phonebar → kepala → isi → footer
  (aksi selalu setelah isi), ConfirmDialog Cancel sebelum Action.
- **Statis seluruh kode** — 35 pemakaian `<Sheet>` semua bawa `onOpenChange`
  dan `title`; 15 panggilan `confirm({…})` (13 berkas) semua menyebut `confirmLabel`, judul
  "Hapus" selalu `destructive: true`, "Arsipkan proyek" memang non-destruktif
  karena reversibel (toast Urungkan); tidak ada `onEscapeKeyDown`/
  `onInteractOutside`; `:focus-visible` global 2px var(--focus) offset 2px;
  `.mk-wk-input` dkk. punya pengganti `:focus-visible`; Button/IconButton
  default `type="button"`.
- **Util fokus** — `moveRovingFocus`: pindah/wrap/Home/End, modifier diabaikan,
  tombol lain tidak dicegah, `aria-disabled` dilewati, `activate` opsional,
  pemindahan tidak pernah sekaligus mengklik.

## Yang TERBUKTI otomatis vs yang tetap butuh perangkat/manual

**Terbukti otomatis** (dapat berulang via `npx vitest run tests/qa/keyboard`):
seluruh wiring keyboard/fokus milik kode kami pada alur Kirim/Setujui/Tolak/Hapus
di atas, kontrak ARIA/struktur pada pohon elemen, kepatuhan pola pada seluruh
pemakaian Sheet/confirm di kode, dan logika util fokus murni.

**Tetap butuh perangkat/manual** (bukan batas usaha ini, melainkan batas
lingkungan node tanpa DOM — rinciannya untuk butir D lain di SISA-PEKERJAAN):

1. Perilaku primitif Radix sungguhan di peramban: fokus awal AlertDialog ke
   tombol Cancel, siklus Tab terkunci di dalam dialog (focus trap), Esc native,
   `inert` pada latar, dan `aria-modal` yang benar-benar dihormati pembaca layar.
   Tes kami mensimulasikan kontrak pustaka (`Esc → onOpenChange(false)`); bila
   Radix berperilaku menyimpang, tes tidak akan menangkapnya.
2. Pembaca layar sungguhan (VoiceOver/TalkBack) membacakan judul sheet, urutan
   tombol, dan status konfirmasi — sudah menjadi butir D yang terpisah.
3. Gestur ponsel: tombol "Kembali", geser dari tepi kiri (hanya dibuktikan ada
   secara struktur; perilaku sentuh tidak teruji di sini).
4. Cincin fokus benar-benar tampak (rendering CSS) dan urutan Tab nyata antar
   elemen di dalam sheet terbuka; tes memverifikasi urutan DOM/struktur, bukan
   peristiwa `keydown` sungguhan.
5. Alur yang dicakup statis saja (tidak dirender penuh): Sheet pada
   progress-report-panel (kirim/hapus mingguan-bulanan), AccessRequestsCard
   (termasuk timer tunda 5 detik + Urungkan), member-sheet, task-dialog, dan
   pemakaian Sheet lain di luar tiga alur D — polanya dijaga tes statis
   (onOpenChange/title/confirm destructive), perilaku interaksinya tidak.
6. Jalur kartu satu-proyek (single) DailyInputView memakai ReportForm yang sama
   dengan yang teruji; jalur multi-proyek (lewat Sheet) yang diuji perilaku.

## Temuan untuk pemilik/pengindik (TIDAK ada perubahan kode sumber)

1. **Tidak ditemukan pelanggaran kepatuhan baru** pada cakupan D: semua Sheet
   bawa `onOpenChange`+`title`, semua konfirmasi Hapus destruktif, Esc/scrim
   tidak diblokir di mana pun, `outline: none` hanya pada kasus dengan
   pengganti `:focus-visible` atau pengecualian terdokumentasi.
2. **`.mk-sheet__title:focus { outline: none; }`** (src/app/css/periksa-desain.css)
   adalah pengecualian disengaja F4-B: judul hanya menerima fokus terprogram
   (`tabIndex={-1}`, bukan tab stop) sehingga cincin tidak pernah terlihat
   pengguna keyboard. Konsisten berpasangan dengan sumber Sheet (dijaga tes),
   tetapi menunggu konfirmasi pemilik (SISA-PEKERJAAN bagian B, "Cincin fokus
   pada judul Sheet"). Tes statis mengikat pasangan ini; bila pemilik menolak,
   hapus aturan CSS itu dan hapus pengecualian di `statis-sheet.test.ts`.
3. **Dua pola urutan tombol yang berbeda, keduanya disengaja:** dialog
   konfirmasi (ConfirmDialog) menempatkan aksi aman dulu (Batal → Hapus/Tolak),
   sedangkan baris antrean keputusan (ApprovalItem, UnlockCard) menempatkan
   "Tolak" di kiri "Setujui" (keduanya sekunder; mengikuti komponen
   design-system ApprovalItem). Dicatat untuk kejelasan; tidak ada perubahan
   yang direkomendasikan.
4. `ConfirmDialog` tidak memasang `Description` teks bantu terpisah dari judul
   (deskripsi ada dan wajib via prop `description`); Radix mengeluarkan
   `aria-describedby` undefined — sesuai tabel ARIA desain (dialog dilabeli
   judul). Tidak ada tindakan perlu.

## Batasan

- Kontrak Radix (`Esc/scrim → onOpenChange(false)`, focus trap, fokus awal
  AlertDialog) diasumsikan benar dan disimulasikan; pembuktian perilaku nyata
  milik uji peramban.
- Lingkungan `node` tanpa DOM: `useIsPhone`/`useIsTablet` dipatok false di berkas
  alur (layout ponsel/tablet tidak diuji perilaku; strukturnya dijaga statis).
- Data uji tiruan dua proyek + satu permintaan; tidak menyentuh basis data,
  jaringan, port terlarang, maupun worktree Claude.
