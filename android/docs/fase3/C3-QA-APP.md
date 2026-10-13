# C3 — QA modul :app (baca-saja)

Tanggal: 13 Okt 2026. Peninjau: QA C3 (tanpa gradle, tanpa ubah kode).
Zona: `app/src/main/kotlin/id/co/monitorkarya/app/**` kecuali `ui/laporan` dan `ui/mejakerja`,
plus `AndroidManifest.xml`, `di/AppModule.kt`, `MainActivity`, `MKApp`.
Pembanding: rute server `src/app/api/**`, web `src/components/**`, `src/lib/rbac.ts`.

Ringkasan: 1 KRITIS, 3 TINGGI, 7 SEDANG, 7 RENDAH.

---

## KRITIS

### K1 — Gerbang sesi tidak mengosongkan tumpukan setelah masuk pertama: layar buntu, ViewModel akun lama bocor ke akun baru, potensi crash
- Bukti: `navigation/MkNavHost.kt:50-56`
  `popUpTo(navController.graph.findStartDestination().id) { inclusive = true }`.
  Tujuan awal graf = `login`. Setelah masuk pertama, `login` sudah dibuang (tumpukan `[beranda]`).
  Saat keluar / 401 (`SesiViewModel.sesiBerakhir`) / 403 MUST_CHANGE_PASSWORD, `popUpTo(login)` **diabaikan**
  oleh NavController karena `login` tidak ada di tumpukan, sehingga hasilnya `[beranda, login]`.
- Skenario gagal:
  1. Keluar lalu tekan Kembali di layar masuk: entri `beranda` tampil, `composable(RUTE_BERANDA)` merender
     `LayarMemuat` (MkNavHost.kt:80-86) karena status bukan `Siap`. `LaunchedEffect(target)` tidak terpicu ulang
     karena target tetap "login", jadi layar berputar selamanya.
  2. Entri `beranda` milik akun A tetap hidup bersama ViewModelStore-nya: `LuringViewModel` dan
     `NavControllerViewModel` milik `navTab` beserta semua VM tab (DashboardAdmin, Kepatuhan, Akun, Mingguan, Tim ...).
     Saat akun B masuk, `navigate(beranda){ popUpTo(login) inclusive; launchSingleTop }` membuang `login`, lalu
     singleTop **memakai ulang entri beranda milik A**. `rememberNavController` (rememberSaveable) memulihkan
     tumpukan tab A dan VM A (data A sudah termuat di `init`, tidak dimuat ulang). Hasilnya, B melihat data A
     (lintas PT bila keduanya Admin PT).
  3. Bila peran B tidak punya tab terakhir A (mis. A = Admin PT di `tab/statistik`, B = PIC), pemulihan tumpukan
     memanggil `onGraphCreated` → `IllegalStateException("Restoring the Navigation back stack failed …")`, jadi
     aplikasi crash saat masuk. Poin ini perlu dikonfirmasi lewat uji instrumentasi.
  4. Ganti sandi wajib di tengah sesi: tumpukan menjadi `[beranda(lama), ganti_sandi, beranda(baru)]`. Kembali
     dari beranda membuka lagi formulir ganti sandi padahal status sudah `Siap`.
- Perbaikan: `popUpTo(navController.graph.id) { inclusive = true }` (atau `popUpTo(0)`) untuk ketiga target.
  Tambahkan juga `key(pengguna.id) { MKShell(...) }` sebagai sabuk pengaman. Uji dengan `TestNavHostController`:
  masuk → keluar → kembali, dan masuk A → keluar → masuk B dengan peran berbeda.

---

## TINGGI

### T1 — "Setel ulang sandi" Admin PT mengunci akun: sandi acak dibuang, tanpa konfirmasi
- Bukti: `ui/akun/AkunViewModel.kt:357-389` mengirim `AkunUbahRequest(password = sandiAcak())`. Nilai sandi
  tidak pernah ditampilkan atau disimpan. `AkunScreen.kt:182-183` hanya meminta konfirmasi untuk nonaktifkan.
