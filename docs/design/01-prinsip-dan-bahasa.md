# 01 · Prinsip & bahasa

Monitor Karya adalah aplikasi pemantauan kerja berbasis output. Pengguna membukanya untuk menjawab satu pertanyaan: **"Bagaimana keadaannya, dan apa yang harus saya lakukan?"** Semua keputusan desain di panduan ini diturunkan dari pertanyaan itu.

Rasa yang dituju: bersih, tenang dan terang seperti antarmuka Apple. Ruang lega, huruf SF besar, material kaca, gradien yang bercahaya hanya di titik fokus, diagram yang hidup. Merah-putih adalah identitas, bukan dekorasi. Tidak kaku korporat.

## Sembilan prinsip

### 1. Jawaban dulu, detail kemudian
Setiap layar dibuka dengan **satu kalimat** yang menjawab "bagaimana keadaannya?" dalam gaya `title-1`, lalu angka, lalu daftar, lalu detail. Pimpinan harus paham kondisi dalam 5 detik tanpa menggulir.

| Benar | Salah |
| --- | --- |
| "18 dari 24 proyek berjalan sesuai rencana." | "Dashboard Monitoring Proyek" |
| "Divisi Teknologi menyelesaikan 31 output minggu ini." | "Statistik Divisi" |
| "92% laporan harian sudah masuk hari ini." | "Kepatuhan Pelaporan: 92%" |

### 2. Tenang secara bawaan, tegas saat perlu
`bg`, `surface` dan teks `ink` mengisi ±90% layar. Aksen (merah bawaan) hanya untuk: aksi utama, posisi aktif, dan **satu** sorotan data per kartu. Bila semua berwarna, tidak ada yang penting.

### 3. Satu kartu, satu pertanyaan
Tiap kartu menjawab satu hal. Judul kartu adalah pertanyaan itu dalam bentuk frasa: "Perlu perhatian", "Kinerja divisi", "Kapan proyek prioritas selesai?". Kartu yang menjawab dua hal dipecah.

### 4. Warna tidak pernah sendirian
Status selalu tiga lapis: **warna + ikon + kata** (`StatusBadge`). Pembaca buta warna, layar hitam-putih dan cetakan tetap paham.

### 5. Bisa disentuh dan dibaca
Target sentuh minimal 44px, teks minimal 12px, kontras teks ≥4.5:1 di kedua tema. Tidak ada informasi yang hanya muncul saat hover.

### 6. Gradien adalah cahaya
`aurora` di belakang judul, gradien aksen di cincin, batang terpilih, dan satu kartu sorotan. Sisanya permukaan polos. Gradien tidak dipakai sebagai latar dekoratif seluruh layar.

### 7. Diagram menjawab satu pertanyaan
Angka selalu tertulis. Warna membantu, tidak menggantikan. Pilih diagram dari tabel di `11-diagram-dan-data.md`.

### 8. Gerak menjelaskan, bukan menghibur
Animasi hanya untuk menunjukkan perubahan nilai (batang tumbuh dari nilai lama ke baru) atau asal sebuah panel (sheet masuk dari kanan). Tidak ada animasi berulang, berkedip, atau spinner di kartu.

### 9. Malam adalah ruangan gelap, bukan warna terbalik
Tinta hampir hitam, kartu bertepi cahaya, aurora berwarna aksen dari kiri atas. Detail di `08-mode-malam.md`.

## Suara & bahasa

Bahasa Indonesia baku yang santai. Seperti rekan kerja senior yang jelas dan sopan — bukan surat dinas, bukan iklan.

### Aturan

- Sapa dengan **"Anda"**. Bukan "kamu", bukan "Bapak/Ibu".
- **Angka di depan.** "18 dari 24 proyek…", bukan "Persentase proyek yang … adalah 75%".
- **Kalimat pendek.** Satu gagasan per kalimat. Maksimal ±20 kata.
- **Sentence case** untuk judul, tombol, label, tab, nav: "Lihat semua proyek", bukan "Lihat Semua Proyek".
- Tanpa HURUF BESAR SEMUA, tanpa tanda seru, tanpa emoji.
- **Tombol = kata kerja + objek:** "Setujui", "Tinjau yang mendesak", "Kirim catatan", "Unduh laporan", "Ingatkan kepala divisi". Hindari "OK", "Submit", "Klik di sini", "Proses".
- **Alasan ditulis sebagai fakta, tanpa menyalahkan orang:** "Materi video belum disetujui", bukan "Bagas belum menyerahkan materi".
- Hindari jargon teknis di UI: "Data belum termuat", bukan "Error 500 fetching resource".
- Istilah tetap untuk konsep yang sama di seluruh aplikasi (lihat glosarium).

