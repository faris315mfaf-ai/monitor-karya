# Laporan T4-A9 — Fase 0: layar UI `android/app` (login, ganti sandi, ringkasan, placeholder)

Tanggal: 8 Oktober 2026 · Lingkup: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/` saja · Tanpa git/jaringan/DB/Gradle.

## Berkas yang dibuat

| Berkas | Isi |
|---|---|
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/login/LoginScreen.kt` | `LoginScreen(memuat, pesanGalat, onMasuk(identifier, sandi))` — state + callback polos tanpa ViewModel. Header merek (ikon `Work` dalam kotak aksen-soft + judul "Monitor Karya" besar + subjudul), kartu MkCard "Masuk ke akun Anda". Kolom identifier: label "Nama pengguna atau email", `KeyboardCapitalization.None`, `autoCorrect = false`, fokus awal, ImeAction.Next. Kolom sandi: `PasswordVisualTransformation` + tombol mata toggle (satu deskripsi konten "Tampilkan/Sembunyikan kata sandi"), ImeAction.Done → `kirim()`. `MkButton Primary Md full "Masuk"`, saat memuat nonaktif dan teks "Memeriksa…". Galat server tampil `MkError` tanpa tombol. Footer "Lupa kata sandi? Minta Super Admin menyetel ulang." Berkas ini juga memuat helper `MkInputTeks` (internal, dipakai dua layar). |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/login/GantiSandiScreen.kt` | `GantiSandiScreen(memuat, pesan, onGanti(kini, baru, ulang))`. Tiga kolom (kata sandi saat ini / baru / ulang) dengan satu tombol mata untuk semua (sama dengan web). Validasi ramah di klien: baru ≠ ulang → "Kata sandi baru tidak cocok"; panjang < 8 → "Minimal 8 karakter" (teks bantu kolom, merah saat galat). Tombol "Simpan kata sandi baru" (saat memuat "Menyimpan…") hanya aktif bila valid. Sertakan port minimal kebijakan sandi `KebijakanSandi` (8–256 karakter, bukan spasi saja). ImeAction Next/Next/Done→kirim. |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/vm/RingkasanViewModel.kt` | `@HiltViewModel` + `RingkasanApi` (injeksi konstruktor). `state: StateFlow<RingkasanUiState>` dengan `Memuat` / `Sukses(data)` / `Galat(pesan)`; `fun muat()` (dipanggil di init, kembali ke Memuat dulu) dan `fun ulang()`. Galat apa pun (kecuali `CancellationException` yang dilempar ulang) → pesan generik "Ringkasan belum bisa dimuat. Periksa koneksi Anda lalu coba lagi." Data class `RingkasanRingkas(namaPengguna, peran, jumlahProyek, sesuai, total, jumlahEntitas)` persis tugas. Fungsi top-level `parseRingkasan(root: JsonObject)` internal (siap diuji unit) + helper aman `sebagaiObjek/sebagaiArray/angka/teks`. |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/ringkasan/RingkasanScreen.kt` | Dua overload: `RingkasanScreen(vm, offline)` (memakai `collectAsStateWithLifecycle`, `onUlang = vm::ulang`) dan `RingkasanScreen(state, offline, onUlang)` murni state. Isi: sapaan "Selamat bekerja, <nama>" (tanpa koma bila nama null) + label peran; dua `StatTile` sebaris — "Perusahaan" dari `scope.entities`, "Proyek" dari `projects.size` (hilang → ubin tidak tampil); satu `StatusBadge` ringkas "x dari y sesuai jadwal" (turun dari `sesuai` vs `total`: semua beres → ON, sebagian → RISK, total 0 → NEUTRAL "Belum ada proyek aktif"); galat → `MkError` dengan Coba lagi; memuat → 3 `MkSkeleton`; `offline=true` → `MkOfflineBanner` di paling atas. Angka format id-ID. |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/placeholder/PlaceholderTabScreen.kt` | `PlaceholderTabScreen(label)` — `EmptyNote` "Modul <label> menyusul di fase berikutnya." di tengah layar, untuk tab yang belum dibangun Fase 0. |

## Keputusan teknis