- Skenario: Admin PT menekan "Setel ulang sandi" pada PIC yang sudah pernah masuk. Server menolak aktivasi untuk
  akun itu (`src/lib/account-activation.ts` `eligibleAccount`: wajib AKUN_BARU disetujui, `lastLoginAt` kosong,
  dan digest kredensial tidak berubah). Layar menulis "Kata sandi baru sudah berlaku. Pemegang akun wajib
  menggantinya saat masuk berikutnya", padahal tidak ada yang tahu sandinya. PIC terkunci sampai Super Admin
  menyetel ulang lewat web. Web menampilkan sandi hasil `generatePassword()` beserta tombol salin
  (`src/components/companies/account-sheet.tsx:419-446`).
- Perbaikan: tampilkan sandi baru sekali di sheet (tombol salin bertanda sensitif, tidak masuk log atau state yang
  disimpan), atau minta admin mengetik sandi. Tambahkan dialog konfirmasi (tindakan ini mencabut akses). Untuk
  akun yang tidak layak aktivasi, jangan pakai jalur "sandi tak dikenal".

### T2 — Layar wajib ganti sandi tanpa jalan keluar akun
- Bukti: `ui/login/GantiSandiScreen.kt` hanya punya callback `onGanti`. `navigation/MkNavHost.kt:70-78` tidak
  meneruskan `vm::keluar`. Web memiliki tombol "Keluar dari akun" (`src/app/login/ganti-sandi/forced-password-form.tsx:54,165`).
- Skenario: akun direset admin, pengguna tidak tahu sandi saat ini, atau perangkat dipakai orang lain. Tidak bisa
  pindah akun. Tombol Kembali menutup aplikasi, dan saat dibuka lagi `muat()` kembali ke layar yang sama.
- Perbaikan: tambahkan parameter `onKeluar` ke `GantiSandiScreen` (tombol plain "Keluar dari akun") lalu sambungkan
  ke `vm::keluar`.

### T3 — Akun baru tampil sebelum data akun lama dibersihkan
- Bukti: `vm/SesiViewModel.kt:307-322`. `_status.value = Siap(B)` diterbitkan lebih dulu. Pembersihan
  (`uidLama != pengguna.id → mesin.hentikanDanBersihkan()`) baru berjalan di coroutine yang diluncurkan sesudahnya.
  Jalur 401 (`sesiBerakhir`, baris 221-225) sengaja menyimpan Room, outbox, dan `CacheLayar` milik A. Kunci
  `CacheLayar` tidak memuat uid (`core/data/repo/CacheLayar.kt`: `"meja-kerja:pic"`, `"laporan:meja:hari-ini"`).
- Skenario: sesi A berakhir (401), lalu B masuk di perangkat yang sama. MKShell B langsung tersusun, aliran Room dan
  potret cache menampilkan data A sampai `clearAllTables` selesai. Tulisan atau antrean B di jendela itu ikut terhapus.
- Perbaikan: jadikan pembersihan bagian sinkron dari transisi. Bersihkan dulu (suspend), baru setel `_status`
  ke `Siap`. Sertakan uid pada kunci `CacheLayar`, atau tolak baca cache bila uid berbeda.

---

## SEDANG

### S1 — Kolom sandi tanpa `KeyboardType.Password`
- Bukti: `ui/login/LoginScreen.kt:122` `KeyboardOptions(imeAction = ImeAction.Done)`. Ketiga kolom di
  `GantiSandiScreen.kt` (kini, baru, ulang) juga hanya memakai `imeAction`. `PasswordVisualTransformation` tidak
  mengubah tipe input IME.
- Dampak: keyboard dapat mempelajari atau menyarankan sandi (kamus personal), dan autofill pengelola sandi tidak mengenali kolom.
- Perbaikan: `KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrect = false, …)` (untuk sandi baru:
  `KeyboardType.Password`) + `Modifier.semantics { contentType = ContentType.Password / NewPassword }`.

### S2 — Sandi disimpan di `rememberSaveable`
- Bukti: `LoginScreen.kt:70` (`sandi`), `GantiSandiScreen.kt:63-65` (`kini`, `baru`, `ulang`).
- Dampak: nilai masuk ke Bundle saved-instance-state, yang ditulis sistem saat proses dimatikan atau aplikasi masuk
  Recents. Catatan C1-QA-MODUL §168 sudah melarang pola ini di modul lain.
- Perbaikan: pakai `remember` untuk kolom sandi. Identifier boleh tetap `rememberSaveable`.

