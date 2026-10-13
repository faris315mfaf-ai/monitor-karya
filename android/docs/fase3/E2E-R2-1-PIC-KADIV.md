# E2E-R2-1 — Uji regresi: PIC, PIC wajib ganti sandi, Kepala divisi (emulator-5554)

Tanggal uji: 13 Okt 2026, 14.44–15.06 WIB.

Lingkungan:
- Aplikasi `id.co.monitorkarya.app.dev` 0.1.0, dipasang bersih 14.42.
- Server dev `127.0.0.1:3100` (adb reverse), DB uji yang baru di-seed ulang.
- Tangkapan layar dan skrip ada di `/private/tmp/claude-501/e2e-r2-1/NN-*.png`.

Akun yang dipakai:
- `pic.pt-001.1`
- `pic.pt-001.2` (wajib ganti sandi; sandi baru ada di `pic2.txt`, mode 600)
- `kadv.keuangan.pt-001`
- `kadv.sdm.pt-008`: laporan M42 masih DRAFT. Dipakai untuk menguji alur bukti → Serahkan → Setujui, karena laporan Keuangan di seed baru sudah DISETUJUI.

Kode tidak diubah. Tidak ada crash: buffer `crash` kosong, dan tidak ada `FATAL EXCEPTION`. Baris "Shutting down VM" di logcat berasal dari perintah `adb shell`. Tidak ada 5xx di log server.

## Tabel regresi (temuan E2E-1)

| # | Temuan E2E-1 | Status R2 | Bukti / catatan |
|---|---|---|---|
| 1a | Tandai sudah dibaca + Urungkan (Divisi) | **TERBUKTI BERES** | `35`→`36`→`37`: POST read 200, pesan "Laporan PIC ditandai sudah dibaca." + Urungkan → POST unread 200, label kembali "Belum Anda baca". Keadaan dibaca dipulihkan. |
| 1b | Kehadiran + Urungkan (tambahan perbaikan) | **TERBUKTI BERES** | `38`: POST /api/attendance 200, pesan + Urungkan → kembali ke status sebelumnya. Data dipulihkan: Keuangan TERLAMBAT, SDM IZIN. |
| 1c | Ingatkan {nama} | **TIDAK DAPAT DIUJI** | Di kedua divisi uji, satu-satunya anggota sudah punya laporan terkirim (seed `submittedAt` 16.00), jadi tombol Ingatkan memang tidak muncul. Ini benar menurut `aksiUtamaAnggota`. |
| 1d | Ringkasan ke Direktur | **TERBUKTI BERES** (ada bug baru N4) | `40`: tombol "Buka ringkasan untuk Direktur" membuka Sheet: status Terkirim ke Bpk. Andi Kurniawan, metrik, poin. |
| 2 | Lampiran bukti butir mingguan → Serahkan → Setujui | **TERBUKTI BERES** | `kadv.sdm.pt-008`: tautan "Lampirkan bukti · …" → Lampirkan foto (`47`) dan Lampirkan berkas (`48`), keduanya POST upload 200. Catatan "belum berbukti" hilang (`49`). **Serahkan** → POST weekly-input 200, status "Menunggu persetujuan" (`50`). **Setujui laporan** → POST 200, status "Disetujui" (`51`). Tidak ada 409/422. |
| 3 | Sheet kosong di lanskap | **TERBUKTI BERES** | `19`, `20`: Ubah entri di lanskap tampil sebagai panel samping. Medan terlihat dan bisa digulir sampai Batal/Simpan. Sheet butir mingguan di lanskap juga benar (`55`). Isian bertahan setelah kembali ke potret. |
| 4 | ActionBar hitam ganda / inset | **TERBUKTI BERES** | `00`, `01`, `02`: tidak ada bilah hitam, dan TopAppBar berada di bawah status bar sejak masuk pertama kali. Ikon Keluar bisa diketuk. |
| 5 | Geser-tutup Sheet "Ubah entri" membuang isian | **TERBUKTI BERES** | Saat ada perubahan, geser ke bawah (pelan maupun cepat), tombol Kembali, dan ketuk scrim di lanskap tidak menutup Sheet; isian tetap ada (`10`). Batal menutup Sheet dan membuang perubahan dengan benar. |
| 6 | Label tab aktif tak terbaca | **TERBUKTI BERES** | Label aktif hitam tebal dengan ikon di atas kapsul aksen lembut (`02`, `45`). Berlaku untuk bilah 4 tab PIC dan 5 tab Kadiv. |
| 7 | Butir N/A tampil "Belum mulai" | **TERBUKTI BERES** | Ada segmen "N/A 1" sendiri, dan "Belum 1" tidak lagi menghitung N/A (`45`). |
| 8 | "17.00 WIB WIB" | **TERBUKTI BERES** | "1 dari 1 masuk · tenggat 17.00 WIB" (`33`). |
| 9 | Hitungan butir beda antarlayar | **SEBAGIAN** | Jumlah butir sudah sama di semua layar (N/A tidak dihitung: "0 dari 3 · 1 N/A tidak dihitung"). Hitungan **bukti kurang** masih berbeda: Ringkasan menghitung dari `evidenceCount` cache, Meja kerja dari baris nyata (lihat N5). Lencana Meja kerja juga menulis "Diserahkan" untuk laporan DISETUJUI, sementara Capaian menulis "Disetujui" (`31`/`32`, `53`/`51`). |
| 10 | Galat validasi Sheet entri di luar layar | **TERBUKTI BERES** (ada bug baru N7) | `05`: kotak galat menempel tepat di atas Batal/Simpan dan langsung terlihat. |

