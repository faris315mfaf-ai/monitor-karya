# T5-B8 — Navigasi Fase 1 (tab PIC nyata) · Laporan

Agen: T5-B8 · 8 Oktober 2026 · Zona: `app/navigation/**`, `res/values/strings.xml`, dua jahitan terkendali di luar zona (SesiViewModel, RingkasanScreen — satu baris deprekasi, diizinkan brief). Tanpa git/jaringan/DB/gradle sesuai batas tugas.

## Peta rute akhir

### MkNavHost (akar — TIDAK berubah strukturnya)

| Rute | Isi | Gerbang |
|---|---|---|
| `login` | LoginScreen | SesiUiState.TanpaSesi |
| `ganti_sandi` | GantiSandiScreen | SesiUiState.WajibGantiSandi |
| `beranda` | MKShell(peran) | SesiUiState.Siap |

**Keputusan: rute akar `meja`/`laporan`/`proyek` TIDAK ditambahkan** ("bila perlu" — tidak perlu). Navigasi tiga layar baru hidup di NavHost tingkat-tab milik MKShell sendiri (`tab/meja_kerja`, `tab/laporan_harian`, `tab/proyek` — turunan `TabId.rute()`), sehingga gerbang sesi F0 tetap tiga rute dan tidak bisa dilewati. Menambah rute akar akan menduplikasi tujuan dan menembus gerbang.

### MKShell (tingkat tab)

- `pindahTab(tab)` — satu fungsi lokal pola simpan/pulihkan state (`popUpTo findStartDestination { saveState }` + `launchSingleTop` + `restoreState`), kini dipakai NavigationBar DAN callback antarlayar.
- `IsiTab(peran, tab, bukaLaporan)` — penentu isi per tab:
  - `RINGKASAN` → `RingkasanScreen(vm = hiltViewModel())` — semua peran (F0, tetap).
  - `PIC_PROYEK + MEJA_KERJA` → `MejaKerjaScreen(vm, onBukaLaporan, onBukaTugas)`.
  - `PIC_PROYEK + LAPORAN_HARIAN` → `LaporanHarianScreen(vm)`.
  - `PIC_PROYEK + PROYEK` → `ProyekScreen(vm)`.
  - Selain itu → `PlaceholderTabScreen` (peran lain tetap placeholder sampai fasenya — termasuk ADMIN_PT/KADIV yang memiliki tab bernama sama; layar B4/B5/B7 dibangun untuk alur PIC di Fase 1).
- `onBukaLaporan` & `onBukaTugas` (B4) versi sederhana sesuai brief: keduanya `pindahTab(LAPORAN_HARIAN)`. Navigasi param/sheet tugas menyusul bila B4 memintanya.
- Ikon tab: TIDAK diubah — pemetaan F0 (Dashboard/Work/Description/FolderOpen + 9 lainnya) sudah "material outlined sesuai makna (home/work/description/folder)" dan paritas glyph web (`ringkasan` = grid 4 kotak → `Dashboard`, `proyek` = folder → `FolderOpen`, dst.).

## Kontrak yang ditulis nav-nya (berkas T5-B4..B7 belum ada saat penulisan)

Nav dikompilasi terhadap kontrak nama/param berikut — **parent wajib merangkai/merujuki**:

| Agen | Kontrak yang diasumsikan MKShell/SesiViewModel |
|---|---|
| T5-B4 | `id.co.monitorkarya.app.ui.mejakerja.MejaKerjaScreen(vm: MejaKerjaViewModel = hiltViewModel(), onBukaLaporan: () -> Unit, onBukaTugas: () -> Unit)` |
| T5-B5 | `id.co.monitorkarya.app.ui.laporan.LaporanHarianScreen(vm: LaporanHarianViewModel = hiltViewModel())` |
| T5-B7 | `id.co.monitorkarya.app.ui.proyek.ProyekScreen(vm: ProyekViewModel = hiltViewModel())` |
| T5-B2 | `id.co.monitorkarya.app.sync.SyncScheduler.jadwalkanSekaliSaatOnline(context: Context)` — objek/fungsi statis level app module |

Bila agen B2/B4/B5/B7 mendarat dengan paket/param berbeda, jahitan ada di 3 titik saja: import + panggilan di `MKShell.IsiTab`, import `SyncScheduler` di `SesiViewModel`. Sampai berkas itu mendarat, `:app` BELUM dikompilasi (dirancang demikian — swarm paralel; gradle tidak dijalankan di agent ini sesuai batas).

