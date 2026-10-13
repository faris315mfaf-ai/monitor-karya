# C2 — QA baca-saja tab Proyek dan Eskalasi

Tanggal: 13 Okt 2026. Peninjau: agen QA (baca-saja, tanpa gradle, tanpa ubah kode).
Cakupan: `android/feature/proyek`, `android/feature/eskalasi`, plus pemakaian
`core/network` (`mkJson`, `ApiError`, Retrofit bersama AppModule) dan `designsystem`
(MkSheet, MkButton, MkChip, MkIconBtn). Kontrak dicocokkan dengan rute server
`src/app/api/{projects,projects/approve,project-stages,deadline-proposals,daily-reports,outputs,escalations,escalations/actions,undo}`.

## Ringkasan

| Severity | Jumlah |
|---|---|
| KRITIS | 1 |
| TINGGI | 1 |
| SEDANG | 6 |
| RENDAH | 9 |

Dekode respons aman. `mkJson` memakai `ignoreUnknownKeys + coerceInputValues + isLenient`.
Semua status dan peran didekode sebagai `String`, jadi nilai enum baru tidak menyebabkan crash.
Kolom nullable di server (`picName`, `division`, `raisedBy`, `decidedBy`, `entity.region`,
`latestReport`, `submittedBy`, `obstacle`, `decisionText`) semuanya nullable atau punya bawaan di DTO.
Field wajib (`ProyekDto.code/entity`, `LaporanTerakhirDto.reportDate`, `UsulanTenggatDto.proposedDate`,
`OutputDto.status`) memang selalu ada di respons server. `perms` (B3) dan `?projectId=` sudah dipakai dengan benar.
Masalahnya ada di **penyandian badan permintaan**. `mkJson` tidak menyetel
`encodeDefaults`, sehingga bawaannya `false`: properti yang nilainya sama dengan bawaan **tidak dikirim**.

---

## KRITIS

### K1 — "Ajukan ulang" tidak pernah sampai ke server, tetapi klien melaporkan sukses
- Bukti: `feature/proyek/.../data/ProyekDto.kt:193`
  `data class AjukanUlangRequest(val id: String, val resubmit: Boolean = true)`. Nilainya
  selalu sama dengan bawaan, jadi dengan `encodeDefaults=false` (`core/network/.../JsonConfig.kt:6-10`)
  badan yang terkirim hanya `{"id":"..."}`. Pemanggilnya ada di `ProyekViewModel.kt:318`.
- Server: `src/app/api/projects/route.ts:436` memeriksa `body.resubmit === true`. Karena kolom itu absen,
  alur jatuh ke `readFields(..., {partial:true})` tanpa kolom apa pun. Hasilnya `db.project.update` dengan data kosong,
  audit `UPDATE_PROJECT` palsu, lalu **200** `{ok, project(DITOLAK), undoToken:null}`.
- Skenario: pengaju menekan "Ajukan ulang". Snackbar menampilkan "X diajukan ulang." (`ProyekViewModel.kt:321`),
  tetapi proyek tetap DITOLAK dan rantai persetujuan tidak berjalan lagi. Alur bisnis inti
  ini rusak tanpa tanda apa pun.
- Perbaikan: hapus bawaannya (`val resubmit: Boolean`) dan kirim `AjukanUlangRequest(p.id, true)`, atau pasang
  `@EncodeDefault` pada kolom itu. Tambahkan tes `mkJson.encodeToString(AjukanUlangRequest(...))`
  yang memastikan string hasilnya mengandung `"resubmit":true`. Sebaiknya juga periksa
  `h.data?.project?.lifecycle != "DITOLAK"` sebelum menampilkan pesan sukses.

## TINGGI

### T1 — Urungkan untuk usulan tenggat tidak bisa dijangkau, galat tahapan tidak terlihat
- Bukti: snackbar dirender di `Box` layar daftar (`ProyekLayar.kt:88-91`). Detail, editor tahapan, dan
  usul tenggat adalah `ModalBottomSheet`/`Dialog` (window terpisah, `MkSheet.kt:182`, `:128`)
  yang tetap terbuka saat `kirim(...)` dipanggil:
  `tarikUsulan` (`ProyekViewModel.kt:534`, Urungkan = ajukan kembali),
  `kirimPutusUsulan` (`:567-570`, Urungkan keputusan ≤15 menit),
  `pindahTahap` gagal (`:453`), `hapusTahap` sukses/gagal (`:470`, `:473`), serta `simpanTahap` sukses (`:431`).
- Skenario: Direktur menyetujui usulan tenggat dari Sheet detail. Snackbar "Urungkan" muncul di bawah
  Sheet modal dan hilang setelah sekitar 10 detik. Akibatnya, Urungkan tidak pernah bisa ditekan. Galat 422
  "Urutan tahap tidak lengkap" atau galat hapus tahap juga tidak terlihat oleh pengguna.
