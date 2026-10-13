# C4 — Perbaikan Ringkasan grup/Direktur, designsystem, Pesan/Notifikasi (gelombang C)

Tanggal: 13 Oktober 2026 · Cabang `claude/perbaiki-bug-sisa` · Rujukan temuan: [C4-QA-RINGKASAN-DS.md](C4-QA-RINGKASAN-DS.md).

Zona yang diubah: `designsystem/**`, `feature/ringkasangrup/**`, `feature/pesan/**`, `feature/notifikasi/**`, dan `core/data/.../repo/KotakMasukRepo.kt` beserta tesnya. Tidak ada perubahan pada gradle, core/network, app/ui/laporan, app/ui/mejakerja, atau berkas outbox/db/sync.

Singkatan path: DS = `designsystem/src/main/kotlin/id/co/monitorkarya/designsystem`, RG = `feature/ringkasangrup/src/main/kotlin/id/co/monitorkarya/feature/ringkasangrup`.

## Ringkasan

| Temuan | Status | Inti perbaikan |
|---|---|---|
| P1-1 tombol nonaktif | Diperbaiki | MkButton/MkFAB nonaktif: latar fill-1, teks ink-2, tanpa aksen/garis/bayangan |
| P1-2 kontras batang grafik | Diperbaiki | Token `chartIdle`/`chartGrid`/`data` di MkColors dan dipakai Grafik |
| P1-3 kebocoran KotakMasukRepo | Diperbaiki | Generasi sesi + pembatalan GET berjalan + penjaga PATCH |
| P2-1 target sentuh | Diperbaiki | Area sentuh 48dp pada tombol, chip, segmented, ikon, urut, hapus lampiran |
| P2-2 ikon/kata status | Diperbaiki | RISK segitiga, LATE jam, INFO "Informasi" |
| P2-3 teks grafik dan fontScale | Diperbaiki | Tepi diukur dari teks; tanpa elipsis; label selang-seling |
| P2-4 muat ulang tanpa batal | Diperbaiki | Job lama dibatalkan (grup dan Direktur) |
| P2-5 `sibuk` tunggal | Diperbaiki | `sibuk: Set<String>` + tolak ketuk ganda |
| P2-6 reduced motion | Diperbaiki | MKTheme membaca "Hapus animasi" sistem secara langsung |
| P2-7 sumber tren KPI | Diperbaiki | Tren diturunkan dari `trend` /api/management-charts |
| P3 | 7 diperbaiki, 5 dilewati | Lihat bagian P3 |

## P1 — tinggi

### P1-1 · Tombol nonaktif (DS)

- **Verifikasi:** temuan nyata. `.alpha()` dipasang sesudah `.background()`, sehingga latar aksen tetap pekat.
- **Perbaikan:** keadaan nonaktif kini digambar dengan token, bukan alpha.
  - `components/MkButton.kt`: semua varian memakai latar `fill1` (PLAIN tetap transparan), tanpa garis dan tanpa aksen, dengan teks `ink2`. Kontras ink-2 di fill-1 adalah 4,54:1 (terang) dan 7,2:1 (gelap), diuji di `TokenStatusTest`.
  - `components/MkFAB.kt`: mengikuti pola yang sama, ditambah bayangan 0.
- **Komponen lain yang diperiksa:**
  - `MkBoardColumn.TombolUrut` tidak terdampak, karena alpha-nya ada sebelum isi (tanpa latar). Meski begitu, ikon nonaktifnya kini memakai token `ink3`, bukan alpha 0,3.
  - `MkIconBtn` nonaktif kini berikon `ink3`; sebelumnya tidak berubah sama sekali.
  - `MkChip` dengan `enabled=false` kini bertekskan `ink2`.
  - `MkSkeleton` benar, karena alpha-nya ada sebelum latar.
