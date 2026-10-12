# Panduan Claude Code — Monitor Karya

> Dokumen ini menggantikan `@AGENTS.md` sebagai pintu masuk utama Claude Code. AGENTS.md tetap valid untuk aturan Next.js dan koordinasi worktree. Baca dokumen ini dulu setiap sesi baru.

## Keadaan saat ini (10 Oktober 2026)

| Hal | Status |
|---|---|
| HEAD `codex/kerja` | `578e998` (audit-fix: 12 bug diperbaiki) |
| Produksi monitorkarya.tech | Live, healthy, running `578e998` |
| Migrasi Prisma | 26 total (terakhir `0031_task_entry_fields`) — nomor berikutnya `0032` |
| Tes aplikasi | 89 berkas / **1.571 tes** lulus |
| Android | Fase 0+F1+F2 selesai lokal (folder `android/`), APK debug 23,9 MB |
| PWA/luring | Manifest+SW+halaman luring live; SW tidak lagi menyimpan PII |

## Aturan mutlak (baca sebelum melakukan apa pun)

1. **Jangan** akses Supabase / server produksi / DB pengguna `54339` kecuali diinstruksikan eksplisit.
2. **Jangan** rebase/reset/force-push/push/PR tanpa instruksi pemilik.
3. **Jangan** `prisma migrate dev` di DB pengguna — gunakan DB Docker terisolasi (port 54361+).
4. Commit kecil per topik di cabang `codex/kerja`; bahasa Indonesia.
5. Folder `/Users/godam/PROYEK/monitor karya` adalah worktree Claude — jangan ditimpa.
6. Baca `node_modules/next/dist/docs/` sebelum mengubah kode Next.js (Next 16.3.8, berbeda dari training data).
7. Pertahankan `vendor/braces/` beserta patch, tarball, lisensi, dan tes.
8. Gerbang sebelum commit: `npx tsc --noEmit --incremental false` + `npx eslint src` + `npx vitest run` + `npx next build` (env tiruan `postgresql://x:y@127.0.0.1:1/db`).

## Struktur kode (peta singkat)

```
src/app/api/          74 route — guard: requireApiUser → can() → scopeEntityIds → guardProjectAccess
src/components/views/ layar per tab (daily-input, mingguan, penerimaan, kepatuhan, akun, pesan, statistik)
src/components/mk/    sistem desain (Button, Card, StatTile, StatusBadge, Sheet, ...)
src/components/shell  kerangka: sidebar ≥1024, tab bar 600–1023, bawah <600, Dock opsional
src/lib/rbac.ts       ROLE_CAPABILITIES + ROLE_TABS + rantai persetujuan
src/lib/auth.ts       sesi HMAC + AuthSession + sidik sandi pv + cakupan entitas
src/lib/lock.ts       aturan WIB: harian 17:00, mingguan Kamis/Jumat — kini baca ReportSettings
src/lib/report-settings.ts  pengaturan pelaporan per entitas (24/7 bawaan produksi)
src/lib/daily-rollup.ts    dailyGate (kunci waktu + beku) + computeRollup
src/lib/security.ts   clientIp (XFF entri TERAKHIR), rate limit per-proses
src/proxy.ts          CSRF Origin + CSP nonce + batas body (20MB untuk upload)
prisma/migrations/    0031 migrasi — terakhir 0031_task_entry_fields
android/              Kotlin+Compose (F0 fondasi, F1 PIC, F2 kadiv+admin) — belum deployed
deploy/               Docker, Caddy, WireGuard, backup, cron — VPS monitorkarya.tech
docs/zcode/           seluruh dokumentasi hasil kerja Zcode
```

## Alur bisnis inti

### Laporan harian PIC (entri multi-item, 10 Okt 2026)
```
PIC → "Tambah entri" (Sheet: judul+pelaksana+hasil+status+progres+eskalasi+rencana+bukti)
    → daftar entri muncul sebagai kartu
    → review (edit/hapus per entri)
    → "Kirim laporan ke Admin PT" (PUT /api/daily-input action=submit)
    → rollup server gabungkan narasi entri → DailyProjectReport
Admin PT → Meja kerja akordeon "Laporan proyek"/"Laporan divisi" → periksa + galeri bukti
    → Dashboard → "Teruskan laporan ke Direksi" (POST /api/inbox)
    → laporan beku (frozen), PIC butuh buka kunci untuk ubah
```