- Perbaikan: pasang `SnackbarHost` di dalam konten MkSheet (atau slot snackbar MkSheet), atau tampilkan galat
  dan Urungkan di dalam Sheet seperti `galat`/`galatForm`.

## SEDANG

### S1 — Aksi dari Sheet yang ditutup bisa mengenai proyek lain, dan galatnya hilang
- Bukti: `kirimKeputusan`, `ajukanUlang`, `hapusProyek`, dan `arsipkanProyek` memakai `ubahDetail { }`, yang tidak
  dibatasi id (`ProyekViewModel.kt:306, 324, 357-359, 375`). `MkSheet onTutup = vm::tutupDetail`
  (`DetailProyekSheet.kt:74`) tetap bisa dipanggil saat `sibuk`.
- Skenario: Admin menekan Hapus pada proyek A, lalu menutup Sheet dan membuka proyek B sebelum respons datang.
  Server membalas 409 `canArchive`, dan dialog "Arsipkan" muncul di Sheet B. Saat dikonfirmasi, `setujuKonfirmasi`
  mengarsipkan **B** (`:338`). Jika Sheet ditutup tanpa membuka proyek lain, galat keputusan, ajukan ulang, atau hapus
  hilang tanpa jejak.
- Perbaikan: gunakan `ubahDetailUntuk(p.id)` di semua cabang galat, bawa id proyek di `Konfirmasi.ArsipkanProyek`,
  dan blokir `tutupDetail` selama `sibuk != null`. Bila tetap ditutup, kirim galat lewat snackbar.

### S2 — Formulir ditutup saat menyimpan: galat hilang dan pengajuan bisa ganda
- Bukti: `FormProyekSheet.kt:48` (`onTutup = vm::tutupForm` tanpa cek `sibuk`), `ProyekViewModel.kt:717-719`
  (`_form.update { it?.copy(...) }` tidak melakukan apa-apa bila form sudah null).
- Skenario: pengguna menekan Ajukan lalu menggeser Sheet ke bawah. POST gagal 422/409 dan pesan galat hilang.
  Pengguna yang membuka formulir lagi dan menekan Ajukan selagi POST pertama berjalan akan membuat dua proyek
  (server hanya mencegah kode bentrok, tidak mencegah duplikat).
- Perbaikan: abaikan `tutupForm` selama `sibuk`, dan arahkan galat ke snackbar bila formulir sudah tertutup.

### S3 — "Muat lagi" saat daftar sedang disegarkan melompati satu halaman
- Bukti: `ProyekViewModel.kt:127-133` hanya menolak `muat != SIAP`. Selama `menyegarkan`, `muat` tetap SIAP dan
  `nomor = nomorMuat` sama dengan nomor muat ulang yang sedang berjalan. Di `:150-162`, hasil muat ulang memasang
  `halaman=1`, lalu hasil "muat lagi" (halaman lama+1, mis. 3) ditambahkan di belakangnya.
- Skenario: setelah setujui cepat (`:197`, yang memanggil `muatDaftar`), pengguna langsung menekan Muat lagi.
  Item halaman 2 tidak pernah tampil, dan `adaLagi` membuat tombol berikutnya memuat halaman 4.
- Perbaikan: tolak `muatLagi` bila `menyegarkan`, simpan job-nya, dan batalkan job itu di `muatDaftar`.

### S4 — Tombol "Ajukan proyek" hilang permanen setelah satu galat jaringan
- Bukti: `ProyekViewModel.kt:180-185` hanya dipanggil sekali dari `init`, dan setiap `Hasil.Gagal` (termasuk
  jaringan/5xx) menghasilkan `bolehAjukan=false`. "Coba lagi" (`muatDaftar`) tidak memeriksanya ulang.
- Perbaikan: anggap hanya 403 sebagai "tidak boleh", dan ulangi pemeriksaan di `muatDaftar` bila sebelumnya gagal
  karena jaringan.

### S5 — Eskalasi: Sheet digeser saat aksi berjalan, sehingga tampilan tidak sinkron dan layar terkunci
- Bukti: `EskalasiViewModel.kt:149-152` (`tutupSheet` tidak melakukan apa-apa bila `sibuk`), sedangkan
  `ModalBottomSheet` (`MkSheet.kt:182-184`) sudah menganimasikan state ke Hidden sebelum `onDismissRequest`.
- Skenario: pengguna menggeser Sheet ke bawah saat "Tinjau" berjalan. Sheet tersembunyi, tetapi `detail != null`
  sehingga popup modal tetap ada. Jika aksi gagal, layar tidak menerima ketukan sampai tombol Kembali ditekan.
- Perbaikan: biarkan Sheet ditutup (aksi tetap berjalan, hasilnya dilaporkan lewat snackbar), atau gunakan
  `confirmValueChange` di MkSheet untuk menahan Hidden selama sibuk.

