# MonitorKarya

Sistem pemantauan bisnis holding **PT. BIKE Tbk** dan delapan anak perusahaannya:
laporan harian proyek, capaian mingguan divisi, pengajuan & persetujuan proyek
berantai, eskalasi, serta meja Super Admin untuk perusahaan dan akun.

Produksi: <https://monitor-karya.vercel.app>

## Tumpukan teknologi

| Bagian | Dipakai |
|---|---|
| Kerangka | Next.js 16 (App Router), React 19, TypeScript |
| Tampilan | Tailwind CSS 4, shadcn/ui (Radix), framer-motion, lucide-react |
| Basis data | PostgreSQL di Supabase, diakses lewat Prisma 6 |
| Berkas bukti | Supabase Storage (bucket privat, URL bertanda tangan 5 menit) |
| Masuk | Autentikasi sendiri: scrypt + cookie bertanda HMAC (bukan Supabase Auth) |
| Penempatan | Vercel (cron harian untuk pengingat) |

## Menyiapkan di mesin baru (macOS maupun Windows)

Prasyarat: **Node.js 20 atau lebih baru** (dikembangkan dengan 24) dan **git**.
Di macOS cukup `brew install node git`.

```bash
git clone <URL repositori ini>
cd monitor-karya
npm install
cp .env.example .env     # lalu isi nilainya, lihat bagian di bawah
npx prisma generate
npm run dev              # http://localhost:3000
```

Perintah lain yang sering dipakai:

| Perintah | Kegunaan |
|---|---|
| `npm run build` | Build produksi (menjalankan `prisma generate` lebih dulu) |
| `npm run lint` | ESLint untuk seluruh repositori |
| `npm run db:migrate:deploy` | Terapkan migrasi Prisma ke basis data |
| `npm run db:seed:sql` | Isi struktur awal: perusahaan, divisi, proyek, akun |
| `npm run db:passwords -- --all` | Setel kata sandi akun contoh (`SEED_PASSWORD`) |
| `npm run db:studio` | Prisma Studio |

### Berkas `.env` tidak ikut di repositori

`.env` sengaja diabaikan git supaya kredensial tidak tersebar. Salin
`.env.example` menjadi `.env`, lalu isi nilainya dari **Supabase Dashboard →
Project Settings** dan dari catatan Anda sendiri:

| Variabel | Dari mana |
|---|---|
| `DATABASE_URL` | Supabase → Database → Connection string (pooler, port 6543) |
| `DIRECT_URL` | Sama, tetapi koneksi langsung port 5432 (dipakai migrasi) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → `service_role` (rahasia) |
| `AUTH_SECRET` | Acak panjang, mis. `openssl rand -base64 32` |
| `CRON_SECRET` | Acak panjang; harus sama dengan yang ada di Vercel |
| `SEED_PASSWORD` | Kata sandi awal akun contoh |

Cara paling aman memindahkannya dari laptop lama: buka `.env` di mesin lama,
salin isinya lewat pengelola kata sandi atau catatan terenkripsi, lalu tempel di
mesin baru. Jangan mengirimnya lewat chat, email, atau commit.

Langkah lengkap beserta penjelasan tiap bagian ada di
[SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Peran & modul

| Peran | Yang dikerjakan |
|---|---|
| Manager / PIC Proyek | Task dan laporan harian proyek yang dipegang |
| Kepala Divisi | Capaian mingguan divisinya |
| Admin PT | Memeriksa & meneruskan laporan perusahaannya, modul proyek & divisi |
| Direktur Perusahaan | Mengawasi dan menyetujui di perusahaannya |
| Manajemen Holding & Direksi Holding | Membaca seluruh grup, memutuskan eskalasi |
| Tim TI | Konsol sistem & akses |
| Super Admin | Perusahaan, akun, kata sandi, dan seluruh modul |

Masuk memakai **username** (email juga bisa) dan kata sandi. Akun contoh beserta
kata sandinya dijelaskan di SUPABASE_SETUP.md.

## Struktur singkat

```
prisma/          skema, migrasi, seed.sql
scripts/         seed, setel kata sandi, dorong secret ke Vercel
src/app/         rute App Router + seluruh endpoint /api
src/components/  tampilan, termasuk views/ per modul
src/lib/         rbac, auth, konstanta, pembantu bersama
```

Catatan untuk kolaborator: bentuk akhir baris disamakan lewat `.gitattributes`
(repositori menyimpan LF), jadi Windows dan macOS tidak saling menimpa berkas
hanya karena beda akhir baris.