## Alur penuh R2 — LULUS

PIC (`pic.pt-001.1`):
- Masuk memakai email lengkap. Username pendek `pic.pt-001.1` ditolak 401, sama dengan server.
- Tambah entri dengan isian lengkap: Terkendala, progres 60%, kendala, rencana → POST /api/tasks 200. Sheet dibuka lagi sebagai "Entri tersimpan".
- Bukti foto → upload 200.
- Ubah entri → PUT 200.
- Tambah entri kedua lalu Hapus (dengan dialog konfirmasi) → DELETE 200.
- Kirim ulang laporan (dialog) → PUT daily-input 200, "Terkirim 14.49" (`13`).

Luring dan antrean:
- Airplane mode + `adb reverse --remove 3100`.
- Entri dan bukti disimpan sebagai "Menunggu kirim" (`14`–`18`).
- Keluar saat antrean berisi memunculkan dialog "2 perubahan belum terkirim…" (`17`); dipilih "Tetap masuk".
- Kembali daring: POST tasks dan upload terkirim otomatis. Server memuat "R2 entri luring" beserta 1 bukti, dan outbox kosong.

Lonceng, kotak masuk, keluar:
- Lonceng notifikasi → PATCH, lalu pindah ke Meja kerja (`22`/`23`).
- Kotak masuk terbuka (`24`).
- Keluar biasa: semua tabel Room kosong (proyek, tugas, outbox, cache_layar, daily_report, mingguan_*, penerimaan, eskalasi, peta_id_lokal) dan `files/bukti-antre` terhapus.

PIC2 (`pic.pt-001.2`):
- Dipaksa ke layar Ganti kata sandi.
- Galat "Kata sandi baru tidak cocok" muncul.
- Ganti sandi → POST /api/profile/password 200, lalu langsung masuk shell (`25`/`26`).

Ganti akun tanpa bocor:
- PIC2 luring menambah entri "R2 PIC2 antre bocor", lalu Keluar → konfirmasi "Keluar" (`27`). Outbox dan tugas lokal menjadi 0.
- Daring, masuk PIC1: tidak ada POST tasks/upload sama sekali.
- Entri tersebut tidak ada di server (proyek PIC2 diperiksa via API) dan tidak tampil di PIC1.

