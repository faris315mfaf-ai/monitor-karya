# 05 · PIC proyek

**Siapa:** penanggung jawab satu proyek (contoh: Rina Kartika, PIC Peluncuran Aplikasi Absensi, Divisi Teknologi).
**Pertanyaan utama:** Apa yang harus saya laporkan hari ini? Output mana yang perlu saya selesaikan atau revisi? Apa kata kepala divisi?
**Papan kanvas:** halaman "6 · PIC proyek" — `DPIC`, `TPIC`, `TPICOutput`, `PPIC`, `PPICOutput`, `PPICLaporan`, `PPICCatatan`, `PPICDetail`.

Layar PIC adalah layar **kerja**, bukan layar pantau: tombol dan form lebih menonjol daripada grafik.

## Desktop — urutan

1. **Sidebar:** "PIC proyek · Teknologi". Nav: Hari ini · Laporan harian `1` (aksen, hilang setelah terkirim) · Output saya `7` · Tahapan proyek · Catatan kepala divisi `1` (aksen) · Riwayat laporan.
2. **Header:** "Senin, 5 Oktober 2026 · Peluncuran Aplikasi Absensi" + "Selamat sore, Rina"; kanan: lencana **"Laporan hari ini · Belum dikirim"** (late) → "Terkirim 17.06" (done), notifikasi.
3. **Hero:** `StatusBadge` Perlu perhatian; **"Aplikasi Absensi 64% selesai."**; "Uji coba gelombang 2 tertahan karena perangkat uji terlambat 4 hari. Usulan geser rilis ke 31 Oktober sedang ditinjau Direktur."; tombol **"Isi laporan harian"**, tautan "Lihat tahapan". `ProgressRing` 176 status risk "selesai". KPI: Output selesai 23 dari 36 (gradient) · Menunggu review (oleh Andi Wijaya) · Perlu revisi (Panduan pengguna) · Menuju rilis 19 hari (24 Okt · usul 31 Okt).
4. **Laporan harian · Senin, 5 Oktober** (2/3):
   - Subjudul "Tenggat 17.00 · isi lalu kirim" → "Terkirim ke Admin PT pukul 16.42".
   - Kotak `surface-2`: `FlowDiagram` Isi laporan (n progress) → **Terkirim ke Admin PT** → **Diteruskan ke holding** → Laporan mingguan.
   - **Yang dikerjakan hari ini**: kotak centang (`role="checkbox"`, kotak 24 radius 8, terisi aksen + centang putih, teks dicoret saat selesai) + "n dari m selesai".
   - 2 kolom textarea `fill-1` radius 14: **Kendala** · **Rencana besok** — selalu tampil. Kendala wajib bila status Terkendala atau Menunggu keputusan; Rencana besok wajib bila Terkendala. Di luar itu keduanya opsional (ditulis sebagai petunjuk di bawah kolom).
   - Tombol **"Kirim laporan"** (primer) → setelah terkirim: "Kirim ulang laporan", selama belum diteruskan; "Simpan draf"; tombol plain **"Lampirkan foto"** membuka pemilih berkas panel Bukti khusus gambar (kamera di ponsel). Foto bisa dilampirkan setelah draf tersimpan.
   - Laporan dikirim **langsung ke Admin PT**. Kepala divisi hanya melihat laporan anggota divisinya; ia tidak menyetujui atau meneruskan laporan harian.
   - **Setelah diteruskan ke holding** laporan dibekukan: formulir, centang, dan bukti menjadi baca-saja; kotak kunci menampilkan `StatusBadge` "Diteruskan · dibekukan" dan tombol **"Ajukan buka kunci"** (Sheet berisi alasan, minimal 10 karakter). Setelah diajukan: lencana "Buka kunci diajukan · menunggu persetujuan" → "Buka kunci disetujui · menunggu dijalankan Tim TI" → "Dibuka sampai 7 Okt 10.00" (`info`). Selama dibuka, PIC memperbaiki lalu mengirim ulang; laporan dikunci kembali otomatis saat masa bukanya habis.
5. **Tahapan proyek** (1/3): "3 dari 6 tahap selesai"; `FlowDiagram` vertikal: Perencanaan · Pengembangan · Uji coba gelombang 1 (selesai) · **Uji coba gelombang 2 (blocked, "Perangkat terlambat")** · Pelatihan pengguna (19 Okt) · Rilis (24 Okt · usul 31 Okt).
6. **Output saya** (2/3): "7 output terdekat dari 36 · klik untuk detail", tombol "Output baru"; `Chip` Semua · Perlu revisi · Dikerjakan · Menunggu review · Diterima; baris: ikon dokumen, judul, waktu/target, lencana status, tombol **"Unggah bukti"** untuk Dikerjakan/Perlu revisi (→ status Menunggu review).
7. **Catatan kepala divisi** (1/3): percakapan dengan Andi — gelembung kiri `fill-1` (Andi), kanan `accent-fill` putih (Rina), waktu di bawah; kolom "Balas Andi…" + `IconButton filled` kirim.
8. **Progres dibanding rencana** (2/3): `AreaChart` aktual vs rencana (M36–M41: 12→64% vs 15→75%), klik minggu → "M41: 64% dari rencana 75%". **Tenggat terdekat** (1/3): kotak tanggal + judul + catatan + lencana (Uji gelombang 2 mulai 12 Okt · Pelatihan 19 Okt · Rilis 24 Okt).

