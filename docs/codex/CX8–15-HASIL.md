# Hasil CX 8–15 — 6 Oktober 2026

**Gerbang final lokal lolos: 63 berkas/1.192 tes, Prisma validate, TypeScript,
ESLint, diff check, build runner Docker dan pemeriksaan runtime. E2E HTTP/
PostgreSQL nyata lokal: 14 pemeriksaan lolos (11 sebelum, 3 sesudah 17.00 WIB).**

| Tugas | Perilaku akhir dan laporan |
|---|---|
| [CX 8](CX8-HASIL.md) | Subjudul Auditor sesuai eskalasi; pengajuan TI tersembunyi; ringkasan atomik; target buka kunci hilang 404; kepatuhan Admin bersama; tenggat lewat WIB 422 |
| [CX 9](CX9-HASIL.md) | Riwayat proyek per hari dan flag cakupan; snapshot gagal tidak mengganti yang lama; total API untuk hero |
| [CX 10](CX10-HASIL.md) | Fokus Sheet, radiogroup/grafik keyboard, target sentuh, retensi Sheet akun, Heatmap/footer responsif |
| [CX 11](CX11-HASIL.md) | Katalog dan pembantu preview bersama, fixture tanpa PIC/lajur beku kosong terpelihara; 31 tes terfokus |
| [CX 12](CX12-HASIL.md) | Primitif MK dan alias token; cleanup aktual 47 dependencies (67 → 20, devDependencies 12) |
| [CX 13](CX13-HASIL.md) | Prisma config tanpa peringatan usang; validasi; 0026 indeks FK dan 23 migrasi lolos lokal |
| [CX 14](CX14-HASIL.md) | 11/11 before dan 3/3 after; laporan JSON/teks tersedia; satu eksternal pending |
| [CX 15](CX15-HASIL.md) | Cari Admin/PIC → Sheet, jenis bukti, delta hanya riwayat nyata, placeholder PIC null; tanpa 0027 atau perubahan ROLE_TABS |

## Bukti pemeriksaan

| Pemeriksaan final | Hasil |
|---|---|
| Vitest | **63 berkas / 1.192 tes lolos**, termasuk Heatmap/footer |
| Prisma validate | Lolos |
| TypeScript `--incremental false` | Lolos |
| ESLint `src` dan diff check | Lolos |
| Docker runner `monitor-karya:cx-final` | Build lolos; base Node 22.23.3-bookworm-slim |
| Runtime runner | Non-root UID 1000; `/login` 200; `/pratinjau` 404; `/api/cron/kpi-snapshot` tanpa rahasia 401 |
| Image migrasi lokal | 23 migrasi, tidak ada pending, target loopback 54329 |
| HTTP/PostgreSQL lokal | 11 before + 3 after lolos; tiga race atomik juga lolos |

[Ringkasan bukti final](bukti/final-gate.txt) mencatat sumber log yang dibaca
DOCS; hasil Prisma/TypeScript/ESLint berasal dari parent. Empat laporan CX 14
[JSON/teks](CX14-HASIL.md) disalin tanpa file fixture atau kredensial.

Browser parent: Admin cari Rina, PIC palet absensi → Sheet, placeholder PIC null
Manajemen, Escape setelah keluar → main#isi, dan PIC A → B → C memperbarui
Agenda/Outputs tanpa item lama, semuanya lolos. Pergantian proyek live diperiksa
baca-saja pada data pengguna. Ponsel root 390/Sheet 390×844, tablet root 834,
desktop 1440 terang/grafit tanpa luapan. Target nav tablet 44, ponsel 48,5,
Dock desktop 50, Donut 44; ArrowRight roving tabindex lolos. Screenshot final
Sheet gelap/biru tersedia di [CX 10](CX10-HASIL.md), cari Admin di [CX 15](CX15-HASIL.md).
Preferensi dipulihkan ke tema Sistem, aksen merah, sidebar. Ini tidak mengklaim
uji pembaca layar/perangkat fisik atau setiap kombinasi matriks visual.

Versi fresh shell DOCS: **Node 26.8.2/npm 11.19.1**. Baseline fase awal memakai
Node 22.23.3; Docker final memakai base 22.23.3, dikonfirmasi log build.
Riwayat red/green, alokasi 5+5 worker dan inventaris disimpan di
[LANJUTAN](LANJUTAN-POIN1-7-DAN-CX8-15.md). Commit implementasi dibuat parent dan dicatat di bawah; DOCS tidak melakukan
commit/push/PR. Source implementasi dibekukan untuk review dokumentasi.

## Commit implementasi dan pembersihan runtime

| Commit parent | Isi |
|---|---|
| `28f969f` | Keamanan dan atomisitas |
| `0792ca1` | Metrik, MK dan UI |
| `b36fe91` | Pratinjau |
| `8fee994` | Dependensi, infrastruktur, guard dan E2E |

Dokumentasi disimpan dalam commit lokal terpisah; riwayat Git cabang
`codex/kerja` mencatat commit dokumentasi. Parent menetapkan pembersihan **hanya tiga kontainer uji
yang dibuat agen** setelah verifikasi. Penghentian aktual belum dikonfirmasi
pada saat catatan ini ditulis. **Server utama 3200 dan DB persisten 54339 tetap
berjalan**, bukan sasaran pembersihan. Kontainer uji tidak diperlukan untuk
membaca artefak hasil yang sudah disimpan.

## Sisa lingkup CX dan batas penutupan lokal

- Keputusan pemilik untuk tab Log Direktur entitas; belum diimplementasikan.
- A2-08 unggah berkas Supabase Storage nyata: **EXTERNAL_PENDING**.
- Rilis/migrasi produksi dan penjadwal VPS oleh operator, di luar tugas lokal.

Penutupan ini hanya lingkup CX. **Backlog global tidak dinyatakan selesai**:
keputusan pemilik B, QA manual D, serta kode/infrastruktur tersisa C (termasuk
rate limit bersama, pencabutan sesi, drift skema lama, audit dependensi, tiga
grafik reserved, tata letak Admin dan ActivityItem Auditor) tetap tercatat di
[SISA-PEKERJAAN](../SISA-PEKERJAAN.md). Audit historis dipertahankan pada
[STATUS](../STATUS-LANJUTAN-CODEX.md#lampiran--audit-historis-pengambilalihan).

## Batas keamanan dependensi

Audit lockfile final masih mencatat **9 paket terdampak high, 0 critical**.
[Bukti audit](bukti/npm-audit-final.json) dan [backlog tindak lanjut](../SISA-PEKERJAAN.md)
memisahkan temuan ini dari kelulusan tes/build. Tidak menjalankan audit fix yang
menurunkan Next/Prisma atau menaikkan sharp tanpa verifikasi kompatibilitas.
