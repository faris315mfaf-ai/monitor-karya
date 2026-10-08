# Laporan T3-A1 — Sisi server dashboard manajemen per perusahaan

Dikerjakan Zcode (agen T3-A1), 8 Oktober 2026 sekitar 13.30 WIB. Cabang `codex/kerja`, tanpa commit. Zona: `src/app/api/ringkasan/route.ts`, `src/app/api/daily-reports/route.ts`, `src/components/oversight/types.ts` (hanya bidang baru di `OversightProject`), `tests/api/**`, dan laporan ini. Tidak menyentuh `management-dashboard.tsx`, `oversight/company-reports.tsx`, mock pratinjau, atau berkas agen lain (semuanya sedang diedit paralel oleh agen UI di pohon kerja yang sama).

## Ringkasan tugas

Mewujudkan keputusan pemilik (8 Okt 2026) untuk fitur "Dashboard Manajemen per perusahaan" di sisi SERVER:

1. `/api/ringkasan` menambah `escalations?: […]` pada tiap item `projects[]` — eskalasi yang bersumber laporan harian proyek itu (`sourceType 'DAILY_REPORT'`, `sourceId` = id DailyProjectReport → `projectId`). Proyek tanpa eskalasi menerima array kosong.
2. `/api/daily-reports` menerima parameter opsional `projectId` (exact match, divalidasi string ≤ 64 karakter) untuk drill-down laporan per proyek, tanpa mengubah perilaku parameter lain dan dengan cakupan entitas tetap diberlakukan.
3. `RingkasanData`/`OversightProject` di `src/components/oversight/types.ts` diperbarui hanya dengan bidang baru tersebut.

## Perubahan

### 1. `src/app/api/ringkasan/route.ts`

- Tipe lokal `ProjectEscalation` (bentuk identik dengan butir `escalations` tingkat atas, tanpa kolom entitas/divisi): `{ id, summary, needed, status, raisedAt, raisedBy, ageDays, overdue }`. `ageDays`/`overdue` dihitung dengan rumus yang sama (`Math.floor((now − raisedAt)/DAY)`, `ageDays > slaDays`).
- Pemetaan `sourceId → projectId` MEMAKAI ULANG `srcDaily` — kueri `dailyProjectReport.findMany({ where: { id: { in: … } }, select: { id, projectId } })` yang sudah ada untuk `escDivision` (peninggalan T2-B6). Instruksi menyebut "bila sourceId tidak ada di recentReports, lakukan satu findMany kecil"; kenyataannya route SUDAH selalu melakukan findMany kecil itu untuk semua sourceId DAILY_REPORT (tanpa saringan tanggal), sehingga pola itu cukup ditiru tanpa kueri baru: `const escProjectOf = new Map<string, string>(srcDaily.map((d) => [d.id, d.projectId] as const))`. Konsekuensinya identik dengan maksud instruksi — sourceId lama di luar jendela `recentReports` tetap terpetakan (laporan dicari langsung per id), dan tidak ada kueri tambahan.
- Catatan teknis: hasil `Promise.all` untuk `srcDaily` di file ini terinferensi `any` (probe tsc membuktikannya), maka tuple diberi `as const` + generik eksplisit `Map<string, string>` — pola yang sama dengan `escDivision` yang sudah ada.
- Butir mingguan (`WEEKLY_ITEM`) tidak dipetakan ke proyek mana pun (tetap hanya di `escalations` tingkat atas).
- Eskalasi yang terpetakan ke proyek di luar `projects[]` (mis. proyek non-AKTIF atau di luar cakupan) tidak muncul di baris proyek mana pun — daftar per proyek hanya dibaca untuk id di `rows`.
- Respons: `projects: rows.map((r) => ({ …, escalations: escByProject.get(r.id) ?? [] }))`. Urutan butir per proyek mengikuti kueri eskalasi (`raisedAt asc`). Kunci tingkat atas jawaban dan bentuk `escalations` tingkat atas TIDAK berubah.

### 2. `src/app/api/daily-reports/route.ts`

- `const projectId = sp.get('projectId') || undefined` (string kosong diabaikan).
- Validasi sebelum kueri: `projectId.length > 64` → `400 { error: 'Parameter projectId tidak valid' }`.
- `where` menambah `...(projectId ? { projectId } : {})` (exact match); saringan `entityId`, `status`, `dateFrom/dateTo`, `search`, paginasi, dan gerbang cakupan `AND: [{ entityId: { in: scopeIds } }]` tidak berubah — `projectId` tidak dapat dipakai untuk membaca lintas PT.

### 3. `src/components/oversight/types.ts`

- `OversightProject` menambah `escalations?: { id: string; summary: string; needed: string; status: string; raisedAt: string; raisedBy: string | null; ageDays: number; overdue: boolean }[]` dengan komentar "Keputusan pemilik 8 Okt 2026 (drill-down per perusahaan)". Opsional agar respons lama tetap terbaca. Tidak ada perubahan lain.

### 4. Tes (pola fixture `tests/api/admin-fake-db.ts`: mock `@/lib/db` + sesi sungguhan + waktu tetap 2026-10-06T03:00Z)

