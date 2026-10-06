# design-system/

Berkas sumber kebenaran visual Monitor Karya. Semua layar mengambil warna, huruf, jarak, radius, bayangan dan gerak dari sini.

| Berkas | Isi | Kapan dipakai |
| --- | --- | --- |
| `tokens.json` | Sumber token (warna terang & malam, gradien, huruf, spasi, radius, bayangan, gerak, tata letak) beserta catatan pemakaian | Satu-satunya tempat mengubah nilai. Berkas lain dibuat ulang darinya |
| `tokens.css` | Variabel CSS `--nama-token` untuk tema terang (`:root`) dan malam (`[data-theme="dark"]`), plus kelas gaya teks (`.title-1`, `.body`, …) | Impor sekali di akar aplikasi |
| `tokens.ts` | Nilai yang sama sebagai objek TypeScript, plus `statusLabel`, `divisionTone`, `accents` | Untuk grafik, kanvas, PDF, email, atau logika yang butuh nilai mentah |
| `tailwind.preset.cjs` | Preset Tailwind: warna, spasi, radius, bayangan, gradien, ukuran teks → variabel CSS | Bila proyek memakai Tailwind |
| `components/bundle.css` | Gaya semua komponen (kelas `mk-…`), aksen dinamis, aurora, mode malam v3 | Impor setelah `tokens.css` |
| `components/bundle.js` | Implementasi acuan 30 komponen React 18 di `window.MonitorKarya` | Rujukan perilaku & markup. Boleh dipakai langsung atau diport ke komponen proyek |
| `components/index.d.ts` | Tipe props semua komponen | Kontrak API — komponen proyek harus menerima props yang sama |

## Urutan impor

```html
<link rel="stylesheet" href="/design-system/tokens.css">
<link rel="stylesheet" href="/design-system/components/bundle.css">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&display=swap" rel="stylesheet">
```

`bundle.css` sengaja memuat ulang nilai mode malam (tanpa layer) supaya tetap benar walau `tokens.css` di proyek tertinggal satu versi.

## Mengubah token

1. Ubah nilai di `tokens.json` (selalu isi `light` dan `dark` untuk warna).
2. Periksa kontras (lihat `docs/design/09-aksesibilitas.md`).
3. Buat ulang `tokens.css`, `tokens.ts`, `tailwind.preset.cjs`.
4. Catat di `docs/design/CHANGELOG.md`.

Jangan menulis warna hex langsung di komponen atau halaman. Bila butuh warna yang belum ada, tambahkan tokennya dulu.