## Sheet output
Lencana status, deskripsi, **Catatan revisi** (`waspada-soft`, contoh: "Tambahkan bagian izin dan cuti, serta tangkapan layar versi iPhone. — Andi Wijaya"), daftar **Bukti** (berkas + ikon unduh) atau area unggah putus-putus "Seret berkas ke sini atau tekan Unggah bukti". Aksi "Tanya kepala divisi" · **"Unggah bukti & kirim"** (atau "Menunggu review" nonaktif).

## Tablet — Hari ini · Output · Laporan · Catatan
Hari ini: hero + form laporan lengkap (alur horizontal, centang, 2 textarea, kirim). Output: 4 KPI + chip + daftar dengan "Unggah". Laporan: progres vs rencana, tahapan + riwayat laporan berdampingan. Catatan: percakapan + kolom balas.

## Ponsel — tab yang sama
- **Hari ini:** kartu ring 96 + "Aplikasi Absensi" + tenggat + kalimat; kartu laporan: centang, Kendala, Rencana besok, tombol "Kirim laporan" lebar penuh `lg`, "Lampirkan foto"; setelah terkirim alur vertikal + "Kirim ulang laporan"; setelah diteruskan: kotak kunci + "Ajukan buka kunci".
- **Output:** chip digulir, baris (judul, lencana + waktu, chevron) → layar detail; "Output baru".
- **Laporan:** progres vs rencana, tahapan vertikal, riwayat laporan 6 hari (lencana).
- **Catatan:** gelembung; kolom balas menempel tepat di atas tab bar.
- **Detail output:** layar didorong ("‹ Output"), deskripsi, catatan revisi, bukti, tombol menempel "Unggah bukti & kirim".

## Aturan khusus
- Tenggat laporan harian yang sudah lewat ditulis jelas tanpa menyalahkan ("Tenggat 17.00 · lewat 4 menit").
- Kendala ditulis sebagai fakta; contoh placeholder mengarahkan ke fakta ("Apa yang menghambat? Mis. perangkat belum tiba").
- Mengirim laporan langsung terlihat di layar Admin PT (antrean Penerimaan) dan kepala divisi (hanya lihat) — lihat `00-alur-antarperan.md`.
- Laporan yang sudah diteruskan ke holding dibekukan. API menolak perubahan dengan 409 "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya." Satu-satunya jalan mengubahnya adalah buka kunci yang disetujui (`/api/unlock-requests`). Laporan yang sudah diteruskan tidak bisa dihapus, juga selama dibuka.
- Laporan hari kerja yang lewat tenggat 17.00 juga terkunci; buka kunci membukanya. Laporan tanggal lampau yang sedang dibuka muncul sebagai kotak "Laporan … dibuka sampai …" dengan tombol "Ubah laporan 5 Okt"; formulir tanggal itu memakai `reportDate` (hanya hari kerja, tidak di masa depan, hanya bila dibuka).

## Data yang dibutuhkan
Proyek (progres, status, tenggat, usul tenggat), tugas hari ini, isi laporan (kendala, rencana besok, foto), tahapan (nama, sub, status, meta), output (judul, status, waktu, deskripsi, bukti, catatan revisi), percakapan dengan kepala divisi, progres mingguan aktual vs rencana, tenggat terdekat, riwayat laporan.

## Implementasi saat ini (6 Okt 2026)
Bagian ini mencatat beda layar yang berjalan dengan rancangan di atas. Ubah rancangan atau kode, lalu hapus butir yang sudah sama.
- **Tab** (`ROLE_TABS`): Ringkasan · Meja kerja · Laporan harian · Proyek. Output, tahapan, catatan, dan riwayat tidak punya item navigasi sendiri — di desktop tampil sebagai kartu di Ringkasan (`PicDashboard`); di tablet/ponsel Ringkasan dipecah dengan `SegmentedControl` Hari ini · Output · Laporan · Catatan. Lencana nav "Laporan harian `1`" dan lencana catatan belum dibaca (di tab Ringkasan) dari `/api/nav-badges`. Rincian per butir: [`docs/fitur/peran-pic.md`](../../fitur/peran-pic.md).
- **Alur laporan harian** sudah sama dengan rancangan di atas (keputusan produk 6 Okt 2026: kirim langsung ke Admin PT, dibekukan setelah diteruskan). Kode: `views/daily-input-view.tsx`, `/api/daily-input`, `/api/tasks`, `dailyGate` di `src/lib/daily-rollup.ts`; penerusan mengunci laporan (`/api/inbox`).
- **Rencana besok** disimpan di kolom `followUp` (dulu berlabel "Rencana tindak lanjut").
- **Bukti di laporan yang sedang dibuka**: unggah/hapus bukti mengikuti `src/lib/evidence-access.ts`, yang belum memanggil `activeUnlockFor`. Laporan tanggal lampau yang dibuka bisa diubah isinya, tetapi buktinya belum bisa ditambah sampai berkas itu diperbarui.
- **Output saya**: tombol tambah berbunyi "Tambah output". KPI keempat berlabel "Menuju tenggat" (bukan "Menuju rilis"); tanpa output KPI-nya: Progres proyek · Tepat waktu 7 hari · Menuju tenggat · Bukti.
- **Progres dibanding rencana**: rencana mingguan dihitung dari tahapan bertanggal (tiap tahap bernilai sama), atau linear mulai → tenggat bila belum ada tahapan (`src/lib/pic-progress.ts`, `/api/project-progress`).
