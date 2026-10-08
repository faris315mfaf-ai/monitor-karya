# DESIGN.md — Monitor Karya

Monitor Karya adalah aplikasi pemantauan kerja berbasis output untuk lima peran: **Manajemen, Direktur, Kepala divisi, Admin PT, PIC proyek**, di desktop, tablet, dan ponsel. Berkas ini adalah pintu masuk panduan desain. Detail lengkap ada di [`docs/design/`](docs/design/README.md), nilai visual di [`design-system/`](design-system/README.md).

## Rasa yang dituju

Bersih, tenang, terang seperti antarmuka Apple. Ruang lega, huruf SF besar, material kaca, gradien yang bercahaya di titik fokus, diagram yang hidup. Merah-putih adalah identitas, bukan dekorasi. Teks lugas dan mudah dibaca. Tidak kaku korporat.

## Sembilan prinsip

1. **Jawaban dulu, detail kemudian** — setiap layar dibuka dengan satu kalimat: "18 dari 24 proyek berjalan sesuai rencana."
2. **Tenang secara bawaan, tegas saat perlu** — aksen hanya untuk aksi utama, posisi aktif, satu sorotan per kartu.
3. **Satu kartu, satu pertanyaan.**
4. **Warna tidak pernah sendirian** — status = warna + ikon + kata.
5. **Bisa disentuh dan dibaca** — 44px, 12px, 4.5:1.
6. **Gradien adalah cahaya** — aurora di judul, gradien di cincin & batang terpilih, satu kartu sorotan.
7. **Diagram menjawab satu pertanyaan** — angka selalu tertulis.
8. **Gerak menjelaskan, bukan menghibur.**
9. **Malam adalah ruangan gelap, bukan warna terbalik.**

## Inti sistem dalam satu layar

| Hal | Aturan |
| --- | --- |
| Tema | `data-theme="light"` / `"dark"` di `<html>` |
| Aksen | `data-accent="merah"` (bawaan) · `biru` · `hijau` · `ungu` · `oranye` · `grafit` — UI memakai `--accent`, `--accent-fill`, `--accent-soft`, `--on-accent` |
| Netral | `bg` · `surface` · `surface-2` · `fill-1` · `fill-2` · `line` · `ink` · `ink-2` · `ink-3` |
| Status | Sesuai jadwal `sukses` · Perlu perhatian `waspada` · Terlambat `bahaya` · Selesai · Belum mulai |
| Divisi | Teknologi `data-1` · Keuangan `data-2` · Media `data-3` · SDM `data-4` · Operasional `data-5` · Hukum `data-6` |
| Huruf | SF Pro / Geist; skala `large-title 40` · `title-1 34` · `title-2 28` · `title-3 20` · `body 15` · `footnote 13` · `caption 12`; angka tabular |
| Spasi | kelipatan 4 · dalam kartu 16 · padding kartu 24/20 · antar kartu 24/16 · antar bagian 40 |
| Radius | 6 · 10 · 14 · **22 kartu** · 28 sheet · penuh untuk tombol/chip/lencana |
| Elevasi | kartu `shadow-card` · mengambang `glass` + `shadow-float` · modal `shadow-sheet` di atas `scrim` |
| Gerak | 150 / 250 / 400 / **600 data**; `ease-standard`; hormati reduced motion |
| Perangkat | Desktop ≥1024 sidebar 248 · Tablet 600–1023 tab bar mengambang · Ponsel <600 tab bar bawah 4 tab |
| Detail | Sheet samping 440 (desktop) · form sheet (tablet) · layar didorong (ponsel) |
| Bahasa | "Anda", sentence case, angka di depan, tombol kata kerja + objek, tanpa tanda seru/emoji |

## Layar per peran

| Peran | Kalimat pembuka | Tab tablet & ponsel | Spesifikasi |
| --- | --- | --- | --- |
| Manajemen | 18 dari 24 proyek berjalan sesuai rencana. | Ringkasan · Proyek · Persetujuan · Tim | [peran/01](docs/design/peran/01-manajemen.md) |
| Direktur | 5 dari 8 proyek berjalan sesuai rencana. | Ringkasan · Proyek · Eskalasi · Divisi | [peran/02](docs/design/peran/02-direktur.md) |
| Kepala divisi | Divisi Teknologi menyelesaikan 31 output minggu ini. | Ringkasan · Review · Tim · Proyek | [peran/03](docs/design/peran/03-kepala-divisi.md) |
| Admin PT | 92% laporan harian sudah masuk hari ini. | Ringkasan · Kepatuhan · Akses · Data | [peran/04](docs/design/peran/04-admin-pt.md) |
| PIC proyek | Aplikasi Absensi 64% selesai. | Hari ini · Output · Laporan · Catatan | [peran/05](docs/design/peran/05-pic-proyek.md) |

Alur laporan yang menghubungkan semuanya: **PIC proyek → Kepala divisi → Direktur → Manajemen** ([peran/00](docs/design/peran/00-alur-antarperan.md)).

## Mulai dari mana

1. Pasang `design-system/tokens.css` dan `design-system/components/bundle.css` ([14 · Implementasi](docs/design/14-implementasi.md)).
2. Tempel [ringkasan untuk agen AI](docs/design/ringkas-untuk-agen-ai.md) ke `CLAUDE.md` bila memakai Claude Code.
3. Bangun beranda per peran mengikuti berkas `peran/`, mulai dari Manajemen.
4. Setiap PR tampilan memakai [daftar periksa](docs/design/15-checklist-review.md).

Mockup interaktif: https://claude.ai/artifact/PJAEiMooWhxXKtNbJAhuv9 · Design system: https://claude.ai/artifact/9woJ6zAAeXrZyb6hhQUtMz (privat; bagikan lewat Share bila perlu).
