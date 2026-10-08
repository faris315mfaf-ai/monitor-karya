# T6-C10 — Audit silang BACA-SAJA hasil swarm Fase 2 (T6-C1..C9)

Disusun agen T6-C10, 8 Oktober 2026 ±21.30 WIB. **Tanpa perbaikan** — dokumen
ini hanya mencatat. Metode: baca seluruh laporan `docs/fase2/T6-C*-LAPORAN.md`
yang mendarat (C1, C2, C3, C4, C6, C7, C8, C9 — **C5 belum mendarat**), lalu
cocokkan klaimnya dengan berkas di pohon kerja (`git status` 49 jalur berubah)
dan dengan route web sebagai sumber kebenaran. Pemeriksaan silang kontrak
juga dikunci oleh tes `InboxTeruskan409Test` (jalur MockWebServer penuh).

## A. Temuan ketidaksesuaian

| # | Jenis | Temuan | Letak | Saran (keputusan di pemilik zona/parent) |
| --- | --- | --- | --- | --- |
| A1 | pecah-kompilasi (kontrak lintas agen) | `MingguanRepo` ditulis menghadap stub `WeeklyReportsApi.daftar(page, pageSize, entityId, statusHeader, isoYear, isoWeek): Response<JsonObject>` dan `WeeklyInputApi.serahAtauSetujui(@Body JsonObject): Response<JsonObject>` (laporan T6-C3 §Jahitan 1). T6-C1 mendarat **bertipe dan beda bentuk**: `WeeklyReportsApi.daftar` punya 7 parameter (`search` di urutan ke-5) dan mengembalikan `Response<WeeklyReportsListResponse>`; POST mingguan bernama `aksi(@Body WeeklyAksiRequest): Response<WeeklyAksiResponse>`. Akibat: `tarikArsip` (panggilan 6 argumen + `isi.angka("total")`, `isi["items"]`), `tarikPapan` (`isi.teks("entityId")`, `isi["divisions"]`), `serah/setujui` (`inputApi.serahAtauSetujui(badan)`; `respon.body()?.teks("statusHeader")`) tidak mengompilasi terhadap T6-C1. | `core/data/.../repo/MingguanRepo.kt` vs `core/network/.../api/WeeklyInputApi.kt`, `WeeklyReportsApi.kt` | C3 sendiri menulis rencananya: pemetaan sudah terkumpul di `simpanLaporan`/`keButir` — ganti panggilan ke `daftar(..., search = null, ...)`/`aksi(WeeklyAksiRequest.serahkan/setujui(...))` dan baca field terketik (`WeeklyAksiResponse.statusHeader`) |
| A2 | pecah-kompilasi (kontrak lintas agen) | `PenerimaanRepo.tarik` memperlakukan hasil `api.inbox()` sebagai `JsonObject` (`isi["daily"]`, `isi["weekly"]`, `obj.teks("projectId")`) padahal `InboxApi.inbox(): Response<InboxResponse>` terketik (T6-C2). `teruskan` membangun `buildJsonObject` dan memanggil `api.teruskan(badan)` padahal parameter bertipe `TeruskanRequest`; `respon.body()?.teks("undoToken")` padahal field-nya `TeruskanResponse.undoToken: String?`. | `core/data/.../repo/PenerimaanRepo.kt:50,68,112–127` | Ganti ke field DTO (`isi.daily`, `isi.weekly`, `TeruskanRequest.harian/mingguan(id)`); laporan T6-C3 sendiri sudah menulis "memakai TeruskanRequest" — kode yang mendarat belum |
| A3 | pecah-kompilasi (kontrak lintas agen) | `KepatuhanRepo.tarik` meneruskan `respon.body()` (bertipe `KepatuhanResponse`) ke `parseKepatuhan(isi: JsonObject)`; `ingatkan*` memanggil `api.ingatkan(badan: JsonObject)` padahal bertipe `IngatkanRequest`; `respon.body()?.angka("sent")` padahal `IngatkanResponse.sent: Int`. | `core/data/.../repo/KepatuhanRepo.kt:42–71,149` | Pakai `IngatkanRequest.orang/divisi/semua()` dan baca `isi.totals/divisions` terketik; atau (lihat A7) pertimbangkan repo ini digantikan langsung oleh pemakaian DTO di ViewModel |
| A4 | tumpang tindih zona/konsep | Dua kosakata hasil paralel di paket `core.data.repo`: `Hasil` (Sukses/Gagal/Luring, dideklarasikan di `MingguanRepo.kt`, dipakai ketiga repo Fase 2) berdampingan dengan `HasilKirim`/`HasilBaca` + `tulisApi`/`bacaApi` di `Hasil.kt` (Fase 1) — pola sama, nama beda, plus dua helper ISO→epoch kembar (`keEpochMillis` internal di MingguanRepo.kt vs `isoKeEpochMillis` di Hasil.kt). Tidak bentrok kompilasi, tetapi dua jalur galat-luring berbeda untuk pemanggil UI. | `core/data/.../repo/MingguanRepo.kt` (deklarasi `Hasil`, helper bawah berkas) vs `core/data/.../repo/Hasil.kt` | Putuskan satu kosakata (mis. `Hasil` F2 menang untuk repo daring-jujur, `HasilKirim` untuk outbox) dan dokumentasikan di FASE2.md |
| A5 | kontrak kawat vs pengurai | `ApiError.Konflik.frozen: String?` (perluasan T5-B1) dirancang untuk `frozen` STRING `"FORWARDED"/"LOCKED"` (daily-input/tasks). Route mingguan justru mengirim `frozen: true` (BOOLEAN) + `reason: "FORWARDED"` (string, tidak diurai ApiError); `teks("frozen")` atas boolean menghasilkan `"true"` sehingga UI tidak bisa membedakan beku-diteruskan dari kunci jam lewat ApiError saja. Terketik `KonflikDto` (T6-C1) sudah punya `reason`; `GalatDto` (T6-C2) tidak. | `core/network/.../ApiError.kt` (dariHttp 409) vs `src/app/api/weekly-input/route.ts` + `src/lib/lock.ts` | Cukup dokumentasikan pola baca `reason` via `KonflikDto` (dilock tes `InboxTeruskan409Test.konflik409BekuMingguanDenganReasonForwarded`); tambah `reason` di GalatDto bila meja akun/penerimaan butuh |
| A6 | dependensi modul | `core/data/build.gradle.kts` **tidak** mendeklarasikan `kotlinx-serialization-json`, padahal kode utama T6-C3 memakai `kotlinx.serialization.json.*` (JsonObject/buildJsonObject di tiga repo). Laporan T6-C3 menulis "Dependensi build.gradle.kts: TIDAK ADA yang baru" — tidak tepat. Tanpa dependensi ini `:core:data` tidak mengompilasi. | `android/core/data/build.gradle.kts` vs `repo/MingguanRepo.kt:20–28` dkk. | Tambah `implementation(libs.kotlinx.serialization.json)` (katalog sudah ada; perubahan build milik pemilik zona `:core:data`/parent) |
| A7 | duplikasi konsep lintas zona | Meja kepatuhan diimplementasi dua kali: `KepatuhanRepo` + model `KepatuhanData/KepatuhanDivisi/KepatuhanOrangBelum` + `parseKepatuhan` manual (T6-C3, core:data) vs `KepatuhanViewModel.petaMeja` langsung dari `KepatuhanResponse` terketik tanpa parsing manual (T6-C8, app; laporannya menyebut "DTO sudah bertipe lengkap sehingga tidak perlu parsing manual"). Layar C8 tidak memakai repo C3 sama sekali; label state juga dobel (`KepatuhanDivisi.labelState` vs label enum C8). | `core/data/.../repo/KepatuhanRepo.kt` vs `app/.../ui/kepatuhan/KepatuhanViewModel.kt` | Pilih satu (repo berbasis DTO terketik tanpa model ganda, atau repo dihapus dan ViewModel jadi sumbernya); kaitan dengan A3 |
| A8 | celah kontrak jaringan | Daftar akun meja = `GET /api/companies` (bentuk `CompaniesData`: `scope`, `manageableRoles`, `companies[].users[]`, `holdingUsers`, `me`) — tidak dimodelkan siapa pun di `core/network`. `AkunApi` (T6-C2) hanya users/aktivasi; T6-C9 mendeklarasikan `MejaAkunListApi` **lokal** yang mengembalikan `JsonObject` mentah. C9 juga mengoreksi redaksi tugas ("GET companies/users" memang tidak mengembalikan daftar) — koreksinya benar terhadap route. | `app/.../ui/akun/AkunViewModel.kt:69–72` vs `core/network/.../api/AkunApi.kt` | Naikkan `CompaniesApi.meja()` bertipe ke `core/network` (zona C2/parent) lalu hapus antarmuka lokal (sudah dicatat C9 §Jahitan 2) |
| A9 | nama kembar lintas paket | `StatusMingguan` sudah dipakai T6-C8 (enum app: MASUK/TERLAMBAT/BELUM — state kepatuhan); `MejaAkun` dipakai T6-C9 (model tampilan app). Kontrak domain Fase 2 karenanya dinamai ulang di FASE2.md §3 menjadi `StatusHeaderMingguan` (statusHeader mingguan) dan `AksesMejaAkun` — agen pemiliknya wajib memakai nama itu agar tidak ada kembar baru. | `app/.../ui/kepatuhan/KepatuhanViewModel.kt:67`, `app/.../ui/akun/AkunViewModel.kt` vs `docs/FASE2.md` §3 | Tidak ada tindakan kode; kesepakatan nama tercatat |
| A10 | jahitan tertunda (bukan pelanggaran) | `MkDatabase` masih versi 1 tanpa entitas/DAO Fase 2 (`MingguanLaporanEntity`, `MingguanButirEntity`, `PenerimaanEntity`) — diantisipasi eksplisit oleh T6-C3 §Jahitan 2 untuk parent. Sementara itu `MingguanRepo`/`PenerimaanRepo` menyuntik DAO yang belum bisa dibangun Hilt. | `core/data/.../db/MkDatabase.kt` | Parent: daftarkan 3 entitas + 3 DAO, naikkan versi 2 |
| A11 | jahitan tertunda | Modul DI lokal kembar potensial: `PenerimaanModule` (InboxApi, UndoApi — C7), `KepatuhanModule` (AdminComplianceApi — C8), `TimModule` (KadivApi — C6), `retrofit.create` lokal di AkunViewModel (C9). Belum ada binding ganda (tipe berbeda semua), tetapi bila AppModule memusatkan, cukup hapus modul lokal — masing-masing agen sudah mencatatnya. | `app/.../ui/{penerimaan,kepatuhan,tim,akun}/` | Parent memusatkan di AppModule saat menggabung |
| A12 | celah cakupan | Tab **Meja kerja** KEPALA_DIVISI/ADMIN_PT membutuhkan cabang KADIV/ADMIN `GET /api/work-desk`; `WorkDeskApi` (T5-B1) hanya memodelkan cabang PIC. Belum dimodelkan siapa pun di Fase 2. | `core/network/.../api/WorkDeskApi.kt` | Jadikan baris tabel §3 FASE2.md saat digarap (sudah dicatat di §6.4) |
| A13 | drift laporan vs kode | Tiga klaim laporan T6-C3 tidak cocok berkas yang mendarat: (a) "teruskan memakai `TeruskanRequest`" — kode memakai `buildJsonObject` (A2); (b) "KepatuhanRepo menyimpan DTO langsung `StateFlow<KepatuhanResponse?>`" — kode menyimpan `KepatuhanData` hasil parse manual (A3/A7); (c) "TIDAK mendefinisikan tipe hasil sendiri" — `Hasil` justru dideklarasikan di MingguanRepo.kt (A4). Kemungkinan berkas ditulis pada iterasi berbeda dari laporan. | `docs/fase2/T6-C3-LAPORAN.md` §Berkas/§Jahitan vs `core/data/.../repo/*.kt` | Laporan dikoreksi pemiliknya saat penyesuaian A1–A3 |
| A14 | deprekasi kecil lintas zona | `ui/laporan` (T5-B5) masih memakai `hiltViewModel` jalur lama; layar Fase 2 (C6/C7/C8/C9) memakai jalur baru `androidx.hilt.lifecycle.viewmodel.compose` — dicatat C9 §Jahitan 4, penyeragaman milik integrasi. | `app/.../ui/laporan/` | Samakan saat parent menggabung |

