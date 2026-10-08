# Prosedur A2-08 — verifikasi unggah Supabase Storage nyata

Disiapkan Zcode, 8 Oktober 2026. **Prosedur ini untuk pemilik/operator yang memegang kredensial Supabase.** Agen tidak boleh mengakses Supabase, sehingga butir A2-08 tetap `EXTERNAL_PENDING` sampai langkah ini dijalankan dan hasilnya dicatat. Semua langkah memakai proyek Supabase yang Anda otorisasi — hindari proyek produksi bila masih ada pilihan; bila terpaksa memakai bucket produksi, gunakan kunci uji yang jelas dan hapus setelah selesai.

## Prasyarat

1. Bucket privat bernama `evidence` tersedia (nama dikode di `src/lib/storage.ts`, `EVIDENCE_BUCKET`).
2. Nilai dari Dashboard Supabase → Project Settings → API: `NEXT_PUBLIC_SUPABASE_URL` (URL proyek) dan `SUPABASE_SERVICE_ROLE_KEY` (service role; jangan pernah awalan `NEXT_PUBLIC_`).
3. Aplikasi berjalan dengan env itu (`STORAGE_DRIVER=supabase`). Bisa di staging lokal atau VPS; jangan menaruh rahasia di log atau dokumen.

## Langkah uji unggah dan hapus (inti A2-08)

1. Masuk sebagai peran yang boleh mengunggah bukti (mis. PIC proyek atau Admin PT) pada lingkungan uji yang sah.
2. Buka laporan/tugas yang boleh Anda tulis, unggah satu berkas kecil (mis. PNG < 100 KB) sebagai bukti.
3. Verifikasi di aplikasi: bukti tampil, pratinjau terbuka (URL sementara), dan nama berkas benar.
4. Verifikasi di Dashboard Supabase → Storage → `evidence`: objek baru muncul pada kunci yang sesuai.
5. Hapus bukti itu dari aplikasi; pastikan objeknya hilang dari bucket.
6. Ulangi sekali dari peran lain (mis. Admin PT melampirkan bukti persetujuan) bila alur persetujuan dipakai di produksi.

Lulus bila: unggah, baca, dan hapus berhasil tanpa galat 5xx dan objek benar muncul/hilang di bucket.

## Langkah probe readiness (opsional, untuk monitor CX20)

1. Buat objek privat `evidence/_health/readiness.txt` dengan isi **teks persis** `monitor-karya-storage-v1` tanpa newline (Dashboard → Storage → Upload berkas, lalu ganti nama/kunci; atau CLI `supabase`).
2. Setel `OPS_HEALTH_SECRET` (≥32 karakter acak) di env aplikasi, muat ulang.
3. `curl -s -H "Authorization: Bearer $OPS_HEALTH_SECRET" https://<domain>/api/health/internal` → 200 dengan komponen storage `ok`. Tanpa objek ini, readiness tetap 200 `degraded` dan monitor akan gagal — itu memang perilaku CX20, bukan galat.

## Pencatatan

Catat tanggal, lingkungan (proyek Supabase mana), hasil per langkah, dan commit aplikasi yang dipakai — tanpa menyalin kunci. Setelah lulus, ubah baris A2-08 pada SISA-PEKERJAAN bagian A2 dari `EXTERNAL_PENDING` menjadi selesai beserta tanggalnya.

## Batasan

- Probe baca `readiness.txt` tidak membuktikan izin unggah/hapus; itulah mengapa langkah unggah–hapus di atas tetap wajib.
- Uji ini tidak menggantikan uji pemulihan backup dan setup VPS (bagian A3).
