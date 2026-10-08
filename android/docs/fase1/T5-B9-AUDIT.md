# Audit silang Fase 1 — T5-B9 (baca-saja)

8 Oktober 2026 malam. Audit hasil agen paralel terhadap kode yang sudah
mendarat di pohon kerja `monitor-karya-codex` (cabang `codex/kerja`). Pohon
berjalan selama audit (berkas baru muncul dua kali antar-pemeriksaan) —
temuan adalah potret saat penulisan. **Tidak ada kode agen lain yang diubah.**

Metode: baca `android/core/network/**` (T5-B1), `android/core/data/**`
(zona data), `android/app/**` (T5-B5/B8), bandingkan dengan route web
`src/app/api/{daily-input,tasks,unlock-requests,evidence,notifications,undo}/route.ts`,
`src/lib/{undo,daily-rollup,lock}.ts`, `prisma/schema.prisma`. Gradle tidak
dijalankan (larangan fase).

## Temuan ketidaksesuaian kontrak

| # | Tingkat | Temuan | Lokasi | Perbaikan yang disarankan (pemilik zona) |
| --- | --- | --- | --- | --- |
| A0 | blokir-repo | Pola `.gitignore` baris 49 `test` (telanjang, tanpa garis miring) mengabaikan **setiap** jalur bersimpul `test` — termasuk seluruh `android/**/src/test/**`. Semua berkas tes unit Android (T5-B9 dan yang menyusul) tidak akan pernah terkomit tanpa disadari | `.gitignore:49` (akar repo; zona web, bukan zona agen Android) | ubah pola menjadi terjangkar (mis. `/test`) atau tambah pengecualian `!android/**/src/test/**`; verifikasi `git status` menampilkan berkas tes sebelum penggabungan |
| A1 | pecah-kompilasi | Impor `id.co.monitorkarya.core.network.dto.DailyReportDto` — kelas tidak ada; T5-B1 menamainya `DailyReportRowDto` | `core/data/.../repo/LaporanRepo.kt:12,49` | ganti impor + tipe penerima mapper ke `DailyReportRowDto` |
| A2 | pecah-kompilasi | Impor `TaskRequest` dan `TaskUpdateRequest` — tidak ada; B1 memakai satu `TaskSaveRequest` untuk POST (kolom `projectId`) dan PUT (kolom `id`) | `core/data/.../repo/TugasRepo.kt:10-11,44,48` | lebur kedua tipe menjadi `TaskSaveRequest`; parameter `permintaan` pada `buat`/`ubah` menyusuaikan |
| A3 | pecah-kompilasi | `api.daftarHarian(projectId=…, date=…)` — metode TasksApi bernama `perHari(projectId, tanggal)` | `core/data/.../repo/TugasRepo.kt:31` | ganti nama panggilan + argumen bernama `tanggal =` |
| A4 | pecah-kompilasi | `api.daftar(lifecycle = …)` — parameter ProjectsApi bernama `siklus` | `core/data/.../repo/ProyekRepo.kt:31` | ganti argumen bernama `siklus =` |
| A5 | jahitan terencana | Salinan lokal `DailyInputApi` + `SimpanLaporanRequest/Response` + `LaporanModule` di `ui/laporan/LaporanViewModel.kt`, padahal B1 sudah mendarat dengan `DailyInputApi`/`DailyInputRequest`/`DailyInputPutResponse`. Dua bentuk respons berbeda: lokal membaca `undoToken`/`isLate` defensif, B1 tidak memodelkannya (benar untuk rute hari ini). Catatan B5 "409 dipetakan sendiri karena ApiError.dariHttp jatuh ke Lainnya" kini kedaluwarsa — B1 sudah menambah cabang 409 | `app/.../ui/laporan/LaporanViewModel.kt` | ikuti rencana peleburan di T5-B5-LAPORAN §"Jahitan untuk integrasi": hapus salinan lokal, impor `core.network`, pindahkan @Provides ke AppModule; bentuk respons seragam ke B1 (kolom baru cukup dibiarkan `ignoreUnknownKeys` menelan — sudah diuji `DtoFase1Test.responsPutMenerimaKolomBaruTanpaPecah`) |
| A6 | pecah-kompilasi (disebut B8 sendiri) | `MKShell` mengimpor `ui.mejakerja.MejaKerjaScreen` dan `ui.proyek.ProyekScreen` (T5-B4/B7 belum mendarat); `SesiViewModel:12,209` mengimpor dan memanggil `app.sync.SyncScheduler` (T5-B2 belum mendarat) | `app/.../navigation/MKShell.kt:48-51`, `app/.../vm/SesiViewModel.kt` | `:app` tidak kompilasi sampai B2/B4/B7 mendarat — urutan integrasi parent: B2/B4/B7 dulu, lalu build |
| A7 | semantik | `HasilKirim.dari` memetakan SEMUA `ApiError.Konflik` → `GagalPermanen`. Padahal 409 dengan `locked == false` (tabrakan simpan bersamaan P2002) sengaja dibalas server agar klien MENCoba ulang (komentar `src/app/api/daily-input/route.ts:316`). Untuk outbox ini berarti pesan gagal permanen hanya karena tabrakan sesaat | `core/data/.../repo/Hasil.kt` (`dari`) | tambah cabang sebelum pemetaan Konflik: `if (galat.locked == false) GagalSementara(galat.pesanTampil()) else GagalPermanen(...)`. `OutboxProsesTest` sengaja BELUM mengunci kasus ini sampai putusan diambil |
| A8 | kawat mati | `MKShell` memasang `LaporanHarianScreen(vm = hiltViewModel())` tanpa `onAjukanBukaKunci` — tombol "Ajukan buka kunci" di sheet (alur penting untuk 409 beku, butir definisi-selesai no. 8) jadi no-op dari tab laporan | `app/.../navigation/MKShell.kt:162` | sambungkan callback (mis. ke rute/sheet ajukan buka kunci saat T5-B7/layar proyek mendarat) |
| A9 | dokumen kontrak | Laporan T5-B8 menulis kontrak `LaporanHarianViewModel`; nama aktual T5-B5 = `LaporanViewModel` (kompilasi tetap jalan karena `hiltViewModel()` menginferensi; ini kecohan nama dokumen saja) | `docs/fase1/T5-B8-LAPORAN.md` vs `ui/laporan/` | kontrak nama di dokumen ikut nama asli `LaporanViewModel` |