Kadiv:
- Ringkasan, Meja kerja (daftar periksa), Capaian, Divisi, dan Proyek tampil.
- Aksi Divisi dan alur bukti → Serahkan → Setujui berjalan (lihat tabel).

## Bug baru

| # | Judul | Severity |
|---|---|---|
| N1 | SyncWorker berhenti pada proyek pertama yang bukan milik pengguna (GET /api/tasks 403), sehingga sinkron latar tidak pernah tuntas | SEDANG |
| N2 | Unggah bukti sukses tetapi Sheet entri tetap "Belum ada bukti" bila muat ulang gagal, tanpa umpan balik | SEDANG |
| N3 | Tab Divisi dan Ringkasan Kadiv tidak pernah memuat ulang selama sesi (tidak ada tarik-untuk-muat-ulang, tidak ada muat saat tab dibuka lagi) | SEDANG |
| N4 | Ringkasan Direktur: galat 409 "Tarik untuk disunting" muncul di bawah lipatan dan hilang dalam 4 detik; tombol tetap tampil setelah jendela 15 menit lewat | RENDAH |
| N5 | "Bukti kurang" Ringkasan (cache `evidenceCount`) ≠ Meja kerja (baris nyata); lencana Meja kerja "Diserahkan" untuk laporan Disetujui | RENDAH |
| N6 | Tautan "Lampirkan bukti · {butir}" membuka Sheet butir di posisi atas, bukan di bagian Bukti (perlu ±6 gulir) | RENDAH |
| N7 | Galat validasi Sheet entri tidak hilang setelah medan diisi (basi sampai Simpan berikutnya) | RENDAH |
| N8 | FAB "Tambah butir" menutupi persentase progres kartu butir pertama di papan Capaian | RENDAH |

### N1 — SyncWorker gagal total karena 403 pada proyek orang lain (SEDANG)

Reproduksi:
1. Masuk PIC `pic.pt-001.1`. `/api/projects` mengembalikan 8 proyek: 4 proyek PT-001 dan 4 proyek PT-010 yang ber-`relatedEntities` PT-001.
2. Picu sinkron, misalnya airplane mati lalu hidup.
3. Logcat: `GET /api/daily-reports?projectId=<PT-010-PRJ-01>` 200, lalu `GET /api/tasks?projectId=<PT-010-PRJ-01>` **403** "Proyek ini di luar tanggung jawab Anda". Setelah itu tidak ada tarik lain.

Pola yang sama terlihat di PIC2 (proyek baru `cmv6dvfhd…`) dan Kadiv SDM (`cmv6dind5…`).

- Diharapkan: tarik tugas hanya untuk proyek yang dipegang pengguna, atau 403 diabaikan per proyek, dan `terakhirSinkron` tetap diperbarui.
- Nyata: `tarikSemua()` mengembalikan false pada 403 pertama. Akibatnya:
  - Proyek sisanya (urutan Room) tidak pernah ditarik.
  - `prefs.setTerakhirSinkron` tidak pernah dipanggil, sehingga banner "Luring · data tersimpan HH.mm" makin basi.
  - Setiap putaran membuang permintaan.

Dugaan berkas: `core/data/.../sync/SyncWorker.kt:158-166`, dengan `return false` pada `tugasRepo.tarik` di baris 163, dan `core/data/.../repo/ProyekRepo.kt:55` (`idProyekTersimpan` = semua proyek terlihat, bukan proyek milik PIC).

### N2 — Bukti terunggah tapi Sheet entri menulis "Belum ada bukti" (SEDANG)

Reproduksi (14.47):
1. Entri tersimpan → Lampirkan foto → `POST /api/evidence/upload` 200.
2. Muat ulang `GET /api/daily-input` → **422** "Hari ini bukan hari pelaporan sesuai aturan perusahaan." Ini terjadi karena agen lain sedang mengubah aturan pelaporan lewat `PUT /api/admin/report-settings`.

