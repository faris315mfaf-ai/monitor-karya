# Fase 1 — MVP PIC Monitor Karya di Android

Disusun agen T5-B9 (tes dan dokumen), 8 Oktober 2026, awal swarm Fase 1 (T5-B1 dst.).
Sumber rancangan: [`docs/zcode/RANCANGAN-ANDROID-NATIVE.md`](../docs/zcode/RANCANGAN-ANDROID-NATIVE.md)
§5 (inventaris fase), §4 (offline-first), §7 (pengujian). Lanjutan dari
[`android/docs/FASE0.md`](FASE0.md). Indeks laporan per agen:
[`docs/fase1/README.md`](fase1/README.md). Audit silang antar-agen:
[`docs/fase1/T5-B9-AUDIT.md`](fase1/T5-B9-AUDIT.md).

> Ringkasan satu kalimat: Fase 1 menuntaskan alur kerja harian PIC — meja kerja,
> laporan harian (draf/kirim/multi-proyek), progres tugas, bukti, riwayat proyek,
> ajukan buka kunci, Urungkan, notifikasi dalam aplikasi — di atas fondasi Fase 0,
> dengan tulis-luring lewat outbox dan keputusan final selalu di server.

## 1. Definisi selesai

Kalimat kunci (rancangan §5): **seorang PIC bisa bekerja sehari penuh dari HP
tanpa membuka web.** Diurai jadi butir yang bisa diperiksa:

| # | Butir | Bukti |
| --- | --- | --- |
| 1 | PIC masuk (login, termasuk wajib ganti sandi), melihat meja kerja hari ini | Layar + gerbang navigasi Fase 0 + `MEJA_KERJA` |
| 2 | PIC menambah/mengubah progres tugas hari itu (status, %, kendala) | `SimpanTugasRequest` terkirim; papan harian menyegar |
| 3 | PIC mengisi laporan harian satu proyek dan multi-proyek (pilih proyek) | `HarianInputDto.projects` + layar pilih proyek |
| 4 | Draf vs kirim jelas; validasi ramah tampil sebelum kirim (422 dipetakan ke pesan lapangan) | `ApiError.Validasi.errors` |
| 5 | Unggah/hapus bukti dengan kompres gambar (sisi panjang ≤2048, kualitas 85) | multipart `evidence/upload` |
| 6 | Luring: tulisan masuk antrean outbox, status "Menunggu kirim"; daring: terkirim otomatis | `OutboxProsesor` + WorkManager |
| 7 | 409 beku/terkunci dan 422 dari server menjadi kegagalan permanen yang perlu ditindak PIC (ajukan buka kunci), bukan ditimpa lokal | `ApiError.Konflik(locked, frozen, reportId)` |
| 8 | Ajukan buka kunci dari layar laporan terkunci; status pengajuan terlihat | `unlock-requests` |
| 9 | Urungkan tindakan yang bisa dibalik lewat toast (pola tiket 15 menit) | `undoToken` + `POST /api/undo` |
| 10 | Notifikasi dalam aplikasi (lonceng, belum-dibaca) | `notifications?inbox=1` |
| 11 | Sesi 8 jam dan logout membersihkan cookie terenkripsi | Fase 0 (`EncryptedAuthStore`) |
| 12 | Unit test kontrak (409, outbox, DTO) hijau; `:app:assembleDebug` hijau | berkas tes T5-B9 |

## 2. Peta layar dan rute

Tab PIC (sudah ada dari Fase 0, `ROLE_TABS`): `RINGKASAN`, `MEJA_KERJA`,
`LAPORAN_HARIAN`, `PROYEK`. Tab pendarat = `RINGKASAN`.

