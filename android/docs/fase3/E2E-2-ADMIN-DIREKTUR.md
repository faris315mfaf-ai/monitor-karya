# E2E-2 — Admin PT, Direktur entitas, Direktur SDM/GA (emulator)

Tanggal uji: 13 Okt 2026, 13.25–13.55 WIB. Penguji: agen E2E-2 (baca-saja terhadap kode).

## Lingkungan

| Hal | Nilai |
|---|---|
| Perangkat | `emulator-5556`, 1080x2400, potret + lanskap (`user_rotation`) |
| Aplikasi | `id.co.monitorkarya.app.dev` → server dev `127.0.0.1:3100` (adb reverse) |
| DB | Docker `mk-e2e-postgres-1` (54329, seed) — hanya dibaca lewat `psql`, kecuali aksi aplikasi di bawah |
| Akun | `admin.pt-001` (Admin PT, PT Energi Migas Sumut), `direktur.sh-energi` (Direktur entitas, lingkup SUB_HOLDING Karya Energi Nusantara), `sdmga` (Direksi holding SDM & GA). Kata sandi dari `.env.e2e.lokal` (tidak ditulis di sini) |
| Bukti | `/private/tmp/claude-501/e2e-2/*.png` (73 tangkapan; sandi serah terima di a30/a34 sudah dikaburkan) |
| Crash | `logcat` disaring `FATAL EXCEPTION` / `E AndroidRuntime`: **0 crash** sepanjang sesi |

### Jejak data yang ditinggalkan uji (DB uji, bukan produksi)

- Proyek usulan `E2E2 Usulan Admin Satu` (PT-001-PRJ-05, DIUSULKAN, macet — lihat BUG-01).
- Akun `e2e2.akunuji` (PIC_PROYEK, PT-001) dibuat lewat API karena aplikasi tidak punya wizard (BUG-03); sandinya sudah disetel ulang lewat aplikasi, status aktif.
- 6 laporan PT-001 diteruskan ke Direksi (beku), 1 permintaan anggaran (Optimasi Jaringan Distribusi, Rp 25 jt) disetujui, eskalasi "Persetujuan perubahan scope …" (PT-006) ditutup, eskalasi logistik PT-002 berstatus DITINJAU, 3 laporan mingguan divisi ditandai dibaca, 1 pengingat ke Bpk. Yudi.

---

## Daftar bug

Severity: KRITIS (alur inti mustahil/kebocoran data), TINGGI (fitur wajib hilang/aksi utama gagal), SEDANG (salah tampil/alur tersendat, ada jalan lain), RENDAH (kosmetik/teks).

### BUG-01 — Direktur entitas tidak bisa menyetujui usulan proyek PT mana pun (server) — TINGGI

- **Langkah**: (1) Admin PT `admin.pt-001` → Lainnya → Proyek → Ajukan proyek → isi nama + penjelasan ≥20 huruf → Ajukan. Rantai: "Perlu persetujuan berurutan: Direktur entitas". (2) Keluar, masuk `direktur.sh-energi` → Proyek → Diusulkan → buka "E2E2 Usulan Admin Satu".
- **Diharapkan**: Sheet menampilkan Setujui/Tolak karena slot "Direktur entitas — Giliran sekarang".
- **Nyata**: Tidak ada tombol aksi. API `GET /api/projects?lifecycle=DIUSULKAN` mengembalikan `permissions.approve=false`; `POST /api/projects/approve` langsung → 403 "Sekarang giliran Direktur entitas di PT pemilik proyek. Anda tidak bisa menandatangani slot ini." Usulan macet selamanya (tidak ada peran lain di rantai).
- **Bukti**: `d15-usulan-direktur.png`, `a15-ajukan-hasil.png`, log server baris `POST /api/projects/approve 403`.
- **Dugaan**: `src/lib/rbac.ts:244` — `PROJECT_ENTITY_SLOTS` memuat `DIREKTUR_ENTITAS`, lalu `canSignSlot` menuntut `user.scopeEntityId === entityId`. Direktur entitas berlingkup SUB_HOLDING (scope bukan PT), jadi tidak pernah sama. Seharusnya untuk slot DIREKTUR_ENTITAS dicek `scopeEntityIds(user).includes(entityId)` (seperti `canDecideApprovalIn` di `src/lib/oversight.ts:81`). Aplikasi Android benar menyembunyikan tombol (mengikuti `permissions.approve`). Bila direktur produksi juga berlingkup sub-holding, severity naik ke KRITIS.

