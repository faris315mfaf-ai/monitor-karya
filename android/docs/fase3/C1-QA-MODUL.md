# C1 — QA baca-saja modul Fase 3 (audit, entitas, persetujuan, notifikasi, pesan)

Tanggal: 13 Okt 2026. Peninjau: agen QA (baca-saja, tanpa gradle, tanpa ubah kode).
Cakupan: `android/feature/{audit,entitas,persetujuan,notifikasi,pesan}` beserta pemakaian
`core/network` (mkJson, ApiError, MkClient) dan `designsystem`. Kontrak dicocokkan
langsung dengan rute server `src/app/api/**`.

## Ringkasan

| Severity | Jumlah |
|---|---|
| KRITIS | 0 |
| TINGGI | 3 |
| SEDANG | 7 |
| RENDAH | 12 |

Kontrak JSON secara umum aman: `mkJson` = `ignoreUnknownKeys + coerceInputValues + isLenient`,
semua "enum" server didekode sebagai `String` (nilai baru tidak memecah dekode), kolom
opsional diberi bawaan, dan `SerializationException` diterjemahkan `ApiError.dari`.
Satu-satunya risiko dekode yang ditemukan ada di R5.

---

## TINGGI

### T1 — Entitas/Perusahaan: kata sandi serah terima akun baru berubah setelah rotasi
- Bukti: `feature/entitas/.../perusahaan/SheetAkun.kt:92-93` (`remember(kunci) { StatusFormAkun.dari(...) }`),
  `SheetAkun.kt:256` (`sandi = if (akun == null) sandiAcak() else ""`),
  `SheetAkun.kt:142` (`SerahTerimaAkunBaru(ui.dibuat, form.sandi)`),
  `PerusahaanViewModel.kt:418-428` (setelah POST sukses `idAkun` tetap null, `dibuat` diisi).
- Skenario gagal: Admin membuat akun baru (sandi acak dikirim ke server), lalu layar
  diputar / tema gelap diganti / ukuran huruf diubah. Activity dibuat ulang, `remember`
  hilang, `StatusFormAkun.dari` memanggil `sandiAcak()` lagi; `ui.dibuat` di ViewModel
  masih ada sehingga layar serah terima menampilkan kata sandi BARU yang tidak pernah
  dikirim. Admin menyalin sandi salah, pengguna baru tidak bisa masuk.
- Usulan: simpan sandi yang benar-benar terkirim di memori ViewModel saja (mis.
  `AkunDibuat(nama, username, sandiAwal)`, bukan SavedStateHandle), bersihkan di
  `tutupAkun()`; serah terima membaca dari `ui.dibuat.sandiAwal`, bukan dari `form`.

### T2 — Entitas/Perusahaan: wizard tambah perusahaan, masalah sama untuk akun pertama
- Bukti: `SheetWizard.kt:148` (`remember { StatusWizard(...) }`), `SheetWizard.kt:65`
  (`var sandi by mutableStateOf(sandiAcak())`), `SheetWizard.kt:216-217`
  (`HasilWizard(nama, draf = w.draf)`), hasil disimpan di `WizardUi.hasil` (ViewModel).
- Skenario gagal: wizard sukses, layar diputar sebelum sandi disalin → `w` dibuat ulang,
  `draf` kembali bawaan dengan sandi acak baru (atau kosong); kata sandi yang tampil
  bukan sandi akun yang dibuat. Seluruh isian wizard juga hilang saat rotasi di tengah.
- Usulan: salin `positions` (username + sandi terkirim) ke `WizardUi.hasil` di memori
  ViewModel saat `kirimWizard` sukses; `HasilWizard` membaca dari sana.

### T3 — Audit/Sistem & akses: snackbar langsung dibatalkan, semua umpan balik hilang
- Bukti: `feature/audit/.../sistem/SistemAksesScreen.kt:89-100`
  ```kotlin
  LaunchedEffect(pesan) {
      val p = pesan ?: return@LaunchedEffect
      vm.pesanTampil()            // pesan -> null => kunci LaunchedEffect berubah
      ... snackbar.showSnackbar(...)  // efek ini dibatalkan pada frame berikutnya
  ```
