# A1 — Mesin offline-first Android (luring, outbox, sinkron)

Agen A1 gelombang Fase 3, 13 Oktober 2026. Menuntaskan butir "Ditunda" di
[`docs/zcode/laporan-swarm/T12-ANDROID.md`](../../../docs/zcode/laporan-swarm/T12-ANDROID.md):
mesin sinkron dorman, HiltWorkerFactory belum dipasang, mulai-dingin luring
dilempar ke layar masuk, `fallbackToDestructiveMigration` menghapus outbox, dan
`OutboxProsesor` yang melompati pesan bergantung. Prinsip tetap
[Rancangan §4](../../../docs/zcode/RANCANGAN-ANDROID-NATIVE.md): **Room = sumber
tampilan, server = otoritas kebenaran; 409/422 final, tidak pernah ditimpa lokal.**

## 0. Ringkas

| Butir | Hasil | Berkas utama |
| --- | --- | --- |
| HiltWorkerFactory | `MKApp` = `Configuration.Provider` + `HiltWorkerFactory`; `WorkManagerInitializer` androidx.startup dibuang di manifest | `app/MKApp.kt`, `AndroidManifest.xml` |
| Penjadwalan | `MesinSinkron.mulai()` (sesi siap): berkala 15 mnt + sekali segera + sekali tiap transisi luring→daring; `jeda()` saat 401; `hentikanDanBersihkan()` saat keluar/ganti akun | `core/data/sync/MesinSinkron.kt`, `SyncScheduler.kt` |
| Outbox | FIFO per kunci dependensi, backoff 30 dtk→30 mnt, 7 hari → GAGAL tampil, 409/422 → GAGAL final yang menahan penerus | `core/data/outbox/OutboxProsesor.kt` |
| Room | versi 3 + `MIGRASI_2_3` nyata (ADD COLUMN); destruktif HANYA dari v1 pra-rilis; skema v2/v3 diekspor | `core/data/db/MigrasiMk.kt`, `DbFactory.kt`, `core/data/schemas/` |
| Mulai dingin luring | `SesiUseCase.muatSaya(): HasilSaya` (Sah/TidakSah/TakTerjangkau) + `putuskanMulai`; profil terakhir terenkripsi; luring + cookie + profil = shell bertanda luring | `core/domain/usecase/SesiUseCase.kt`, `core/network/MkProfilStore.kt`, `app/vm/SesiViewModel.kt` |
| Penanda UI | `PenandaLuring.status: Flow<StatusLuring>`; `AntreanOutbox` (tulis + amati + ulangi/buang); composable `BannerLuring`, `LencanaKirim`, `DaftarAntrean` (+ versi *Otomatis*) | `core/data/sync/PenandaLuring.kt`, `core/data/outbox/AntreanOutbox.kt`, `app/ui/luring/` |
| Layar | Mingguan: simpan/hapus butir, serahkan, setujui diantre saat luring; semua layar milik A1 memakai banner "Luring · data tersimpan HH.MM" | `ui/mingguan`, `ui/penerimaan`, `ui/kepatuhan`, `ui/tim`, `ui/akun`, `ui/admin`, `ui/ringkasan` |

Tes baru (JVM, hijau): `OutboxFifoTest` (9), `MigrasiMkTest` (3),
`SesiTriStateTest` (5), `MkProfilJsonTest` (2); `OutboxProsesTest` (8) tetap
hijau dengan DAO palsu bersama (`FakeOutboxDao`).

## 1. Mulai dingin luring (tri-state sesi)

```
SesiUseCase.muatSaya(): HasilSaya
  Sah(pengguna)          ← 200 /api/auth/me
  TidakSah               ← 401 (lambda saya() mengembalikan null)
  TakTerjangkau(pesan)   ← IOException / 5xx / galat lain

SesiUseCase.putuskanMulai(hasil, adaCookie, profilTersimpan): KeputusanMulai
  Sah                                   → Masuk(pengguna, luring=false)
  TidakSah                              → KeLogin(null)            (profil dihapus)
  TakTerjangkau + cookie + profil       → Masuk(profil, luring=true)
  TakTerjangkau + cookie tanpa profil   → KeLogin("Tidak dapat menghubungi server…")
  TakTerjangkau tanpa cookie            → KeLogin(null)
```