### Aturan pelaporan (ReportSettings)
- Model `ReportSettings` per entitas — panel di tab **Statistik** Admin PT
- `dailyCutoffHour: null` = 24/7 (produksi saat ini)
- `workingDays: []` = setiap hari (produksi saat ini)
- `dailyOpen: false` = tutup pengisian
- `weeklyCutoffHour`, `weeklyOpen` untuk capaian mingguan
- **Seluruh gerbang** (resolveDay, dailyGate, tasks lockCheck, weekly-input, evidence-access) kini membaca settings — jangan hardcode 17:00 lagi

### Sembilan peran
PIC_PROYEK, KEPALA_DIVISI, ADMIN_PT, DIREKTUR_ENTITAS, DIREKTUR_SDM_GA, MANAJEMEN, TI, SUPERADMIN, AUDITOR. Sumber: `ROLE_CAPABILITIES` di `src/lib/rbac.ts`. Semua peran bisa mengajukan proyek (keputusan 9 Okt).

## Keputusan pemilik terbaru

| Tanggal | Keputusan |
|---|---|
| 10 Okt | Aturan pelaporan per entitas via panel Admin PT; bawaan produksi 24/7 |
| 10 Okt | Laporan harian PIC = daftar entri multi-item + review + kirim sebagai satu |
| 10 Okt | Kotak masuk (pesan) terpadu semua peran di sidebar/Dock |
| 10 Okt | Semua peran bisa mengajukan proyek (kadiv+auditor berantai Admin PT→Direktur) |
| 10 Okt | Dashboard Admin PT diringkas: 2 angka + tombol teruskan; Meja kerja = akordeon; Statistik = tab sendiri |
| 10 Okt | Kehadiran dihapus dari dashboard Manajemen; fitur beralih akun dihapus |

## Desain UI — aturan singkat

- Nilai visual **hanya** dari `design-system/tokens.css` atau kelas Tailwind bertoken (`bg-surface`, `text-ink-2`, `bg-accent-fill`)
- Komponen dari `src/components/mk` — props sama dengan `design-system/components/index.d.ts`
- Status = warna + ikon + kata via `StatusBadge` (on/risk/late/done/neutral/info)
- Tema `data-theme="light|dark"`, aksen `data-accent="merah|biru|..."` — pakai `--accent`, `--accent-fill`, `--on-accent`
- Detail dibuka di Sheet (bukan pindah halaman); konfirmasi hanya untuk hapus
- Bahasa Indonesia, "Anda", sentence case, tanpa emoji/tanda seru
- Margin layar Android 12dp, pemisah antarbaris garis 1px

## Testing

```bash
# Gerbang penuh (jalankan sebelum commit kode)
export DATABASE_URL='postgresql://x:y@127.0.0.1:1/db' DIRECT_URL='postgresql://x:y@127.0.0.1:1/db'
npx prisma generate
npx tsc --noEmit --incremental false
npx eslint src
npx vitest run
python3 vendor/braces/verify.py
npm run test:dependencies
AUTH_SECRET="build-32-chars-min" npx next build
```

## Deploy ke VPS

```bash
# 1. Commit semua perubahan
# 2. Bundle dan kirim
git bundle create /tmp/mk-deploy.bundle codex/kerja
scp /tmp/mk-deploy.bundle root@monitorkarya.tech:/tmp/
# 3. Deploy
ssh root@monitorkarya.tech 'set -e
cd /srv/apps/monitor-karya
git fetch /tmp/mk-deploy.bundle codex/kerja:bundle-kerja
git checkout --detach $(git rev-parse bundle-kerja)
rm /tmp/mk-deploy.bundle
cd /srv/apps/monitor-karya-vps
echo "IMAGE_TAG=$(cd /srv/apps/monitor-karya && git rev-parse --short HEAD)" > .env
docker compose build
docker compose run --rm migrate  # bila ada migrasi baru
docker compose up -d
sleep 6 && docker ps | grep monitor'
# 4. Verifikasi
curl https://monitorkarya.tech/api/health/ready
```

## Cadangan DB sebelum deploy bermigrasi

```bash
ssh root@monitorkarya.tech 'docker exec monitor-karya-postgres-1 pg_dump -U mk_admin -d monitor_karya -Fc -f /tmp/pra.dump && docker cp monitor-karya-postgres-1:/tmp/pra.dump /srv/backups/monitor-karya/'
```

