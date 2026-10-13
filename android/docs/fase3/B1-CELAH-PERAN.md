# B1 — Celah peran × tab (tanpa layar tunggu)

Tanggal: 13 Oktober 2026 · Cabang `claude/perbaiki-bug-sisa` · Kepemilikan: `app/navigation/MKShell.kt` (+ `PetaLayar.kt` baru), `app/ui/{admin,akun,kepatuhan,tim,ringkasan,vm,placeholder}`, paket baru `app/ui/{divisi,mejakadiv,mejaumum,pengaturan}`, `app/src/main/res/values/strings_b1.xml`, `feature/ringkasangrup/**`.

## Hasil gerbang

Dijalankan lewat `gradle-kunci.sh :app:assembleDebug :app:testDebugUnitTest :feature:ringkasangrup:testDebugUnitTest` — **BUILD SUCCESSFUL**.

| Kelas tes (baru B1) | Tes | Isi |
|---|---|---|
| `app/navigation/PetaLayarTest` | 4 | semua (peran, tab, ber-PT/tidak) → layar sah untuk tab itu; celah yang diketahui; Statistik/Pengaturan hanya Admin PT; kalimat meja tanpa PT |
| `app/ui/divisi/DivisiTest` | 5 | dekode `GET /api/weekly-reports` bentuk route; kalimat/rincian; mode isian per kapabilitas `weekly:input`; VM (halaman 10, saringan, cari ber-jeda + dipangkas, halaman, galat 500/jaringan) |
| `app/ui/mejakadiv/MejaKadivTest` | 6 | urai `GET /api/work-desk` cabang KADIV + `GET /api/weekly-input`; enam syarat, perlu tindakan, capaian hari ini, kalimat; VM serahkan (badan `{divisionId, week, action}`) + 422 `errors[]` |
| `app/ui/ringkasan/DasborPelaksanaTest` | 4 | urai `GET /api/my-dashboard` PIC/KADIV; tenggat 24/7, ditutup, lewat; kalimat; respons sebagian |
| `feature/ringkasangrup/logika/LogikaDirekturTest` | 4 | dekode `divisions[].head/weekly/outputs`, `outputs.trend.week`, `viewer`; susunan semua divisi / satu divisi; lencana, baris, alur, teks pengingat |
| `feature/ringkasangrup/RingkasanDirekturViewModelTest` | 5 | tandai dibaca + Urungkan, ditolak server, ingatkan (`{entityId, divisionId, week}`), sheet proyek malas, DELETE berbadan JSON lewat MockWebServer |

Tes lama tetap hijau: `LaporanLogikaTest`, `TumpangAntreanTest`, `MejaKerjaLogikaTest`, 4 kelas ringkasangrup lama.

## Peta peran × tab → layar

`IsiTab` di `MKShell.kt` kini `when` menyeluruh atas `LayarTab` (`navigation/PetaLayar.kt`, fungsi murni `layarUntuk(peran, tab, adaPt)`), tanpa cabang `else`. `PlaceholderTabScreen` **dihapus** (berkas dan paket `ui/placeholder`), jadi tidak ada layar tunggu yang bisa terjangkau. **Baru** = layar B1.

