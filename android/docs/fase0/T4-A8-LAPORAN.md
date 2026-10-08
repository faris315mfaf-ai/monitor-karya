# Laporan T4-A8 — Fase 0: modul `:app` (Application, DI, MainActivity, navigasi, VM sesi)

Dikerjakan Zcode (agen T4-A8), 8 Oktober 2026. Zona: `android/app/` saja (plus laporan ini). Tanpa git/jaringan/DB; Gradle TIDAK dijalankan (larangan tugas). Seluruh nama kontrak lintas agen diverifikasi terhadap berkas yang sudah mendarat di worktree (A1–A7, A9 selesai saat tugas ini berjalan).

## Berkas yang dibuat/diubah

| Berkas | Status | Isi |
| --- | --- | --- |
| `app/src/main/kotlin/id/co/monitorkarya/app/MKApp.kt` | baru | `@HiltAndroidApp Application` + `Configuration.Provider` WorkManager **konfigurasi bawaan** (placeholder Fase 0: tanpa `HiltWorkerFactory`, log DEBUG/WARN mengikuti `BuildConfig.DEBUG`). |
| `app/src/main/kotlin/id/co/monitorkarya/app/di/AppModule.kt` | baru | `@Module @InstallIn(SingletonComponent)` (semua `@Provides @Singleton`): `authStore(@ApplicationContext) = EncryptedAuthStore(...)`; `okHttpClient = MkClient.okHttp(authStore, BuildConfig.DEBUG)`; `retrofit(ok)` memanggil helper `retrofit(baseUrl, ok)` (Retrofit tunggal + konverter `mkJson`); `authApi(retrofit)`, `ringkasanApi(retrofit)`; `mkDatabase = buatDb(...)`, `mkPrefs = MkPrefs(...)`. |
| `app/src/main/kotlin/id/co/monitorkarya/app/MainActivity.kt` | baru | `@AndroidEntryPoint ComponentActivity`, `enableEdgeToEdge()`, `setContent`: `prefs.aksen`/`prefs.tema` (Flow MkPrefs) → `MkAccent` (string→enum, asing jatuh merah — padanan `parse()` tampilan.ts) + tema `system/light/dark` → `MKTheme(darkTheme, accent) { MkNavHost() }`. |
| `app/src/main/kotlin/id/co/monitorkarya/app/vm/SesiViewModel.kt` | baru | `@HiltViewModel`; `status: StateFlow<SesiUiState>` = `Memuat / TanpaSesi / WajibGantiSandi(PeranPengguna) / Siap(PeranPengguna)`; fun `muat()`, `masuk(identifier, sandi)`, `gantiSandi(kini, baru)`, `keluar()`; tambahan `sibuk` + `pesanGalat` untuk formulir. `SesiUseCase` (A7) di-construct di VM dengan 4 lambda ke `AuthApi` (detail di bawah). `uidTerakhir` (+ `pernahMasuk`) disimpan ke `MkPrefs` setiap kali status menjadi `Siap`. |
| `app/src/main/kotlin/id/co/monitorkarya/app/navigation/MkNavHost.kt` | baru | NavHost akar rute `"login"`, `"ganti_sandi"`, `"beranda"`; gerbang sesi: `LaunchedEffect(target)` menavigasi sesuai status dengan `popUpTo(startDestination){inclusive}` + `launchSingleTop` (tumpukan bersih — kembali dari beranda keluar aplikasi, bukan ke login). Selimut `LayarMemuat` (indikator + "Memuat…") menutup layar selama pemeriksaan sesi awal supaya login tidak berkedip. |
| `app/src/main/kotlin/id/co/monitorkarya/app/navigation/MKShell.kt` | baru | `Scaffold` + `TopAppBar` (nama aplikasi · label peran + tombol Keluar opsional) + `NavigationBar` (ikon material outlined per `TabId`, label dari `TabId.label`) + NavHost tingkat tab rute `tab/<nama>`; `RINGKASAN` dipaksa tab pertama/beranda; tab lain → `PlaceholderTabScreen(label)`; navigasi tab memakai saveState/restoreState. |
| `app/src/main/res/values/strings.xml` | baru | `app_name`, 13 label tab (cermin `TabId.label`), dua penyesuaian peran (`tab_hari_ini`, `tab_tim_divisi`), umum (`Memuat…`, `Coba lagi`, `Keluar`, `Ganti kata sandi`, luring), `nav_utama`, `fase0_belum_dibangun`. |
| `app/build.gradle.kts` | ubah | +`buildConfig = true`; +`buildConfigField BASE_URL` default `https://monitorkarya.tech/` (komentar TODO: debug staging belum ada URL); +deps: `retrofit`, `okhttp`, converter kotlinx-serialization, `kotlinx-serialization-json`, `kotlinx-coroutines-core`, `androidx.work.runtime-ktx` (semua alias katalog yang sudah ada), +`material-icons-extended` langsung dari compose-bom (lihat catatan 3). |
| `app/src/main/AndroidManifest.xml` | ubah | `android:label` literal → `@string/app_name` (permintaan eksplisit laporan A1). Tidak menyentuh berkas agen lain. |

