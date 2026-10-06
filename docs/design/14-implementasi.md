# 14 · Implementasi di kode

Panduan ini tidak bergantung pada kerangka tertentu. Contoh memakai React + TypeScript karena implementasi acuan komponen ditulis dengan React 18; padanan CSS biasa dan Tailwind juga diberikan.

> Catatan: struktur repo `monitor-karya` belum bisa saya baca saat panduan ini dibuat. Sesuaikan jalur folder (`src/…`) dengan proyek Anda; aturan dan nilainya tetap.

## 1. Letakkan berkas

```
monitor-karya/
├─ DESIGN.md                    ← pintu masuk panduan
├─ docs/design/                 ← panduan lengkap (berkas ini)
└─ design-system/
   ├─ tokens.json               ← sumber nilai
   ├─ tokens.css / tokens.ts / tailwind.preset.cjs
   └─ components/ bundle.css · bundle.js · index.js · index.d.ts
```

## 2. Pasang token & huruf

```css
/* src/styles/global.css */
@import "../../design-system/tokens.css";
@import "../../design-system/components/bundle.css";

html { background: var(--bg); color: var(--ink); font: var(--text-body); -webkit-font-smoothing: antialiased; }
.angka, td, .kpi { font-variant-numeric: tabular-nums; }
```

```html
<html lang="id" data-theme="light" data-accent="merah">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&display=swap" rel="stylesheet">
```

### Tema & aksen tanpa kedip

Taruh di `<head>` sebelum CSS aplikasi dirender:

```html
<script>
  (function () {
    try {
      var p = JSON.parse(localStorage.getItem('mk-tampilan') || '{}');
      var t = p.theme || 'system';
      var gelap = matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = t === 'system' ? (gelap ? 'dark' : 'light') : t;
      document.documentElement.dataset.accent = p.accent || 'merah';
    } catch (e) {}
  })();
</script>
```

Simpan pilihan juga di profil pengguna di server (agar ikut ke perangkat lain); `localStorage` hanya cadangan untuk muat awal.

```tsx
// src/lib/useTampilan.ts
import { useEffect, useState } from 'react';
import type { Accent } from '../../design-system/tokens';
export function useTampilan() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [accent, setAccent] = useState<Accent>('merah');
  useEffect(() => {
    const el = document.documentElement;
    const gelap = matchMedia('(prefers-color-scheme: dark)').matches;
    el.dataset.theme = theme === 'system' ? (gelap ? 'dark' : 'light') : theme;
    el.dataset.accent = accent;
    try { localStorage.setItem('mk-tampilan', JSON.stringify({ theme, accent })); } catch {}
  }, [theme, accent]);
  return { theme, setTheme, accent, setAccent };
}
```

## 3. Memakai komponen

### Opsi A — pakai implementasi acuan langsung (paling cepat)

```tsx
'use client'; // bila Next.js
import { Button, StatTile, ActivityRings, StatusBadge } from '../../design-system/components';

<StatTile variant="gradient" label="Output minggu ini" value={142} delta="+9% dari minggu lalu" spark={[118,110,127,121,130,142]} />
```

Tipe tersedia di `index.d.ts`. Bundle membaca `window`, jadi hanya dimuat di klien.

### Opsi B — port ke komponen proyek (disarankan jangka panjang)

Buat `src/components/ui/<Nama>.tsx` per komponen dengan **nama, props, kelas `mk-…`, dan perilaku yang sama** (lihat `10-komponen.md` dan `index.d.ts`). Salin markup dari `bundle.js` (fungsi bernama sama) dan pertahankan `bundle.css`. Dengan begitu layar bisa dibangun ulang langsung dari spesifikasi di `peran/`.

Urutan port yang disarankan: Icon → LogoMark → Button → IconButton → StatusBadge → Avatar → ProgressBar → Card → SegmentedControl → Chip → StatTile → ProjectRow → ApprovalItem → Sheet → NavItem → TabBar → ActivityRings → BarChart → AreaChart → DonutChart → Timeline → FlowDiagram → DivisionBar → Heatmap → sisanya.

### Tailwind

```js
// tailwind.config.cjs
module.exports = {
  presets: [require('./design-system/tailwind.preset.cjs')],
  content: ['./src/**/*.{ts,tsx,html}'],
};
```

```tsx
<section className="rounded-lg bg-surface p-6 shadow-card">
  <h3 className="text-title-3 font-display text-ink">Kinerja divisi</h3>
  <p className="text-footnote text-ink-2">Tepat waktu · target 85%</p>
</section>
```

Warna Tailwind menunjuk ke variabel CSS, jadi tema malam dan aksen tetap bekerja tanpa kelas `dark:`. Jangan memakai palet bawaan Tailwind (`red-500`, `gray-100`) — matikan bila perlu.

### Grafik dengan pustaka lain

Bila memakai Recharts/Chart.js/ECharts, ambil warna dari variabel CSS saat render dan gambar ulang saat `data-theme`/`data-accent` berubah:

```ts
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim();
const warna = { aksen: css('accent-fill'), idle: css('chart-idle'), grid: css('chart-grid'), divisi: [1,2,3,4,5,6].map(i => css(`data-${i}`)) };
```

Ikuti aturan visual di `11-diagram-dan-data.md` (satu sorotan, label langsung, grid putus-putus, tanpa sumbu Y).

## 4. Format bahasa

