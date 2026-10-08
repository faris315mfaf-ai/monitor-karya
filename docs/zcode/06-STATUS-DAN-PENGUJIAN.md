# Status hasil dan bukti pengujian

Paket dibuat 8 Oktober 2026, kode diperiksa dari `4117a25`. Angka berikut berasal dari gerbang **7 Oktober**, tidak dijalankan ulang untuk pekerjaan dokumentasi ini.

| Lingkup | Hasil tersimpan |
|---|---|
| CX 1–7 | Selesai menurut laporan masing-masing di docs/codex |
| Perbaikan poin 1–7 dan CX 8–15 | Gerbang 63 berkas / 1.192 tes; HTTP/PostgreSQL lokal dan race; lihat laporan gabungan |
| CX 16–20 / lima prioritas | Akses sementara, sesi/logout, aktivasi, dependensi, health/cron/backup selesai implementasi lokal |
| Gerbang akhir | 69 berkas / **1.356 tes aplikasi** |
| Dependensi vendor | **794 tes** Node 22/Linux serta verifikasi sumber/tarball |
| Statis/build | TypeScript, ESLint `src`, build Next dan Docker runner lulus |
| Migrasi | 25 migrasi pada DB Docker terisolasi |
| Integrasi akhir | 7 skenario HTTP/PostgreSQL + 3 probe kegagalan layanan |
| Produksi | Belum dideploy/diterapkan/diverifikasi dalam pekerjaan ini |

[Hasil CX 8–15](../codex/CX8–15-HASIL.md), [hasil CX 16–20](../codex/CX16-20-HASIL.md), [HTTP](../codex/bukti/CX16-20-http-local.json), [Vitest](../codex/bukti/CX16-20-vitest.txt), [probe](../codex/bukti/CX20-probe-local.json).

## Gerbang untuk perubahan kode berikutnya

Dengan env pengujian lokal/tiruan eksplisit yang sudah disiapkan:

```bash
npx prisma generate
npx tsc --noEmit --incremental false
npx eslint src
npx vitest run
python3 vendor/braces/verify.py
npm run test:dependencies
npx next build
git diff --check
```

Build dapat memakai DATABASE_URL dan DIRECT_URL tiruan `postgresql://x:y@127.0.0.1:1/db`, AUTH_SECRET sementara acak. Jangan menjalankan tes dengan env produksi yang kebetulan diwarisi shell. `npm run lint` menyapu seluruh repo; gerbang yang benar-benar lulus sebelumnya adalah `eslint src`. Ada dua pelanggaran Hooks lama pada `tests/cx/pic-refresh.test.ts` yang tidak termasuk gerbang src; jangan menyatakan lint seluruh repo bersih.

Build pada workspace server dev aktif dapat berbagi `.next`; gunakan checkout/lingkungan build terisolasi atau Docker agar layanan pengguna tidak terganggu. Build Docker harus membawa vendor dan menggunakan lockfile.

## Uji HTTP yang mengubah data

- CX14: `scripts/uji-alur-lokal.ts` dan `tests/e2e-lokal/**`; baca [reproduksi CX14](../codex/CX14-HASIL.md) dahulu. Memerlukan manifest fixture dan fase before/after yang benar.
- CX16: `scripts/uji-keamanan-lanjutan-lokal.ts`; guard `CX16_ISOLATED=1`, DB `127.0.0.1:54349/monitor_karya_local`, user `mk_local`, tanpa querystring, DIRECT_URL sama, aplikasi `http://127.0.0.1:3211`. Rahasia fixture disediakan privat.
- Runner CX16 membuat akun/proyek dan trigger SQL untuk simulasi kegagalan; **jangan jalankan pada 54339 atau produksi**. Jangan melonggarkan guard agar dapat berjalan.
- Skenario meliputi replay logout, rollback sandi, expiry serentak, audit gagal, PIC/kadiv sementara, aktivasi serentak dan heartbeat backup.

## Yang belum dibuktikan

Supabase Storage nyata (unggah/hapus), produksi/migrasi data nyata, restore backup/offsite, pemasangan cron VPS, perangkat Safari/iOS dan pembaca layar asli belum tertutup. Preview dan fixture tidak menggantikan bukti tersebut. Laporan audit npm nol setelah patch lokal tidak berarti patch telah disahkan upstream.

## Koreksi dokumen lama

- Handoff Claude → Codex 6 Oktober adalah riwayat; CX 8–15 sudah selesai, bukan antrean baru.
- Klaim sesi hanya cookie HMAC sudah diperluas dengan AuthSession pada CX17.
- Cron reminder-rules “07–18” pada dokumen arsitektur lama diganti **tiap 30 menit sepanjang hari** oleh CX20.
- Nomor mulai 0026 merupakan instruksi saat itu; kini 0026–0028 sudah ada.
- Klaim “belum diuji DB nyata” dalam laporan awal merujuk fase awal. HTTP/PostgreSQL lokal sekarang teruji; produksi tetap belum.
- 872 / 1.192 tes adalah snapshot lama; baseline akhir 1.356. Jangan menghapus histori hasil lama atau menyatukan angka seolah satu pengujian.
