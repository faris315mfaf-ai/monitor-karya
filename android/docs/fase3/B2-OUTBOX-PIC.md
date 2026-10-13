# B2 — Outbox laporan harian PIC + meja kerja PIC (luring)

Agen B2 gelombang Fase 3, 13 Oktober 2026. Cabang `claude/perbaiki-bug-sisa`, tanpa commit.
Menyambung [A1-LURING](A1-LURING.md) §5 ("Untuk agen PIC") dan titik `[TITIK-OUTBOX]` di
[A1-PIC-NOTIFIKASI](A1-PIC-NOTIFIKASI.md) §6, serta temuan server A1 §8 butir 1 (countdown).
Prinsip tetap [Rancangan §4](../../../docs/zcode/RANCANGAN-ANDROID-NATIVE.md): Room = sumber
tampilan saat luring, server = otoritas; 409/422 final, tidak pernah ditimpa lokal.

## 0. Ringkas

| Butir | Hasil | Berkas utama |
| --- | --- | --- |
| Jenis outbox baru, payload entri UTUH | `TAMBAH_ENTRI`/`UBAH_ENTRI` = `EntriSimpanRequest` apa adanya; `HAPUS_ENTRI` = `PayloadHapusEntri`; `UNGGAH_BUKTI` = `PayloadUnggahBukti` | `core/data/sync/JenisOutbox.kt`, `core/network/dto/DtosOutbox.kt` |
| Pengirim latar | `PengirimLaporanPic` (dipanggil `SyncWorker.kirimPesan` lebih dulu); id lokal diganti id server | `core/data/outbox/PengirimLaporanPic.kt`, `IdLokal.kt` |
| Bukti luring | berkas terkompres → `filesDir/bukti-antre/<uuid>.<ext>`; multipart saat daring; disapu setelah sukses/dibuang | `core/data/outbox/BerkasAntre.kt`, `AntreanOutbox.antreBukti` |
| Baca luring | potret JSON respons per layar di tabel baru `cache_layar` (Room **v4**, `MIGRASI_3_4` nyata, `4.json` diekspor) | `core/data/repo/CacheLayar.kt`, `db/MigrasiMk.kt`, `schemas/.../4.json` |
| Layar Laporan harian | gerbang daring-dulu → antre; tumpang antrean per entri/bukti; banner "Luring · data tersimpan HH.MM"; daftar antrean per laporan | `app/ui/laporan/GerbangLaporanPic.kt`, `TumpangAntrean.kt`, `LaporanViewModel.kt`, `LaporanHarianScreen.kt`, `LaporanLembar.kt` |
| Meja kerja PIC | potret work-desk + agenda; centang diantre; sisa waktu dihitung dari `lockAt` | `app/ui/mejakerja/MejaKerjaViewModel.kt`, `MejaKerjaScreen.kt` |
| Server countdown | `GET /api/daily-input` `countdown` = sisa menuju `lockAt` yang SAMA (jam PT kustom, ditutup = lewat), 24/7 tetap `null` | `src/app/api/daily-input/route.ts`, `tests/api/daily-input-countdown.test.ts` |

## 1. Kawat outbox laporan harian

Kunci FIFO semua pesan satu laporan: `KunciOutbox.laporanHarian(proyekId, "YYYY-MM-DD")`.
Tanggal sasaran selalu ada di payload (`workDate` entri baru, `reportDate` kirim laporan) —
pesan yang terkirim esok hari tetap untuk hari yang benar.

| Jenis | API | Payload | Catatan |
| --- | --- | --- | --- |
| `TAMBAH_ENTRI` | POST /api/tasks | `EntriSimpanRequest` (projectId + workDate) | Sukses → `"lokal:<idOutbox>"` di payload penerus berkunci sama diganti id server (`OutboxDao.gantiTeksPayload`, tanda kutip ikut supaya `lokal:1` ≠ `lokal:12`) |
| `UBAH_ENTRI` | PUT /api/tasks | `EntriSimpanRequest` (id; boleh id lokal) | Medan narasi `achievementToday`/`followUp`/`needsEscalation`/`decisionNeeded` selalu terkirim (null/false eksplisit) — PUT server mempertahankan kunci yang ABSEN |
| `HAPUS_ENTRI` | DELETE /api/tasks?id=&context=HARIAN | `PayloadHapusEntri` | |
| `UNGGAH_BUKTI` | POST /api/evidence/upload (multipart TASK) | `PayloadUnggahBukti` (nama berkas lokal, bukan jalur) | Berkas hilang → GAGAL final "lampirkan ulang" |
| `KIRIM_LAPORAN` (lama) | PUT /api/daily-input | `DailyInputRequest` | Simpan draf & kirim; di belakang entri/bukti berkunci sama |
| `UBAH_TUGAS` (lama) | PUT /api/tasks | `TaskSaveRequest` | Centang meja kerja (narasi tidak dikirim → dipertahankan server) |

