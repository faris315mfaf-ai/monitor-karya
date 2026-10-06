# 11 · Diagram & visualisasi data

Setiap diagram menjawab **satu pertanyaan**, diberi judul berupa pertanyaan itu, dan angkanya tertulis — warna hanya membantu.

## Memilih diagram

| Pertanyaan | Komponen | Contoh di Monitor Karya |
| --- | --- | --- |
| Seberapa dekat dengan sasaran? (1 angka) | `ProgressRing` | Progres Aplikasi Absensi 64% |
| Seberapa dekat dengan 2–3 sasaran sekaligus? | `ActivityRings` | Output · Laporan harian · Tepat waktu |
| Bagaimana trennya? | `AreaChart` (+ `compare` untuk target/rencana) | Output 8 minggu vs target; progres aktual vs rencana |
| Tren mini di samping angka | `Sparkline` (lewat `StatTile spark`) | Output minggu ini |
| Periode mana yang paling tinggi? | `BarChart` | Output per minggu/bulan/kuartal |
| Bagaimana komposisinya? | `DonutChart` | Status 24 proyek; output aktif per divisi; pengguna per peran |
| Siapa di atas/bawah target? | `DivisionBar` | Tepat waktu per divisi vs 85%; beban kerja per orang vs 80% |
| Kapan saja polanya terjadi? | `Heatmap` | Kepatuhan laporan per divisi per hari; output harian per orang |
| Kapan selesainya, apa yang tumpang tindih? | `Timeline` | Milestone proyek 28 Sep–20 Nov |
| Sudah sampai mana alurnya? | `FlowDiagram` | PIC → Kepala divisi → Direktur → Manajemen; tahapan proyek |

Jangan memakai: pie 3D, radar, gauge setengah lingkaran, grafik batang bertumpuk lebih dari 3 seri, grafik dua sumbu Y.

## Aturan visual

- **Satu sorotan.** Dalam satu grafik hanya satu titik/batang memakai gradien aksen penuh; lainnya `chart-idle`.
- **Gradien** mengalir dari `*-cerah` ke isian: atas → bawah untuk batang, kiri → kanan untuk garis dan progres, diagonal untuk cincin.
- **Label langsung.** Nilai terpilih tampil di gelembung kaca (`glass-tebal`); angka besar di kanan atas kartu mengikuti pilihan.
- **Sumbu tenang.** Garis bantu putus-putus `chart-grid`, tanpa garis sumbu Y; label sumbu `caption` `ink-2`, hanya di ujung bila perlu.
- **Warna divisi tetap** (`data-1…6`). Status memakai warna status. Selain itu, aksen.
- **Maksimal 6 seri**, selebihnya "Lainnya". `AreaChart` maksimal 2 seri (aktual + pembanding putus-putus).
- **Target** ditulis di subjudul kartu ("target 85%") dan digambar sebagai garis tegak 2px `ink` (DivisionBar) atau garis putus-putus (AreaChart).

## Ukuran per perangkat

| Komponen | Desktop | Tablet | Ponsel |
| --- | --- | --- | --- |
| `ActivityRings` hero | 176, `layout="stack"` (legenda di bawah) | 130, legenda samping | 96, `showLegend={false}` + legenda teks manual |
| `ProgressRing` hero | 176 | 120 | 96 |
| `ProgressRing` di sheet | 112 | 120–130 | 96 |
| `BarChart` | tinggi 200–220 | 180 | 160 |
| `AreaChart` | 200–220 | 150–200 | 140–150 |
| `DonutChart` | 150–170 | 150 | 120 |
| `Heatmap` sel | 30–34 | 30 | 26 (label baris disingkat 2–3 huruf) |
| `Timeline` | lebar penuh, tick per minggu | tick per 2 minggu, label singkat | tidak dipakai → daftar milestone bertanggal |
| `FlowDiagram` | horizontal | horizontal (alur), vertikal (tahapan) | vertikal |

## Interaksi & sinkronisasi

| Interaksi | Hasil |
| --- | --- |
| Klik batang (`BarChart`) | Angka besar + label periode di header kartu berganti |
| Klik titik (`AreaChart`) | Gelembung nilai pindah; teks "M41: 31 dari target 38" di header |
| Klik segmen donat | Seluruh halaman tersaring ke kategori itu (mis. divisi); klik lagi untuk lepas |
| Klik baris timeline | Membuka detail proyek (sheet/layar) |
| Ganti periode | Grafik beranimasi ke nilai baru; KPI berbasis waktu ikut |
| Ganti saringan divisi (Direktur) | Cincin, KPI, tren, timeline, tabel, eskalasi ikut tersaring |

Semua elemen pilih adalah `<button>` berlabel ("M41: 142 output"). Komponen dikendalikan (`selectedIndex` + `onSelect`) bila angka di luar grafik ikut berubah.

## Data & perhitungan

- Persen dibulatkan ke bilangan bulat di kartu; satu desimal hanya di laporan.
- Rasio ditulis "x dari y" di samping persen (`sub` di ActivityRings, `meta` di DivisionBar).
- Delta KPI selalu menyebut pembanding: "+9% dari minggu lalu", "+4 poin".
- Naik tidak selalu baik: KPI "Terlambat" yang naik memakai `tone="late"`.
- Hari libur/cuti di peta panas = `null` (sel bergaris), bukan 0.
- Satuan timeline = hari sejak awal rentang; hari ini ditandai garis "Hari ini".
