# Laporan T5-B9 — tes unit, dokumen fase, audit silang (Fase 1)

8 Oktober 2026. Zona tulis: `android/core/*/src/test/**`, `android/docs/**`
saja. Tanpa git/jaringan/DB; Gradle tidak dijalankan (larangan fase).
Selama pengerjaan, hasil agen paralel (T5-B1, T5-B5, T5-B8, zona data) ikut
mendarat — tes diselaraskan ke kontrak nyata B1 begitu terlihat.

## Berkas yang ditulis

| Berkas | Isi |
| --- | --- |
| `core/network/src/test/.../network/ApiError409Test.kt` | 8 tes terhadap `ApiError` T5-B1 (sudah mendarat): 409 bodi lengkap `{error,locked,frozen,reportId}` → `Konflik` lengkap; `frozen:"LOCKED"` + `reportId:null`; terkunci waktu tanpa `frozen`; kunci mingguan; `locked:false` (P2002); kolom tak dikenal diabaikan; bodi bukan JSON tetap `Konflik`; regresi 403 non-MUST_CHANGE_PASSWORD tetap `Konflik`. Galat dibangun `HttpException(Response.error(409, …))` — murni JVM, tanpa soket |
| `core/network/src/test/.../network/dto/DtoFase1Test.kt` | 9 tes dekode `DtosFase1.kt` B1 memakai `mkJson`, contoh JSON dari route web: `DailyInputGetResponse` (lengkap + proyek terbekukan dengan `unlock`), `DailyInputRequest`/`DailyInputPutResponse` (+ toleransi kolom baru `undoToken`/`isLate` via ignoreUnknownKeys), `TasksDayResponse`+`TaskDto`+`SubtaskDto`, `TaskSaveRequest`/`TaskSaveResponse`, `UnlockCreateRequest`/`UnlockCreateResponse` (`UnlockRequestDto` tanpa relasi), `UndoRequest`/`UndoResponse`, `NotificationsInboxResponse` |
| `core/data/src/test/.../data/outbox/OutboxProsesTest.kt` | 8 tes: 1 menguji `HasilKirim.dari` yang SUDAH mendarat (Konflik/Validasi → GagalPermanen; Jaringan → Luring; Server → GagalSementara); 7 mengunci kontrak `OutboxProsesor(dao, kirim: suspend (OutboxEntity) -> HasilKirim)` yang belum ditulis — sukses hapus; 409 `locked=true` → GAGAL permanen (pesan tersimpan, tak diproses ulang); `Luring`/`GagalSementara` → percobaan naik tetap MENUNGGU (2 putaran → percobaan 2, pulih → terkirim); 422 → GAGAL; FIFO id naik; gagal satu pesan tak menghentikan putaran. Fake `OutboxDao` berbasis list + eksekutor lambda, Room tidak dipakai; `runBlocking` karena `kotlinx-coroutines-test` belum di testImplementation modul |
| `docs/FASE1.md` | dokumen fase: definisi selesai 12 butir ("PIC bekerja sehari penuh dari HP"), peta layar/rute per tab PIC + endpoint, tabel kontrak nama lintas agen dengan status mendarat, cara uji (Android Studio Run, akun dev, skenario luring), sisa menuju Fase 2 |
| `docs/fase1/README.md` | indeks laporan per agen (B1, B5, B8, B9 + yang ditunggu) |
| `docs/fase1/T5-B9-AUDIT.md` | audit silang baca-saja (ringkasan di bawah) |

## Ringkasan audit utama (rincian + lokasi di T5-B9-AUDIT.md)

**Blokir repo (A0)**: `.gitignore:49` memuat pola telanjang `test` yang
mengabaikan semua `android/**/src/test/**` — berkas tes unit Android tidak
akan pernah terkomit tanpa disadari; perlu dijangkarkan (`/test`) atau
dikecualikan (di luar zona tulis agen ini, menunggu pemilik repo).

Empat pecah-kompilasi nama antara zona `:core:data` dan kontrak T5-B1:
`DailyReportDto` → seharusnya `DailyReportRowDto` (LaporanRepo);
`TaskRequest`/`TaskUpdateRequest` → seharusnya `TaskSaveRequest` (TugasRepo);
`api.daftarHarian(…)` → `perHari(…)` (TugasRepo); `lifecycle =` → argumen
bernama `siklus =` (ProyekRepo). Dua jahitan yang sudah terdokumentasi
pemiliknya: salinan `DailyInputApi` lokal T5-B5 (peleburan ke B1 menunggu
integrasi) dan impor `MKShell`/`SesiViewModel` ke layar T5-B4/B7/B2 yang
belum mendarat (":app belum kompilasi" memang dirancang begitu oleh B8).
Satu temuan semantik penting (A7): `HasilKirim.dari` menggagalkan permanen
SEMUA 409 — padahal `locked:false` (P2002 simpan bersamaan) diminta server
untuk dicoba ulang; untuk outbox ini salah nasib pesan. Rekomendasi cabang
`locked == false → GagalSementara` tertulis di audit; tes sengaja belum
mengunci kasus itu menunggu putusan pemilik zona. Plus dua catatan ringan:
callback `onAjukanBukaKunci` belum tersambung di MKShell (kawat mati), dan
dokumen B8 menulis `LaporanHarianViewModel` padahal nama aktual `LaporanViewModel`.

## Status tes

`ApiError409Test` dan `DtoFase1Test` menguji kode B1 yang nyata dan tidak
menemukan kekeliruan kontrak jaringan. `OutboxProsesTest` sebagian menguji
kode nyata (`HasilKirim.dari`) dan sebagian spesifikasi eksekusi menunggu
`OutboxProsesor` (pemilik: agen sinkronisasi zona `:core:data`). Gradle tidak
dijalankan sesuai batas tugas — kompilasi/keberhasilan diverifikasi parent
saat integrasi.
