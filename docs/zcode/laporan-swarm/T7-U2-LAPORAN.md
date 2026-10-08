# T7-U2 — UI Android: margin layar 12dp + pemisah 1px

Tanggal: 9 Oktober 2026 · Agen: T7-U2 (Zcode) · Zona: `android/app/**`, `android/designsystem/**`

Keputusan pemilik yang dikerjakan: **jarak kiri-kanan layar jangan terlalu lebar; batas antar bagian cukup garis 1px supaya konten tampil penuh.**

Gradle TIDAK dijalankan (parent build) — verifikasi lewat pembacaan penuh semua layar, `git diff` manual, keseimbangan kurung, dan penelusuran impor.

## 1. Komponen baru

- `android/designsystem/src/main/kotlin/id/co/monitorkarya/designsystem/components/MkDivider.kt`
  - `MkDivider(modifier)`: Box `fillMaxWidth().height(1.dp).background(LocalMkColors.current.line)` — garis horizontal 1dp token `line`, selebar wadah, param `modifier`, pratinjau `@PreviewGanda`.

## 2. Standarisasi padding horizontal layar → `MkSpacing.space3` (12dp)

`MkSpacing.space3` = 12dp (satu-satunya token 12dp) — dipakai, bukan literal.

| Berkas | Sebelum | Sesudah |
| --- | --- | --- |
| `ui/admin/MejaAdminScreen.kt` | `padding(horizontal = MkSpacing.space4)` di pembungkus + padding layar anak (ganda, efektif 16+20=36dp) | padding pembungkus dihapus; segmented control diberi `Modifier.padding(horizontal = MkSpacing.space3)`; layar anak memasang margin 12dp sendiri (efektif 12dp) |
| `ui/akun/AkunScreen.kt` | `space5` (20dp) | `space3` |
| `ui/kepatuhan/KepatuhanScreen.kt` | `space5` (20dp) | `space3` |
| `ui/laporan/LaporanHarianScreen.kt` | `space5` (20dp) | `space3` |
| `ui/login/LoginScreen.kt` | `24.dp` | `space3` (vertikal 32dp → `space8`, nilai sama) |
| `ui/login/GantiSandiScreen.kt` | `24.dp` | `space3` (vertikal → `space8`) |
| `ui/mejakerja/MejaKerjaScreen.kt` | `contentPadding horizontal space5` (20dp, di 2 LazyColumn: isi + kerangka) | `space3` |
| `ui/mingguan/MingguanScreen.kt` | `start/end = space5` (20dp) | `start/end = space3` |
| `ui/penerimaan/PenerimaanScreen.kt` | `20.dp` | `space3` (vertikal 16dp → `space4`) |
| `ui/placeholder/PlaceholderTabScreen.kt` | `24.dp` | `space3` (vertikal → `space8`; impor `dp` tak terpakai dibuang) |
| `ui/ringkasan/RingkasanScreen.kt` | `20.dp` | `space3` (vertikal → `space4`) |
| `ui/tim/TimScreen.kt` | `space5` (20dp) | `space3` |

Elemen yang ikut sejajar ke margin 12dp (bukan margin layar, tapi sejajar tepi konten):

- `ui/mingguan/MingguanScreen.kt` — FAB `padding(end = space5 → space3)`; footer sticky `horizontal space5 → space3`.
- `ui/laporan/LaporanHarianScreen.kt` — FAB `padding(MkSpacing.space5)` → `padding(horizontal = space3, vertical = space5)`.

Padding dalam komponen baris/kartu (ruang dalam MkListRow/MkCard, DetailDivisi `space4`, dll.) sengaja tidak diubah — hanya margin layar yang distandarkan.

## 3. Pemisah 1px antar baris & antar bagian

Pola: `forEachIndexed` + `if (index < list.lastIndex) MkDivider()` — garis hanya DI ANTARA baris, tidak setelah baris terakhir. Baris tetap satu wadah penuh lebar; tidak ada spacer besar/kartu ganda baru; tinggi sentuh 44dp baris tidak disentuh.

| Layar | Perubahan |
| --- | --- |
| MejaKerja | MkDivider item antara KartuRingkas dan bagian daftar "Tugas hari ini"; MkDivider antar baris tugas (dalam MkCard padding `space1`). |
| LaporanHarian | MkDivider antara kepala layar dan kartu daftar; MkDivider antar baris proyek (MkCard `space1`). |
| Tim | Kartu "Laporan harian tim" diubah ke padding `space1` (satu wadah penuh); kepala kartu diberi padding sendiri (`horizontal space4, vertical space3`) lalu MkDivider memisah kepala vs daftar; MkDivider antar baris anggota (menggantikan `spacedBy(space1)`). |
| Penerimaan | MkDivider antara kontrol (segmented/tombol primer) dan antrean; antrean satu Column penuh, MkDivider antar baris (menggantikan `spacedBy(2.dp)`). |
| Kepatuhan | MkDivider antara kontrol layar dan kartu daftar divisi; MkDivider antar baris divisi (bentangan tetap di antara baris dan divider); MkDivider antar baris "Belum lapor" di DetailDivisi. |
| Akun | MkDivider antara baris chip saringan dan daftar; LazyColumn `itemsIndexed` + MkDivider antar baris akun (menggantikan `spacedBy(space1)`). |
| Mingguan | Papan butir TETAP kartu (kanban `MkBoardColumn`/KartuButir — kartu adalah bahasa desain papan, bukan daftar baris); layar ini hanya mendapat standarisasi margin. Tidak ada antrean MkListRow di layar ini. |

Kartu ringkasan (StatTile/KartuRingkas, kartu EmptyNote) tetap MkCard sesuai arahan.

## 4. Yang dijaga

- Tidak menyentuh ViewModel, state, navigasi, atau perilaku; hanya tata letak.
- Semua nilai tetap token (`MkSpacing.*`, `LocalMkColors.line`); tidak ada hex/px baru.
- Komentar bahasa Indonesia; penanda keputusan "keputusan pemilik 9 Okt 2026" di tiap titik ubah.
- Impor diperiksa: `items` → `itemsIndexed` (AkunScreen), impor `MkSpacing`/`MkDivider` ditambah, impor `dp` yang jadi yatim dibuang (PlaceholderTabScreen), impor yang masih dipakai tidak terhapus (insiden sementara pada PenerimaanScreen langsung dipulihkan dalam edit berikutnya).
- Keseimbangan kurung semua berkas diedit OK; `git diff` ditinjau penuh.

## 5. Verifikasi

- Gradle dilarang (parent build) — tidak dijalankan.
- `grep` penutup: tidak ada lagi `padding(horizontal = 20.dp|24.dp)`, `horizontal = MkSpacing.space5/space6`, `start/end = space5`, `PaddingValues(horizontal = space5` di `ui/**`.
- Perubahan pihak lain di worktree (src/, tests/, docs/fitur) tidak disentuh.
