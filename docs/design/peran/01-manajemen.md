# 01 · Manajemen

**Siapa:** pimpinan puncak (contoh: Ris). Melihat seluruh perusahaan: 3 entitas, 6 divisi, 24 proyek, 50 orang.
**Pertanyaan utama:** Bagaimana keadaan perusahaan? Apa yang harus saya putuskan hari ini?
**Papan kanvas:** halaman "2 · Manajemen" — `DManajemen`, `TManajemen`, `TManajemenProyek`, `PManajemen`, `PManajemenProyek`, `PManajemenDetail`, `PManajemenSetuju`; versi malam di halaman 7.

> **Keputusan pemilik, 8 Oktober 2026** — layar Ringkasan Manajemen (`ManagementDashboard`, dipakai peran grup MANAJEMEN, DIREKTUR_SDM_GA, TI, SUPERADMIN, AUDITOR):
> - **Dihapus:** kartu "Output selesai" (`BarChart` + `StatTile`), "Kapan proyek prioritas selesai?" (`Timeline`), "Status N proyek" (`DonutChart`), "Perlu perhatian" (`AttentionItem`), "Persetujuan menunggu/Keputusan terbuka" (`ApprovalItem` + `StatTile`), "Aktivitas terbaru" (`ActivityItem`).
> - **Dipertahankan:** hero (kalimat + `ActivityRings`) dan `StatTile` lain (Rata-rata progres, Kehadiran).
> - **Wajib baru:** bagian "Laporan per perusahaan" — kartu per PT → Sheet perusahaan berisi daftar proyek → Sheet proyek berisi laporan harian (selesai/dikerjakan/belum) + bagian perlu perhatian/eskalasi dari data eskalasi. Contoh pemilik: satu PT dengan proyek "SIM RS", "MEDCREATIX", "MEDPAY".
>
> Butir lama di bawah yang terdampak ditandai "dihapus 8 Okt" tanpa dibuang dari riwayat. Urutan desktop yang berlaku: Header → Kartu ringkasan → Laporan per perusahaan → Proyek prioritas/Kinerja divisi (dahulu Baris 3) → Kehadiran hari ini. Implementasinya dikerjakan swarm Tahap 3: [HASIL-TAHAP3-DASH-MANAJEMEN](../../zcode/HASIL-TAHAP3-DASH-MANAJEMEN.md).

## Desktop — urutan dari atas

### Sidebar
Logo + "Monitor Karya" + "Manajemen · 3 entitas". Nav: Ringkasan · Proyek `24` · Tim & divisi · Persetujuan `n` (aksen) · Aktivitas · Kehadiran. Panel Tampilan (AccentPicker + Terang/Gelap). Profil.

### Header
"Senin, 5 Oktober 2026 · Minggu ke-41" + **"Selamat sore, Ris"**. Kanan: SearchField (⌘K), `SegmentedControl` periode **Minggu / Bulan / Kuartal**, IconButton notifikasi dengan badge.

### Kartu ringkasan (hero aurora)
- Eyebrow: "Status hari ini".
- Kalimat: **"18 dari 24 proyek berjalan sesuai rencana."**
- Pendukung: jumlah perlu perhatian & terlambat + persetujuan yang menunggu.
- Tombol primer **"Tinjau yang mendesak"** (membuka detail proyek terlambat), tautan "Lihat semua proyek".
- `ActivityRings` 176: **Output 88%** (merah) · **Laporan harian 92%** (hijau) · **Tepat waktu 75%** (biru).
- `StatTile` — semula 4, per 8 Okt tersisa 2: ~~Output selesai (gradient, ikut periode, sparkline)~~ · **Rata-rata progres 68% (+4 poin)** · ~~Persetujuan menunggu `n` (tone risk, "1 lewat 24 jam")~~ · **Kehadiran 92%** (46 dari 50).

### Laporan per perusahaan (wajib — keputusan pemilik 8 Okt 2026)
- Kartu satu per PT dalam cakupan akun — contoh pemilik: satu PT memuat proyek "SIM RS", "MEDCREATIX", "MEDPAY".
- Kartu PT menampilkan nama PT beserta ringkasan proyeknya (jumlah proyek, status); klik kartu → **Sheet perusahaan**.
- Sheet perusahaan berisi daftar proyek PT itu (nama · PIC · progres · `StatusBadge`); klik proyek → **Sheet proyek** ditumpuk di atasnya.
- Sheet proyek berisi laporan harian terbagi **Selesai · Dikerjakan · Belum** dan bagian **Perlu perhatian/eskalasi** yang dibangun dari data eskalasi proyek (status, kebutuhan, umur/SLA).
- Semua detail dibuka di Sheet, tidak pindah halaman.

