# Basis data pengembangan lokal

> **Kondisi mesin saat ini, 6 Oktober 2026:** port host **54329 sudah dipakai
> layanan lain**. DB persisten Monitor Karya ada di **54339** dan server utama
> di **3200**; keduanya dipertahankan beserta data pengguna. Perintah naik,
> migrasi, seed, ulang/reset dan buat akun di bawah adalah panduan **setup DB
> baru**, bukan perintah untuk dijalankan kembali pada DB yang sudah ada.
> Jangan menghentikan layanan 54329, reset/seed DB 54339, atau menghentikan 3200.
> CX 14 menggunakan DB terisolasi tersendiri: 54329 hanya di namespace kontainer,
> aplikasi uji 3201/3202; [hasil dan reproduksi](CX14-HASIL.md).


PostgreSQL 17 berjalan lewat `docker-compose.dev.yml`, hanya pada `127.0.0.1:54329`. Volume `postgres_local` menyimpan data dev. Kata sandi dalam compose adalah khusus lokal.

```bash
cp .env.lokal.example .env.lokal
bash scripts/db-lokal.sh naik
bash scripts/db-lokal.sh migrasi
bash scripts/db-lokal.sh seed
```

Skrip tidak membaca `.env` atau mengakses Supabase. Kedua URL harus localhost, port 54329, basis data `monitor_karya_local`; URL jaringan ditolak sebelum operasi apa pun. `turun` mempertahankan volume; `ulang --hapus-data-lokal` menghapus volume dev.

Untuk membuat akun uji, gunakan lingkungan lokal eksplisit:

```bash
DATABASE_URL='postgresql://mk_local:mk_local_dev_only@127.0.0.1:54329/monitor_karya_local?schema=public' \
DIRECT_URL='postgresql://mk_local:mk_local_dev_only@127.0.0.1:54329/monitor_karya_local?schema=public' \
SUPERADMIN_PASSWORD='kata-sandi-lokal-aman' \
npx tsx scripts/buat-superadmin.ts admin
```

Flag `--izinkan-lemah` hanya untuk akun uji lokal. Jalankan server dengan DATABASE_URL dan DIRECT_URL lokal yang sama, AUTH_SECRET acak (`openssl rand -hex 32`), dan `npx next dev -p 3200`. Semua pengujian lokal harus meneruskan URL lokal secara eksplisit agar Prisma tidak memakai `.env` Supabase.

## Bila port 54329 sudah terpakai

Jangan menghentikan atau memigrasi PostgreSQL lain. Pilih port alternatif 54339 secara eksplisit dengan `LOCAL_DB_PORT=54339 bash scripts/db-lokal.sh naik`, lalu gunakan variabel yang sama untuk migrasi dan seed. Bila .env.lokal berisi URL port 54329, ubah kedua URL menjadi 54339 atau berikan keduanya lewat env eksplisit. Compose tetap mengikat hanya loopback. Bawaan tetap 54329; port selain kedua nilai itu ditolak.

## Kompatibilitas migrasi Supabase

Migrasi lama 0006 mengisi metadata `storage.buckets`. Compose memasang SQL inisialisasi yang membuat tabel metadata minimal ini saat volume PostgreSQL pertama kali dibuat. Ini tidak menjalankan API Storage, tidak menyimpan berkas, dan tidak mengubah migrasi. Jika volume dev sudah dibuat dengan compose lama tanpa initializer, buat ulang volume dev dengan `ulang --hapus-data-lokal` sebelum migrasi; hanya data lokal yang dihapus.
