# A2 — Tab Entitas + Perusahaan & akun (`:feature:entitas`)

Tanggal: 13 Okt 2026 · Cabang: `claude/perbaiki-bug-sisa` · Belum di-commit.

## Hasil

| Hal | Status |
|---|---|
| `:feature:entitas:compileDebugKotlin` | Lulus (sisa peringatan: `LocalClipboardManager` usang, sama dengan `app/ui/akun`) |
| `:feature:entitas:testDebugUnitTest` | Lulus — 29 tes (4 kelas) |
| Berkas di luar modul yang diubah | Tidak ada (selain laporan ini) |
| Integrasi MKShell | Sudah ada di parent (`TabId.ENTITAS -> EntitasTab(peran)`, `TabId.PERUSAHAAN -> PerusahaanTab(peran)`); tanda tangan cocok |

## Titik masuk publik (paket `id.co.monitorkarya.feature.entitas`)

```kotlin
@Composable fun EntitasTab(peran: Peran, modifier: Modifier = Modifier)
@Composable fun PerusahaanTab(peran: Peran, modifier: Modifier = Modifier)
```

ViewModel diambil `hiltViewModel(key = "entitas-${peran.name}")` / `"perusahaan-..."`.

## Struktur

```
feature/entitas/src/main/kotlin/id/co/monitorkarya/feature/entitas/
  TitikMasuk.kt                 dua titik masuk publik
  data/EntitasDto.kt            DTO /api/entities, /api/entities/[id], /api/entity-activity
  data/PerusahaanDto.kt         DTO /api/companies, /companies/users, /users/activation
  data/EntitasApis.kt           EntitasApi + PerusahaanApi (Retrofit)
  data/Panggil.kt               Jawab.Ok / Jawab.Gagal(ApiError, kode HTTP)
  di/EntitasModule.kt           @InstallIn(SingletonComponent): API + AsalServer dari Retrofit AppModule
  ui/                           TeksUi (string res dari VM), Format (WIB, persen, kosakata status), Bagian (potongan UI)
  entitas/                      EntitasLogika, EntitasViewModel, EntitasLayar, EntitasSheet, AktivitasBagian
  perusahaan/                   PerusahaanLogika, PerusahaanViewModel, PerusahaanLayar,
                                SheetPerusahaan, SheetAkun, SheetWizard
res/values/strings_entitas.xml  375 string, semua berawalan ent_ (cegah bentrok saat digabung ke :app)
```

## Tab Entitas (paritas `entities-view.tsx` + `entity-activity-board.tsx`)

- Hero: "n dari m PT perlu perhatian kepatuhan", 4 angka (PT, rata-rata kepatuhan, tertunda, terlambat hari ini), periode "Oktober 2026".
- Pohon HOLDING → SUB_HOLDING → SECTOR → REGION → PT; pencarian nama/kode/wilayah (induk ikut), dua tingkat teratas terbuka bawaan, Buka/Ciutkan semua. PT membuka sheet; simpul lain membuka/menutup cabang.
- Lencana kepatuhan (warna + ikon + kata, ambang 90/75/60) pada PT; simpul non-PT memakai rata-rata PT turunan yang berskor. Catatan: `/api/compliance-map` tidak dipakai karena rata-ratanya menghitung PT tanpa KPI sebagai 0 — rata-rata diturunkan dari KPI di `/api/entities` (data sama, tanpa bias 0).
- Sheet PT: jalur induk, anak entitas, 4 KPI, progres 7 laporan harian (batang), divisi, proyek (fase/PIC/siklus), laporan harian 5 terbaru (+bilah progres), mingguan 4 terbaru, penunjukan admin, "KPI belum dihitung".
- Aktivitas di sheet PT: Harian/Mingguan/Bulanan, geser periode memakai `prev/next` server, "Kembali ke hari ini", skala prioritas (catatan bahwa laporan proyek disembunyikan), blok proyek (task per hari, laporan harian, laporan kemajuan) dan blok divisi (butir mingguan, status kepala laporan).
- **403 baru**: `GET /api/entities/[id]` 403 → `DetailUi.Ditolak`, tampil sebagai catatan ramah (PIC/KADIV: penjelasan bahwa rincian milik peran pemantau; peran lain: pesan server "di luar cakupan"). Tidak ada penyembunyian berdasarkan peran di klien. Aktivitas tetap dimuat terpisah (server mengiris untuk pelaksana).

## Tab Perusahaan & akun (paritas `companies-view.tsx`, `company-sheet.tsx`, `account-sheet.tsx`, `company-wizard.tsx`, `activation-handoff.tsx`)

