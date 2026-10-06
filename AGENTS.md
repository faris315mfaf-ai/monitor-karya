<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Desain UI Monitor Karya
- Sumber kebenaran: DESIGN.md dan docs/design/. Baca berkas peran (docs/design/peran/) sebelum mengubah layar peran itu.
- Nilai visual hanya dari design-system/tokens.css (var(--…)) atau kelas Tailwind bertoken (bg-surface, text-ink-2, bg-accent-fill, …). Jangan menulis hex, px acak, atau bayangan sendiri. Palet bawaan Tailwind (slate, blue, rose, …) hanya alias token untuk kode lama — kode baru memakai nama token.
- UI memakai alias aksen: --accent, --accent-fill, --accent-soft, --on-accent. Jangan --merah/--biru langsung.
- Tema: data-theme="light|dark" di <html> (next-themes). Aksen: data-accent="merah|biru|hijau|ungu|oranye|grafit" (localStorage mk-tampilan).
- Komponen desain ada di src/components/mk (port TSX dari design-system/components; props sama dengan index.d.ts): Button, StatTile, StatusBadge, ProjectRow, ApprovalItem, Sheet, TabBar, ActivityRings, BarChart, AreaChart, DonutChart, Timeline, FlowDiagram, DivisionBar, Heatmap, Hero, PageHeader, …
- Kerangka aplikasi: src/components/shell.tsx (sidebar ≥1024, tab bar mengambang 600–1023, tab bar bawah <600).
- Status proyek dihitung di satu tempat: src/lib/project-status.ts. Ringkasan pemantau: /api/ringkasan.
- Bahasa Indonesia, sapaan "Anda", sentence case, angka di depan, tombol = kata kerja + objek, tanpa tanda seru/emoji.
- Status tetap: on=Sesuai jadwal, risk=Perlu perhatian, late=Terlambat, done=Selesai, neutral=Belum mulai. Selalu warna+ikon+kata (StatusBadge).
- Satu kalimat jawaban di atas setiap dashboard; maks 4 KPI; maks 1 tombol primer per kartu; maks 1 kartu bergradien per layar.
- Detail dibuka di Sheet (desktop 440 samping, tablet form, ponsel layar didorong) — tidak pindah halaman.
- Pratinjau tanpa basis data (mode dev): /pratinjau?peran=MANAJEMEN|DIREKTUR_ENTITAS|KEPALA_DIVISI|ADMIN_PT|PIC_PROYEK|SUPERADMIN.
- Sebelum PR: jalankan daftar periksa docs/design/15-checklist-review.md.
- Modul Perusahaan & akun: src/components/views/companies-view.tsx (tampilan Perusahaan · Akun · Struktur) + src/components/companies/ (sheet perusahaan, sheet akun, wizard tambah perusahaan, bagian bersama). Konfirmasi hanya untuk hapus (useConfirm); tindakan yang bisa dibalik memakai toast "Urungkan".
- Navigasi bisa Sidebar/Tab bar atau Dock (src/components/dock.tsx; desktop ala macOS dengan magnifikasi, tablet ala iPadOS, ponsel kapsul kaca), dipilih di panel Tampilan; preferensi di src/lib/tampilan.ts (data-nav, data-dock-autohide di <html>, dipasang skrip src/lib/tampilan-boot.ts). Perpindahan lewat src/lib/nav-transition.ts (View Transitions: ikon `nav-<id>` terbang antar posisi; konten bergeser hidup lewat transisi margin; aturan & kurva pegas di src/app/mk-modules.css). Jangan beri nama view-transition di luar `.mk-vt` dan jangan pasang nama yang sama pada dua elemen yang tampil bersamaan. ⌥⌘D = Dock sembunyi otomatis.

## Kerja bersama Claude Code & Codex
- Dua agen bekerja bersamaan di worktree terpisah: Claude di `monitor karya` (cabang `desain-baru`, port 3100), Codex di `monitor-karya-codex` (cabang `codex/kerja`, port 3200). Aturan dan zona aktif: docs/KOORDINASI-AGEN.md — baca sebelum mulai, klaim zona sebelum mengedit.
- Dilarang menyentuh basis data sungguhan (prisma migrate/db push/db execute/seed ke Supabase atau server); DB lokal Docker boleh. Migrasi baru bernomor mulai 0026, diuji di DB lokal saja.
- Jangan rebase/reset/force-push. Commit kecil per topik di cabang sendiri; penggabungan oleh manusia.
- Serah terima ke Codex (6 Okt 2026): docs/SERAH-TERIMA-CODEX.md — keadaan proyek, aturan, dan tugas lanjutan CX 8–15. Baca sebelum mulai.
