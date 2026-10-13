# A2 — Tab Log aktivitas + Sistem & akses (`:feature:audit`)

Tanggal: 13 Okt 2026 · Cabang: `claude/perbaiki-bug-sisa` · Belum di-commit.

## Hasil

| Hal | Status |
|---|---|
| `:feature:audit:compileDebugKotlin` | Lulus |
| `:feature:audit:testDebugUnitTest` | Lulus — 29 tes (4 kelas) |
| Berkas di luar modul yang diubah | Tidak ada (selain laporan ini) |

## Titik masuk publik (paket `id.co.monitorkarya.feature.audit`)

```kotlin
@Composable fun LogAuditTab(peran: Peran, modifier: Modifier = Modifier)
@Composable fun SistemAksesTab(peran: Peran, modifier: Modifier = Modifier)
```

ViewModel diambil `hiltViewModel(key = "...-${peran.name}")` sehingga ganti akun tidak mewarisi saringan.

## Struktur

```
feature/audit/src/main/kotlin/id/co/monitorkarya/feature/audit/
  AuditTabs.kt                 titik masuk publik
  data/AuditDto.kt             DTO @Serializable semua rute
  data/AuditApi.kt             AuditLogApi + SistemApi (Retrofit)
  di/AuditModule.kt            @InstallIn(SingletonComponent), inject Retrofit dari AppModule
  model/AuditLabel.kt          port ACTIONS/TARGET_LABELS audit-view.tsx (label + nada)
  model/Format.kt              waktu WIB, angka id-ID, JSON → teks, kolom berubah, hari kerja
  ui/Bersama.kt                kepala halaman, kartu berjudul, baris KV, kotak kode
  log/LogAuditViewModel.kt     + LogAuditScreen.kt
  sistem/SistemAksesViewModel.kt + SistemAksesScreen.kt
feature/audit/src/main/res/values/strings_audit.xml
feature/audit/src/test/...     DtoDekodeTest, FormatTest, LogAuditViewModelTest, SistemAksesViewModelTest
```

## Log aktivitas (paritas `audit-view.tsx`, rute `audit-logs`)

- Kalimat jawaban seperti web ("N aktivitas tercatat…; terakhir oleh X, 5 menit lalu.").
- Daftar 20 per halaman; "Muat lebih banyak" menambah halaman berikut (duplikat id dibuang); galat halaman berikut tampil di kaki daftar.
- Saringan di Sheet (draf, diterapkan lewat "Tampilkan hasil"): target (4 chip web), aksi (dropdown ±100 aksi, urut abjad), peran pelaku (9 peran), tanggal WIB (Semua / Hari ini / 7 hari / 30 hari / rentang via DateRangePicker). Tanggal dikirim `YYYY-MM-DD` = hari WIB (server mencakup seluruh hari `dateTo`); rentang terbalik ditukar.
- Saringan pelaku (`actorId`, didukung server tetapi tanpa UI di web): tombol "Lihat semua aktivitas pelaku ini" di Sheet rincian; chip "Pelaku: …" untuk menghapusnya.
- Sheet rincian: lencana aksi (warna+ikon+kata), pelaku (nama, peran · email), target + id, "Kolom berubah: …" (kunci yang beda), kotak Sebelum/Sesudah, perangkat (IP, user-agent). Before/after SELALU teks polos (`Text` mono, bisa dipilih/salin, gulir mendatar, dipotong 20.000 karakter); tidak ada render HTML.
- Unduh CSV hanya bila server memberi `canExport`: memakai Storage Access Framework (`ActivityResultContracts.CreateDocument("text/csv")`) — pengguna memilih lokasi; tanpa FileProvider, tanpa izin penyimpanan, tanpa perubahan manifest. Saringan tanggal & aksi sama dengan web. Berkas kosong dihapus bila server menolak (403/422/429). Pesan memakai header `X-Exported-Rows`/`X-Total-Rows` (menyebut batas 5.000 baris bila terpotong). Menambah `implementation(libs.androidx.activity.compose)` di `feature/audit/build.gradle.kts`.