- Wewenang dari server: `scope` (ALL/ENTITY), `canManageCompanies`, `manageableRoles`, `me`. Admin PT otomatis mendapat meja terbatas (tanpa tambah/ubah perusahaan, penempatan terkunci). 403 GET meja → catatan ramah.
- Hero + 4 angka, "Tinjau n hal", tiga tampilan: Perusahaan (kartu, chip saringan berhitung, urutan), Akun (lintas PT; status/penempatan/posisi; 40 per halaman), Struktur (holding → PT → divisi/proyek, akun tingkat grup).
- Sheet perusahaan: Ringkasan (angka, kelengkapan profil 6 butir, perlu perhatian, identitas), Akun, Divisi (lihat/tetapkan kepala), Proyek (lihat/tetapkan manager), Pengaturan (hanya `canManageCompanies`): ubah identitas, aktif/nonaktif **langsung + Urungkan**, hapus **dengan konfirmasi**; 409 (punya anak/riwayat/akun sendiri) tampil sebagai pesan server di sheet.
- Sheet akun: penempatan (meja penuh), posisi (dibatasi `manageableRoles`), divisi dipimpin / proyek dipegang (pilih atau baru), anggota divisi (GET `users?id=`; kolom dikunci sampai termuat), identitas, kata sandi awal/setel ulang (acak, salin), aktivasi (hanya bila GET `activation?id=` → `canActivate`), aktif/nonaktif langsung + Urungkan, hapus dengan konfirmasi. Akun di luar wewenang tampil baca-saja (ikon gembok). 401/403/409/422 via `ApiError`.
- Wizard tambah perusahaan 4 langkah (Identitas, Kontak, Posisi & akun, Tinjau) + serah terima kata sandi awal per akun.
- Urungkan: snackbar `tampilkanUrungkan` + catatan Urungkan di dalam sheet (snackbar layar utama tertutup sheet modal). Sekali pakai, PATCH `isActive` kebalikannya (rute ini tidak menerbitkan `undoToken`).

## Keamanan

- Kata sandi tidak pernah masuk state ViewModel: hidup di state Compose sheet (`remember`, bukan `rememberSaveable`), dikirim sebagai argumen, dibuang. Diuji: `toString()` state sheet/notif tidak memuat sandi.
- Tautan aktivasi: token hanya di fragmen `#token=` dari `path` server; URL = `AsalServer` (baseUrl Retrofit) + path; hanya di `SheetAkunUi.tautan`, dibuang saat sheet ditutup. Tidak ada panggilan `Log` di modul. `MkClient` memakai logging BASIC (tanpa badan) sehingga badan respons aktivasi tidak tercatat.
- PATCH memakai `encodeDefaults=false` mkJson: kolom null tidak terkirim (rute akun membaca `!== undefined` sebagai "ubah"); "" = sengaja mengosongkan. Diuji di `PerusahaanDtoTest`.

## Tes (29)

| Kelas | Isi |
|---|---|
| `data/EntitasDtoTest` (4) | pohon (PT kpi null, non-PT tanpa kunci), rincian PT lengkap, rincian non-PT, aktivitas harian |
| `data/PerusahaanDtoTest` (6) | meja penuh/terbatas, POST perusahaan/akun, aktivasi, penyandian PATCH, POST posisi |
| `LogikaTest` (9) | kumpulkan/ringkas pohon, skor turunan, saring + induk, buka bawaan, ambang kepatuhan, kelengkapan, posisi & wewenang, saringan akun, slug/kode/sandi |
| `ViewModelTest` (10) | muat pohon + aktivitas prev/kadens, 403 → Ditolak, non-PT tanpa aktivitas, galat pohon, 403 meja, nonaktif + Urungkan sekali pakai, hapus 409, URL aktivasi + dibuang, PATCH meja terbatas tanpa entityId, tambah akun 422 |

## Batasan / butuh parent

- Logo perusahaan tidak diunggah dari HP (catatan "diunggah lewat aplikasi web"); kelengkapan tetap membaca `logoData`.
- Aksi massal aktif/nonaktif (mode "Pilih" web) belum ada; per akun lewat sheet.
- Kosakata status/peran (`Format.kt`, `PerusahaanLogika.kt`) masih literal Kotlin, padanan `labelPeran` di `app/ui/akun`; string UI lain di `strings_entitas.xml`.
- Butuh parent: tidak ada — integrasi MKShell dan dependensi `:app -> :feature:entitas` sudah ada.
