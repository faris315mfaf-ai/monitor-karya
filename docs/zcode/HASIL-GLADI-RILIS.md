# Hasil — gladi rilis Docker (bagian Tahap 2 yang dapat dijalankan lokal)

Dikerjakan Zcode, 8 Oktober 2026, pada HEAD `6f3e40b` (`codex/kerja`). Ini gladi penuh alur deploy produksi pada lingkungan terisolasi: build image dari Dockerfile yang sama dengan VPS, `migrate deploy` seluruh riwayat ke basis data **bersih**, lalu uji runtime kontainer. Tidak menyentuh DB pengguna 54339, Supabase, maupun server mana pun.

## Lingkungan gladi

- Image: `docker build --target runner` → `monitor-karya:gladi-t2` (570 MB) dan `--target migrate` → `monitor-karya-migrate:gladi-t2`; memakai Dockerfile produksi (npm 11.19.1, Node 22, standalone, user non-root, healthcheck `/api/health/ready`).
- Basis data: kontainer PostgreSQL 17 **baru dan sekali pakai** `mk-gladi-db` (jaringan Docker `mk-gladi`, diterbukan hanya ke 127.0.0.1:54329, nama DB `monitor_karya_local` sesuai guard seed; metadata `storage.buckets` tiruan sama dengan compose dev). Dihapus seluruhnya setelah gladi.
- Runner: kontainer `mk-gladi-app` di port 127.0.0.1:3222 dengan env contoh produksi (DATABASE_URL/DIRECT_URL, `AUTH_SECRET` acak, `CRON_SECRET` acak, `APP_ORIGINS`); tanpa konfigurasi Storage — sesuai skenario "DB sehat, Storage belum diaktifkan".

## Hasil

| Tahap | Hasil |
|---|---|
| Build runner + migrate | Lulus |
| `migrate deploy` pertama | **25 migrasi, "All migrations have been successfully applied"** |
| `migrate deploy` kedua (idempoten) | "No pending migrations to apply." |
| Healthcheck Docker | Kontainer `healthy` sejak detik ke-6 |
| GET `/api/health` | 200 |
| GET `/api/health/ready` | 200 `{"ok":true,"status":"degraded"}` — degraded memang benar tanpa Storage (perilaku CX20) |
| GET `/login` | 200; CSP `nonce` + `strict-dynamic`, `X-Frame-Options: DENY`, `Referrer-Policy` ada |
| GET `/pratinjau` | **404** — mode produksi menutup pratinjau |
| GET `/api/cron/kpi-snapshot` tanpa secret | 401 |
| GET `/api/health/internal` tanpa secret | 503 (rahasia belum disetel — sesuai kontrak CX20) |

## Alur pengguna nyata di image produksi (dengan seed)

Seed dijalankan pada DB gladi lewat guard baku (`LOCAL_DB_PORT=54329`, guard `requireLocalDatabase` menerima karena target benar): 3 perusahaan, 10 PT, 40 divisi, 40 proyek, 738 laporan harian, 151 laporan mingguan; kata sandi acak (tidak dicatat di mana pun, berkas sementara dihapus).

| Langkah | Hasil |
|---|---|
| POST `/api/auth/login` (identifier + sandi) | 200; cookie `__Host-mk_session` terbit (awalan produksi bekerja); `mustChangePassword: true` |
| GET `/api/auth/me` dengan cookie | 200, identitas peran TI benar |
| GET `/api/ringkasan` sebelum ganti sandi | **403 `MUST_CHANGE_PASSWORD`** — gerbang F1-C aktif di produksi |
| POST `/api/profile/password` (ganti sandi) | 200 `{"ok":true}` |
| Login ulang dengan sandi baru | 200 |
| GET `/api/ringkasan` dengan sesi pengganti | **200 dengan data nyata** (12 entitas, 40 divisi, daftar proyek) — rantai penuh image → Prisma → DB hasil migrasi bekerja |
| Login dengan sandi lama | **401** — sidik sandi (`pv`) membatalkan kredensial lama |

## Artinya untuk rilis

- Alur VPS (`deploy.sh` → migrate → runner) terbukti bekerja dari nol pada commit sekarang; skema bersih + image sekarang konsisten (menyusul penuntasan drift pada Tahap 1).
- Yang belum dibuktikan oleh gladi ini dan memang di luar jangkauan lokal: unggah Storage Supabase nyata (**A2-08**, prosedur siap di [PROSEDUR-A2-08](PROSEDUR-A2-08.md)), Caddy/HTTPS/WireGuard, cron host, hook backup tunnel, dan restore offsite — seluruhnya bagian operator (A3/checklist rilis).
- Penutupan: seluruh kontainer, jaringan, image gladi, dan berkas sementara dihapus; port 3222 mati kembali; DB pengguna 54339 tidak pernah disentuh.