## Peta rute

```
MKApp (Hilt) ─ MainActivity (edge-to-edge, MKTheme dari MkPrefs)
  └ MkNavHost (NavHost akar, startDestination "login")
      ├ "login"        → LoginScreen(A4): memuat=sibuk, pesanGalat, onMasuk=vm::masuk
      ├ "ganti_sandi"  → GantiSandiScreen(A4): pesan, onGanti(kini,baru,ulang) → vm.gantiSandi(kini,baru)
      └ "beranda"      → MKShell(pengguna dari SesiUiState.Siap, onKeluar=vm::keluar)
                          └ NavHost tab (tab/ringkasan, tab/proyek, … sesuai ROLE_TABS peran)
                              ├ RINGKASAN → RingkasanScreen(vm = hiltViewModel()) (A9; offline=false dulu)
                              └ lainnya   → PlaceholderTabScreen(label)
```

Status menggerakkan rute: `Memuat` → selimut muat; `TanpaSesi` → login; `WajibGantiSandi` → ganti_sandi; `Siap` → beranda. Setelah `gantiSandi` sukses → profil dimuat ulang → `Siap` → beranda otomatis. `keluar()` → `TanpaSesi` → login.

## Keputusan DI

1. **Semua `@Provides @Singleton`** di satu `AppModule` (sesuai Rancangan §6: DI dipusatkan di `:app`); tanpa `@Binds` — semua kelas konkret.
2. **Satu Retrofit dibagikan** `authApi` + `ringkasanApi` (konverter `mkJson` sama dengan `Factory.buatApi` A5 — `buatApi` tidak dipakai karena membangun Retrofit sendiri per panggilan; helper `retrofit(baseUrl, ok)` tetap disediakan sesuai bentuk tugas).
3. **`BASE_URL` lewat `BuildConfig`** (bukan konstanta Kotlin) supaya build type debug bisa menimpa ke staging tanpa menyentuh kode — URL staging sendiri belum diketahui di repo (Rancangan §6 menyebut "debug pakai staging" tanpa alamat).
4. **Dependensi `:core:network` dideklarasikan ulang di `:app`** (retrofit/okhttp/converter/json) karena A5 memakai cakupan `implementation` — Retrofit/OkHttpClient/konverter yang disentuh langsung oleh `AppModule` harus ada di classpath kompilasi `:app`.

## Perilaku SesiViewModel (kontrak A7 yang perlu dipahami)

- `SesiUseCase(login, saya, gantiSandi, keluarSesi)` di-construct di VM; lambda memanggil `AuthApi` langsung; `ApiError.dari(HttpException(res)).pesanTampil()` menjadi sumber pesan.
- **`muatSaya()` menelan semua galat → null** (perilaku A7): gangguan jaringan saat mulai dingin tampak sebagai `TanpaSesi` (ke layar masuk). Diterima untuk Fase 0 — layar masuk adalah tempat mencoba lagi.
- **`mustChangePassword` saat muat dingin** tidak muat dalam kontrak `saya(): PeranPengguna?`, jadi dititipkan lewat `@Volatile wajibGantiSandiTerakhir` yang diisi lambda `saya` dari `MeUserDto.mustChangePassword`, dibaca `muat()` setelah `muatSaya()` kembali. Bila A7 kelak melebarkan kontrak (mis. `HasilSesi`), titipan ini boleh dibongkar.
- **`masuk`** = POST login → 200 → panggil `saya()` sekali untuk melengkapi `scopeEntityId` (DTO login tidak memuatnya; jatuh kembali ke DTO login bila `saya()` gagal) → `Siap`/`WajibGantiSandi` sesuai `mustChangePassword`. 401/403/429/503 → `HasilLogin.Gagal(pesan dari server)`; 403 `MUST_CHANGE_PASSWORD` (defensif, belum terjadi di rute login) → coba `muatSaya()` lalu `WajibGantiSandi`.
- **`gantiSandi`** → `ubahSandi` (validasi panjang 8–256 dsb. di use case A7) → sukses → muat ulang profil (server mengganti cookie sesi; CookieJar A5 otomatis menyimpan) → `Siap`; gagal → `pesanGalat` ke layar. 422 dipetakan `false` → "Kata sandi lama tidak cocok." (pesan kebijakan server yang spesifik tidak lolos lewat kontrak Boolean A7 — pra-validasi klien sudah menutup mayoritas kasus).
- **`keluar`** → POST logout (kegagalan diabaikan, cookie lokal tetap dihapus `authStore.hapus()` — sesuai catatan A5) → `TanpaSesi`. **`uidTerakhir` sengaja TIDAK dihapus** agar layar masuk bisa mempraisi identifier nanti; `pernahMasuk=true` juga disimpan saat `Siap` (additif, tidak diminta spec — mudah dibuang).

