# T9-D2 — UI daftar entri laporan multi-item (web)

Tanggal: 10 Oktober 2026 · Agen: T9-D2 (Zcode) · Zona: `src/components/views/daily-input-view.tsx`, CSS entri di `src/app/css/laporan.css`, mock pratinjau terkait (`src/components/preview/mock-data.ts`, `src/components/preview/mock-laporan.ts`)

Keputusan pemilik 10 Okt 2026: PIC membuka Laporan harian → melihat **daftar entri** hari itu (kartu per entri), tombol "Tambah" untuk entri baru di Sheet, meninjau tiap entri, lalu "Kirim laporan" untuk mengirim semuanya sebagai satu laporan ke Admin PT. API/lib tidak disentuh (agen T9-D1; hasilnya sudah ada di pohon kerja: kolom `achievementToday`/`followUp`/`needsEscalation` di Task + roll-up gabungan).

## 1. Apa yang berubah

`daily-input-view.tsx` ditulis ulang; yang dipertahankan: kerangka lama (DashHeader, SegmentedControl kadens HARIAN/MINGGUAN/BULANAN, Hero dengan kalimat jawaban + tenggat + ring, buka kunci laporan lampau `openDays`/`day`, kartu `DailyReportCard` untuk tab "Hari ini" [F2-PIC], `LockNotice`, `UnlockRequestSheet`, alur `FlowDiagram`). Yang baru menggantikan `ReportForm` + `TaskSection`:

- **`EntryDesk`** — meja entri satu proyek: `LockNotice`, alur, daftar kartu entri, footer kirim, Sheet entri. Dipakai di tiga tempat yang sama dengan formulir lama: kartu proyek tunggal, Sheet proyek (PIC multi-proyek), dan `DailyReportCard`.
- **`EntryCard`** — kartu satu entri (rincian di bawah).
- **`EntrySheet`** — Sheet "Tambah/Ubah entri" (rincian di bawah).
- **`SendBar`** — footer sticky kirim laporan.
- **`EntryEvidence` + `EvidenceThumb` + `useEvidence`** — bukti per entri di kartu.

`TaskSection` tidak lagi diimpor oleh view ini (berkasnya dibiarkan; `pic-desk`/`weekly-task-board` memakai `TaskDialog` langsung).

## 2. Keputusan UX

1. **Entri = task HARIAN hari itu.** Daftar entri dari `GET /api/tasks?projectId=<id>` (tanpa `date` = hari ini menurut server; `&date=YYYY-MM-DD` saat membuka laporan lampau lewat buka kunci — parameter `date` adalah nama parameter sungguhan di rute itu, `workDate` hanya untuk POST). Urutan mengikuti server (sortOrder, jam mulai, waktu buat).
2. **Tambah entri**: tombol "Tambah entri" kecil di kepala daftar (besar `lg` penuh di ponsel saat daftar masih kosong). Entri baru disimpan → **Sheet tetap terbuka**, judul menjadi "Entri tersimpan", bagian Bukti muncul dengan `targetId` dari task hasil POST — sesuai "lampirkan bukti setelah entri disimpan". Mengubah entri → simpan menutup Sheet (pola lama `TaskDialog`).
3. **Ringkasan di footer** (`SendBar`, `position: sticky; bottom: 0`; di dalam Sheet menempel tepi bawah sheet dengan margin negatif pola `mk-sheetactions`; di ponsel dinaikkan sebesar `--tabbar-h` agar tidak tertutup tab bar bawah): "n entri · x selesai · y terkendala" — y = status TERKENDALA **atau** MENUNGGU_KEPUTUSAN (definisi "terhambat" yang sama dengan `TaskSection` lama dan `deriveStatus` roll-up).
4. **Kirim = konfirmasi dulu.** Tombol primer "Kirim laporan ke Admin PT" (menjadi "Kirim ulang laporan" bila sudah terkirim dan belum diteruskan) → dialog `useConfirm` "Kirim n entri sebagai laporan harian?" → `PUT /api/daily-input` `action=submit` → toast + `refreshNavBadges()` + muat ulang. "Simpan draf" (`action=save`) tanpa konfirmasi (bisa dibalik). "Hapus laporan" (destruktif kecil, hanya bila ada draf dan belum diteruskan) tetap ada dengan konfirmasi.
5. **Validasi klien sebelum kirim**: tanpa entri → kedua tombol nonaktif + petunjuk "Tambahkan minimal satu entri…"; laporan tanpa bukti sama sekali (jumlah bukti turunan roll-up dari `GET /api/daily-input`) → tombol kirim nonaktif + petunjuk "Lampirkan minimal 1 bukti pada entri…". Galat server (422/409) tetap tampil sebagai catatan di atas footer; 409 memicu muat ulang agar tampilan ikut terkunci.
6. **Status entri** hanya tiga pilihan (Selesai/Berjalan/Terkendala) sesuai keputusan pemilik; saat mengubah entri lama berstatus Belum mulai/Menunggu keputusan, statusnya ditambahkan sebagai opsi keempat agar tidak berubah diam-diam. Memilih "Selesai" otomatis menaikkan progres ke 100%. "Kendala" (wajib) muncul bila Terkendala; "Rencana besok" wajib bila Terkendala — aturan yang sama dengan validasi server.
7. **Eskalasi** = `SwitchRow` "Butuh eskalasi atau keputusan"; bila aktif (atau status Menunggu keputusan) muncul kolom wajib "Keputusan yang dibutuhkan". Di kartu, entri bersangkutan menampilkan tanda "Butuh eskalasi" (ikon `naik`, warna waspada) di baris lencana.
8. **Bukti kartu**: foto → thumbnail kecil (grid 64px, `loading="lazy"`), klik membuka URL bertanda tangan di tab baru; tautan/berkas → baris teks bergaris bawah. Sumber daftar `GET /api/evidence?targetType=TASK&targetId=<taskId>` per kartu (sesuai spesifikasi); setelah unggah/hapus di Sheet, penanda versi (`evTick`) naik sehingga semua thumbnail dimuat ulang.
9. **Round-trip kolom task yang tidak ada di Sheet**: PUT mengirim ulang `tags`, `urgency`, `picUserId`, jam mulai/selesai (`HH:MM` WIB), dan subtask entri agar entri yang dibuat/diubah dari Meja kerja/Papan mingguan tidak kehilangan data (pola `putTask` di `TaskSection` lama). Rute D1 juga mempertahankan kolom narasi bila body tidak memuat kuncinya.