### S3 — Tidak ada `dataExtractionRules`: perpindahan perangkat tetap menyalin basis data
- Bukti: `AndroidManifest.xml` hanya berisi `android:allowBackup="false"`, sedangkan `targetSdk = 36`
  (`app/build.gradle.kts`). Sejak Android 12, `allowBackup=false` tidak menghentikan transfer antarperangkat (D2D).
- Dampak: Room (laporan, outbox, `cache_layar`, tidak terenkripsi) dan DataStore ikut tersalin ke perangkat baru.
  EncryptedSharedPreferences sudah punya pemulihan, tetapi isi Room tetap terbawa.
- Perbaikan: `android:dataExtractionRules="@xml/data_extraction_rules"` dengan `<exclude domain="root|database|sharedpref|file" …/>`
  untuk `cloud-backup` dan `device-transfer`, plus `android:fullBackupContent="false"` untuk API < 31.

### S4 — Tautan aktivasi disalin ke papan klip tanpa penanda sensitif
- Bukti: `ui/akun/AkunScreen.kt:169-172` `clipboard.setText(AnnotatedString(url))`. Token di fragmen berlaku
  24 jam dan memberi hak menyetel sandi.
- Dampak: pratinjau papan klip Android 13+ dan riwayat papan klip keyboard menampilkan atau menyimpan tautan.
- Perbaikan: `ClipData` dengan `ClipDescription.extras.putBoolean(EXTRA_IS_SENSITIVE, true)` (API 33+, kunci
  `"android.content.extra.IS_SENSITIVE"` untuk API di bawahnya).

### S5 — Cache gambar bukti (Coil) tidak dibersihkan saat keluar
- Bukti: `ui/admin/MejaKerjaAdminScreen.kt:468` `AsyncImage` memakai ImageLoader bawaan Coil 2.7 (cache disk di
  `cacheDir/image_cache`). `MesinSinkron.hentikanDanBersihkan()` hanya membersihkan Room dan `BerkasAntre`.
- Dampak: foto bukti PT A tertinggal di perangkat bersama setelah keluar.
- Perbaikan: saat `keluar()`, panggil `imageLoader.diskCache?.clear()` dan `memoryCache?.clear()`. Bisa juga
  `diskCachePolicy(CachePolicy.DISABLED)` untuk URL bertanda 5 menit (memang tidak berguna disimpan).

### S6 — Membuka Pesan atau Pengaturan menghapus state tab aktif
- Bukti: `navigation/MKShell.kt:215-238`. Cabang `if (pesanTerbuka) … else if (pengaturanTerbuka) … else NavHost`
  mengeluarkan `NavHost` tab dari komposisi. SaveableStateHolder milik NavHost ikut hilang.
- Dampak: posisi gulir, saringan, sheet terbuka, dan isian `rememberSaveable` di tab aktif kembali ke awal setelah
  Pesan ditutup (VM tetap hidup, UI-state hilang).
- Perbaikan: biarkan NavHost tetap tersusun dan tampilkan Pesan/Pengaturan sebagai lapisan di atasnya, atau jadikan
  keduanya rute di `navTab`.

### S7 — Aksi tulis tanpa pagar klik ganda
- Bukti: `ui/mingguan/MingguanViewModel.kt:338` `simpanButir` (tambah butir: `itemId = null`), `:398` `hapusButir`,
  `:523` `aksiLaporan`. Ketiganya menyetel `_sibuk` tanpa memeriksanya lebih dulu. `ui/mejakadiv/MejaKadivViewModel.kt:106`
  `aksi()` menyetel `sibuk` tanpa memeriksanya.
- Skenario: ketukan ganda sebelum rekomposisi menonaktifkan tombol. "Tambah butir" membuat dua butir identik. Hapus
  atau serahkan kedua kalinya memunculkan banner 404/409 palsu.
- Perbaikan: `if (_sibuk.value) return` (Mingguan) dan `if (_ui.value.sibuk != null) return` (MejaKadiv) di awal fungsi.

---

## RENDAH

- **R1** `MKShell.kt:323` memanggil `StatistikAdminScreen()` tanpa `offline`. `KepatuhanScreen` tidak pernah
  menampilkan banner luring, jadi galat jaringan tampil sebagai galat biasa.