| Peran | Tab | Layar | Padanan web | Server |
|---|---|---|---|---|
| PIC_PROYEK | Hari ini | `RingkasanPelaksanaScreen` (PIC) **baru** | role-dashboards `PicDashboard` | `GET /api/my-dashboard` |
| | Meja kerja | `MejaKerjaScreen` | work-desk `pic-desk` | `/api/work-desk` |
| | Laporan harian | `LaporanHarianScreen` | daily-input-view | `/api/daily-input`, `/api/tasks` |
| | Proyek | `ProyekTab` | projects-view | `/api/projects` |
| KEPALA_DIVISI | Ringkasan | `RingkasanPelaksanaScreen` (Kadiv) **baru** | `KadivDashboard` | `GET /api/my-dashboard` |
| | Meja kerja | `MejaKadivScreen` **baru** | work-desk `kadiv-desk` | `GET /api/work-desk` (KADIV) + `GET/POST /api/weekly-input` |
| | Capaian mingguan | `MingguanScreen` | weekly-input-view | `/api/weekly-input` |
| | Divisi | `TimScreen` (keputusan F2) | divisions-view + tim | `/api/kadiv/*` |
| ADMIN_PT | Ringkasan | `DashboardAdminScreen` | `AdminDashboard` | — |
| | Meja kerja | `MejaKerjaAdminScreen` | `admin-desk` | `/api/inbox` |
| | Penerimaan | `PenerimaanScreen` | inbox-view | `/api/inbox` |
| | Laporan harian | `LaporanHarianScreen` (multi-proyek PT) | daily-input-view (sama untuk semua peran ber-`daily:input`) | `/api/daily-input` (Admin: proyek PT-nya) |
| | Proyek | `ProyekTab` | projects-view | |
| | Divisi | `DivisiScreen` **baru**: "Isi capaian" (`MingguanScreen`) / "Arsip laporan" | divisions-view (`DivisionWeeklyDesk` + arsip) | `/api/weekly-input`, `GET /api/weekly-reports` |
| | Eskalasi | `EskalasiTab` | escalations-view | |
| | Lainnya → **Statistik** | `StatistikAdminScreen` (`KepatuhanScreen`) | statistik-view | `/api/admin/compliance` |
| | Top bar → **Pengaturan** | `PengaturanScreen` **baru** → `AkunScreen` | settings-dialog "Akun & pengguna" | `/api/companies`, `/api/companies/users*` |
| DIREKTUR_ENTITAS | Ringkasan | `RingkasanDirekturTab` **baru** (jatuh ke `RingkasanGrupTab` bila `divisions` kosong) | oversight → `DirectorDashboard` | `GET /api/ringkasan`, `POST/DELETE /api/ringkasan/laporan-dibaca`, `POST /api/notifications/remind`, `/api/daily-reports` |
| | Proyek / Eskalasi / Persetujuan / Entitas | `ProyekTab` / `EskalasiTab` / `PersetujuanTab` / `EntitasTab` | | |
| | Divisi | `DivisiScreen` (arsip) **baru** | divisions-view | `GET /api/weekly-reports` |
| DIREKTUR_SDM_GA | Ringkasan | `RingkasanGrupTab` | `ManagementDashboard` | |
| | Proyek / Eskalasi / Entitas / Log aktivitas | tab fitur | | |
| | Divisi | `DivisiScreen` (arsip) **baru** | divisions-view | `GET /api/weekly-reports` |
| TI | Ringkasan | `RingkasanGrupTab` | `ManagementDashboard` | |
| | Meja kerja | ber-PT: `MejaKerjaAdminScreen`; tanpa PT: `MejaTanpaPtScreen` **baru** | work-desk-view (`applies` / catatan) | work-desk 400 tanpa PT |
| | Penerimaan | `PenerimaanScreen` | inbox-view | `/api/inbox` (master: seluruh grup) |
| | Laporan harian | `LaporanHarianScreen` | daily-input-view | `/api/daily-input` (master: semua proyek aktif) |
| | Capaian mingguan | `MingguanScreen` | weekly-input-view | `/api/weekly-input` (master) |
| | Divisi | `DivisiScreen` (isi + arsip) **baru** | divisions-view | |
| | Proyek / Eskalasi / Entitas / Log / Sistem & akses | tab fitur | | |
| SUPERADMIN | sama dengan TI + Perusahaan & akun (`PerusahaanTab`) | | | |
| MANAJEMEN | Ringkasan `RingkasanGrupTab`; Eskalasi, Proyek, Persetujuan, Entitas, Log; Divisi → `DivisiScreen` (arsip) **baru** | | | |
| AUDITOR | Ringkasan `RingkasanGrupTab`; Proyek, Entitas, Log; Divisi → `DivisiScreen` (arsip) **baru** | | | |

## Layar baru — ringkas