- `SesiUiState.Siap(pengguna, luring: Boolean = false)` — parameter baru
  berbawaan, `MkNavHost`/`MKShell` tidak berubah.
- Profil (`id, nama, email, peran, scopeEntitasId`) disimpan di
  `EncryptedProfilStore` (berkas `mk_profil`, EncryptedSharedPreferences) HANYA
  setelah server mengonfirmasi (Siap daring). Tidak menumpang di `mk_sesi`
  karena `MkAuthStore.header()` merangkai semua entri berkas itu menjadi Cookie.
- Validasi ulang: selama `Siap(luring=true)` dan jaringan ada, `SesiViewModel`
  memanggil `/api/auth/me` (ulang tiap 60 dtk bila server masih tak
  terjangkau). Sah → `Siap(luring=false)`; 401 → layar masuk "Sesi Anda telah
  berakhir" (antrean dipertahankan untuk pengguna yang sama).
- Peran asing di profil → profil diabaikan (masuk ulang), sama dengan pemetaan
  `/me`.

## 2. Siklus hidup sinkron

| Peristiwa | Aksi |
| --- | --- |
| `Siap` (daring/luring) | `MesinSinkron.mulai()` — `SyncScheduler.jadwalkanBerkala` (15 mnt, KEEP, butuh jaringan) + `jadwalkanSekaliSaatOnline` + pengamat `ConnectivityObserver` (transisi luring→daring → satu putaran) |
| Tulisan baru di outbox | `AntreanOutbox.antre` → `jadwalkanSekaliSaatOnline` |
| `WajibGantiSandi` | `jeda()` |
| 401 (`PeristiwaSesi.BERAKHIR`) / validasi ulang 401 | `jeda()` + profil dihapus; Room + outbox TETAP (pengguna sama biasanya masuk lagi) |
| Keluar eksplisit | `hentikanDanBersihkan()`: batalkan kerja, `clearAllTables()` (cache + outbox), `terakhirSinkron=0`; profil dihapus |
| Masuk dengan uid ≠ `uidTerakhir` | `hentikanDanBersihkan()` dulu — tulisan pengguna A tidak boleh terkirim dengan sesi B |

`SyncWorker`: tanpa cookie → selesai (tak ada yang dikirim/ditarik). Outbox
dulu, diulang (maks 5) selama ada id baru yang masuk ketika putaran berjalan
(menambal celah KEEP); lalu tarik proyek/laporan/tugas. `Result.retry` HANYA
bila outbox masih perlu ulang (gagal sementara/luring/backoff); kegagalan tarik
menunggu jadwal berkala. Setelah 6 percobaan → `success` dan jadwal berkala
mengambil alih.

## 3. Aturan outbox

Status: `MENUNGGU` → (`BERHASIL`, dihapus akhir putaran) | `GAGAL` (final).

| Hasil kirim | Status | percobaan | berikutnyaPada | Efek pada kunci |
| --- | --- | --- | --- | --- |
| Sukses (2xx) | BERHASIL → dihapus | +1 | – | – |
| GagalPermanen (409 `locked≠false`, 422, 4xx lain, payload rusak, jenis asing) | GAGAL + pesan server | +1 | 0 | menahan penerus berkunci sama sampai pengguna **Kirim ulang** / **Buang** |
| GagalSementara (5xx, 429, 401, 403 wajib ganti sandi, 409 `locked:false` P2002) | MENUNGGU + pesan | +1 | now + 30 dtk·2^(n−1), maks 30 mnt | menahan penerus |
| Luring (IOException) | MENUNGGU | +1 | 0 (langsung dicoba saat daring) | menahan penerus |
| Belum jatuh tempo backoff | tidak disentuh | – | – | menahan penerus |
| `dibuatPada` > 7 hari, masih MENUNGGU | GAGAL "Tidak terkirim dalam 7 hari…" | – | – | menahan penerus |
| GAGAL > 30 hari | dihapus | | | |