### BUG-02 — Statistik Admin PT tanpa panel "Aturan pelaporan" dan tanpa peta panas — TINGGI

- **Langkah**: Admin PT → tab Statistik → gulir sampai habis.
- **Diharapkan** (keputusan pemilik 10 Okt; web `src/components/views/statistik-view.tsx`): kartu kepatuhan + `ComplianceHeatmapCard` (10 hari) + `ReportSettingsCard` (jam batas, 24/7, hari kerja, buka/tutup harian/mingguan).
- **Nyata**: Hanya judul "Statistik" + modul Kepatuhan (Harian/Mingguan per divisi). Tidak ada peta panas, tidak ada panel aturan pelaporan; tidak ada satu pun pemanggil `/api/.../report-settings` di `android/` (grep). Efek ubah jam batas/24/7/hari kerja tidak bisa diuji dari Android.
- **Bukti**: `a06-statistik.png`, `a07-stat-expand.png`, `a08-stat-mingguan.png`.
- **Dugaan**: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/admin/StatistikAdminScreen.kt:28-43` hanya membungkus `KepatuhanScreen`; field `heat` di `core/network/.../DtosFase2Kadiv.kt:463` tidak dipakai.

### BUG-03 — Meja akun Admin PT tanpa "Tambah akun" (wizard) — TINGGI

- **Langkah**: Admin PT → ikon Pengaturan (top bar) → Meja akun → cari tombol tambah (gulir daftar, cek seluruh layar).
- **Diharapkan**: Wizard tambah akun → sandi serah terima tampil sekali (teks pengantar layar sendiri berbunyi "Buat akun untuk perusahaan Anda lengkap dengan username, kata sandi…"). Web: companies-view, kapabilitas `accounts:manage`.
- **Nyata**: Tidak ada tombol/FAB/menu tambah akun; juga tidak ada ubah data akun dan hapus akun. Hanya nonaktif/aktifkan + setel ulang sandi. (Akun uji dibuat lewat `POST /api/companies/users` agar alur lain bisa diuji.)
- **Bukti**: `a27-pengaturan.png`.
- **Dugaan**: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/akun/AkunScreen.kt` (tak ada string "Tambah akun"/wizard di seluruh `app/` dan `feature/`).

### BUG-04 — Snackbar "Urungkan" untuk "Tandai sudah dibaca" (Ringkasan Direktur) tidak pernah tampil — TINGGI

- **Langkah**: `direktur.sh-energi` → Ringkasan → gulir ke daftar laporan mingguan → "Baca laporan" → "Tandai sudah dibaca" → tutup sheet segera (0,3 dtk) → amati bagian bawah.
- **Diharapkan**: Snackbar "Laporan Divisi … ditandai sudah dibaca." + "Urungkan" (durasi Long).
- **Nyata**: Status berubah jadi "Sudah dibaca" (POST `/api/ringkasan/laporan-dibaca` 200) tetapi snackbar tidak pernah muncul dalam 3 percobaan (dicek tiap 0,3 dtk). Tanda baca tidak bisa diurungkan.
- **Bukti**: `d04-tandai-dibaca.png`, `d05-snackbar-dibalik-sheet.png`, `d06-setelah-tandai.png`.
- **Dugaan**: `android/feature/ringkasangrup/src/main/kotlin/id/co/monitorkarya/feature/ringkasangrup/RingkasanDirekturTab.kt:180-188` — `LaunchedEffect(ui.pesan?.id)` memanggil `aksi.pesanTampil()` (mengosongkan `pesan`) **sebelum** `showSnackbar`; kunci efek berubah ke `null` pada rekomposisi berikutnya sehingga coroutine (dan snackbar-nya) dibatalkan. Pola benar ada di `feature/eskalasi/.../EskalasiTab.kt:147-155` (bersihkan setelah snackbar selesai). Berdampak juga pada semua pesan galat Ringkasan Direktur.

