# 04 · Admin PT

**Siapa:** pengelola administrasi lintas divisi (contoh: Maya Lestari, Admin PT — 3 entitas).
**Pertanyaan utama:** Siapa yang belum lapor? Permintaan akses apa yang harus saya proses? Apakah data induk dan pengingat sudah benar?
**Papan kanvas:** halaman "5 · Admin PT" — `DAdmin`, `TAdmin`, `TAdminKepatuhan`, `PAdmin`, `PAdminKepatuhan`, `PAdminAkses`, `PAdminData`, `PAdminDetail`.

## Desktop — urutan

1. **Sidebar:** "Admin PT · 3 entitas". Nav: Ringkasan · Kepatuhan laporan `4` · Permintaan akses `n` (aksen) · Pengguna `52` · Data induk · Log aktivitas · Pengingat otomatis.
2. **Header:** "Senin, 5 Oktober 2026 · pukul 17.04" + "Selamat sore, Maya"; kanan: SearchField "Cari pengguna, divisi, proyek", notifikasi.
3. **Hero:** eyebrow "Kepatuhan pelaporan · hari ini"; **"92% laporan harian sudah masuk hari ini."**; pendukung "4 orang belum lapor, n sudah diingatkan. 2 laporan mingguan belum masuk dan 3 permintaan akses menunggu Anda."; tombol primer **"Kirim pengingat ke semua"** (→ "Semua sudah diingatkan"), tautan "Tinjau 3 permintaan akses".
   - `ActivityRings`: **Laporan harian 46/50** · **Laporan mingguan 4/6** · **Akun aktif 50/52**.
   - KPI: Laporan harian masuk (gradient, "rata-rata 10 hari 93%") · Belum lapor 4 (risk) · Permintaan akses 3 (info) · Akun tidak aktif 2 ("dinonaktifkan otomatis").
4. **Kepatuhan laporan per divisi** (lebar penuh): `SegmentedControl` **Harian / Mingguan**. Tabel: Divisi (titik warna, klik → sheet) · Kepala divisi · Kepatuhan (`DivisionBar` dengan "x dari y orang" atau status mingguan) · Status (Lengkap / n belum / Diingatkan; mingguan: Masuk / Terlambat / Belum masuk) · tombol "Ingatkan".
   - Harian: Teknologi 5/6 · Keuangan 8/8 · Media 6/8 · SDM 7/7 · Operasional 15/16 · Hukum 5/5 = 46/50.
   - Mingguan M40: Teknologi, Keuangan, SDM masuk; Media terlambat; Operasional & Hukum belum.
5. **Riwayat kepatuhan harian** (2/3): `Heatmap` 6 divisi × 10 hari, nilai %, nada hijau. **Pengguna per peran** (1/3): `DonutChart` Manajemen 2 · Direktur 3 · Kepala divisi 6 · Admin 2 · PIC proyek 14 · Staf 25 (52).
6. **Permintaan akses** (1/2): `ApprovalItem` — Akun baru Galih Pratama (Operasional, "Peran staf") · Akses baca keuangan untuk auditor eksternal ("30 hari") · Pindah peran Yoga Saputra jadi PIC proyek. Kosong: "Semua permintaan sudah diproses." **Pengingat otomatis** (1/2): 4 sakelar — Pengingat laporan harian (16.30) · Pengingat laporan mingguan (Jumat 13.00) · Eskalasi ke kepala divisi (2 hari tidak lapor) · Ringkasan untuk manajemen (Senin 08.00, bawaan mati).
7. **Data induk:** 5 ubin — Entitas 3 · Divisi 6 · Proyek 24 (18 aktif) · Pengguna 52 (50 aktif) · Template 8.
8. **Log aktivitas** + tombol "Unduh log".

## Sheet divisi
Judul "Divisi Media", "Kepala divisi Lina Marlina"; 2 ubin (Laporan harian x dari y · Laporan mingguan M40 lencana); peta panas 10 hari divisi itu; **Belum lapor hari ini**: avatar, nama, "peran · terakhir lapor …", tombol Ingatkan per orang (→ Diingatkan). Semua lapor: centang "Semua anggota sudah lapor hari ini." Aksi "Hubungi kepala divisi" · "Ingatkan semua".

