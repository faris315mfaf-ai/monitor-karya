# 02 · Warna

Putih adalah kanvas, merah adalah sinyal, warna status adalah makna. Nilai di bawah dibuat otomatis dari `design-system/tokens.json`; bila berbeda, `tokens.json` yang benar.

## Peran merah-putih

- **Putih adalah kanvas.** `surface` (putih) di atas `bg` (abu sangat muda) membentuk hampir seluruh layar. Ruang kosong adalah bagian dari desain.
- **Merah adalah sinyal.** `accent` / `accent-fill` muncul hanya di: tombol primer, item navigasi aktif, batang grafik terpilih, cincin progres utama, lencana angka, logo. Paling banyak ±10% area layar.
- **Jangan** pakai merah untuk latar besar, teks paragraf, garis tepi kartu, atau dekorasi.
- **Tanda logo** (`LogoMark`): kotak membulat (sudut 28% ukuran), separuh atas gradien aksen + kilau, separuh bawah `putih` tetap. Separuh putih tidak berubah di mode malam dan tidak ikut aksen grafit.
- `merah-tua` hanya untuk keadaan ditekan dan blok sampul.

## Netral

| Token | Terang | Malam | Pemakaian |
| --- | --- | --- | --- |
| `bg` | `#f5f5f7` | `#050506` | Latar halaman di belakang kartu. Abu sangat muda di terang; di mode malam hitam tinta #050506 yang diberi aurora berwarna aksen. |
| `surface` | `#ffffff` | `#131316` | Kartu, panel, sheet, sidebar. Di mode malam kartu sedikit lebih terang dari latar dan diberi garis rambut + sorot tepi atas (lihat shadow-card). |
| `surface-2` | `#fafafc` | `#19191d` | Permukaan bertingkat di dalam kartu: header tabel, area tenang di sheet. |
| `fill-1` | `#f2f2f5` | `#212126` | Isian lembut untuk kontrol: tombol sekunder, kolom cari, segmented control, ubin KPI di dalam kartu. |
| `fill-2` | `#e5e5ea` | `#2c2c32` | Trek progress bar dan cincin, hover tombol sekunder. Isian status di atasnya selalu ≥4:1. |
| `line` | `#e3e3e8` | `#26262c` | Garis rambut 1px pemisah baris dan tepi sidebar. Dekoratif; jangan jadi satu-satunya batas kontrol. |
| `line-strong` | `#8e8e93` | `#6c6c73` | Batas kontrol yang wajib terlihat (checkbox, input bergaris). ≥3:1 di surface pada kedua tema. |
| `ink` | `#1d1d1f` | `#f5f5f7` | Teks utama dan angka, di bg, surface, surface-2 dan fill-1 (≥12:1 di kedua tema). |
| `ink-2` | `#6e6e73` | `#aeaeb2` | Teks sekunder: subjudul, meta, label sumbu. ≥4.5:1 di bg, surface, surface-2 dan fill-1 pada kedua tema. |
| `ink-3` | `#8e8e93` | `#8e8e93` | Hanya placeholder dan teks nonaktif. Tidak lolos 4.5:1 di terang — jangan untuk informasi penting. |
| `putih` | `#ffffff` | `#ffffff` | Putih tetap: separuh bawah tanda merah-putih di logo. Tidak berubah di tema gelap. |

Aturan: teks utama selalu `ink`; meta, subjudul, label sumbu `ink-2`; `ink-3` hanya placeholder dan nonaktif. Jangan menulis abu-abu sendiri (`#999`, `opacity: .6`).

## Merah identitas

