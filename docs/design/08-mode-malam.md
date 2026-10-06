# 08 · Mode malam

Mode malam bukan kebalikan warna terang. Layar dibuat seperti ruangan gelap dengan satu sumber cahaya: tinta hampir hitam, kartu yang sedikit terangkat, dan cahaya berwarna aksen yang jatuh dari kiri atas. Angka dan teks tetap paling terang di layar.

Aktifkan dengan `data-theme="dark"` di wadah terluar. Semua token di bawah otomatis berganti; komponen tidak perlu diubah.

## Lima lapis kegelapan

| Lapis | Token | Nilai malam | Untuk |
| --- | --- | --- | --- |
| 0 | `bg` | #050506 | Latar halaman, selalu bersama `aurora` |
| 1 | `surface` | #131316 | Kartu, sidebar, sheet |
| 2 | `surface-2` | #19191D | Area tenang di dalam kartu |
| 3 | `fill-1` | #212126 | Kontrol: tombol sekunder, kolom cari, segmented |
| 4 | `fill-2` | #2C2C32 | Trek progres dan cincin, thumb segmented terpilih |

Kedalaman di malam hari dibuat oleh **cahaya, bukan bayangan**:

- `shadow-card` = garis rambut putih 6% + sorot 1px di tepi atas + bayangan hitam lebar di bawah. Kartu terlihat seperti kaca gelap yang menangkap cahaya dari atas.
- `shadow-float` dan `shadow-sheet` menaikkan garis rambut ke 9%.
- Sheet memakai gradien halus #1B1B20 → #131316 supaya terasa lebih dekat dari kartu di belakangnya.

## Aurora berwarna aksen

Di mode malam `aurora` mengikuti `data-accent`: cahaya aksen 30% di kiri atas, nebula ungu 18% di kanan atas, pantulan biru 8% di bawah. Ganti aksen ke Biru dan seluruh suasana layar ikut menjadi biru, tanpa mengubah warna status.

Di tema terang aurora juga mengikuti aksen, tetapi hanya 16% dan tanpa nebula.

Wadah bertema bisa bersarang: kartu `data-theme="light"` di dalam halaman malam tetap terang lengkap dengan aurora dan pendarnya sendiri.

`--nebula` (khusus malam) adalah versi yang lebih pekat untuk kartu sampul dan layar kosong.

## Pendar

| Elemen | Perlakuan malam |
| --- | --- |
| Tombol primer | Pendar aksen 70% di bawah tombol |
| StatTile gradien | Pendar aksen 65%, sorot tepi atas putih 22% |
| Cincin aktivitas & progres | `drop-shadow` 14px warna aksen 28% |
| Nav & tab aktif | Garis dalam aksen 22% di atas `accent-soft` |
| Logo | Garis rambut putih 10% + `accent-glow` |

Pendar hanya untuk elemen beraksen. Kartu biasa, teks, dan status tidak pernah berpendar.

## Kontras (diukur di nilai malam)

| Pasangan | bg | surface | fill-1 |
| --- | --- | --- | --- |
| `ink` | 18.7 | 17.0 | 14.7 |
| `ink-2` | 9.2 | 8.4 | 7.2 |
| `merah` | 7.2 | 6.6 | 5.7 |
| `sukses` / `waspada` / `bahaya` | 10.6 / 11.4 / 7.3 | 9.6 / 10.4 / 6.7 | 8.3 / 9.0 / 5.8 |
| `biru` / `ungu` / `oranye` | 7.8 / 8.9 / 10.0 | 7.1 / 8.1 / 9.1 | 6.1 / 7.0 / 7.9 |
| `line-strong` / `chart-idle` (grafis) | 3.9 | 3.6 / 3.5 | 3.1 |
| Putih di isian aksen | merah 4.7 · biru 5.0 · hijau 5.0 · ungu 5.4 · oranye 4.7 | | |

## Aturan

- Jangan pakai hitam murni #000 untuk kartu; kartu hitam di atas latar hitam kehilangan bentuk.
- Jangan pakai putih murni untuk blok besar. Chip terpilih (#F5F5F7 di atas tinta) adalah satu-satunya permukaan terang.
- Satu sumber cahaya per layar: aurora kiri atas + satu kartu bergradien. Jangan tambahkan pendar di setiap kartu.
- Grafik memakai hue versi malam (`data-1`…`data-6`) yang lebih terang; batang tidak terpilih tetap `chart-idle`.
- Gambar dan foto diberi garis rambut `line` agar tidak "melayang" di latar gelap.
- `color-scheme: dark` sudah diset, jadi kolom input, textarea, dan scrollbar bawaan ikut gelap.

## Menerapkan di aplikasi

```js
// Bawaan mengikuti sistem, pilihan pengguna disimpan di profil (bukan hanya di perangkat).
const pref = user.preferences.theme ?? 'system';           // 'light' | 'dark' | 'system'
const sistemGelap = matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = pref === 'system' ? (sistemGelap ? 'dark' : 'light') : pref;
document.documentElement.dataset.accent = user.preferences.accent ?? org.accent ?? 'merah';
```

- Saklar ada di panel **Tampilan**: `SegmentedControl` Terang/Gelap (tambahkan "Sistem" di aplikasi nyata) + `AccentPicker`. Desktop: bagian bawah sidebar. Tablet: menu profil. Ponsel: tab terakhir → Tampilan.
- Pasang atribut **sebelum** halaman pertama dirender (skrip kecil di `<head>`) agar tidak berkedip putih.
- Grafik yang digambar dengan kanvas/pustaka luar membaca warna dari `getComputedStyle(document.documentElement).getPropertyValue('--data-1')` dan menggambar ulang saat tema berganti.
- Ekspor PDF dan email selalu memakai tema terang.

## Daftar periksa layar malam

- [ ] Akar halaman memakai `background: var(--aurora), var(--bg)`.
- [ ] Tidak ada `#000`, `#fff`, atau abu-abu hex di halaman — semua lewat token.
- [ ] Kartu memakai `surface` + `shadow-card` (bukan border abu-abu sendiri).
- [ ] Hanya satu kartu bergradien; pendar hanya di elemen beraksen.
- [ ] Gambar/foto diberi garis `line`.
- [ ] Teks kecil di atas kaca minimal 15px `ink`.
- [ ] Diuji dengan keenam aksen, terutama Grafit (isian terang, teks gelap).
