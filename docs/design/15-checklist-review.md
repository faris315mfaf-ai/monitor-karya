# 15 · Daftar periksa review desain

Salin ke deskripsi PR yang mengubah tampilan. Centang semua sebelum minta review.

## Isi & bahasa
- [ ] Layar dibuka dengan satu kalimat jawaban, angka di depan.
- [ ] Judul kartu = pertanyaan yang dijawab kartu itu.
- [ ] Sentence case di judul, tombol, label, tab.
- [ ] Tombol = kata kerja + objek; tidak ada "OK", "Submit", "Klik di sini".
- [ ] Kosakata status tetap (Sesuai jadwal · Perlu perhatian · Terlambat · Selesai · Belum mulai).
- [ ] Format tanggal, jam, angka, rupiah sesuai `01-prinsip-dan-bahasa.md`.
- [ ] Keadaan kosong, semua beres, saringan kosong, galat, dan memuat sudah ditangani.

## Visual
- [ ] Tidak ada warna hex, jarak, radius, atau bayangan hard-code — semua token.
- [ ] UI memakai alias `accent*`, bukan hue langsung.
- [ ] Maksimal satu tombol primer per kartu dan satu kartu bergradien per layar.
- [ ] Status selalu warna + ikon + kata.
- [ ] Warna divisi sesuai `data-1…6`.
- [ ] KPI maksimal 4, delta dengan pembanding.
- [ ] Angka tabular.
- [ ] Jarak kelipatan 4; radius anak = induk − padding.

## Perangkat
- [ ] Diperiksa di 1440, 834, dan 390 px.
- [ ] Desktop: sidebar, isi maks. 1180, baris flex turun rapi.
- [ ] Tablet: tab bar mengambang, detail form sheet.
- [ ] Ponsel: tab bar bawah, detail layar didorong, tombol menempel bawah, target ≥44px.

## Tema & aksen
- [ ] Terang dan malam.
- [ ] Aksen merah, biru, grafit minimal.
- [ ] Malam: aurora, garis rambut kartu, tidak ada hitam/putih murni sebagai blok.

## Aksesibilitas
- [ ] Bisa dipakai penuh dengan keyboard; cincin fokus terlihat.
- [ ] Peran ARIA sesuai tabel di `09-aksesibilitas.md`.
- [ ] Grafik punya angka tertulis dan label per elemen.
- [ ] Sheet: fokus masuk, Esc, fokus kembali.
- [ ] `prefers-reduced-motion` dihormati.
- [ ] Zoom 200% tanpa terpotong.

## Konsistensi lintas peran
- [ ] Angka & status sama dengan yang tampil di peran lain untuk data yang sama.
- [ ] Badge nav/tab, KPI, cincin, dan alur ikut berubah seketika setelah tindakan.
- [ ] Spesifikasi di `peran/` diperbarui bila layar berubah.