- Skenario gagal: `pesanTampil()` menyetel `_pesan = null`; rekomposisi mengganti kunci
  `LaunchedEffect`, coroutine lama dibatalkan dan `showSnackbar` ikut ditutup. Akibatnya
  pesan "X disetujui…", galat PATCH (403/409/422), dan `PESAN_AKTIVASI` (instruksi serah
  tautan lewat web) hanya berkedip satu frame atau tidak tampil sama sekali. Pada galat,
  baris diam-diam kembali ke tombol Setujui/Tolak tanpa penjelasan.
- Usulan: pola yang sama dengan `LogAuditScreen.kt:104-109` — kunci pada `pesan?.id`,
  panggil `vm.pesanTampil()` SETELAH `showSnackbar` selesai (atau di `finally`).

---

## SEDANG

### S1 — Pesan: polling lencana tetap jalan saat aplikasi di latar
- Bukti: `feature/pesan/.../PesanIkon.kt:41-46` (`LaunchedEffect(Unit) { while (isActive) { segarkan(); delay(60s) } }`).
- Skenario: aplikasi ke latar (Activity STOPPED, komposisi tidak dibuang) → GET
  `/api/notifications?inbox=1` tetap tiap 60 detik selama proses hidup (baterai, kuota,
  beban server 97 akun). `LoncengNotifikasi.kt:79-86` sudah benar memakai `repeatOnLifecycle`.
- Usulan: bungkus dengan `LocalLifecycleOwner.current.lifecycle.repeatOnLifecycle(STARTED)`.

### S2 — Pesan + Notifikasi: dua sumber kebenaran untuk data yang sama
- Bukti: `PesanRepo.kt:26` (`_belumDibaca` singleton) vs `NotifikasiViewModel.kt:28`
  (`LoncengUi.belumDibaca`); keduanya memanggil `GET api/notifications?inbox=1` dan
  `PATCH api/notifications` lewat dua antarmuka berbeda (`PesanApi`, `NotificationsApi`).
  MKShell memasang keduanya di bilah atas (`MKShell.kt` actions: `PesanIkon` + `LoncengNotifikasi`).
- Skenario: pengguna "Tandai semua dibaca" di lonceng → lencana Kotak masuk tetap "5"
  sampai 60 detik; membuka pesan di Kotak masuk tidak menurunkan lencana lonceng.
  Dua permintaan identik tiap 60 detik.
- Usulan: satu repositori singleton (StateFlow daftar + unread) dipakai kedua UI; satu
  poller lifecycle-aware.

### S3 — Pesan: daftar basi saat Kotak masuk dibuka ulang
- Bukti: `PesanViewModel.kt:52-54` (muat hanya di `init`), `PesanLayar.kt:94`
  (`hiltViewModel()` terikat entri `beranda` yang hidup sepanjang sesi).
- Skenario: buka Kotak masuk, tutup, 30 menit kemudian buka lagi → daftar lama tampil
  tanpa pesan baru (lencana ikon sudah menunjukkan angka baru). Harus menekan Muat ulang.
- Usulan: `LaunchedEffect(Unit) { vm.muat() }` di `PesanLayar` (mode menyegarkan, data
  lama tetap tampil).

### S4 — Persetujuan: tombol Setujui/Tolak 36dp bertumpuk, jarak 6dp
- Bukti: `PersetujuanTab.kt:310-324` (`MkButtonSize.S`, `Arrangement.spacedBy(6.dp)`),
  `designsystem/.../MkButton.kt:44` (`S(36.dp)`), `MkIconBtn.kt:44` (`size(44.dp)`).
- Skenario: Direktur mengetuk "Tolak" di ponsel, jari mengenai "Setujui" (target < 48dp,
  bersebelahan vertikal) → permintaan anggaran langsung disetujui (urungkan hanya
  lewat snackbar ~10 detik).
- Usulan: `Modifier.minimumInteractiveComponentSize()` di `MkButton`/`MkIconBtn`, atau
  baris Tolak/Setujui horizontal dengan jarak ≥ 8dp; pertimbangkan hanya "Tinjau" di
  baris dan keputusan di Sheet.

### S5 — Notifikasi: tanda baca optimistis dibalik oleh polling yang balapan
- Bukti: `NotifikasiViewModel.kt:33-55` (`muat()` tanpa Job/pembatalan) vs `:58-63`
  (`tandaiBaca` optimistis). `LoncengNotifikasi.kt:88-91` memanggil `muat()` saat Sheet
  dibuka selain loop berkala.