## Jadwal sinkronisasi (T5-B2) di SesiViewModel

Zona F0 `app/vm/` — disunting terbatas sesuai izin brief:

1. Import `Context`, `@ApplicationContext`, `SyncScheduler` (3 baris import).
2. Parameter konstruktor `@ApplicationContext private val context: Context` — wajib karena `jadwalkanSekaliSaatOnline(context)` butuh konteks dan ViewModel Hilt hanya mendukung injeksi konstruktor.
3. Satu baris pemanggilan `SyncScheduler.jadwalkanSekaliSaatOnline(context)` di `ubahStatus()` tepat setelah state jatuh ke `Siap` — tercapai dari semua jalur (muat dingin, login, ganti sandi); kontrak B2 menyebut idempoten.

## Perbaikan deprekasi app-level

1. **`hiltViewModel` pindah paket** (MKShell, MkNavHost): `androidx.hilt.navigation.compose.hiltViewModel` → `androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel`. Terverifikasi tanpa gradle: cache lokal memuat `hilt-navigation-compose-1.3.0.module` yang mendeklarasikan `androidx.hilt:hilt-lifecycle-viewmodel-compose:1.3.0` pada varian **api** (compile classpath), dan `javap` pada jar lama menunjukkan `@Deprecated(message="Moved to package: androidx.hilt.lifecycle.viewmodel.compose", replaceWith=import baru)`. **Tidak perlu naikkan versi/ubah gradle** — 1.3.0 sudah memuat kelas pengganti.
2. **`ReceiptLong` AutoMirrored** (MKShell): `Icons.Outlined.ReceiptLong` → `Icons.AutoMirrored.Outlined.ReceiptLong` (ikon mencerminkan arah layout RTL).
3. **`Locale` konstruktor deprecated** (RingkasanScreen:112): `Locale("id","ID")` → `Locale.forLanguageTag("id-ID")` — perbaikan satu baris di zona B4/F0 ui/ringkasan sesuai izin brief. (Catatan: PARENT-INTEGRASI menulis `Locale("in","ID")`; di kode sebenarnya sudah `"id","ID"` — deprekasi sama, obat sama.)

Deprekasi LAIN yang TIDAK disentuh (di luar wewenang): `KeyboardOptions(autoCorrect=…)` di 2 layar login (zona layar login), `LifecycleViewModelComponent` (menyusul bersama B2), `exportSchema` (CI).

## strings.xml

Label tab F0 sudah lengkap untuk seluruh `TabId` (tidak perlu tambah). Ditambah blok F1: `layar_meja_kerja`, `layar_laporan_harian`, `layar_proyek` — judul layar tab PIC, dipisah dari label tab agar judul bisa berbeda dari navigasi; agen B4/B5/B7 boleh mengikatnya (`R.string.layar_…`) atau memakai teks sendiri.

## Yang parent perlu rangkai (urutan perakitan)

1. Terima berkas B2 (`app/sync/SyncScheduler.kt`), B4 (`app/ui/mejakerja/`), B5 (`app/ui/laporan/`), B7 (`app/ui/proyek/`) — cocokkan paket/param dengan tabel kontrak di atas; sesuaikan 3 titik jahitan bila beda.
2. `./gradlew :app:assembleDebug` + `:app:lintDebug` (gradle hanya di tangan parent/CI).
3. Uji perangkat: login PIC → 4 tab nyata; tombol meja kerja pindah ke tab Laporan harian; peran non-PIC masih placeholder; keluar-masuk tidak menumpuk pekerjaan sinkron (idempotensi B2).
4. Ganti sandi → `Siap` juga memicu jadwal sinkron (sengaja, sesuai kontrak "saat Siap").

## Berkas yang diubah

- `android/app/src/main/kotlin/id/co/monitorkarya/app/navigation/MKShell.kt` (tab PIC nyata, pindahTab, IsiTab, 2 deprekasi)
- `android/app/src/main/kotlin/id/co/monitorkarya/app/navigation/MkNavHost.kt` (import hiltViewModel + catatan rute)
- `android/app/src/main/kotlin/id/co/monitorkarya/app/vm/SesiViewModel.kt` (jadwal B2: 3 import + param konteks + 1 panggilan)
- `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/ringkasan/RingkasanScreen.kt` (1 baris Locale)
- `android/app/src/main/res/values/strings.xml` (3 judul layar F1)