- **Mengapa ink-2, bukan ink-3:** ink-3 adalah token "teks nonaktif" di tokens.css, tetapi hanya 2,9:1 di fill-1 terang. Permintaan meminta teks memenuhi kontras, jadi dipilih ink-2. Ink-3 tetap dipakai untuk ikon nonaktif.

### P1-2 · Kontras batang grafik

- **Verifikasi:** temuan nyata.
- **Perbaikan di `theme/MkColor.kt`:** tambah `chartIdle`, `chartGrid`, dan `data: List<Color>` (6 seri) untuk terang dan gelap, satu-satu sesuai tokens.css.
- **Pemakaian di `RG/grafik/Grafik.kt`:** batang idle memakai `chartIdle` (≥3:1, diuji), dan garis bantu memakai `chartGrid`.
- **MkDivisionBar:** nilai `--data-*` yang di-hardcode dihapus. `nadaDivisi()` kini membaca `MkColors.data`.

### P1-3 · KotakMasukRepo (privasi)

- **Verifikasi:** temuan nyata. Ditemukan juga varian kedua: PATCH "tandai semua" milik akun A yang selesai setelah reset menulis `tandaLokal["*"]`, sehingga semua pesan akun B tampil dibaca bila muat B dimulai sebelum PATCH A selesai.
- **`reset()` kini:**
  - menaikkan `generasi`;
  - memajukan `nomorMuat`/`nomorTerbit`;
  - mengosongkan tanda lokal;
  - membatalkan semua GET yang sedang berjalan (GET dibungkus `async` dan didaftarkan).
- **Penjagaan setelah reset:**
  - Respons, galat, atau pembatalan dari generasi lama tidak pernah terbit. Pemanggil menerima `Sukses(keadaan kini)`.
  - `tandai()` berhenti tanpa menyentuh keadaan bila generasi berganti selama PATCH.
- **Tes baru (`KotakMasukRepoTest`):**
  - muat berjalan → reset → respons tiba → sesi B tetap kosong;
  - respons generasi lama dibuang;
  - "tandai semua" akun lama tidak menempel ke sesi baru.

**Repo @Singleton lain di core/data dengan pola serupa (dicatat, tidak diubah):**

- `repo/KepatuhanRepo.kt`: `_data: MutableStateFlow<KepatuhanResponse?>` tanpa `reset()` dan tanpa generasi.
  - Potret kepatuhan akun Admin PT sebelumnya tetap terbaca oleh akun berikutnya sampai `tarik()` berhasil.
  - `tarik()` yang masih berjalan saat keluar juga bisa menulis data akun lama.
  - Saran: `reset()` dipanggil saat keluar, ditambah token generasi seperti KotakMasukRepo.
- **Perlu dicek pemilik core/data:**
  - `repo/CacheLayar.kt`: kunci cache tanpa uid, misalnya `laporan:meja:hari-ini`.
  - Repo berbasis Room (`ProyekRepo`, `LaporanRepo`, `TugasRepo`, `PenerimaanRepo`, `MingguanRepo`).
  - Di app/core tidak ditemukan `clearAllTables`/penghapusan saat keluar. Bila DB tidak dibersihkan saat keluar akun, data akun sebelumnya bisa tampil luring.

## P2 — sedang

- **P2-1 target sentuh:**
  - `minimumInteractiveComponentSize()` dipasang pada MkButton (M dan S), MkChip (hanya chip yang bisa diketuk), MkIconBtn, `TombolUrut` (MkBoardColumn), dan `TombolHapusKecil` (MkLampiran). Ukuran visual tetap, sedangkan tata letak/area sentuh menjadi 48dp.
  - `MkSegmented`: tata letak opsi 48dp dengan pill 34dp dan wadah 40dp digambar di tengah (`drawBehind`), jadi tampilannya sama.
  - Cincin fokus 2dp `--focus` ditambahkan ke komponen ber-`indication = null` (P3-9) lewat `components/MkInteraksi.kt`.