### S6 — Eskalasi: setelah 409/403, mode "Putuskan" tetap terbuka dengan izin basi
- Bukti: `EskalasiViewModel.kt:199-207`. Pada 409, `muatInternal()` menyegarkan item, tetapi
  `memutuskan=true` tetap aktif. `KakiSheet` di cabang `memutuskan` (`EskalasiTab.kt:342-356`) tidak memeriksa
  `izin.putuskan`. Bila item sudah keluar dari saringan, `susunUlang` (`:136-139`) tidak memperbarui detail.
- Skenario: Manajemen B memutuskan eskalasi yang baru saja diputuskan Manajemen A. Server membalas 409, tombol
  "Simpan" tetap aktif, dan setiap percobaan ulang menghasilkan 409 lagi.
- Perbaikan: pada 403/409 setel `memutuskan=false`, dan tutup Sheet bila item tidak lagi ada di daftar.

## RENDAH

- R1 — Usul tenggat: `canDecide` hanya didasarkan peran, sehingga tombol Tolak/Setujui juga muncul untuk usulan
  milik sendiri (Super Admin), dan server membalas 403 "Usulan Anda sendiri…"
  (`DetailProyekSheet.kt:422-425`, `deadline-proposals/route.ts:241`). Sembunyikan bila
  `proposedById == sesi.userId`.
- R2 — Formulir ubah menawarkan `AKTIF` untuk proyek DITOLAK atau yang pernah ditolak (`FormProyekSheet.kt:212-218`).
  Server menolaknya dengan 422 (T12). Galatnya memang tampil, tetapi opsinya sebaiknya tidak ditawarkan.
- R3 — 409 pada setujui cepat, keputusan, atau ajukan ulang (`ProyekViewModel.kt:199, 306, 324`) tidak memuat ulang
  daftar/detail, sehingga antrean basi tetap tampil. Panggil `muatDaftar()` dan `segarkanProyekDetail` saat `kode==409`.
- R4 — `pindahTahap` tanpa penanda sibuk (`ProyekViewModel.kt:442-456`). Ketuk ganda mengirim dua PATCH dari
  urutan yang sama-sama basi, sehingga urutan akhirnya tidak terduga.
- R5 — Simpan formulir selalu mengirim `startDate`/`targetEndDate` (`ProyekViewModel.kt:672-673`), sehingga tenggat hasil
  usulan (tengah malam WIB) berubah menjadi 00.00 UTC. Akibatnya, undo keputusan usulan tenggat (`deadline-proposals/route.ts:196-199`,
  yang mencocokkan `targetEndDate` persis) tidak lagi mengembalikan tenggat. Kirim tanggal hanya bila berubah.
- R6 — Panjang medan tidak dibatasi di klien. Nama/penjelasan dipotong server di 4000 karakter, tujuan di 2000,
  dan catatan keputusan proyek di 500 (`approve/route.ts:35`), semuanya tanpa pemberitahuan. Tambahkan `take(n)` seperti
  di editor tahap.
- R7 — Target sentuh <48dp: `MkButton` S 36dp (antrean Tolak/Setujui `ProyekLayar.kt:272-285`, blok tenggat),
  `MkChip` 36dp (saringan), dan `MkIconBtn` 44dp (empat tombol per baris tahap, `TahapanSheet.kt:83-86`).
  Tidak ada `minimumInteractiveComponentSize`. Ini masalah di tingkat designsystem.
- R8 — Eskalasi hanya memuat halaman pertama (100 item). Kalimat "n eskalasi menunggu keputusan" dan
  "n menunggu tindakan Anda" (`EskalasiModel.kt:196-211`) dihitung dari item yang termuat, bukan `total`.
  Hasilnya terlalu kecil bila jumlah eskalasi melebihi 100.
- R9 — Teks keras di Kotlin, bukan strings.xml (mis. `ProyekLayar.kt:82` "Urungkan", `Komponen.kt:190-200`,
  `FormProyekSheet.kt:144, 187, 202`, seluruh `Tampilan.kt`). Tidak ada emoji, tanda seru, atau warna non-token.
  Status selalu memakai `StatusBadge` (ikon + kata).

## Daftar prioritas

1. K1 — perbaiki `AjukanUlangRequest` (+ tes penyandian).
2. T1 — snackbar atau Urungkan di dalam Sheet.
3. S1 — `ubahDetailUntuk` + id di `Konfirmasi.ArsipkanProyek` + blokir tutup saat sibuk.
4. S2 — blokir tutup formulir saat sibuk.
5. S3 — kunci "Muat lagi" saat menyegarkan.
6. S5, S6 — sinkronisasi Sheet eskalasi saat sibuk dan setelah 409/403.
7. S4 — pemeriksaan ulang izin ajukan.
8. R1–R9.
