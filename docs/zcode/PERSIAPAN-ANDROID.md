# Persiapan aplikasi native Android — Monitor Karya

Disusun Zcode, 8 Oktober 2026, atas permintaan pemilik. Dokumen ini memetakan **seluruh** yang harus disiapkan untuk menghadirkan Monitor Karya sebagai aplikasi Android di Play Store, jalur mana yang dipakai, apa yang sudah siap di repo, dan apa yang menunggu pemilik/operator. Tidak ada kode Android yang ditulis pada tahap ini.

## 1. Keputusan jalur (baca dulu)

| Jalur | Bentuk | Usaha | Kapan cocok |
|---|---|---|---|
| **A. TWA (Trusted Web Activity) — disarankan** | Aplikasi Play Store asli (APK/AAB) yang memuat situs produksi Anda layar penuh tanpa bilah peramban; ikon launcher, splash screen, tombol kembali, pembaruan mengikuti web (tanpa review ulang) | Kecil (hari) | Aplikasi Anda = web app bisnis internal; ingin cepat hadir di Play Store |
| B. Shell WebView kustom (Kotlin) | Seperti TWA tapi kendali penuh (mis. jembatan notifikasi FCM, unggah berkas dari kamera via intent) | Sedang (1–2 pekan) | Bila butuh jembatan native yang TWA tidak punya |
| C. React Native / Flutter (tulis ulang UI) | UI native sungguhan, satu basis kode baru | Sangat besar (bulan) | Produk berubah arah ke konsumen; tidak disarankan sekarang |

Fakta yang menentukan: Monitor Karya sudah **mobile-first** (tab bar <600 px, target sentuh 44 px, tema gelap, sheet layar-didorong) dan seluruh logika ada di server (74 endpoint). TWA memperoleh 100% fungsi tanpa menulis ulang apa pun. Dokumen ini menyiapkan jalur A sampai siap bangun, dan menandai titik cabang ke B bila kelak perlu notifikasi push.

## 2. Prasyarat yang tidak bisa dilewati

1. **Deploy produksi HTTPS dengan domain tetap** — TWA wajib: aplikasi = `https://<domain-anda>`. Status saat ini: rencana deploy VPS Biznet sudah lengkap ([DEPLOY-RENCANA-VPS-BIZNET](DEPLOY-RENCANA-VPS-BIZNET.md)), menunggu eksekusi operator. **Tanpa domain hidup, TWA tidak bisa dibuat.**
2. **Akun Google Play Console** (biaya sekali $25, per akun developer Google). Daftar sebagai organisasi bila ingin nama perusahaan (butuh D-U-N-S bila belum punya — prosesnya bisa berhari).
3. **Kunci penandatangan aplikasi (keystore)** — satu berkas `.keystore`/`.jks` + kata sandi, dibuat sekali:
   ```bash
   keytool -genkeypair -v -keystore monitorkarya-upload.jks -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Simpan di tempat aman (pengelola kata sandi + cadangan offline). **Kehilangan kunci = kehilangan kemampuan memperbarui aplikasi.** Play Console juga menawarkan "Play App Signing" (Google menyimpan kunci rilis; kunci Anda jadi kunci unggah) — pakai itu.
4. **Identitas paket**: `applicationId` tetap selamanya, mis. `id.co.monitorkarya.app` (sesuaikan domain perusahaan Anda; jangan pakai `com.example`).

## 3. Yang SUDAH disiapkan di repo (commit ini)

| Artefak | Berkas | Fungsi |
|---|---|---|
| Manifest PWA | `public/manifest.webmanifest` | Nama, ikon, `display: standalone`, warna tema/latar (token `--bg` terang), pintasan "Laporan harian"/"Log aktivitas" — dasar installable & TWA |
| Ikon 192/512 + maskable 192/512 | `public/icon-*.png` | Dihasilkan dari `logo.svg` (sharp); maskable = logo pada zona aman di atas latar `--merah` |
| Ikon layar utama iOS | `public/apple-touch-icon.png` | Bonus untuk pengguna iPhone ("Tambahkan ke Layar Utama") |
| Tautan metadata | `src/app/layout.tsx` | `manifest`, `icons`, `appleWebApp` (Next otomatis menghasilkan `<link>`-nya) |
| Templat verifikasi domain | `public/.well-known/assetlinks.json.example` | Nanti disalin jadi `assetlinks.json` berisi sidik SHA-256 kunci Anda — syarat TWA agar Chrome membuka layar penuh tanpa bilah URL |

Catatan desain: `theme_color` manifest memakai token terang; `themeColor` viewport di layout sudah punya varian terang/gelap untuk bilah status peramban.

## 4. Urutan pekerjaan setelah domain hidup (jalur A, rinci)

### Tahap A-1: finalisasi PWA (½ hari)
1. Buka `https://<domain>` di Chrome Android → pastikan "Instal aplikasi" muncul (manifest+ikon sudah dari repo).
2. Uji alur kritis di dalam mode terpasang: login (cookie `__Host-` bekerja normal di TWA), buka Sheet, unggah bukti (pemilih berkas Chrome), tema gelap, tombol kembali fisik.
3. Opsional tapi disarankan: halaman luring sederhana (service worker cache shell + halaman "Anda sedang luring") — aplikasi ini butuh jaringan ke DB; tanpa ini pengguna luring melihat galat peramban. Bisa dikerjakan Zcode setelahnya sebagai tugas terpisah.

