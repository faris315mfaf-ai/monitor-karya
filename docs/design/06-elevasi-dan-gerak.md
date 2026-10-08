# 06 · Elevasi & gerak

## Empat lapis

| Lapis | Contoh | Permukaan | Bayangan |
| --- | --- | --- | --- |
| 0 — dasar | Latar halaman | `bg` + `aurora` | — |
| 1 — kartu | Kartu, sidebar | `surface` | `shadow-card` |
| 2 — mengambang | Tab bar, popover, menu, panel Tampilan | `glass` + blur 20px | `shadow-float` + sorot atas |
| 3 — modal | Sheet detail, dialog | `surface` di atas `scrim` | `shadow-sheet` |

## Bayangan

| Token | Terang | Malam |
| --- | --- | --- |
| `shadow-card` | `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05)` | garis rambut putih 6% + sorot atas 5% + `0 18px 40px -16px rgba(0,0,0,.7)` |
| `shadow-float` | `0 1px 1px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.12)` | garis 9% + `0 16px 40px rgba(0,0,0,.6)` |
| `shadow-sheet` | `0 24px 64px rgba(0,0,0,.24)` | garis 9% + sorot atas + `0 32px 80px rgba(0,0,0,.75)` |
| `shadow-control` | thumb segmented | garis 10% + `0 2px 6px rgba(0,0,0,.6)` |
| `shadow-glow` | pendar merah | pendar aksen (lihat `--accent-glow`) |

- Bayangan selalu lembut dan lebar. Tidak ada bayangan keras, berwarna (kecuali pendar aksen), atau bertumpuk lebih dari satu lapis per elemen.
- Di mode malam kedalaman dibuat dari **garis rambut dan sorot tepi atas**, bukan bayangan (lihat `08-mode-malam.md`).

## Durasi & kurva

| Token | Nilai | Untuk |
| --- | --- | --- |
| `dur-fast` | 150ms | Efek tekan (skala 0.97), hover |
| `dur-base` | 250ms | Ganti segmented, chip, tab, tema, aksen |
| `dur-slow` | 400ms | Sheet masuk/keluar |
| `dur-data` | 600ms | Batang, progres, cincin, area berubah nilai |
| `ease-standard` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Hampir semuanya |
| `ease-spring` | `cubic-bezier(0.34, 1.3, 0.64, 1)` | Sheet dan tab bar muncul |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elemen keluar layar |

## Pola gerak

| Kejadian | Gerak |
| --- | --- |
| Ganti periode (Minggu/Bulan/Kuartal) | Batang tumbuh dari nilai lama ke nilai baru, angka besar berganti (`dur-data`) |
| Pilih batang/titik grafik | Batang terpilih berganti gradien aksen, gelembung kaca bergeser (`dur-base`) |
| Setujui / tolak | Tombol berganti lencana Disetujui/Ditolak, baris meredup, angka nav & KPI berkurang |
| Buka detail desktop | Sheet samping masuk dari kanan (`dur-slow`, `ease-spring`), scrim memudar |
| Buka detail tablet | Form sheet naik dari bawah dengan skala 0.96 → 1 |
| Buka detail ponsel | Layar didorong dari kanan; geser dari tepi kiri untuk kembali |
| Ganti tema/aksen | Warna berganti `dur-base` di seluruh UI tanpa memuat ulang |
| Centang tugas | Kotak terisi aksen, teks dicoret dan meredup |
| Sakelar pengingat | Tombol bulat bergeser 20px, trek berganti aksen (`dur-base`) |

## Larangan

- Tidak ada animasi berulang, berkedip, berdenyut, atau spinner di kartu. Pemuatan memakai blok kerangka `fill-1` berbentuk isi asli.
- Tidak ada parallax, efek mengetik, atau konfeti.
- Dengan `prefers-reduced-motion: reduce`, matikan transform dan transisi nilai; perubahan terjadi seketika (sudah diatur di `bundle.css`).

## Interaksi kursor — hover dan tekan (8 Oktober 2026)

Umpan balik kursor seragam untuk semua elemen interaktif, memperluas pola yang
sudah ada (`mk-btn:active`, kartu `mk-cocard`): **150 ms (`--dur-fast`) dengan
`--ease-standard`, tanpa pantulan** — cepat terasa, halus mendarat.

| Keluarga | Hover (kursor presisi) | Tekan (`:active`) |
| --- | --- | --- |
| Tombol pil / ikon | membesar `scale(1.02)` / latar `--fill-1` | `scale(0.97)` (bawaan) |
| Chip, segmented, swatch | latar lebih dalam (bawaan) | `scale(0.96)` |
| Tab, menu navigasi | latar (bawaan) | `scale(0.97)` |
| Baris & kartu ketuk (proyek, akun, antrean, perusahaan) | kartu interaktif terangkat 2px + `--shadow-float` | `scale(0.99)` |
| Batang grafik (tombol saring) | (bawaan) | `scale(0.98)` |
| Sel peta panas | hanya bertambah terang (brightness) — data tidak berpindah | — |

Gerak hanya aktif dengan `@media (hover: hover) and (pointer: fine)` dan
`prefers-reduced-motion: no-preference`; pada reduced motion tekanan tetap
terasa lewat perubahan warna/bayangan tanpa gerak. Implementasi:
`src/app/mk-modules.css` seksi "Interaksi kursor".