## Yang terverifikasi cocok (tidak perlu tindakan)

- `ApiError.Konflik(pesan, locked, frozen, reportId)` + cabang 409 di `dariHttp`
  cocok dengan bentuk bodi route web (frozen/time-locked/P2002/mingguan) —
  dikunci `ApiError409Test` (8 tes, termasuk regresi 403 non-MUST_CHANGE_PASSWORD).
- Nama-nama DTO B1 dan bentuk responsnya cocok dengan route (daily-input GET/PUT,
  tasks hari/mingguan, evidence, unlock, undo, notifications PATCH memang PATCH
  di web) — dikunci `DtoFase1Test` (9 tes).
- Temuan B1 "route Fase 1 PIC tidak menerbitkan undoToken" benar: penerbit di
  web hanya inbox/projects-approve/eskalasi (`src/lib/undo.ts` UNDO_ACTIONS).
- `MKShell` hanya tiga rute akar (login/ganti_sandi/beranda) — gerbang sesi F0
  utuh; tab PIC memakai NavHost tingkat-tab (kontrak B8 konsisten ROLE_TABS).
- Repositori data memakai `tulisApi`/`bacaApi` + `HasilKirim` — tulis jujur
  daring (kirim luring tidak dianggap sukses), sesuai Rancangan §4.

## Sisa yang menunggu (bukan ketidaksesuaian)

1. `.gitignore` menelan `src/test` (temuan A0) — tanpa perbaikan, tes Fase 1
   tidak masuk repo.
2. `OutboxProsesor` belum ditulis siapa pun — `OutboxProsesTest` menunggu
   (kontrak di FASE1.md §3); `OutboxDao.hapusKedaluwarsa` (7 hari) juga belum
   dipanggil siapa pun.
3. `kotlinx-coroutines-test` belum di testImplementation `:core:data`
   (tes memakai `runBlocking`); `:core:testing` masih kosong, contoh JSON
   menempel di berkas tes T5-B9.
4. Cakupan Fase 2 (penerimaan, kepatuhan, mingguan; `docs/fase2/`) ikut
   mendarat sebelum Fase 1 tuntas — batasi penggabungan per fase agar
   definisi selesai Fase 1 tetap terukur.
