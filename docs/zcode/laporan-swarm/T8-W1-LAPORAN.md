# Laporan T8-W1 — Perombakan dashboard Admin PT jadi minimal

Dikerjakan Zcode (agen T8-W1), 8 Oktober 2026. Zona: `src/components/admin/admin-summary.tsx` dan laporan ini. Cabang `codex/kerja`, tanpa commit. Keputusan pemilik 9 Okt: dashboard Admin PT cukup jawaban singkat + dua angka + satu tombol penerusan massal.

## Metode

Baca dulu `admin-summary.tsx` lama, `src/app/api/inbox/route.ts` (GET bentuk `daily[]`/`weekly[]` dengan `submittedAt`/`forwardedAt`/`readyToForward`/`reportId`; POST `{kind,id}` mengembalikan `undoToken`), `inbox-view.tsx` (pola teruskan + `toastWithUndo`), dan `compliance.tsx` (tidak disentuh). Komponen konfirmasi yang dipakai: `useConfirm` dari `src/components/companies/parts.tsx` (komponen bersama; pola sama seperti `projects-view.tsx`).

Dihapus dari `admin-summary.tsx` beserta impor/state/kode turunannya: kartu & tombol permintaan akses (`AccessRequestsCard`) + KPI akun tidak aktif, kepatuhan laporan per divisi (`ComplianceCard`), riwayat kepatuhan harian (`ComplianceHeatmapCard`), donat pengguna per peran (`UsersByRoleCard`), kartu permintaan akses (tombol hero "Tinjau permintaan akses"), kepatuhan perusahaan (DivisionBar skor), data induk (`MasterDataCard`, `useAdminOverview`), log aktivitas + unduh log (`ActivityLogCard`). Ikut hilang karena turunan: `ReminderRulesCard`, kartu "Perlu perhatian" (penerusan & eskalasi), cincin `ActivityRings`, tombol "Kirim pengingat ke semua", `sendReminder`, `useCompliance`, `pctOf`, `formatPercent`, `DAILY_CUTOFF_LABEL`, `useApp`, `scrollToCard`, `AttentionItem`, `DivisionBar`, `Card`, `EmptyNote`, `ActivityRings`. Berkas kartu itu sendiri TIDAK dihapus (dipakai/tempat agen lain; hanya lepas impor).

Isi baru:

- Hero ringkas, satu kalimat jawaban persis `"{received} laporan diterima hari ini · {forwarded} sudah diteruskan"`, tanpa aksi/art.
- Dua StatTile dari data `useFetch('/api/inbox')` (hook `@/hooks/use-fetch`, sama dengan induk `dashboard-view`): "Laporan diterima" (harian siap+teruskan — `submittedAt` terisi — plus mingguan terserahkan; delta rincian "x harian · y mingguan") dan "Sudah diteruskan" (`forwardedAt` terisi harian+mingguan; delta menampilkan sisa siap).
- Tombol paling bawah `variant="primary" size="lg" full` "Teruskan {n} laporan ke Direksi" (nonaktif bila 0 siap; teks "Meneruskan…" saat jalan). Klik → dialog konfirmasi `useConfirm` ("Pastikan semua laporan sudah diperiksa dan benar. Penerusan membekukan laporan.", tombol "Ya, teruskan semua") → POST `/api/inbox` berurutan untuk semua item SIAP, harian lalu mingguan; satu gagal tidak memutus (galat dikumpulkan sebagai `Set`, didedup). Hasil: toast "x laporan diteruskan, y gagal: <pesan>" (atau "x laporan diteruskan ke Direksi." bila semua sukses) + tombol "Urungkan" bila ada `undoToken` — pola `toastWithUndo` inbox-view diperluas: satu toast, aksi mengurungkan semua tiket lewat `requestUndo` paralel, lalu `reload()`.

Riwayat "Terlambat/pending", pengingat, kepatuhan, dan eskalasi tidak lagi tampil di dashboard (tetap ada di tab lain).

## Hasil uji

| Uji | Perintah | Hasil |
|---|---|---|
| Vitest API+CX | `npx vitest run tests/api tests/cx -t ""` | 55 berkas, 1183 tes lulus, 0 gagal |
| Vitest UI+QA (di luar perintah tugas, pengaman) | `npx vitest run tests/ui tests/qa` | 11 berkas, 121 tes lulus, 0 gagal |
| TypeScript | `npx tsc --noEmit` (env dari `.env.example`) | Lulus, tanpa galat |
| ESLint berkas | `npx eslint src/components/admin/admin-summary.tsx` | Bersih |

Tes yang mengunci dashboard lama tidak ada yang rusak: `tests/cx/cx15-features.test.ts` ("Admin PT memasang pemicu palet") tetap lulus karena `DashHeader` + `SearchButton` dipertahankan di semua keadaan render (termasuk kerangka memuat); mock `@/hooks/use-fetch` di harness sudah cocok. `tests/ui/compliance-responsive.test.ts` menguji `compliance.tsx` langsung (zona agen lain, tidak berubah) — tetap lulus.

## Catatan untuk parent

- Mock pratinjau TIDAK pecah: `/api/inbox` (GET dan POST, termasuk `undoToken`) dilayani `src/components/preview/mock-laporan.ts` (fungsi `inboxRoute`), bukan `mock-admin.ts`; pratinjau peran ADMIN_PT tetap berfungsi dengan dashboard baru. Endpoint mock kartu yang dihapus (`/api/admin/compliance`, `/api/admin/overview`, `/api/access-requests`, dst. di `mock-admin.ts`) kini tanpa pemakai dari dashboard — tidak saya sentuh (zona agen lain); jadi data mati di pratinjau saja, bukan galat.
- `mock-admin.ts`/`mock-summary.ts` tidak diubah sama sekali sesuai batasan zona.
- `AdminData` (prop komponen) kini hanya dipakai untuk `data.entity?.name` pada konteks header; pemanggil `AdminDashboard` tidak berubah sehingga tidak ada riak ke file lain.
- Penerusan massal memakai POST per laporan berurutan (sesuai API yang ada; tidak ada endpoint massal). Toast "Urungkan" mengurungkan semua tiket yang terbit sekaligus; bila sebagian gagal diurungkan, toast galat muncul dan data dimuat ulang supaya keadaan sebenarnya terlihat.

## Berkas berubah

- `src/components/admin/admin-summary.tsx` — ditulis ulang jadi dashboard minimal (233 → ~200 baris, isi hero + 2 StatTile + tombol penuh + konfirmasi + toast urungkan).
- `docs/zcode/laporan-swarm/T8-W1-LAPORAN.md` — laporan ini.

## Keterbatasan

- Alur klik (konfirmasi → penerusan massal → urungkan) diuji lewat unit tes yang ada dan pembacaan kode, bukan browser nyata; pratinjau `/pratinjau?peran=ADMIN_PT` siap dipakai pemilik untuk verifikasi visual.
- Bila jumlah laporan siap sangat besar, POST berurutan bisa memakan waktu (tombol menampilkan "Meneruskan…" selama proses); tidak dibuat paralel agar tidak berebut kunci baris di server.
- Tanpa commit; penggabungan oleh koordinator swarm.
