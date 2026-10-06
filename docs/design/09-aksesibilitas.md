# 09 · Aksesibilitas

Target: **WCAG 2.1 AA** di kedua tema dan keenam aksen.

## Kontras

- Teks ≥4.5:1 di tempatnya; teks ≥24px tebal boleh ≥3:1.
- Grafis bermakna (batang, trek progres, cincin, ikon status, batas kontrol) ≥3:1.
- Tabel kontras lengkap per token ada di `02-warna.md` (dihitung dari `tokens.json`). Setiap token warna baru wajib ditambahkan ke tabel itu.
- `ink-3` hanya untuk placeholder dan nonaktif.

## Fokus keyboard

- Cincin `focus` 2px solid dengan jarak 2px, mengikuti aksen. Muncul lewat `:focus-visible` saja.
- Tidak pernah `outline: none` tanpa pengganti.
- Urutan tab mengikuti urutan baca: sidebar → header → kartu ringkasan → kartu berikutnya, kiri ke kanan, atas ke bawah.
- Pintasan: `⌘K` / `Ctrl K` membuka pencarian; `Esc` menutup sheet.

## Target sentuh

- Minimal 44×44px di layar sentuh. Tombol `sm` (32px) hanya di desktop dengan mouse.
- Jarak antar target minimal 8px.

## Status tiga lapis

Warna + ikon + kata, selalu (`StatusBadge`). Titik warna boleh **menambah**, tidak boleh **menggantikan**.

## Elemen asli & peran ARIA

| Elemen | Markup |
| --- | --- |
| Tombol | `<button type="button">` |
| Tautan pindah layar | `<a href>` |
| Kolom isian | `<input>`/`<textarea>` di dalam `<label>` atau dengan `aria-label` |
| Baris proyek/output/anggota yang membuka detail | `<button>` dengan `aria-label="Buka detail …"` |
| Segmented, chip, swatch, panel aksen | `aria-pressed` |
| Nav dan tab aktif | `aria-current="page"` |
| Kotak centang tugas | `role="checkbox"` + `aria-checked` |
| Sakelar pengingat | `role="switch"` + `aria-checked` + `aria-label` |
| Progres | `role="progressbar"` + `aria-valuenow/min/max` + label |
| Sheet / layar detail | `role="dialog"` + `aria-modal="true"` + `aria-label` judul |
| Bagian halaman | `<section aria-label="…">`, `<nav aria-label="Navigasi utama">`, `<main>` |

## Grafik

- Tiap batang, titik, segmen dan baris timeline adalah tombol berlabel: "M41: 142 output", "Teknologi: 38 output aktif".
- Grafik selalu didampingi angka tertulis (angka besar di header kartu, legenda dengan angka).
- Peta panas memberi `title` per sel ("Teknologi 24: 100%") dan label keseluruhan.
- Sediakan ringkasan teks di atas grafik penting (kalimat hero).

## Sheet & layar detail

- Saat dibuka, fokus pindah ke judul; `Esc` dan klik scrim menutup; fokus kembali ke baris asal.
- Fokus terkunci di dalam sheet selama terbuka.
- Di ponsel, tombol "Kembali" di kiri atas dan gestur geser dari tepi kiri.

## Gerak, bahasa, ukuran

- Hormati `prefers-reduced-motion` (sudah di `bundle.css`).
- `<html lang="id">`.
- Teks bisa diperbesar sampai 200% tanpa terpotong: hindari tinggi tetap pada wadah teks; kartu tumbuh mengikuti isi.
- Jangan menyampaikan informasi hanya lewat hover.

## Uji sebelum rilis

- [ ] Navigasi seluruh layar dengan keyboard saja.
- [ ] VoiceOver (macOS/iOS) dan TalkBack (Android) membacakan status, angka KPI, dan tombol keputusan dengan benar.
- [ ] Zoom 200% di desktop, teks besar di ponsel.
- [ ] Mode malam + aksen Grafit + aksen Oranye (pasangan kontras paling tipis).
- [ ] Simulasi buta warna (protanopia/deuteranopia) di layar yang penuh status.