- **FIFO per kunci**: urut id; pesan berkunci sama tidak saling melompati.
  Kunci `null` = mandiri (perilaku lama: satu kegagalan tidak menghentikan
  putaran). Pesan berkunci berbeda tetap jalan.
- **Tidak pernah menimpa server**: tidak ada "force", tidak ada retry otomatis
  atas 409/422. "Kirim ulang" mengirim payload yang SAMA (mis. setelah buka
  kunci disetujui) dan server memutuskan lagi.
- Ulangi mereset `percobaan`, `berikutnyaPada`, dan `dibuatPada` (umur 7 hari
  dihitung ulang).

## 4. Room & migrasi

- `MkDatabase` versi `MigrasiMk.VERSI = 3`. Kolom baru outbox: `kunci TEXT`,
  `label TEXT`, `berikutnyaPada INTEGER NOT NULL DEFAULT 0`.
- `buatDb`: `.addMigrations(*MigrasiMk.SEMUA)` +
  `.fallbackToDestructiveMigrationFrom(true, 1)` — v1 pra-rilis (outbox belum
  punya penulis di v1/v2, jadi pasti kosong). Tidak ada fallback destruktif
  umum dan tidak ada fallback turun versi (lebih baik gagal keras daripada
  diam-diam membuang antrean).
- Skema `core/data/schemas/id.co.monitorkarya.core.data.db.MkDatabase/{2,3}.json`
  diekspor sungguhan oleh Room KSP (2.json dari kode v2 sebelum diubah).
- `MigrasiMkTest` (JVM): rantai 2→VERSI lengkap; tidak ada DROP/DELETE;
  `MIGRASI_2_3` DIJALANKAN pada `SupportSQLiteDatabase` rekaman (Proxy) dan
  kolom outbox v2 + kolom tambahan == kolom outbox 3.json (afinitas, NOT NULL,
  DEFAULT); tabel lain identik.
- **Aturan untuk agen berikutnya**: ubah entitas → naikkan `MigrasiMk.VERSI`,
  tulis `MIGRASI_n_n+1`, tambahkan ke `SEMUA`, ekspor skema baru, jangan
  ubah/hapus json versi lama. `MigrasiMkTest` gagal bila salah satu terlewat.

**Butuh parent (gradle, dilarang bagi A1):** ekspor skema belum permanen —
`ksp.arg.room.schemaLocation` di `gradle.properties` TIDAK dibaca KSP (folder
`schemas/` tidak pernah tercipta sebelumnya). A1 mengekspor lewat init script
sementara di scratchpad (tanpa mengubah berkas repo). Tambahkan di
`core/data/build.gradle.kts`:

```kotlin
ksp { arg("room.schemaLocation", "$projectDir/schemas") }
```

(atau plugin Gradle Room `room { schemaDirectory("$projectDir/schemas") }`), lalu
hapus baris `ksp.arg.room.schemaLocation` yang menyesatkan. Tindak lanjut
opsional: `androidTest` dengan `MigrationTestHelper` (butuh `room-testing`).

## 5. API outbox & penanda untuk layar lain

### core/data

