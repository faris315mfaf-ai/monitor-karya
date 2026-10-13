# C4 — QA baca-saja: Ringkasan grup/Direktur, designsystem, Pesan/Notifikasi

Tanggal: 13 Oktober 2026 · Cabang `claude/perbaiki-bug-sisa` · Peninjau: QA (baca-saja; tanpa gradle, tanpa edit kode).

Zona: `android/feature/ringkasangrup/**`, `android/designsystem/**`, `android/feature/pesan/**`, `android/feature/notifikasi/**`, `android/core/data/.../repo/KotakMasukRepo.kt`.
Rujukan: `src/app/api/{ringkasan,management-charts,kpi-trends,compliance-map,late-incidents,daily-reports,notifications}/route.ts`, `src/components/mk/core.tsx`, `design-system/components/bundle.css`, `design-system/tokens.css`.

Path di bawah relatif terhadap `android/`. DS = `designsystem/src/main/kotlin/id/co/monitorkarya/designsystem`, RG = `feature/ringkasangrup/src/main/kotlin/id/co/monitorkarya/feature/ringkasangrup`.

## Ringkasan

- **Kontrak JSON:** DTO ringkasan, management-charts, kpi-trends, compliance-map, late-incidents, daily-reports, dan notifications cocok dengan rute server. Tidak ada kolom wajib yang hilang dan tidak ada nama kunci yang salah eja. Ada satu selisih paritas sumber data (P2-7).
- **Token warna:** `MkColors`/`MkAccent` terang, gelap, dan 6 aksen sama persis dengan `tokens.css`.
- **Bug nyata:** 4 di designsystem (berdampak ke semua layar), 3 di grafik, 3 di state/lifecycle, dan beberapa di paritas.

---

## P1 — tinggi

### P1-1 · MkButton/MkFAB nonaktif tetap tampil berwarna penuh (DS, semua layar)
- **Bukti:** `DS/components/MkButton.kt:99` `.background(latar)` dipasang **sebelum** `:107` `.alpha(if (enabled) 1f else 0.4f)`. Hal yang sama ada di `DS/components/MkFAB.kt:65-66`. `Modifier.alpha` membuat graphicsLayer yang hanya meredupkan node sesudahnya. Akibatnya latar dan garis tetap 100%, dan hanya teks yang redup.
- **Skenario gagal:** tombol PRIMARY nonaktif (57 pemanggil `MkButton(... enabled = ...)` di `feature/` dan `app/`, misalnya "Kirim laporan", "Pengingat terkirim") tetap tampil merah pekat. Teksnya putih 40% di atas `accent-fill`, kira-kira 1,9:1 (gagal WCAG 1.4.3). Pengguna mengira tombol masih aktif. Web memakai `opacity:0.4` untuk seluruh tombol (`bundle.css:99`).
- **Perbaikan:** pindahkan `.alpha(...)` ke atas `.background(...)`, tepat setelah `graphicsLayer`. Lebih rapi lagi bila digabung ke graphicsLayer yang sama: `alpha = if (enabled) 1f else 0.4f`.

