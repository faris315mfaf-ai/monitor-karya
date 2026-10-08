# CX 14 — Uji alur antarperan lokal

**14 pemeriksaan lokal lolos: 11 sebelum dan 3 sesudah 17.00 WIB**, menggunakan
HTTP dan PostgreSQL nyata terisolasi. Before/after adalah fase waktu server uji,
bukan red/green perbaikan kode. DB persisten 54339 dan server/data pengguna 3200
dipertahankan menurut parent.

| Fase | Hasil | Laporan |
|---|---|---|
| Before | 11 lolos, 0 gagal; 1 eksternal tertunda | [JSON](bukti/cx14-final-before.json), [teks](bukti/cx14-final-before.txt) |
| After | 3 lolos, 0 gagal | [JSON](bukti/cx14-final-after.json), [teks](bukti/cx14-final-after.txt) |

Alur mencakup kirim/beku/Urungkan/buka kunci, review output, mingguan,
ringkasan/tanggapan, tenggat, cuti, wajib ganti sandi, cakupan/peran kosong, dan
penolakan mutasi setelah 17.00. DOCS membaca serta menyalin hanya empat laporan;
file fixture yang berisi rahasia tidak disalin.

Berkas: `scripts/uji-alur-lokal.ts`, `tests/e2e-lokal/{guard,harness,scenarios,
fixture,server,clock}` beserta tesnya. Assertion awal A2-11 keliru mengharapkan
404; kontrak Admin bounded adalah 200 berisi PT sendiri. Harness diperbaiki dan
ulang lolos. Shim Date.parse juga masalah harness, bukan bug aplikasi.

**A2-08 unggah berkas Supabase nyata tetap EXTERNAL_PENDING**. Tautan bukti
lokal tidak membuktikan unggah berkas; after tidak memuat A2-08 sehingga external
pending 0 pada after tidak menutupnya.

Bukti integrasi bersama dan versi runtime: [hasil CX 8–15](CX8–15-HASIL.md).
Riwayat pemeriksaan: [lampiran lanjutan](LANJUTAN-POIN1-7-DAN-CX8-15.md).

## Reproduksi pada lingkungan terisolasi baru

Petunjuk acuan: [header runner](../../scripts/uji-alur-lokal.ts),
[guard target](../../tests/e2e-lokal/guard.mjs),
[server uji](../../tests/e2e-lokal/server.mjs) dan
[clock](../../tests/e2e-lokal/clock.mjs). Gunakan DB uji **baru**, bukan DB
persisten 54339. DB terisolasi harus memiliki metadata lokal storage.buckets
serta seluruh 23 migrasi; pengujian tidak memerlukan Supabase nyata.

Build image target `build` (bukan runner standalone, karena runner tidak memuat
CLI/devDependencies). Jalankan shell image itu dengan
`--network container:<kontainer-DB-uji>` agar loopback mengarah ke DB uji,
`--env-file <berkas-env-privat>`, dan mount baca-saja:

- `<worktree>/tests:/app/tests:ro`
- `<worktree>/scripts:/app/scripts:ro`
- direktori hasil privat writable, misalnya `/private/tmp/cx14-repro:/results`

Contoh peluncuran, ganti nama kontainer/path placeholder lokal:

```bash
docker build --target build -t monitor-karya:cx14-test .
docker run --rm -it --network container:<kontainer-DB-uji> \
  --env-file /private/tmp/cx14-private.env \
  -v "$PWD/tests:/app/tests:ro" -v "$PWD/scripts:/app/scripts:ro" \
  -v /private/tmp/cx14-repro:/results \
  monitor-karya:cx14-test sh
```

Berkas env privat mode 0600, di luar repo, harus berisi nilai eksplisit:
`MK_E2E_ISOLATED=1`, `MK_E2E_BASE_URL=http://127.0.0.1:3201`,
`DATABASE_URL`, `DIRECT_URL` dan `AUTH_SECRET` acak minimal 32 karakter.
Kedua URL DB harus **identik**, pengguna `mk_local`, DB `monitor_karya_local`,
loopback port **54329 di kontainer**, dengan kata sandi uji lokal.
**Tanpa query (termasuk schema=public), fragmen atau proxy.** Port 54339 ditolak;
port host 54329 tidak boleh dipakai. Kosongkan semua env HTTP_PROXY/HTTPS_PROXY/
ALL_PROXY dan variasi huruf kecil. Guard tidak memuat `.env` otomatis.

Di shell image `/app`, lakukan prepare/before/after dengan fixture yang sama:

```bash
umask 077
npx tsx scripts/uji-alur-lokal.ts --prepare --fixture /results/cx14-fixture.json
MK_E2E_NOW=2026-10-08T09:30:00.000Z node tests/e2e-lokal/server.mjs &
cx14_server_pid=$!
# Tunggu /login menjawab 200 pada MK_E2E_BASE_URL sebelum phase before.
npx tsx scripts/uji-alur-lokal.ts --phase before \
  --fixture /results/cx14-fixture.json --report /results/cx14-before.json
kill "$cx14_server_pid"
wait "$cx14_server_pid" || true
MK_E2E_NOW=2026-10-08T10:05:00.000Z node tests/e2e-lokal/server.mjs &
cx14_server_pid=$!
# Tunggu /login 200 pada server uji baru sebelum phase after.
npx tsx scripts/uji-alur-lokal.ts --phase after \
  --fixture /results/cx14-fixture.json --report /results/cx14-after.json
kill "$cx14_server_pid"
wait "$cx14_server_pid" || true
```

Clock before adalah Kamis 16.30 WIB; after Kamis 17.05 WIB. Hentikan **hanya
proses server uji** yang PID-nya ditangkap di shell tersebut. Jangan memakai
perintah kill luas atau menghentikan server utama 3200/DB persisten 54339.
`--prepare` aditif dan menolak menimpa fixture yang sudah ada; tidak ada reset.
Fixture mode 0600 berisi kredensial acak: **jangan salin/commit file fixture**.
Runner menghasilkan JSON dan teks per phase; hanya laporan hasil yang boleh
disalin. FAIL memberi exit 1; EXTERNAL_PENDING tidak berubah menjadi PASS.
