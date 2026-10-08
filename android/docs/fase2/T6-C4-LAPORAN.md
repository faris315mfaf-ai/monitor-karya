# Laporan T6-C4 — Komponen data Fase 2 (DivisionBar, antrean, papan, cincin)

Disusun agen T6-C4, 8 Oktober 2026. Zona `android/designsystem/src/main/kotlin/id/co/monitorkarya/designsystem/components/` — hanya berkas baru, tidak ada berkas lama yang diubah. Tanpa git/jaringan/DB; Gradle tidak dijalankan (verifikasi kompilasi oleh integrator/CI).

Acuan: `design-system/components/index.d.ts`, `src/components/mk/data.tsx` (DivisionBar, ProgressRing), `design-system/components/bundle.css` (aturan `mk-divbar`, `mk-ring`), `design-system/tokens.css` (`--data-1..6`, `--*-cerah`), `docs/design/13-pola-layar.md` (pola antrean keputusan), komponen F0/F1 (`MkCard`, `MkChip`, `MkButton`, `StatusBadge`, `ProjectRow`, `MkMotion`).

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `components/MkDivisionBar.kt` | Port DivisionBar web + palet seri data divisi + helper publik `nadaDivisi(indeks)` / `nadaDivisiCerah(indeks)` |
| `components/MkQueueItem.kt` | Baris antrean keputusan (avatar inisial, judul bodyStrong + sub footnote, StatusBadge S, slot aksi `RowScope`, varian terpilih accent-soft) |
| `components/MkBoardColumn.kt` | Kolom papan mingguan (judul kecil + kartu inset `MkKartuPapan`: judul, chip status, progres; urut naik/turun via `onNaik`/`onTurun`, tanpa drag-drop) |
| `components/MkRing.kt` | Cincin progres Canvas (isi token + trek fill-1 + persen tabular di tengah; diameter & tebal param; hormati reduced motion) |

## API ringkas

```kotlin
// MkDivisionBar.kt
@Composable fun MkDivisionBar(modifier, nama, nilai: Int, nada: Color = Unspecified,
    nadaAwal: Color = Unspecified, target: Int? = null, meta: String? = null)
@Composable fun nadaDivisi(indeks: Int): Color        // siklus 6 token --data-1..6, ikut tema aktif
@Composable fun nadaDivisiCerah(indeks: Int): Color    // titik awal gradien (padanan --*-cerah)

// MkQueueItem.kt
@Composable fun MkQueueItem(modifier, judul, sub, inisial, status: MkStatus,
    dipilih: Boolean = false, onClick: (() -> Unit)? = null, aksi: @Composable RowScope.() -> Unit = {})

// MkBoardColumn.kt
data class MkKartuPapan(id, judul, status: MkStatus, progres: Int)
@Composable fun MkBoardColumn(modifier, judul, kartu: List<MkKartuPapan>,
    onNaik: ((indeks: Int) -> Unit)? = null, onTurun: ((indeks: Int) -> Unit)? = null)

// MkRing.kt
@Composable fun MkRing(modifier, nilai: Int, diameter: Dp = 160.dp,
    tebal: Dp = Unspecified /* max(6dp, diameter/11) */, warna: Color = Unspecified /* accent-fill */)
```

## Keputusan