## B. Verifikasi silang yang LULUS (tidak ada tindakan)

1. **T6-C2 vs route web**: `InboxApi`, `TeruskanRequest {kind, id}` (id =
   laporan, bukan proyek/divisi), `TeruskanResponse.undoToken` opsional,
   `GalatDto`, `KepatuhanResponse`/`MingguanDivisiDto` (state
   MASUK/TERLAMBAT/BELUM), `IngatkanRequest` satu-dari-tiga, `AkunApi`
   (users + aktivasi) — cocok satu-satu dengan
   `src/app/api/inbox/route.ts`, `admin/compliance/*`, `companies/users/*`.
   Dikunci eksekusi oleh `InboxTeruskan409Test` (10 kasus, termasuk badan
   permintaan persis dan 409 beku beralasan).
2. **T6-C1 vs route web**: `WeeklyInputApi`/`WeeklyReportsApi`/`KadivApi`/
   `LaporanDibacaApi` + `KonflikDto` (reason/code/pendingReview) cocok
   `weekly-input`, `weekly-reports`, `kadiv/*`, `ringkasan/laporan-dibaca`.
   Konstanta `WeeklyReportHeadDto` == `MingguanLaporanEntity` (T6-C3) ==
   skema Prisma — dikunci `MingguanStatusTest.konstantaStatusIdentikDiTigaZona`.