### BUG-05 — Sheet di lanskap (≥840dp) hanya menampilkan judul; isi/aksi tidak terlihat — SEDANG

- **Langkah**: Admin PT → Meja kerja → ketuk laporan divisi (atau Pengaturan → akun → setel ulang sandi) → putar ke lanskap.
- **Diharapkan**: Panel samping 440dp dengan isi bisa digulir.
- **Nyata**: Panel selebar layar, tinggi pendek, hanya judul + tombol tutup; isi (status, butir, sandi serah terima, tombol aksi) terpotong dan tidak bisa digulir. Kembali ke potret: isi muncul lagi dan sandi serah terima tetap sama (lulus untuk stabilitas).
- **Bukti**: `a05-rotasi-sheet.png`, `a31-sandi-rotasi.png`, `a32-sandi-rotasi-geser.png`.
- **Dugaan**: `android/designsystem/src/main/kotlin/id/co/monitorkarya/designsystem/components/MkSheet.kt:139-144` — `fillMaxWidth()` sebelum `widthIn(max=440.dp)` membuat lebar tetap penuh; `heightIn(max = maxHeight*0.92f)` memakai `maxHeight` `BoxWithConstraints` milik layar pemanggil (area konten kecil), bukan tinggi jendela, sehingga kolom isi `weight(1f, fill=false)` (`:270-273`) mendapat tinggi ≈0.

### BUG-06 — Bilah judul sistem ganda ("Monitor Karya" hitam) di atas top bar aplikasi; sesekali top bar menimpa status bar — SEDANG

- **Langkah**: Mulai aplikasi lalu masuk akun mana pun.
- **Diharapkan**: Hanya top bar Compose "Monitor Karya · <peran>" di bawah status bar.
- **Nyata**: Ada ActionBar platform hitam "Monitor Karya" (±120dp terbuang di semua layar). Pada login pertama sesi ini, top bar Compose bahkan digambar di bawah status bar (ikon jam/sinyal menimpa judul dan ikon) dan judul halaman terpotong oleh ActionBar; setelah rotasi/restart posisinya benar.
- **Bukti**: `a01-ringkasan.png` (menimpa), `a06-statistik.png` (ganda).
- **Dugaan**: `android/app/src/main/AndroidManifest.xml:16-30` — `<application>`/`<activity>` tanpa `android:theme`, jadi memakai tema bawaan dengan ActionBar; dipadukan `enableEdgeToEdge()` di `MainActivity.kt:27`. Perlu tema `NoActionBar` (mis. `Theme.Material3.DayNight.NoActionBar` / `android:Theme.Material.Light.NoActionBar`).

### BUG-07 — Label tab bawah yang aktif tidak terbaca (hampir putih di atas latar lavender) — SEDANG

- **Langkah**: Peran apa pun → pilih tab di bilah bawah.
- **Diharapkan**: Label tab aktif berwarna tinta/aksen, kontras ≥4.5:1.
- **Nyata**: Ikon aktif merah terlihat, tetapi teks label aktif ("Statistik", "Ringkasan", "Lainnya") nyaris tak terlihat. Latar bilah juga lavender bawaan M3 (bukan token).
- **Bukti**: `a06z-tab-terpilih.png` (perbesaran), `a01-ringkasan.png`.
- **Dugaan**: `android/designsystem/.../theme/MKTheme.kt:94,126` memetakan `secondary = c.fill1` (abu sangat terang) — label aktif `NavigationBarItem` memakai warna turunan skema itu; `navigation/MKShell.kt:196-210` tidak memberi `NavigationBarItemDefaults.colors(...)` maupun `containerColor` bertoken (`surfaceContainer` tidak dipetakan).

### BUG-08 — Drill-down "Laporan per perusahaan" (Ringkasan SDM/GA) kehilangan nama proyek dan status — SEDANG

