# A1 — Tab Eskalasi dan Persetujuan (Fase 3)

Agen A1, 13 Oktober 2026. Zona: `android/feature/eskalasi/**` dan
`android/feature/persetujuan/**` saja. Tidak ada berkas lain yang diubah.

## Hasil gerbang

`gradle-kunci.sh :feature:eskalasi:compileDebugKotlin :feature:eskalasi:testDebugUnitTest :feature:persetujuan:compileDebugKotlin :feature:persetujuan:testDebugUnitTest`
lolos, tanpa peringatan dari kedua modul.

| Berkas tes | Tes | Hasil |
| --- | --- | --- |
| `EskalasiDtoTest` | 7 | lulus |
| `EskalasiViewModelTest` | 8 | lulus |
| `PersetujuanDtoTest` | 6 | lulus |
| `PersetujuanViewModelTest` | 8 | lulus |

## Titik masuk publik

```kotlin
// id.co.monitorkarya.feature.eskalasi
@Composable fun EskalasiTab(peran: Peran, modifier: Modifier = Modifier)

// id.co.monitorkarya.feature.persetujuan
@Composable fun PersetujuanTab(peran: Peran, modifier: Modifier = Modifier, onBukaEskalasi: (() -> Unit)? = null)
```

`onBukaEskalasi` bersifat opsional dan diberi nilai bawaan, jadi panggilan
`PersetujuanTab(peran, modifier)` tetap sah. Bila diisi, kartu "Eskalasi
terbuka" menampilkan tombol "Buka eskalasi" dan barisnya bisa diketuk.

## Berkas

| Modul | Berkas | Isi |
| --- | --- | --- |
| eskalasi | `EskalasiApi.kt` | DTO `@Serializable`, `EskalasiApi` (GET `api/escalations`, POST `api/escalations/actions`), `EskalasiModule` |
| eskalasi | `EskalasiModel.kt` | status, kebutuhan, sumber, `IzinEskalasi`, `susunPapan`, `tahapAlur`, format waktu |
| eskalasi | `EskalasiViewModel.kt` | `@HiltViewModel`: muat, saringan, Sheet, tinjau/putuskan/tutup, Urungkan |
| eskalasi | `EskalasiTab.kt` | layar, Sheet detail, pratinjau |
| eskalasi | `res/values/strings_eskalasi.xml` | string layar |
| persetujuan | `PersetujuanApi.kt` | DTO, `PersetujuanApi` (ringkasan, approval-requests, berkas, deadline-proposals, projects/approve), `PersetujuanModule` |
| persetujuan | `PersetujuanModel.kt` | item antrean, riwayat, `susunMeja`, format rupiah, tanggal dan ukuran berkas, pesan |
| persetujuan | `PersetujuanViewModel.kt` | `@HiltViewModel`: antrean, riwayat, setujui/tolak, Urungkan, tautan berkas |
| persetujuan | `PersetujuanTab.kt` | layar, Sheet rincian, pratinjau |
| persetujuan | `res/values/strings_persetujuan.xml` | string layar |

## Eskalasi (paritas `escalations-view.tsx`)

- **Kepala layar:** konteks, judul, kalimat jawaban dan kalimat dukungan.
  Teksnya sama dengan Hero web: lewat SLA, giliran Anda, dan yang sudah
  diputuskan tetapi belum ditutup.
- **Saringan:** chip status (Semua, Diajukan, Ditinjau, Diputuskan, Ditutup),
  chip "Lewat SLA" (status late), dan pilihan kebutuhan. Semua saringan
  dikirim sebagai query server: `status`, `needed`, `overdue=true`.
  `pageSize=100`. Bila ada lebih banyak, tampil catatan "Menampilkan x dari y".
- **Papan:** kanban web disusun bertumpuk per status di ponsel. Tiap bagian
  diawali lencana dan jumlah. Kartu memuat entitas, kode dan wilayah, ringkasan,
  kebutuhan, umur dari SLA, pengaju, waktu relatif, dan pemutus.
- **Sheet detail:** ringkasan; sumber (laporan harian, butir mingguan, atau
  tugas, plus kode sumber); entitas; pengaju. Ada juga alur vertikal Diajukan →
  Ditinjau → Diputuskan → Ditutup. Tahap yang terlambat diberi ikon peringatan
  dan teks "Lewat SLA". Bagian keputusan memuat pemutus dan teksnya.
- **Aksi:** POST `{action, id, decisionText?}`.
  - "Tandai ditinjau" menjadi sekunder bila Anda juga bisa memutuskan, supaya
    hanya ada satu tombol primer.
  - "Putuskan eskalasi" membuka isian keputusan (minimal 10 karakter, sama
    dengan server).
  - "Tutup eskalasi" mengikuti aturan yang sama dengan server.
  - Bila berhasil, Sheet tertutup dan snackbar "Urungkan" muncul jika ada
    `undoToken`. Urungkan memakai `POST /api/undo` dan papan dimuat ulang.
