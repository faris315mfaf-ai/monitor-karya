# B3 — Server eskalasi: `perms` per item dan saringan `projectId`

Agen B3, 13 Oktober 2026. Menindaklanjuti saran server di
`A1-ESKALASI-PERSETUJUAN.md` (butir "Butuh parent" 3) dan `A1-PROYEK.md`
(keputusan 5, "Butuh parent" 4). Tidak ada commit, DB, atau deploy.

## Hasil gerbang

| Gerbang | Hasil |
| --- | --- |
| `npx tsc --noEmit --incremental false` | bersih |
| `npx eslint src` | bersih |
| `npx vitest run` | 103 berkas / 1.727 tes lulus (termasuk berkas baru, 18 tes) |
| `gradle-kunci.sh :feature:eskalasi:testDebugUnitTest :feature:proyek:testDebugUnitTest :feature:eskalasi:compileDebugKotlin :feature:proyek:compileDebugKotlin` | BUILD SUCCESSFUL; tanpa peringatan dari kedua modul |

Tes Android: `EskalasiDtoTest` 8, `EskalasiViewModelTest` 9, `KontrakDtoTest` 7,
`ProyekViewModelTest` 19, `TampilanTest` 7. Semuanya lulus.

## Server

### 1. Satu sumber izin: `src/lib/escalation-perms.ts` (baru)

- `escalationPerms(viewer {id, role}, e {status, raisedById})` menghasilkan
  `{mayReview, mayDecide, mayClose}`. Logikanya dipindahkan apa adanya dari
  `escalations-view.tsx` dan cermin penegakan di `actions/route.ts`.
- Modul ini murni, tanpa `server-only`, jadi bisa diimpor komponen klien.
- `escalations-view.tsx` hanya mengganti impor: fungsi lokal dihapus, impor
  `can` dan tipe `SessionUser` yang tidak terpakai juga dihapus. Perilaku web
  tidak berubah.

### 2. `GET /api/escalations`

- **`perms` per item.** Isinya `escalationPerms(user, e)` untuk akun yang
  meminta. Kolom ini aditif: klien lama mengabaikannya.
- **`?projectId=`.**
  - Akses diperiksa lewat `guardProjectAccess(user, projectId, READ_RELATIONS)`:
    404 bila proyek tidak ada, 403 bila di luar tanggung jawab. Contohnya PIC
    proyek lain, kepala divisi divisi lain, atau Admin/Direktur PT lain.
  - Lolos pemeriksaan, saringan dibentuk dari tiga sumber yang digabung OR:
    `DAILY_REPORT` dengan `sourceId` ∈ laporan proyek, `TASK` dengan
    `sourceId` ∈ task proyek, dan `id` ∈ `task.escalationId` milik proyek.
  - Saringan itu digabung AND dengan `scopeEntityIds` dan irisan pelaksana
    PIC/KADIV (T10-FIX2) yang sudah ada, jadi irisan tetap berlaku.
  - `WEEKLY_ITEM` tidak ikut karena butir mingguan tidak punya `projectId`.
- **Perbaikan saringan `overdue`.**
  - Dulu `overdue=true/false` disaring sesudah paginasi. Akibatnya halaman
    bisa kosong padahal ada eskalasi lewat SLA, dan `total` tetap hitungan
    tanpa saringan. Web pun salah menulis "x eskalasi cocok dengan saringan",
    dan catatan "Menampilkan x dari y" di Android ikut salah.
  - Sekarang id yang cocok dipilih dulu dari kolom ringan
    (`id, raisedAt, slaDays`, paling banyak 5.000 baris). Sesudah itu baru
    halaman diambil, sehingga `total` dan paginasi benar.
  - Tanpa `overdue`, jalurnya sama seperti sebelumnya: satu `findMany`
    berhalaman ditambah `count`.
  - `orderBy` diberi pemecah seri `id desc` agar irisan halaman stabil.

### 3. Tes server: `tests/api/eskalasi-perms-proyek.test.ts` (baru, 18 tes)