- Diharapkan: lampiran yang sudah sukses tampil di Sheet, atau ada galat yang terlihat.
- Nyata: Sheet tetap "Belum ada bukti. Laporan butuh minimal 1 bukti…" tanpa pesan apa pun (`09`). Bukti baru muncul setelah Sheet ditutup dan data dimuat ulang. Pengguna bisa mengunggah ulang dan menghasilkan bukti ganda.

Dugaan berkas: `app/.../ui/laporan/LaporanViewModel.kt:426-430`:
- Status sukses hanya `tampilkan("Bukti terlampir")`. Itu snackbar layar, yang tertutup jendela Sheet (masalah yang sama dicatat di E2E-1-PERBAIKAN #1 untuk TimScreen).
- Setelah itu `segarkan()`. Bila gagal dalam mode `diam`, `muatMeja` di baris 289-293 hanya memanggil `tampilkan(...)`, juga di balik Sheet. Daftar bukti Sheet bergantung sepenuhnya pada muat ulang itu.

### N3 — Divisi/Ringkasan Kadiv basi selama sesi (SEDANG)

Reproduksi:
1. Masuk Kadiv → tab Divisi.
2. Status baca berubah di server (POST unread via API), atau bukti mingguan dilampirkan dan laporan disetujui di tab Capaian.
3. Pindah tab lalu kembali ke Divisi/Ringkasan.

- Diharapkan: data segar saat tab dibuka lagi, atau ada tarik-untuk-muat-ulang.
- Nyata: tidak ada `GET /api/kadiv/team` sama sekali. Sheet anggota tetap "Sudah Anda baca 14.42". Ringkasan masih "2 item belum punya bukti / Bukti kurang 2" (`52`) sampai aplikasi dimatikan paksa (`54`: 0).
- Dampak: kepala divisi tidak melihat laporan anggota yang baru masuk.

Dugaan berkas:
- `app/.../ui/tim/TimViewModel.kt:235-245, 265`: `muat()` hanya di `init`; `ulang()` hanya dipanggil dari ErrorNote.
- `TimScreen.kt:93`: `onUlang` tidak tersambung ke pull-to-refresh atau ke `LaunchedEffect` saat tab tampil.
- VM Ringkasan Kadiv (`ui/ringkasan/…`) berpola sama.

### N4 — Galat "Tarik untuk disunting" tak terlihat (RENDAH)

Reproduksi: Kadiv Keuangan → Divisi → Buka ringkasan untuk Direktur. Ringkasan dikirim 14.42; pada 15.00 ketuk "Tarik untuk disunting".

- Diharapkan: tombol disembunyikan atau dinonaktifkan setelah `sentAt + 15 menit`. Kalaupun tetap diketuk, pesan 409 terlihat.
- Nyata: POST `/api/kadiv/weekly-summary` 409. Teks "Ringkasan belum dikirim oleh Anda atau jendela urungkan 15 menit sudah berakhir" ditaruh di dasar konten gulir, di bawah lipatan, dan dihapus otomatis setelah 4 detik. Layar tampak tidak bereaksi (`41`). Teks hanya terlihat bila langsung digulir (`42`).

Dugaan berkas:
- `app/.../ui/tim/RingkasanDirekturSheet.kt:224-238`: pesan di akhir konten dengan `delay(4_000)`. Belum memakai slot `MkSheet(galat=…)` dari perbaikan #10.
- `RingkasanDirekturSheet.kt:~124`: tombol tidak memeriksa jendela `sentAt`.

### N5 — Hitungan bukti dan lencana status tidak seragam (RENDAH)

`kadv.keuangan.pt-001`, laporan DISETUJUI dengan 4 butir yang butuh bukti, 0 baris Evidence, dan `evidenceCount` cache 1 pada butir SELESAI:

| Layar | "Bukti kurang" | Status |
|---|---|---|
| Ringkasan (`30`) | 3 | "Serahkan ke Admin PT paling lambat Kamis 17.00" |
| Meja kerja (`31`) | 4 | "Capaian M42 · Diserahkan" |
| Capaian (`32`) | — | "Disetujui" |

Untuk SDM setelah Setujui, Meja kerja juga menulis "Diserahkan" (`53`).

Dugaan berkas:
- `ui/ringkasan/DasborPelaksana.kt`: `tanpaBukti` dari `summary` server berbasis `evidenceCount`, sedangkan `MejaKadivLogika.jumlahBuktiNyata` memakai baris nyata.
- `MejaKadivLogika.kt:231` hanya membedakan Diserahkan/Belum diserahkan.

Kalimat "Serahkan … paling lambat" untuk laporan yang sudah disetujui sama dengan web (`role-dashboards.tsx:439`), jadi itu paritas, bukan bug klien.

### N6 — Tautan "Lampirkan bukti" tidak menggulir ke Bukti (RENDAH)

Reproduksi: Capaian → "Lampirkan bukti · Optimasi throughput…".

- Nyata: Sheet butir terbuka di bagian Aspek/Prioritas (`46`). Bagian Bukti baru tercapai setelah ±6 gesek.
- Diharapkan: Sheet langsung menggulir ke bagian Bukti, sesuai maksud tautan.

Dugaan berkas: `ui/mingguan/MingguanScreen.kt` (pembuka Sheet dari catatan "N butir belum berbukti").

### N7 — Galat validasi basi (RENDAH)

Reproduksi: Tambah entri → Terkendala → Simpan, sehingga 2 galat tampil. Lalu isi Kendala dan Rencana besok.

- Nyata: kedua galat tetap tampil di atas footer sampai Simpan ditekan lagi (`06`).
- Diharapkan: galat medan terkait hilang saat medan diisi.

Dugaan berkas: `ui/laporan/LaporanLembar.kt` / `LaporanViewModel` (galat `lembar.galat` hanya dikosongkan saat simpan).

### N8 — FAB menutupi isi kartu (RENDAH)

Reproduksi: Kadiv SDM → Capaian, status Draf.

- Nyata: FAB "Tambah butir" menutup persentase progres "90%" pada kartu butir pertama (`45`).
- Diharapkan: daftar diberi padding bawah setinggi FAB.

Dugaan berkas: `ui/mingguan/MingguanScreen.kt` (contentPadding papan).

## Catatan lingkungan / data

- **Gangguan agen lain:** pada 14.46–14.48 terjadi beruntun `PUT /api/admin/report-settings`, sehingga `GET /api/daily-input` PIC sempat 422 (pemicu N2). Setelah 14.48 kembali normal.
- **Data seed:**
  - `submittedAt` laporan harian beberapa PIC = 16.00 WIB hari ini (masa depan), sehingga tampil "Terkirim 16.00" pada 14.45.
  - Laporan mingguan Keuangan PT-001 di seed baru sudah DISETUJUI, jadi uji Serahkan/Setujui dipindah ke `kadv.sdm.pt-008`.
- **Data uji yang tertulis di DB uji:**
  - PIC1 (PT-001-PRJ-01): entri "R2 entri uji satu" (Terkendala 60%, +1 bukti) dan "R2 entri luring" (+1 bukti). "R2 entri hapus" sudah dihapus. Laporan harian dikirim ulang 14.49.
  - Sandi `pic.pt-001.2` diganti.
  - Keuangan: status baca laporan PIC Optimasi = dibaca 14.59; kehadiran kembali TERLAMBAT.
  - SDM PT-008: kehadiran kembali IZIN; 2 bukti WEEKLY_ITEM; laporan M42 kini **DISETUJUI**.
- **Keadaan akhir emulator-5554:** `user_rotation 0`, `accelerometer_rotation 0`, airplane mati, `adb reverse tcp:3100` terpasang, aplikasi keluar (layar masuk).