1. **Defensif penuh saat parse**: `sesuai = counts.on + counts.done` (status selesai ikut dihitung beres); `total = jumlah semua counts`, jatuh ke `projects.size` bila counts kosong/nol; `namaPengguna/peran` dicari di `viewer.nama|name|peran|role` lalu root — `/api/ringkasan` saat ini belum mengirim keduanya, jadi null dan layar memakai sapaan tanpa nama (aman sampai backend menambahkannya atau dihubungkan dari sesi).
2. **Login meniru perilaku web**: tombol selalu aktif kecuali saat memuat — validasi kosong diserahkan ke server supaya pesan satu sumber; identifier dipangkas spasi tepi sebelum `onMasuk`. Ganti sandi sebaliknya mengunci tombol sampai valid (sama dengan `ready` di forced-password-form).
3. **Label kolom identifier** memakai teks tugas "Nama pengguna atau email" (web memakai "Username" + placeholder — tugas menang).
4. **Tombol mata**: login satu toggle untuk kolom sandi; ganti sandi satu toggle untuk ketiga kolom (padanan web). `contentDescription` berganti "Tampilkan/Sembunyikan kata sandi".
5. **`MkInputTeks`** (OutlinedTextField M3): radius 14 (`--radius-md`), batas normal `lineStrong` (tokens.css: batas kontrol wajib terlihat — "input bergaris"), nonaktif `line`, fokus `accent`, kursor `accent`, latar `surface`; teks bantu otomatis mengikuti `isError` M3. Helper internal satu paket `ui.login` dipakai kedua layar — tanpa berkas bersama tambahan di luar daftar tugas.
6. **Teks tombol ganti sandi** "Simpan kata sandi baru" (tugas) — web "Simpan kata sandi"; status memuat "Menyimpan…" / "Memeriksa…".
7. **Sapaan** tetap "Selamat bekerja, <nama>" sesuai tugas (web memakai sapaan jam WIB "Selamat pagi/siang/sore/malam" — bisa diganti di fase berikutnya memakai `Wib`).
8. **Tidak ada @Preview** — pratinjau butuh pembungkus tema designsystem (`MkTheme`/`LocalMkColors`) yang belum ada di worktree ini; ditunda ke tugas designsystem agar kontrak tunggal.
9. Keluar dari akun di layar ganti sandi (web punya "Keluar dari akun") tidak dibuat — di luar tanda tangan tugas; menunggu navigasi Fase 0 (T4-A8).

## Kontrak yang diasumsikan (untuk agen designsystem / core-network / integrasi)

Modul designsystem dan core-network belum ada di worktree saat tugas ini dikerjakan; kode ditulis terhadap kontrak berikut — mohon diselaraskan (sisi designsystem menyesuaikan atau berkas ini diimpor ulang):

- Paket `designsystem.components` (nama paket persis tugas):
  - `MkButton(text: String, onClick: () -> Unit, modifier, variant: MkButtonVariant = Primary, size: MkButtonSize = Md, full: Boolean = false, enabled: Boolean = true)`; enum `MkButtonVariant { Primary, Secondary, Plain, Destructive }`, `MkButtonSize { Sm, Md, Lg }`.
  - `MkCard(modifier, title: String? = null, subtitle: String? = null, content: @Composable ColumnScope.() -> Unit)`.
  - `StatTile(label: String, value: String, modifier, …)` — `value` String (web menerima angka|string; pemanggil memformat id-ID).
  - `StatusBadge(status: MkStatus, modifier, text: String? = null)` — enum `MkStatus { ON, RISK, LATE, DONE, NEUTRAL, … }`.
  - `EmptyNote(text: String, modifier)`, `MkError(pesan: String, modifier, onCobaLagi: (() -> Unit)? = null)` (tombol "Coba lagi" hanya bila callback diberikan), `MkSkeleton(modifier)`, `MkOfflineBanner(modifier)`.
  - `LocalMkColors.current: MkColors` dengan properti `Color` camel-token: `surface, surface2, fill1, fill2, line, lineStrong, ink, ink2, ink3, accent, accentFill, accentSoft, onAccent, sukses, suksesSoft, waspada, waspadaSoft, bahaya, bahayaSoft, info, infoSoft` (nama dari design-system/tokens.css).
  - Tipografi lewat `MaterialTheme.typography` yang dipasang pembungkus tema designsystem (RANCANGAN-ANDROID-NATIVE §3); layar ini memakai `displaySmall` (≈ title-1 34 untuk sapaan), `bodyLarge`, `bodySmall`.
- `id.co.monitorkarya.core.network.RingkasanApi` dengan `suspend fun ambil(): JsonObject` (GET /api/ringkasan, galat dilempar sebagai pengecualian; binding Hilt disediakan modul jaringan).
- Dependensi implisit `:app`: compose + material3, `material-icons-extended` (ikon `Visibility/VisibilityOff/Work` — `Visibility` tidak ada di set inti; alternatifnya ganti ke ikon designsystem Lucide saat tersedia), `androidx.lifecycle:lifecycle-runtime-compose` (`collectAsStateWithLifecycle`), Hilt (`@HiltViewModel`), `kotlinx-serialization-json` (JsonObject/jsonPrimitive `intOrNull`/`contentOrNull`).

## Catatan kecil

- `KeyboardOptions(autoCorrect = false)` — di compose-ui ≥1.7 parameter ini dideprekasi (pengganti `autoCorrectEnabled`); tetap ter-compile dengan peringatan. Sesuaikan saat versi BOM dikunci.
- `data object` (Kotlin ≥1.9) dipakai untuk `RingkasanUiState.Memuat` — konsisten dengan toolchain modern; bila Kotlin <1.9 ganti `object`.

## Verifikasi

Tidak menjalankan Gradle (larangan tugas). Nama berkas/paket/fungsi dicek dua kali terhadap daftar tugas; perilaku layar dicek terhadap `src/components/login-form.tsx`, `src/app/login/ganti-sandi/forced-password-form.tsx`, `src/lib/password-policy.ts`, `src/app/api/ringkasan/route.ts` (bentuk `scope.entities`, `projects`, `counts`, `viewer`), dan pola hero `docs/design/peran/01-manajemen.md` (kalimat jawaban + StatTile; ≤4 KPI, 1 kartu bergradien nol). Gaya kode mengikuti berkas Fase 0 lain (indentasi 4 spasi, komentar bahasa Indonesia).