## Tablet — Ringkasan · Kepatuhan · Akses · Data
Ringkasan: hero + tombol pengingat + KPI + log. Kepatuhan: segmented di kanan judul, kartu divisi 2 kolom (nama, kadiv, lencana, DivisionBar, Detail + Ingatkan), peta panas. Akses: permintaan + sakelar. Data: ubin 3 kolom + donat.

## Ponsel — tab yang sama
Ringkasan: cincin + kalimat + tombol pengingat lebar penuh; 2 KPI; log. Kepatuhan: segmented `full`, daftar divisi (baris = tombol ke detail), peta panas (label 3 huruf). Akses: kartu per permintaan + sakelar. Data: ubin 2 kolom + donat. Detail divisi: layar didorong ("‹ Kepatuhan"), ring persen lapor, peta panas, belum lapor + Ingatkan, tombol menempel "Ingatkan semua".

## Aturan khusus
- Admin tidak menilai isi laporan, hanya kepatuhan. Tidak ada tombol Terima/Revisi di peran ini.
- Pengingat manual dan otomatis memakai teks yang sama dan tercatat di log.
- Sakelar berlaku segera; tampilkan konfirmasi singkat di log ("Maya Lestari mematikan ringkasan untuk manajemen").
- Perubahan peran/akses selalu lewat permintaan yang disetujui, tercatat di log.
- **Tenggat mingguan (diputuskan 6 Okt 2026):** kepala divisi menyerahkan paling lambat **Kamis 17.00 WIB**; minggu **dikunci Jumat 17.00 WIB**. Status mingguan "Terlambat" berarti diserahkan setelah Kamis 17.00. Pengingat otomatis mingguan bawaan (Jumat 13.00) adalah panggilan terakhir sebelum kunci.
- Laporan mingguan yang sudah Admin PT teruskan ke holding dibekukan; koreksi hanya lewat permohonan buka kunci (Admin PT mengajukan, Direksi holding menyetujui, Tim TI menjalankan).

## Data yang dibutuhkan
Per divisi: kadiv, total orang, laporan masuk, daftar belum lapor (nama, peran, terakhir lapor), status mingguan, kepatuhan 10 hari. Permintaan akses. Aturan pengingat. Hitungan data induk. Pengguna per peran. Log.

## Implementasi saat ini (F2-ADMIN, 6 Okt 2026)
Status per butir ada di [docs/fitur/peran-admin.md](../../fitur/peran-admin.md). Ringkasnya:
- Ringkasan Admin (`src/components/admin/admin-summary.tsx`) mengikuti urutan desktop di atas: hero per **orang** dengan "Kirim pengingat ke semua", cincin harian/mingguan/akun aktif, KPI Laporan harian masuk · Belum lapor · Permintaan akses · Akun tidak aktif; kepatuhan per divisi Harian/Mingguan; peta panas 6 divisi × 10 hari; permintaan akses + pengingat otomatis; data induk; log aktivitas + "Unduh log".
- Sheet divisi lengkap: ubin harian & mingguan, peta panas divisi, belum lapor dengan "Ingatkan" per orang, "Hubungi kepala divisi" (mailto/tel), "Ingatkan semua".
- Tab tetap mengikuti `ROLE_TABS`; sidebar khusus Admin (Kepatuhan · Akses · Pengguna · Data induk · Log · Pengingat) dan kolom cari header belum ada.
- **Meja kerja** (`work-desk/admin-desk.tsx`) tetap per **proyek**: lencana baris memakai kosakata laporan (Masuk HH.MM · Terlambat masuk HH.MM · Diingatkan HH.MM · Draf belum dikirim · Belum masuk · Diteruskan), pengingat massal "Ingatkan n PIC", penerusan di Penerimaan. Bila Ringkasan sudah tidak ada yang perlu diingatkan, tombol primer hero menjadi "Teruskan n laporan" atau "Buka meja kerja".