```ts
// src/lib/format.ts
export const angka = (n: number) => new Intl.NumberFormat('id-ID').format(n);              // 1.466
export const persen = (n: number, d = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(n) + '%'; // 68,5%
export const rupiahRingkas = (n: number) => n >= 1e9 ? `Rp ${angkaDes(n / 1e9)} M` : n >= 1e6 ? `Rp ${angkaDes(n / 1e6)} jt` : `Rp${angka(n)}`;
const angkaDes = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);
export const tanggalPanjang = (d: Date) => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d); // Senin, 5 Oktober 2026
export const tanggalRingkas = (d: Date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d).replace('.', '');          // 18 Okt
export const jam = (d: Date) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(d);                                  // 14.20
export const sapaan = (d = new Date()) => { const h = d.getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; };
```

## 5. Kontrak data (TypeScript)

```ts
export type Status = 'on' | 'risk' | 'late' | 'done' | 'info' | 'neutral';
export type Divisi = 'Teknologi' | 'Keuangan' | 'Media' | 'SDM' | 'Operasional' | 'Hukum';
export type Peran = 'manajemen' | 'direktur' | 'kepala_divisi' | 'admin_pt' | 'pic_proyek' | 'staf';

export interface Proyek {
  id: string; nama: string; divisi: Divisi; pic: Orang;
  progres: number;                 // 0–100
  output: { selesai: number; total: number };
  mulai: string; tenggat: string;  // ISO
  usulTenggat?: string;
  status: Exclude<Status, 'info'>;
  alasan?: string;                 // fakta singkat untuk Perlu perhatian / Terlambat
  catatanTerakhir?: string;
  tahapan: Tahap[];
  laporanHarian: { status: 'belum' | 'terkirim' | 'diingatkan'; waktu?: string };
}
export interface Tahap { nama: string; sub?: string; status: 'done' | 'current' | 'todo' | 'blocked'; meta?: string }
export interface Orang { id: string; nama: string; inisial: string; divisi: Divisi; peran: Peran; jabatan?: string }
export interface Output {
  id: string; proyekId: string; judul: string; deskripsi?: string;
  status: 'belum' | 'dikerjakan' | 'menunggu_review' | 'diterima' | 'revisi';
  bukti: { nama: string; url: string }[]; catatanRevisi?: string; diperbarui: string;
}
export interface LaporanHarian {
  orangId: string; tanggal: string; tugas: { teks: string; selesai: boolean }[];
  kendala?: string; rencanaBesok?: string; foto?: string[];
  status: 'belum' | 'terkirim' | 'dibaca' | 'cuti'; terkirim?: string;
}
export interface LaporanMingguan {
  divisi: Divisi; minggu: string; // 'M40'
  status: 'draf' | 'terkirim' | 'terlambat' | 'belum' | 'dibaca'; terkirim?: string;
  output: { selesai: number; total: number }; tepatWaktu: number; poin: string[]; kendala?: string;
}
export interface Keputusan {
  id: string; jenis: 'persetujuan' | 'eskalasi' | 'review' | 'akses';
  judul: string; pengaju: Orang; waktu: string; nominal?: number; label?: string;
  status: 'menunggu' | 'disetujui' | 'ditolak';
}
```

Pemetaan status ke label UI ada di `design-system/tokens.ts` (`statusLabel`), warna divisi di `divisionTone`.

## 6. Rute per peran

| Peran | Beranda | Tab/rute utama |
| --- | --- | --- |
| Manajemen | `/ringkasan` | `/proyek`, `/persetujuan`, `/tim` |
| Direktur | `/direktur` | `/proyek`, `/eskalasi`, `/divisi` |
| Kepala divisi | `/divisi/:id` | `/review`, `/tim`, `/proyek` |
| Admin PT | `/admin` | `/kepatuhan`, `/akses`, `/data` |
| PIC proyek | `/hari-ini` | `/output`, `/laporan`, `/catatan` |

Detail selalu bisa dibuka lewat URL (`?proyek=p2`, `?output=o5`) supaya bisa dibagikan, tetapi tampil sebagai sheet di atas halaman asal.

## 7. Kerangka layout responsif

```tsx
export function KerangkaAplikasi({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexWrap: 'wrap', background: 'var(--aurora), var(--bg)' }}>
      <nav aria-label="Navigasi utama" className="sidebar">{nav}</nav>  {/* disembunyikan < 1024, diganti TabBar */}
      <main style={{ flex: '999 1 640px', minWidth: 0, padding: '36px 40px 64px' }}>
        <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>{children}</div>
      </main>
    </div>
  );
}
```

```css
.sidebar { flex: 1 1 248px; background: var(--surface); border-right: 1px solid var(--line); padding: 24px 14px 20px; }
@media (max-width: 1023px) { .sidebar { display: none; } main { padding: 92px 32px 48px !important; } }
@media (max-width: 599px)  { main { padding: 56px 20px 110px !important; } }
```

## 8. Uji

- **Visual:** tangkapan layar per halaman × {terang, malam} × {merah, grafit} × {1440, 834, 390} (Playwright). Bandingkan dengan papan kanvas.
- **Aksesibilitas:** axe-core di CI; uji manual daftar di `09-aksesibilitas.md`.
- **Konsistensi:** uji unit bahwa jumlah di badge nav = jumlah item menunggu di daftar.
- **Bahasa:** lint sederhana yang menolak "Submit", "OK", huruf kapital tiap kata pada label.

## 9. Rencana migrasi dari UI lama

1. Pasang `tokens.css` + `bundle.css` + huruf; ganti warna/jarak hard-code dengan token (tanpa mengubah tata letak).
2. Ganti kerangka: sidebar desktop, tab bar tablet/ponsel, latar aurora.
3. Port komponen dasar (tombol, lencana, kartu, KPI) dan pakai di halaman lama.
4. Bangun ulang beranda per peran mengikuti `peran/0x-*.md`, satu peran per rilis, mulai Manajemen.
5. Tambahkan mode malam & pemilih aksen di Tampilan.
6. Hapus CSS lama yang tidak terpakai.
