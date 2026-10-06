# 12 · Perangkat & navigasi

Satu isi, tiga cara menyajikan. **Urutan prioritas sama di semua perangkat**; yang berubah adalah susunan dan cara membuka detail.

## Perbandingan

| Bagian | Desktop (≥1024) | Tablet (600–1023) | Ponsel (<600) |
| --- | --- | --- | --- |
| Navigasi | Sidebar kiri 248px: logo + nama peran, `NavItem` (maks. 7), "Lihat sebagai" (khusus purwarupa), panel Tampilan, profil | `TabBar floating` di atas tengah, logo kiri, avatar kanan | `TabBar` bawah kaca, 4 tab |
| Judul | Tanggal + sapaan `large-title` 40 | Subjudul + large title 34 | Subjudul + large title 34 + avatar |
| Ringkasan (hero) | Kalimat 34 + cincin 176 + 4 KPI 2×2 dalam satu kartu aurora | Kalimat 26 + cincin 120–130; 4 KPI sebaris di bawah | Cincin 96 di samping kalimat 19–20; 2 KPI; tombol aksi utama lebar penuh |
| Kartu | Baris flex 2:1 | Grid 2 kolom atau lebar penuh | Satu kolom |
| Tabel | `ProjectRow` 5 kolom, `overflow-x` | Kartu 2 kolom | `ProjectRow compact` |
| Saringan | `Chip` sebaris | `Chip` sebaris | `Chip` digulir horizontal (margin −20) |
| Keputusan | Tombol kecil di baris | Tombol `md` | Kartu per item, tombol `md` |
| Detail | `Sheet` samping 440 di atas scrim | `Sheet variant="form"` tengah | Layar penuh didorong dari kanan, header kaca 96 + "Kembali", tombol menempel bawah `lg` |
| Tampilan | Panel di bawah sidebar | Menu profil | Tab terakhir → Tampilan |

## Tab per peran (tablet & ponsel)

| Peran | Tab 1 | Tab 2 | Tab 3 | Tab 4 |
| --- | --- | --- | --- | --- |
| Manajemen | Ringkasan `ringkasan` | Proyek `proyek` | Persetujuan `persetujuan` (badge) | Tim `tim` |
| Direktur | Ringkasan `ringkasan` | Proyek `proyek` | Eskalasi `persetujuan` (badge) | Divisi `tim` |
| Kepala divisi | Ringkasan `ringkasan` | Review `persetujuan` (badge) | Tim `tim` | Proyek `proyek` |
| Admin PT | Ringkasan `ringkasan` | Kepatuhan `laporan` | Akses `kunci` (badge) | Data `gedung` |
| PIC proyek | Hari ini `ringkasan` | Output `dokumen` (badge revisi) | Laporan `laporan` | Catatan `catatan` (badge belum dibaca) |

Badge = jumlah yang menunggu tindakan pengguna itu. Hilang saat 0.

## Sidebar desktop per peran

| Peran | Item nav (ikon · label · hitungan) |
| --- | --- |
| Manajemen | Ringkasan · Proyek 24 · Tim & divisi · Persetujuan (aksen) · Aktivitas · Kehadiran |
| Direktur | Ringkasan · Laporan mingguan 3 · Milestone · Proyek 8 · Eskalasi (aksen) · Divisi 3 |
| Kepala divisi | Ringkasan · Review output (aksen) · Laporan harian 4/5 · Proyek 4 · Tim 7 · Laporan mingguan |
| Admin PT | Ringkasan · Kepatuhan laporan (belum) · Permintaan akses (aksen) · Pengguna 52 · Data induk · Log aktivitas · Pengingat otomatis |
| PIC proyek | Hari ini · Laporan harian (aksen bila belum) · Output saya 7 · Tahapan proyek · Catatan kepala divisi (aksen) · Riwayat laporan |

Item nav di desktop adalah jangkar ke bagian halaman (`#laporan`, `#review`) — satu halaman panjang yang bisa dipindai. Di aplikasi nyata boleh menjadi rute terpisah dengan urutan yang sama.

## Catatan ponsel

- Area aman atas/bawah dihormati; tab bar `glass` di atas konten.
- Tombol utama layar detail menempel di bawah, lebar penuh, `lg` 52px, di atas panel kaca.
- Kolom balas catatan menempel tepat di atas tab bar.
- Gestur geser dari tepi kiri menutup layar detail.
- Saringan divisi Direktur memakai `SegmentedControl full` dengan label pendek (Semua · Tek · Ops · Media).

## Catatan tablet

- Tab bar mengambang tidak menutupi isi: padding atas isi 92px.
- Form sheet di tengah dengan padding 48 dari tepi; scrim bisa diklik untuk menutup.
- Kontrol saringan (segmented) di kanan judul halaman.