```kotlin
// Tulis (ViewModel) — id.co.monitorkarya.core.data.outbox.AntreanOutbox (@Singleton, @Inject)
suspend fun antre(jenis: String, payloadJson: String, kunci: String?, label: String): Long
suspend fun <T> antre(jenis: String, serializer: KSerializer<T>, payload: T, kunci: String?, label: String): Long
fun amati(): Flow<List<PesanOutbox>>                    // MENUNGGU + GAGAL, FIFO
fun amatiKunci(awalan: String): Flow<List<PesanOutbox>> // mis. KunciOutbox.AWALAN_LAPORAN
suspend fun ulangi(id: Long); suspend fun buang(id: Long); fun kirimSekarang()

// Kosa kata — id.co.monitorkarya.core.data.sync
JenisOutbox.KIRIM_LAPORAN | TAMBAH_TUGAS | UBAH_TUGAS | HAPUS_TUGAS          // PIC (sudah ada)
JenisOutbox.SIMPAN_BUTIR_MINGGUAN | HAPUS_BUTIR_MINGGUAN | AKSI_MINGGUAN     // baru (A1)
KunciOutbox.laporanHarian(proyekId, "YYYY-MM-DD"); KunciOutbox.mingguan(divisiId, "2026-W41")

// Penanda — id.co.monitorkarya.core.data.sync.PenandaLuring (@Singleton, @Inject)
val status: Flow<StatusLuring>  // daring, terakhirSinkronMs, menungguKirim, gagalKirim
```

Jenis baru wajib diterjemahkan di `SyncWorker.kirimPesan`; jenis yang tidak
dikenal menjadi GAGAL final "Jenis pesan … belum bisa dikirim" (tidak diulang
selamanya).

### app/ui/luring (composable)

| Composable | Isi |
| --- | --- |
| `BannerLuring(tersimpanPadaMs, menungguKirim, onCobaLagi)` | "Luring · data tersimpan HH.MM" (+ "· n menunggu kirim"); hari lain → "12 Okt 14.05" |
| `LencanaKirim(StatusKirim)` | "Menunggu kirim" (info + jam) / "Gagal kirim" (terlambat + galat) |
| `DaftarAntrean(pesan, onUlangi, onBuang)` | daftar label + lencana; GAGAL menampilkan pesan server + "Kirim ulang"/"Buang" |
| `rememberStatusLuring()` | `State<StatusLuring>` dari `LuringViewModel` (hiltViewModel) |
| `BannerLuringOtomatis(...)`, `DaftarAntreanOtomatis(kunciAwalan)` | versi siap tempel |
| `ingatWaktuMuat(kunciSukses)` | catat kapan state Sukses terakhir tiba (untuk HH.MM layar ber-memori) |

### Untuk agen PIC (ui/laporan, ui/mejakerja — TIDAK disentuh A1)

1. Suntik `AntreanOutbox` di `LaporanViewModel`/`MejaKerjaViewModel`.
2. Pola "daring dulu, antre saat luring": panggil API seperti biasa; HANYA bila
   hasilnya `HasilKirim.Luring` / `ApiError.Jaringan`, panggil
   `antre(JenisOutbox.KIRIM_LAPORAN, DailyInputRequest.serializer(), req, KunciOutbox.laporanHarian(proyekId, tanggalIso), "Kirim laporan <proyek> <tgl>")`.
   Tanggal sasaran HARUS ada di payload (laporan bisa terkirim esok hari).
3. Tugas: `TAMBAH_TUGAS`/`UBAH_TUGAS`/`HAPUS_TUGAS` dengan kunci yang SAMA
   (`laporanHarian`) supaya kirim laporan tidak mendahului tugas yang gagal.
   Tugas baru yang dibuat luring belum punya id server — jangan antre ubah/hapus
   atas id sementara; gabungkan ke pesan TAMBAH yang belum terkirim atau tunggu.
4. Tampilkan `DaftarAntreanOtomatis(KunciOutbox.AWALAN_LAPORAN)` dan
   `BannerLuring` (ganti `MkOfflineBanner`).
5. Bukti (multipart) TIDAK lewat outbox JSON — tetap jujur daring (atau rancang
   antrean berkas terpisah, Rancangan §4 butir 3).

### Untuk parent / MKShell (TIDAK disentuh A1)

- Tombol keluar: bila `PenandaLuring.status.menungguKirim + gagalKirim > 0`,
  tampilkan konfirmasi ("n perubahan belum terkirim akan hilang") — keluar
  memang menghapus outbox (`hentikanDanBersihkan`).
- `SesiUiState.Siap.luring` bisa dipakai shell untuk penanda global
  "Mode luring — sesi belum diperiksa".