## Sistem & akses (paritas `system-view.tsx`, rute `system`, `access-requests`, `roles`, `health/ready`)

Urutan kartu: kesehatan (kalimat + lencana + 4 StatTile + kesiapan server dari `/api/health/ready`) → permintaan akses → proses otomatis → penguncian (ringkas + **per PT dari `locking.perEntity[]`**, ketuk PT → Sheet aturan: kunci harian, batas hari ini, hari kerja, pengisian harian/mingguan dibuka/ditutup, tenggat mingguan, plus sakelar pengingat PT itu) → pengingat otomatis (ringkas, baca saja) → kesehatan akun → hak akses per peran (ketuk → Sheet akun dari `/api/roles`, dimuat sekali) → volume data → aktivitas terakhir → 25 akun terakhir.

- Permintaan akses: menunggu dulu, lalu yang sudah diputuskan (maks 8). Setujui/Tolak hanya bila `canDecide` dari server. Putusan ditahan 5 detik dengan snackbar "Urungkan" (seperti toast web); bila layar ditutup sebelum 5 detik putusan tetap dikirim (padanan `keepalive`). 409 → pesan server + muat ulang antrean; 403/422 → pesan server.
- AKUN_BARU disetujui: token aktivasi di respons PATCH sengaja tidak didekode/ditampilkan (Rancangan §2: aktivasi tetap di web). Pengguna diarahkan ke web "Kelola aktivasi" (server mengizinkan terbit ulang).
- Ponsel tanpa aksi massal (07-ti.md); sakelar pengingat & kartu buka kunci tidak dipindah ke ponsel.

## Izin, galat, waktu

- Izin dari server: 401/403/409/422/429/5xx lewat `ApiError.dari(...)` (`core:network`) → `ErrorNote`/snackbar. `/api/system` 403 untuk peran tanpa `users:manage` tampil sebagai galat berpesan server.
- Setiap bagian punya keadaan memuat (MkSkeleton), kosong (EmptyNote), galat (ErrorNote + Coba lagi).
- Semua waktu WIB (`Wib.ZONA`): "13 Okt 2026, 14.05 WIB", relatif berbasis kalender WIB.

## Tes unit (29)

- `DtoDekodeTest` — dekode JSON bentuk rute server: audit-logs (objek, string mentah, aktor null, tanpa `canExport`), system lengkap (technical, reminders, perEntity) dan respons lama, access-requests GET/PATCH (activation diabaikan), roles, health.
- `FormatTest` — WIB, relatif, JSON → teks (termasuk `<script>` tetap teks), kolom berubah, label aksi/peran/hari kerja/jadwal pengingat.
- `LogAuditViewModelTest` — muat + paging tanpa duplikat, saringan ke query (tanggal ditukar), saring pelaku, galat 400, kalimat jawaban, ekspor menulis CSV + pesan batas, ekspor 429 menghapus berkas.
- `SistemAksesViewModelTest` — muat awal, 403/503, tahan 5 detik lalu PATCH, urungkan, 409 muat ulang, AKUN_BARU → pesan aktivasi web, item tak bisa diputuskan diabaikan, direktori peran sekali, ringkasan kesehatan, urutan antrean.

## Butuh parent

1. **MKShell.IsiTab** (app): pasang `TabId.LOG_AUDIT -> LogAuditTab(peran)` dan `TabId.SISTEM_AKSES -> SistemAksesTab(peran)` (import `id.co.monitorkarya.feature.audit.*`). Modul sudah di-`implementation` oleh `:app`.
2. Tidak ada perubahan manifest yang dibutuhkan (ekspor memakai SAF, bukan FileProvider/Intent bagikan). Bila pemilik lebih suka "Bagikan ke aplikasi lain", baru perlu FileProvider di manifest app.
3. Opsional: `hiltViewModel` sudah memakai paket baru `androidx.hilt.lifecycle.viewmodel.compose` (paket lama berstatus deprecated di hilt-navigation-compose 1.3.0).