| Token | Terang | Malam | Pemakaian |
| --- | --- | --- | --- |
| `merah` | `#d11a2a` | `#ff6961` | Merah identitas. Sebagai teks/ikon/garis di bg, surface, fill-1 dan merah-soft (≥4.8:1 di kedua tema). |
| `merah-fill` | `#d11a2a` | `#e0242f` | Isian padat merah (tombol primer, batang grafik terpilih, logo). Teks di atasnya on-accent putih (≥4.7:1). |
| `merah-soft` | `#fdecee` | `#3a1214` | Latar tint merah di belakang teks merah: nav aktif, eyebrow, chip terpilih. |
| `merah-tua` | `#a8121f` | `#ff8a84` | Merah pekat untuk blok sampul dan keadaan ditekan tombol primer. |
| `merah-cerah` | `#FF4D57` | `#FF6B6B` | Titik awal gradien merah (cincin, batang, logo, ilustrasi). Dekoratif: jangan jadi latar teks kecil. |
| `merah-dalam` | `#9E0F1C` | `#B3121F` | Titik akhir gradien teks-aman merah (kartu sorotan bertulisan putih). |

## Alias aksen (yang dipakai semua UI)

| Token | Terang | Malam | Pemakaian |
| --- | --- | --- | --- |
| `accent` | `#d11a2a` | `#ff6961` | ALIAS aksen aktif sebagai teks/ikon/garis. Default merah; data-accent mengikatnya ke hue lain. Pakai ini, bukan hue langsung, untuk semua UI. |
| `accent-fill` | `#d11a2a` | `#e0242f` | ALIAS isian padat aksen: tombol primer, batang terpilih, cincin progres, swatch aktif. |
| `accent-soft` | `#fdecee` | `#3a1214` | ALIAS tint aksen di belakang teks accent: item nav aktif, chip terpilih, eyebrow. |
| `accent-cerah` | `#FF4D57` | `#FF6B6B` | ALIAS titik awal gradien aksen aktif. data-accent mengikatnya ke hue-cerah lain. |
| `on-accent` | `#ffffff` | `#ffffff` | Teks/ikon di atas accent-fill. Putih untuk semua hue; aksen grafit mengikatnya ke on-grafit. |
| `focus` | `#D11A2A` | `#FF6961` | Cincin fokus keyboard 2px dengan jarak 2px. Mengikuti aksen; ≥4.8:1 di bg dan surface. |

**Selalu pakai alias, bukan hue langsung.** Komponen dan halaman menulis `var(--accent)`, `var(--accent-fill)`, `var(--accent-soft)` — tidak pernah `var(--merah)` atau `var(--biru-fill)`. Hue langsung hanya untuk swatch `AccentPicker` dan dokumentasi.

- `accent` = teks/ikon/garis berwarna aksen.
- `accent-fill` = isian padat (tombol primer, batang terpilih). Teks di atasnya `on-accent`.
- `accent-soft` = tint di belakang teks `accent` (nav aktif, eyebrow, tab aktif).
- `accent-cerah` = titik awal gradien. Dekoratif — jangan jadi latar teks kecil.

Di mode malam warna **teks** aksen dibuat lebih terang agar terbaca di hitam, sedangkan **isian** tetap pekat agar teks putih di atasnya ≥4.5:1. Karena itu `accent` dan `accent-fill` selalu dibedakan.

## Enam aksen

Pengguna atau organisasi (mis. per anak perusahaan) bisa memilih aksen lewat `data-accent`. Yang berubah hanya alias `accent*` dan `focus`; struktur, status, dan warna data tetap.

| Aksen | `data-accent` | Teks terang · malam | Teks di isian |
| --- | --- | --- | --- |
| Merah (bawaan) | `merah` | #D11A2A · #FF6961 | putih |
| Biru | `biru` | #0A66D6 · #4DA3FF | putih |
| Hijau | `hijau` | #1A7340 · #3DD47A | putih |
| Ungu | `ungu` | #6E3FD8 · #B79BFF | putih |
| Oranye | `oranye` | #B84A00 · #FF9F43 | putih |
| Grafit | `grafit` | #3A3A3C · #E5E5EA | `on-grafit` (gelap di malam) |

