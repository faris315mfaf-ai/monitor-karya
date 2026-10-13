# C5 — QA baca-saja: core (data/network/domain) + laporan harian & meja kerja PIC

Peninjau QA, 13 Oktober 2026. Baca-saja: tidak ada kode yang diubah, gradle tidak dijalankan.
Pohon kerja sedang disunting agen lain selama tinjauan (SesiViewModel/TransisiSesi berubah pukul
11.43); setiap bukti di bawah sudah dicek ulang terhadap isi berkas pukul 11.47 WIB.

Zona: `android/core/data/**`, `android/core/network/**`, `android/core/domain/**`,
`app/ui/laporan/**`, `app/ui/mejakerja/**`. Kontrak server dicocokkan dengan
`src/lib/idempotency.ts`, `src/app/api/tasks/route.ts`, `src/app/api/evidence/upload/route.ts`,
`src/app/api/daily-input/route.ts`, `src/lib/storage.ts`, `src/proxy.ts`.

Ringkasan: **0 KRITIS terbukti, 4 TINGGI, 6 SEDANG, 7 RENDAH.**

---

## TINGGI

### T1. Bukti/ubahan yang dilampirkan setelah entri luring terkirim jadi GAGAL final permanen
- Bukti: `LaporanViewModel.kt:315-320` (Sheet tetap terbuka, `idTersimpan = "lokal:<n>"`);
  `GerbangLaporanPic.kt:179` dan `:298` (id lokal → selalu antre); `PengirimLaporanPic.kt:84`
  (`gantiTeksPayload` hanya mengganti baris yang SUDAH ada saat TAMBAH sukses);
  `PengirimLaporanPic.kt:56,64,92` (id lokal → `GagalPermanen(PESAN_ASAL_BELUM)`).
- Skenario: PIC luring menambah entri → Sheet tetap terbuka "lampirkan bukti" → sinyal kembali,
  pekerja mengirim TAMBAH_ENTRI dan mengganti id lokal di pesan penerus yang ada → PIC baru
  memotret dan melampirkan bukti (atau menekan "Simpan perubahan"). Pesan baru masih membawa
  `lokal:<n>` padahal pesan tambahnya sudah terhapus → GAGAL final "Entri asal belum tersimpan…
  Buang pesan ini". Foto bukti lapangan hilang (harus dibuang), entri di server tanpa bukti.
  Tidak ada yang memperbarui `_lembar.idTersimpan` ketika pesan tambah terkirim (`init` di
  `LaporanViewModel.kt:172-180` hanya `segarkan()`).
- Perbaikan: simpan peta `lokal:<n> → idServer` persisten (tabel kecil/kolom di Room, diisi di
  `saatSukses` TAMBAH sebelum baris dihapus); `PengirimLaporanPic` dan `GerbangLaporanPic`
  menerjemahkan id lokal lewat peta itu sebelum memutuskan GAGAL/antre; ViewModel mengganti
  `idTersimpan` Sheet saat peta terisi. Tambah tes: TAMBAH sukses → antre bukti dengan id lokal
  → terkirim dengan id server.

### T2. Dua SyncWorker berjalan bersamaan atas antrean yang sama
- Bukti: `SyncScheduler.kt:24,27,50,60` — dua nama unik berbeda (`mk-sinkron-saat-online`,
  `mk-sinkron-berkala`) menjalankan kelas `SyncWorker` yang sama; `MesinSinkron.kt:44-45`
  memasang keduanya sekaligus (periodik tanpa initial delay langsung jalan); periodik yang
  tertunda selama luring dan one-time dari `ConnectivityObserver` (`MesinSinkron.kt:50`) jatuh
  tempo pada detik yang sama saat jaringan kembali — tepat ketika antrean berisi. Tidak ada
  Mutex/klaim baris di `SyncWorker`/`OutboxProsesor`.