### Baris 1 — dihapus pemilik 8 Okt 2026 (riwayat)
- **Output selesai** (2/3): `BarChart` 8 batang (M34–M41 / Apr–Sep / K4'25–K3), angka besar di kanan atas mengikuti batang terpilih, subjudul "8 minggu terakhir".
- **Perlu perhatian** (1/3): 3 `AttentionItem` — Kampanye Media Oktober (Terlambat, "Materi video belum disetujui", lewat 5 hari) · Peluncuran Aplikasi Absensi (Perlu perhatian, "Uji coba mundur 4 hari") · Renovasi Ruang IT (Perlu perhatian, "Vendor belum konfirmasi").

### Baris 2 — dihapus pemilik 8 Okt 2026 (riwayat)
- **"Kapan proyek prioritas selesai?"** (2/3): `Timeline` 8 proyek, rentang 28 Sep–16 Nov (51 hari), tick mingguan, garis Hari ini, klik baris → detail.
- **"Status 24 proyek"** (1/3): `DonutChart` Sesuai jadwal 18 · Perlu perhatian 4 · Terlambat 2. Klik segmen = menyaring tabel proyek.

### Baris 3 (kini mengikuti Laporan per perusahaan)
- **Proyek prioritas** (2/3): `Chip` Semua 8 · Sesuai jadwal · Perlu perhatian · Terlambat; tabel `ProjectRow` (Proyek+divisi · PIC · Progres · Tenggat · Status).
- **Kinerja divisi** (1/3): `DivisionBar` tepat waktu per divisi, target 85%: Keuangan 94 · Hukum 91 · Teknologi 82 · SDM 78 · Operasional 69 · Media 61, dengan "x dari y output".

### Baris 4 — dua kartu dihapus pemilik 8 Okt 2026
- **Persetujuan menunggu** — dihapus 8 Okt (riwayat): 5 `ApprovalItem` (materi video, revisi anggaran Rp 48,5 jt, draf kontrak, laporan mingguan Teknologi, cuti 3 hari). Setujui/Tolak di tempat; badge nav & KPI berkurang. Kosong: "Semua persetujuan sudah beres." Persetujuan tetap diakses lewat nav/tab Persetujuan.
- **Aktivitas terbaru** — dihapus 8 Okt (riwayat): 5 `ActivityItem`.
- **Kehadiran hari ini** (dipertahankan): 92% besar, batang bertumpuk Hadir 44 / Terlambat 2 / Izin-cuti 4.

### Detail proyek (Sheet samping 440)
Judul proyek, "Divisi · PIC", `StatusBadge`; `ProgressRing` + "x dari y output" + tenggat; laporan harian terakhir; tahapan (4 langkah); catatan terakhir PIC. Tombol: "Kirim catatan" · "Setujui laporan"/"Tandai sudah ditinjau".

## Tablet — tab Ringkasan · Proyek · Persetujuan · Tim
- **Ringkasan:** hero (kalimat + cincin), 2 KPI sebaris (semula 4; Output selesai & Persetujuan menunggu dihapus 8 Okt), Laporan per perusahaan (kartu PT menggulir mendatar), Kinerja divisi. ~~Output selesai lebar penuh dengan segmented~~ dan ~~Perlu perhatian~~ dihapus 8 Okt.
- **Proyek:** chip saringan + kartu proyek 2 kolom (nama, divisi, status, ProgressBar, PIC, tenggat). Ketuk → form sheet detail.
- **Persetujuan:** daftar `ApprovalItem size="md"`.
- **Tim:** Kinerja divisi, Kehadiran; ~~Aktivitas~~ (kartu Aktivitas terbaru dihapus 8 Okt).

## Ponsel — tab yang sama
- **Ringkasan:** cincin 96 + kalimat + legenda angka, tombol "Tinjau yang mendesak" lebar penuh; 2 KPI bertumpuk (semula 2×2); Laporan per perusahaan (kartu PT digulir); Kinerja divisi. ~~Output selesai (segmented `full`)~~ dan ~~Perlu perhatian~~ dihapus 8 Okt.
- **Proyek:** SearchField, chip digulir, `ProjectRow compact`.
- **Persetujuan:** satu kartu per permintaan; kosong "Semua persetujuan sudah beres."
- **Tim:** Kehadiran hari ini, Kinerja divisi; ~~Aktivitas terbaru~~ dihapus 8 Okt.
- **Detail:** layar didorong — lencana, nama, "Divisi · PIC", progres 44 + ProgressBar `lg`, ubin Tenggat & Laporan harian, catatan PIC; tombol menempel "Catatan" · "Sudah ditinjau".

## Interaksi
| Aksi | Hasil |
| --- | --- |
| ~~Ganti periode~~ | ~~BarChart, KPI Output, subjudul ikut; batang tumbuh dari nilai lama~~ — dihapus 8 Okt bersama kartu Output selesai |
| ~~Klik batang~~ | ~~Angka besar berganti ke periode itu~~ — dihapus 8 Okt |
| ~~Klik segmen donat~~ / klik chip | ~~Tabel tersaring; chip & donat sinkron~~ — donat dihapus 8 Okt; klik chip tetap menyaring tabel proyek |
| Klik baris tabel / ~~timeline~~ / ~~perlu perhatian~~ | Sheet detail; baris terpilih disorot — timeline & perlu perhatian dihapus 8 Okt, klik baris tabel tetap membuka Sheet detail |
| Klik kartu PT | Sheet perusahaan berisi daftar proyek PT itu |
| Klik proyek di Sheet perusahaan | Sheet proyek: laporan harian selesai/dikerjakan/belum + perlu perhatian/eskalasi |
| Setujui/Tolak | ~~Baris meredup + lencana; badge nav, KPI, sparkline persetujuan berkurang~~ — kartu & KPI persetujuan di Ringkasan dihapus 8 Okt; baris & badge nav tetap berlaku di tab Persetujuan |
| Ganti aksen/tema | Seluruh UI berganti `dur-base` |

## Data yang dibutuhkan
Proyek (id, nama, divisi, PIC, progres, output selesai/total, mulai, tenggat, status, alasan, catatan terakhir, status laporan harian), agregat output per periode, kinerja divisi (persen + x/y), persetujuan (judul, pengaju, waktu, nominal opsional), aktivitas, kehadiran (hadir/terlambat/izin).

Tambahan 8 Okt untuk "Laporan per perusahaan": daftar PT dalam cakupan beserta proyeknya, isi laporan harian per proyek (selesai/dikerjakan/belum), dan eskalasi aktif per proyek (status, kebutuhan, umur/SLA). Agregat output per periode, persetujuan, dan aktivitas tetap dibutuhkan nav/tab di luar Ringkasan.

## Implementasi saat ini (6 Okt 2026, F2)
Status per butir: [`docs/fitur/peran-direktur-manajemen.md`](../../fitur/peran-direktur-manajemen.md).
- **Tab** (`ROLE_TABS`): Ringkasan · Eskalasi · Proyek · Tim & divisi · Persetujuan `n` · Entitas · Log aktivitas. Tablet & ponsel: Ringkasan · Proyek · Persetujuan · Tim, sisanya di "Lainnya". Aktivitas dan kehadiran tampil sebagai kartu di Ringkasan.
- **Persetujuan menunggu** berisi permintaan materi, anggaran, dan cuti (`ApprovalRequest`, diajukan kepala divisi/PIC), pengajuan proyek, usulan tenggat, dan eskalasi. Kontrak diajukan sebagai Materi.
- **Kehadiran** dihitung dari data kehadiran kepala divisi (Hadir/Terlambat/Cuti/Sakit/Izin); Terlambat dihitung hadir dan tampil terpisah di batang bertumpuk.
- **Output selesai** jatuh kembali ke jumlah laporan harian bila belum ada output; KPI keempat menjadi "Tepat waktu 30 hari" bila data kehadiran belum ada.
- **Kinerja divisi** menggabungkan divisi bernama sama lintas PT; warnanya dari nama divisi (`src/lib/division-tone.ts`). Bila belum ada data divisi, kartu berganti "Tepat waktu per perusahaan".
- **Detail proyek**: tahapan bertanggal dari `ProjectStage`, "Kirim catatan ke PIC", dan "Tandai sudah ditinjau" (Urungkan 15 menit). "Setujui laporan" tidak ada karena laporan harian dikirim PIC langsung ke Admin PT.
- **Pencarian header** ⌘K/Ctrl+K mencari proyek, divisi, orang, dan laporan mingguan dalam cakupan akun. Badge nav: Persetujuan `n` dan Eskalasi `n`.
- **Keputusan pemilik 8 Okt 2026** (blok catatan di atas) diterapkan swarm Tahap 3; konsolidasinya di [`docs/zcode/HASIL-TAHAP3-DASH-MANAJEMEN.md`](../../zcode/HASIL-TAHAP3-DASH-MANAJEMEN.md). Bagian di atas ini (6 Okt) tetap sebagai catatan keadaan sebelum keputusan.
