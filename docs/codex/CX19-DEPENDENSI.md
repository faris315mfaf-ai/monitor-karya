# CX19 — Dependensi dan mitigasi braces

Pembaruan integrasi parent: build Next/runner Docker final dan gerbang aplikasi lulus; hasil, bukti HTTP/PostgreSQL, serta batas produksi tercatat pada [CX16–20](CX16-20-HASIL.md). Catatan tahapan di bawah mempertahankan konteks verifikasi agen.

7 Oktober 2026 · `monitor-karya-codex`, `codex/kerja` · tanpa commit. Zona final yang diotorisasi: `package.json`, `package-lock.json`, `vendor/braces/**`, `tests/cx/braces-security.test.ts`, `.github/workflows/ci.yml`, dan kedua laporan CX19. Dockerfile ditangani agen operasional.

## Hasil dan kejujuran audit

Audit lengkap **9 high → 5 setelah upgrade resmi → 0 setelah patch lokal**; audit produksi **0**. Semua tiga sumber temuan awal ditangani. **Audit nol bukan pengesahan upstream:** scanner tidak mengenali versi tarball lokal `braces@3.0.3-mk.1` sebagai versi registry terdampak. Bukti mitigasi adalah diff sumber, reproduksi stack exhaustion baseline, guard terkontrol setelah patch, dan regresi perilaku. Nama tetap `braces`; nomor lokal membedakan artefak bertambal, bukan rilis resmi. Advisory upstream 3.0.3 harus tetap dipantau karena scanner mungkin melewatkan temuan baru pada versi lokal.

[Bukti tersanitasi](CX19-AUDIT.json) memuat baseline, hasil upgrade resmi, audit akhir/produksi, dan batasan patch; tanpa rahasia, URL DB, atau jalur pengguna.

| Paket | Sebelum → sesudah |
|---|---|
| sharp langsung / Next | 0.34.5 dan 0.35.4 → **0.35.5**, terdeduplikasi; sesuai rentang Next |
| @prisma/config → deepmerge-ts | 7.1.5 → **8.0.2**, override khusus induk 6.19.3 |
| micromatch → braces | 3.0.3 → **3.0.3-mk.1**, tarball lokal MIT |
| Next / eslint-config-next | tetap **16.3.8 / 16.3.8** |
| Prisma CLI / client | tetap **6.19.3 / 6.19.3** |

## Patch dan pemeliharaan

[Vendor braces](../../vendor/braces/README.md) menyertakan tarball npm asli terverifikasi SHA-512, sumber lengkap, LICENSE MIT, `depth-guard.patch`, provenance, tarball instalasi, 12 berkas tes upstream asli beserta hash, dan `verify.py`. Sumber tes berasal dari commit npm `74b2db2938fad48a2ea54a9c8bf27a37a62c350d`.

Parser membatasi gabungan brace/parentheses sampai **127 tingkat**, dengan cadangan satu tingkat daun pada batas walker 128. Compile/expand/stringify dan helper append/flatten juga dibatasi, termasuk jalur AST langsung. Pelanggaran menghasilkan `SyntaxError` berkode `BRACES_MAX_DEPTH`; batas tidak dapat dimatikan oleh opsi. Escape, kutipan, bracket, pola normal, batas panjang dan rentang upstream tetap dipertahankan. Ini mitigasi rekursi terbatas, bukan perlindungan umum terhadap seluruh AST tidak sah atau ekspansi kombinatorial.

Regresi memakai pola **8.003 karakter**, di bawah batas 10.000, dalam proses `--stack-size=512`: sumber resmi menghasilkan `RangeError` kehabisan stack; implementasi yang benar-benar di-resolve melalui **Next ESLint → fast-glob → micromatch → braces** menghasilkan galat guard. Tes diferensial membandingkan 213 pola × 6 opsi × 4 API. RootDir literal, wildcard, brace, array, hilang, dan backslash juga diuji.