### Kosakata status (tetap, jangan diganti sinonim)

| Kode | Label | Dipakai untuk |
| --- | --- | --- |
| `on` | Sesuai jadwal | Proyek/output/tahap yang berjalan sesuai rencana |
| `risk` | Perlu perhatian | Ada kendala atau berisiko meleset |
| `late` | Terlambat | Lewat tenggat |
| `done` | Selesai | Sudah tuntas dan diterima |
| `neutral` | Belum mulai | Belum dikerjakan; juga cuti |
| `info` | (bebas, singkat) | Menunggu review, diingatkan, informasi |

Keputusan: **Menunggu · Disetujui · Ditolak**. Review output: **Menunggu review · Diterima · Revisi diminta**. Laporan: **Belum dikirim · Terkirim · Terlambat masuk · Sudah dibaca**.

### Keadaan khusus

| Keadaan | Contoh teks |
| --- | --- |
| Kosong (wajar) | "Belum ada proyek terlambat." |
| Semua beres | "Semua persetujuan sudah beres." · "Tidak ada yang mendesak hari ini." |
| Saringan kosong | "Tidak ada proyek dengan status ini." |
| Galat | "Data belum termuat. Coba lagi." + tombol "Coba lagi" |
| Konfirmasi tindakan | "Pengingat terkirim ke Rina." |
| Tenggat lewat | "Tenggat 17.00 · lewat 4 menit" |

### Format angka, tanggal dan uang

| Jenis | Format | Contoh |
| --- | --- | --- |
| Tanggal panjang | hari, tanggal bulan tahun | Senin, 5 Oktober 2026 |
| Tanggal ringkas | tanggal + bulan 3 huruf | 18 Okt |
| Jam | titik pemisah, 24 jam | 14.20 |
| Relatif | sampai 24 jam, lalu "Kemarin" | 2 jam lalu · Kemarin, 16.40 |
| Hari + jam | hari singkat | Jum, 14.30 |
| Ribuan | titik | 1.466 output |
| Desimal & persen | koma, tanpa spasi | 68,5% |
| Rupiah ringkasan | Rp + satuan | Rp 48,5 jt · Rp 1,2 M |
| Rupiah detail | tanpa spasi, penuh | Rp48.500.000 |
| Periode minggu | M + nomor minggu ISO | M41 |
| Periode kuartal | K + nomor (+ tahun bila perlu) | K3 2026 |
| Rentang | en dash tanpa spasi | 21 Sep–2 Okt |
| "x dari y" | selalu untuk rasio orang/output | 46 dari 50 · 31 dari 38 |

Gunakan `Intl.NumberFormat('id-ID')` dan `Intl.DateTimeFormat('id-ID')`, jangan menyusun format sendiri.

## Glosarium

| Istilah | Arti di Monitor Karya |
| --- | --- |
| Output | Hasil kerja yang bisa dibuktikan (dokumen, kode, desain, laporan). Satuan utama kinerja |
| Bukti | Berkas/tautan yang melampiri output |
| Laporan harian | Laporan PIC/anggota ke kepala divisi, tenggat 17.00 hari kerja |
| Laporan mingguan | Ringkasan kepala divisi ke direktur, serah Kamis 17.00, dikunci Jumat 17.00 WIB |
| Review | Kepala divisi menerima output atau meminta revisi |
| Persetujuan | Keputusan manajemen (anggaran, materi, kontrak, cuti) |
| Eskalasi | Keputusan yang dinaikkan kepala divisi ke direktur |
| Tahapan | Fase proyek (Perencanaan, Pelaksanaan, Uji, Serah terima, Rilis) |
| Milestone | Tanggal penting di timeline proyek |
| PIC | Penanggung jawab proyek |
| Entitas | PT induk atau anak usaha |
| Kepatuhan | Persen orang yang mengirim laporan tepat waktu |
