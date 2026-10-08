# Hasil — Tahap 1 sebelum VPS (Zcode, 8 Oktober 2026)

Seluruh butir Tahap 1 yang bisa dikerjakan tanpa keputusan pemilik telah tuntas pada 8 Oktober 2026, worktree `monitor-karya-codex`, cabang `codex/kerja`. Zona yang diklaim: `src/components/mk/layout.tsx`, `src/components/admin/compliance.tsx`, `src/components/views/audit-view.tsx`, `src/app/mk-modules.css`, `prisma/schema.prisma`, `docs/zcode/**`, `docs/SISA-PEKERJAAN.md`. Worktree Claude tidak disentuh; DB pengguna 54339 hanya dilihat status kontainernya.

## A. Tiga polish desain (CX-POLISH)

| Butir | Perubahan | Commit |
|---|---|---|
| Peta panas Admin di ponsel memakai label 3 huruf (04-admin-pt.md §Ponsel) | `ComplianceHeatmapCard` memakai `useIsPhone()`; dua kata atau lebih menjadi inisial (Sumber Daya Manusia → SDM), satu kata tiga huruf pertama (Teknologi → Tek); nama lengkap tiap divisi dibawa ke caption agar tabel pembaca layar tetap menyebut nama penuh | `c9a1c6c` |
| Kartu divisi 2 kolom di tablet Admin (04-admin-pt.md §Tablet) | `ComplianceCard` memakai `useIsTablet()` (hook baru di `mk/layout.tsx`, 600–1023 px); kartu memuat nama, kepala divisi, lencana `StatusBadge`, `DivisionBar`, tombol Detail + Ingatkan; ponsel dan desktop tetap pola lama | `c9a1c6c` |
| Log aktivitas di ponsel memakai `ActivityItem` (08-auditor.md §Ponsel) | Daftar ponsel `AuditView` kini `ActivityItem` (rel avatar + nama + lencana aksi + target + waktu) di dalam tombol `mk-audit-act` yang membuka rincian log; tablet dan desktop sempit tetap kartu, ≥1280 tetap tabel | `5198411` |

Pemakaian token dan komponen `src/components/mk` saja; CSS baru hanya kelas `.mk-audit-act` di `src/app/mk-modules.css` (pola sama dengan `mk-userrow`: hover/fill/focus-visible).

Bukti visual (mode pratinjau, data tiruan, peramban sungguhan 390 px dan 834 px, tema gelap): label Tek/Keu/Med/Ope/SDM/Huk terbaca di ponsel; kartu dua kolom tampil di tablet dengan seluruh isi sesuai spesifikasi; peta panas tablet tetap nama penuh; log aktivitas ponsel tampil sebagai rel `ActivityItem` dan tiap baris bisa diketuk. Server dev 3200 dinyalakan hanya untuk pemeriksaan ini memakai env sekali pakai (rahasia acak lokal, DB tiruan), lalu dimatikan; keadaan awal port (mati) dipulihkan.

## B. Drift migrasi 0001–0012 tuntas (CX-DRIFT, commit `738972f`)

Ringkas: selisih migrasi vs skema ternyata murni 40 indeks (bukan kolom); klaim lama `approvalChain` NOT NULL terbukti sudah selaras sejak 0012. Solusi: deklarasi `@@index` pada 20 model `schema.prisma` — 26 nama baku, 14 memakai `map:` nama non-baku — **tanpa migrasi baru**. Verifikasi pada kontainer PostgreSQL sekali pakai (port 54359, metadata `storage.buckets` tiruan sesuai compose, kontainer dihapus setelahnya): `migrate diff --from-migrations --to-schema-datamodel` berubah dari mengusulkan penghapusan 40 indeks menjadi **"No difference detected."** Rincian metode, tabel per model, dan batasan: [HASIL-DRIFT-MIGRASI](HASIL-DRIFT-MIGRASI.md).

Artinya: `prisma migrate dev` berikutnya tidak lagi berisiko mengusulkan SQL destruktif, dan satu penghalang teknis sebelum migrasi produksi (Tahap 3) hilang.

## C. Pemeliharaan braces — diperiksa, belum ada yang bisa diganti

Registry npm per 8 Oktober 2026: `braces` terbaru tetap **3.0.3** (21 Mei 2024) dan rentang advisori GHSA-vfj7-8cjw-p6xm adalah `<=3.0.3`, sehingga belum ada rilis resmi yang memperbaiki dan patch lokal `braces-3.0.3-mk.1` tetap diperlukan. `verify.py` dan suite dependensi dijalankan ulang hari ini (lihat gerbang di bawah).

## D. Memo keputusan tiga grafik/API

[USULAN-GRAFIK-TERTUNDA](USULAN-GRAFIK-TERTUNDA.md) memuat opsi pasang/hapus/tunda per objek, dampaknya, dan rekomendasi (tunda `kpi-trend-chart` sampai keputusan KPI; dua lainnya mengikuti jawaban kebutuhan pemantauan). **Bukan implementasi** — pemasangan/penghapusan menunggu keputusan Anda.

## E. Gerbang penuh yang dijalankan hari ini (hasil segar, bukan angka historis)

| Pemeriksaan | Hasil |
|---|---|
| `npx prisma generate` (env tiruan CI) | Lulus |
| `npx prisma validate` | Lulus |
| `npx tsc --noEmit --incremental false` | Lulus |
| `npx eslint src` | Lulus |
| `npx vitest run` | **69 berkas / 1.356 tes lulus** — sama dengan baseline 7 Okt, tanpa regresi |
| `python3 vendor/braces/verify.py` | PASS (integritas pristine, tarball byte-for-byte) |
| `npm run test:dependencies` | **794/794 lulus** |
| `npx next build` (env tiruan + `AUTH_SECRET` acak) | Lulus; rute tercetak lengkap |
| `git diff --check` | Bersih |

Urutan pengerjaan: perubahan UI dites tsc/eslint sebelum commit; gerbang penuh dijalankan setelah commit CX-DRIFT sehingga mencakup seluruh perubahan hari ini. Build dilakukan saat tidak ada server berjalan agar `.next` tidak diperjakakan dua proses.

## Komit hari ini

| Commit | Isi |
|---|---|
| `95776ed` | Penerimaan Zcode + perbaikan indeks Markdown |
| `c9a1c6c` | Label 3 huruf peta panas + kartu divisi 2 kolom tablet |
| `5198411` | ActivityItem log aktivitas ponsel |
| `738972f` | Deklarasi 40 indeks di `schema.prisma` + laporan drift |
| (DOCS) | Memo grafik, pembaruan SISA-PEKERJAAN/07-BACKLOG/indeks, laporan ini |

## Batasan dan yang tersisa

- QA perangkat asli (pembaca layar, Safari/iOS, sentuh, buta warna) belum dilakukan — bagian D SISA-PEKERJAAN, butuh perangkat.
- Pratinjau memakai data tiruan; alur dengan DB nyata tidak diuji ulang (tidak diperlukan untuk perubahan ini; `dailyGate` dan alur lain tidak disentuh).
- Pratinjau tidak menyediakan peran AUDITOR; verifikasi log memakai SUPERADMIN yang menampilkan `AuditView` yang sama.
- Keputusan pemilik masih menentukan: 13 butir bagian B (termasuk KPI yang memengaruhi `kpi-trend-chart`), nasib tiga grafik/API (lihat memo), jalur distribusi kode ke VPS, dan eksternal cadangan/domain.
- Rate limit bersama tetap ditunda (deploy rencananya satu kontainer).
