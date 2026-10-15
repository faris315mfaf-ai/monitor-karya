# SH-UA — UI web Admin subholding (16 Okt 2026)

Agen UA. Kontrak: `docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md`. Mockup papan 2/3/4/7 dipakai untuk isi & alur;
gaya mengikuti sistem desain (`src/components/mk`, kelas bertoken). Tanpa git.

## Berkas

| Berkas | Isi |
|---|---|
| `src/components/views/sh-admin/types.ts` | Tipe `ShReport`, `ShOptions`, `ShInbox`, … sesuai kontrak |
| `src/components/views/sh-admin/logic.ts` | Logika murni: validasi, simpan→unggah, periode WIB, saringan, CSV, gabungan kotak masuk, rincian laporan, ingat pelapor, perpindahan Kotak masuk→Dashboard |
| `src/components/views/sh-admin/bukti-picker.tsx` | Pemilih bukti (foto / dokumen / tautan / seret), cek 20 MB + jenis berkas sebelum simpan |
| `src/components/views/sh-admin/dashboard-view.tsx` | Tab `sh-dashboard` |
| `src/components/views/sh-admin/inbox-view.tsx` | Tab `sh-inbox` |
| `src/components/views/sh-admin/history-view.tsx` | Tab `sh-history` |
| `src/components/views/sh-admin/index.ts` | Ekspor tiga view |
| `src/components/app-shell.tsx` | +1 impor, +3 baris peta tab (milik UB tidak disentuh) |
| `tests/ui/sh-admin-logic.test.ts` | 22 tes |

## Perilaku

**Dashboard.** Angka ringkas (Dikirim / Menunggu / Perlu perbaikan / Disetujui, dari `counts`; tiga terakhir
menyaring daftar). Form Tambah laporan: kegiatan, PT (dropdown `/api/sh/options`), deskripsi, nama, jabatan
(SegmentedControl Manajer|Kepala + bidang, pratinjau "Tertulis: Manajer Proyek"), chip pelapor sebelumnya,
bukti minimal 1 dipilih sebelum simpan, sakelar "Ingat nama & jabatan" (localStorage `mk-sh-pelapor`).
Semua isian bertanda * divalidasi; galat per isian + ringkasan `role=alert`, fokus ke isian pertama.
Simpan: `POST /api/sh/reports` (header `Idempotency-Key`, dibuat ulang setelah sukses) → unggah bukti satu per
satu (`/api/evidence/upload` atau `/api/evidence` untuk tautan, targetType `SUBHOLDING_REPORT`); tombol menampilkan
"Mengunggah bukti 2 dari 3…". Sukses → pesan `role=status` + toast, form kosong (nama/jabatan tetap bila diingat).
Gagal sebagian → panel "Bukti belum terunggah" (daftar berkas + alasan, "Unggah ulang" ke laporan yang sama,
"Pilih bukti lain", "Tutup"); bila nol bukti masuk, dijelaskan supervisor belum bisa menyetujui.
Daftar hari ini: chip saring status + jumlah; kartu StatusBadge, jam, PT, kegiatan, deskripsi, pelapor+jabatan,
jumlah bukti (merah bila 0), komentar supervisor terakhir. Aksi: "Perbaiki & kirim ulang" (PERLU_PERBAIKAN →
form mode ubah, PATCH), "Lampirkan bukti" (Sheet, untuk laporan belum disetujui), "Tarik laporan" (MENUNGGU,
`useConfirm` destruktif → DELETE). Tambahan: kartu "Perlu perbaikan dari hari sebelumnya" (30 hari) agar laporan
lama yang diminta perbaiki tetap terjangkau.

**Kotak masuk.** Pesan + pengingat dalam satu daftar (StatusBadge jenis, titik belum dibaca), saring
Semua/Belum dibaca, "Tandai semua dibaca" (`POST /api/sh/inbox/read {all:true}`); membuka pesan → tandai dibaca
`{ids}` + Sheet: ringkasan laporan, deskripsi, percakapan (`mk-thread`, dari `GET /api/sh/reports/:id`, cadangan
lewat daftar 30 hari), balas (`POST …/comments`), "Perbaiki laporan" bila status PERLU_PERBAIKAN → Dashboard
mode ubah. Pengingat → "Tambah laporan".

**Riwayat.** Periode Hari ini/7/30 hari (WIB, inklusif), PT, status (dikirim ke server; pageSize 200), cari
(klien, seketika). Tabel `mk-adm-table` di `mk-scroll-x` (ponsel menggulir dalam kotak, region berlabel & bisa
difokus). "Unduh CSV" dari baris yang tampil: BOM UTF-8, CRLF, waktu WIB, sel dikutip, penjaga injeksi rumus.
Catatan bila `total` > baris dimuat.

Status → StatusBadge: MENUNGGU = info "Menunggu tinjauan", PERLU_PERBAIKAN = risk "Perlu perbaikan",
DISETUJUI = done "Disetujui" (`SH_STATUS_META` di logic.ts — UB boleh memakai ulang agar seragam).

## Gerbang

- `tsc --noEmit`: bersih. `eslint src`: bersih.
- `vitest run`: tes saya 22/22 lulus; tests/ui + tests/qa 183/183. Gagal di zona lain (dicatat saja):
  `tests/api/auditor-readonly` & `keamanan-galat-mentah` (rute `/api/sh/*` SV1 belum terdaftar di tes itu),
  `tests/cx/cx11-preview`, `tests/api/login` & `tests/security/t13-login-plafon` (batas waktu 5 dtk saat beban).
- Satu kegagalan milik saya sempat muncul (`statis-sheet`: hanya `useConfirm` boleh memasang `<ConfirmDialog>`) —
  diperbaiki dengan beralih ke `useConfirm`.

## Catatan untuk agen lain

- Lencana jumlah belum dibaca pada tab `sh-inbox` di nav/Dock belum ada (zona shell). View memanggil
  `refreshNotes()` setelah tandai dibaca.
- Server menulis jabatan apa adanya (`reporterTitle(kind, field)`), pratinjau klien sama (tanpa kapitalisasi otomatis).
- Belum diuji di peramban (aturan: tanpa server/DB).
