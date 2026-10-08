# Laporan T5-B3 — Komponen designsystem Fase 1 (segmented, list row, field, pilih, lampiran, FAB, snackbar)

Disusun agen T5-B3-ULANG, 8 Oktober 2026. Zona tulis: `android/designsystem/src/main/kotlin/id/co/monitorkarya/designsystem/components/` (7 berkas bernama persis) + dokumen ini. Tanpa git/jaringan/DB. Acuan: komponen F0 di folder itu, `design-system/components/index.d.ts`, port lokal T5-B5 di `app/ui/laporan/LaporanHarianScreen.kt`, dan pemanggilan nyata layar F1/F2 (akun, penerimaan, kepatuhan, tim, mingguan, RingkasanDirekturSheet).

## Keadaan zona saat sesi ini mulai

Zona **tidak kosong**: sesi T5-B3 sebelumnya putus setelah menulis ketujuh berkas (stempel 20:55–21:09) tetapi sebelum verifikasi kompilasi dan sebelum laporan. Sesi ini: memverifikasi semuanya terhadap pemanggil nyata, memperbaiki 2 peringatan deprekasi, dan menulis laporan ini. Tidak ada berkas baru lain yang dibuat.

| Berkas | Isi (semuanya @PreviewGanda, modifier parameter pertama, hanya token) |
|---|---|
| `MkSegmented.kt` | `data MkOpsi(value, label, count: Any? = null)` + `MkSegmentedControl(modifier, options, terpilih, onPilih)` — kapsul fill-1, opsi aktif ink/surface, tekan 0.96, `selectableGroup`, lencana count berlatar surface |
| `MkListRow.kt` | `MkListRow(modifier, judul, sub, inisial, trailing, onClick)` + `MkAvatar(modifier, inisial, ukuran)` publik (dipakai AkunScreen 56dp) — avatar accent-soft, judul bodyStrong, sub footnote maks 2 baris, tinggi sentuh ≥44dp, radius-md |
| `MkField.kt` | `MkField(modifier, nilai, onUbah, label, placeholder, baris=1, isError, supportingText, enabled)` — OutlinedTextField radius-md (padanan --radius-md web), batas line-strong (line hanya nonaktif), aksen fokus, galat statusLate, `baris>1` multiline kapitalisasi kalimat |
| `MkPilih.kt` | `MkPilih(modifier, pilihan, terpilih: MkOpsi?, onPilih: (MkOpsi) -> Unit, label, placeholder, enabled)` — ExposedDropdownMenuBox read-only bergaya token, panah berputar 180° (hormati LocalReducedMotion), opsi terpilih centang aksen |
| `MkLampiran.kt` | `MkLampiranRow(modifier, namaBerkas, ukuranLabel, sedangUnggah, onHapus)` + `MkProgresUnggah(modifier, persen: Int)` — ikon sisipan, chip ukuran kapsul fill-1, saat mengunggah label "Mengunggah…" + trek indeterminate, hapus 32dp tekan 0.94; progres determinate dipaksa 0..100 |
| `MkFAB.kt` | `MkFAB(modifier, label, ikon, onClick, enabled)` — kapsul accent-fill 52dp tinggi, teks on-accent, bayangan 6dp, tekan 0.97, nonaktif meredup 0.4; posisi diatur pemanggil |
| `MkSnackbar.kt` | `suspend tampilkanUrungkan(snackbarHostState, pesan, labelUrungkan="Urungkan", onUrungkan): SnackbarResult` — durasi Long, `onUrungkan` hanya saat aksi ditekan + `MkSnackbarHost(modifier, snackbarHostState)` — latar surface, garis line, aksi aksen |

Perbaikan sesi ini: `MkFAB.kt` dan `MkListRow.kt` pratinjau memakai `Icons.AutoMirrored.Outlined.Send/KeyboardArrowRight` (sebelumnya `Icons.Outlined.*` → peringatan deprekasi; AutoMirrored benar untuk RTL).

## Penyesuaian tanda tangan vs teks tugas (diputuskan mengikuti pemanggil nyata)

Teks tugas menyebut `terpilih: String?`, `count: Int?`, `avatarInisial`, `subjudul`, `trailing: RowScope.() -> Unit`, `MkProgresUnggah(persen: Float)`. Layar F1/F2 yang sudah ditulis menunggu komponen ini justru memakai bentuk yang ada sekarang, maka layar menang:

- `MkSegmentedControl.terpilih: String` (Penerimaan/Kepatuhan/Mingguan selalu kirim `String`; `String?` tak dibutuhkan) dan `MkOpsi.count: Any?` (superset dari `Int?`; semua pemanggil mengirim `Int` `.size`).
- `MkListRow` memakai `inisial`/`sub` (bukan `avatarInisial`/`subjudul`) dan `trailing: (() -> Unit)?` — sama persis dengan yang dipakai AkunScreen, PenerimaanScreen, KepatuhanScreen, TimScreen.
- `MkPilih` bertipe `MkOpsi?`/`(MkOpsi) -> Unit` — MingguanScreen (pemilih divisi + pembungkus `PilihOpsi`) menyediakan objek `MkOpsi`, bukan `String`; mengubah ke `String?` akan merusak layar itu.
- `MkProgresUnggah.persen: Int` (persen 0..100, bukan `Float` 0..1) — konsisten dengan progres `Int` di seluruh layar; belum ada pemanggil app (siap untuk kerja unggah bukti lanjutan).
- `MkField` memakai `isError`/`supportingText` persis daftar parameter tugas (placeholder `String?` — superset `String = ""`); tambahan perilaku port lokal B5 (`wajib`, `petunjuk`, `kesalahan`, `angka`) tetap hidup sebagai pembungkus lokal B5, sesuai batas tugas.

