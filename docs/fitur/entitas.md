# Entitas

[← Indeks](README.md)

## Tujuan

Peta organisasi grup: holding → sub-holding → sektor → wilayah → PT → unit, beserta kepatuhan pelaporan tiap PT dan aktivitasnya. Kalimat pembuka menjawab berapa PT yang perlu perhatian dalam kepatuhan.

## Siapa memakai

| Peran | Cakupan |
| --- | --- |
| Direktur entitas | PT-nya dan semua yang di bawahnya; pohon berakar di PT itu |
| Direksi SDM & GA, Manajemen, Auditor, TI, Super Admin | seluruh grup |

## Alur di layar

1. **Header dan hero.** `PageHeader`, lalu `Hero` dengan kalimat jawaban dan 4 KPI: jumlah PT, rata-rata kepatuhan, laporan tertunda, terlambat hari ini.
2. **Papan aktivitas per perusahaan** (`EntityActivityBoard`). Isinya, per PT, apa yang dikerjakan proyek-proyeknya (tugas, laporan harian, laporan kemajuan) dan divisi-divisinya (item mingguan) pada periode terpilih.
   - Kadens Harian, Mingguan, atau Bulanan, dengan tombol periode sebelum/berikut dan pilihan tanggal.
   - Saringan prioritas: Semua, Kritis, Tinggi, Sedang, Rendah. Saringan ini hanya berlaku pada hal yang membawa prioritas, jadi laporan proyek disembunyikan saat saringan aktif.
   - Urgensi ditampilkan sebagai titik berwarna + kata, dengan tepi kartu berwarna. Hitungan masalah memakai `StatusBadge`.
3. **Pohon organisasi** (`.mk-tree`):
   - cari, buka semua, tutup semua;
   - cabang yang tertutup diberi `inert`;
   - pesan bila pencarian tidak menemukan apa pun.
4. **Ketuk PT** untuk membuka Sheet lebar. Isinya:
   - jalur organisasi dan 4 `StatTile`;
   - `BarChart` 7 laporan terakhir;
   - divisi dan proyek;
   - laporan harian & mingguan terbaru;
   - penunjukan Admin PT (`AdminAppointment`: utama/pengganti, nomor SK, masa berlaku).

## Aturan bisnis

- **Cakupan.** Pohon dibatasi `Entity.path`. Peran berlingkup hanya boleh membuka entitasnya sendiri atau yang di bawahnya. Parameter kueri hanya bisa **mempersempit** pandangan peran grup, tidak pernah melebarkan pandangan peran berlingkup.
- **Ringkasan KPI bulan berjalan per PT** diambil dari `KpiSnapshot` (`periodType = BULANAN`):
  - kepatuhan harian tepat waktu;
  - kelengkapan mingguan;
  - kelengkapan bukti;
  - skor kepatuhan 0–100.

## Endpoint

| Metode & path | Parameter | Jawaban | Izin |
| --- | --- | --- | --- |
| `GET /api/entities` | — | pohon entitas; tiap PT membawa ringkasan KPI bulan ini | cakupan entitas |
| `GET /api/entities/[id]` | — | detail entitas: statistik, divisi, proyek, laporan terbaru, penunjukan admin | entitas sendiri atau turunannya |
| `GET /api/entity-activity` | `?cadence=HARIAN\|MINGGUAN\|BULANAN&date=YYYY-MM-DD&priority=ALL\|KRITIS\|TINGGI\|SEDANG\|RENDAH` | satu bagian per PT: proyek (tugas, laporan) dan divisi (item mingguan) | cakupan entitas |
| `GET /api/late-incidents` | `?entityId&cycle&minOccurrence&page&pageSize` | kejadian terlambat per PT | cakupan entitas |
| `GET /api/compliance-map` | `?scopeEntityId=` | data peta kepatuhan hierarkis (belum dipakai layar) | cakupan entitas |

## Berkas kode utama

- [`src/components/views/entities-view.tsx`](../../src/components/views/entities-view.tsx), [`entity-activity-board.tsx`](../../src/components/views/entity-activity-board.tsx), CSS [`app/css/admin-sistem.css`](../../src/app/css/admin-sistem.css)
- [`src/app/api/entities/route.ts`](../../src/app/api/entities/route.ts), [`src/app/api/entities/[id]/route.ts`](../../src/app/api/entities/[id]/route.ts), [`src/app/api/entity-activity/route.ts`](../../src/app/api/entity-activity/route.ts)

## Catatan terbuka

- `/pratinjau` belum punya data contoh untuk `/api/entities` dan `/api/entities/[id]`.
- `KpiSnapshot` diisi data seed/skrip. Belum ada pekerjaan terjadwal yang memperbaruinya.