`tests/api/dashboard-ringkasan.test.ts` — describe baru "eskalasi per proyek, T3-A1" (4 tes), fixture: `dpr-a-baru` (2026-10-05, DALAM jendela recentReports ± 2026-08-16), `dpr-a-lama` (2026-07-15, DI LUAR jendela), laporan prj-b tanpa eskalasi, plus `esc-mingguan` bersumber `WEEKLY_ITEM`:

1. `projects[].escalations` untuk prj-a berisi tepat `[esc-lama (ageDays 47, overdue true), esc-baru (ageDays 2, overdue false)]` — objek diperiksa utuh; tes juga memverifikasi mekanismenya: pemetaan lewat findMany kecil `where.id.in` ber-select `{ id, projectId }`, dan jendela `reportDate.gte` recentReports memang lebih baru daripada tanggal `dpr-a-lama` (membuktikan kasus "sourceId lama" benar-benar teruji).
2. `WEEKLY_ITEM` tidak masuk proyek mana pun, tetap tampil di `escalations` tingkat atas.
3. Proyek tanpa eskalasi → `[]` (bukan undefined); semua baris proyek memuat bidang ini sebagai array.
4. Peran berlingkup (`u-dir-b`, DIREKTUR_ENTITAS pt-b): hanya prj-b, `escalations` per proyek dan tingkat atas kosong — eskalasi pt-a tidak bocor.

`tests/api/daily-reports.test.ts` — baru (7 tes):

1. `?projectId=prj-a` sebagai MANAJEMEN: `total 2`, semua item milik prj-a.
2. Exact match: `?projectId=prj-a-2` → 0 hasil (bukan prefiks).
3. Anti-IDOR: DIREKTUR_ENTITAS pt-a meminta `?projectId=prj-b` → `total 0`, items kosong (cakupan entitas tetap dipakai).
4. Peran berlingkup tanpa `projectId` tetap melihat semua laporan entitasnya; dengan `projectId` miliknya tetap 2.
5. `projectId` bekerja bersama `status` + `entityId` (tersaring ke `dpr-a2`).
6. `projectId` 65 karakter → 400 dengan pesan persis.
7. `?projectId=` (kosong) diabaikan — perilaku tanpa parameter tetap (`total 3`).

## Perintah uji yang dijalankan

- `npx vitest run tests/api` → **28 berkas / 631 tes lulus**, termasuk 11 tes baru (4 ringkasan + 7 daily-reports).
- `DATABASE_URL=… DIRECT_URL=… npx tsc --noEmit --incremental false` → **nol galat di seluruh berkas zona T3-A1**. Catatan: saat pengujian ada galat sesaat di `src/components/preview/mock-admin.ts` (Cannot find name 'GROUP_ROLES') dan sebelumnya di `management-dashboard.tsx` — keduanya zona agen lain yang sedang aktif diedit paralel di pohon kerja bersama; galat muncul/hilang antar-run karena editan agen itu, bukan karena perubahan T3-A1 (diverifikasi dua run berturut-turut: tidak ada galat di empat berkas zona saya).
- `npx eslint src/app/api/ringkasan/route.ts src/app/api/daily-reports/route.ts src/components/oversight/types.ts tests/api/dashboard-ringkasan.test.ts tests/api/daily-reports.test.ts` → **lulus tanpa keluaran**.

## Berkas yang diubah/dibuat

- `src/app/api/ringkasan/route.ts` — ubah (tipe `ProjectEscalation`, pengelompokan `escByProject`, bidang `escalations` pada `projects[]`; murni aditif +45 baris).
- `src/app/api/daily-reports/route.ts` — ubah (parameter `projectId` + validasi + saringan; +10 baris).
- `src/components/oversight/types.ts` — ubah (satu bidang opsional di `OversightProject`; +2 baris).
- `tests/api/dashboard-ringkasan.test.ts` — ubah (header + alias spy + 4 tes baru).
- `tests/api/daily-reports.test.ts` — baru (7 tes).
- `docs/zcode/laporan-swarm/T3-A1-LAPORAN.md` — laporan ini.

## Keterbatasan dan catatan untuk agen UI

- `escalations` per proyek hanya memuat eskalasi BERSTATUS TERBUKA (`DIAJUKAN`/`DITINJAU`) — sama dengan daftar tingkat atas yang memang hanya mengambil status itu. Bila UI kelak butuh riwayat eskalasi yang sudah diputuskan/ditutup per proyek, itu perubahan kueri tersendiri (di luar keputusan 8 Okt).
- Urutan butir per proyek: `raisedAt` menaik (tertua dulu), mengikuti kueri eskalasi.
- `raisedAt` dalam JSON menjadi string ISO (konsumsi UI: `new Date(…)`, konsisten dengan `escalations` tingkat atas).
- Pemetaan `sourceId → projectId` menimpa kueri id langsung tanpa saringan tanggal, jadi bekerja untuk laporan segala usia; namun eskalasi yang `sourceId`-nya menunjuk laporan yang TELAH DIHAPUS tetap tidak terpetakan (wajar — laporannya tidak ada lagi) dan hanya tampil di daftar tingkat atas.
- `/api/daily-reports` dengan `projectId` tetap mengembalikan bentuk `{ items, total, page, pageSize }` yang sama; `project` sudah tersedia di tiap item untuk kebutuhan tampilan.
- Tidak menjalankan `next build`, tidak menyentuh DB/port/kontainer, tanpa commit/add/push, tanpa dependensi baru.
