# A2 — Ringkasan pemantau grup + Kotak masuk terpadu (Fase 3)

Tanggal: 13 Oktober 2026 · Cabang `claude/perbaiki-bug-sisa` · Kepemilikan: `android/feature/ringkasangrup/**`, `android/feature/pesan/**` saja.

## Hasil gerbang

Dijalankan lewat `gradle-kunci.sh`:

| Tugas | Hasil |
|---|---|
| `:feature:ringkasangrup:compileDebugKotlin` | lulus (1 peringatan: `hiltViewModel` usang, sama dengan kode :app) |
| `:feature:ringkasangrup:testDebugUnitTest` | 27 tes lulus (4 kelas) |
| `:feature:pesan:compileDebugKotlin` | lulus |
| `:feature:pesan:testDebugUnitTest` | 14 tes lulus (3 kelas) |

## 1. `:feature:ringkasangrup`

Titik masuk: `@Composable fun RingkasanGrupTab(peran: Peran, modifier: Modifier = Modifier)` (paket `id.co.monitorkarya.feature.ringkasangrup`).

### Paritas web
Padanan web: `oversight-dashboard.tsx` → `management-dashboard.tsx` + `company-reports.tsx`, ditambah `management-charts.tsx`, `compliance-treemap.tsx` dan `kpi-trend-chart.tsx`.

- Kepala layar: cakupan (seluruh grup / nama PT / n perusahaan) dan tanggal WIB. Satu kalimat jawaban "x dari y proyek berjalan sesuai rencana." disertai kalimat pendukung (perlu perhatian/terlambat, persetujuan, eskalasi).
- Empat KPI: rata-rata progres (delta `progressComparison`), tepat waktu 30 hari, laporan hari ini, dan menunggu keputusan.
- **Laporan per perusahaan.** Kartu PT disusun 1/2/3 kolom. Mengetuk kartu membuka **Sheet perusahaan** berisi `ProjectRow` dengan keterangan lapor/belum lapor. Mengetuk baris proyek membuka **Sheet proyek**, yang memuat:
  - lencana status;
  - StatTile "Lapor 14 hari";
  - laporan harian terbaru, dimuat malas lewat `/api/daily-reports?projectId&pageSize=14`;
  - "Perlu perhatian dan eskalasi" dari `projects[].escalations`.

  Perpindahan dua tingkat ini memakai satu MkSheet yang isinya berganti, dengan tombol "Kembali ke perusahaan". Layar ini baca-saja.
- Kartu tambahan:
  - status proyek (donat);
  - laporan harian 8 minggu (batang yang bisa dipilih);
  - kinerja divisi digabung per `typeName`, dengan cadangan tepat waktu per perusahaan (DivisionBar, target 85);
  - aktivitas terbaru.
- **Grafik kepatuhan grup:**
  - tren KPI 6 bulan dengan segmented Kepatuhan/Tepat waktu/Mingguan/Bukti dan garis pembanding putus-putus;
  - donat status laporan hari ini;
  - DivisionBar per sub-holding (target 75);
  - batang umur eskalasi dengan kalimat lewat SLA;
  - lencana penyerahan mingguan;
  - **peta panas** kepatuhan PT (ambang ≥90/75/60), dengan skor tertulis dan legenda;
  - 10 PT terendah;
  - keterlambatan berulang.

### Server yang dipakai
| Route | Pemakaian |
|---|---|
| `GET /api/ringkasan` | data utama |
| `GET /api/daily-reports` | Sheet proyek |
| `GET /api/management-charts` | sub-holding, donat harian, umur eskalasi, mingguan, PT terendah |
| `GET /api/kpi-trends` | tren 6 bulan |
| `GET /api/compliance-map` | peta panas |
| `GET /api/late-incidents?pageSize=20` | keterlambatan berulang |

Tiga route dari brief tidak dipanggil:
- `/api/my-dashboard` hanya mengembalikan `{kind:'OVERSIGHT'}` untuk peran ini.
- `/api/dashboard` isinya tumpang tindih (agregat lama).
- `statistik-view` adalah modul Admin PT (`/api/admin/compliance`), bukan bagian pemantau.

### Izin, galat, dan keadaan layar
- Tiap sumber dimuat paralel sebagai `Bagian` tersendiri: Memuat, Siap, Galat, atau Ditolak. Galat 403 menjadi catatan izin dengan pesan dari server, bukan galat. Kode 401/409/422/5xx diterjemahkan lewat `ApiError`.
- Galat pada satu kartu tidak menjatuhkan layar. Setiap kartu punya kerangka memuat, keadaan kosong, dan ErrorNote dengan tombol "Coba lagi".
- Peran di luar `PERAN_PEMANTAU` hanya mendapat catatan dan tidak memicu permintaan ke server.

### Grafik Canvas
Berkas `grafik/Grafik.kt` berisi `GrafikBatang`, `GrafikDonat`, `GrafikTren`, dan `PetaPanas`.
- Nilai selalu tertulis: di atas batang, di atas titik, di legenda donat, dan di sel peta.
- Hanya satu sorotan aksen; elemen lain berwarna `fill2`. Garis bantu putus-putus.
- `contentDescription` memuat seluruh nilai.
- Skala ada di `SkalaGrafik` (fungsi murni dan diuji): `batasRapi` (1/2/5×10ⁿ), `porsi`, `busurDonat` (dengan celah), `titikTren`, `indeksDariX`, `persenBagian`.

