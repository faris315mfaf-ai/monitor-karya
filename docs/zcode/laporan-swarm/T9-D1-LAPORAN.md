# T9-D1 — Model data + API untuk entri laporan multi-item

Tanggal: 10 Oktober 2026 · Agen: T9-D1 (Zcode) · Zona: `prisma/schema.prisma`, `prisma/migrations/0031_task_entry_fields/`, `src/app/api/tasks/route.ts`, `src/lib/daily-rollup.ts`

Keputusan pemilik 10 Okt 2026: PIC melaporkan beberapa entri per hari (apa, siapa, bagaimana, eskalasi, rencana besok, bukti), review, lalu kirim sebagai SATU laporan harian ke Admin PT. Tugas ini menambah kolom per-entri di Task dan menggabungkannya di roll-up laporan harian. Tanpa git/jaringan/DB — migrasi hanya berkas SQL, tidak dieksekusi.

## 1. Schema + migrasi 0031

`prisma/schema.prisma` — model `Task` bertiga kolom baru (setelah `decisionNeeded`), kolom lama tidak disentuh:

- `achievementToday String?` — bagaimana pengerjaannya, narasi hasil entri ini.
- `followUp String?` — rencana besok untuk entri ini.
- `needsEscalation Boolean @default(false)` — entri ini butuh eskalasi/keputusan, terlepas dari status task.

`prisma/migrations/0031_task_entry_fields/migration.sql` — `ALTER TABLE "Task" ADD COLUMN` untuk ketiganya (`TEXT`, `TEXT`, `BOOLEAN NOT NULL DEFAULT false`), gaya mengikuti 0010. Belum dijalankan ke DB mana pun (aturan: migrasi diuji lokal oleh manusia).

## 2. Tasks API (`src/app/api/tasks/route.ts`)

- `readBody` sekarang mem-parse `achievementToday` (maks 4000, sama dengan batas laporan harian), `followUp` (maks 2000), dan `needsEscalation` (`body.needsEscalation === true`). Karena `readBody` dipakai POST maupun PUT dan hasilnya di-spread ke `data`, kedua handler menerima field baru tanpa perubahan alur lain.
- PUT: ketiga kolom mengikuti pola `picUserId` yang sudah ada — bila body TIDAK memuat kuncinya, nilai lama dipertahankan (dialog lama yang belum mengirim field ini tidak menghapus narasi entri); mengirim nilai kosong/`false` tetap membersihkannya.
- GET tidak perlu ubah: baris task dikembalikan utuh (semua kolom skalar), jadi field baru otomatis sampai ke klien.

## 3. Roll-up (`src/lib/daily-rollup.ts`)

`computeRollup` kini mem-select ketiga kolom baru dan:

- `achievement` — narasi `achievementToday` semua task non-null digabung dengan pemisah `' | '` (pemisah yang sama dengan kendala); bila tidak ada satupun narasi entri, kembali ke `composeAchievement` ringkas lama.
- `followUp` (kolom baru di tipe `Rollup`) — gabungan `followUp` task yang non-null dengan pemisah yang sama; null bila kosong semua.
- `needsEscalation` — kini `true` bila status turunan TERKENDALA/MENUNGGU_KEPUTUSAN **atau** ada task yang menandai `needsEscalation` sendiri.

`rollupDailyReport` menulis `followUp` ke laporan harian dengan aturan yang sama dengan capaian/kendala: hanya mengisi bila PIC belum menulis versi manualnya di level laporan (`existing?.followUp?.trim()` dipertahankan). PUT `/api/daily-input` tidak diubah — setelah menyimpan, ia sudah memanggil `rollupDailyReport`, jadi nilai gabungan menimpa nilai turunan-status yang dihitungnya sendiri.

## 4. Evidence `targetType='TASK'`

Sudah ada: `EVIDENCE_TARGETS` di `src/lib/evidence-access.ts` memuat `'TASK'`, lengkap dengan resolusi kunci per-scope (HARIAN ikut gerbang laporan harian, MINGGUAN ikut kunci jam kerja). Tidak ada perubahan.

## 5. Verifikasi

- `npx prisma generate` sukses (klien lokal diregenerasi; tanpa koneksi DB).
- `DATABASE_URL=postgresql://x:y@127.0.0.1:1/db npx tsc --noEmit --incremental false` → 0 galat.

## 6. Catatan untuk agen lain

- T9-D2 (UI): field kirim ke POST/PUT `/api/tasks` bernama persis `achievementToday`, `followUp`, `needsEscalation`. PUT yang tidak memuat kunci field mempertahankan nilai lama.
- Pemilik DB: jalankan `prisma/migrations/0031_task_entry_fields/migration.sql` di DB lokal untuk menguji (aturan: jangan sentuh Supabase).
- Laporan harian (`DailyProjectReport`) tidak berubah skemanya; penggabungan terjadi di roll-up.
