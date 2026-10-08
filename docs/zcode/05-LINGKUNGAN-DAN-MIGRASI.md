# Pindah ke Zcode dan menjalankan lokal

## Pada mesin yang sama

Buka folder **`/Users/godam/PROYEK/monitor-karya-codex`** di Zcode. Mulai dengan prompt pada [dokumen 09](09-PROMPT-ZCODE.md). Tidak diperlukan ekspor chat atau perubahan nama folder agar kode dapat dilanjutkan. Cara UI/konfigurasi khusus Zcode tidak diasumsikan; bila tidak membaca AGENTS otomatis, berikan prompt secara manual.

Periksa tanpa mengubah data:

```bash
pwd
git branch --show-current
git status --short
git log -5 --oneline
git worktree list
```

Basis sebelum paket dokumentasi: `4117a25`. Commit dokumentasi setelahnya wajar. Worktree utama saat pemeriksaan berada pada `89766df`; jangan menganggap kedua folder sudah sama.

## Port dan layanan

| Lokasi | Fungsi / batas |
|---|---|
| localhost:3200 | Server dev pengguna pada worktree terbaru; periksa dahulu, jangan menyalakan dua server di port yang sama |
| localhost:3100 | Alokasi historis Claude; bukan lokasi kode terbaru |
| 127.0.0.1:54339 | PostgreSQL persisten pengguna; jangan reset/seed/hapus volume |
| 54329 | Pada host pernah dipakai layanan lain; default compose tidak berarti aman dipakai |
| 127.0.0.1:54349 | DB fixture terisolasi CX16; jangan tertukar dengan 54339 |
| 127.0.0.1:3211 | Aplikasi fixture CX16; bukan aplikasi pengguna |

Status hidup layanan harus diperiksa saat sesi baru. Catatan server 3200 berfungsi dan kontainer tes dihentikan berasal dari penutupan 7 Oktober, bukan pemeriksaan runtime baru 8 Oktober. Nama DB persisten `monitor-karya-dev-postgres-1`; nama volume/proyek harus diverifikasi sebelum perintah Docker.

## Instalasi bila diperlukan

Gunakan Node **22.23.3**, npm **11.19.1** seperti CI, Python 3.12 untuk verifikasi patch, Docker untuk DB/image. Jangan jalankan instalasi ulang bila dependensi sudah baik dan tugas tidak memerlukannya.

```bash
python3 vendor/braces/verify.py
npm ci --no-audit --no-fund
```

`prisma generate` memerlukan DATABASE_URL dan DIRECT_URL eksplisit; untuk generate/build tanpa data gunakan URL loopback tiruan port1 sebagaimana CI. Untuk dev gunakan URL lokal yang benar dan rahasia privat. Setelah lingkungan lokal telah diverifikasi dan port 3200 kosong:

```bash
npx prisma generate
npx next dev --hostname 127.0.0.1 -p 3200
```

`npm run dev` bawaan port3000, jadi bukan perintah port 3200. Jangan menganggap skrip `mulai-codex.sh` otomatis memulihkan env privat atau merupakan launcher Zcode.

## Kredensial dan berkas di luar Git

Jangan menyalin `.env` atau rahasia ke paket Markdown. Env runtime dan dump database berada di luar Git dan bukan artefak publik. Catatan sesi sebelumnya: `/private/tmp/mk-cx16-dev.env` dan `/private/tmp/mk-before-cx16-local.dump` (berkas privat 0600). Keberadaan/validitasnya tidak dijamin karena direktori sementara dapat dibersihkan. Jangan mencetak isinya. Inventaris nama variabel ada pada dokumen 10; nilainya disediakan pemilik melalui sarana privat.

Kata sandi akun tidak tercatat di repo. Jangan mereset semua kata sandi untuk mempermudah onboarding. DB lokal sebelumnya berisi 97 akun/40 proyek/741 laporan, bukan DB kosong untuk seed ulang. Angka itu snapshot, bukan nilai yang harus dipaksakan.

## Bila pindah mesin

1. Simpan semua perubahan sumber/dokumen melalui commit lokal; catat cabang dan HEAD.
2. Pindahkan riwayat Git beserta cabang terbaru, atau checkout lengkap melalui media privat yang dipilih pemilik. **Jangan hanya menyalin folder linked worktree**: berkas `.git` menunjuk ke metadata di repo utama dan akan rusak bila induknya hilang.
3. Sebagai opsi manual transfer offline, buat `git bundle` cabang terbaru setelah meninjau riwayat agar tidak membawa rahasia. Bundle tidak mencakup perubahan belum commit, env, database, dependensi terpasang, atau Docker volume. Pembuatan/transfer bundle belum dilakukan dalam tugas dokumentasi ini.
4. Pulihkan clone/repo mandiri dan checkout cabang terbaru pada mesin tujuan; pastikan `vendor/braces` lengkap sebelum `npm ci`.
5. Siapkan env privat dan PostgreSQL lokal terpisah. Data pengguna dipindah dengan backup/restore yang diverifikasi, bukan seed. Pastikan tujuan restore benar-benar database baru yang boleh ditimpa.
6. Jalankan gerbang pengujian dan verifikasi login/alur sebelum menganggap perpindahan selesai. Perubahan AUTH_SECRET membuat sesi lama tidak sah.

Jangan memakai push publik sebagai jalan pintas pemindahan tanpa otorisasi. Dokumentasi ini tidak memberi izin akses produksi atau menghapus data mesin lama.
