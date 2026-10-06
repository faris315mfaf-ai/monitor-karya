# 10 · Komponen

30 komponen. Implementasi acuan ada di `design-system/components/bundle.js` (React 18, `window.MonitorKarya`), gaya di `bundle.css` (kelas `mk-…`), tipe di `index.d.ts`. Bila proyek memakai komponen sendiri, **props dan perilakunya harus sama** dengan tabel di bawah agar layar bisa dibangun dari panduan ini.

## Aturan umum

- Komponen tidak menulis warna sendiri; semua dari token dan alias aksen.
- Semua komponen bekerja di tema terang dan malam serta keenam aksen tanpa props tambahan.
- Komponen interaktif bisa **dikendalikan** (`value`/`selectedIndex`/`state` + `onChange`/`onSelect`/`onStateChange`) atau **tak dikendalikan** (`defaultValue`). Halaman yang menyinkronkan beberapa komponen (grafik ↔ angka besar, donat ↔ filter) memakai mode dikendalikan.
- `tone` menerima `accent`, `data-1…6`; grafik juga menerima status (`on`, `risk`, `late`, `done`, `info`, `neutral`), hue (`merah`, `biru`, `hijau`, `ungu`, `oranye`, `grafit`) dan `putih`.
- `status` menerima `on` (Sesuai jadwal), `risk` (Perlu perhatian), `late` (Terlambat), `done` (Selesai), `info`, `neutral` (Belum mulai).

## Daftar