- Skenario: Sheet dibuka (`muat` A berjalan), pengguna mengetuk pesan (lokal = dibaca,
  PATCH dikirim). Respons A (diambil sebelum PATCH) tiba belakangan → pesan kembali
  "belum dibaca", lencana naik lagi sampai polling berikutnya. Beberapa `muat()` paralel
  juga membuat `memuat` berkedip.
- Usulan: simpan `Job` muat dan batalkan sebelumnya; pertahankan himpunan id "baru
  ditandai" dan terapkan di atas hasil server sampai PATCH selesai.

### S6 — Log aktivitas: CSV tidak sesuai saringan di layar
- Bukti: `LogAuditViewModel.kt:222` hanya mengirim `dateFrom/dateTo/action`;
  `src/app/api/audit-logs/export/route.ts:67-70` memakai bawaan 30 hari bila `dateFrom` kosong.
- Skenario: Auditor menyaring pelaku X + "Semua waktu", lalu Unduh CSV → berkas berisi
  SEMUA pelaku dan hanya 30 hari terakhir, padahal daftar menampilkan riwayat X lengkap.
  Pesan sukses tidak menyebut perbedaannya.
- Usulan: tampilkan catatan "CSV memakai rentang tanggal dan aksi; tanpa rentang = 30
  hari terakhir", atau nonaktifkan unduh saat saringan pelaku/sasaran/peran aktif
  (atau perluas rute export — di luar zona Android).

### S7 — Persetujuan: baris yang pernah 403 terkunci baca-saja selamanya
- Bukti: `PersetujuanViewModel.kt:92` (`izinDicabut`), `:258-260` (ditambah saat 403),
  `muat()` `:102-113` tidak pernah membersihkannya.
- Skenario: pengajuan proyek ditolak 403 "Sekarang giliran Admin PT…" (slot belum
  sampai); setelah Admin PT menandatangani dan pengguna Muat ulang, baris tetap tanpa
  tombol sampai ViewModel dibuang (logout/keluar aplikasi).
- Usulan: `izinDicabut.clear()` di awal `muat()`.

---

## RENDAH

| ID | Modul | Bukti | Masalah | Usulan |
|---|---|---|---|---|
| R1 | persetujuan | `PersetujuanTab.kt:87-90` | Tautan berkas bertanda tangan dari server dibuka `uri.openUri` tanpa cek skema/host | Terima hanya `https` + host penyimpanan yang dikenal; tolak skema lain |
| R2 | entitas | `SheetAkun.kt:566, 621, 671`; `SheetWizard.kt:454` | Kata sandi dan tautan aktivasi (token di `#token=`) disalin ke clipboard tanpa tanda sensitif → pratinjau clipboard Android 13+ / riwayat keyboard | `ClipDescription.EXTRA_IS_SENSITIVE` lewat `ClipboardManager` platform |
| R3 | audit | `SistemAksesViewModel.kt:101, 280-288` | Putusan tertahan dikirim di `onCleared` lewat scope tak terikat; bila keluar akun < 5 detik, PATCH bisa berangkat tanpa cookie → gagal diam-diam padahal UI sudah bilang "disetujui" | Kirim segera sebelum `keluar()`, atau batalkan + beri tahu |
| R4 | persetujuan | `PersetujuanTab.kt:153-160` | Urungkan hanya lewat snackbar `Long` (~10 dtk) padahal server memberi 15 menit; keputusan berikutnya menimpa tiket sebelumnya | Tombol Urungkan di baris yang meredup selama jendela 15 menit |
| R5 | audit | `AuditDto.kt:113` (`days: Int?`) vs `src/lib/system-status.ts:135-140` | `days` dari `params` JSON bebas; nilai pecahan (mis. 1.5) memecah dekode SELURUH `/api/system` → layar Sistem galat | Ubah ke `Double?` atau `JsonElement?` |
| R6 | semua | `LoncengNotifikasi.kt:98,144-163`; `SistemAksesScreen.kt:361-438`; `SistemAksesViewModel.kt:166-171,295`; `PersetujuanModel.kt:60-72,304-339`; `PesanIkon.kt:55`; `PesanLayar.kt:237,349-357`; `LogikaPesan.kt:17-22,80` | Teks UI keras di Kotlin (bukan `strings.xml`) | Pindahkan ke `res/values/strings.xml` modul |
| R7 | entitas, audit | `EntitasLayar.kt:359`, `PerusahaanLayar.kt:837` (chevron 28dp); `LogAuditScreen.kt:244-258` (chip hapus pelaku 36dp); `MkChip.kt:55` | Target sentuh < 48dp; chevron PT bersebelahan dengan baris yang membuka Sheet | `minimumInteractiveComponentSize()` |
| R8 | pesan | `PesanRepo.kt:26` | `_belumDibaca` singleton tidak direset saat keluar akun → akun berikutnya sempat melihat angka akun lama | Reset di peristiwa keluar / ikat ke sesi |
| R9 | persetujuan, pesan | `PersetujuanModel.kt:168-181`, `LogikaPesan.kt:117-129` | "Kemarin" dihitung dari selisih 24 jam, bukan hari kalender WIB (audit `Format.kt:62-64` sudah benar) | Bandingkan `toLocalDate()` di zona WIB |
| R10 | pesan | `LogikaPesan.kt:113` | `"%02d.%02d".format(...)` memakai locale perangkat (angka non-Latin di locale tertentu) | `String.format(Locale.ROOT, ...)` |
| R11 | entitas | `EntitasViewModel.kt:199` | Papan aktivitas mengunduh aktivitas SEMUA PT (task + narasi laporan) setiap ganti periode, lalu hanya satu PT yang dipakai | Tambah `entityId` di rute (server) atau cache per periode |
| R12 | notifikasi | `NotifikasiViewModel.kt:39` | 2xx dengan badan kosong dilempar sebagai `HttpException` → pesan "Terjadi galat (HTTP 200)" | Bedakan badan kosong (pola `panggil` di entitas) |

