# Monitor Karya

Aplikasi pemantauan laporan harian proyek dan capaian mingguan divisi pada grup
perusahaan: holding → PT → divisi → proyek. Sembilan peran, UI Bahasa Indonesia,
sistem desain MK, serta pengajuan, persetujuan, buka kunci dan Urungkan.

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Prisma 6/PostgreSQL.
Bukti memakai Supabase Storage secara bawaan; S3/MinIO opsional. Autentikasi
memakai scrypt dan cookie sesi bertanda tangan. Sasaran deploy adalah **VPS**;
[panduan operator](deploy/README.md).

## Keadaan pemeriksaan lokal

Pada 6 Oktober 2026: **63 berkas/1.192 tes lolos**, dan E2E HTTP/PostgreSQL lokal
**11 pemeriksaan sebelum + 3 sesudah 17.00 WIB lolos**. Empat laporan disimpan di
[CX 14](docs/codex/CX14-HASIL.md). Cleanup dependencies aktual 67 → 20; manifest
saat ini berisi 12 devDependencies. [Hasil CX 8–15](docs/codex/CX8–15-HASIL.md)
memuat build/runtime runner final, bukti UI dan batas pemeriksaan.

Hasil lokal tidak membuktikan Supabase Storage nyata atau rilis VPS. Migrasi
0026 dan total 23 migrasi hanya diuji di PostgreSQL lokal terisolasi. Audit
dependensi final masih mencatat 9 paket terdampak high dan 0 critical; tindak
lanjutnya ada di [backlog keamanan](docs/SISA-PEKERJAAN.md).

## Menjalankan

Node sesuai `package.json#engines`: `^22.12.0 || ^24.0.0 || >=26.0.0`.
Gunakan **npm 11.19.1** untuk konfigurasi `allowScripts` yang diperiksa.
Pada mesin baru, pilih versi Node yang didukung, lalu:

```bash
npm install --global npm@11.19.1
npm --version            # harus 11.19.1
npm ci
cp .env.example .env     # isi hanya konfigurasi lokal Anda
```

Next memakai `.env`, tetapi `prisma.config.ts` memakai variabel lingkungan
**eksplisit**; CLI Prisma tidak otomatis memuat `.env`. Sebelum `prisma generate`,
validate atau migrasi, ekspor target lokal pada shell yang sama. Ganti placeholder
di bawah dengan konfigurasi lokal Anda, tanpa mencatat kredensial di repo:

```bash
export DATABASE_URL='<URL PostgreSQL lokal Anda>'
export DIRECT_URL='<URL langsung PostgreSQL lokal Anda>'
npx prisma generate
```

Panduan DB lokal: [docs/codex/db-lokal.md](docs/codex/db-lokal.md). Jangan menaruh
kata sandi, token, atau URL DB sungguhan di repositori. Prosedur ini tidak memberi
izin migrasi/seed produksi atau reset DB persisten lokal.

- `npm run dev`: pengembangan, port bawaan 3000.
- `npm test`: Vitest; `npm run build`: generate Prisma dan Next build.
- `npm run test:e2e:local`: harness HTTP lokal; gunakan persiapan/lingkungan
  terisolasi sesuai laporan CX 14, bukan basis data produksi.
- `/pratinjau?peran=PIC_PROYEK`: contoh tanpa DB, hanya pengembangan. Peran lain:
  KEPALA_DIVISI, ADMIN_PT, DIREKTUR_ENTITAS, DIREKTUR_SDM_GA, MANAJEMEN, TI,
  AUDITOR, SUPERADMIN. Pratinjau 404 di produksi.

Worktree Codex memakai server 3200 dan DB persisten 54339 yang dipertahankan.
Jangan seed/reset DB itu atau menghentikan server tersebut untuk menjalankan
pemeriksaan. Skrip seed/kata sandi/SQL memiliki guard lokal; pengujian tetap
memakai lingkungan terisolasi.

## Rujukan

- [Dokumentasi fitur dan peran](docs/fitur/README.md).
- [Desain](DESIGN.md), [panduan agen](AGENTS.md), [koordinasi](docs/KOORDINASI-AGEN.md).
- [Serah terima](docs/SERAH-TERIMA-CODEX.md), [sisa pekerjaan](docs/SISA-PEKERJAAN.md).
- [Laporan hasil CX](docs/codex/README.md).

Keputusan tab Log Direktur entitas menunggu pemilik. Verifikasi unggah Supabase
nyata dan rilis/migrasi/penjadwal VPS berada di luar hasil tugas lokal ini.

Tiga kategori sisa yang disebut laporan CX adalah batas lingkup putaran lokal,
bukan seluruh backlog: [SISA-PEKERJAAN](docs/SISA-PEKERJAAN.md) tetap memuat
keputusan produk, QA manual, UI dan infrastruktur global yang belum selesai.