| Tab / rute Compose | Isi Fase 1 | Endpoint pendamping |
| --- | --- | --- |
| Ringkasan (Fase 0) | Satu kalimat tugas (ROLE_DUTIES), status hari ini, tautan cepat | `GET /api/ringkasan` |
| Meja kerja | Daftar tugas hari ini per proyek; tambah/ubah tugas; geser status; jam mulai/selesai; subtugas | `GET/POST/PUT/DELETE /api/tasks?projectId=&date=` |
| Laporan harian | Pilih tanggal (bawaan hari ini) dan proyek; draf/kirim; capaian, kendala, tindak lanjut, keputusan yang diminta; bukti; ajukan buka kunci; hari lain yang sedang terbuka | `GET/PUT/DELETE /api/daily-input?date=`, `POST /api/evidence/upload`, `DELETE /api/evidence/{id}`, `POST /api/unlock-requests` |
| Proyek | Daftar proyek PIC + status + riwayat laporan (Sheet detail, tidak pindah halaman) | `GET /api/daily-reports?projectId=`, data Room cache |
| Lonceng notifikasi | Daftar + belum-dibaca; ketuk menandai baca | `GET /api/notifications?inbox=1`, `POST /api/notifications` (baca) |
| Umum | Toast Urungkan bila respons membawa `undoToken` | `POST /api/undo` |

Detail tetap dibuka lewat `MkSheet` (ponsel layar didorong) — aturan desain
`docs/design/` berlaku; status selalu warna+ikon+kata (`StatusBadge`).

## 3. Kontrak nama lintas agen (tabel kunci)

Pola paket: `id.co.monitorkarya.<modul>.<sub>`. Ubah nama di zona agennya,
jangan menimpa dari luar zona. Kontrak ini dikunci lebih awal supaya agen
paralel tidak saling menunggu; tes T5-B9 adalah spesifikasi eksekusinya.

| Nama | Modul / paket | Pemilik zona | Status 8 Okt malam |
| --- | --- | --- | --- |
| `ApiError.Konflik(pesan, locked, frozen, reportId)` (409 → Konflik, bukan Lainnya) | `:core:network` `…core.network` | T5-B1 | **mendarat** — diuji `ApiError409Test` |
| DTO Fase 1 (nama final B1): `DailyInputRequest/PutResponse/GetResponse`, `DailyInputProjectDto`, `DailyOpenDayDto`, `DailyReportIsiDto`, `UnlockInfoDto`, `CountdownDto`, `EvidenceRingkasDto`, `TasksDayResponse/WeekResponse`, `TaskDto`, `SubtaskDto`, `TaskSaveRequest/Response`, `Evidence*` (list/link/upload/url/delete), `WorkDeskPicResponse` + `Pic*`, `ProjectsListResponse` + `Project*`, `DailyReportsListResponse` + `DailyReportRowDto`, `UnlockCreateRequest/Response`, `UnlockRequestDto`, `UndoRequest/Response`, `NotificationsInboxResponse` + `InboxItemDto`, `TandaiBacaRequest/Response` | `:core:network` `…core.network.dto` (berkas `DtosFase1.kt`) | T5-B1 | **mendarat** — diuji `DtoFase1Test` |
| Antarmuka API baru: `DailyInputApi`, `TasksApi`, `EvidenceApi`, `WorkDeskApi`, `ProjectsApi`, `DailyReportsApi`, `UnlockApi`, `UndoApi`, `NotificationsApi` | `:core:network` `…core.network.api` | T5-B1 | **mendarat** (Fase 0 hanya `AuthApi`, `RingkasanApi`) |
| `HasilKirim` (Sukses/Luring/GagalPermanen/GagalSementara) + `HasilKirim.dari(ApiError)`, `bacaApi`/`tulisApi` | `:core:data` `…core.data.repo` (`Hasil.kt`) | zona `:core:data` (kontrak T5-B2) | **mendarat** — diuji `OutboxProsesTest` |
| Repositori Fase 1: `LaporanRepo`, `TugasRepo`, `ProyekRepo` (+ `MingguanRepo`, `PenerimaanRepo`, `KepatuhanRepo` cakupan Fase 2) | `:core:data` `…core.data.repo` | zona `:core:data` | **mendarat** — dua impor DTO tak cocok dengan B1 (lihat audit) |
| `OutboxProsesor(dao, kirim)` + aturan GAGAL/MENUNGGU/BERHASIL | `:core:data` `…core.data.outbox` | agen sinkronisasi (T5-B2) | **belum ada** — diuji `OutboxProsesTest` |
| `OutboxDao`, `OutboxEntity` (status `MENUNGGU/BERHASIL/GAGAL`, `percobaan`, `pesanGalat`) | `:core:data` `…core.data.db` | Fase 0 (T4-A6) | ada |
| `SyncScheduler.jadwalkanSekaliSaatOnline(context)` (WorkManager) | `:app` `…app.sync` | T5-B2 | **belum ada** — `SesiViewModel` sudah mengimpornya (lihat audit) |
| Layar `LaporanHarianScreen` + `LaporanViewModel` (T5-B5, dengan `DailyInputApi` lokal sementara); `MejaKerjaScreen` (T5-B4), `ProyekScreen` (T5-B7) | `:app` `ui/laporan`, `ui/mejakerja`, `ui/proyek` | T5-B4/B5/B7 | B5 mendarat; B4/B7 belum — `MKShell` (T5-B8) sudah mengimpor semuanya |
| Navigasi tab PIC nyata (`MKShell.IsiTab`, rute `tab/<id>`) | `:app` `navigation/` | T5-B8 | **mendarat** |
| Komponen Fase 1: `MkField`, `MkPilih`, `MkListRow`, `MkFAB`, `MkSegmented`, `MkSnackbar`, `MkLampiran`, `MkQueueItem` | `:designsystem` `components/` | zona `:designsystem` | **mendarat** |
| Model domain pelengkap (jembatan status laporan harian) | `:core:domain` | zona `:core:domain` | belum ada (label status dipetakan lokal di layar B5) |
| Fixture/Helper uji Fase 1 (MockWebServer, JSON contoh) | `:core:testing` | agen pengujian/T5-B9 lanjutan | modul kosong; contoh JSON menempel di berkas tes |