| Token | Terang | Malam | Pemakaian |
| --- | --- | --- | --- |
| `biru` | `#0a66d6` | `#4da3ff` | Hue aksen alternatif Biru, sebagai teks/ikon di surface dan biru-soft. |
| `biru-fill` | `#0a66d6` | `#0a6ce0` | Isian padat aksen Biru, dengan on-accent putih. |
| `biru-soft` | `#e8f1fd` | `#0b2340` | Tint aksen Biru. |
| `biru-cerah` | `#40C8FF` | `#64D2FF` | Titik awal gradien aksen Biru. Dekoratif. |
| `hijau` | `#1a7340` | `#3dd47a` | Hue aksen alternatif Hijau, sebagai teks/ikon di surface dan hijau-soft. |
| `hijau-fill` | `#1a7340` | `#1e8048` | Isian padat aksen Hijau, dengan on-accent putih. |
| `hijau-soft` | `#e8f5ec` | `#0e2a19` | Tint aksen Hijau. |
| `hijau-cerah` | `#34C759` | `#30D158` | Titik awal gradien aksen Hijau dan cincin Kehadiran. Dekoratif. |
| `ungu` | `#6e3fd8` | `#b79bff` | Hue aksen alternatif Ungu, sebagai teks/ikon di surface dan ungu-soft. |
| `ungu-fill` | `#6e3fd8` | `#7a4be0` | Isian padat aksen Ungu, dengan on-accent putih. |
| `ungu-soft` | `#f0ebfc` | `#241a3f` | Tint aksen Ungu. |
| `ungu-cerah` | `#C969F5` | `#BF5AF2` | Titik awal gradien aksen Ungu. Dekoratif. |
| `oranye` | `#b84a00` | `#ff9f43` | Hue aksen alternatif Oranye, sebagai teks/ikon di surface dan oranye-soft. |
| `oranye-fill` | `#b84a00` | `#c25000` | Isian padat aksen Oranye, dengan on-accent putih. |
| `oranye-soft` | `#fff0e3` | `#33200c` | Tint aksen Oranye. |
| `oranye-cerah` | `#FF9F0A` | `#FFB340` | Titik awal gradien aksen Oranye dan gradien Senja. Dekoratif. |
| `grafit` | `#3a3a3c` | `#e5e5ea` | Hue aksen alternatif Grafit (monokrom), sebagai teks/ikon di surface dan grafit-soft. |
| `grafit-fill` | `#1d1d1f` | `#e5e5ea` | Isian padat aksen Grafit. Di tema gelap isiannya terang, jadi teksnya on-grafit (gelap). |
| `grafit-soft` | `#ededf0` | `#3a3a3c` | Tint aksen Grafit. |
| `grafit-cerah` | `#8E8E93` | `#AEAEB2` | Titik awal gradien aksen Grafit. Dekoratif. |
| `on-grafit` | `#ffffff` | `#1d1d1f` | Teks di atas grafit-fill (≥13:1 di kedua tema). |

## Status

Selalu warna + ikon + kata. Hijau dan merah status hampir sama gelapnya, jadi **ikon dan kata wajib**.

| Status | Kata | Ikon | Teks | Latar |
| --- | --- | --- | --- | --- |
| Sesuai jadwal / Selesai | "Sesuai jadwal" / "Selesai" | `selesai` (centang) | `sukses` | `sukses-soft` |
| Perlu perhatian | "Perlu perhatian" | `peringatan` (segitiga) | `waspada` | `waspada-soft` |
| Terlambat / Ditolak | "Terlambat" | `waktu` (jam) | `bahaya` | `bahaya-soft` |
| Informasi | bebas, singkat | `info` | `info` | `info-soft` |
| Belum mulai / Cuti | "Belum mulai" / "Cuti" | `titik` | `ink-2` | `fill-1` |