- **`perms` per peran.**
  - Manajemen: tinjau dan putuskan saat diajukan, tutup saat diputuskan,
    tanpa aksi saat ditutup.
  - Direktur entitas: hanya PT-nya, bisa meninjau tetapi tidak memutuskan.
  - Admin PT: tanpa aksi.
  - PIC: hanya cakupannya. Pengaju bisa menutup eskalasinya yang sudah
    diputuskan.
  - Kepala divisi: proyek divisinya ditambah butir mingguan divisinya.
  - Tabel peran × status untuk `escalationPerms` dicocokkan dengan
    `ROLE_CAPABILITIES`.
- **`projectId`.**
  - Laporan dan task, termasuk task yang tautan baliknya sudah lepas.
  - 404 untuk proyek yang tidak ada.
  - 403 tanpa membaca eskalasi untuk enam pasangan di luar cakupan
    (pic-1→p-2, pic-3→p-1, kadiv-1→p-2, kadiv-3→p-1, admin-a→p-3, dir-b→p-1).
  - PIC dan kepala divisi proyeknya tetap diiris; butir mingguan tidak ikut.
  - Admin dan Direktur PT pemilik proyek boleh membuka.
- **`overdue`.** `total`, halaman 1 dan 2, `overdue=false`, gabungan dengan
  `projectId` dan `status`, serta jalur tanpa `overdue` yang tetap sama.

## Android

### `:feature:eskalasi`: izin hanya dari `perms` server

**Keputusan: salinan logika `escalationPerms` dihapus, tanpa fallback peran.**

Server kini selalu mengirim `perms`. Bila kolom itu absen (server sebelum
B3), eskalasi tampil **baca saja**, tanpa tombol tebakan. Alasannya:

1. Android belum pernah dirilis. Server B3 harus terpasang lebih dulu
   (urutan deploy: server, baru APK). Jadi kombinasi "APK baru dengan server
   lama" hanya terjadi kalau urutan itu dilanggar, dan akibatnya pun aman:
   tidak ada aksi.
2. Mempertahankan tabel peran di klien berarti dua sumber yang bisa
   menyimpang dari `rbac.ts`. Server tetap hakim terakhir lewat 403/409.

Perubahan:

- `EskalasiModel.kt`: objek `IzinEskalasi` (tabel PENINJAU/PEMUTUS) dihapus
  dan diganti `IzinEskalasiDto?.keIzin()`. Signature `keItem` berubah dari
  `keItem(peran, idSaya, ditolak)` menjadi `keItem(ditolak)`. 403 tetap
  mengurangi aksi lewat `IzinAksi.tanpa`.
- `EskalasiViewModel.kt`:
  - Dependensi `AuthApi` dan panggilan `GET /api/auth/me` dihapus, karena
    aturan "pengaju boleh menutup" kini dihitung server.
  - Konstruktor sekarang `(EskalasiApi, UndoApi)`. Graf Hilt tetap terpenuhi.
  - `mulai(peran)` tetap dipakai sebagai penanda mulai yang idempoten.
    `EskalasiTab(peran)` dan MKShell tidak berubah.
- `EskalasiApi.kt`: hanya KDoc `IzinEskalasiDto` yang diperbarui.
- Tes:
  - Fixture `JSON_DAFTAR` kini membawa `perms`.
  - Fixture baru `JSON_DAFTAR_TANPA_PERMS` meniru server lama.
  - Tes baru:
    - izin dari server dipakai apa adanya;
    - peran sesi tidak dipakai untuk menebak (PIC dengan `mayClose` server
      melihat tombol tutup);
    - server lama membuat papan baca saja;
    - 403 mengurangi aksi.

### `:feature:proyek`: eskalasi terkait lewat `?projectId=`

- `ProyekApi.eskalasi(projectId, pageSize = ESKALASI_DIAMBIL = 50)`
  menggantikan `eskalasi(entityId, 200)`.
- `ProyekViewModel`: `muatLaporanDanEskalasi` dipecah menjadi `muatLaporan`
  dan `muatEskalasi`, dan keduanya berjalan paralel.
  - Pencocokan ke 30 laporan terakhir di klien sudah hilang. Eskalasi dari
    laporan lama dan dari task kini ikut tampil.
  - Gagalnya satu bagian tidak menjatuhkan bagian lain.
  - `LAPORAN_DIAMBIL` turun dari 30 ke 10, sama dengan jumlah yang
    ditampilkan.