Aturan yang berlaku ulang dari Fase 0: galat selalu lewat `ApiError.dari(...)`
lalu `pesanTampil()`; klien tidak pernah menyetel `Origin`; cookie hanya di
`EncryptedAuthStore`; versi dependensi hanya di `gradle/libs.versions.toml`;
komponen Compose memakai `LocalMkColors`/`LocalAccent`.

## 4. Cara menguji

Tanpa Gradle dari agen (larangan fase ini); verifikasi oleh manusia/parent:

1. **Unit test kontrak**: buka `android/` di Android Studio → panel Gradle →
   `:core:network > Tasks > verification > test` dan `:core:data > … > test`,
   atau `./gradlew :core:network:testDebugUnitTest :core:data:testDebugUnitTest`.
   `ApiError409Test` dan `DtoFase1Test` menguji kode T5-B1 yang sudah mendarat;
   `OutboxProsesTest` mengunci kontrak `OutboxProsesor` yang belum ditulis
   (bagian `HasilKirim.dari` sudah menguji kode nyata).
2. **Jalan di perangkat**: Android Studio → Run `app` di emulator/perangkat
   (minSdk 26; uji utama Android ≥12). `BASE_URL` produksi
   `https://monitorkarya.tech/` ada di `app/build.gradle.kts`.
3. **Akun dev**: akun uji PIC (`uji-android@…`, tugas server pendamping —
   rancangan §10); sementara pakai akun PIC dev yang ada.
4. **Skenario manual inti** (definisi selesai): masuk → isi tugas → kirim
   laporan + bukti → matikan jaringan → tulis laporan (antre) → nyalakan
   jaringan → antre terkirim → coba ubah laporan terkirim → 409 → tombol
   ajukan buka kunci.
5. **Luring penuh**: Mode pesawat sejak awal; UI merender dari Room; tulisan
   berstatus "Menunggu kirim".

## 5. Status pekerjaan (8 Oktober 2026 malam)

- Fase 0 selesai dan build hijau (lihat FASE0.md bagian status akhir).
- T5-B1 mendarat: seluruh API + DTO Fase 1 + `Konflik` 409 lengkap
  (laporan: `fase1/T5-B1-LAPORAN.md`). Temuan penting B1: **route Fase 1 PIC
  tidak menerbitkan `undoToken`** — penerbitnya route inbox/approve/eskalasi
  (Fase 2+); `UndoApi` tetap disediakan agar toast siap.