| Token | Terang | Malam | Pemakaian |
| --- | --- | --- | --- |
| `sukses` | `#18794e` | `#3dd47a` | Status Sesuai jadwal / Selesai / delta naik. Teks & ikon di surface, fill-1 dan sukses-soft. Selalu bersama ikon centang dan kata. |
| `sukses-soft` | `#e6f4ec` | `#0f2a1c` | Latar lencana dan ikon status sukses. |
| `waspada` | `#a05a00` | `#ffb340` | Status Perlu perhatian. Teks & ikon di surface, fill-1 dan waspada-soft. Selalu bersama ikon segitiga dan kata. |
| `waspada-soft` | `#fff3e0` | `#2e1f06` | Latar lencana dan ikon status waspada. |
| `bahaya` | `#c4142a` | `#ff6b6b` | Status Terlambat / Ditolak / delta turun. Lebih pekat dari merah identitas; selalu bersama ikon jam dan kata. |
| `bahaya-soft` | `#fdecec` | `#3a1214` | Latar lencana dan ikon status bahaya; latar tombol destruktif. |
| `info` | `#0a66d6` | `#4da3ff` | Status informasi netral (pengumuman, sinkronisasi). |
| `info-soft` | `#e8f1fd` | `#0b2340` | Latar lencana informasi. |

`bahaya` sengaja lebih pekat dan dingin dari merah identitas. Status **tidak** ikut aksen — merah identitas dan merah bahaya bisa berdampingan tanpa tertukar karena status selalu berlencana.

## Warna data

Enam seri dipetakan **tetap** ke divisi. Satu divisi = satu warna di semua layar, semua peran, semua grafik.

| Seri | Divisi |
| --- | --- |
| `data-1` | Teknologi |
| `data-2` | Keuangan |
| `data-3` | Media |
| `data-4` | SDM |
| `data-5` | Operasional |
| `data-6` | Hukum |

| Token | Terang | Malam | Pemakaian |
| --- | --- | --- | --- |
| `data-1` | `#0a66d6` | `#4da3ff` | Seri data 1 — Divisi Teknologi. Selalu dengan label langsung. |
| `data-2` | `#1a7340` | `#3dd47a` | Seri data 2 — Divisi Keuangan. |
| `data-3` | `#c2255c` | `#ff6b9a` | Seri data 3 — Divisi Media. |
| `data-4` | `#6e3fd8` | `#b79bff` | Seri data 4 — Divisi SDM. |
| `data-5` | `#b84a00` | `#ff9f43` | Seri data 5 — Divisi Operasional. |
| `data-6` | `#0b7a7a` | `#3cc9c9` | Seri data 6 — Divisi Hukum. |
| `chart-idle` | `#8e8e93` | `#6c6c70` | Batang grafik yang tidak dipilih (≥3:1 di surface). Batang terpilih memakai accent-fill. |
| `chart-grid` | `#ededf0` | `#222228` | Garis bantu dan sumbu dasar grafik. Dekoratif. |

- Maksimal 6 seri per grafik; selebihnya "Lainnya".
- Label langsung (nama + angka di samping), bukan legenda terpisah.
- Grafik satu seri: batang lain `chart-idle`, batang terpilih/terkini `accent-fill` (gradien aksen).
- Target ditandai garis tegak 2px `ink`.
- Avatar orang memakai tint warna divisinya; pengguna sendiri memakai `accent`.

## Material