Temuan A1 (entri didekode sebagai `TaskSaveRequest` → narasi hilang) ditutup: entri tidak pernah
lewat `TAMBAH_TUGAS`/`UBAH_TUGAS`. Centang meja kerja yang mengenai entri dengan `UBAH_ENTRI`
tertunda dibangun dari payload entri TERBARU itu (`centangEntri`) dan diantre sebagai
`UBAH_ENTRI` — PUT mengganti utuh, jadi membangun dari data server lama akan menimpa suntingan
yang belum terkirim.

**Pemroses** (`OutboxProsesor`) kini membaca ulang baris (`OutboxDao.ambil`) tepat sebelum
mengirim: payload penerus yang baru diganti id-nya pada putaran yang sama ikut terkirim benar,
dan pesan yang dibuang pengguna di tengah putaran tidak dikirim.

**Pemetaan hasil** (tidak berubah, lewat `tulisApi` → `HasilKirim.dari`): 409 `locked≠false`
dan 422 → `GagalPermanen` (status GAGAL, pesan server tampil "Gagal kirim", menahan penerus
berkunci sama sampai "Kirim ulang"/"Buang"); 409 `locked:false` (P2002), 5xx, 429, 401 →
sementara + backoff; IOException → luring. Pesan yang masih merujuk id lokal (tambahnya
dibuang) → GAGAL final "Entri asal belum tersimpan di server", tidak pernah dikirim dengan id palsu.

**Buang** (`AntreanOutbox.buang`): berkas bukti milik pesan ikut dihapus; membuang
`TAMBAH_ENTRI` ikut membuang semua pesan aktif berkunci sama yang memuat `"lokal:<id>"`.

## 2. Bukti (Rancangan §4 butir 3)

1. `PenyiapBukti` (A1) tetap: foto sisi panjang ≤2048 px, JPEG q85, ekstensi cocok mime, ≤20 MB.
2. Daring dulu (multipart langsung). Bila luring, entri masih lokal, atau laporan punya pesan
   tertunda: bait ditulis atomik (`.tmp` → rename) ke `filesDir/bukti-antre/<uuid>.<ext>`,
   lalu pesan `UNGGAH_BUKTI` mengacu NAMA berkas. Nama divalidasi (`BerkasAntre.namaSah`) — jalur
   dari payload tidak pernah dipercaya.
3. Penghapusan berkas: `SyncWorker` menyapu berkas yang tidak dirujuk pesan aktif
   (`PengirimLaporanPic.sapuBerkas`, tenggang 10 menit agar berkas yang baru ditulis layar aman)
   — mencakup sukses, GAGAL >30 hari, dan dibuang; `buang()` menghapus seketika;
   `MesinSinkron.hentikanDanBersihkan` (keluar/ganti akun) menghapus seluruh folder.
4. Sheet entri menampilkan bukti antre sebagai baris "Menunggu kirim · 1,2 MB" / "Gagal kirim · …";
   hapus = buang pesan. Bukti antre tidak dimuat sebagai thumbnail server.
5. Entri baru yang diantre: Sheet tetap terbuka dengan id lokal sehingga bukti bisa langsung
   dilampirkan (ikut antre di belakang entrinya).

## 3. Keputusan per aksi