- T5-B5 mendarat: `LaporanHarianScreen` + `LaporanViewModel` (dengan salinan
  `DailyInputApi` lokal sementara — jahitan peleburan ke B1 tercatat di
  laporannya). T5-B8 mendarat: navigasi tab PIC nyata di `MKShell`.
- Zona `:core:data` mendarat: `Hasil.kt` (`HasilKirim` + `bacaApi`/`tulisApi`)
  dan repositori; **dua impor DTO tidak cocok dengan nama B1** dan
  `OutboxProsesor` belum ada — daftar di `fase1/T5-B9-AUDIT.md`.
- T5-B9 (agen ini): tiga berkas tes (`ApiError409Test`, `OutboxProsesTest`,
  `DtoFase1Test`) + dokumen fase ini + audit silang. Tes 409 dan DTO kini
  menguji kode B1 yang nyata; tes outbox mengunci kontrak pemroses yang belum
  ditulis. Cakupan Fase 2 (penerimaan, kepatuhan, mingguan; `fase2/`) sudah
  ikut mendarat di pohon — indeksnya pindah ke `docs/fase2/` saat fasenya.

## 6. Sisa menuju Fase 2

Fungsi Fase 1 yang belum ada di pohon (perbarui seiring laporan agen masuk
ke `fase1/README.md`):

1. `.gitignore` akar repo (baris `test` telanjang) menelan `android/**/src/test`
   — wajib dibenahi sebelum penggabungan agar berkas tes ikut terkomit
   (temuan A0 audit T5-B9).
2. `MejaKerjaScreen` (T5-B4) dan `ProyekScreen` (T5-B7) — `MKShell` sudah
   mengimpornya; `:app` tidak kompilasi sampai keduanya mendarat.
3. `SyncScheduler` + `OutboxProsesor` + WorkManager `NetworkType.CONNECTED`
   backoff eksponensial; batas antre 7 hari → GAGAL
   (`OutboxDao.hapusKedaluwarsa` sudah ada, pemanggilnya belum).
   `SesiViewModel` sudah memanggil `SyncScheduler.jadwalkanSekaliSaatOnline`.
4. Peleburan jahitan B5: hapus `DailyInputApi`/`LaporanModule`/
   `SimpanLaporanRequest`/`SimpanLaporanResponse` lokal dari
   `ui/laporan/LaporanViewModel.kt`, ganti impor ke `core.network` (B1),
   tambahkan @Provides di AppModule.
5. Perbaikan impor zona data: `DailyReportDto` → `DailyReportRowDto`;
   `TaskRequest`/`TaskUpdateRequest` → `TaskSaveRequest`; `daftarHarian` →
   `perHari`; argumen `lifecycle` → `siklus` (lihat audit A1–A4).
6. Kompres gambar bukti di klien sebelum multipart (batas server 20 MB,
   nama field `file/targetType/targetId/label`).
7. `kotlinx-coroutines-test` di testImplementation `:core:data` (kini tes
   memakai `runBlocking`); fixture JSON pindah ke `:core:testing`.
8. Sambungkan `onAjukanBukaKunci` di pemasangan `LaporanHarianScreen`
   (sekarang no-op dari MKShell — audit A8), sisa peringatan Fase 0
   (PARENT-INTEGRASI): `hiltViewModel` pindah paket, `autoCorrectEnabled`,
   ikon AutoMirrored, `Locale.forLanguageTag`.
9. UUI Compose + Maestro E2E ke staging menyusul setelah layar ada (§7
   rancangan); akun `uji-android@…` milik tugas server.
10. Keputusan semantik `HasilKirim.dari` untuk 409 `locked:false` (P2002 —
    server minta dicoba ulang; audit A7) dan keputusan kecil terbuka Fase 0:
    jembatan `MkStatusDomain` ↔ `MkStatus`.

Fase 2 (Kepala divisi & Admin PT) tidak dimulai sebelum definisi selesai §1
ditandai tercapai oleh parent.