| Token | Terang | Malam | Pemakaian |
| --- | --- | --- | --- |
| `glass` | `rgba(255,255,255,0.72)` | `rgba(20,20,24,0.72)` | Material tembus pandang untuk tab bar, header lengket dan sidebar, selalu dengan backdrop-filter blur 20px. |
| `glass-tipis` | `rgba(255,255,255,0.5)` | `rgba(20,20,24,0.5)` | Material tipis: chip dan label yang melayang di atas grafik atau gradien. |
| `glass-tebal` | `rgba(255,255,255,0.88)` | `rgba(26,26,30,0.9)` | Material tebal: popover dan tooltip grafik yang memuat teks kecil. |
| `glass-sorot` | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.10)` | Garis sorot 1px di tepi atas kartu kaca dan kartu gradien. |
| `scrim` | `rgba(0,0,0,0.32)` | `rgba(0,0,0,0.62)` | Tirai gelap di belakang sheet dan dialog. |

## Kontras yang sudah diperiksa

Dihitung dengan rumus WCAG 2.1 dari nilai di `tokens.json`.

| Teks / grafis | Di atas | Terang | Malam | Syarat |
| --- | --- | --- | --- | --- |
| `ink` | `bg` | 15.5 | 18.7 | ≥4.5:1 |
| `ink` | `surface` | 16.8 | 17.0 | ≥4.5:1 |
| `ink` | `fill-1` | 15.1 | 14.7 | ≥4.5:1 |
| `ink-2` | `bg` | 4.7 | 9.2 | ≥4.5:1 |
| `ink-2` | `surface` | 5.1 | 8.4 | ≥4.5:1 |
| `ink-2` | `surface-2` | 4.9 | 7.9 | ≥4.5:1 |
| `ink-2` | `fill-1` | 4.5 | 7.2 | ≥4.5:1 |
| `ink-3` | `surface` | 3.3 | 5.7 | placeholder saja |
| `line-strong` | `surface` | 3.3 | 3.6 | ≥3:1 (grafis) |
| `chart-idle` | `surface` | 3.3 | 3.5 | ≥3:1 (grafis) |
| `merah` | `surface` | 5.4 | 6.6 | ≥4.5:1 |
| `merah` | `fill-1` | 4.8 | 5.7 | ≥4.5:1 |
| `merah` | `merah-soft` | 4.7 | 5.8 | ≥4.5:1 |
| `sukses` | `surface` | 5.4 | 9.6 | ≥4.5:1 |
| `sukses` | `sukses-soft` | 4.8 | 8.0 | ≥4.5:1 |
| `waspada` | `surface` | 5.3 | 10.4 | ≥4.5:1 |
| `waspada` | `waspada-soft` | 4.8 | 9.0 | ≥4.5:1 |
| `bahaya` | `surface` | 6.0 | 6.7 | ≥4.5:1 |
| `bahaya` | `bahaya-soft` | 5.3 | 5.9 | ≥4.5:1 |
| `info` | `surface` | 5.4 | 7.1 | ≥4.5:1 |
| `info` | `info-soft` | 4.7 | 6.0 | ≥4.5:1 |
| `biru` | `surface` | 5.4 | 7.1 | ≥4.5:1 |
| `hijau` | `surface` | 5.9 | 9.6 | ≥4.5:1 |
| `ungu` | `surface` | 6.2 | 8.1 | ≥4.5:1 |
| `oranye` | `surface` | 5.2 | 9.1 | ≥4.5:1 |
| `grafit` | `surface` | 11.3 | 14.8 | ≥4.5:1 |
| `data-1` | `surface` | 5.4 | 7.1 | ≥4.5:1 |
| `data-2` | `surface` | 5.9 | 9.6 | ≥4.5:1 |
| `data-3` | `surface` | 5.7 | 6.9 | ≥4.5:1 |
| `data-4` | `surface` | 6.2 | 8.1 | ≥4.5:1 |
| `data-5` | `surface` | 5.2 | 9.1 | ≥4.5:1 |
| `data-6` | `surface` | 5.1 | 9.2 | ≥4.5:1 |
| `putih` | `merah-fill` | 5.4 | 4.7 | ≥4.5:1 |
| `putih` | `biru-fill` | 5.4 | 5.0 | ≥4.5:1 |
| `putih` | `hijau-fill` | 5.9 | 5.0 | ≥4.5:1 |
| `putih` | `ungu-fill` | 6.2 | 5.4 | ≥4.5:1 |
| `putih` | `oranye-fill` | 5.2 | 4.7 | ≥4.5:1 |
| `on-grafit` | `grafit-fill` | 16.8 | 13.4 | ≥4.5:1 |

Pasangan lain yang tidak ada di tabel: periksa sebelum dipakai. Bila gagal, pakai token yang lebih pekat — jangan menurunkan ukuran teks.