Manifest memakai devDependency tarball braces dan override `micromatch@4.0.8 → $braces`, tanpa postinstall/pnpm. Referensi akar diperlukan agar npm menyelesaikan tarball relatif dari proyek. Instalasi bersih dibuktikan. Skrip lint hanya mengecualikan sumber CommonJS pihak ketiga `vendor/braces/**`; ESLint aplikasi tetap aktif.

**Pemeliharaan otomatis:** CI memakai Python **3.12** dan npm **11.19.1**, menjalankan `python3 vendor/braces/verify.py` sebelum instalasi, lalu `npm run test:dependencies` sesudah `npm ci`. Sepuluh tes [regresi utama](../../tests/cx/braces-security.test.ts) ikut Vitest biasa. Verifier menerapkan patch pada sumber bersih lalu membuktikan semua sumber dan tarball hasil `npm pack` identik **byte per byte**, tanpa jaringan.

## Bukti lokal

Node 26.8.2, npm 11.19.1, Python 3.14.7, macOS. Tidak ada operasi DB.

| Pemeriksaan | Hasil |
|---|---|
| Audit lengkap / produksi | **0 / 0**, dengan batasan metadata lokal di atas |
| Suite upstream/patch/integrasi Node | **794 lolos**, juga pada `--stack-size=512` |
| Regresi Vitest utama braces | **10 lolos**; baseline crash dan patched guard |
| Reproduksi sumber/tarball | Lolos; integrity tersimpan dalam lockfile dan laporan JSON |
| `npm ci --ignore-scripts` dari salinan baru manifest/lockfile/vendor | **491 paket**, lalu **794 tes lolos** di instalasi baru |
| `eslint src`, lint berkas regresi baru | Lolos |
| Lint seluruh repo (`npm run lint`) | Dua galat Hook lama di `tests/cx/pic-refresh.test.ts:92,149`, sudah ada di HEAD; dua peringatan dokumen. Di luar zona ini |
| Tes infrastruktur/Prisma/storage terarah | **3 berkas / 99 lolos** |
| Next optimizeImage memakai sharp baru | Resize PNG → WebP, AVIF, JPEG, PNG lolos |
| Deepmerge via resolver @prisma/config | Konfigurasi biasa dan objek siklik lolos |

Dockerfile kini sudah menyalin `vendor` sebelum `npm ci`; build sedang ditangani parent. Hasil Docker/Linux, TypeScript, Vitest penuh, dan Next build mengikuti laporan parent. Clean-install di atas menonaktifkan lifecycle scripts, sehingga bukan bukti generate Prisma atau build native Linux. Workflow CI sudah diperbarui; belum dijalankan di GitHub.

## Keputusan dan risiko tersisa

Braces resmi terbaru masih 3.0.3, tanpa patch resmi. Rantai awal bersifat dev-only; pemakai Next adalah `get-root-dirs.js` untuk `settings.next.rootDir`, yang tidak diisi konfigurasi repo saat ini. Tidak ditemukan jalur HTTP aplikasi ke pola lint. Pola salah tetap bisa menggagalkan lint secara terkontrol; jangan mengambil glob lint dari pengguna akhir. Override tinyglobby ditolak karena semantik ekspansi direktori berbeda (pola `src`: 1 hasil fast-glob versus 95 tinyglobby saat diuji). Next/plugin 16.4.0 masih membawa fast-glob lama; tidak dilakukan downgrade atau penghapusan ESLint.

Override deepmerge-ts lintas major terbatas pada Prisma 6.19.3; konfigurasi memakai objek biasa, bukan Map yang perilakunya berubah pada v8. Evaluasi ulang bila Prisma/konfigurasi berubah. Begitu patch resmi braces tersedia, ganti vendor/override, hapus devDependency dan skrip/pengecualian khusus yang tidak diperlukan, lalu ulangi regresi glob/lint dan audit.

## Sumber resmi

- [Braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [issue #70](https://github.com/micromatch/braces/issues/70), metadata `npm view braces@3.0.3`.
- [DeepmergeTS advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [catatan v8](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).
- [Sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [Sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [Sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- Panduan Next lokal upgrading dan versi 16 dibaca sebelum perubahan; tidak ada perubahan API aplikasi.
