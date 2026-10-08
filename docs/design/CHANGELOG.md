# Riwayat perubahan desain

## v3.1 — 6 Oktober 2026
- Ikon baru di `src/components/mk/core.tsx`: `lihat`, `sembunyi`, `hapus`, `ubah` (lucide-react tidak lagi dipakai di luar `components/ui`).
- Warna divisi kini dari nama divisi lewat `src/lib/division-tone.ts` (Teknologi `data-1` … Hukum `data-6`, sisanya hash nama), bukan dari urutan daftar.
- Label peran sentence case: "Kepala divisi", "Direktur entitas", "Manager / PIC proyek", "Direksi holding (SDM & GA)".
- Periode minggu ditulis `M41 2026`, rentang tanggal memakai en dash tanpa spasi, rasio memakai "x dari y".
- Spesifikasi peran 01–05 mendapat bagian "Implementasi saat ini" yang mencatat beda layar berjalan dengan rancangan.

## v3 — 5 Oktober 2026
- **Mode malam v3:** latar #050506, kartu #131316 bertepi garis rambut putih + sorot atas, aurora berwarna aksen, pendar hanya untuk elemen beraksen, `color-scheme` diset. Tema bisa bersarang (kartu terang di halaman malam).
- Aurora terang kini juga mengikuti aksen (16%).
- Layar lengkap lima peran: Manajemen, Direktur, Kepala divisi, Admin PT, PIC proyek — desktop, tablet, ponsel, plus versi malam dan contoh enam aksen.
- `ApprovalItem` menerima label kustom (Terima/Minta revisi) dan prop `requester`.
- Ikon baru: `unggah`, `dokumen`, `target`, `pengguna`, `kunci`, `gedung`, `kirim`, `alur`.
- Panduan ini (`docs/design/`) dan berkas `design-system/` ditambahkan ke proyek.

## v2 — 5 Oktober 2026
- Gaya Apple diperkuat: token gradien (`grad-*`, `aurora`, `kilau`), material kaca, nada `*-cerah` per hue.
- Komponen diagram: `ActivityRings`, `AreaChart`, `Sparkline`, `DonutChart`, `Heatmap`, `Timeline`, `FlowDiagram`, `LogoMark`.

## v1 — 5 Oktober 2026
- Fondasi: warna merah-putih + 6 aksen, tipografi SF/Geist, spasi 4px, radius, elevasi, gerak, ikon, aksesibilitas, pola dashboard manajemen, perangkat.