### Tahap A-2: bangun APK/AAB TWA (½ hari, tanpa Android Studio)
1. Siapkan Node + `npm i -g @bubblewrap/cli` (atau pakai [PWABuilder](https://www.pwabuilder.com) berbasis web: masukkan URL, unduh paket Android).
2. `bubblewrap init --manifest https://<domain>/manifest.webmanifest` — ia mengambil nama/ikon otomatis dari manifest repo.
3. Isi saat ditanya: package name (§2.4), versi awal `1.0.0` (versionCode 1), splash background `#f5f5f7`, theme color sama.
4. `bubblewrap build` → menghasilkan `app-release-signed.aab` (tandatangan dengan keystore §2.3) + `assetlinks.json` berisi sidik jari kunci Anda.
5. Salin isi `assetlinks.json` ke `public/.well-known/assetlinks.json` (timpa templat), commit, deploy ulang (pull di VPS + `deploy.sh`). **Tanpa langkah ini aplikasi tetap jalan tapi menampilkan bilah URL Chrome.**

### Tahap A-3: daftar ke Play Console (1 hari kerja + waktu tinjauan Google 1–7 hari)
1. Buat aplikasi: nama "Monitor Karya", jenis "Aplikasi", gratis, kategori **Bisnis**.
2. **Kebijakan wajib** (penyebab penolakan tersering — siapkan sejak awal):
   - **URL kebijakan privasi** (Play mewajibkan untuk semua aplikasi): siapkan satu halaman di situs Anda (bisa halaman statis di repo, mis. `/kebijakan-privasi`) yang menyatakan: data akun kerja & laporan proyek disimpan di server perusahaan sendiri, tidak dibagikan ke pihak ketiga, tanpa iklan, tanap pelacakan analitik pihak ketiga. Zcode bisa menulis drafnya dari fakta kode (tidak ada analytics/ads di repo).
   - **Data safety** di konsol: cocokkan — "dikumpulkan: akun/pengenal, aktivitas aplikasi (log audit)"; "dienkripsi saat transfer: ya (HTTPS)"; "dapat dihapus: ya (admin)".
   - **Akses konten**: aplikasi membutuhkan akun (login) — sediakan akun uji + catatan untuk tim tinjauan bila ditolak karena butuh login (nyatakan ini aplikasi internal bisnis).
3. Aset toko: ikon 512×512 (sudah ada `icon-512.png`), **feature graphic 1024×500** (buat dari template brand — belum ada, tugas desain kecil), 2–8 tangkapan layar ponsel (ambil dari pratinjau per peran), deskripsi singkat ≤80 karakter dan panjang ≤4000 (bahasa Indonesia — bisa Zcode draf).
4. Unggah AAB ke jalur **Internal testing** dulu → uji di perangkat nyata via tautan opt-in → naik ke **Production**.

### Tahap A-4: distribusi internal (alternatif toko, bila hanya untuk karyawan)
Bila aplikasi hanya untuk staf: cukup **jalur internal Play** (daftar email karyawan) atau distribusi AAB via `bundletool`/MDM — tanpa tinjauan publik. Pertimbangkan ini bila data perusahaan tidak boleh terekspos daftar publik.

## 5. Titik cabang ke jalur B (WebView kustom) — kapan & apa yang berubah

Pilih B hanya bilabutuh: **notifikasi push FCM** (pengingat laporan 17.00 di layar kunci — fitur belum ada di web juga; butuh kerja server: integrasi FCM + penyimpanan token per pengguna), berbagi berkas dari aplikasi lain ke Monitor Karya, atau kontrol splash/offline yang lebih dalam. Biaya: proyek Android Studio kecil (shell + `WebViewClient` + `onShowFileChooser` + bridge FCM), aset §2 tetap dipakai, assetlinks tetap perlu.

## 6. Risiko & catatan khusus kode Monitor Karya

- **Sesi 8 jam & cookie `__Host-`**: aman di TWA (memakai Chrome profil terpisah per aplikasi — sesi terpisah dari peramban utama, logout aplikasi tidak memengaruhi peramban). Pengguna akan login ulang tiap 8 jam sesuai desain; bila mengganggu, opsi "ingat saya" adalah keputusan produk terpisah (keamanan vs kenyamanan).
- **CSP `frame-ancestors`/`connect-src`**: TWA bukan iframe — tidak ada perubahan CSP yang diperlukan.
- **Tenggat 17.00 WIB & timezone**: TWA memakai zona perangkat; server tetap WIB — tidak ada perubahan.
- **Pembaruan web vs toko**: perubahan fitur langsung aktif tanpa review Play (keunggulan TWA); hanya pembaruan ikon/nama/versi shell yang perlu rilis toko baru.
- **Unggah bukti besar (≤20 MB)**: uji di jaringan seluler nyata sebelum rilis internal.

## 7. Ringkasan checklist pemilik

- [ ] Deploy VPS Biznet dijalankan + domain hidup (prasyarat mutlak).
- [ ] Beli akun Play Console ($25) — tentukan personal vs organisasi.
- [ ] Buat & simpan keystore upload (`keytool`, §2.3) + aktifkan Play App Signing.
- [ ] Tetapkan `applicationId` (usulan: `id.co.monitorkarya.app`).
- [ ] Feature graphic 1024×500 + tangkapan layar toko (bisa dibantu Zcode).
- [ ] Halaman kebijakan privasi (Zcode bisa menulis draf).
- [ ] Jalankan A-1..A-4 (atau minta Zcode memandu/mengeksekusi yang bisa dijangkau).

Yang bisa Zcode kerjakan berikutnya atas permintaan: halaman luring + service worker minimal, draf kebijakan privasi, draf deskripsi toko, halaman `/kebijakan-privasi`, dan pembuatan `assetlinks.json` final begitu sidik jari kunci tersedia.