## Dokumentasi rinci

| Topik | Berkas |
|---|---|
| Aturan kerja lengkap | [docs/zcode/01-ATURAN-KERJA.md](docs/zcode/01-ATURAN-KERJA.md) |
| Struktur kode detail | [docs/zcode/02-STRUKTUR-KODE.md](docs/zcode/02-STRUKTUR-KODE.md) |
| Alur bisnis & peran | [docs/zcode/03-ALUR-DAN-PERAN.md](docs/zcode/03-ALUR-DAN-PERAN.md) |
| Data & keamanan | [docs/zcode/04-DATA-DAN-KEAMANAN.md](docs/zcode/04-DATA-DAN-KEAMANAN.md) |
| Lingkungan & migrasi | [docs/zcode/05-LINGKUNGAN-DAN-MIGRASI.md](docs/zcode/05-LINGKUNGAN-DAN-MIGRASI.md) |
| Status & pengujian | [docs/zcode/06-STATUS-DAN-PENGUJIAN.md](docs/zcode/06-STATUS-DAN-PENGUJIAN.md) |
| Backlog & keputusan terbuka | [docs/SISA-PEKERJAAN.md](docs/SISA-PEKERJAAN.md) |
| Operasional & diagnosis | [docs/zcode/08-OPERASIONAL.md](docs/zcode/08-OPERASIONAL.md) |
| Inventaris API/model/env | [docs/zcode/10-INVENTARIS-KODE.md](docs/zcode/10-INVENTARIS-KODE.md) |
| Desain per peran | [docs/design/peran/](docs/design/peran/) |
| Panduan deploy VPS | [docs/zcode/DEPLOY-RENCANA-VPS-BIZNET.md](docs/zcode/DEPLOY-RENCANA-VPS-BIZNET.md) |
| Android native | [docs/zcode/RANCANGAN-ANDROID-NATIVE.md](docs/zcode/RANCANGAN-ANDROID-NATIVE.md) |
| Laporan audit terbaru | [docs/zcode/laporan-swarm/](docs/zcode/laporan-swarm/) |
| Semua hasil CX | [docs/codex/](docs/codex/) |
| Checklist PR | [docs/design/15-checklist-review.md](docs/design/15-checklist-review.md) |

## Batas dan hal yang perlu diketahui

- **GitHub push**: token `faris315mfaf-ai` kedaluwarsa — deploy via `git bundle` + SSH. Push GitHub menunggu `gh auth login`.
- **Nomor migrasi**: terakhir 0031, berikutnya 0032. Nomor 0020/0022/0024 sengaja kosong (tidak perlu diisi).
- **DB 54339**: PostgreSQL pengguna (97 akun, 40 proyek, 741 laporan) — jangan reset/seed. Cadangan otomatis tiap deploy.
- **Port 3200**: dev server Zcode (env `/private/tmp/mk-cx16-dev.env`). Port 3100: Claude. Jangan jalankan dua server.
- **`prisma.config.ts`** tidak memuat `.env` — CLI perlu `DATABASE_URL`/`DIRECT_URL` eksplisit.
- **ReportSettings**: bawaan kode = 17:00 Sen–Jum (kompatibel tes); produksi punya baris 24/7 di DB. Jangan hardcode jam di kode baru.
- **SW v2**: tidak menyimpan respons API di cache. Data luring = halaman `/luring.html` saja.
- **Audit terbaru (T10)**: 47 temuan, 12 diperbaiki. Sisa 20 sedang + 20 rendah tidak memblokir — daftar di [docs/zcode/laporan-swarm/T10-AUD*.md](docs/zcode/laporan-swarm/).

## Koordinasi Claude ↔ Zcode

| Pihak | Worktree | Cabang | Port |
|---|---|---|---|
| Claude Code | `~/PROYEK/monitor karya` | `desain-baru` | 3100 |
| Zcode (GLM) | `~/PROYEK/monitor-karya-codex` | `codex/kerja` | 3200 |

Keduanya git worktree dari repo yang sama. Jangan edit worktree pihak lain. Penggabungan oleh manusia. Detail: [docs/KOORDINASI-AGEN.md](docs/KOORDINASI-AGEN.md).
