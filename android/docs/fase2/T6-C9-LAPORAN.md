# Laporan T6-C9 — Layar Meja Akun, versi Admin PT terbatas (Fase 2)

Disusun agen T6-C9, 8 Oktober 2026. Zona tulis: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/akun/` saja (+ dokumen ini). Tanpa git/jaringan/DB; gradle tidak dijalankan (pembangunan oleh parent). Acuan perilaku: `src/components/views/companies-view.tsx` (panel "Akun"), `src/components/companies/account-sheet.tsx`, `src/components/companies/activation-handoff.tsx`, `src/app/api/companies/route.ts` + `companies/users/route.ts` + `companies/users/activation/route.ts`, `src/lib/rbac.ts` (`ADMIN_PT_MANAGED_ROLES`, `canManageAccounts`), `src/lib/account-desk.ts` (`roleOutOfReachMessage`), `src/lib/account-activation.ts`, `src/lib/accounts.ts` (`UserRow`), `src/lib/password-policy.ts`. Kontrak jaringan: `AkunApi` + `DtosFase2Admin` (T6-C2); komponen `designsystem` F0/F1 (MkListRow/MkSheet/StatusBadge/MkChip/MkButton/MkField/MkIconBtn/ErrorNote/EmptyNote/MkSkeleton/MkOfflineBanner).

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/akun/AkunViewModel.kt` | @HiltViewModel: muat daftar, saring+car, aktif/nonaktif, setel ulang sandi, kelayakan+terbit aktivasi; kontrak lokal `MejaAkunListApi` (GET `/api/companies`); parsing defensif; sandi acak `SecureRandom` |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/akun/AkunScreen.kt` | Cari (MkField), chip peran (MkChip), daftar MkListRow + StatusBadge, `SheetAkunDetail` (MkSheet) dengan aksi + serah terima tautan + ikon salin, dialog konfirmasi nonaktifkan, snackbar |
| `android/docs/fase2/T6-C9-LAPORAN.md` | Dokumen ini |

## Sumber daftar akun — koreksi penting atas redaksi tugas

Tugas menulis "daftar akun PT sendiri (GET companies/users)". **GET `/api/companies/users` tidak mengembalikan daftar**: rutenya hanya melayani `?id=` → `{id, memberDivisionId}` (keanggotaan divisi satu akun); tanpa `id` ia membalas 404. Daftar akun milik **GET `/api/companies`** — persis yang dipakai web (`useResource<CompaniesData>('/api/companies')`): untuk Admin PT (`scope: "ENTITY"`) respons berisi satu perusahaan (PT-nya) dengan `users[]` seluruh akun PT itu, plus `me`, `scope`, `manageableRoles`. Layar ini mengikuti perilaku web tersebut.

Konsekuensi kontrak: `AkunApi` (T6-C2) tidak punya metode daftar, jadi antarmuka `MejaAkunListApi` dideklarasikan **lokal di paket ini** dan dibangun dari Retrofit tunggal AppModule — pola yang sama dengan `DailyInputApi` lokal T5-B5. Saat kontrak daftar akun resmi hadir di `core/network`, hapus antarmuka ini dan ganti pembuatannya di konstruktor ViewModel.

## DI

`AppModule` belum menyediakan `AkunApi` (zona T4-A8, dan menambah @Provides dari luar zona berisiko duplikat binding bila meja akun Super Admin dibuat agen lain). ViewModel menyuntik `Retrofit` lalu `retrofit.create(AkunApi::class.java)` sendiri — cookie jar dan baseUrl tetap tunggal, tanpa menyentuh graf Hilt.

## Fitur dan pemetaannya

| Fitur | Perilaku |
|---|---|
| Daftar | `MkListRow`: judul nama, sub "peran · email" (`ROLE_LABELS`), avatar inisial, trailing StatusBadge SM. Urut nama. |
| Saringan chip | `Semua / Admin PT / Kepala divisi / PIC proyek` — hanya posisi `ADMIN_PT_MANAGED_ROLES`; jumlah dihitung dari meja penuh (angka selalu tampil, termasuk 0). |
| Cari | MkField "Cari akun" — cocok pada nama, username, email, jabatan, label peran (lowercase contains), padanan web. |
| Status baris | `Nonaktif` (NEUTRAL) > `Wajib ganti sandi` (RISK, `hasPassword=false` → menunggu aktivasi) > `Aktif` (ON). Padanan eyebrow `account-sheet.tsx`. |
| Guard baca-saja | `bisaKelola = !adalahSaya && peran ∈ manageableRoles(server; cadangan ADMIN_PT_MANAGED_ROLES)`. Akun di luar itu (mis. DIREKTUR_ENTITAS di PT yang sama) tetap tampil dengan ikon gembok "Baca-saja" dan sheet-nya tanpa aksi + catatan "Posisi … hanya dapat dikelola Super Admin." (`roleOutOfReachMessage`, termasuk sebutan khusus "Direktur Perusahaan"). Akun sendiri: catatan "Akun Anda sendiri…", tanpa tombol. |
| Aktif/nonaktif | PATCH `{id, isActive}`. **Konfirmasi dialog hanya untuk nonaktifkan** (AlertDialog; tombol "Nonaktifkan" berwarna status-late). Mengaktifkan langsung jalan. Sukses → snackbar "Akun X dinonaktifkan/diaktifkan." + muat ulang. |
| Setel ulang sandi | PATCH `{id, password}` dengan sandi acak 14 karakter (`SecureRandom`, alfabet tanpa karakter mudah tertukar — sama dengan `generatePassword` web). Sandi **tidak pernah ditampilkan/disimpan/dicatat** — hanya hidup di dalam badan permintaan lalu dibuang. |
| Aktivasi | GET `activation?id=` saat sheet dibuka (hanya akun yang bisa dikelola); `canActivate` → bagian "Aktivasi akun" dengan tombol "Terbitkan tautan aktivasi" (POST). |
| Serah terima tautan | Bagian "Kirim tautan ke pengguna" (padanan `ActivationHandoff`): badge INFO "Menunggu aktivasi", kalimat tujuan, kedaluwarsa WIB ("Berlaku sekali hingga … WIB. Tautan sebelumnya tidak berlaku lagi."), URL gaya `code` dalam SelectionContainer + **ikon salin** (MkIconBtn ContentCopy) → `LocalClipboardManager.setText` + snackbar "Tautan aktivasi disalin.". |

### Soal "bila route mengembalikan tautan aktivasi" pada reset sandi

PATCH `/api/companies/users` hari ini membalas `{ok, account}` — **tidak** memuat tautan aktivasi (token hanya pernah keluar lewat POST `activation`). Cabang conditional itu diwujudkan begini: setelah reset sukses, kelayakan aktivasi dicek ulang (GET `activation?id=`); bila akun bisa diaktifkan (mis. akun persetujuan AKUN_BARU yang belum pernah masuk), sheet langsung menawarkan "Terbitkan tautan aktivasi" dan snackbar mengarahkan ke situ — pemegang akun membuat kata sandinya sendiri lewat tautan, sehiranya tidak ada sandi yang perlu diserahkan. Bila tidak layak, snackbar menjelaskan bahwa pemegang akun wajib mengganti sandi saat masuk berikutnya (efek `mustChangePassword` F1-C di sisi server). Bila kelak rute menambahkan tautan pada respons PATCH, tempat menampilkannya sudah tersedia (state `TautanAktivasi` di sheet).

## Keamanan

1. Tidak ada `android.util.Log` / pencatatan apa pun di kedua berkas; tautan aktivasi dan sandi tidak pernah menyentuh log.
2. Sandi acak hanya hidup di dalam `AkunUbahRequest` (parameter lokal), tidak masuk state/StateFlow.
3. Tautan aktivasi (token di fragmen) hanya hidup di `StateFlow` UI; URL dibangun dari `BuildConfig.BASE_URL` + `path` server.
4. Guard server tetap sumber kebenaran: 403 di luar jangkauan/PT, 409 akun sendiri/Super Admin terakhir/"sudah diingatkan"-style konflik, 422 pesan aman klien, 429 batas terbit (20/pengelola, 5/akun per 15 menit) — semuanya diterjemahkan `ApiError.dari(...).pesanTampil()` dan tampil di kotak galat sheet.

## Penanganan galat

| Kode | Sumber | Penanganan |
|---|---|---|
| 403 | meja bukan milik Anda / peran di luar jangkauan / pindah PT | `ApiError.Konflik` → pesan di sheet |
| 409 | nonaktifkan akun sendiri / Super Admin terakhir / kredensial aktivasi berubah | pesan server di sheet; daftar dimuat ulang hanya setelah sukses |
| 422 | sandi lemah dsb. | `ApiError.Validasi` → pesan di sheet |
| 429 | batas terbit aktivasi | `ApiError.TerlaluBanyakPesan` → "Coba lagi dalam N menit." |
| 401/jaringan/5xx | — | `ApiError.dari` terpusat; layar galat penuh (ErrorNote + Coba lagi) hanya untuk kegagalan memuat meja |

## Jahitan untuk integrasi (parent)

1. **Wire shell**: ADMIN_PT tidak punya tab `PERUSAHAAN` (padanan `ROLE_TABS` web — di web Admin PT membuka meja akun lewat panel Pengaturan). Pemasangan ada di zona navigasi: `AkunScreen(vm = hiltViewModel(), offline = …)`; tidak ada parameter lain.
2. **`MejaAkunListApi` lokal** → pindahkan ke `core/network` (mis. `CompaniesApi.meja()`) saat kontrak daftar resmi hadir; satu-satunya pemakaian ada di konstruktor `AkunViewModel`.
3. **`AkunApi` @Provides** di AppModule saat meja penuh Super Admin (T6-x lain) dibuat — hapus `retrofit.create` lokal bila binding pusat tersedia.
4. `hiltViewModel` memakai jalur `androidx.hilt.lifecycle.viewmodel.compose` (sama dengan `MkNavHost`/`MKShell` terkini); `ui/laporan` masih memakai jalur lama — penyeragaman di tugas integrasi.
5. Layar sengaja tidak memakai `holdingUsers` (akun tingkat grup milik meja penuh Super Admin) dan mengabaikan `scope: ALL` bila suatu saat dibuka Super Admin — guard `manageableRoles` tetap membuat akun di luar wewenang baca-saja.

## Yang sengaja tidak dikerjakan (di luar cakupan tugas)

- Tambah akun (POST) dan hapus akun (DELETE) — tugas hanya meminta versi terbatas: lihat/aktif/nonaktif/reset/aktivasi. `AkunApi.tambah/hapus/keanggotaan` sudah tersedia untuk tugas lanjutan.
- Edit identitas/jabatan/peran/penempatan dan keanggotaan divisi (`memberDivisionId`) — formulir lengkap milik sheet web; perlu kontrak divisi/proyek untuk pilihan.
- Aksi massal "Pilih/N akun dinonaktifkan + Urungkan" milik panel Akun web — membutuhkan `UndoApi`; menyusul.
- Uji unit/UI dan kompilasi (gradle dilarang tugas ini); tanda tangan mengikuti pola F0 yang sudah terbangun (`ApiError.dari`, DTO T6-C2, komponen designsystem).
