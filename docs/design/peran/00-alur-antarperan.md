# 00 · Alur antarperan

Lima peran melihat **data yang sama dari ketinggian berbeda**. Angka, status dan kata untuk satu hal harus identik di semua layar.

## Hierarki

```
Manajemen ─ seluruh perusahaan (3 entitas, 6 divisi, 24 proyek, 50 orang)
   └─ Direktur ─ beberapa divisi (contoh: Teknologi, Operasional, Media)
        └─ Kepala divisi ─ satu divisi (contoh: Teknologi, 7 orang, 4 proyek)
             └─ PIC proyek ─ satu proyek (contoh: Peluncuran Aplikasi Absensi)
Admin PT ─ lintas divisi, mengurus kepatuhan laporan, akun, akses, data induk
```

## Alur laporan

| # | Dari | Ke | Isi | Tenggat | Komponen penanda |
| --- | --- | --- | --- | --- | --- |
| 1 | PIC proyek | Admin PT | Laporan harian: progress dicentang, kendala, rencana besok, foto. Kepala divisi **hanya melihat** laporan anggotanya | Hari kerja 17.00 WIB | `FlowDiagram` simpul `catatan` |
| 1a | Admin PT | Holding | Meneruskan laporan harian yang masuk; setelah diteruskan laporan **dibekukan** | Hari yang sama | Penerimaan (`/api/inbox`) |
| 2 | PIC / anggota | Kepala divisi | Output + bukti untuk direview | Sesuai tahapan | Status output |
| 3 | Kepala divisi | PIC | Terima / Minta revisi + catatan | — | `ApprovalItem` |
| 4 | Kepala divisi | Direktur | Laporan mingguan (disusun otomatis dari laporan harian & output diterima) | Serah Kamis 17.00, kunci Jumat 17.00 WIB | simpul `persetujuan` |
| 5 | Kepala divisi | Direktur | Eskalasi keputusan di atas wewenangnya | — | `ApprovalItem` di Eskalasi |
| 6 | Direktur | Manajemen | Ringkasan direktorat | Senin 12.00 | simpul `dokumen` |
| 7 | Siapa saja | Manajemen | Persetujuan (anggaran, materi, kontrak, cuti) | — | `ApprovalItem` di Persetujuan |
| 8 | Sistem / Admin | Semua | Pengingat otomatis & manual | 16.30, Jumat 13.00 | Sakelar pengingat |

Simpul alur selalu memakai urutan dan ikon yang sama: **PIC proyek** `catatan` → **Kepala divisi** `persetujuan` → **Direktur** `dokumen` → **Manajemen** `ringkasan`.

Alur laporan harian di layar PIC memakai simpul: Isi laporan `catatan` → Terkirim ke Admin PT → Diteruskan ke holding → Laporan mingguan `laporan`.

## Siklus status

**Proyek:** Belum mulai → Sesuai jadwal ↔ Perlu perhatian → Terlambat → Selesai.

**Output:** Belum mulai → Dikerjakan → Menunggu review → Diterima (selesai) atau Perlu revisi → Dikerjakan …

| Status output | Lencana | Siapa yang mengubah |
| --- | --- | --- |
| Belum mulai | `neutral` | — |
| Dikerjakan | `on` | PIC mulai |
| Menunggu review | `info` | PIC unggah bukti & kirim |
| Diterima | `done` | Kepala divisi Terima |
| Perlu revisi | `risk` | Kepala divisi Minta revisi |

**Laporan harian:** Belum dikirim (`late` setelah tenggat) → Terkirim ke Admin PT (`done`) → Diteruskan ke holding (`done`, **dibekukan**). Cuti = `neutral` "Cuti", tidak dihitung dalam penyebut.

**Pembekuan & buka kunci laporan harian:**
- Laporan bisa diubah dan dikirim ulang PIC sampai salah satu terjadi: tenggat 17.00 WIB lewat, atau Admin PT meneruskannya ke holding.
- Diteruskan = dibekukan: API menolak perubahan (laporan dan progress hari itu) dengan 409 "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya." Laporan yang sudah diteruskan tidak bisa dihapus.
- Jalan satu-satunya adalah buka kunci. PIC (untuk laporan proyeknya) atau Admin PT mengajukan. Direksi holding (Direktur SDM & GA) atau TI menyetujui. TI menjalankannya, paling lama 72 jam (bawaan 24 jam).
- Selama dibuka, PIC boleh mengubah dan mengirim ulang, juga untuk tanggal lampau yang dibuka. Setiap perubahan tercatat di log aktivitas beserta id buka kuncinya. Setelah masa buka habis, laporan dikunci kembali otomatis (cron).
- Lencana: Buka kunci diajukan (`info`) → Disetujui · menunggu Tim TI (`info`) → Dibuka sampai … (`info`).

**Laporan mingguan:** Draf (`info`) → Terkirim (`done`) / Terlambat masuk (`risk`) / Belum masuk (`late`) → Sudah dibaca.

**Keputusan:** Menunggu → Disetujui / Ditolak (Eskalasi & Persetujuan), Menunggu review → Diterima / Revisi diminta (Review output), Menunggu → Disetujui / Ditolak (Akses).

## Satu kejadian, lima layar

Contoh nyata dari mockup — Rina Kartika belum mengirim laporan harian dan uji coba gelombang 2 tertahan:

| Peran | Yang terlihat |
| --- | --- |
| PIC (Rina) | Lencana "Laporan hari ini · Belum dikirim", form laporan, tahap "Uji coba gelombang 2" `blocked` "Perangkat terlambat" |
| Kepala divisi (Andi) | Laporan harian 4 dari 5 masuk, Rina "Belum masuk" + tombol Ingatkan; beban kerja Rina 105%; Aplikasi Absensi "Perlu perhatian" |
| Admin PT (Maya) | Divisi Teknologi 5 dari 6, "1 belum"; di detail: Rina, "Terakhir lapor Jumat" + Ingatkan |
| Direktur (Hadi) | Eskalasi "Geser rilis Aplikasi Absensi ke 31 Okt" dari Andi; proyek berstatus Perlu perhatian |
| Manajemen | Aplikasi Absensi di "Perlu perhatian": "Uji coba mundur 4 hari"; laporan harian "Belum dikirim" di detail proyek |

Setelah Andi menekan **Ingatkan**, semua tempat yang menampilkan status laporan Rina berganti "Diingatkan" (`info`). Setelah Rina mengirim, semua berganti "Terkirim".

## Aturan konsistensi

- Satu sumber data per konsep; layar tidak menghitung ulang dengan rumus sendiri.
- Hitungan di nav, tab badge, KPI, cincin, dan alur berubah **seketika** setelah tindakan.
- Penyebut rasio dijelaskan ("Fajar cuti" sebagai `sub` cincin).
- Nama orang selalu nama lengkap di daftar, nama depan di kalimat ("Ingatkan Rina").
- Warna avatar = warna divisi orang tersebut; pengguna yang login = `accent`.