---

## Hal yang diperiksa dan aman

- **Kontrak JSON** (tanpa temuan selain R5): notifications (inbox & riwayat & PATCH),
  ringkasan subset (approvalRequests/deadlineProposals/decisions/escalations/viewer/scope),
  approval-requests GET/PATCH, approval-requests/berkas, deadline-proposals PATCH,
  projects/approve (+undoToken), undo, audit-logs (JsonElement before/after), audit-logs/export
  (header X-Exported-Rows/X-Total-Rows), system (technical/reminders/locking.perEntity),
  access-requests GET/PATCH (kolom `activation` sengaja tidak dideklarasikan),
  roles, health/ready, entities, entities/[id], entity-activity, companies (+users, activation).
  `amount` BigInt → Number di `shapeApprovals`, tipe Float/Int Prisma cocok dengan Double/Int DTO.
- **Badan permintaan**: `encodeDefaults=false` → `note: null`, `ids`/`all` bawaan tidak
  terkirim; PATCH akun memakai `""` untuk mengosongkan sesuai rute.
- **Keamanan**: sandi tidak masuk ViewModel/`rememberSaveable`; `sandiAcak` memakai
  `SecureRandom`; log OkHttp hanya `BASIC` saat debug; tidak ada `Origin` palsu; CSV ditulis
  lewat SAF tanpa izin penyimpanan.
- **Paritas izin**: tombol mengikuti `viewer.canDecide*`, `decisions.mine`,
  `item.canDecide`, `canExport`, `manageableRoles` dari server; 403 diterjemahkan per baris.
  Tab Persetujuan tidak ada untuk Direksi holding/TI/Super Admin — sama dengan `ROLE_TABS` web.
- **WIB & angka**: semua modul memakai `Asia/Jakarta` eksplisit dan `id-ID` untuk angka.
- **Status**: `StatusBadge` (warna + ikon + kata) dipakai konsisten; titik belum-dibaca
  disertai `stateDescription`/teks.
- **Konfirmasi**: hanya hapus akun/perusahaan yang meminta dialog (sesuai aturan desain).

## Prioritas perbaikan per modul

1. **entitas**: T1, T2 (serah terima sandi) → R2 (clipboard sensitif) → R7 → R11.
2. **audit**: T3 (snackbar Sistem) → S6 (CSV vs saringan) → R5 (dekode `days`) → R3 → R6.
3. **persetujuan**: S4 (target sentuh Setujui/Tolak) → S7 (`izinDicabut`) → R1 (skema tautan) → R4 → R9.
4. **pesan + notifikasi**: S1 (polling latar) → S2 (satu repositori bersama) → S3 (muat saat dibuka)
   → S5 (balapan tanda baca) → R8, R10, R12, R6.
5. **designsystem (lintas modul)**: `MkButtonSize.S` 36dp, `MkIconBtn` 44dp, `MkChip` 36dp → 48dp minimum.