3. **T6-C7** memakai kontrak T6-C2 apa adanya (laporan dan kode cocok);
   penanganan 409 → tanda BEKU + Urungkan bergiliran untuk banyak tiket
   sesuai semantik route.
4. **T6-C6** memakai `KadivApi` (T6-C1) langsung tanpa port lokal;
   `confirmPending`/`PENDING_REVIEW` dan `SENT` ditangani sesuai rute.
5. **Tidak ada nama kelas/antarmuka kembar** di paket `dto`/`api`
   (`InboxResponse` F2 vs `NotificationsInboxResponse` F1 sudah dipisah
   T5-B1; DTO mingguan T6-C1 memakai prefiks `Weekly*` sehingga tidak
   menggantung zona T5-B1).
6. **T6-C4** murni berkas baru di designsystem, token terverifikasi ke
   tokens.css, tanpa sentuhan berkas lama.
7. **T6-C9**: guard baca-saja di `MejaAkun.bisaKelola` mengikuti
   `ADMIN_PT_MANAGED_ROLES` + pesan `roleOutOfReachMessage` (termasuk sebutan
   "Direktur Perusahaan") — konsisten rbac.ts; sandi acak tidak pernah
   ditampilkan/dicatat.

## C. Potret pohon saat audit (49 jalur berubah, ringkas)

- Termodifikasi: `MKShell.kt`, `MkNavHost.kt`, `RingkasanScreen.kt`,
  `SesiViewModel.kt`, `strings.xml`, `ApiError.kt` (semua milik agen Fase 1
  yang sah; tidak ada berkas F0 diubah agen Fase 2 selain yang dilaporkan).
- Baru `core/network`: 4 API + 2 berkas DTO Fase 2 (C1, C2).
- Baru `core/data`: EntitiesFase2, DaosFase2, repo/ (Hasil, Mingguan,
  Penerimaan, Kepatuhan, + Laporan/Proyek/Tugas Fase 1) + 1 tes outbox (B9).
- Baru `designsystem`: 7 komponen formulir + 4 komponen data (C4).
- Baru `app/ui`: laporan (B5), penerimaan (C7), kepatuhan (C8), akun (C9),
  tim (C6). `ui/mingguan` belum ada (C5).
- Laporan terkumpul: C1, C2, C3, C4, C6, C7, C8, C9. **C5 tidak mendarat**
  hingga dokumen ini ditutup — zona perkiraannya (papan mingguan kadiv)
  ditandai "belum ada" di FASE2.md §3.