## Verifikasi

- `:designsystem:compileDebugKotlin` → **BUILD SUCCESSFUL, 0 galat 0 peringatan** (JBR Android Studio; sebelum perbaikan ikon ada 2 peringatan deprekasi).
- Semua pemanggil di modul app diaudit satu per satu terhadap tanda tangan: AkunScreen (MkField, MkListRow, MkAvatar), PenerimaanScreen (MkSegmentedControl, MkListRow), KepatuhanScreen (MkSegmentedControl, MkListRow), TimScreen + RingkasanDirekturSheet (MkListRow, MkField), MingguanScreen (MkSegmentedControl, MkOpsi, MkPilih, MkField, MkFAB) — **semua cocok** (parameter bernama, tipe, aritas).
- `:app:compileDebugKotlin` **belum bisa berjalan** — terhalang 2 galat di `core/network` (bukan zona ini; lihat permintaan lintas zona). Modul app belum pernah punya artefak build (0 kelas) sebelumnya, jadi verifikasi pemanggil di atas bersifat audit manual + kompilasi designsystem.
- ktlint: 58 temuan di 7 berkas saya, **semuanya gaya** (nama fungsi PascalCase untuk @Composable, komentar blok, posisi multiline) — pola yang sama menimpa berkas F0 yang sudah di-commit (ProjectRow, StatTile, MkButton, …; 269 temuan modul-wide). Nihil temuan substantif (impor tak terpakai, wildcard, dll.) di berkas saya. Deteksi lengkap menunggu keputusan parent soal pengecualian Compose untuk ktlint.

## Permintaan lintas zona (untuk parent)

1. **`core/network/api/EvidenceApi.kt`** gagal kompilasi: `@Body` di baris 40 tak terurai — **kurang `import retrofit2.http.Body`** (impor retrofit2 yang ada: DELETE, GET, Multipart, POST, Part, Path, Query). Perbaikan satu baris.
2. **`core/network/api/KadivApi.kt`** gagal kompilasi: "Unclosed comment" 82:1 — baris 23 KDoc memuat `(/api/kadiv/*)`; komentar blok Kotlin **bersarang**, jadi `/*` di teks itu membuka komentar anak yang tak pernah ditutup (5 pembuka vs 4 penutup). Perbaikan: tulis ulang teks itu, mis. `(/api/kadiv)` atau `(/api/kadiv/…)` — atau tambah `*/` penyeimbang. Kedua berkas zona T5-B1/agen F2 (stempel 20:55/21:06, kemungkinan sisa sesi yang putus) dan menghalangi kompilasi seluruh modul app.
3. **detekt gagal untuk semua modul**: `detekt.yml` memuat seksi `formatting:` (baris 36) tanpa plugin `detekt-formatting` di classpath → "Property 'formatting' is misspelled or does not exist" + crash `ColorizerKt`. Konfigurasi F0; perlu hapus seksi itu atau tambah dependensi plugin.
4. **Observasi untuk pemilik MingguanScreen**: pembungkus `PilihOpsi` menulis `Text(label)` di atas **dan** meneruskan `label = label` ke `MkPilih` (label M3 floating di dalam kolom) → label tampil ganda. Hilangkan salah satu (paling mudah: jangan render `Text(label)` sendiri, atau kosongkan label luar).

## Jahitan untuk integrasi (parent)

1. Promosi port lokal B5 (jahitan #3 laporan T5-B5): `LaporanHarianScreen.kt` masih memakai `MkField`/`MkPilih`/`MkListRow` lokal — tanda tangannya berbeda (`wajib`/`petunjuk`/`kesalahan`/`angka`; chip status untuk MkPilih). Promosi berarti pindahkan pembungkus itu ke designsystem dengan parameter tambahan itu atau pertahankan lokal; perilaku layar tidak boleh berubah.
2. `MkLampiran` dan `tampilkanUrungkan`/`MkSnackbarHost` belum dipakai layar (B5 menunggu kontrak bukti/undo); siap dipakai — lihat pratinjau tiap berkas untuk pola pemasangan (FAB di Box/align, SnackbarHost di Scaffold).
3. `MkOpsi.count` dirender `toString()` dan selalu tampil termasuk 0 (sesuai catatan komponen); label lencana kustom menyusul bila perlu.

## Yang sengaja tidak dikerjakan (di luar cakupan)

- Memperbaiki berkas `core/network` (zona agen lain; hanya diagnosis di atas).
- Mengubah konfigurasi ktlint/detekt proyek (keputusan parent).
- Port `SearchField`, `AccentPicker`, dan komponen grafik lain dari index.d.ts (bukan daftar tugas ini).