- **Galat:** semua lewat `ApiError.dari(...).pesanTampil()`.
  - 403: tombol aksi itu disembunyikan untuk eskalasi tersebut dan pesannya
    tampil di Sheet.
  - 409: papan dimuat ulang dan pesannya tampil di Sheet.
  - 422 dan jaringan: pesannya tampil di Sheet.
  - Galat saat memuat menampilkan `ErrorNote` dengan tombol "Coba lagi".
- **Izin:** server belum mengirim izin per eskalasi.
  - DTO sudah menerima kolom opsional `perms {mayReview, mayDecide, mayClose}`
    dan memakainya lebih dulu bila ada.
  - Selama kolom itu belum ada, `IzinEskalasi` dipakai. Isinya salinan persis
    `escalationPerms` web dan kapabilitas `escalation:followup` /
    `escalation:decide` dari `ROLE_CAPABILITIES`.
  - Aturan "pengaju boleh menutup" memakai id akun dari `GET /api/auth/me`
    (`AuthApi` dari AppModule), bukan tebakan klien.
  - Server tetap hakim terakhir lewat 403/409.

## Persetujuan (paritas `approvals-view.tsx`)

- **Sumber data:** sama dengan web, yaitu `GET /api/ringkasan` (bagian
  `approvalRequests`, `deadlineProposals`, `decisions`, `escalations`, `viewer`,
  `scope`) ditambah `GET /api/approval-requests?decided=1` untuk riwayat.
  Keduanya dimuat paralel. Bila riwayat gagal, antrean tetap tampil.
- **Izin hanya dari server:**
  - `viewer.canDecideApproval === false` membuat baris baca saja dengan
    lencana "Menunggu keputusan".
  - `viewer.canDecideDeadline === false` menyembunyikan usulan tenggat (sama
    dengan web).
  - `decisions` proyek sudah disaring server ke slot milik akun ini.
  - 403 mengubah baris itu menjadi baca saja.
- **Antrean:** kartu "Materi, anggaran, dan cuti", "Usulan geser tenggat",
  "Pengajuan proyek baru", dan "Eskalasi terbuka" (baca saja, paling banyak 8).
  Tiap baris berisi avatar, judul, pengaju, waktu, dan meta: nominal ringkas,
  rentang cuti, "semula …", atau PT. Tombol Setujui sekunder dan Tolak polos.
  Sesudah diputuskan, baris meredup dan diberi lencana Disetujui/Ditolak.
  Hitungan menunggu ikut berkurang.
- **Sheet rincian:** jenis, divisi, proyek, PT; nominal penuh ("Rp
  48.500.000"); rentang cuti atau usulan tenggat; penjelasan atau alasan PIC;
  dan tombol "Buka <berkas> · <ukuran>".
  - Berkas dibuka lewat `GET api/approval-requests/berkas?id=`, yang memberi
    tautan bertanda tangan 5 menit. Tautan dibuka dengan `LocalUriHandler`.
    Bila tidak ada aplikasi yang bisa membukanya, muncul pesan.
  - Tolak (dari baris atau Sheet) membuka isian alasan. Alasan wajib minimal 5
    huruf, sama dengan web.
- **Kirim keputusan:**
  - Permintaan: `PATCH api/approval-requests {id, action, note?}`.
  - Usulan tenggat: `PATCH api/deadline-proposals`.
  - Proyek: `POST api/projects/approve {projectId, decision, note?}`. Tolak
    proyek dengan alasan juga bisa langsung dari sini; server mendukung
    `DITOLAK` dengan alasan minimal 5 huruf.
- **Urungkan (15 menit):** permintaan dan tenggat memakai
  `PATCH {action:"undo"}`, proyek memakai `undoToken` dan `POST /api/undo`.
  Kalimat toast sama dengan web.
- **Galat:** 409 memuat ulang antrean. Pesan tampil di Sheet bila baris itu
  sedang terbuka, selain itu di snackbar.
- **Riwayat:** segmented Antrean/Riwayat. Riwayat berisi keputusan 14 hari
  dengan lencana, pemutus, waktu relatif, dan catatan.

## Butuh parent

1. **Pasang di MKShell:** `TabId.ESKALASI` → `EskalasiTab(peran)`;
   `TabId.PERSETUJUAN` → `PersetujuanTab(peran, onBukaEskalasi = { /* pilih tab ESKALASI */ })`.
   `settings.gradle.kts` dan `app/build.gradle.kts` sudah memuat kedua modul.
2. **DI:** modul ini menyediakan `EskalasiApi` dan `PersetujuanApi`, dan
   meng-inject `Retrofit`, `AuthApi`, `UndoApi` dari AppModule. Tidak ada
   binding ganda.
3. **Saran server (di luar zona):** tambahkan `perms` per item pada
   `GET /api/escalations`, dihitung dengan `can()` + status + `raisedById`.
   Dengan begitu izin tombol eskalasi sepenuhnya dari server. Klien sudah siap
   membacanya tanpa perubahan.
4. **Catatan:** saat percobaan pertama, `:core:data` sempat gagal dikompilasi
   (`SyncWorker.kt: hapusKedaluwarsa`, milik agen lain). Pada percobaan
   berikutnya sudah hijau. Kedua modul ini mendeklarasikan `:core:data` di
   gradle tetapi tidak memakainya.
