# G3 — Tes flaky `:feature:proyek`

Lingkup: `feature/proyek/src/test/.../ProyekViewModelTest.kt` saja. Kode produksi tidak diubah.

## Cara uji
`gradle-kunci.sh :feature:proyek:testDebugUnitTest --rerun-tasks` diulang dalam loop. Bila gagal, XML hasil tes disalin untuk dibaca jejaknya.

## Temuan (ada tiga race, semuanya di tes)

| # | Gejala | Frekuensi sebelum | Akar |
|---|---|---|---|
| 1 | `detailMengambilEskalasiTerkait…` gagal dengan `ClassCastException Bagian$Memuat → Siap` di baris cast `laporan` | 1 dari 10 run | Predikat `tunggu` menunggu 4 bagian, tetapi tidak menunggu `laporan`. Kelima bagian dimuat paralel (`async`), jadi urutan tibanya acak. |
| 2 | `IllegalStateException: Dispatchers.Main is used concurrently with setting it` di `resetMain()` (`@After`). Tes yang kena acak, misalnya `bagianDetail403…`, `setujuiCepat…`, `urutTahap…`, `k1AjukanUlang…` | 1–2 dari 15–20 run | ViewModel tidak pernah dibersihkan, sehingga `viewModelScope` hidup melewati akhir tes. Respons OkHttp yang tiba setelah asersi melanjutkan coroutine VM di thread OkHttp (Main = `UnconfinedTestDispatcher`). Coroutine itu membaca `Dispatchers.Main` bersamaan dengan `resetMain`/`setMain` tes berikutnya. Contoh jejak: `segarkanSetelahKonflik → muatDaftar → launch` dari `RealCall$AsyncCall`. |
| 3 | `vmSiap` habis waktu 5 dtk, daftar tetap `MEMUAT`, dan server tidak mencatat satu permintaan pun | 1 dari 48–63 run | Bentrok port lintas keluarga alamat. MockWebServer mendengar di `127.0.0.1:P`, tetapi URL-nya `localhost`. OkHttp 5 (fast fallback) mencoba `[::1]:P` lebih dulu. Emulator qemu milik agen lain kebetulan mendengar di `[::1]:53630`, sama dengan port server tes. Koneksi diterima qemu dan tidak pernah dijawab. Bukti dari thread dump dan `lsof`: dua thread OkHttp menunggu header dari `localhost:53630`, server tes masih di `accept()`, dan `qemu-syst [::1]:53630 (LISTEN)` disertai koneksi `CLOSE_WAIT`. |

**Kode produksi aman:**
- Semua penulisan `_detail` dan `_daftar` memakai `MutableStateFlow.update` (CAS).
- Di produksi coroutine VM berjalan di Main yang hanya satu thread, dan dibatalkan di `onCleared`.
- Variabel biasa (`nomorMuat`, `izinAjukanPasti`) hanya bisa terbaca lintas thread di tes, karena tes memakai Unconfined, bukan di Main sungguhan.

## Perbaikan (`ProyekViewModelTest.kt`)
1. Predikat tes eskalasi ditambah `it.laporan is Bagian.Siap`.
2. VM kini dibuat lewat `ViewModelStore` dan `ViewModelProvider` (`buatVm()`). Urutan `@After`:
   1. `tokoVm.clear()` untuk membatalkan `viewModelScope`.
   2. `join` semua job VM (batas 5 dtk).
   3. Buka gerbang `tahan`.
   4. `server.shutdown()`.
   5. `resetMain()`.
3. Server diikat ke `127.0.0.1` dan base URL memakai IPv4 literal `http://127.0.0.1:<port>/`. Dengan begitu tidak ada resolusi `localhost` ke `::1`.
4. Bila `tunggu` habis waktu, kini muncul `AssertionError` yang memuat nilai terakhir StateFlow. Tujuannya agar diagnosis berikutnya tidak buta.

## Bukti
- Sebelum: 1/10, 2/20, 1/15, 1/25, 1/48, 1/63 run gagal, tergantung race mana yang masih tersisa.
- Sesudah ketiga perbaikan: **40/40 run berturut-turut hijau** (56 tes per run, `--rerun-tasks`).

## Butuh parent (di luar kepemilikan)
Pola `server.url("/")`, yaitu MockWebServer di `localhost`, rentan terhadap race #3 selama emulator berjalan. Pola ini masih dipakai di:
- `core/network` (SesiCookieC5, T12Audit, InboxTeruskan409, EncodeDefaultD1, IdempotensiApi, EntriLaporanA1)
- `core/data` (OutboxIdempotensi)
- `feature/pesan` (DtoPesan)
- `feature/ringkasangrup` (RingkasanDirekturViewModel, DtoRingkasanGrup)

Perbaikannya sama dengan di atas: `start(InetAddress.getByName("127.0.0.1"), 0)` ditambah base URL IPv4 literal. Untuk tes ViewModel lain, pola #2 (bersihkan VM sebelum `resetMain`) juga patut diperiksa.
