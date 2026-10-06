# 13 · Pola layar

Semua dashboard peran dibangun dari pola yang sama. Spesifikasi tiap peran ada di folder `peran/`.

## Kerangka dashboard

1. **Header** — kiri: konteks (`footnote` `ink-2`: tanggal, minggu, divisi) + sapaan `large-title`. Kanan: saringan utama (periode atau divisi), cari, notifikasi, aksi utama peran.
2. **Kartu ringkasan (hero)** — `radius` 32, `background: var(--aurora), var(--surface)`, `shadow-card` + sorot atas, padding 32. Isi:
   - eyebrow kapsul `accent-soft` (konteks: "Minggu ke-41 · 4 proyek aktif"),
   - **kalimat jawaban** `title-1` (angka di depan),
   - kalimat pendukung `body-lg` `ink-2` (apa yang perlu dilakukan),
   - 1 tombol primer + 1 tautan plain,
   - cincin (`ActivityRings` 3 sasaran atau `ProgressRing` 1 sasaran),
   - 4 `StatTile` 2×2 — yang pertama `variant="gradient"` dengan sparkline.
3. **Baris kerja** — kartu yang meminta tindakan (Perlu perhatian, Review, Laporan, Eskalasi, Laporan harian form). Lebar 2:1.
4. **Baris pemahaman** — timeline, tabel, diagram komposisi, tren.
5. **Baris konteks** — kinerja, aktivitas, kehadiran, log.
6. **Detail** — sheet/layar detail; tidak pernah pindah halaman untuk melihat satu item.

## Pola kartu yang dipakai ulang

| Pola | Isi | Peran |
| --- | --- | --- |
| Perlu perhatian | Maks. 3 `AttentionItem`, urut Terlambat → Perlu perhatian → tenggat terdekat | Manajemen |
| Antrean keputusan | `ApprovalItem` dengan keputusan di tempat; label sesuai konteks (Setujui/Tolak, Terima/Minta revisi) | Manajemen, Direktur, Kepala divisi, Admin |
| Laporan masuk | Baris per pengirim: avatar, nama, `StatusBadge` status laporan, waktu, tombol Baca/Ingatkan | Direktur, Kepala divisi, Admin |
| Alur laporan | `FlowDiagram` 4 simpul PIC → Kepala divisi → Direktur → Manajemen | Direktur, Kepala divisi, PIC |
| Timeline proyek | `Timeline` + klik baris → detail | Manajemen, Direktur, Kepala divisi |
| Tabel/kartu proyek | `ProjectRow` + `Chip` status | Manajemen, Direktur, Kepala divisi |
| Kinerja vs target | `DivisionBar` + target | Manajemen, Direktur, Kepala divisi |
| Tren vs target | `AreaChart` + `compare` | Direktur, Kepala divisi, PIC |
| Peta pola harian | `Heatmap` | Kepala divisi, Admin |
| Aktivitas | Maks. 5 `ActivityItem`, terbaru di atas | Manajemen, Kepala divisi, Admin |
| Form laporan | Daftar centang tugas + kendala + rencana besok + Kirim | PIC |
| Percakapan | Gelembung kiri (orang lain, `fill-1`) / kanan (saya, `accent-fill`) + kolom balas | PIC |
| Sakelar aturan | Judul + penjelasan + `role="switch"` | Admin |
| Ubin data induk | Ikon kotak `accent-soft` + angka 30 + label + sub | Admin |

## Detail (sheet)

| Jenis | Isi | Aksi |
| --- | --- | --- |
| Proyek | `ProgressRing` + status + "x dari y output" + tenggat; `FlowDiagram` vertikal tahapan; catatan terakhir PIC | Kirim catatan · Tandai sudah ditinjau |
| Laporan mingguan divisi | Status, 3 angka (Output, Tepat waktu, Kendala), poin utama, kotak kendala `waspada-soft` | Beri tanggapan · Tandai sudah dibaca |
| Laporan belum masuk | Lencana "Belum masuk", kalimat tenggat, status pengingat | Hubungi … · Ingatkan kepala divisi |
| Laporan harian anggota | Status, beban kerja (DivisionBar), dikerjakan hari ini, kendala, rencana besok | Kirim catatan · Tandai sudah dibaca / Ingatkan |
| Divisi (kepatuhan) | Laporan harian x dari y, status mingguan, peta panas 10 hari, daftar belum lapor + Ingatkan per orang | Hubungi kepala divisi · Ingatkan semua |
| Output | Status, deskripsi, catatan revisi (`waspada-soft`), daftar bukti / area unggah | Tanya kepala divisi · Unggah bukti & kirim |

Tahapan proyek bawaan: Perencanaan → Pelaksanaan tahap 1 → Pelaksanaan tahap 2 → Serah terima. Tahap berjalan = `current` bila proyek sesuai jadwal, `blocked` bila tidak, dengan `meta` alasan ("Tertahan", "Lewat tenggat").

## Keadaan

| Keadaan | Tampilan |
| --- | --- |
| Memuat | Blok kerangka `fill-1` seukuran isi asli, tanpa spinner |
| Kosong wajar | Kalimat tenang + aksi ("Belum ada proyek terlambat.") |
| Semua beres | Ikon centang `sukses` + kalimat ("Semua permintaan sudah diproses.") |
| Saringan kosong | "Tidak ada … dengan status ini." di dalam kartu |
| Galat | Kalimat galat + "Coba lagi" di kartu yang gagal saja; kartu lain tetap tampil |
| Setelah aksi | Baris meredup + lencana hasil; angka di nav, tab, KPI, cincin, alur ikut berubah seketika |

## Aturan isi

- **KPI maksimal 4** per kelompok; delta selalu dengan pembanding.
- **Daftar di dashboard maksimal 5–8** baris + "Lihat semua".
- **Setiap angka bisa diklik** menuju daftar pembentuknya.
- **Periode** hanya memengaruhi kartu berbasis waktu; status proyek selalu "hari ini".
- **Satu tombol primer per kartu**, satu kartu bergradien per layar.
- **Keputusan di tempat** — tidak ada halaman konfirmasi untuk Setujui/Terima; Tolak/Minta revisi boleh meminta alasan di langkah berikut.
- **Konsistensi lintas peran** — data yang sama tampil dengan angka, status, dan kata yang sama di semua peran (lihat `peran/00-alur-antarperan.md`).
