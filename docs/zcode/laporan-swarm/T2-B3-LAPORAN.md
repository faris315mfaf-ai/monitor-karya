# Laporan T2-B3 — Audit otomatis warna & invarian aksesibilitas

Dikerjakan Zcode (agen T2-B3), 8 Oktober 2026. Zona: `scripts/qa/audit-warna.mjs`, `tests/qa/warna/audit-warna.test.ts`, dan laporan ini. Cabang `codex/kerja`, tanpa commit. Tidak ada perubahan kode UI/token — temuan kontras hanya dicatat (keputusan desain milik pemilik tokens).

## Metode

Skrip Node murni tanpa dependensi baru (`node scripts/qa/audit-warna.mjs`), mengurai dua sumber:

1. `design-system/tokens.css` — blok `:root, [data-theme="light"]` dan `[data-theme="dark"]`, komentar CSS dibuang sebelum memecah deklarasi (komentar per-baris di tema terang mengandung `;` dan mengganggu pemecahan naif).
2. `design-system/components/bundle.css` — aturan `[data-accent="…"]` yang mengikat ulang `--accent-fill` dan `--on-accent` per aksen (diimpor global lewat `src/app/globals.css`); inilah sumber `--on-accent: var(--on-grafit)` untuk aksen grafit, yang tidak ada di tokens.css.

Alias `var(--x)` diselesaikan berantai sampai hex (`--accent-fill` → `--merah-fill` → `#d11a2a`); jejak rantai disimpan di laporan. Nilai non-hex (rgba, color-mix, oklch) dilaporkan `tidakTerurai` dan tidak pernah dihitung paksa. Rasio dihitung dengan rumus luminansi relatif WCAG 2.1, target 4.5:1 (teks kecil <18px) dan 3:1 (teks besar) sesuai DESIGN.md dan docs/design/09-aksesibilitas.md.

Invarian diverifikasi struktural dengan membaca sumber `src/components/mk/core.tsx`, `data.tsx`, `layout.tsx` (regex atas pola yang memuat makna, bukan sekadar nama). Keadaan kosong diperiksa heuristik pada berkas view yang merender komponen data.

## Hasil ringkas

| Pemeriksaan | Hasil |
|---|---|
| Kontras teks kecil (24 pasangan: 2 tema × (6 netral + 6 aksen)) | 24/24 lolos ≥4.5:1, 0 gagal, 0 tidak terurai |
| Rasio terburuk | 4.66:1 — `--ink-2` di atas `--bg` (light) |
| Invarian warna-tidak-sendirian | 4/4 lolos |
| Keadaan kosong (heuristik) | 5/5 berkas view dengan komponen data punya EmptyNote + penjaga panjang data |

Exit code 0 (`HASIL: LULUS`); exit 1 hanya bila ada kegagalan kontras nyata atau invarian gagal.

## Tabel rasio kontras lengkap (urut dari terburuk)

| # | Rasio | Pasangan | Teks | Latar | Tema |
|---|---|---|---|---|---|
| 1 | 4.66 | `--ink-2` / `--bg` | #6e6e73 | #f5f5f7 | light |
| 2 | 4.71 | `--on-accent` / `--accent-fill` [merah] | #FFFFFF | #e0242f | dark |
| 3 | 4.73 | `--on-accent` / `--accent-fill` [oranye] | #FFFFFF | #c25000 | dark |
| 4 | 4.86 | `--ink-2` / `--surface-2` | #6e6e73 | #fafafc | light |
| 5 | 4.96 | `--on-accent` / `--accent-fill` [biru] | #FFFFFF | #0a6ce0 | dark |
| 6 | 4.96 | `--on-accent` / `--accent-fill` [hijau] | #FFFFFF | #1e8048 | dark |
| 7 | 5.07 | `--ink-2` / `--surface` | #6e6e73 | #ffffff | light |
| 8 | 5.23 | `--on-accent` / `--accent-fill` [oranye] | #FFFFFF | #b84a00 | light |
| 9 | 5.37 | `--on-accent` / `--accent-fill` [ungu] | #FFFFFF | #7a4be0 | dark |
| 10 | 5.40 | `--on-accent` / `--accent-fill` [merah] | #FFFFFF | #d11a2a | light |
| 11 | 5.41 | `--on-accent` / `--accent-fill` [biru] | #FFFFFF | #0a66d6 | light |
| 12 | 5.88 | `--on-accent` / `--accent-fill` [hijau] | #FFFFFF | #1a7340 | light |
| 13 | 6.24 | `--on-accent` / `--accent-fill` [ungu] | #FFFFFF | #6e3fd8 | light |
| 14 | 7.93 | `--ink-2` / `--surface-2` | #aeaeb2 | #19191d | dark |
| 15 | 8.39 | `--ink-2` / `--surface` | #aeaeb2 | #131316 | dark |
| 16 | 9.21 | `--ink-2` / `--bg` | #aeaeb2 | #050506 | dark |
| 17 | 13.41 | `--on-accent` / `--accent-fill` [grafit] | #1d1d1f (on-grafit) | #e5e5ea | dark |
| 18 | 15.46 | `--ink` / `--bg` | #1d1d1f | #f5f5f7 | light |
| 19 | 16.10 | `--ink` / `--surface-2` | #f5f5f7 | #19191d | dark |
| 20 | 16.14 | `--ink` / `--surface-2` | #1d1d1f | #fafafc | light |
| 21 | 16.83 | `--ink` / `--surface` | #1d1d1f | #ffffff | light |
| 22 | 16.83 | `--on-accent` / `--accent-fill` [grafit] | #ffffff (on-grafit) | #1d1d1f | light |
| 23 | 17.03 | `--ink` / `--surface` | #f5f5f7 | #131316 | dark |
| 24 | 18.71 | `--ink` / `--bg` | #f5f5f7 | #050506 | dark |

