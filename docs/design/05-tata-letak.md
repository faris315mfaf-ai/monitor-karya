# 05 · Tata letak, spasi & radius

## Spasi

Semua jarak kelipatan 4px.

| Token | Nilai | Untuk |
| --- | --- | --- |
| `space-1` | 4 | Jarak ikon–teks rapat, celah titik status |
| `space-2` | 8 | Antar chip dan tombol dalam satu grup |
| `space-3` | 12 | Antar ubin KPI, celah grid kecil |
| `space-4` | 16 | Antar elemen dalam kartu; antar kartu di ponsel |
| `space-5` | 20 | Padding kartu ponsel; margin samping ponsel |
| `space-6` | 24 | Padding kartu desktop; gutter antar kartu desktop/tablet |
| `space-8` | 32 | Padding kartu ringkasan; margin samping tablet |
| `space-10` | 40 | Margin samping konten desktop; antar bagian besar |
| `space-12` | 48 | Header halaman ke konten pertama |
| `space-16` | 64 | Ruang bawah halaman sebelum tepi/tab bar |

Lebih baik terlalu lega daripada sesak. Bila kartu terasa padat, **kurangi isinya, jangan jaraknya**.

## Radius

| Token | Nilai | Untuk |
| --- | --- | --- |
| `radius-xs` | 6 | Lencana angka, kbd, swatch kecil |
| `radius-sm` | 10 | Kolom input, tombol segmented, item nav, ikon kotak 34–40px |
| `radius-md` | 14 | Baris daftar yang bisa diklik, ubin di dalam kartu, area isian |
| `radius-lg` | 22 | Kartu |
| `radius-xl` | 28 | Sheet, dialog, kartu ringkasan utama (desktop 32, tablet 30) |
| `radius-full` | 999 | Tombol, chip, lencana, avatar, progress bar, tab bar mengambang |

**Radius anak = radius induk − padding.** Kartu 22 dengan padding 8 → ubin di dalamnya 14.

Bingkai perangkat di papan kanvas: tablet 28, ponsel 44 (hanya presentasi, bukan bagian UI).

## Grid per perangkat

| Perangkat | Lebar | Kolom | Gutter | Margin | Navigasi |
| --- | --- | --- | --- | --- | --- |
| Desktop | ≥1024 | 12 (atau flex-wrap) | 24 | 40 | Sidebar 248px |
| Tablet | 600–1023 | 8 | 20 | 32 | Tab bar mengambang di atas tengah |
| Ponsel | <600 | 4 | 16 | 20 | Tab bar bawah 83px |

Isi desktop berhenti melebar di `content-max` 1180px dan diletakkan di tengah area kanan sidebar.

### Kerangka desktop (fluid)

```html
<div data-theme="light" data-accent="merah" style="min-height:100vh; display:flex; flex-wrap:wrap; background:var(--aurora), var(--bg)">
  <nav style="flex:1 1 248px">…sidebar…</nav>
  <main style="flex:999 1 640px; min-width:0; padding:36px 40px 64px">
    <div style="max-width:1180px; margin:0 auto; display:flex; flex-direction:column; gap:24px">…</div>
  </main>
</div>
```

Baris kartu memakai `display:flex; flex-wrap:wrap; gap:24px` dengan anak `flex: 2 1 600px` (lebar) dan `flex: 1 1 300–340px` (sempit), sehingga turun menjadi satu kolom tanpa media query. Tabel lebar dibungkus `overflow-x:auto` dengan `min-width` 700–760px.

### Kerangka tablet (834 × 1194 acuan)

- Logo kiri, `TabBar floating` di tengah, avatar kanan — melayang 16px dari atas, `pointer-events` hanya di kontrolnya.
- Isi digulir dengan padding `92px 32px 48px`.
- Kartu 2 kolom (`grid-template-columns: repeat(2, minmax(0,1fr))`, gap 16–20); KPI 4 sebaris.
- Detail = `Sheet variant="form"` di tengah layar di atas scrim, padding 48.

### Kerangka ponsel (390 × 844 acuan)

- Isi digulir dengan padding `56px 20px 110px` (110 = ruang tab bar).
- Header: subjudul `footnote` + large title 34 + avatar 36 di kanan.
- KPI 2×2, kartu satu kolom, gap 14–16, radius kartu 20–22.
- Tab bar bawah menempel; detail = layar penuh didorong dari kanan dengan header kaca 96px dan tombol aksi menempel di bawah (padding bawah 34 untuk area aman).

## Anatomi kartu

```
┌──────────────────────────────────────────────┐  radius-lg 22 · surface · shadow-card
│  Judul kartu (title-3)          [aksi kanan] │  padding 24 (desktop) / 18 (ponsel)
│  Subjudul satu baris (footnote, ink-2)       │
│                                     ↕ 16     │
│  Isi: grafik / daftar / angka                │
└──────────────────────────────────────────────┘
```

- Aksi kanan header: `SegmentedControl` kecil, `Chip` filter, `Button plain`/`secondary` `sm`, atau angka besar terpilih.
- Baris daftar di dalam kartu dipisah `line` 1px (`border-top`), padding vertikal 10–14.
- Jangan menumpuk kartu di dalam kartu; pakai area `surface-2` + `inset 0 0 0 1px var(--line)` atau `fill-1`.

## Ukuran tetap

| Token | Nilai | Untuk |
| --- | --- | --- |
| `sidebar-w` | 248px | Sidebar desktop |
| `content-max` | 1180px | Isi desktop |
| `sheet-w` | 440px | Sheet detail samping desktop |
| `tabbar-h` | 83px | Tab bar ponsel termasuk area aman |
| `touch-min` | 44px | Target sentuh |

## Lapisan (z-index)

| Token | Nilai | Untuk |
| --- | --- | --- |
| `z-sticky` | 10 | Header lengket, kontrol mengambang tablet (5) |
| `z-tabbar` | 20 | Tab bar |
| `z-scrim` | 40 | Tirai di belakang sheet |
| `z-sheet` | 50 | Sheet dan dialog |
| `z-toast` | 60 | Notifikasi singkat |

## Breakpoint

`bp-tablet` 600px · `bp-desktop` 1024px · `bp-wide` 1440px. Di antara titik itu tata letak cair (flex-wrap), bukan lompatan ukuran tetap.