- **R2** Paritas bilah bawah: web punya `ROLE_COMPACT_TABS` (`src/lib/rbac.ts:184-187`). Manajemen di web:
  Ringkasan/Proyek/Persetujuan/Divisi. Android memakai 4 tab pertama `ROLE_TABS` (`MKShell.kt:120-123`), jadi
  Persetujuan Manajemen terselip di "Lainnya".
- **R3** Target sentuh di bawah 48dp: `ui/mingguan/MingguanScreen.kt:484` (tutup galat 24dp) dan `:714`
  (naik/turun 32dp). Pakai `Modifier.minimumInteractiveComponentSize()`.
- **R4** Warna di luar token: `ui/kepatuhan/KepatuhanScreen.kt:509-514` (`SeriDivisi` `Color(0xFF…)`). Nilainya
  cocok dengan `--data-1..6`, tetapi perlu dipromosikan ke `designsystem/theme`. Deteksi gelap memakai
  `ink.luminance() > 0.5`, bukan flag tema.
- **R5** `SesiViewModel.keluar()` (288-305): bila `POST /api/auth/logout` menjawab 401, interceptor melapor
  `BERAKHIR`. Kolektor (147-152) dapat menulis "Sesi Anda telah berakhir" di layar masuk setelah keluar eksplisit
  (urutan tergantung jadwal). Abaikan `BERAKHIR` selama `keluar` berjalan.
- **R6** `core/data/repo/KepatuhanRepo.kt` adalah `@Singleton` yang memegang data PT di memori tanpa `reset()`, dan
  tidak dipakai `KepatuhanViewModel`. Hapus kode mati ini sebelum ada yang memakainya (risiko bocor lintas akun).
- **R7** `MejaKadivViewModel.muat()` (64-92) tidak membatalkan muat sebelumnya, sehingga respons lama bisa menimpa
  yang baru setelah serah/setujui (`muat(diam = true)`). Simpan `Job` lalu batalkan, seperti `DivisiViewModel`.

---

## Diperiksa dan dinilai benar
- `mkJson`: `ignoreUnknownKeys` + `coerceInputValues` + `isLenient`.
- DTO `InboxResponse` (`dailyCountdown` nullable untuk 24/7), `TeruskanResponse.undoToken`,
  `KepatuhanResponse`/`week`/`divisions`, `WeeklyReportsListResponse`, dan `GET /api/companies`
  (`me`, `manageableRoles`, `hasPassword`) cocok dengan rute server.
- `ROLE_TABS` Android = `rbac.ts` (tanpa `pesan`, yang ada di top bar). Peta `layarUntuk` cocok dengan cabang
  `work-desk` (400 untuk akun tanpa PT ditangani `MejaTanpaPtScreen`).
- Keamanan: hanya `MainActivity` yang diekspor (launcher). `BASE_URL` https dan cleartext mati bawaan
  (targetSdk 36). Log OkHttp `BASIC` hanya di debug. Header Origin tidak dipasang. `EncryptedAuthStore` pulih dari
  kunci rusak. Interceptor 401/403 hanya memproses permintaan bercookie.
- Navigasi: `PengaturanScreen` dan Pesan punya `BackHandler`. "Lainnya" memakai `ModalBottomSheet`.
  `bukaTab` memeriksa `bolehLihatTab`.
- Teks: tidak ada emoji atau tanda seru di string zona. Status `MejaKadiv` memakai ikon + kata + `contentDescription`.

## Prioritas perbaikan
1. **K1** `popUpTo(graph.id)` + `key(pengguna.id)` (perubahan satu baris, menutup layar buntu, kebocoran, dan crash).
2. **T1** setel ulang sandi (tampilkan sandi + konfirmasi), lalu **T2** tombol keluar di layar ganti sandi.
3. **T3** urutan bersih-lalu-Siap + uid di kunci cache.
4. **S1/S2** kolom sandi (tipe Password, tanpa `rememberSaveable`), lalu **S3** `dataExtractionRules`.
5. **S7** pagar klik ganda, lalu **S6** state tab saat Pesan dibuka.
6. **S5/S4** cache Coil dan papan klip sensitif.
7. Rendah: R1–R7.