| Aksi | Luring | Alasan |
| --- | --- | --- |
| Tambah / ubah entri | Antre | Isian kerja PIC; server menilai beku/kunci saat terima (409 → GAGAL tampil) |
| Hapus entri | Antre (entri lokal yang tambahnya GAGAL/tak ada: cukup dibuang lokal) | Urut di belakang ubah; server memutuskan beku |
| Unggah bukti | Antre (berkas privat) | Rancangan §4 butir 3 |
| Simpan draf, kirim laporan | Antre | Rancangan §4 menyebut "kirim laporan"; urut di belakang entri/bukti (roll-up server memakai entri yang sudah sampai). **Keterlambatan dinilai server menurut waktu terima** — banner/snackbar menyebut "Terkirim otomatis saat daring" |
| Centang agenda meja kerja | Antre | Sama dengan ubah entri; tampil "Menunggu kirim" di baris agenda |
| Hapus laporan | Selalu daring; ditolak bila laporan masih punya pesan tertunda | Destruktif; tidak boleh mendahului kirim/draf yang belum sampai |
| Hapus bukti server | Selalu daring | Destruktif atas berkas server |
| Ajukan buka kunci | Selalu daring | Butuh reportId & keadaan server terkini; rantai persetujuan; ajuan basi menyesatkan |
| Urungkan | Selalu daring | Tiket 15 menit hanya bermakna seketika |

Aturan gerbang "daring dulu": panggil API; hanya `ApiError.Jaringan` yang dialihkan ke
antrean. **Bila laporan yang sama masih punya pesan aktif (MENUNGGU/GAGAL), tulisan baru
langsung diantre** — FIFO per laporan: kirim laporan daring tidak boleh mendahului entri luring
yang belum sampai. Aksi "selalu daring" yang gagal jaringan memberi kalimat
"<aksi> butuh koneksi internet. Coba lagi saat daring."

## 4. Baca luring (Room)

- Tabel `cache_layar(kunci PK, json, disimpanPada)`; kunci: `laporan:meja:<tgl|hari-ini>`,
  `laporan:entri:<proyek>:<tgl>`, `meja-kerja:pic`, `meja-kerja:agenda:<proyek>`. Isi = respons
  server (mkJson), dibuang setelah 14 hari dan saat keluar akun (`clearAllTables`).
- Gerbang/VM: tarik sukses → simpan potret; galat jaringan → potret + `tersimpanPada`. Layar
  menampilkan `BannerLuring` "Luring · data tersimpan HH.MM · n menunggu kirim" bila luring atau
  data berasal dari potret (parameter `offline` lama tetap diterima, MKShell tidak disentuh).
- Tumpang antrean (`tumpangkanAntrean`, `tumpangkanAgenda`): entri lokal, ubah/hapus tertunda,
  bukti antre, dan centang tampil di atas potret dengan `LencanaKirim` per entri/baris agenda;
  GAGAL menampilkan pesan server di kartu. `DaftarAntreanOtomatis(laporanHarian(proyek, tgl))`
  di bawah daftar entri (dan per proyek di meja kerja) memberi "Kirim ulang"/"Buang".
- Pesan antrean yang hilang (terkirim/dibuang) memicu muat ulang diam-diam sehingga entri lokal
  berganti versi server.

## 5. Room v4

- `MigrasiMk.VERSI = 4`; `MIGRASI_3_4` = satu `CREATE TABLE IF NOT EXISTS cache_layar …` (tanpa
  DROP/DELETE; outbox tidak disentuh). `4.json` diekspor sungguhan oleh Room KSP lewat init
  script sementara `scratchpad/skema-room.init.gradle` (sama dengan A1; berkas gradle repo tidak
  diubah — tindak lanjut parent di A1-LURING §4 masih berlaku).
- `MigrasiMkTest.migrasi3ke4…`: SQL migrasi == `createSql` 4.json, tabel lama identik v3↔v4.
- DAO outbox baru: `ambil`, `gantiTeksPayload`, `aktifMemuat`, `payloadAktif` (kueri saja, tanpa
  perubahan skema outbox).

## 6. Server: countdown daily-input

`GET /api/daily-input` dulu mengirim `countdown: dailyCountdown(now)` (jam env 17.00) walau
`lockAt` sudah mengikuti aturan PT. Kini `countdown = countdownUntil(lockAt, now)` memakai
instan `lockAt` yang sama (hari yang dibuka, jam kustom, pengisian ditutup = sudah lewat); 24/7
tetap `null`. Bentuk `{hours, minutes, totalMs, passed}` tidak berubah (web tetap jalan).

