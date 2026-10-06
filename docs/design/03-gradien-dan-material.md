# 03 · Gradien & material

Gradien gaya Apple: cerah di kiri atas, pekat di kanan bawah, sudut 135°. **Gradien adalah cahaya**, bukan wallpaper. Ia jatuh di titik yang meminta perhatian; sisanya permukaan polos.

## Token gradien tetap

| Token | Nilai | Untuk | Teks putih kecil di atasnya? |
| --- | --- | --- | --- |
| `grad-merah` | #FF4D57 → #D11A2A → #A8121F | Logo, cincin utama, ilustrasi, angka sorotan besar | Hanya ≥24px tebal |
| `grad-merah-teks` | #E0242F → #B3121F → #9E0F1C | Kartu KPI sorotan, banner | Ya (≥4.7:1 di semua titik) |
| `grad-senja` | #FF9F0A → #FF375F → #D11A2A | Momen target tercapai, perayaan. Maks. satu per layar | Tidak |
| `grad-fajar` | #FF375F → #BF5AF2 | Cincin & grafik sekunder, avatar workspace | Tidak |
| `grad-laut` | #64D2FF → #0A84FF | Seri Teknologi, cincin Laporan | Tidak |
| `grad-daun` | #30D158 → #00C7BE | Seri sukses, cincin Kehadiran | Tidak |
| `grad-malam` | #2C2C2E → #000 (malam: #26262C → #050506) | Kartu gelap premium, mode presentasi | Ya |
| `kilau` | putih 22% → 0 (malam 16%) | Lapisan kilau di atas isian padat (tombol primer, logo, swatch) | — |
| `aurora` | cahaya radial berwarna aksen | Latar atas halaman dan kartu ringkasan | — |
| `nebula` (malam saja) | aksen 22% + ungu 16% | Kartu sampul, layar kosong, latar tab bar contoh | — |

## Gradien aksen dinamis

Disediakan `bundle.css` dan **mengikuti `data-accent`** — dipakai di komponen dan halaman, bukan gradien merah tetap:

| Variabel | Arah | Untuk |
| --- | --- | --- |
| `--accent-grad` | 135° `accent-cerah` → `accent-fill` | Cincin, ilustrasi, swatch |
| `--accent-grad-v` | 180° | Batang grafik terpilih |
| `--accent-grad-h` | 90° | Progres horizontal, garis area |
| `--accent-grad-teks` | 135° `accent-fill` → `accent-fill` + 30% hitam | Kartu/ubin bergradien dengan teks putih (`StatTile variant="gradient"`) |
| `--accent-glow` | bayangan berwarna aksen | Pendar di bawah tombol primer saat hover, logo, ubin gradien |

## Aurora

- Terang: cahaya aksen 16% di kiri atas + cahaya oranye 12% di kanan atas.
- Malam: cahaya aksen 30% di kiri atas + nebula ungu 18% di kanan atas + pantulan biru 8% di bawah.
- Dipasang sebagai lapisan pertama latar: `background: var(--aurora), var(--bg);` di akar halaman, dan `var(--aurora), var(--surface)` di kartu ringkasan.
- Satu aurora per bidang pandang. Jangan memasang aurora di setiap kartu.

## Aturan gradien

- **Maksimal satu kartu bergradien penuh per layar** (`Card variant="gradient"` atau `StatTile variant="gradient"`). Grafik boleh bergradien di mana saja.
- Teks kecil hanya di atas gradien teks-aman (`grad-merah-teks`, `--accent-grad-teks`, `grad-malam`).
- Di grafik, gradien mengalir dari `*-cerah` ke isian: atas → bawah untuk batang, kiri → kanan untuk garis/progres, diagonal untuk cincin.
- Tidak ada gradien pada teks paragraf, garis tepi, atau ikon.
- Jangan membuat gradien baru di halaman. Bila perlu, tambahkan token.

## Material kaca

| Token | Kepekatan | Untuk |
| --- | --- | --- |
| `glass-tipis` | 50% | Chip dan label yang melayang di atas grafik atau gradien |
| `glass` | 72% | Tab bar, header lengket, panel Tampilan di papan |
| `glass-tebal` | 88–90% | Tooltip grafik, popover bertulisan kecil |
| `glass-sorot` | garis 1px | Sorot tepi atas kartu kaca, kartu gradien, tab bar mengambang |

```css
.kaca {
  background: var(--glass);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  box-shadow: var(--shadow-float), inset 0 1px 0 var(--glass-sorot);
}
```

- Kaca baru terasa bila ada sesuatu di belakangnya (konten yang digulir, aurora, gradien). Jangan dipakai di atas latar polos.
- Kaca hanya untuk elemen yang **melayang**. Kartu biasa memakai `surface` padat.
- Teks di atas kaca minimal `body` 15px, warna `ink`.