- **`ui/divisi`** (divisions-view). Untuk peran pemantau, layar ini hanya membaca arsip:
  - kalimat jawaban dan pendukung (menunggu/terlambat);
  - chip status dan cari (jeda 350 ms);
  - daftar terpaginasi 10 per halaman (lencana status, Terlambat, Terkunci);
  - Sheet detail: periode, PT, penyetuju, tiga StatTile, dan butir (aspek, prioritas, perlu eskalasi, progres, PIC, target, bukti, capaian, kendala).

  Peran dengan `weekly:input` (Admin PT, TI, Super Admin) mendapat segmented "Isi capaian" | "Arsip laporan".
- **`ui/mejakadiv`** (kadiv-desk). Layar ini memuat:
  - pemilih divisi, lalu kalimat jawaban dengan satu tombol primer (Serahkan ke Admin PT / Setujui capaian / Buka papan mingguan);
  - empat KPI;
  - daftar periksa: alur 4 langkah, enam syarat, dan daftar 422 "Perbaiki dulu";
  - Perlu tindakan, Capaian hari ini, dan Riwayat 6 minggu (`GrafikBatang`);
  - kartu tim yang membuka tab Divisi.

  Menyunting butir dilakukan di tab Capaian mingguan.
- **`ui/ringkasan/RingkasanPelaksanaScreen`** (role-dashboards):
  - **PIC:** chip proyek, "<proyek> n% selesai." beserta tenggat (24/7 aman), cincin progres, empat KPI, laporan terakhir, dan riwayat laporan.
  - **Kadiv:** jawaban, empat KPI, capaian minggu ini (chip status + daftar), alur penyerahan dan status per divisi, serta riwayat 8 minggu.
- **`feature/ringkasangrup/RingkasanDirekturTab`** (DirectorDashboard). Layar ini memuat:
  - saringan divisi yang berlaku untuk seluruh isi;
  - jawaban, pendukung, tiga cincin, dan KPI (2 di ponsel, 4 di tablet);
  - laporan mingguan per kepala divisi dengan aksi Ingatkan, Baca laporan, dan Tandai sudah dibaca (snackbar Urungkan), ditambah alur 3 langkah;
  - kartu output aktif (donat dan chip divisi), Milestone 14 hari, dan proyek (chip status + `ProjectRow`);
  - kartu keputusan menunggu (persetujuan, usulan tenggat, dan eskalasi; ketuk untuk membuka tab Persetujuan/Eskalasi);
  - kartu tren output dan tepat waktu per divisi;
  - Sheet laporan divisi (kontak tel/mailto, poin, kendala, "Buka laporan lengkap" ke tab Divisi) dan Sheet proyek (memakai ulang `IsiProyek`).

  DTO `DivisiGrupDto` ditambah `head`, `weekly`, dan `outputs`; `OutputGrupDto` ditambah `trend`; `RingkasanGrupDto` ditambah `viewer`. API tulis tersendiri: `AksiPengawasApi`.
- **`ui/pengaturan`** berisi Pengaturan Admin PT, yaitu meja akun beserta teks penjelasan dari settings-dialog. **`ui/mejaumum`** berisi catatan meja untuk akun tanpa PT.
- `MejaAdminScreen` (gabungan lama, tidak dirujuk) **dihapus**.

## Catatan teknis

- `:app` tidak memasang plugin kotlinx-serialization, jadi `@Serializable` di `:app` tidak menghasilkan serializer.
  - Kontrak baru di `:app` (`MejaKadivApi`, `DasborPeranApi`) membaca `JsonObject`, lalu mengurainya secara defensif.
  - DTO bertipe tetap tinggal di `:core:network` / `:feature:ringkasangrup`.
  - Catatan: `LaporanDeskApi` di `ui/laporan` memakai `@Serializable` tanpa plugin. Kode itu sudah tidak dipakai, tetapi tetap berisiko bila dihidupkan kembali.
- `DivisiScreen` dan `RingkasanPelaksanaScreen` memakai ulang label status `internal` dari `ui/mingguan` (`labelStatusButir`, `mkStatusHeader`, …). Berkas `ui/mingguan` tidak disunting.

## Butuh parent (di luar kepemilikan B1)

