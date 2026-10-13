# D1 — Integrasi peran, kotak masuk, dan badan permintaan

Tanggal: 13 Oktober 2026 · Cabang `claude/perbaiki-bug-sisa`

Kepemilikan:
- `core/domain` (roles)
- `core/network` (api/, dto/)
- `core/data` (repo baru)
- `app/` (navigation, ui/mingguan, ui/laporan, di)
- `feature/pesan`
- `feature/notifikasi`

## Gerbang

Gerbang dijalankan lewat `gradle-kunci.sh` dengan target berikut:

```
:core:domain:testDebugUnitTest :core:network:testDebugUnitTest :core:data:testDebugUnitTest
:feature:pesan:testDebugUnitTest :feature:notifikasi:testDebugUnitTest :app:testDebugUnitTest :app:assembleDebug
```

Hasilnya **BUILD SUCCESSFUL**, dengan 0 tes gagal.

| Kelas tes | Tes | Isi |
|---|---|---|
| `core/domain/roles/RoleTabsTest` **baru** | 3 | Membandingkan ROLE_TABS Android (isi dan urutan) dengan salinan literal `ROLE_TABS` web, dikurangi `'pesan'`. Memastikan setiap TabId terpakai. Admin PT punya Statistik tanpa Penerimaan, dan Kadiv punya Proyek. |
| `app/navigation/PetaLayarTest` | 5 | Ditambah: STATISTIK → `LayarTab.STATISTIK`. Divisi Admin PT = `DIVISI` (divisions-view). Urutan bilah Admin PT. Proyek Kadiv. |
| `app/ui/mingguan/MingguanEntitasTest` **baru** | 2 | Dekode `entities/entityId/entityPinned`. Peran master mempertahankan PT. Peran terpaku tidak mengirim `entityId`. |
| `core/data/repo/KotakMasukRepoTest` **baru** | 4 | Satu angka bersama. Potong ≤200 per PATCH. Gagal PATCH → lepas tanda lalu muat ulang. Respons basi dibuang. `reset()`. |
| `core/network/dto/EncodeDefaultD1Test` **baru** | 6 | Bawaan wajib terkirim. `TandaiBacaRequest` tetap ringkas. DELETE berbadan `laporan-dibaca` lewat MockWebServer. |
| `feature/notifikasi/NotifikasiTest` | 14 | Memakai `KotakMasukRepo`. Ditambah `d1_s2_loncengDanRepoBersamaSatuAngka`. Peta `statistik`. |
| `feature/pesan/{PesanViewModelTest,DtoPesanTest,LogikaPesanTest}` | 9/4/6 | Memakai `NotificationsApi` + repo bersama. `statistik` → `TabId.STATISTIK` untuk Admin PT. |

## 1. Paritas ROLE_TABS

`RoleTabs.kt` kini sama persis dengan `src/lib/rbac.ts`, termasuk urutannya. Satu-satunya pengecualian adalah `'pesan'`: di Android, Pesan tampil sebagai ikon di top bar (`PesanIkon`), bukan tab. Pengecualian ini dicatat di komentar berkas dan dijaga oleh tes.

| Peran | Selisih yang diperbaiki |
|---|---|
| KEPALA_DIVISI | Ditambah `PROYEK` di akhir. Web: `dashboard, work-desk, weekly-input, divisions, projects`. |
| ADMIN_PT | `PENERIMAAN` diganti `STATISTIK`. Urutan: Ringkasan, Meja kerja, Statistik, Laporan harian, Proyek, Divisi, Eskalasi. |
| Tujuh peran lain | Diperiksa dan sudah sama. |

Perubahan pada `TabId`, `PetaLayar.kt`, dan `MKShell.kt`:
- `TabId.STATISTIK("Statistik")` ditambahkan.
- Mekanisme `TujuanEkstra` dihapus: enum, `tujuanEkstra()`, `IsiEkstra`, rute `ekstra/*`, dan baris tambahan di Sheet "Lainnya".
- `TabId.STATISTIK` → `LayarTab.STATISTIK` → `StatistikAdminScreen()`, dengan ikon `QueryStats`.
- Tab Divisi Admin PT tetap `DivisiScreen`.
- Peta tab web di `LogikaPesan.tabDariWeb` dan `NotifikasiLogika.PETA_TAB` kini memetakan `"statistik"`.

## 2. DELETE berbadan

`LaporanDibacaApi.batalTandai` kini memakai `@HTTP(method = "DELETE", path = "api/ringkasan/laporan-dibaca", hasBody = true)`. Server `DELETE` di `src/app/api/ringkasan/laporan-dibaca/route.ts` membaca `req.json()` untuk `weeklyReportId`, jadi badan memang diperlukan.

Pola `@DELETE` + `@Body` dicari di seluruh `android/`. Tidak ada temuan lain: semua `@DELETE` lainnya memakai `@Query` atau `@Path`.

## 3. S2 — satu sumber kotak masuk

Rute server untuk Pesan dan lonceng sama, jadi datanya sama: `GET /api/notifications?inbox=1` dan `PATCH {ids}|{all:true}`.

- **Baru:** `core/data/repo/KotakMasukRepo` (`@Singleton`, memakai `NotificationsApi` dari `:core:network`). Repo ini memegang:
  - `keadaan` (daftar + belum dibaca + termuat) dan `belumDibaca`;
  - tanda baca optimistis, dengan PATCH dipotong ≤200;
  - penjaga balapan C1-S5, yang kini berlaku lintas dua pengamat: muat bernomor (respons basi dibuang) dan versi PATCH;
  - pesan galat untuk 2xx tanpa badan (C1-R12);
  - `reset()` (C1-R8).