- Parameter `offline` layar tidak perlu diisi lagi: entri ber-VM kini membaca
  `rememberStatusLuring()` sendiri.

## 6. Keputusan per layar (diantre atau tidak)

| Layar / aksi | Outbox? | Alasan |
| --- | --- | --- |
| Mingguan: simpan butir (PUT), hapus butir (DELETE) | Ya, saat luring | Isian kerja milik kadiv; minggu dipaku `week=kunciMinggu` + kunci `mingguan:<divisi>:<minggu>`; 409 beku/kunci Jumat → GAGAL tampil |
| Mingguan: serahkan, setujui (POST) | Ya, saat luring | Rancangan §4 menyebut "setujui" eksplisit; transisi divalidasi server (409/422 bila status sudah berubah); urut di belakang suntingan butir lewat kunci sama. Catatan: serah yang terkirim melewati tenggat Kamis dinilai server sesuai waktu terima (server final) |
| Mingguan: pindah urutan (PATCH) | Tidak | Posisi dihitung dari potret papan saat itu; basi bila papan berubah. Gagal = kembalikan + banner |
| Penerimaan / Dashboard Admin: teruskan, urungkan | Tidak | Pengesahan isi yang dilihat saat itu + membekukan laporan PIC; tiket Urungkan 15 menit hanya bermakna seketika |
| Kepatuhan: ingatkan | Tidak | Bernilai waktu (jam batas); terlambat menyesatkan; server menolak ganda |
| Tim / Ringkasan Direktur: simpan draf, kirim, tarik | Tidak | PUT tanpa minggu sasaran (antrean lintas Senin menulis minggu salah); kirim memicu lonceng Direktur; tarik hanya sah 15 menit |
| Akun: aktif/nonaktif, setel ulang sandi, aktivasi | Tidak | Keamanan akses; sandi/tautan sekali tampil |
| Ganti sandi, masuk, keluar | Tidak | Sesi harus sinkron dengan server |
| Ringkasan, Meja kerja Admin, Tim (baca) | – | Hanya banner luring |

Layar Mingguan/Penerimaan/Kepatuhan/Tim/Akun/Admin masih membaca langsung dari
API (state di memori), belum dari Room; saat luring mereka menampilkan banner
+ galat muat. Memindahkan bacaan ke Room (`MingguanRepo.tarikPapan`,
`PenerimaanRepo`, `KepatuhanRepo` sudah ada) adalah tindak lanjut terpisah.

## 7. Batas yang diketahui

- Celah kecil KEEP: tulisan yang masuk tepat setelah pemeriksaan terakhir
  pekerja dan sebelum statusnya SUCCEEDED menunggu transisi jaringan atau
  jadwal berkala (≤ 15 menit).
- Tarik berkala masih tarik penuh untuk SEMUA peran (proyek + laporan + tugas
  per proyek) — menunggu `berubahSejak` (Rancangan §9); untuk Admin PT dengan
  banyak proyek ini boros kuota.
- Antrean tidak memisahkan pengguna per baris; keamanan lintas akun dijaga
  dengan pembersihan saat keluar/ganti uid.
- Verifikasi `:app:compileDebugKotlin` lihat §8.

## 8. Verifikasi

- `:core:data:testDebugUnitTest`, `:core:network:testDebugUnitTest`,
  `:core:domain:testDebugUnitTest` — hijau (lewat `gradle-kunci.sh`).
- `:app:compileDebugKotlin` (13 Okt, dengan `-x` tugas `:feature:entitas` yang
  sedang rusak milik agen lain — `R.string` belum ada): **nol galat di berkas
  A1**; galat tersisa hanya di `ui/mejakerja/MejaKerjaScreen.kt` (agen PIC
  sedang menulis). Graf Hilt (`hiltJavaCompile`) belum terverifikasi karena
  kompilasi app berhenti di galat agen lain — ulangi `:app:assembleDebug`
  setelah semua agen selesai.
- Ekspor skema memakai init script sementara
  (`scratchpad/skema-room.init.gradle`), tidak tersimpan di repo.