- Skenario: dua `OutboxProsesor` mengirim pesan yang sama paralel. Jenis beridempotensi aman
  (server menunggu di indeks unik lalu replay). Jenis mingguan (`SIMPAN_BUTIR_MINGGUAN`,
  `HAPUS_BUTIR_MINGGUAN`, `AKSI_MINGGUAN`, tanpa header — `JenisOutbox.kt:50-59`) bisa membuat
  butir ganda atau "Gagal kirim" palsu (409 serahkan kedua) padahal yang pertama sukses;
  `percobaan`/backoff dihitung ganda; tarik Room dobel.
- Perbaikan: satu `Mutex` proses-lebar (objek singleton) mengelilingi `kirimAntrean()`, atau
  pekerja periodik hanya memanggil `jadwalkanSekaliSaatOnline` (satu nama unik yang memproses).
  Tambahan defensif: status klaim `MENGIRIM` dengan `UPDATE … WHERE status='MENUNGGU'`.

### T3. Antrean akun lama dapat terkirim dengan cookie akun baru (jendela sempit)
- Bukti: cookie akun baru tersimpan di dalam `authApi.login` (cookie jar `MkClient.kt:59-62`)
  SEBELUM pembersihan `transisiSiap`/`bersihkanDataAkun` (`SesiViewModel.kt` `masuk()` →
  `ubahStatus` → `terapkanStatus`). Pekerjaan WorkManager akun lama TIDAK dibatalkan pada jalur
  mulai-dingin 401 (`muat()` → `KeLogin` → `ubahStatus(TanpaSesi)`, tanpa `mesin.jeda()`) dan
  pada 401 yang terjadi di pekerja latar ketika tidak ada SesiViewModel yang mengoleksi bus.
  `SyncWorker.kt:95` hanya memeriksa "ada cookie", bukan "cookie milik pemilik antrean".
- Skenario: sesi A kedaluwarsa (aplikasi tertutup) → antrean A tersisa → B masuk di perangkat
  yang sama → selama ±1 RTT (`/api/auth/me` kedua) + baca DataStore, periodik/one-time lama yang
  jatuh tempo mengirim entri/laporan A atas nama B (idempotensi per userId tidak melindungi).
- Perbaikan: `mesin.jeda()` di awal `masuk()` dan pada setiap keputusan `TanpaSesi`; pekerja
  memeriksa `prefs.uidTerakhir == profilStore.baca()?.id` dan profil hanya disimpan setelah
  pembersihan; idealnya kolom `pemilikUid` di outbox dan pekerja menolak baris milik uid lain.

### T4. Mulai dingin luring hari berikutnya memakai meja "hari ini" yang basi
- Bukti: `CacheLayar.kt:47` kunci potret `laporan:meja:hari-ini` tetap; `GerbangLaporanPic.kt:108-116`
  memakai potret apa adanya; `LaporanLogika.kt:94-99` `tanggalKunci/hariIni/lewatTenggat` dari
  potret; `GerbangLaporanPic.kt:165` kunci & `workDate` dari `tanggalKunci` itu.
- Skenario: PIC di lapangan tanpa sinyal membuka aplikasi pagi hari → layar berkata "laporan …
  hari ini belum dikirim" dengan data kemarin (potret ≤14 hari) → entri baru diantre dengan
  `workDate` kemarin → saat daring server menolak (lockCheck hari lampau) → GAGAL final semua,
  atau (bila hari itu sedang dibuka) masuk ke laporan tanggal yang salah.
- Perbaikan: saat potret dipakai untuk `tanggal == null`, bandingkan `todayKey` potret dengan
  `Wib.hariIni()`; bila beda, tandai meja "data tanggal X", nonaktifkan tulis (atau bangun meja
  kosong hari ini dari daftar proyek potret). Segarkan juga meja saat ON_RESUME/lewat tengah malam.

## SEDANG

