# T12-UI-BARU — Bug baru frontend (src/components, src/hooks)

Agen T12-UI-BARU, 12 Oktober 2026. Zona: `src/components/**`, `src/hooks/**`, `src/lib/format.ts`, tes terkait. Tanpa git/DB/deploy. Gerbang: tsc bersih, eslint bersih, vitest tests/ui+qa+lib+cx = 56 berkas / 836 tes lulus.

## Diperbaiki (terbukti dari kode)

| # | Sev | Berkas | Bug -> perbaikan |
| --- | --- | --- | --- |
| 1 | Tinggi | `division-weekly-desk.tsx` | Dialog "Ubah capaian" memegang snapshot item: bukti yang diunggah/dihapus di dalam dialog tidak tampil (unggah ganda). Kini item hidup dicari ulang dari data terbaru. |
| 2 | Tinggi | `division-weekly-desk.tsx` | Ganti entitas saat satu divisi terpilih -> pilihan divisi milik entitas lain: papan kosong "Belum ada divisi". Kini jatuh ke "Semua divisi". |
| 3 | Tinggi | `weekly-task-board.tsx` | Sama seperti #1 untuk TaskDialog mingguan (dialog dipasang ulang saat muat ulang; kini dengan task hidup). |
| 4 | Tinggi | `admin/report-settings-card.tsx` | Chip aturan pelaporan tak dikunci saat menyimpan: klik beruntun memakai data basi dan saling menimpa (hari kerja). Chip `disabled` + guard `saving`; balasan non-JSON tidak lagi memunculkan galat sintaks. |
| 5 | Sedang | `pic/outputs.tsx` | Form Output baru: tombol simpan di footer Sheet tak terkunci -> kirim ganda membuat output ganda. Guard `saving`; galat lama dibersihkan. |
| 6 | Sedang | `kadiv/use-kadiv.ts`, `weekly-summary-card.tsx`, `team-cards.tsx`, `role-dashboards.tsx` | Ganti divisi: data tim/review/ringkasan divisi lama tetap tampil (bahkan bila muat divisi baru gagal), poin ringkasan lama bisa terkirim atas divisi baru. Data kini berkunci divisi; `reload` stabil dan memuat divisi terkini. |
| 7 | Sedang | `kadiv/team-cards.tsx` | MemberSheet selalu terpasang: draf catatan anggota A terkirim ke proyek anggota B. Sheet di-`key` per anggota; MembersSheet per divisi. |
| 8 | Sedang | `admin/use-fetch.ts` | `loading` salah (false) saat url baru terpasang (Sheet dibuka): daftar laporan buka kunci sempat "Belum ada laporan". `loading` kini diturunkan dari kunci url+muat ulang. |
| 9 | Sedang | `admin/access-request-sheet.tsx` | Ganti perusahaan: akun/divisi perusahaan lama tetap terkirim (terlihat "Pilih akun"). Direset. |
| 10 | Sedang | `views/role-dashboards.tsx` | Hero PIC mode 24/7: "Tenggat 00.00 - 5 jam lagi". Kini "24.00"; pengisian ditutup -> "Pengisian laporan sedang ditutup". `deadlineText` diekspor + tes. |
| 11 | Rendah | `oversight/weekly-reports.tsx` | Tanda baca/urungkan disimpan per divisi, menempel ke laporan minggu berikutnya setelah muat ulang. Kini per id laporan. |
| 12 | Rendah | `format.ts`, `weekly-comments.tsx`, `pic/notes.tsx`, `project-sheet-parts.tsx` | "Hari ini" dihitung dengan `toDateString()` zona peramban sedangkan jam tampil WIB. Helper `isSameWibDay` + tes. |
| 13 | Rendah | `hooks/use-resource.ts` | Jalur 401 menggantung `loading` selamanya (padahal use-fetch sudah diperbaiki T11). |
| 14 | Rendah | `evidence-panel.tsx` | Berkas dijatuhkan saat unggahan berjalan tidak dicegah -> peramban membuka berkas dan meninggalkan halaman. |
| 15 | Rendah | `pic/stages.tsx` | Enter di form usulan tenggat/tahapan bisa kirim ganda. Guard `saving`/`busy`. |

Tes baru: `tests/lib/format-wib-day.test.ts`, `tests/ui/pic-deadline-text.test.ts`.

## Tidak diperbaiki (catatan)

- `views/audit-view.tsx`: tombol "Unduh CSV" hanya membawa tanggal dan aksi; saringan peran/jenis target tidak ikut (rute export di luar kepemilikan). Hasil unduhan bisa lebih lebar dari yang terlihat.
- `work-desk/pic-desk.tsx`, `admin-desk.tsx`, `daily-input-view.tsx` (`lockAt`), `system-view.tsx`: masih memakai countdown/lockAt berbasis env dari rute (`/api/work-desk`, `/api/daily-input`, `/api/system`), bukan pengaturan entitas. UI konsisten dengan payload; akurasi menunggu rute.
- `use-fetch.ts` (hooks): saat url berganti, data/galat url lama tetap dikembalikan selama `loading` (dipakai KpiTrendChart/peta kepatuhan saat ganti `scopeEntityId`). Jarang terjadi; mengubahnya berisiko untuk pemanggil yang memakai url null/ganti.
- `projects-view.tsx`: bila halaman terakhir menjadi kosong setelah persetujuan, pager tersembunyi (hanya terlihat saat total > pageSize). Rare.