1. **`core/domain/.../RoleTabs.kt`** belum sama dengan `ROLE_TABS` web untuk ADMIN_PT. Web memakai `dashboard, pesan, work-desk, statistik, daily-input, projects, divisions, escalations`: tidak ada `inbox` dan ada `statistik`. Android masih memuat PENERIMAAN dan tidak punya TabId STATISTIK, sehingga Statistik sementara menjadi `TujuanEkstra` di "Lainnya". Usulan:
   - tambah `TabId.STATISTIK`;
   - selaraskan daftar ADMIN_PT;
   - hapus `TujuanEkstra`.
2. **`ui/mingguan`** perlu pemilih PT untuk TI/Super Admin. Web `DivisionWeeklyDesk` memilih entitas, sedangkan `MingguanViewModel.muatInternal()` memanggil `api.papan()` tanpa `entityId`, sehingga server memakai PT pertama. Usulan:
   - pakai `entities` dan `entityPinned` dari respons;
   - kirim `papan(entityId = …)`.
3. **`core/network/.../LaporanDibacaApi.batalTandai`** memakai `@DELETE` + `@Body`, yang akan dilempar Retrofit saat dipanggil. Saat ini tidak ada pemakai. Ganti dengan `@HTTP(method = "DELETE", hasBody = true)` (pola `AksiPengawasApi`).
4. **Statistik** belum memuat `ReportSettingsCard` (aturan pelaporan per PT, statistik-view), karena belum ada API/DTO `report-settings` di `:core:network`.
5. Kartu yang belum diport karena API-nya belum ada di Android:
   - **Pengaturan:** profil, kata sandi sendiri, dan tema.
   - **Layar Direktur:** utas tanggapan laporan mingguan (`weekly-comments`) dan keputusan persetujuan/tenggat langsung di Ringkasan. Saat ini butir itu membuka tab Persetujuan.
   - **PIC "Hari ini":** output, catatan, tahapan, dan usulan tenggat (`/api/outputs`, `/api/project-progress`, `/api/deadline-proposals`).
   - **Kadiv:** review output, laporan harian tim, dan beban kerja di Ringkasan/Meja. Fitur ini sudah ada di tab Divisi (`TimScreen`), dan kartu di meja membuka tab itu.

## Berkas

Baru:
- `app/.../navigation/PetaLayar.kt`
- `app/.../ui/divisi/{DivisiLogika,DivisiViewModel,DivisiScreen}.kt`
- `app/.../ui/mejakadiv/{MejaKadivData,MejaKadivLogika,MejaKadivViewModel,MejaKadivScreen}.kt`
- `app/.../ui/mejaumum/MejaTanpaPtScreen.kt`
- `app/.../ui/pengaturan/PengaturanScreen.kt`
- `app/.../ui/ringkasan/{DasborPelaksana,RingkasanPelaksanaScreen}.kt`
- `app/.../ui/vm/RingkasanPelaksanaViewModel.kt`
- `app/src/main/res/values/strings_b1.xml`
- `feature/ringkasangrup/.../{RingkasanDirekturTab,RingkasanDirekturViewModel}.kt`
- `feature/ringkasangrup/.../data/AksiPengawasApi.kt`
- `feature/ringkasangrup/.../logika/LogikaDirektur.kt`
- tes:
  - `app/src/test/.../{navigation/PetaLayarTest,ui/divisi/DivisiTest,ui/mejakadiv/MejaKadivTest,ui/ringkasan/DasborPelaksanaTest}.kt`
  - `feature/ringkasangrup/src/test/.../{RingkasanDirekturViewModelTest,logika/LogikaDirekturTest}.kt`

Diubah:
- `app/.../navigation/MKShell.kt`
- `app/.../ui/admin/StatistikAdminScreen.kt` (komentar)
- `feature/ringkasangrup/.../data/RingkasanGrupDto.kt`
- `feature/ringkasangrup/.../di/RingkasanGrupModule.kt`
- `feature/ringkasangrup/.../SheetDrillDown.kt` (`IsiProyek` menjadi internal)

Dihapus:
- `app/.../ui/admin/MejaAdminScreen.kt`
- `app/.../ui/placeholder/PlaceholderTabScreen.kt`