- **P2-2 ikon/kata status (`components/StatusBadge.kt`):**
  - RISK = `Warning` (segitiga), LATE = `Schedule` (jam), INFO = "Informasi" + `Info`, sesuai core.tsx `STATUS`.
  - `MkDivisionBar` "Lebih x%" kini memakai ikon jam (nada late).
  - Semua pemanggil yang perlu kata "Diingatkan" sudah memberikannya lewat `text`, misalnya KepatuhanScreen dan KepatuhanViewModel.
- **P2-3 teks grafik (`RG/grafik/Grafik.kt`):**
  - Konstanta `TEPI_ATAS/TEPI_BAWAH` dihapus. Tepi atas dan bawah kini diturunkan dari tinggi teks terukur, sehingga mengikuti fontScale. Nilai digambar tepat di atas batang/titik tanpa menimpa.
  - Teks tidak lagi diberi elipsis. Bila slot lebih sempit dari teks, label/angka ditulis selang-seling. Slot terakhir dan slot terpilih selalu tertulis, dan tetangga terdekat yang terpilih dilewati.
  - Logika murni ada di `SkalaGrafik.langkahLabel` dan `indeksTampil`, dengan tes JVM.
  - Semua nilai tetap terbaca di contentDescription.
- **P2-4 pembatalan muat:**
  - `RingkasanGrupViewModel.muatUlang()` membatalkan `tugasMuat` lama.
  - `RingkasanDirekturViewModel.muatUlang()` membatalkan `tugasRingkasan`.
  - Tes: muat lama tertahan lalu galat → muat ulang Siap → galat basi tidak menimpa.
- **P2-5 `sibuk`:**
  - `sibuk: Set<String>`. `mulaiSibuk()` atomik menolak ketuk ganda, dan tiap aksi hanya menghapus id miliknya.
  - Tab Direktur memakai `dv.id !in ui.sibuk`.
  - Tes: ketuk ganda diabaikan; aksi divisi lain yang selesai tidak mengaktifkan kembali divisi yang masih berjalan.
- **P2-6 reduced motion (`theme/LocalReducedMotion.kt`):**
  - `gerakDikurangiSistem()` membaca `Settings.Global.ANIMATOR_DURATION_SCALE == 0` dan mengamatinya dengan ContentObserver, sehingga perubahan setelan langsung berlaku.
  - Fungsi ini menjadi nilai bawaan `MKTheme(reducedMotion = …)`, jadi MainActivity (di luar zona) tidak perlu diubah.
  - Semua animasi DS sudah membaca `LocalReducedMotion`.
- **P2-7 sumber tren KPI:**
  - `GrafikManajemenDto.trend: List<TrenBulanDto>` ditambahkan.
  - `trenDariGrafik()` (Pemetaan) memetakannya ke `TrenKpiDto`, sehingga bentuk layar tetap.
  - `ui.tren` kini mengikuti hasil `/api/management-charts`, termasuk 403/galat. `/api/kpi-trends` tidak dipanggil lagi. `RingkasanGrupApi.trenKpi()` dibiarkan (tidak dipakai) agar tes DTO lama tetap ada.

## P3 — rendah