- **Langkah**: `sdmga` → Ringkasan → "Laporan per perusahaan" → ketuk PT Energi Migas Sumut.
- **Diharapkan**: Tiap baris: nama proyek, divisi, progres, PIC, lencana status.
- **Nyata**: Kolom nama kosong (lebar 0), lencana status tidak tampak, avatar berinisial "LH" (dari teks "Lapor hari ini"), teks PIC terpotong.
- **Bukti**: `s02-pt-laporan.png`.
- **Dugaan**: `android/feature/ringkasangrup/.../SheetDrillDown.kt:103-108` mengirim `pic = "Lapor hari ini · " + nama` ke `designsystem/.../ProjectRow.kt:68-104`; baris ini dirancang untuk layar lebar — `Row` PIC + `StatusBadge` tanpa batas lebar menghabiskan ruang sehingga `Column(Modifier.weight(1f))` nama tergencet ke 0, dan `inisialDari(pic)` dihitung dari teks status.

### BUG-09 — Saringan divisi Ringkasan Direktur berisi puluhan chip berlabel sama — SEDANG

- **Langkah**: `direktur.sh-energi` → Ringkasan → geser baris chip divisi.
- **Diharapkan**: Chip dapat dibedakan (nama + PT), atau dikelompokkan per jenis divisi.
- **Nyata**: 28 chip "K3 & Lingkungan / Keuangan / Produksi / Teknik …" berulang tanpa PT; memilih "Keuangan" hanya memfilter satu divisi acak ("Divisi Keuangan · Ibu Vera"). Ringkasan teks juga "Laporan Produksi, Teknik, Produksi, Produksi belum masuk.".
- **Bukti**: `d08-saring-divisi.png`, `d09-chip-ganda.png`, `d01-ringkasan.png`.
- **Dugaan**: `android/feature/ringkasangrup/.../RingkasanDirekturTab.kt:268-271` memakai `dv.name` saja; perlu `entityName/entityCode` dari DTO `divisions[]`.

### BUG-10 — "Tanggal laporan" di sheet Meja kerja menampilkan ISO mentah UTC — SEDANG

- **Langkah**: Admin PT → Meja kerja → Laporan proyek → ketuk "Optimasi Jaringan Distribusi".
- **Diharapkan**: "Selasa, 13 Oktober 2026" (tanggal WIB).
- **Nyata**: `2026-10-12T17:00:00.000Z` (jika hanya dipotong 10 huruf akan salah hari, 12 Okt).
- **Bukti**: `a03-sheet-laporan.png`.
- **Dugaan**: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/admin/MejaKerjaAdminViewModel.kt:266` (`tanggal = laporan.reportDate`) → ditampilkan apa adanya di `MejaKerjaAdminScreen.kt:305`; pakai `tanggalPanjang()` (sudah diimpor, `:23`) dengan zona WIB.

### BUG-11 — Jam batas "17.00 WIB" / "Kamis 17.00 WIB" ditulis keras di Kepatuhan — SEDANG

- **Langkah**: Admin PT → Statistik → Mingguan; atau kondisi terkunci harian.
- **Diharapkan**: Teks tenggat mengikuti ReportSettings (CLAUDE.md: "jangan hardcode 17:00"; produksi 24/7).
- **Nyata**: "Tenggat serah terima Kamis 17.00 WIB." dan banner "Sudah lewat tenggat 17.00 WIB…" konstan. Di DB uji kebetulan cocok (ReportSettings kosong = bawaan 17:00), tetapi akan salah di produksi 24/7.
- **Bukti**: `a08-stat-mingguan.png`.
- **Dugaan**: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/kepatuhan/KepatuhanScreen.kt:295,430,652`; respons `/api/admin/compliance` sudah membawa `week.handoverBy`/`lockAt` yang bisa diformat.

### BUG-12 — Meja akun tidak memuat ulang saat dibuka lagi; daftar tergencet — RENDAH