1. **MkDivisionBar** — port setia `mk-divbar` bundle.css: baris nama (titik 8dp nada + callout medium) vs nilai kanan (callout semibold tabular), celah 6dp, trek 10dp `fill-1` (bukan fill-2, sesuai CSS web), isi gradien `nadaAwal → nada`, penanda target garis 2dp `ink` menjulur 3dp melewati trek. Nilai >100 tidak dipotong: isi penuh bernada late (gradien merah-cerah → bahaya), angka sebenarnya tetap ditulis, plus ikon peringatan + kata "Lebih x%" berwarna late (kanal warna+ikon+kata). Animasi isi `MkMotion.Data` + `MkEasing.Standard`; `LocalReducedMotion` → `snap()`. A11y: `ProgressBarRangeInfo` 0..max(100, nilai) + contentDescription "nama, x%, … lebih …, target …" (padanan aria web). `.mk-divbar__overmark` web tidak punya aturan CSS (tak terlihat) → sengaja tidak digambar.
2. **nadaDivisi/nadaDivisiCerah** — nilai port satu-satu dari tokens.css (terang + gelap) dengan komentar asal token; siklus modulo 6, indeks negatif aman. Deteksi tema aktif tanpa CompositionLocal baru: `LocalMkColors.current.ink.luminance() > 0.5` (ink hanya terang di tema malam). data-3 dan data-6 tidak punya pasangan `--*-cerah` → gradien datar, sama seperti peta `TONES` web. Param `nada`/`nadaAwal` manual tetap didukung (`Unspecified` → data-1 bawaan web).
3. **MkQueueItem** — mengikuti pola ProjectRow F1 (radius `md`, `heightIn` 44dp, `dipilih` → accent-soft); avatar inisial 32dp accent-soft/aksen sama seperti `AvatarPic` ProjectRow (helper itu private, jadi ada salinan kecil `AvatarInisial` di berkas ini — 12 baris, tidak layak menembus batas zona dengan mengubah ProjectRow). Slot `aksi` dipanggil setelah StatusBadge S; pratinjau mendemokan keputusan di tempat (Setujui/Tolak) sesuai 13-pola-layar.
4. **MkBoardColumn** — kartu papan digambar privat (`KartuPapan`) sebagai inset: `surface-2` + garis 1dp `line` + radius kartu, padanan `Card variant="inset"` web (MkCard F1 belum punya varian; tidak mengubah MkCard karena zona hanya berkas baru — usulan varian dicatat di bawah). Chip status memakai `MkChip` (36dp, titik status tanpa jumlah); progres = trek 4dp `fill-2` + isi `warnaStatus` + persen caption tabular (angka selalu tertulis). Tombol urut 32dp (panah atas/bawah, `Role.Button`, label "Naikkan/Turunkan <judul>", nonaktif di ujung → alpha 0.3); `onNaik`/`onTurun` null → papan statis tanpa tombol. Kolom kosong: kalimat tenang "Belum ada kartu." di wadah inset.
5. **MkRing** — padanan ProgressRing web dalam satu `Canvas`: trek penuh `fill-1` (per spesifikasi tugas; catatan: web memakai warna nada @16% — perbedaan disengaja mengikuti spec T6-C4, keduanya token), isi token dari pukul 12, ujung `StrokeCap.Round`, tebal default `max(6dp, diameter/11)` (rumus web). Angka tengah: display bold tabular 0.24×diameter, floor 12sp, tracking -0.03em hanya ≥20sp (aturan tipografi mk). `mergeDescendants = true` agar teks tengah tidak dibaca ganda. Reduced motion → `snap()` langsung ke nilai.
6. Konvensi umum dipertahankan: `modifier` parameter pertama, komentar Bahasa Indonesia, hanya token (`MkSpacing`/`MkShapes`/`LocalMkColors`/`LocalAccent`), `@PreviewGanda` terang+gelap dibungkus `MKTheme`; pratinjau papan memakai state lokal agar tombol naik/turun bisa dicoba langsung di Studio.

## Verifikasi

- Gradle **tidak** dijalankan (larangan tugas). Pemeriksaan manual: semua impor terpakai dan berurut alfabetis, `toPx()` dipanggil di dalam scope `DrawScope`, `matchParentSize()` dipanggil sebagai anggota `BoxScope` (bukan impor), batas detekt dicek terhadap `android/detekt.yml` (LongMethod <100, LongParameterList ≤7, TooManyFunctions per berkas ≤15).
- Angka token diverifikasi silang ke tokens.css: `--data-*` terang/gelap, `--biru/hijau/ungu/oranye/merah-cerah` terang/gelap, trek divbar 10px/fill-1, penanda target 2px/-3px, ring stroke `size/11` min 6.

## Catatan untuk integrator

- Jalankan `:designsystem:detektMain`/`lintDebug`/`compileDebugKotlin` setelah penggabungan; tidak ada perubahan berkas lama, jadi risiko konflik hanya pada berkas baru.
- Usulan lanjutan (zona lain): tambah `variant` (mis. `inset` → surface-2) pada `MkCard` F1 supaya `KartuPapan` bisa beralih ke MkCard; dan `nadaDivisi` bisa dipindah ke theme/ bila nanti dipakai komponen grafik lain (sekarang disimpan di MkDivisionBar.kt agar tetap berkas baru).
- Jika ingin trek MkRing persis web (nada @16% alih-alih fill-1), cukup ganti satu baris `palet.fill1` di MkRing.kt — telah ditandai komentar.
