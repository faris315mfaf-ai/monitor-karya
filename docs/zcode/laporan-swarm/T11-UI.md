# T11-UI — Sisa temuan audit UI (T10-AUD2)

Agen T11-UI, 12 Oktober 2026. Hanya `src/components/**`, `src/hooks/**`, `src/lib/format.ts`, tes terkait. Tanpa git/DB/deploy. tsc, eslint, dan vitest (tests/ui, qa, lib, cx: 52 berkas) lulus.

## Diperbaiki

| Temuan | Berkas | Perbaikan |
| --- | --- | --- |
| M1 hero PIC | views/role-dashboards.tsx | Label jam tenggat dari `lockAt` payload (`formatTime`), impor `DAILY_CUTOFF_LABEL` dihapus |
| M2 kartu Aturan pelaporan | admin/report-settings-card.tsx | Galat/HTTP gagal -> `ErrorNote` + "Coba lagi"; fallback tanpa baris aturan = bawaan server (17.00, Sen-Jum), bukan 24/7 |
| M3 kepatuhan | admin/compliance.tsx | 3 teks "Tenggat Kamis 17.00 WIB" kini dari `data.week.handoverBy` |
| M4 ganti hari | views/daily-input-view.tsx | Selama respons tanggal baru belum tiba: `opacity-60 pointer-events-none aria-busy` (hanya bila `reportDateKey` != tanggal diminta) |
| meta reportFlow (sisa FIX1) | views/daily-input-view.tsx | Mode 24/7 -> "Kirim kapan saja" (prop `open247` pada EntryDesk), bukan "Tenggat <jam env>" |
| L1 | kadiv/team-cards.tsx | `cutoffLabel` -> `formatTime(lockAt)` -> "—"; tak ada tebakan 17.00 |
| L2 | hooks/use-fetch.ts | `reload` `useCallback` stabil; 401 menyelesaikan `loading` dengan pesan "Sesi Anda berakhir" sebelum redirect |
| L3 (sebagian) | lib/format.ts | `formatRpShort`: spasi "Rp " konsisten |
| L4 | format.ts + evidence-panel, pic/outputs, oversight/approval-requests | Helper `formatFileSize` (koma desimal) dipakai ketiganya |
| L7 | oversight/weekly-reports.tsx (+ director-dashboard, management-dashboard, group/sdm-panel) | `WeeklyReportSheet` terima `handoverBy` dari `reportWeek`; label serah dan kunci diturunkan darinya (fallback env bila kosong) |
| INFO 4 | views/companies-view.tsx | Ternary no-op dihapus |
| INFO 5 | views/role-dashboards.tsx | Tanpa divisi -> "Divisi Anda", bukan "0 divisi Anda" |

Tes baru: `tests/lib/format-file-size.test.ts`.

## Dilewati (bukan bug / di luar kepemilikan)

- L3 bagian null -> "—" pada `formatNumber/Percent/Rp`: dipakai di 22 berkas dalam kalimat "X dari Y"; mengubahnya merusak kalimat. Sengaja dipertahankan.
- L5 lencana TI: `src/lib/oversight-badges.ts` (server) memang hanya melayani MANAJEMEN/DIREKTUR/SUPERADMIN; menambah TI di klien hanya memanggil API yang mengembalikan kosong.
- L6 DITUTUP tanpa laporan = 100%: aturan sengaja, dikunci tes `tests/lib/project-status.test.ts`.
- INFO 1/2/3/6/7: bukan bug (catatan positif/disengaja).

## Catatan keterbatasan API

`/api/my-dashboard` (`countdown`, `lockAt`) dan `/api/kadiv/team` (`cutoffLabel`) masih memakai jam env, bukan settings entitas; UI kini konsisten dengan payload, tetapi akurasi per entitas menunggu rute disesuaikan (di luar kepemilikan).