- **Langkah**: Admin PT → Pengaturan (daftar 9 akun) → tutup → buat akun baru (web/API) → buka Pengaturan lagi → cari.
- **Diharapkan**: Daftar diperbarui (10 akun), ada tarik-untuk-muat-ulang.
- **Nyata**: Tetap 9 akun, tidak ada `GET /api/companies` baru, tidak ada pull-to-refresh; baru muncul setelah aplikasi di-force-stop. Selain itu daftar akun hanya menempati ±40% bawah layar (gulir bersarang), kepala teks tetap diam.
- **Bukti**: log server (hanya satu `GET /api/companies` dari aplikasi sebelum restart), `a27-pengaturan.png`.
- **Dugaan**: `ui/pengaturan/PengaturanScreen.kt:69` memanggil `AkunScreen()` dengan `hiltViewModel()` yang terikat ke entri NavHost tab di bawah lapisan (tidak dibuang saat lapisan ditutup); `ui/akun/AkunViewModel.kt:292` hanya memuat di `init`.

### BUG-13 — Pesan Urungkan penerusan menyebut hanya "capaian mingguan" — RENDAH

- **Langkah**: Admin PT → Ringkasan → "Teruskan laporan ke Direksi (6)" → konfirmasi → "Urungkan".
- **Nyata**: 6 tiket diurungkan (6x `POST /api/undo` 200; angka kembali 0 dan tombol (6) kembali — lulus), tetapi snackbar "Penerusan capaian mingguan diurungkan." padahal termasuk laporan harian.
- **Bukti**: `a38-teruskan-hasil.png`, log `POST /api/undo` x6.
- **Dugaan**: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/admin/DashboardAdminViewModel.kt:182` menimpa `pesanSukses` dengan pesan server tiket terakhir; pakai ringkasan "N penerusan diurungkan.".

### BUG-14 — Teks/label kecil — RENDAH

| # | Lokasi | Nyata | Dugaan |
|---|---|---|---|
| a | Meja kerja, baris laporan proyek | "PIC PIC Pembangunan Pembangkit Baru" (nama seed sudah berawalan "PIC") | `MejaKerjaAdminViewModel.kt:434` menambah awalan "PIC " tanpa cek |
| b | Ringkasan Direktur, daftar laporan mingguan | "Ibu Mira · - — 1 dari 3 …" dan sheet "Dikirim - ·" saat `submittedAt` null | pemformat waktu mengembalikan "-"; sembunyikan segmen bila null (`feature/ringkasangrup`) |
| c | Sheet "Baca laporan" Direktur | StatTile "Output" terpotong "0 dari" (penyebut hilang) | `d05-snackbar-dibalik-sheet.png`; nilai terlalu panjang untuk 3 kolom |
| d | Proyek, usulan bernama "E2E2 …" | avatar "-" | inisial hanya dari huruf |
| e | Statistik Mingguan | "Belum masuk · disetujui" (data seed: approvedAt tanpa submittedAt) | `KepatuhanViewModel.kt:384-390` — juga data seed tidak konsisten |
| f | Ringkasan Direktur | label "Belum" vs "Belum masuk" untuk keadaan sama | lencana dipotong lebar |
| g | Log aktivitas → Unduh CSV | berkas tersimpan (18,7 KB, header benar) tetapi tidak ada konfirmasi "CSV tersimpan" | `feature/audit` |

---

## Temuan data/server (bukan bug Android, untuk diketahui)

- Galeri bukti Meja kerja kosong padahal baris "2 bukti": `evidenceCount` laporan harian = bukti laporan + bukti TASK, sedangkan galeri (web dan Android sama) hanya memuat `targetType=DAILY_REPORT`. Seed hanya punya Evidence `OUTPUT`. Paritas web — perlu keputusan apakah galeri ikut menampilkan bukti entri.
- Arsip laporan mingguan divisi: M42 2026 berperiode "7 Okt–13 Okt" (seed `periodStart/End`), padahal ISO M42 = 12–18 Okt (layar Isi capaian benar).
- SDM/GA: "39 persetujuan menunggu Anda" tetapi peran ini tidak punya tab Persetujuan (paritas web `management-dashboard.tsx:93`).
- Proyek Direktur 32 vs Ringkasan 28: daftar proyek ikut memuat proyek PT lain yang menandai PT lingkup sebagai "terkait" (disengaja di `src/app/api/projects/route.ts:198`).

---

## Alur yang LULUS

**Admin PT**
- Masuk/keluar; header "Admin PT"; tab sesuai ROLE_TABS (Ringkasan, Meja kerja, Statistik, Laporan harian, Lainnya → Proyek, Divisi, Eskalasi; Kotak masuk/Notifikasi/Pengaturan di top bar).
- Ringkasan: 2 angka + "Teruskan laporan ke Direksi (6)" → dialog konfirmasi → 6x POST `/api/inbox` 200 → "6 sudah diteruskan" + Urungkan → 6x `/api/undo` 200, angka kembali → teruskan ulang berhasil.
- Meja kerja: akordeon Laporan proyek (4) / Laporan divisi (4), sheet rincian proyek & divisi; sheet bertahan saat rotasi.
- Statistik: Harian/Mingguan, bentang per divisi (Ingatkan tidak teruji — tidak ada yang belum lapor di PT-001).
- Laporan harian: daftar proyek + entri + bukti tampil.
- Proyek: Ajukan proyek (validasi 5/20 huruf, tombol nonaktif sampai valid), muncul di Diusulkan "Menunggu Direktur entitas"; Hapus proyek ber-laporan → server 409 → aplikasi menawarkan "Arsipkan proyek" (dibatalkan); Ubah proyek terbuka dengan data awal; tahapan proyek tampil.
- Divisi: Isi capaian (pilih divisi, saringan Belum/Berjalan/Selesai, kartu terkunci saat menunggu persetujuan/disetujui), Arsip laporan + saringan.
- Eskalasi: daftar + sheet rincian, "Tidak ada tindakan untuk Anda" (benar: Admin PT tanpa `escalation:followup`).
- Meja akun: cari, chip peran, sheet akun; Setel ulang sandi → dialog konfirmasi → sandi tampil sekali, **stabil setelah rotasi** potret→lanskap→potret, tidak tampil lagi setelah sheet dibuka ulang; Nonaktifkan (dengan konfirmasi) → Aktifkan kembali. Tautan aktivasi disembunyikan dengan benar (server 409 "tidak menunggu aktivasi").
- Notifikasi & Kotak masuk: terbuka, keadaan kosong benar.

**Direktur entitas**
- Ringkasan: hero + cincin, saringan divisi berfungsi (lihat BUG-09), Baca laporan → Tandai sudah dibaca (server 200, status berubah), Ingatkan → "Pengingat terkirim" (POST `/api/notifications/remind` 200).
- Persetujuan: Tolak dengan alasan (tombol nonaktif sampai ≥5 huruf) → snackbar + Urungkan baris berfungsi (PATCH 200, kembali ke antrean); Setujui langsung; Riwayat menampilkan catatan alasan.
- Proyek, Divisi (arsip + rincian laporan mingguan), Entitas (pohon, Buka semua, sheet PT dengan jalur entitas & skor).
- Eskalasi: Tandai ditinjau → Urungkan (POST `/api/undo` 200, "Tanda ditinjau diurungkan."); Tutup eskalasi (status DITUTUP). Catatan: Urungkan setelah Tutup tidak sempat terkonfirmasi (ketukan jatuh setelah snackbar habis), tidak dihitung bug.

**Direktur SDM/GA**
- Ringkasan grup + drill-down perusahaan (lihat BUG-08), Proyek (40), Divisi (150 laporan), Eskalasi (12), Entitas (10 PT).
- Log aktivitas: daftar, rincian (pelaku, target, JSON sesudah, IP, perangkat), Saring (Eskalasi) → 10 hasil, Unduh CSV via SAF → `/sdcard/Download/log-aktivitas-2026-10-13.csv` header + baris benar.

**Lintas peran**
- Tidak ada tab yang menampilkan galat 403 untuk peran yang berhak (403 di log hanya dari emulator lain dan dari uji API langsung BUG-01).
- Tidak ada tombol aksi yang ditolak server dari UI (UI mengikuti `permissions`).
- Keluar → masuk akun lain (Admin → Direktur → SDM/GA → Admin): header, tab, dan data berganti bersih; tidak ada data peran sebelumnya.
- 0 crash.
