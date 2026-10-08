# Laporan T2-B9 — Verifikasi vendor braces di CI

Tanggal: 8 Oktober 2026 · Cabang: `codex/kerja` · Berkas diperiksa: `.github/workflows/ci.yml`

## Ringkasan

Tugas meminta tiga hal ditambahkan ke CI: (1) langkah `python3 vendor/braces/verify.py`, (2) `npm run test:dependencies` setelah `npm ci`, (3) konsistensi versi Node/npm. Hasil audit: **ketiganya sudah ada di ci.yml** (dikerjakan komit `a6b702d` "CX19: perkuat dependensi dan verifikasi patch braces"). Sesuai instruksi "bila ci.yml sudah memuat salah satunya, cukup lengkapi yang kurang" — tidak ada yang kurang, maka **ci.yml tidak diubah** (diff kosong). Langkah dan job yang sudah ada dipertahankan utuh; tidak ada job baru, tidak ada sentuhan secrets.

## Kutipan diff

```
diff a6b702d:.github/workflows/ci.yml -> sekarang
(kosong — tidak ada perubahan)
```

Bukti keberadaan langkah yang diminta (kutipan verbatim dari ci.yml, komit a6b702d):

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: '22.23.3'
          cache: npm
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      ...
      - name: Gunakan npm dengan kebijakan skrip instal
        run: npm install --global npm@11.19.1 --ignore-scripts --no-audit --no-fund
      - name: Verifikasi sumber dan tarball patch dependensi
        run: python3 vendor/braces/verify.py
      - run: npm ci --no-audit --no-fund
      - name: Uji regresi dependensi dan perilaku upstream
        run: npm run test:dependencies
```

Pemetaan permintaan → langkah (urutan langkah di file: baris 19–41, 14 langkah):

| Permintaan tugas | Status | Lokasi |
|---|---|---|
| `python3 vendor/braces/verify.py` | Sudah ada | Langkah "Verifikasi sumber dan tarball patch dependensi" (sebelum `npm ci`) |
| `npm run test:dependencies` setelah `npm ci` | Sudah ada | Langkah "Uji regresi dependensi dan perilaku upstream", tepat setelah `npm ci` |
| Konsistensi versi Node/npm | Sudah konsisten | Node dipatok `22.23.3` (setup-node), npm dinaikkan ke `11.19.1` sebelum verify, Python `3.12` |

## Alasan tiap langkah (mengapa konfigurasi yang ada sudah memadai)

1. **`verify.py` sebelum `npm ci`, setelah npm 11.19.1.** Skrip `vendor/braces/verify.py` (dibaca, tidak diubah) membutuhkan Python 3.12+, biner `patch`, dan `npm 11.19.1` — memverifikasi integritas SHA-512 tarball upstream, hash SHA-256 tes upstream, menerapkan `depth-guard.patch` pada sumber bersih, membandingkan seluruh sumber, lalu membuktikan `npm pack` menghasilkan tarball identik byte per byte. Urutan di CI sudah benar: `setup-python` 3.12 → pasang npm 11.19.1 → `verify.py` → baru `npm ci`. Menempatkan verify sebelum `npm ci` juga berarti integritas dependensi yang dipasang divalidasi lebih dulu, persis seperti didokumentasikan `vendor/braces/README.md`.
2. **`npm run test:dependencies` setelah `npm ci`.** Skrip ini (package.json) menjalankan `node --test vendor/braces/test/*.test.cjs`: suite upstream asli + regresi keamanan + tes diferensial + integrasi Next → fast-glob → micromatch → braces. Butuh dependensi terpasang (Tes integrasi melewati resolver), jadi posisinya setelah `npm ci` sudah tepat.
3. **Kebijakan versi diikuti, tidak diubah.** Node tetap dipatok `22.23.3` (memenuhi `engines` `^22.12.0`), npm tetap `11.19.1` (syarat reproduksibilitas tarball verify.py), Python tetap `3.12`. `cache: npm` berbasis lockfile — konsisten dengan `npm ci`.

## Pemeriksaan pendukung (lokal, tanpa jaringan)

- **Vendor ikut ter-checkout:** `git ls-files vendor/braces` → 32 berkas terlacak (termasuk `verify.py`, `braces-3.0.3-mk.1.tgz`, `depth-guard.patch`, `provenance.json`, 3 berkas tes, 12 tes upstream). `actions/checkout@v4` mengambil semua berkas terlacak, tidak ada `.gitignore` yang mengecualikannya — tidak perlu langkah tambahan.
- **`patch` di runner:** verify.py memanggil `patch` via subprocess; `patch` tersedia bawaan di image ubuntu-latest GitHub (juga terpasang di mesin lokal ini di `/usr/bin/patch`). Tidak bisa dibuktikan online dari sini — lihat keterbatasan.
- **Uji coba langkah (bukan CI sungguhan):**
  - `python3 vendor/braces/verify.py` → `PASS pristine integrity, all upstream test hashes, source patch, byte-for-byte npm tarball: sha512-w7xQ…` (exit 0).
  - `npm run test:dependencies` → **794 tes, 794 lulus, 0 gagal**, durasi 173 ms pada Node 22.23.3 (versi sama dengan CI) — beban tambahan CI nyaris nol.
- **Worktree bersih** sebelum dan sesudah pemeriksaan; `vendor/braces` tidak tersentuh (verify.py hanya menulis ke direktori sementara).

## Hasil validasi YAML

- `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` → **gagal: `ModuleNotFoundError: No module 'yaml'`** (Python 3.14.7 lokal tanpa PyYAML; sesuai instruksi, tidak menambah dependensi).
- Fallback tanpa dependensi baru: parser YAML bawaan Ruby (psych 2.6, `/usr/bin/ruby` bawaan macOS): `YAML.load_file('.github/workflows/ci.yml')` → **berhasil (YAML VALID)**. Struktur terbaca: 1 job `periksa`, 14 langkah, semua nama langkah ter-parse benar.
- Catatan parser: psych (YAML 1.1, sama seperti PyYAML) membaca kunci `on:` sebagai boolean `true` — artefak parser yang diketahui, bukan galat berkas; GitHub Actions mem-parsing trigger `on` dengan benar.

## Keterbatasan

1. **GitHub Actions sungguhan tidak bisa dijalankan dari sini.** Verifikasi hanya sintaks YAML (dua parser) + penalaran terhadap semantik langkah + uji coba lokal dua langkah vendor pada Node 22.3.3/npm yang tersedia. Jalur yang tidak diuji lokal: `npx prisma generate`, `tsc`, `eslint`, `vitest`, `next build`, `docker build` (dilarang oleh tugas/tidak relevan).
2. **Asumsi image runner:** ketersediaan `patch` bawaan di ubuntu-latest dan perilaku npm 11.19.1 di Linux didasarkan pada dokumentasi image GitHub, tidak diverifikasi online (tanpa jaringan eksternal).
3. **verify.py lokal dijalankan dengan npm lokal 10.9.9** (bukan 11.19.1) dan tetap lulus — reproduksibilitas tarball kokoh; namun di CI npm 11.19.1 tetap dipatok sesuai kebutuhan README.
4. Tidak ada komit; ci.yml sengaja tidak diubah karena tidak ada langkah yang kurang.
5. Catatan koordinasi: selama pemeriksaan ini berlangsung, agen lain menulis `prisma/schema.prisma` dan `prisma/migrations/0029_auditlog_operational_index/` di worktree yang sama (status awal T2-B9 bersih). Bukan bagian tugas ini, dibiarkan tak tersentuh; ci.yml dan vendor/braces terkonfirmasi tidak berubah.
