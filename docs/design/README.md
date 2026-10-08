# Panduan desain Monitor Karya

Versi 3 · 5 Oktober 2026 · Bahasa Indonesia

## Isi

| # | Berkas | Isi |
| --- | --- | --- |
| 01 | [Prinsip & bahasa](01-prinsip-dan-bahasa.md) | 9 prinsip, suara & bahasa, kosakata status, format angka/tanggal/uang, glosarium |
| 02 | [Warna](02-warna.md) | Semua token warna terang & malam, alias aksen, 6 aksen, status, warna divisi, material, tabel kontras |
| 03 | [Gradien & material](03-gradien-dan-material.md) | Token gradien, gradien aksen dinamis, aurora, kaca |
| 04 | [Tipografi](04-tipografi.md) | Keluarga huruf, 13 gaya, ukuran per perangkat, aturan |
| 05 | [Tata letak](05-tata-letak.md) | Spasi, radius, grid & kerangka per perangkat, anatomi kartu, z-index |
| 06 | [Elevasi & gerak](06-elevasi-dan-gerak.md) | 4 lapis, bayangan, durasi, kurva, pola gerak |
| 07 | [Ikon](07-ikon.md) | 36 ikon dan maknanya |
| 08 | [Mode malam](08-mode-malam.md) | Lima lapis kegelapan, cahaya, pendar, kontras, penerapan |
| 09 | [Aksesibilitas](09-aksesibilitas.md) | Kontras, fokus, ARIA, grafik, uji |
| 10 | [Komponen](10-komponen.md) | 30 komponen: fungsi, aturan, props, contoh |
| 11 | [Diagram & data](11-diagram-dan-data.md) | Memilih diagram, aturan visual, ukuran per perangkat, interaksi |
| 12 | [Perangkat & navigasi](12-perangkat-dan-navigasi.md) | Desktop/tablet/ponsel, tab & sidebar per peran |
| 13 | [Pola layar](13-pola-layar.md) | Kerangka dashboard, pola kartu, sheet detail, keadaan |
| 14 | [Implementasi](14-implementasi.md) | Memasang token, tema, komponen, Tailwind, format, kontrak data, rute, uji, migrasi |
| 15 | [Daftar periksa review](15-checklist-review.md) | Untuk setiap PR yang mengubah tampilan |

### Spesifikasi layar per peran

| Berkas | Peran |
| --- | --- |
| [00 · Alur antarperan](peran/00-alur-antarperan.md) | Hierarki, alur laporan, siklus status, konsistensi |
| [01 · Manajemen](peran/01-manajemen.md) | Seluruh perusahaan |
| [02 · Direktur](peran/02-direktur.md) | Beberapa divisi, laporan mingguan, eskalasi |
| [03 · Kepala divisi](peran/03-kepala-divisi.md) | Review output, laporan harian tim, beban kerja |
| [04 · Admin PT](peran/04-admin-pt.md) | Kepatuhan laporan, akses, data induk |
| [05 · PIC proyek](peran/05-pic-proyek.md) | Laporan harian, output & bukti, tahapan |

Lainnya: [Ringkas untuk agen AI](ringkas-untuk-agen-ai.md) · [Riwayat perubahan](CHANGELOG.md)

## Sumber visual

- **Mockup interaktif** (desktop, tablet, ponsel untuk 5 peran + mode malam + fondasi): artifact kanvas "Monitor Karya — Dashboard per peran" di claude.ai — https://claude.ai/artifact/PJAEiMooWhxXKtNbJAhuv9
- **Design system** (token, komponen, pratinjau): https://claude.ai/artifact/9woJ6zAAeXrZyb6hhQUtMz

Keduanya privat milik pemilik akun; bagikan dari menu Share bila tim perlu membuka. Nama papan di kanvas disebut di setiap berkas peran.

### Halaman di kanvas mockup

| Halaman | Isi |
| --- | --- |
| 0 · Peta layar A–Z | Indeks semua layar, bisa dicari dan disaring per perangkat; klik untuk membuka |
| 1 · Fondasi desain | Warna & gradien, tipografi, ruang, komponen, navigasi, perangkat, diagram |
| 2–6 · Peran | Dashboard Manajemen, Direktur, Kepala divisi, Admin PT, PIC proyek (desktop, tablet, ponsel) |
| 7 · Mode malam | Papan fondasi malam, enam aksen, semua peran dalam mode malam |
| 8 · Masuk, awal & pengaturan | Masuk, verifikasi 2 langkah, lupa sandi, pilih entitas, awal pakai, pengaturan, keadaan sistem |
| 9 · Proyek, orang & tim | Daftar proyek (tabel/papan/linimasa), detail proyek 6 tab, buat proyek 4 langkah, direktori & profil |
| 10 · Output, laporan, persetujuan & notifikasi | Unggah & review output, riwayat laporan harian, editor laporan mingguan, PDF, detail persetujuan, pusat notifikasi, pencarian ⌘K |
| 11 · Kehadiran, admin & pesan | Absen ponsel, izin/cuti, rekap tim, kelola pengguna, data induk & template laporan, log audit, pengaturan organisasi, email & push |

## Cara membaca

- Membangun layar baru → 13 → berkas peran → 10 → 14.
- Mengubah warna/jarak → `design-system/tokens.json` → 02/05 → CHANGELOG.
- Menulis teks UI → 01.
- Review PR → 15.

Bila panduan dan kode berbeda, **panduan yang benar** sampai panduan diubah lewat PR.