## Integrasi silang yang HARUS dicek parent

1. **Impor rusak di berkas A4/A9 (tidak saya sentuh — zona mereka), memblok kompilasi `:app`**: `LoginScreen.kt`, `GantiSandiScreen.kt`, `RingkasanScreen.kt`, `PlaceholderTabScreen.kt` mengimpor paket pendek `designsystem.components.*` (nyata: `id.co.monitorkarya.designsystem.components.*`; laporan A9 menyebut "nama paket persis tugas" — teks tugas mereka keliru). Khusus `LocalMkColors`/`LocalAccent` letaknya di `…designsystem.theme` (MkColor.kt), bukan `.components`. Perbaikan mekanis: ganti awalan `designsystem.components.` → `id.co.monitorkarya.designsystem.components.` dan `…components.LocalMkColors` → `…theme.LocalMkColors`. Ditambah `RingkasanViewModel.kt`: `id.co.monitorkarya.core.network.RingkasanApi` → `id.co.monitorkarya.core.network.api.RingkasanApi`. Ditambah `MkButton.kt` (A3) mengimpor paket `motion` padahal `LocalReducedMotion`/`MkEasing` ada di `theme` (sudah ditandai laporan A4 sendiri).
2. **`material-icons-extended` tidak ada di katalog**; saya deklarasikan langsung di `app/build.gradle.kts` (versi dari compose-bom). Perlu ditaruh di katalog + ditambahkan juga ke `:designsystem` (A3 memakai `Inbox`, `NotificationsActive`, `Schedule` yang juga extended). Bila BOM 2026 sudah tidak memetakan artefak ikon (beku di 1.7.8), pin versi itu.
3. **WorkManager**: `work-runtime-ktx` (alias katalog) saya tambahkan ke `:app`. `MKApp` memakai `Configuration.Provider` tanpa menghapus inisialisasi bawaan di manifest → WorkManager mencatat peringatan saat runtime (tidak fatal). Saat worker sinkronisasi dibuat: sisipkan `HiltWorkerFactory` + meta-data `androidx.startup` removal di manifest.
4. **`buildConfig = true` + `BASE_URL`**: saya nyalakan di `app/build.gradle.kts` (AGP baru default mati) — diperlukan `MKApp` dan `AppModule`. `debug` build type masih memakai BASE_URL produksi; saat URL staging tersedia, timpa lewat `buildConfigField` di blok `debug` (komentar sudah disiapkan).
5. **`PlaceholderTabScreen` mendarat di `app/ui/placeholder`** (bukan designsystem) — impor saya mengikuti lokasi nyata. `RingkasanScreen(vm = hiltViewModel())`: parameter `offline` dibiarkan default `false`; pemantau konektivitas belum ada di Fase 0 (parameternya sudah disiapkan A9).
6. **Label tab dua sumber**: runtime memakai `TabId.label` (domain); `strings.xml` menyiapkan cermin + dua penyesuaian peran yang dipakai `MKShell` (`tab_hari_ini` untuk PIC, `tab_tim_divisi` untuk MANAJEMEN — port `tabLabel()` shell.tsx). Bila ingin satu sumber, pindahkan penyesuaian itu ke RoleTabs (zona A7/domain) dan buang `labelTab` di MKShell.
7. **`res/values/strings.xml` tunggal di `:app`**: A4/A9 meng-hardcode string di layar mereka (tidak memakai resource) — tidak konflik berkas; penyatuan menyusul.

## Verifikasi

Tanpa Gradle (larangan). Pemeriksaan statis yang dilakukan: setiap impor/simbol lintas agen dicek terhadap berkas nyata di worktree (`SesiUseCase`+`HasilLogin`/`HasilUbahSandi` A7; `MKTheme`/`MkAccent` A2; `AuthApi`/`MkClient`/`MkAuthStore`/`EncryptedAuthStore`/`ApiError`/`mkJson` A5; `MkPrefs`/`buatDb` A6; `tabsUntuk`/`TabId` A7; `LoginScreen`/`GantiSandiScreen` A4; `RingkasanScreen`/`RingkasanViewModel` A9; `PlaceholderTabScreen`). Pemetaan `when` ikon/label lengkap untuk seluruh 13 `TabId`. Kompilasi sungguhan menunggu perbaikan impor butir 1 oleh parent.