Android: laporan harian menghitung sisa dari `lockAt` (A1); meja kerja kini juga menghitung dari
`lockAt` terhadap jam kini (`sisaMenuju`) — potret Room lama yang sudah melewati tenggat tampil
terkunci, bukan "0 menit lagi".

## 7. Tes

| Tes | Isi |
| --- | --- |
| `core/network` `PayloadOutboxB2Test` (5) | `EntriSimpanRequest` penuh bolak-balik sama + byte encode ulang identik; null/false narasi tetap terkirim eksplisit; entri baru tanpa `id`; `PayloadUnggahBukti`/`PayloadHapusEntri`/`DailyInputRequest`/`TaskSaveRequest` utuh |
| `core/data` `OutboxEntriPicTest` (8) | FIFO TAMBAH→UBAH(lokal)→UNGGAH(lokal)→HAPUS dengan id lokal diganti dalam satu putaran dan badan PUT == badan asli; 409 beku → GAGAL + pesan server + penerus ditahan (juga di putaran berikut); 422 → GAGAL pesan server; 409 `locked:false` → sementara; id lokal yatim → GAGAL tanpa kirim; penggantian `lokal:1` tidak menyentuh `lokal:12`; berkas hilang → GAGAL; penyapu (tenggang, yatim saja, tolak jalur) |
| `core/data` `MigrasiMkTest` (+1) | 3→4 |
| `app` `TumpangAntreanTest` (8) | tumpang entri lokal (semua medan + jam terbawa saat diubah), ubah/hapus/bukti berurutan, hapus GAGAL tampil, agenda centang + entri luring, centang dari entri tertunda mempertahankan narasi, tenggat dari lockAt (jam PT 15.00 vs countdown env), potret meja kerja lewat tenggat → terkunci |
| server `tests/api/daily-input-countdown.test.ts` (7) | jam 15.00/20.00, lewat, ditutup, 24/7 null, invarian `totalMs = lockAt − now` |

Hasil: lihat §8.

## 8. Verifikasi

- Server: `npx vitest run tests/api tests/cx tests/security` → 71 berkas / 1.385 tes lulus;
  `npx tsc --noEmit --incremental false` bersih; `npx eslint` berkas route + tes bersih.
- Android `:core:network:testDebugUnitTest`, `:core:data:testDebugUnitTest` hijau (lewat
  `gradle-kunci.sh`, dengan init script ekspor skema).
- `:app:testDebugUnitTest` hijau (LaporanLogika 12 + TumpangAntrean 8 + MejaKerjaLogika 4);
  `:app:assembleDebug` hijau termasuk `hiltJavaCompileDebug` (graf Hilt dengan `AntreanOutbox` +
  `CacheLayar` tersuntik ke gerbang/VM). Percobaan pertama sempat gagal di
  `ui/mejakadiv/MejaKadivViewModel.kt` (berkas agen lain, sedang ditulis); diulang setelah
  ditunggu — hijau. Belum diuji di perangkat/emulator (dilarang).
- Skenario manual yang disarankan: mode pesawat → tambah entri + foto → ubah entri → kirim
  laporan → banner "2/3/4 menunggu kirim" → daring → antrean kosong, entri berganti id server,
  laporan terkirim; ulangi dengan laporan yang sudah diteruskan Admin PT → "Gagal kirim" +
  pesan beku, "Buang" menghapus berkas lokal.

## 9. Batas yang diketahui

- Pengiriman at-least-once: bila proses mati setelah POST entri sukses tetapi sebelum baris
  ditandai berhasil, entri bisa terkirim dua kali (server belum punya kunci idempoten). Penggantian
  id lokal sudah terjadi sehingga penerus tetap merujuk entri pertama.
- Potret "hari ini" dari kemarin tetap tampil saat luring dini hari (tanggal di kepala layar +
  banner jam simpan menandainya); tulisan memakai tanggal meja yang tampil.
- `jumlahEntri` di daftar proyek (multi-proyek) belum menghitung entri lokal.
- Agenda meja kerja: entri lokal tidak bisa dicentang sampai terkirim (centang = PUT atas id server).
- Kamera langsung tetap belum ada (FileProvider di manifest = zona parent).