- **Identitas & dasar:** [`LogoMark`](#logomark), [`Icon`](#icon), [`Avatar`](#avatar)
- **Aksi & kontrol:** [`Button`](#button), [`IconButton`](#iconbutton), [`SegmentedControl`](#segmentedcontrol), [`Chip`](#chip), [`SearchField`](#searchfield), [`AccentPicker`](#accentpicker)
- **Status & progres:** [`StatusBadge`](#statusbadge), [`ProgressBar`](#progressbar), [`ProgressRing`](#progressring), [`StatTile`](#stattile)
- **Diagram & data:** [`BarChart`](#barchart), [`AreaChart`](#areachart), [`Sparkline`](#sparkline), [`DonutChart`](#donutchart), [`ActivityRings`](#activityrings), [`Heatmap`](#heatmap), [`Timeline`](#timeline), [`FlowDiagram`](#flowdiagram), [`DivisionBar`](#divisionbar)
- **Daftar & baris:** [`AttentionItem`](#attentionitem), [`ProjectRow`](#projectrow), [`ApprovalItem`](#approvalitem), [`ActivityItem`](#activityitem)
- **Wadah & navigasi:** [`Card`](#card), [`Sheet`](#sheet), [`NavItem`](#navitem), [`TabBar`](#tabbar)

## Identitas & dasar

### LogoMark

Tanda logo Monitor Karya: kotak membulat, separuh atas gradien aksen dengan kilau, separuh bawah putih tetap.

**Yang diisi pemakai:** `size` (bawaan 32), `label` bila berdiri tanpa teks nama.

- Sudut = 28% dari ukuran (kontinu ala ikon aplikasi Apple).
- Separuh putih tidak pernah ikut tema gelap. Jangan diberi bayangan tambahan atau diputar.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `size` |  | `number` |
| `label` |  | `string` |

```jsx
<LogoMark size={34} />
```

### Icon

Ikon garis inline 24×24 yang mengikuti warna teks (`currentColor`).

**Yang diisi pemakai:** `name` (lihat bagian Ikon), opsional `size` (bawaan 20), `strokeWidth` (1.8), `label` jika ikon berdiri sendiri dan bermakna.

- Pakai 20px di nav dan tombol ikon, 18px di tombol, 24px di tab bar mobile.
- Ikon dekoratif otomatis `aria-hidden`. Ikon yang bermakna tanpa teks: beri `label`, atau lebih baik pakai `IconButton`.
- Jangan pakai emoji atau ikon terisi penuh.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `name` | wajib | `IconName` |
| `size` |  | `number` |
| `strokeWidth` |  | `number` |
| `label` |  | `string` |
| `style` |  | `React.CSSProperties` |

```jsx
<Icon name="proyek" size={20} />
```

### Avatar

Lingkaran inisial dengan tint warna divisi orangnya.

**Yang diisi pemakai:** `initials` (maks. 2 huruf), `name` (dibacakan), `tone` (`data-1…6` sesuai divisi, `accent` untuk pengguna sendiri), `size`.

- 28px di tabel, 32px di aktivitas, 36px di persetujuan, 40–56px di profil.
- Foto boleh menggantikan inisial nanti; pertahankan bentuk bulat dan ukuran yang sama.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `initials` | wajib | `string` |
| `name` |  | `string` |
| `tone` |  | `Tone` |
| `size` |  | `number` |

```jsx
<Avatar initials="RK" name="Rina Kartika" tone="data-1" size={36} />
```

## Aksi & kontrol

### Button

Tombol berbentuk kapsul untuk satu aksi yang jelas.

**Yang diisi pemakai:** label (kata kerja + objek), `variant`, `size`, opsional `icon` / `iconAfter`, `full` untuk lebar penuh, dan `onClick`.

- `primary` (isian `accent-fill`) **paling banyak satu per kartu/layar** — aksi yang paling diharapkan.
- `secondary` (`fill-1`) untuk aksi pendamping; `plain` (teks aksen) untuk navigasi "Lihat semua"; `destructive` untuk Tolak/Hapus.
- Ukuran: `md` 44px bawaan, `lg` 52px untuk tombol menempel di bawah layar mobile, `sm` 32px hanya untuk desktop di dalam baris.
- Jangan: dua tombol primer berdampingan, label "OK"/"Submit", ikon tanpa teks (pakai `IconButton`).

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `variant` |  | `'primary' \| 'secondary' \| 'plain' \| 'destructive'` |
| `size` |  | `'sm' \| 'md' \| 'lg'` |
| `icon` |  | `IconName` |
| `iconAfter` |  | `IconName` |
| `full` |  | `boolean` |

Juga menerima semua atribut `ButtonHTMLAttributes<HTMLButtonElement>` (mis. `onClick`, `disabled`, `aria-*`).

```jsx
<Button variant="primary" icon="selesai" onClick={setujui}>Setujui</Button>
<Button variant="secondary">Tolak</Button>
<Button variant="plain" iconAfter="kanan">Lihat semua proyek</Button>
```

### IconButton

Tombol bulat 40px berisi satu ikon, untuk aksi yang sudah dikenal (tutup, notifikasi, tema).

**Yang diisi pemakai:** `icon`, `label` (wajib — dibacakan pembaca layar dan jadi tooltip), opsional `variant` (`plain` | `filled`) dan `badge` (`true` = titik, angka = lencana).

- `filled` untuk tombol tutup di sheet. `plain` di header.
- Di layar sentuh beri area 44px di sekelilingnya.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `icon` | wajib | `IconName` |
| `label` | wajib | `string` |
| `variant` |  | `'plain' \| 'filled'` |
| `badge` |  | `boolean \| number \| string` |

Juga menerima semua atribut `ButtonHTMLAttributes<HTMLButtonElement>` (mis. `onClick`, `disabled`, `aria-*`).

```jsx
<IconButton icon="notifikasi" label="Notifikasi" badge={3} />
```

### SegmentedControl

Pilihan 2–4 opsi yang saling eksklusif, ditampilkan sebagai satu kapsul dengan "thumb" putih bergeser.

**Yang diisi pemakai:** `options` ({value, label}), `value` + `onChange` (terkendali) atau `defaultValue`, `label` untuk pembaca layar, opsional `size="sm"` dan `full`.

- Pakai untuk mengganti **tampilan data yang sama** (periode, tema). Untuk menyaring daftar pakai `Chip`; untuk berpindah halaman pakai `TabBar`/`NavItem`.
- Label satu kata, sentence case.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `options` | wajib | `{ value: string; label: string }[]` |
| `value` |  | `string` |
| `defaultValue` |  | `string` |
| `onChange` |  | `(value: string) => void; label?: string; size?: 'sm' \| 'md'; full?: boolean; className?: string` |

```jsx
<SegmentedControl label="Periode" size="sm" value={periode} onChange={setPeriode}
  options={[{ value: 'minggu', label: 'Minggu' }, { value: 'bulan', label: 'Bulan' }, { value: 'kuartal', label: 'Kuartal' }]} />
```

### Chip

Filter kapsul untuk menyaring daftar, dengan jumlah item di dalamnya.

**Yang diisi pemakai:** label, `selected`, `count`, opsional `status` (menambah titik warna status), `onClick`.

- Yang terpilih berwarna `ink` pekat (bukan aksen) agar tidak bersaing dengan tombol primer.
- Selalu tampilkan jumlah, termasuk 0.
- Satu baris; di mobile bisa digulir horizontal.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `selected` |  | `boolean` |
| `count` |  | `number \| string` |
| `status` |  | `Status` |

Juga menerima semua atribut `ButtonHTMLAttributes<HTMLButtonElement>` (mis. `onClick`, `disabled`, `aria-*`).

```jsx
<Chip selected={filter === "risk"} count={2} status="risk" onClick={() => setFilter("risk")}>Perlu perhatian</Chip>
```

### SearchField

Kolom cari berisi lembut (`fill-1`) dengan ikon dan pintasan keyboard opsional.

**Yang diisi pemakai:** `id` unik, `placeholder` yang menyebut apa saja yang bisa dicari, `value`/`onChange`, opsional `shortcut`.

- Label tersembunyi tetap ada untuk pembaca layar.
- Di desktop letakkan di header; di mobile di bawah large title halaman Proyek.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `id` |  | `string` |
| `label` |  | `string` |
| `placeholder` |  | `string` |
| `value` |  | `string` |
| `defaultValue` |  | `string` |
| `onChange` |  | `(value: string) => void; shortcut?: string; className?: string` |

```jsx
<SearchField id="cari-proyek" placeholder="Cari proyek atau PIC" shortcut="⌘K" />
```

### AccentPicker

Enam swatch bulat untuk memilih warna aksen aplikasi.

**Yang diisi pemakai:** `value` + `onChange`. Konsumen yang memasang hasilnya ke `data-accent` di `<html>` (atau wadah mana pun).

- Mengganti aksen hanya mengubah `accent`, `accent-fill`, `accent-soft`, `on-accent`, `focus`. Warna status (lihat lencana di contoh) **tidak** berubah.
- Letakkan di kartu Tampilan (sidebar desktop) atau layar Tim → Tampilan di mobile.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `value` |  | `Accent` |
| `defaultValue` |  | `Accent` |
| `onChange` |  | `(accent: Accent) => void; label?: string; className?: string` |

```jsx
<AccentPicker value={aksen} onChange={(a) => { setAksen(a); document.documentElement.dataset.accent = a; }} />
```

## Status & progres

### StatusBadge

Lencana kapsul yang menyatakan status kerja dengan warna, ikon dan kata sekaligus.

**Yang diisi pemakai:** `status` (`on` | `risk` | `late` | `done` | `info` | `neutral`), opsional teks pengganti dan `size="sm"` untuk tabel.

- Teks bawaan memakai kosakata tetap: Sesuai jadwal, Perlu perhatian, Terlambat, Selesai, Belum mulai.
- Jangan ganti dengan titik warna saja, dan jangan pakai warna status untuk hal lain.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `status` | wajib | `Status` |
| `size` |  | `'sm' \| 'md'` |
| `children` |  | `React.ReactNode` |

```jsx
<StatusBadge status="risk" />
<StatusBadge status="info" size="sm">Menunggu review</StatusBadge>
```

### ProgressBar

Batang progres horizontal tipis dengan persen di kanan.

**Yang diisi pemakai:** `value` 0–100, `status` (warna isian mengikuti status proyek; `accent` untuk progres umum), `label` aksesibel, opsional `size="lg"` dan `showValue`.

- Tinggi 6px di tabel, 10px (`lg`) di sheet detail.
- Persen dibulatkan; angka pakai tabular-nums.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `value` | wajib | `number` |
| `status` |  | `Status \| 'accent'` |
| `size` |  | `'md' \| 'lg'` |
| `showValue` |  | `boolean` |
| `label` |  | `string` |

```jsx
<ProgressBar value={64} status="risk" label="Progres Peluncuran Aplikasi Absensi" />
```

### ProgressRing

Cincin progres ala Apple untuk satu angka utama, dengan nilai di tengah.

**Yang diisi pemakai:** `value` 0–100, `size` (176 desktop, 96 mobile, 64 di daftar), `sublabel` satu-dua kata, opsional `status` dan `label` pengganti.

- Satu cincin besar per layar — di kartu ringkasan. Cincin kecil boleh di sheet detail.
- Nilai berganti beranimasi (`dur-data`).

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `value` | wajib | `number` |
| `size` |  | `number` |
| `stroke` |  | `number` |
| `label` |  | `React.ReactNode` |
| `sublabel` |  | `string` |
| `status` |  | `Status \| 'accent'` |
| `ariaLabel` |  | `string` |

```jsx
<ProgressRing value={64} size={176} status="risk" sublabel="selesai" />
```

### StatTile

Ubin KPI: label kecil, angka besar `title-2`, dan satu baris konteks.

**Yang diisi pemakai:** `label` (apa + periode), `value`, opsional `delta`, `trend` (`up` | `down` | `flat`) dan `tone` untuk mengganti warna delta.

- Maksimal 4 ubin per kelompok. Letakkan di dalam kartu (latar `fill-1`), bukan sebagai kartu sendiri.
- Delta selalu punya pembanding: "+9% dari minggu lalu", bukan "+9%".
- Naik tidak selalu baik: untuk "Proyek terlambat" yang naik, set `tone="late"`.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `label` | wajib | `string` |
| `value` | wajib | `number \| string` |
| `delta` |  | `string` |
| `trend` |  | `'up' \| 'down' \| 'flat'` |
| `tone` |  | `Status` |
| `variant` |  | `'default' \| 'surface' \| 'gradient'` |
| `spark` |  | `number[]` |
| `sparkTone` |  | `ChartTone` |

```jsx
<StatTile variant="gradient" label="Output minggu ini" value={142} delta="+9% dari minggu lalu" trend="up" spark={[118,110,127,121,130,142]} />
<StatTile label="Persetujuan" value={5} delta="1 lewat 24 jam" tone="risk" />
```

## Diagram & data

### BarChart

Grafik batang satu seri; batang terpilih (bawaan: terakhir) berwarna aksen, lainnya `chart-idle`.

**Yang diisi pemakai:** `data` ({label, value}), `height`, `unit` untuk label aksesibel, opsional `selectedIndex`/`onSelect` untuk menyinkronkan angka besar di header kartu, `formatValue`.

- Maksimal ±12 batang. Label sumbu pendek: M41, Sep, K3.
- Nilai hanya tampil di batang terpilih/hover agar tenang; angka besar di header kartu menunjukkan batang terpilih.
- Untuk membandingkan divisi pakai `DivisionBar`, bukan batang berwarna-warni.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `data` | wajib | `{ label: string; value: number }[]` |
| `selectedIndex` |  | `number` |
| `defaultSelectedIndex` |  | `number` |
| `onSelect` |  | `(index: number) => void; height?: number; unit?: string; formatValue?: (v: number) => string; className?: string` |

```jsx
<BarChart data={[{ label: "M40", value: 130 }, { label: "M41", value: 142 }]} unit="output" height={200} selectedIndex={i} onSelect={setI} />
```

### AreaChart

Grafik garis halus dengan area gradien yang memudar ke bawah; satu titik terpilih menampilkan nilai dalam gelembung kaca.

**Yang diisi pemakai:** `data` ({label, value}), opsional `compare` (seri pembanding, garis putus-putus) + `compareLabel`, `height`, `tone`, `unit`, `selectedIndex`/`onSelect`.

- Untuk tren berurutan (harian, mingguan). Untuk membandingkan kategori pakai `BarChart` atau `DivisionBar`.
- Maksimal 2 seri. Label sumbu ditaruh di ujung-ujung titik.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `data` | wajib | `{ label: string; value: number }[]` |
| `compare` |  | `number[]` |
| `compareLabel` |  | `string` |
| `seriesLabel` |  | `string` |
| `height` |  | `number` |
| `tone` |  | `ChartTone` |
| `unit` |  | `string` |
| `zero` |  | `boolean` |
| `selectedIndex` |  | `number` |
| `defaultSelectedIndex` |  | `number` |
| `onSelect` |  | `(index: number) => void; formatValue?: (v: number) => string; className?: string` |

```jsx
<AreaChart data={tren} compare={target} compareLabel="Target" seriesLabel="Selesai" unit="output" height={160} />
```

### Sparkline

Garis tren mini tanpa sumbu, untuk konteks di samping angka besar.

**Yang diisi pemakai:** `data` (angka), `height` (bawaan 36), `tone`, `label` aksesibel. Biasanya dipakai lewat prop `spark` di `StatTile`.

- 6–12 titik. Jangan dipakai sendirian tanpa angka.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `data` | wajib | `number[]` |
| `height` |  | `number` |
| `tone` |  | `ChartTone` |
| `area` |  | `boolean` |
| `label` |  | `string` |

```jsx
<Sparkline data={[24,27,29,26,30,28,33,31]} label="Output 8 minggu" />
```

### DonutChart

Cincin komposisi bersegmen dengan celah tipis dan total di tengah; klik segmen atau baris legenda untuk menyorot.

**Yang diisi pemakai:** `data` ({label, value, tone}) 2–6 segmen, `size`, `centerSub`, `label` aksesibel, opsional `centerLabel`, `layout="stack"`.

- Untuk bagian dari keseluruhan (status proyek, sebaran output per divisi). Bukan untuk tren.
- Legenda dengan angka dan persen selalu tampil.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `data` | wajib | `{ label: string; value: number; tone?: ChartTone }[]` |
| `size` |  | `number` |
| `thickness` |  | `number` |
| `gap` |  | `number` |
| `centerLabel` |  | `React.ReactNode` |
| `centerSub` |  | `string` |
| `label` |  | `string` |
| `showLegend` |  | `boolean` |
| `layout` |  | `'row' \| 'stack'` |
| `selectedIndex` |  | `number \| null` |
| `onSelect` |  | `(index: number \| null) => void; formatValue?: (v: number) => string; className?: string` |

```jsx
<DonutChart data={[{ label: "Sesuai jadwal", value: 18, tone: "on" }, { label: "Perlu perhatian", value: 4, tone: "risk" }, { label: "Terlambat", value: 2, tone: "late" }]} centerSub="proyek" label="Status 24 proyek" />
```

### ActivityRings

Tiga cincin konsentris bergradien (gaya cincin Aktivitas Apple) untuk tiga sasaran yang dibaca bersama.

**Yang diisi pemakai:** `rings` ({label, value 0–100, tone, display?, sub?}) maksimal 3, `size`, opsional `center` (isi tengah), `showLegend`, `layout="stack"`.

- Urutan luar → dalam = paling penting → pendukung. Bawaan manajemen: Output (merah), Laporan harian (hijau), Tepat waktu (biru).
- Selalu tampilkan legenda dengan angka; cincin saja tidak cukup.
- Satu kelompok cincin per layar.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `rings` | wajib | `{ label: string; value: number; tone?: ChartTone; display?: string; sub?: string }[]` |
| `size` |  | `number` |
| `thickness` |  | `number` |
| `gap` |  | `number` |
| `center` |  | `React.ReactNode` |
| `showLegend` |  | `boolean` |
| `layout` |  | `'row' \| 'stack'` |

```jsx
<ActivityRings size={176} layout="stack" rings={[
  { label: 'Output', value: 88, tone: 'merah', display: '88%', sub: '142 dari 161' },
  { label: 'Laporan harian', value: 92, tone: 'hijau', display: '92%' },
  { label: 'Tepat waktu', value: 75, tone: 'biru', display: '75%' },
]} />
```

### Heatmap

Kisi kotak membulat yang makin pekat bila nilainya makin tinggi; untuk pola harian (laporan masuk, kehadiran).

**Yang diisi pemakai:** `data` (baris × kolom, `null` = libur), `rowLabels`, `colLabels`, `max`, `cell` (px), `tone`, `label` aksesibel.

- Warna dasar mengikuti aksen. Sel libur bergaris, bukan kosong.
- Selalu tampilkan legenda skala.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `data` | wajib | `(number \| null)[][]` |
| `rowLabels` |  | `string[]` |
| `colLabels` |  | `string[]` |
| `max` |  | `number` |
| `cell` |  | `number` |
| `tone` |  | `ChartTone` |
| `label` |  | `string` |
| `lowLabel` |  | `string` |
| `highLabel` |  | `string` |
| `showLegend` |  | `boolean` |
| `formatCell` |  | `(v: number) => string; className?: string` |

```jsx
<Heatmap data={baris} rowLabels={["Teknologi","Keuangan"]} colLabels={["21","22","23"]} max={100} cell={30} tone="hijau" label="Kepatuhan laporan harian" />
```

### Timeline

Diagram Gantt: satu baris per proyek, batang dari mulai sampai tenggat dengan isian progres bergradien, berlian milestone, dan garis "Hari ini".

**Yang diisi pemakai:** `rows` ({id, label, sub, start, end, progress, status, milestone?}), `span` (jumlah hari), `ticks`, `today`, `title`, `selectedId`/`onSelect`.

- Satuan = hari sejak awal rentang. Maksimal ±10 baris; lebih dari itu, saring.
- Klik baris untuk membuka detail.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `rows` | wajib | `{ id: string; label: string; sub?: string; start: number; end: number; progress?: number; status?: Status; milestone?: number; range?: string }[]` |
| `span` | wajib | `number` |
| `ticks` |  | `{ label: string; at: number }[]` |
| `today` |  | `number` |
| `todayLabel` |  | `string` |
| `title` |  | `string` |
| `selectedId` |  | `string \| null` |
| `onSelect` |  | `(id: string \| null) => void; className?: string` |

```jsx
<Timeline title="Proyek · PIC" span={54} today={7} ticks={[{ label: "28 Sep", at: 0 }, { label: "5 Okt", at: 7 }]}
  rows={[{ id: "p2", label: "Peluncuran Aplikasi Absensi", sub: "Rina Kartika", start: 3, end: 26, progress: 64, status: "risk", milestone: 26 }]}
  selectedId={sel} onSelect={setSel} />
```

### FlowDiagram

Diagram alur bertahap: simpul bulat berikon tersambung garis, dengan keadaan selesai, berjalan, tertahan, berikutnya.

**Yang diisi pemakai:** `steps` ({title, sub?, status, icon?, meta?}), `orientation` (`horizontal` | `vertical`), `label` aksesibel.

- Horizontal untuk alur persetujuan (PIC → Kepala divisi → Direktur → Manajemen); vertikal untuk tahapan proyek di sheet dan ponsel.
- Simpul berjalan bergradien aksen dengan halo; tertahan selalu berlabel alasan.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `steps` | wajib | `{ title: string; sub?: string; status?: 'done' \| 'current' \| 'todo' \| 'blocked'; icon?: IconName; meta?: string }[]` |
| `orientation` |  | `'horizontal' \| 'vertical'` |
| `label` |  | `string` |

```jsx
<FlowDiagram label="Alur laporan" steps={[
  { title: 'PIC proyek', sub: 'Laporan harian', icon: 'catatan', status: 'done' },
  { title: 'Kepala divisi', sub: 'Laporan mingguan', icon: 'persetujuan', status: 'blocked', meta: '2 dari 3 masuk' },
  { title: 'Direktur', icon: 'dokumen', status: 'current' },
  { title: 'Manajemen', icon: 'ringkasan', status: 'todo' },
]} />
```

### DivisionBar

Batang horizontal per divisi berwarna seri data, dengan garis target tegak.

**Yang diisi pemakai:** `name`, `value` (%), `tone` (`data-1…6` sesuai divisi), opsional `target` (%) dan `meta` (angka pembentuk).

- Urutkan dari nilai tertinggi. Nama dan angka selalu tertulis — warna hanya penanda.
- Garis target sama untuk semua baris; sebutkan nilainya di subjudul kartu ("Target 85%").

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `name` | wajib | `string` |
| `value` | wajib | `number` |
| `tone` |  | `Tone` |
| `target` |  | `number` |
| `meta` |  | `string` |

```jsx
<DivisionBar name="Teknologi" value={82} tone="data-1" target={85} meta="31 dari 38 output" />
```

## Daftar & baris

### AttentionItem

Baris yang bisa diklik untuk proyek yang perlu keputusan: ikon status, nama, alasan satu baris, status + tenggat.

**Yang diisi pemakai:** `status` (`late` | `risk`), `title`, `reason` (fakta singkat tanpa menyalahkan orang), `meta` (tenggat atau keterlambatan), `onClick` yang membuka detail.

- Maksimal 3 di dashboard, urut Terlambat → Perlu perhatian → tenggat terdekat.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `title` | wajib | `string` |
| `reason` |  | `string` |
| `status` |  | `Status` |
| `meta` |  | `string` |
| `onClick` |  | `() => void; className?: string` |

```jsx
<AttentionItem status="late" title="Kampanye Media Oktober" reason="Materi video belum disetujui" meta="lewat 5 hari" onClick={buka} />
```

### ProjectRow

Satu baris proyek: nama + divisi, PIC, progres, tenggat, status. Seluruh baris adalah tombol yang membuka detail.

**Yang diisi pemakai:** `name`, `division`, `divisionTone`, `pic`, `initials`, `progress`, `due`, `status`, `selected` (baris yang sedang dibuka di sheet), `onClick`. `compact` untuk mobile (nama, status, progres saja).

- Bungkus tabel desktop dalam wadah `overflow-x: auto` dengan lebar minimum ±720px.
- Tenggat yang sudah lewat berwarna `bahaya` dan tebal.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `name` | wajib | `string` |
| `division` | wajib | `string` |
| `divisionTone` |  | `Tone` |
| `pic` | wajib | `string` |
| `initials` | wajib | `string` |
| `progress` | wajib | `number` |
| `due` | wajib | `string` |
| `status` | wajib | `Status` |
| `selected` |  | `boolean` |
| `compact` |  | `boolean` |
| `onClick` |  | `() => void; className?: string` |

```jsx
<ProjectRow name="Peluncuran Aplikasi Absensi" division="Teknologi" divisionTone="data-1" pic="Rina Kartika" initials="RK" progress={64} due="24 Okt" status="risk" onClick={buka} />
```

### ApprovalItem

Satu permintaan persetujuan dengan tombol Tolak/Setujui di tempat.

**Yang diisi pemakai:** `title` (apa yang disetujui), `requester`, `initials`, `tone`, `time`, opsional `amount`, dan `onApprove`/`onReject` (atau `state` + `onStateChange` untuk dikendalikan).

- Setelah diputuskan, baris meredup dan menampilkan lencana Disetujui/Ditolak; perbarui jumlah di nav dan KPI.
- Untuk Tolak, sediakan kolom alasan di langkah berikutnya bila diperlukan.
- Di mobile pakai `size="md"`.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `title` | wajib | `string` |
| `requester` | wajib | `string` |
| `initials` | wajib | `string` |
| `tone` |  | `Tone` |
| `time` | wajib | `string` |
| `amount` |  | `string` |
| `state` |  | `'pending' \| 'approved' \| 'rejected'` |
| `onStateChange` |  | `(s: 'approved' \| 'rejected') => void; onApprove?: () => void; onReject?: () => void; size?: 'sm' \| 'md'; approveLabel?: string; rejectLabel?: string; approvedLabel?: string; rejectedLabel?: string; className?: string` |

```jsx
<ApprovalItem title="Revisi anggaran Renovasi Ruang IT" requester="Wahyu Hidayat" initials="WH" tone="data-5" time="09.12" amount="Rp 48,5 jt" state={s} onStateChange={setS} />
// Review output kepala divisi:
<ApprovalItem … approveLabel="Terima" rejectLabel="Minta revisi" approvedLabel="Diterima" rejectedLabel="Revisi diminta" />
```

### ActivityItem

Satu kejadian di linimasa: avatar, "Nama + kata kerja + objek", waktu.

**Yang diisi pemakai:** `who`, `initials`, `tone`, `action` (diawali kata kerja aktif, huruf kecil), `time`, dan `last` pada item terakhir (menghapus garis rel).

- Maksimal 5 di dashboard, terbaru di atas.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `who` | wajib | `string` |
| `initials` | wajib | `string` |
| `tone` |  | `Tone` |
| `action` | wajib | `string` |
| `time` | wajib | `string` |
| `last` |  | `boolean` |

```jsx
<ActivityItem who="Sari Wulandari" initials="SW" tone="data-2" action="mengunggah Neraca September" time="14.20" />
```

## Wadah & navigasi

### Card

Wadah `surface` membulat (`radius-lg`, `shadow-card`) yang menjawab satu pertanyaan.

**Yang diisi pemakai:** `title` (frasa singkat), opsional `subtitle` (konteks/periode), `action` (segmented kecil, chip, atau tombol plain), `variant` (`hero` kartu ringkasan, `aurora` kartu ringkasan bercahaya, `gradient` sorotan bergradien aksen dengan teks putih, `malam` kartu gelap premium, `glass` kartu kaca di atas latar bergambar, `inset` area di dalam kartu), `id` untuk tautan nav.

- Jangan menumpuk kartu di dalam kartu; pakai `inset` atau `StatTile`.
- `gradient` dan `malam` paling banyak satu per layar. Jangan beri garis tepi berwarna.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `title` |  | `string` |
| `subtitle` |  | `string` |
| `action` |  | `React.ReactNode` |
| `variant` |  | `'default' \| 'hero' \| 'inset' \| 'aurora' \| 'gradient' \| 'malam' \| 'glass'` |
| `id` |  | `string` |
| `ariaLabel` |  | `string` |
| `children` |  | `React.ReactNode` |

```jsx
<Card title="Kinerja divisi" subtitle="Tepat waktu · target 85%" action={<Button variant="plain" size="sm">Lihat semua</Button>}>…</Card>
```

### Sheet

Panel detail yang terbuka di atas halaman tanpa berpindah halaman.

**Yang diisi pemakai:** `title`, `subtitle`, opsional `eyebrow` (biasanya `StatusBadge`), `variant` (`side` desktop 440px, `form` tablet 600px, `bottom` mobile), `onClose`, `footer` berisi 1–2 tombol, isi.

- Konsumen menyediakan scrim (`scrim`), penempatan, fokus awal, Esc untuk menutup, dan pengembalian fokus.
- Isi detail proyek: progres besar, PIC, tenggat, output, tahapan, catatan terakhir.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `title` | wajib | `string` |
| `subtitle` |  | `string` |
| `eyebrow` |  | `React.ReactNode` |
| `variant` |  | `'side' \| 'form' \| 'bottom'` |
| `modal` |  | `boolean` |
| `onClose` |  | `() => void; footer?: React.ReactNode; children?: React.ReactNode; className?: string` |

```jsx
<Sheet variant="side" title="Peluncuran Aplikasi Absensi" subtitle="Teknologi · PIC Rina Kartika" eyebrow={<StatusBadge status="risk" />} onClose={tutup}
  footer={<><Button variant="secondary" icon="catatan">Kirim catatan</Button><Button variant="primary">Tandai sudah ditinjau</Button></>}>…</Sheet>
```

### NavItem

Satu tautan di sidebar desktop: ikon, label, jumlah opsional.

**Yang diisi pemakai:** `icon`, `label`, `href`, `active`, opsional `count` dan `countTone="accent"` (untuk hal yang menunggu tindakan, mis. Persetujuan).

- Hanya satu item aktif (`aria-current="page"`), berlatar `accent-soft` dan berteks `accent`.
- Maksimal 7 item utama; Pengaturan dan profil di bawah sidebar.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `icon` | wajib | `IconName` |
| `label` | wajib | `string` |
| `href` |  | `string` |
| `active` |  | `boolean` |
| `count` |  | `number \| string` |
| `countTone` |  | `'muted' \| 'accent'` |
| `onClick` |  | `(e: React.MouseEvent) => void; className?: string` |

```jsx
<NavItem icon="persetujuan" label="Persetujuan" href="#persetujuan" count={5} countTone="accent" active={nav === "persetujuan"} />
```

### TabBar

Navigasi utama di mobile (tab bar bawah, kaca buram) dan tablet (`floating`, kapsul mengambang di atas).

**Yang diisi pemakai:** `items` ({value, label, icon, badge}), `value`/`onChange`, `floating` untuk tablet.

- Tepat 4 tab per peran, label satu kata (daftar per peran di `peran/`). Tab yang menunggu tindakan diberi `badge` angka.
- Tab bawah menempel di dasar layar, di atas konten yang digulir, tinggi `tabbar-h` termasuk area aman.

| Prop | Wajib | Tipe |
| --- | --- | --- |
| `items` | wajib | `{ value: string; label: string; icon: IconName; badge?: number \| string }[]` |
| `value` |  | `string` |
| `onChange` |  | `(value: string) => void; floating?: boolean; label?: string; className?: string` |

```jsx
<TabBar floating value={tab} onChange={setTab} items={[
  { value: 'ringkasan', label: 'Ringkasan', icon: 'ringkasan' },
  { value: 'proyek', label: 'Proyek', icon: 'proyek' },
  { value: 'persetujuan', label: 'Persetujuan', icon: 'persetujuan', badge: 5 },
  { value: 'tim', label: 'Tim', icon: 'tim' },
]} />
```
