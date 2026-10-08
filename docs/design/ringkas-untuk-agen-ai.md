# Ringkas untuk agen AI & pengembang baru

Tempel bagian ini ke `CLAUDE.md` / `AGENTS.md` proyek agar setiap perubahan UI mengikuti panduan.

```md
## Desain UI Monitor Karya
- Sumber kebenaran: DESIGN.md dan docs/design/. Baca berkas peran (docs/design/peran/) sebelum mengubah layar peran itu.
- Nilai visual hanya dari design-system/tokens.css (var(--…)) atau preset Tailwind. Jangan menulis hex, px acak, atau bayangan sendiri.
- UI memakai alias aksen: --accent, --accent-fill, --accent-soft, --on-accent. Jangan --merah/--biru langsung.
- Tema: data-theme="light|dark" di <html>. Aksen: data-accent="merah|biru|hijau|ungu|oranye|grafit".
- Komponen: nama & props sama dengan design-system/components/index.d.ts (Button, StatTile, StatusBadge, ProjectRow, ApprovalItem, Sheet, TabBar, ActivityRings, BarChart, AreaChart, DonutChart, Timeline, FlowDiagram, DivisionBar, Heatmap, …).
- Bahasa Indonesia, sapaan "Anda", sentence case, angka di depan, tombol = kata kerja + objek, tanpa tanda seru/emoji.
- Status tetap: on=Sesuai jadwal, risk=Perlu perhatian, late=Terlambat, done=Selesai, neutral=Belum mulai. Selalu warna+ikon+kata (StatusBadge).
- Warna divisi tetap: Teknologi data-1, Keuangan data-2, Media data-3, SDM data-4, Operasional data-5, Hukum data-6.
- Satu kalimat jawaban di atas setiap dashboard; maks 4 KPI; maks 1 tombol primer per kartu; maks 1 kartu bergradien per layar.
- Detail dibuka di Sheet (desktop 440 samping, tablet form, ponsel layar didorong) — tidak pindah halaman.
- Angka: font-variant-numeric: tabular-nums; format id-ID (1.466 · 68,5% · Rp 48,5 jt · Senin, 5 Oktober 2026 · 14.20).
- Target sentuh ≥44px, kontras teks ≥4.5:1, fokus terlihat, prefers-reduced-motion dihormati.
- Sebelum PR: jalankan daftar periksa docs/design/15-checklist-review.md.
```