### S1. Hapus entri "lokal" yang ternyata sudah terkirim dilaporkan sukses padahal tidak dihapus
- Bukti: `GerbangLaporanPic.kt:192-198` — `tambah == null` diperlakukan "belum pernah sampai
  server", padahal null juga berarti TAMBAH sudah BERHASIL dan barisnya dihapus.
- Skenario: daftar masih menampilkan kartu lokal (sebelum `segarkan`) → PIC menghapus → snackbar
  "Entri dihapus" → entri tetap di server dan muncul lagi, ikut roll-up laporan.
- Perbaikan: bila `tambah == null`, cari id server lewat peta T1 lalu DELETE; bila tidak ada
  peta, muat ulang dan minta ulangi.

### S2. OOM pada berkas non-foto besar
- Bukti: `PenyiapBukti.kt:49-52` membaca seluruh berkas (`readBytes`) baru memeriksa 20 MB;
  `LaporanViewModel.kt:345` hanya menangkap `Exception`, bukan `OutOfMemoryError`.
- Skenario: PDF/xlsx 200 MB dari pengelola berkas → aplikasi tertutup paksa, isian Sheet hilang.
- Perbaikan: baca `OpenableColumns.SIZE` (atau `AssetFileDescriptor.length`) dulu; tolak >20 MB
  sebelum membaca; untuk antrean salin dengan stream ke berkas, bukan `ByteArray`.

### S3. Foto HEIF/"octet-stream" ditolak sebelum sempat dikompres
- Bukti: `PenyiapBukti.kt:40-43` — mime dari `getType` harus ada di `MIME_DIIZINKAN`; kamera
  Samsung/Pixel kerap melapor `image/heif`; pengelola berkas kerap `application/octet-stream`
  (fallback `tebakMime` hanya dipakai bila `getType` null).
- Perbaikan: `image/*` apa pun yang bisa didekode → kompres ke JPEG lalu validasi; bila mime
  generik, pakai `tebakMime(nama)`.

### S4. Android 8.0/8.1 (minSdk 26): foto miring & memori besar
- Bukti: `PenyiapBukti.kt:65-71` jalur `BitmapFactory` tidak menerapkan orientasi EXIF;
  `sampelUkuran` membiarkan sisi ≥2048 sehingga foto 12 MP didekode penuh ARGB (±48 MB) +
  salinan skala.
- Perbaikan: baca `ExifInterface` dan putar matriks; pakai `inSampleSize` sampai sisi ≤2× target
  dan `RGB_565`.

### S5. Isian Sheet hilang saat proses dimatikan (buka kamera/galeri)
- Bukti: `LaporanViewModel.kt:136-139` `_lembar` hanya `MutableStateFlow`, tanpa `SavedStateHandle`;
  pemilih foto/berkas (`LaporanLembar.kt:87-92`) memindahkan aplikasi ke latar.
- Skenario: HP RAM kecil membunuh proses saat PIC memilih foto → kembali: Sheet tertutup, teks
  panjang "Hasil hari ini" hilang, `kunciTambah` baru (idempotensi entri belum tersimpan hilang).
- Perbaikan: simpan `LembarEntri` (isian + kunciTambah + idTersimpan) di `SavedStateHandle`.

### S6. 401 dari permintaan basi menghapus cookie sesi yang BARU
- Bukti: `MkClient.kt:89-99` — setiap 401 pada permintaan bercookie memanggil `authStore.hapus()`
  tanpa membandingkan cookie yang dikirim dengan yang tersimpan kini.
- Skenario: permintaan lama (cookie A/sesi basi) kembali 401 setelah login baru tersimpan →
  cookie baru dihapus, peristiwa BERAKHIR melempar pengguna ke layar masuk.
- Perbaikan: hapus hanya bila `permintaan.header("Cookie") == authStore.header()`.

## RENDAH

- R1. `SyncWorker.kt:105-109` + `OutboxProsesor.kt:53`: pesan yang DITAHAN di belakang GAGAL
  final dihitung `ditahan` → `Result.retry()` 6× sia-sia (baterai). Hitung terpisah, jangan retry.