## 3. Pemetaan field ke UI

| Field (D1) | Kartu entri | Sheet entri | Gabungan ke laporan (PUT /api/daily-input) |
| --- | --- | --- | --- |
| `title` | Baris atas: judul (dicoret bila Selesai) | "Judul entri" (wajib) | — |
| `description` | Teks kaki 2 baris (fallback bila tanpa narasi) | "Deskripsi" (opsional) | — |
| `picName` | "Siapa": Avatar inisial + nama | "Nama pelaksana", bawaan nama PIC yang login (`useApp().user.name`) | — |
| `achievementToday` | Teks "bagaimana" di bawah pelaksana | "Hasil hari ini" (2 baris) | Digabung `' | '`; bila semua kosong → ringkasan ringkas "Selesai: …; Berjalan: … (n%)" (rumus `composeAchievement` roll-up) sebagai `achievementToday` |
| `status` | `StatusBadge` (peta `TASK_STATUS_META`) + warna garis kiri kartu | Pilihan "Status" (Selesai/Berjalan/Terkendala) | Dihitung server dari entri (roll-up); body tidak mengirim status manual |
| `progressPct` | `ProgressBar` | Slider + kotak angka | Dihitung server (rata-rata entri) |
| `needsEscalation` | Ikon + kata "Butuh eskalasi" | Sakelar "Butuh eskalasi atau keputusan" | Roll-up server → `needsEscalation` laporan |
| `decisionNeeded` | — (hanya lewat Sheet; kartu menampilkan tanda eskalasi) | "Keputusan yang dibutuhkan" (wajib bila eskalasi aktif) | Digabung ke `obstacle` laporan sebagai "judul: catatan" |
| `obstacle` | — (kartu lama menampilkannya; kini narasi di `achievementToday`, kendala ikut ke gabungan laporan) | "Kendala" (wajib bila Terkendala) | Digabung ke `obstacle` laporan |
| `followUp` | Kaki miring "Rencana besok: …" | "Rencana besok" (2 baris; wajib bila Terkendala) | Digabung `' | '` sebagai `followUp` laporan |
| bukti (`targetType=TASK`) | Thumbnail/teks dari `/api/evidence` | `EvidencePanel` (unggah berkas/tautan) setelah entri tersimpan | Jumlah dihitung server ke `evidenceCount` laporan |

## 4. CSS (laporan.css, semua nilai token)

`.mk-lap-entry__who/__text/__fu`, `.mk-lap-esc`, `.mk-lap-thumbs--sm`, `.mk-lap-entry__link`, `.mk-lap-send[__bar/__sum]` (+ varian dalam `.mk-sheet` dan offset tab bar ponsel). Footer memakai gradasi transparan→`--surface` seperti `mk-sheetactions`; tanpa bayangan buatan sendiri.

## 5. Mock pratinjau

- `mock-data.ts` — entri contoh PIC (p2, p4) kini membawa `achievementToday`/`followUp`; entri "Uji coba gelombang 2" juga `needsEscalation` + `decisionNeeded` sehingga kartu, tanda eskalasi, dan footer "3 entri · 2 selesai · 1 terkendala" terlihat di `/pratinjau?peran=PIC_PROYEK`. `mock-pic.ts` sendiri tidak menyimpan data task (tugas contohnya di `mock-data.ts`), jadi tidak diubah.
- `mock-laporan.ts` (rute pratinjau `/api/tasks`) — `readTask`/`mkTask`/tipe `TaskRow` mengenali ketiga kolom baru agar tambah/ubah entri di pratinjau menyimpannya, meniru persis `readBody` D1. Tidak menyentuh `/api/daily-input` mock (sudah memakai gabungan dari body).

## 6. Verifikasi

- `DATABASE_URL=… npx tsc --noEmit --incremental false` → 0 galat.
- `npx eslint` untuk tiga berkas yang diubah → bersih.
- Server dev (port 3200, tanpa DB) mengompilasi `GET /pratinjau?peran=PIC_PROYEK` → 200 tanpa galat render (browser interaktif tidak tersedia di lingkungan subagen; uji klik tambah/ubah/kirim silakan lewat `/pratinjau?peran=PIC_PROYEK` → tab Laporan harian).
- Tanpa git/DB/gradle; tidak menyentuh `src/app/api/**`, `src/lib/**`, `prisma/**` (zona D1).

## 7. Catatan lanjutan

- `docs/design/peran/05-pic-proyek.md` bagian "Implementasi saat ini" belum mencatat layar entri baru (di luar zona saya) — butir ini perlu diperbarui saat spesifikasi peran direfresh.
- Kartu entri tidak lagi menampilkan kotak centang "tandai selesai" dari `TaskSection` (mengubah status lewat Sheet sesuai keputusan pemilik); centang cepat masih tersedia di Meja kerja PIC.
- Skema `Entry` di view menandai ketiga kolom D1 opsional (`?`) sehingga UI tetap aman membaca task lama sebelum migrasi 0031 dijalankan.