| # | Status | Catatan |
|---|---|---|
| 1 polling ganda | Diperbaiki | `KotakMasukRepo.muatBerkala()` melewati tarikan bila hasil terakhir < 45 detik atau ada muat berjalan. Ikon Pesan (`segarkan`) dan lonceng (loop → `muatBerkala`) memakainya, jadi ±1 permintaan per menit. Muat paksa (buka Sheet) tetap memakai `muat()`. Ada tesnya. |
| 2 lencana 99+ vs 9+ | Diperbaiki | Pesan memakai "9+", sama dengan lonceng dan web. |
| 3 semantik DivisionBar >100% | Diperbaiki | `ProgressBarRangeInfo(mentah/100f, 0..maks)`. |
| 4 legenda pembanding | Diperbaiki | Baris "– – Kepatuhan (pembanding)" di bawah GrafikTren. |
| 5 pilih titik via TalkBack | Dilewati | Nilai semua titik sudah ada di contentDescription. customActions per titik dinilai berlebih untuk temuan rendah. |
| 6 PT tanpa data dibaca 0% | Dilewati | Web identik (`management-dashboard.tsx:201` `e.onTimePct ?? 0`). Ini keputusan produk, bukan bug paritas. |
| 7 warna donat ON = DONE | Dilewati | Web identik. Angka dan kata di legenda membedakan. |
| 8 SECONDARY vs web | Dilewati | Bila diganti ke fill-1 tanpa garis, SECONDARY aktif hampir sama dengan tombol nonaktif baru (fill-1 + ink-2). Garis dipertahankan sebagai pembeda. |
| 9 indikasi fokus | Diperbaiki | Cincin `--focus` 2dp (MkIconBtn, MkChip, MkSegmented, MkFAB, MkLampiran). MkIconBtn nonaktif kini berbeda tampilannya. |
| 10 semantik | Diperbaiki | MkCard yang bisa diklik mendapat `Role.Button`; MkSkeleton dibacakan "Memuat". |
| 11 tanda negatif | Diperbaiki | `FormatWib.desimal(-0.5)` = "-0,5", dengan tes. |
| 12 kembali sistem di drill-down | Dilewati | Perlu `BackHandler` (activity-compose). Dependensi itu hanya runtime di material3 dan tidak ada di classpath kompilasi designsystem/ringkasangrup, sedangkan perubahan gradle di luar izin. Saran: tambahkan `activity-compose` ke `:feature:ringkasangrup`, lalu `BackHandler(enabled = sheet.proyekId != null) { aksi.kembali() }` di SheetDrillDown. |

## Tes

| Modul | Berkas tes | Jumlah | Hasil |
|---|---|---|---|
| `:core:data` | `KotakMasukRepoTest` | 8 (4 baru) | lulus |
| `:feature:ringkasangrup` | `RingkasanGrupViewModelTest` | 8 (2 baru) | lulus |
| `:feature:ringkasangrup` | `RingkasanDirekturViewModelTest` | 6 (1 baru) | lulus |
| `:feature:ringkasangrup` | `SkalaGrafikTest` | 8 (2 baru) | lulus |
| `:feature:ringkasangrup` | `PemetaanTest` | 9 (kasus negatif `desimal` ditambah) | lulus |
| `:feature:pesan` | `LogikaPesanTest` | 6 (kasus 9+) | lulus |
| `:feature:notifikasi` | seluruh tes | — | lulus |
| `:designsystem` | `TokenStatusTest` (baru) | 3 | lulus |

`TokenStatusTest` menguji ikon dan kata status sama dengan web, nilai token grafik sesuai tokens.css, serta kontras chart-idle ≥3:1 dan teks nonaktif ≥4,5:1.

Build lewat `gradle-kunci.sh` hijau untuk tugas berikut:
- `:designsystem:compileDebugKotlin`
- `:designsystem:testDebugUnitTest`
- `:feature:ringkasangrup:testDebugUnitTest`
- `:feature:pesan:testDebugUnitTest`
- `:feature:notifikasi:testDebugUnitTest`
- `:core:data:testDebugUnitTest`
- `:app:assembleDebug`

Catatan: `ktlintCheck` gagal di modul-modul ini sejak sebelum perubahan, termasuk pada berkas yang tidak disentuh (MkAccent, MkTypography, tes notifikasi/pesan). Gerbang ktlint bukan bagian tugas ini.

## Dampak visual yang perlu diketahui

- Tombol M/S, chip yang bisa diketuk, dan tombol ikon kini bertata letak minimal 48dp. Ukuran visualnya tetap, tetapi baris yang memuatnya bisa bertambah tinggi beberapa dp.
- Tombol nonaktif tidak lagi berwarna aksen pudar. Tampilannya kini kapsul abu fill-1 dengan teks ink-2.
- Lencana INFO tanpa `text` kini berbunyi "Informasi" dengan ikon info.