- R2. `MkClient.kt:52,117`: `followRedirects(true)` + header `Cookie` manual → OkHttp tidak
  membuang header Cookie pada redirect lintas host (hanya Authorization). Matikan redirect atau
  pasang cookie lewat `CookieJar.loadForRequest` dengan cek host. Origin memang tidak dikirim —
  sesuai `src/proxy.ts`.
- R3. `src/lib/idempotency.ts` `storableBody`: respons >64 KiB direplay sebagai
  `{ok,idempotentSummary,resourceId}` → `EntriSimpanResponse.task` wajib → SerializationException
  → `Lainnya` → GagalPermanen untuk replay TAMBAH yang sebenarnya sukses. Baca `resourceId`
  sebagai cadangan id server.
- R4. `AntreanOutbox.ulangi` (`Daos.kt` `ulangi` mereset `dibuatPada`) + TTL kunci server 7 hari:
  "Kirim ulang" pesan kedaluwarsa >7 hari yang mungkin sudah commit → entri ganda. Beri kunci
  baru hanya bila server pasti menolak; atau peringatkan.
- R5. `LaporanLembar.kt:105-110`: "Selesai"/"Batal" menutup Sheet tanpa peringatan perubahan
  belum disimpan (entri baru yang sudah tersimpan lalu disunting).
- R6. `LaporanViewModel.kt:397-417`, `:368-385`: hapus entri/bukti tanpa penjaga klik ganda
  (`_hapusSibuk`/`hapusBuktiId` tidak dicek sebelum meluncurkan) → DELETE kedua 404 tampil galat.
- R7. `Wib.kt:25-29` `kunciHarian/terkunciHarian` 17.00 tetap masih publik (tak dipakai) —
  hapus agar tidak dipakai ulang melawan aturan ReportSettings 24/7. Room tidak terenkripsi
  (cache laporan + antrean di `monitorkarya.db`); backup sudah dimatikan (`AndroidManifest`
  allowBackup=false + dataExtractionRules), logging hanya BASIC di debug (`AppModule` →
  `BuildConfig.DEBUG`). Catatan: build debug memakai BASE_URL produksi.

## Yang diperiksa dan lolos
- Rantai migrasi Room 2→3→4→5 sesuai skema ekspor (kolom outbox/cache_layar cocok; v1 destruktif
  sah); indeks memadai untuk ukuran tabel.
- FIFO per kunci, backoff 30 s→30 mnt, kedaluwarsa 7 hari → GAGAL (bukan hapus), GAGAL >30 hari
  disapu, berkas yatim disapu dengan tenggang 10 mnt, `hapusSemua` saat keluar.
- Kunci idempotensi disimpan sebelum kiriman pertama; jalur daring→antre memakai kunci + badan
  sama; 409 `locked:false` = sementara; 401/403 MUST_CHANGE = sementara (tidak menggagalkan final).
- PUT entri mengirim `achievementToday/followUp/needsEscalation` eksplisit (null membersihkan);
  centang meja kerja tidak mengirimnya dan server mempertahankannya (`tasks/route.ts:491-493`).
- Header Origin tidak pernah dipasang; X-MK-Client dikirim; cookie kedaluwarsa dihapus; batas
  413/20 MB konsisten dengan `evidence/upload` (+1 MB pembungkus).
- Keluar dengan antrean berisi meminta konfirmasi (`MKShell.kt:150-152`).

## Prioritas perbaikan
1. T2 (Mutex/satu nama kerja) — murah, menutup duplikasi mingguan.
2. T1 + S1 (peta id lokal→server) — kehilangan bukti lapangan.
3. T4 (potret meja basi lintas hari) — PIC luring menulis ke tanggal salah.
4. T3 (jeda sebelum login + pemilik antrean).
5. S2–S5 (penyiap bukti & SavedStateHandle), S6.
6. Rendah sesuai waktu.
