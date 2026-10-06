# 07 · Ikon

- Garis (outline) di grid 24×24, tebal 1.8px (2.1 untuk tab/nav aktif, 2.2–2.4 di lencana dan centang kotak), ujung dan sambungan membulat.
- Warna `currentColor` — ikon ikut warna teks di sebelahnya. Jangan diberi warna sendiri kecuali di kotak ikon beraksen (`accent-soft` + `accent`).
- Ukuran: 20 di nav dan tombol ikon, 18 di tombol dan baris berkas, 24 di tab bar ponsel, 13–16 di lencana dan chevron.
- Ikon digambar inline lewat komponen `Icon` (`<Icon name="proyek" />`), bukan berkas gambar, bukan font ikon, bukan emoji.
- Ikon tanpa teks wajib punya label: `IconButton` meminta `label` (dibacakan dan jadi tooltip).
- Gaya sengaja mirip SF Symbols. Bila nanti aplikasi iOS memakai SF Symbols asli, pertahankan nama dan maknanya.

## Daftar ikon (36)

| Nama | Arti | Dipakai di |
| --- | --- | --- |
| `ringkasan` | Beranda / ringkasan | Nav, tab, alur (Manajemen) |
| `proyek` | Proyek | Nav, tab |
| `tim` | Tim, divisi | Nav, tab, data induk Divisi |
| `persetujuan` | Persetujuan, review, eskalasi | Nav, tab, alur (Kepala divisi) |
| `aktivitas` | Aktivitas, log | Nav |
| `kehadiran` | Kehadiran | Nav |
| `waktu` | Jam; status Terlambat | Lencana |
| `kalender` | Kalender, milestone, riwayat | Nav |
| `laporan` | Laporan, kepatuhan | Nav, tab |
| `cari` | Pencarian | Header |
| `notifikasi` | Notifikasi, pengingat | Header, tombol Ingatkan |
| `terang` / `gelap` | Saklar tema | Panel Tampilan |
| `kanan` / `kiri` / `bawah` | Arah, buka detail, kembali | Chevron baris, tombol Kembali |
| `tutup` | Tutup sheet | Sheet |
| `peringatan` | Perlu perhatian; tahap tertahan | Lencana, alur |
| `selesai` | Sesuai jadwal, selesai, centang | Lencana, tombol Setujui, kotak centang |
| `info` | Informasi | Lencana, catatan |
| `titik` | Belum mulai | Lencana |
| `naik` / `turun` | Tren delta KPI | StatTile |
| `tambah` | Buat baru | "Output baru" |
| `unduh` / `unggah` | Unduh berkas; unggah bukti | Log, output |
| `catatan` | Catatan, laporan harian | Tombol "Kirim catatan", alur (PIC) |
| `pengaturan` | Pengaturan | Nav bawah |
| `lainnya` | Menu tambahan | Header detail ponsel |
| `dokumen` | Dokumen, output, template | Output, data induk, alur (Direktur) |
| `target` | Sasaran, perencanaan | Tahapan |
| `pengguna` | Pengguna, akun | Data induk |
| `kunci` | Akses, izin | Nav & tab Admin |
| `gedung` | Entitas, data induk | Nav & tab Admin |
| `kirim` | Kirim laporan/pesan | Tombol kirim, alur |
| `alur` | Alur, tahapan | Nav PIC |

## Ikon untuk alur laporan

PIC proyek `catatan` → Kepala divisi `persetujuan` → Direktur `dokumen` → Manajemen `ringkasan`. Pakai urutan ikon yang sama di semua layar.