- **`:feature:pesan`:**
  - `PesanApi`, `PesanRepo`, dan `di/PesanModule` dihapus.
  - `PesanViewModel` dan `PesanIkonViewModel` kini memakai `KotakMasukRepo`.
  - `PesanDto` dan `KotakMasukDto` tetap ada sebagai model tampil, dengan pemetaan `kePesan()`/`keKotak()`.
- **`:feature:notifikasi`:** `NotifikasiViewModel` memakai `KotakMasukRepo` dan mengamati `keadaan`. Akibatnya, tanda baca dari Pesan langsung menurunkan lencana lonceng, dan sebaliknya.
- Tidak ada dependensi silang antar fitur. Kedua modul sudah bergantung pada `:core:data`, dan gradle tidak diubah.
- `InboxItemDto` dibuat lebih longgar: `template/title/body/createdAt` kini punya nilai bawaan `""`, setara `PesanDto` lama.

## 4. Pemilih PT capaian mingguan (TI/Super Admin)

`PapanMingguan` ditambah tiga kolom: `entitas`, `entitasId`, dan `entitasTerpaku`, yang berasal dari `entities`, `entityId`, dan `entityPinned` di respons.

Perubahan di `MingguanViewModel`:
- `pilihEntitas(id)` menyimpan PT pilihan, mengosongkan divisi terpilih, lalu memuat ulang `papan(entityId = …)`.
- Muat ulang dan aksi berikutnya tetap di PT yang sama, lewat `entitasSetelahMuat`.
- `muat()` membatalkan muat sebelumnya.

Di layar, ada `MkPilih` berlabel "Entitas yang dilaporkan" (padanan web `DivisionWeeklyDesk`). Pemilih ini tampil bila `!entitasTerpaku` dan PT lebih dari satu. Pemilih Divisi yang sudah ada kini mengikuti PT terpilih.

## 5. Sapuan DTO request (`encodeDefaults=false`)

Semua tipe `@Body` diperiksa terhadap `readBody` server:
- `src/app/api/tasks/route.ts`
- `weekly-input`
- `notifications`
- dan lainnya

Hasil pemeriksaan:
- Untuk tipe yang ada hari ini, nilai yang absen = nilai bawaan Android: `status → BELUM_MULAI`, `progressPct → 0`, `urgency → SEDANG`, dan `tags/subtasks → []`. Karena itu tidak ada badan yang gagal hari ini.
- Meski begitu, server memakai pola "absen = pertahankan nilai lama" untuk `picUserId`, `achievementToday`, `followUp`, dan `needsEscalation`. Badan juga "dikirim utuh". Jadi bawaan berikut kini dikirim eksplisit dengan `@EncodeDefault(ALWAYS)`, sama seperti web:
  - `TaskSaveRequest`: `tags`, `status`, `progressPct`, `urgency`, `subtasks`
  - `EntriSimpanRequest`: `tags`, `subtasks`
  - `WeeklyItemSaveRequest`: `tags`, `subtasks`
  - `SubtaskInputDto.isDone`, `WeeklySubtaskInputDto.isDone`
  - Payload antrean `PayloadHapusEntri.context` dan `PayloadUnggahBukti.targetType`, supaya pesan antrean lama tidak berubah makna bila bawaan berubah di versi berikutnya.
- Nullable `= null` sengaja tetap absen. Contohnya `picUserId`: bila absen, server mempertahankan PIC akun.
- `TandaiBacaRequest` tetap `{"ids":[…]}` / `{"all":true}`.
- `feature/pesan` dan `feature/notifikasi` kini tidak punya DTO request sendiri.
- **Dihapus:** `LaporanDeskApi`, `SimpanLaporanRequest`, `SimpanLaporanResponse` (di `app/ui/laporan/LaporanViewModel.kt`) beserta `@Provides laporanDeskApi` (di `AppModule`). Kode ini mati (catatan B1). Selain itu `:app` tidak punya plugin serialization, sehingga `@Serializable` di sana tidak menghasilkan serializer, dan badan `progressPct=0`/`achievementToday=""` akan hilang. Kini tidak ada `@Body` atau `@Serializable` di `:app`.

## Berkas

**Baru:**
- `core/data/.../repo/KotakMasukRepo.kt`
- Tes:
  - `core/domain/.../roles/RoleTabsTest.kt`
  - `core/data/.../repo/KotakMasukRepoTest.kt`
  - `core/network/.../dto/EncodeDefaultD1Test.kt`
  - `app/.../ui/mingguan/MingguanEntitasTest.kt`

**Diubah:**
- `RoleTabs.kt`
- `LaporanDibacaApi.kt`
- `DtosFase1.kt`, `DtosFase2Kadiv.kt`, `DtosOutbox.kt`
- `PetaLayar.kt`, `MKShell.kt`
- `StatistikAdminScreen.kt` (komentar)
- `MingguanViewModel.kt`, `MingguanScreen.kt`
- `LaporanViewModel.kt`, `AppModule.kt`
- `feature/pesan`: `PesanViewModel`, `PesanIkon`, `PesanDto`, `LogikaPesan`, tes
- `feature/notifikasi`: `NotifikasiViewModel`, `NotifikasiLogika`, tes

**Dihapus:**
- `feature/pesan/.../data/{PesanApi,PesanRepo}.kt`
- `feature/pesan/.../di/PesanModule.kt`

## Sisa

- `R.string.b1_tab_statistik` tidak lagi dirujuk. Label kini berasal dari `TabId.label`. String ini bisa dihapus saat `strings_b1.xml` dibenahi.
- `potongIds`/`BATAS_IDS` di `NotifikasiLogika` dipertahankan untuk tes. Pemotongan yang berlaku kini ada di repo.