- Tes:
  - Fixture eskalasi kini berupa respons yang sudah disaring server.
  - Query yang diuji: `projectId=p1`, tanpa `entityId`, `pageSize=50`, dan
    laporan `pageSize=10`.
  - Tes baru: laporan 500 sementara eskalasi tetap Siap, dan eskalasi 403
    tampil sebagai Galat sementara laporan tetap Siap.

## Saran server lain di `android/docs/fase3/*.md`

| Sumber | Saran | Status |
| --- | --- | --- |
| A1-ESKALASI-PERSETUJUAN, "Butuh parent" 3 | `perms` per eskalasi | **Selesai** (B3) |
| A1-PROYEK, keputusan 5 / "Butuh parent" 4 | saringan `projectId` | **Selesai** (B3) |
| (temuan B3) | `overdue` disaring sesudah paginasi, `total` salah | **Selesai** (B3) |
| A1-PIC-NOTIFIKASI §8.1 | `GET /api/daily-input` mengirim `countdown` berbasis 17.00 env; usul `dailyCountdownWith(rptSettings, now)` | Sisa: di luar kepemilikan (`src/app/api/daily-input`) |
| A1-PIC-NOTIFIKASI §8.2 | `/api/work-desk` tanpa tanda 24/7 eksplisit (klien menebak dari `cutoffLabel`) | Sisa: di luar kepemilikan. Usul: kolom `dailyCutoffHour: null` / `is247` |
| A1-PIC-NOTIFIKASI §8.3 | Route PIC (daily-input, tasks, evidence) tidak menerbitkan `undoToken` | Sisa: di luar kepemilikan dan bukan perubahan kecil |
| (temuan B3) | Irisan pelaksana PIC/KADIV di daftar umum hanya memakai tautan balik `task.escalationId`. Eskalasi TASK lama yang tautannya sudah pindah (diajukan ulang sesudah ditutup) tidak tampil di daftar umum PIC, padahal tampil lewat `?projectId=` | Sisa: kecil. Tambahkan `{sourceType:'TASK', sourceId ∈ task cakupan}` ke `performerWhere`. Sengaja tidak diubah karena memperluas hasil daftar umum |
| (temuan B3) | Mock pratinjau `src/components/preview/mock-proyek.ts` belum mengirim `perms` | Sisa: tidak berdampak, karena web menghitung izin sendiri dengan fungsi yang sama |

Catatan: permintaan tugas menyebut izin "teruskan" dan "urungkan". Rute aksi
eskalasi tidak punya aksi teruskan. Urungkan memakai `undoToken` dari respons
aksi (`POST /api/undo`, 15 menit), bukan izin per item. Karena itu `perms`
hanya memuat tiga aksi yang memang ada, supaya tidak ada kolom yang tidak
ditegakkan server.

## Berkas

- Baru:
  - `src/lib/escalation-perms.ts`
  - `tests/api/eskalasi-perms-proyek.test.ts`
  - `android/docs/fase3/B3-SERVER-ESKALASI.md`
- Diubah, server:
  - `src/app/api/escalations/route.ts`
  - `src/components/views/escalations-view.tsx` (hanya impor)
- Diubah, `android/feature/eskalasi/src/`:
  - `main/.../EskalasiModel.kt`
  - `main/.../EskalasiViewModel.kt`
  - `main/.../EskalasiApi.kt` (KDoc)
  - `test/.../EskalasiDtoTest.kt`
  - `test/.../EskalasiViewModelTest.kt`
- Diubah, `android/feature/proyek/src/`:
  - `main/.../data/ProyekApi.kt`
  - `main/.../data/ProyekDto.kt` (komentar)
  - `main/.../ui/ProyekViewModel.kt`
  - `main/.../ui/DetailProyekSheet.kt` (komentar)
  - `test/.../Fixture.kt`
  - `test/.../ProyekViewModelTest.kt`

## Butuh parent

1. **Urutan deploy.** Server dengan B3 dipasang sebelum APK yang memuat
   perubahan ini. Kalau tidak, tab Eskalasi tampil baca saja.
2. Dokumen A1 (`A1-ESKALASI-PERSETUJUAN.md` bagian Izin, `A1-PROYEK.md`
   keputusan 5 dan tabel kontrak) masih menggambarkan keadaan sebelum B3.
   Dokumen ini menggantikannya untuk kedua hal tersebut.