Semua angka yang beririsan dengan tabel "Kontras yang sudah diperiksa" di `docs/design/02-warna.md` cocok (ink/bg 15.5·18.7; ink/surface 16.8·17.0; ink-2/bg 4.7·9.2; ink-2/surface 5.1·8.4; ink-2/surface-2 4.9·7.9; putih di isian merah 5.4·4.7; biru 5.4·5.0; hijau 5.9·5.0; ungu 6.2·5.4; oranye 5.2·4.7; on-grafit di grafit-fill 16.8·13.4). Audit mereproduksi tabel resmi — tidak ada regresi kontras.

## Temuan

1. **Tidak ada kegagalan kontras.** Seluruh 24 kombinasi yang dipakai UI lolos 4.5:1 di kedua tema, termasuk pasangan tersulit yang disebut docs (mode malam + grafit: teks on-grafit gelap #1d1d1f di atas isian terang #e5e5ea = 13.41:1; malam + merah/oranye = 4.71/4.73:1 — margin tipis tapi lolos, sudah terdokumentasi disengaja di tokens.css dan 02-warna.md).
2. **StatusBadge selalu ikon + kata** (`src/components/mk/core.tsx`): peta `STATUS` mendefinisikan keenam status (`on, risk, late, done, info, neutral`) dengan `label` dan `icon` non-kosong; komponen merender `<Icon name={m.icon}>` tanpa syarat dan teks `{children || m.label}` — children boleh mengganti kata, tetapi tidak pernah menghapusnya.
3. **Heatmap menulis angka untuk pembaca layar** (`src/components/mk/data.tsx`): tabel `mk-sr` dengan `<caption>{label || 'Peta panas'}</caption>`, setiap sel `<td>{cellText(v)}</td>` dengan `cellText` menulis `'libur'` untuk null dan `formatCell(v)` (bawaan `String(v)`) untuk angka; kisi visual `mk-heat__grid` `aria-hidden`; tiap sel punya `title`. Variabel `formatCell` opsional tidak bisa menihilkan angka — bila tidak diberikan, `String(v)` yang dipakai.
4. **AreaChart punya label angka** (`src/components/mk/data.tsx`): tip `mk-area__tip` selalu menampilkan `fmt(data[sel].value)` + satuan untuk titik terpilih, dan setiap tombol titik memuat `aria-label={d.label + ': ' + fmt(d.value) + unit}`; sumbu x menulis label.
5. **Keadaan kosong ditangani EmptyNote** pada semua konsumen komponen data: `companies-view` (ActivityRings), `entities-view` (BarChart), `management-charts` (BarChart, AreaChart, DonutChart — tiap grafik dijaga `length === 0 ? <EmptyNote>`), `projects-view` (Timeline), `role-dashboards` (ActivityRings). Heuristik, lihat keterbatasan.

## Keterbatasan

- Hanya hex `#rgb`/`#rrggbb` yang diurai. `rgba()` (material kaca `--glass*`, `--scrim`), `color-mix()` (sel Heatmap, tone `putih`, kilau/glow), dan `oklch()` (belum dipakai) tidak bisa dihitung statis — pasangan yang bergantung padanya dilaporkan `tidakTerurai`, bukan gagal, dan nilainya tidak dikarang. Saat ini 0 pasangan terlewat.
- Latar bertumpuk (kaca + backdrop blur di atas bg, aurora, gradien) tidak dimodelkan; pasangan dihitung pada permukaan lega sesuai daftar kombinasi resmi.
- Kontras sel peta panas (color-mix aksen↔fill-1 runtime) hanya diverifikasi struktural; angkanya tidak dihitung.
- Pemeriksaan keadaan kosong heuristik pada nama berkas view: penjaga bisa berada di komponen induk di luar berkas yang sama, dan `guard` dicocokkan dari pola `.length` — hasil "perlu tinjauan" bersifat informasi, tidak memengaruhi exit code.
- `--ink-3` (placeholder) memang di bawah 4.5:1 di terang (3.3:1 per 02-warna.md) dan sengaja tidak diaudit sebagai teks informatif — aturan token melarangnya untuk informasi penting.

## Penggunaan

```
node scripts/qa/audit-warna.mjs        # ringkasan + laporan JSON ke stdout; exit 1 bila gagal
npx vitest run tests/qa/warna/audit-warna.test.ts   # 15 tes: matematika WCAG, parsing, angka vs tabel resmi, deteksi kegagalan (token sengaja dilonggarkan), invarian
```

Tes memuat modul skrip langsung (`import` dari `.mjs`, tanpa efek samping karena CLI dijaga `import.meta.url === pathToFileURL(process.argv[1])`) dan menguji bahwa pemeriksa benar-benar bisa gagal: `--ink-2` diganti `#8e8e93` → terdeteksi 3 pasangan gagal; ikon StatusBadge dihapus → invarian gagal; caption Heatmap dihapus → invarian gagal; tip AreaChart dihapus → invarian gagal. `npx tsc --noEmit` dan `npx eslint` bersih untuk kedua berkas baru.

## Berkas berubah

- `scripts/qa/audit-warna.mjs` — baru; skrip audit (parser tokens+bundle, WCAG, invarian, heuristik keadaan kosong).
- `tests/qa/warna/audit-warna.test.ts` — baru; 15 tes vitest mengikuti pola `tests/**` yang ada.
- `docs/zcode/laporan-swarm/T2-B3-LAPORAN.md` — laporan ini.

Tidak ada perubahan pada `tokens.css`, komponen, atau UI lain. Tanpa commit.
