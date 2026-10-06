# 04 · Tipografi

## Keluarga huruf

| Variabel | Tumpukan | Untuk |
| --- | --- | --- |
| `--font-display` | SF Pro Display → Geist → system-ui | Judul ≥20px dan angka besar |
| `--font-sans` | SF Pro Text → Geist → system-ui | Semua teks lain |
| `--font-mono` | SF Mono → Geist Mono → ui-monospace | Pintasan keyboard, kode dokumen (SOP-COR-001), nama token |

Satu rumpun huruf, dibedakan lewat ukuran dan ketebalan — persis gaya Apple. SF Pro tampil otomatis di perangkat Apple; Geist dari Google Fonts menjaga Windows/Android tetap rapi:

```html
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&display=swap" rel="stylesheet">
```

Jangan menambah huruf serif, dekoratif, atau huruf merek lain.

## Skala

| Gaya | Ukuran / baris | Tebal | Tracking | Dipakai untuk |
| --- | --- | --- | --- | --- |
| `display-xl` | 48 / 52 | 700 | −0.03em | Angka di tengah cincin besar. Satu per layar |
| `large-title` | 40 / 44 | 700 | −0.025em | Sapaan desktop ("Selamat sore, Ris") |
| `title-1` | 34 / 40 | 700 | −0.02em | Kalimat ringkasan; large title tablet & ponsel |
| `title-2` | 28 / 34 | 700 | −0.02em | Angka KPI, nilai grafik terpilih |
| `title-3` | 20 / 26 | 600 | −0.01em | Judul kartu dan sheet |
| `headline` | 17 / 24 | 600 | −0.01em | Nama item di ponsel |
| `body-lg` | 17 / 24 | 400 | 0 | Body ponsel/tablet, kalimat pendukung ringkasan |
| `body` | 15 / 22 | 400 | 0 | Body desktop, isi tabel |
| `body-strong` | 15 / 22 | 600 | 0 | Nama proyek di tabel, label tombol |
| `callout` | 14 / 20 | 500 | 0 | Chip, segmented, nav, tombol kecil |
| `footnote` | 13 / 18 | 400 | 0 | Meta, subjudul kartu, delta KPI |
| `caption` | 12 / 16 | 500 | +0.01em | Label sumbu grafik, label tab bar, lencana |
| `code` | 13 / 18 | 500 | 0 | Kode referensi |

Tersedia sebagai variabel `--text-<gaya>` (shorthand `font`) dan kelas `.title-1`, `.body`, dst. di `tokens.css`.

## Ukuran khusus di layar

| Elemen | Desktop | Tablet | Ponsel |
| --- | --- | --- | --- |
| Sapaan / judul halaman | 40 `large-title` | 34 `title-1` | 34 `title-1` |
| Kalimat ringkasan (hero) | 34 | 26 | 19–20 |
| Judul bagian papan dokumentasi | 34 | — | — |
| Angka KPI | 28 | 28 | 26–28 |
| Angka di cincin | 48 (cincin 176) | 34 (cincin 120–130) | 22–26 (cincin 96) |
| Judul kartu | 20 | 20 | 17 `headline` |
| Body | 15 | 16 | 15–17 |

## Aturan

- Hierarki per kartu maksimal tiga tingkat: judul (`title-3`), isi (`body`), meta (`footnote`, `ink-2`).
- Di ponsel, large title `title-1` di atas setiap tab; subjudul (tanggal/konteks) `footnote` di atasnya.
- **Angka selalu `font-variant-numeric: tabular-nums`** agar kolom lurus dan angka tidak "melompat" saat berubah.
- Satuan ditulis lebih kecil dan `ink-2` di sebelah angka besar: **142** output.
- Lebar baris paragraf 60–70 karakter (`max-width: 46ch` untuk kalimat ringkasan, `70ch` untuk deskripsi bagian).
- Tracking negatif hanya untuk ≥20px.
- Jangan memiringkan, menggarisbawahi (kecuali tautan dalam paragraf), atau mengecilkan di bawah 12px.
- Tebal yang dipakai hanya 400, 500, 600, 700.
- Teks panjang tidak dipotong dengan elipsis di desktop kecuali di sel tabel; di ponsel boleh dua baris.