### Tablet
Modul tidak memuat `material3-adaptive`, jadi tata letak memakai `BoxWithConstraints`:
- ≥600dp: kartu berpasangan dua kolom, KPI satu baris, kartu PT 2 kolom.
- ≥840dp: kartu PT 3 kolom. MkSheet sudah menjadi panel samping.

## 2. `:feature:pesan`

Titik masuk:
- `PesanLayar(peran: Peran, onTutup: () -> Unit, modifier)`
- `PesanIkon(onBuka: () -> Unit, modifier)`

Keduanya di paket `id.co.monitorkarya.feature.pesan`.

### Paritas dengan `pesan-view.tsx`
Server: `GET /api/notifications?inbox=1` dan `PATCH /api/notifications {ids}|{all:true}`.

- Kepala layar berisi tombol tutup, judul "Kotak masuk", dan muat ulang. Kalimat jawaban "n pesan belum dibaca.". Saringan Semua/Belum dibaca dengan jumlah.
- Tombol "Tandai semua dibaca" muncul bila ada pesan belum dibaca.
- Tiap baris daftar menampilkan:
  - ikon jenis (komentar/persetujuan/pengingat/pemberitahuan, port `kindOf`);
  - judul, tebal bila belum dibaca, dengan titik aksen;
  - isi dua baris;
  - "Jenis · relatif".
- Membuka pesan menampilkan Sheet detail (Pesan · Waktu WIB · Status) sekaligus menandainya dibaca. Bila tanda baca gagal, detail tetap terbuka dan muncul snackbar.
- **Balas/kirim tidak ada di web, jadi tidak dibuat.**
- `PesanRepo` (@Singleton) menyimpan jumlah belum dibaca yang dipakai bersama layar dan ikon: lencana langsung turun saat pesan dibuka. `PesanIkon` memperbarui jumlah tiap 60 detik selama tampil. Lencana menampilkan 1–99 lalu "99+", dan jumlahnya ikut dibacakan di label tombol.

## Butuh parent (di luar kepemilikan A2)
1. **`app/build.gradle.kts`**: tambahkan `implementation(project(":feature:ringkasangrup"))` dan `implementation(project(":feature:pesan"))`. Tanpa ini modul Hilt (`RingkasanGrupModule`, `PesanModule`, `PesanRepo`, ViewModel) tidak teragregasi.
2. **MKShell/MkNavHost**:
   - Pasang `RingkasanGrupTab(peran)` untuk tab RINGKASAN keenam peran pemantau. RINGKASAN DIREKTUR_ENTITAS di web memakai layar Direktur (divisi); modul ini menampilkan layar Manajemen, dengan kinerja divisi otomatis tampil bila `divisions` terisi.
   - Pasang `PesanIkon` di bilah atas/Dock semua peran, dan rute layar penuh `PesanLayar`.
3. **Navigasi tab dari pesan.** Web punya tombol "Buka <tab>". Signature wajib tidak membawa callback, jadi Sheet hanya menulis "Buka tab X untuk menindaklanjuti" (sudah disaring `bolehLihatTab`). Usulan: tambah parameter opsional `onBukaTab: (TabId) -> Unit` ke `PesanLayar`.
4. **Tombol kembali sistem.** `BackHandler` tidak dipasang karena `activity-compose` tidak dideklarasikan di modul. Parent menangani kembali menuju `onTutup`.
5. Tidak ada dependensi baru di `libs.versions.toml`.

## Berkas
- `feature/ringkasangrup/src/main/kotlin/.../ringkasangrup/`:
  - `RingkasanGrupTab.kt`, `SheetDrillDown.kt`, `RingkasanGrupViewModel.kt`
  - `data/RingkasanGrupDto.kt`, `data/RingkasanGrupApi.kt`
  - `di/RingkasanGrupModule.kt`
  - `grafik/Grafik.kt`, `grafik/SkalaGrafik.kt`
  - `logika/Pemetaan.kt`, `logika/FormatWib.kt`
- `feature/ringkasangrup/src/main/res/values/strings_ringkasangrup.xml` (prefiks `rg_`)
- `feature/ringkasangrup/src/test/...`: `DtoRingkasanGrupTest`, `SkalaGrafikTest`, `PemetaanTest`, `RingkasanGrupViewModelTest`
- `feature/pesan/src/main/kotlin/.../pesan/`:
  - `PesanLayar.kt`, `PesanIkon.kt`, `PesanViewModel.kt` (berisi juga `PesanIkonViewModel`)
  - `data/PesanDto.kt`, `data/PesanApi.kt`, `data/PesanRepo.kt`
  - `di/PesanModule.kt`
  - `logika/LogikaPesan.kt`
- `feature/pesan/src/main/res/values/strings_pesan.xml` (prefiks `pesan_`)
- `feature/pesan/src/test/...`: `DtoPesanTest`, `LogikaPesanTest`, `PesanViewModelTest`