### P1-2 · Batang grafik "idle" memakai `fill2` — kontras ~1,3:1, bukan `--chart-idle` (RG/grafik)
- **Bukti:** `RG/grafik/Grafik.kt:154` `val isi = if (pilih) aksen.fill else warna.fill2`. Komentar `:4` keliru menyebut "fill2 = chart-idle". Token yang benar adalah `--chart-idle: #8e8e93` (terang) dan `#6c6c70` (gelap), yang ≥3:1 di surface (tokens.css:63/135). `fill2` (#E5E5EA di #FFFFFF) hanya sekitar 1,27:1, dan di gelap (#2C2C32 di #131316) sekitar 1,3:1. `MkColors` juga tidak punya `chartIdle`/`chartGrid`/`data1..6`, sehingga nilai data divisi di-hardcode di `DS/components/MkDivisionBar.kt:53-68`.
- **Skenario gagal:** "Laporan masuk 8 minggu" dan "Umur eskalasi": semua batang selain yang terpilih nyaris tak terlihat di kedua tema, sehingga gagal WCAG 1.4.11 (kontras non-teks).
- **Perbaikan:** tambahkan `chartIdle`, `chartGrid`, dan `data1..6` ke `MkColors` (port dari tokens.css). Pakai `chartIdle` untuk batang idle dan `chartGrid` untuk `garisBantu` (kini `warna.line`, Grafik.kt:147/323).

### P1-3 · KotakMasukRepo.reset() tidak membuang respons muat yang sedang berjalan — data akun lama bocor ke sesi baru
- **Bukti:** `core/data/.../repo/KotakMasukRepo.kt:65` menetapkan `nomorTerbit = nomorMuat`. Penjaga di `:85` hanya membuang respons dengan `nomor < nomorTerbit`. Muat yang sedang berjalan saat reset punya `nomor == nomorMuat == nomorTerbit`, jadi lolos dan `terbitkan()` daftar milik akun sebelumnya.
- **Skenario gagal:** jaringan lambat. Lonceng atau PesanIkon sedang polling (cookie akun A), lalu A keluar (`PesanIkonViewModel.onCleared` → reset) dan B masuk (`init` → reset). Respons A tiba setelahnya, sehingga lencana dan judul pesan milik A tampil di sesi B sampai poll berikutnya, atau terus bila poll B gagal. Ini kebocoran PII antarakun di perangkat bersama.
- **Perbaikan:** di `reset()` pakai `nomorMuat += 1; nomorTerbit = nomorMuat`, atau ubah penjaga menjadi `nomor <= nomorReset`. Tambah uji "muat berjalan → reset → respons tiba → keadaan tetap kosong".

---

## P2 — sedang

### P2-1 · Target sentuh < 48dp pada komponen dasar (DS)
- **Bukti:**
  - `MkButtonSize.S` 36dp (`MkButton.kt:44`);
  - `MkChip` 36dp (`MkChip.kt:55`);
  - opsi `MkSegmentedControl` 34dp (`MkSegmented.kt:86`);
  - `MkIconBtn` 44dp (`MkIconBtn.kt:44`);
  - hapus lampiran 32dp (`MkLampiran.kt:123`);
  - tombol urut kolom 32dp (`MkBoardColumn.kt:208`).
  
  `Modifier.clickable` tidak memperluas area sentuh secara otomatis.
- **Skenario gagal:** "Ingatkan", "Baca laporan", "Buka", "Lihat semua" (`RG/RingkasanDirekturTab.kt:469/475/539/553/602/830`), chip saringan divisi, dan segmented metrik KPI semuanya di bawah pedoman Android 48dp. Akibatnya salah ketuk, terutama di daftar rapat.
- **Perbaikan:** tambahkan `Modifier.minimumInteractiveComponentSize()` (M3) pada root yang dapat diklik. Ukuran visual tetap, area sentuh menjadi 48dp.

### P2-2 · Ikon dan kata status tidak sama dengan web (DS)
- **Bukti:** di `DS/components/StatusBadge.kt:45-49`, RISK memakai `Icons.Outlined.Error` (lingkaran "!"), LATE memakai `Warning` (segitiga), dan INFO berlabel "Diingatkan". Web (`src/components/mk/core.tsx:200-205`) dan tokens.css:51/53 mewajibkan risk = segitiga (`peringatan`), late = jam (`waktu`), dan info = "Informasi".
- **Skenario gagal:**
  - Segitiga di Android berarti "Terlambat", sedangkan di web berarti "Perlu perhatian". Pengguna buta warna yang mengandalkan ikon membaca status terbalik.
  - `StatusBadge(status = INFO)` tanpa `text` menampilkan "Diingatkan" untuk hal yang bukan pengingat. Contohnya langkah "Direktur · 2 dari 5 dibaca" di `RG/RingkasanDirekturTab.kt:482` (status dari `RG/logika/LogikaDirektur.kt:284`).
  - `MkDivisionBar.kt:203` ("Lebih x%") juga memakai `Warning` untuk nada late.
- **Perbaikan:** `RISK → Icons.Outlined.Warning`, `LATE → Icons.Outlined.Schedule`, `INFO("Informasi", Icons.Outlined.Info)`. Pemanggil yang memang perlu kata "Diingatkan" memberikannya lewat `text`.

### P2-3 · Label dan angka grafik tidak ikut skala huruf; angka bisa terpotong "…" (RG/grafik)
- **Bukti:** `RG/grafik/Grafik.kt:71-72` (`TEPI_ATAS 20.dp`, `TEPI_BAWAH 22.dp`), label sumbu di `bawah + 4.dp` (`:167`, `:360`), dan nilai di `bawah - h - 16.dp` / `t.y - 18.dp` (`:165`, `:358`). Semua jarak tetap dalam dp, padahal teks caption 12sp/16sp mengikuti fontScale. Lebar teks dibatasi `slot` dan diberi `Ellipsis` (`:94`).
- **Skenario gagal:**
  - Pada fontScale ≥1,15 (16sp·1,15 + 4dp > 22dp), label sumbu digambar di luar kanvas dan menimpa elemen di bawahnya. Canvas tidak memotong.
  - Nilai di atas batang menimpa puncak batang.
  - Pada tablet dua kolom (kartu ±240dp) atau fontScale 1,3, label 6 bulan "Okt 26" dan nilai menjadi "Ok…", sehingga melanggar aturan "angka selalu tertulis".
- **Perbaikan:** ukur tinggi teks dengan `pengukur.measure(...)` lalu turunkan `atas`/`bawah` dari tinggi itu, bukan dari konstanta dp. Bila `slot` kurang dari lebar label, tampilkan label selang-seling, bukan ellipsis pada angka.

### P2-4 · Muat ulang tanpa pembatalan — respons basi menimpa yang baru (RG)
- **Bukti:** `RG/RingkasanGrupViewModel.kt:84-100` meluncurkan 5 coroutine baru setiap kali dipanggil tanpa membatalkan yang lama. Hal yang sama ada di `RG/RingkasanDirekturViewModel.kt:88-97`.
- **Skenario gagal:** tarik-segarkan dua kali, atau "Coba lagi" lalu "Muat ulang". Respons pertama yang lambat (misalnya Galat timeout) tiba terakhir dan menimpa hasil Siap yang baru. Di layar Direktur, ini juga mengosongkan `timpaKeadaan` (tanda "dibaca" lokal).
- **Perbaikan:** simpan `Job` per bagian (`tugasMuat`), lalu `cancel()` sebelum meluncurkan ulang. Cara lain: pakai nomor generasi seperti KotakMasukRepo.

### P2-5 · `sibuk` tunggal di layar Direktur memungkinkan aksi ganda
- **Bukti:** `RingkasanDirekturUi.sibuk: String?` (`RG/RingkasanDirekturViewModel.kt:23`). `tandaiDibaca` (±:128) dan `ingatkan` (±:168) sama-sama menimpa `sibuk`, dan siapa pun yang selesai lebih dulu mengosongkannya (`sibuk = null`). `tandaiDibaca` juga tidak menolak panggilan saat `sibuk == d.id`.
- **Skenario gagal:** ketuk "Ingatkan" di divisi A lalu "Tandai dibaca" di divisi B. Bila B selesai lebih dulu, tombol A aktif lagi saat permintaannya masih berjalan, sehingga pengingat terkirim dua kali. Server menyaring `SUDAH_HARI_INI`, tetapi pesan snackbar menjadi ganda dan salah.
- **Perbaikan:** ubah ke `sibuk: Set<String>`. Tambahkan `if (d.id in sibuk) return`, lalu hapus hanya id miliknya saat selesai.

### P2-6 · `LocalReducedMotion` tidak pernah dihubungkan (DS)
- **Bukti:** `app/.../MainActivity.kt:36` memanggil `MKTheme(darkTheme, accent)` tanpa `reducedMotion`. Bawaan `false` (`DS/theme/MKTheme.kt:26`, `DS/theme/LocalReducedMotion.kt:13`). Semua cabang reduced motion di MkSkeleton, MkRing, MkDivisionBar, MkSheet, MkPilih, MkOfflineBanner, dan skala tekan menjadi kode mati.
- **Skenario gagal:** pengguna mengaktifkan "Hapus animasi". Kerangka tetap berdenyut tanpa henti (infiniteTransition) dan sheet samping tetap berskala atau memudar. Kontrak docs/design/06 tidak terpenuhi.
- **Perbaikan:** baca `Settings.Global.ANIMATOR_DURATION_SCALE == 0f` (dan/atau `AccessibilityManager`) di MainActivity, lalu teruskan ke `MKTheme(reducedMotion = ...)`.

### P2-7 · Tren KPI Android memakai sumber berbeda dari web
- **Bukti:** web `management-charts.tsx:192` memakai `data.trend` dari `/api/management-charts` (kunci `kepatuhan/tepatWaktu/mingguan/bukti`, cakupan `scopeEntityIds`, 1 desimal). Android memanggil `/api/kpi-trends` (`RG/data/RingkasanGrupApi.kt:31-32`) yang berpenjaga `refuseUnscoped` dan cakupan `resolveScopeEntityId` (path prefix). `GrafikManajemenDto` (`RG/data/RingkasanGrupDto.kt:333-343`) membuang `trend`.
- **Skenario gagal:** akun non-global tanpa entitas (AUDITOR/TI tanpa `scopeEntityId`) mendapat 403 "Tren KPI" di Android, sedangkan web menampilkan grafiknya. Selain itu ada satu permintaan HTTP ekstra.
- **Perbaikan:** tambahkan `val trend: List<TrenBulanDto>` ke `GrafikManajemenDto` dan pakai sebagai sumber kartu tren. Setelah itu `trenKpi()` boleh dihapus.

---

## P3 — rendah

1. **Polling ganda `/api/notifications?inbox=1`.** `feature/pesan/.../PesanIkon.kt:47` dan `feature/notifikasi/.../LoncengNotifikasi.kt:81` sama-sama menarik data tiap 60 detik ke repo yang sama, sehingga ada 2 permintaan per menit dan keduanya saling membuang respons lewat nomor muat. **Perbaikan:** satu poller di repo atau di MKShell.
2. **Batas lencana tidak konsisten.** Pesan memakai "99+" (`feature/pesan/.../logika/LogikaPesan.kt:87-91`), sedangkan lonceng dan web memakai "9+" (`shell.tsx:225/583`). Angka yang sama tampil berbeda di dua ikon bersebelahan. **Perbaikan:** pakai "9+".
3. **Semantik MkDivisionBar salah untuk nilai >100%.** `DS/components/MkDivisionBar.kt:259-261` mengirim `ProgressBarRangeInfo(porsi, 0f..nilaiMaks)` dengan `porsi` terkunci 0..1, sehingga 150% dibacakan sebagai 67%. **Perbaikan:** `current = mentah/100f`.
4. **Pembanding tren tanpa legenda visual.** Garis putus-putus "Kepatuhan" (`RG/grafik/Grafik.kt:326-336`, dipakai `RG/RingkasanGrupTab.kt:488-489`) hanya disebut di contentDescription. **Perbaikan:** tambahkan baris legenda "--- Kepatuhan" di bawah grafik.
5. **Pemilihan titik/batang hanya lewat sentuhan.** `pointerInput` (`Grafik.kt:132/307`) tidak punya `customActions` dan bukan elemen fokus, sehingga pengguna TalkBack tidak bisa mengganti `AngkaTerpilih`. Nilainya tetap terbaca di deskripsi.
6. **PT tanpa data dibaca 0%.** `RG/logika/Pemetaan.kt:242` `pct = e.onTimePct ?: 0`: PT tanpa laporan tampil sebagai batang 0% di bawah target. **Perbaikan:** saring atau tampilkan "Belum ada data", seperti `KartuTepatWaktu` Direktur.
7. **Warna donat status proyek sama untuk dua segmen.** ON dan DONE sama-sama `--sukses` (`RG/RingkasanGrupTab.kt` KartuStatusProyek; `DS/theme/MkColor.kt:81/87`), jadi segmen "Sesuai jadwal" dan "Selesai" tak terbedakan secara warna. Web identik; angka dan kata di legenda tetap membedakan.
8. **Tombol SECONDARY menyimpang dari web.** Android memakai latar `surface` + garis `line` (`DS/components/MkButton.kt:83/102`), sedangkan web memakai `fill-1` tanpa garis (`bundle.css:106`). Di dalam kartu (surface), batas tombol sekitar 1,2:1. tokens.css:10 menyatakan `--line` "jangan jadi satu-satunya batas kontrol".
9. **Tanpa indikasi fokus.** `indication = null` di MkIconBtn, MkChip, MkSegmented, MkFAB, dan MkLampiran membuat pengguna keyboard/D-pad/Switch Access tidak melihat fokus (web: `:focus-visible` 2px `--focus`, `bundle.css:87`). MkIconBtn nonaktif juga tidak berubah tampilannya (`MkIconBtn.kt:62`).
10. **Semantik komponen yang kurang.** `MkCard` yang bisa diklik tidak punya `role = Role.Button` (`DS/components/MkCard.kt:51`). `MkSkeleton` tidak punya semantik "Memuat", jadi pembaca layar diam saat memuat.
11. **Tanda negatif hilang.** `FormatWib.desimal(-0.5)` menjadi "0,5" (`RG/logika/FormatWib.kt:81-85`). Belum terpicu oleh data saat ini.
12. **Kembali sistem menutup seluruh sheet drill-down.** Di tingkat proyek (`RG/SheetDrillDown.kt`, `onTutup = aksi.tutupSheet`), tombol kembali sistem menutup sheet, padahal seharusnya `aksi.kembali` ke daftar perusahaan.

## Yang dicek dan lolos

- **DTO vs rute:**
  - `/api/ringkasan`: `viewer`, `divisions.head/weekly/outputs/onTime`, `trend` M-minggu, dan `byEntity.onTimePct` nullable;
  - `/api/management-charts` (6 kunci);
  - `/api/kpi-trends.months`;
  - `/api/compliance-map.tree`;
  - `/api/late-incidents`: kolom `LateIncident` + `entity`;
  - `/api/daily-reports?projectId`;
  - `/api/notifications?inbox=1` dan PATCH `{ids≤200}|{all}`;
  - kunci `weeklyByGroup` ("Draft", "Menunggu persetujuan", "Disetujui", "Terkunci").
- **Grafik:** `batasRapi`/`porsi` aman untuk nol, NaN, dan negatif. `busurDonat` aman untuk total 0. `indeksDariX` aman untuk lebar dan jumlah 0. Data kosong ditangani EmptyNote. Grafik tidak memakai arah RTL.
- **Lifecycle:** VM ber-Hilt, pemicu memakai `LaunchedEffect(peran)`/`mulai()` idempoten, rotasi aman, polling memakai `repeatOnLifecycle(STARTED)`, dan respons laporan proyek yang basi dibuang.
- **Izin:** `PERAN_PEMANTAU` sama dengan oversight web, 403 → `Bagian.Ditolak`, dan aksi Direktur dibatasi `viewer.canRemind`/`canMarkRead`. Tidak ada emoji atau tanda seru di string zona ini.
- **Tipografi:** angka KPI, grafik, cincin, lencana, dan peta memakai `.tabular`.

## Urutan perbaikan yang disarankan

1. P1-1 alpha tombol nonaktif (DS, satu baris, dampak ke semua layar).
2. P1-3 reset KotakMasukRepo (privasi).
3. P1-2 token `chartIdle`/`chartGrid`/`data*` di MkColors.
4. P2-2 ikon dan kata StatusBadge, P2-1 target sentuh 48dp, P2-6 reduced motion.
5. P2-3 tata letak teks grafik terhadap fontScale.
6. P2-4/P2-5 pembatalan muat dan `sibuk` per divisi.
7. P2-7 sumber tren dari management-charts.
8. P3 sesuai kapasitas.
