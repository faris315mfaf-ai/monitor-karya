# T6-C5 — Laporan Fase 2: layar Capaian Mingguan Kepala Divisi

Tanggal: 8 Oktober 2026 · Zona: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/mingguan/` (hanya berkas baru) + laporan ini · Tanpa git/jaringan/DB/gradle.

## Berkas baru

| Berkas | Isi |
| --- | --- |
| `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/mingguan/MingguanViewModel.kt` | `@HiltViewModel` + model tampilan + pemetaan DTO T6-C1 + kosakata status/waktu + `MingguanModule` (DI) |
| `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/mingguan/MingguanScreen.kt` | Layar papan tiga kolom + ButirSheet + footer sticky + pratinjau |

## Sumber kebenaran yang dibaca

`src/app/api/weekly-input/route.ts` (GET/PUT/PATCH/DELETE/POST), `src/components/views/weekly-input-view.tsx` + `src/components/division-weekly-desk.tsx`, `src/lib/lock.ts` (`weeklyDeadlines`, `weeklyWriteBlock`, `WEEKLY_ITEM_STATUSES`, `validateWeeklyItem`), `src/lib/constants.ts` (`WEEKLY_STATUS_META`, `WEEKLY_HEADER_META`), `docs/design/peran/03-kepala-divisi.md`; Android: `WeeklyInputApi` + `DtosFase2Kadiv` (T6-C1), `LaporanViewModel`/`LaporanHarianScreen` (T5-B5, pola), designsystem `MkBoardColumn`/`MkSheet`/`MkField`/`MkPilih`/`MkSegmented`/`MkFAB`/`StatusBadge`/`EmptyNote`.

## Kejadian penting: T6-C1 mendarat di tengah tugas

Saat tugas mulai, `WeeklyInputApi`/`WeeklyReportsApi` belum ada (pola kontrak lokal T5-B5 disiapkan lebih dulu). T6-C1 mendarat saat layar sedang ditulis, jadi ViewModel **langsung memakai `WeeklyInputApi` + DTO asli** (`WeeklyInputResponse`, `WeeklyItemSaveRequest`, `WeeklyMovesRequest`, `WeeklyAksiRequest.serahkan/setujui`) — kontrak lokal dibuang.

- T6-C1 belum menyediakan module Hilt untuk `WeeklyInputApi`, jadi `MingguanModule` (internal, di paket ini) menyediakannya dari Retrofit tunggal AppModule — **hapus saat T6-C1 (atau integrator) memindahkannya ke DI pusat** agar tidak dobel `@Provides`.
- Catatan kontrak: `WeeklyItemDto.workDate` berdokumentasi "YYYY-MM-DD", padahal rute GET menyebarkannya sebagai ISO datetime (JSON.stringify Date; tengah malam WIB = 17.00 UTC hari sebelumnya). Pemetaan `kunciHari()` menoleransi keduanya: ISO → `LocalDate` WIB, atau kunci tanggal apa adanya.

## Perilaku (padanan web + keputusan Android)

### Status UI
`MingguanUiState`: `Memuat` (kerangka) → `Sukses(papan)` | `Galat(pesan, ErrorNote + coba lagi)`. Papan memuat GET tanpa parameter = minggu berjalan (pemilih minggu lampau menyusul; `WeeklyInputResponse.weeks` sudah tersedia di DTO).

### Kepala layar
"Minggu ke-41 · 5–11 Oktober 2026" + `StatusBadge` statusHeader (Draf/Menunggu persetujuan/Disetujui/Terkunci; `WEEKLY_HEADER_META`) + kalimat ringkas **"x dari y butir selesai"** + kalimat tenggat serah dengan hitung mundur sederhana: "Serah paling lambat Kamis 17.00 WIB · sisa 1 hari 3 jam"; setelah lewat tenggat serah tetapi sebelum kunci: "Tenggat serah … sudah lewat · minggu dikunci Jumat 17.00 WIB"; setelah kunci: kalimat ajukan buka kunci. Hari/jam dihitung dari `handoverBy`/`lockAt` di WIB — bukan konstanta.

### Papan tiga kolom status (bukan per hari seperti web)
`bagiKolom`: BELUM_MULAI/NA → **Belum**; ON_PROGRESS/TERKENDALA → **Berjalan**; SELESAI → **Selesai**. Kartu tetap membawa `StatusBadge` kata persis (Belum mulai/Terkendala/N/A) sehingga aturan warna+ikon+kata terjaga.
- ≥600dp: tiga kolom `Row` berbobot; <600dp: `MkSegmentedControl` (Belum n · Berjalan n · Selesai n) bergilir, kolom awal = kolon berisi pertama (berjalan → belum → selesai).
- **Baca-saja memakai `MkBoardColumn`** (T6-C5 memakai komponen desain). **Sunting memakai kartu lokal** dengan bahasa visual yang sama (inset surface-2 + garis 1dp + radius kartu + trek progres + tombol urut 32dp) karena `MkBoardColumn` belum menyediakan slot klik-kartu dan label statusnya memakai kata generik `MkStatus.label` — usulan tindak lanjut designsystem: tambah `onKlik: ((MkKartuPapan) -> Unit)?` dan teks lencana opsional.

### Naik/turun urutan (PATCH reorder — ada di rute)
Rute PATCH menyusun kartu **per lajur hari** (`workDate` + `position`), sedangkan papan Android per status. Maka tukar posisi hanya dilakukan dengan **tetangga selajur** (hari kerja sama) di kolom yang sama; tombol dimatikan bila tidak ada (`bisaPindah`). `workDate` butir dikirim balik sebagai kunci "YYYY-MM-DD" WIB agar kartu tidak pindah lajur. Pembaruan optimistik: daerah lokal ditukar lebih dulu, PATCH menyusul; gagal → muat ulang + banner galat. Reorder tidak menarik laporan ke draf (sesuai rute).

### ButirSheet (tambah/ubah/baca)
`MkSheet` dengan aspek (`MkPilih`), prioritas (`MkPilih`), pekerjaan wajib, target output wajib, PIC wajib (server `validateWeeklyItem`), status (`MkPilih`, lima `WEEKLY_ITEM_STATUSES`), progres % (papan angka + akhiran %), capaian minggu ini wajib, kendala (wajib bila Terkendala), tindak lanjut. Pra-validasi klien `cekIsian` meniru 422 rute (bukan pengganti). Tutup dengan isian kotor → dialog "Buang perubahan?". Hapus butir (hanya ubah) → dialog konfirmasi → DELETE ?itemId=. Isian diikat ke `(versiForm, id)`; setelah 409 beku + muat ulang, isian diikat ulang dari data server. Subtask/tags/bukti belum diedit di Android, tetapi **dikirim balik apa adanya** saat menyunting (rute MENGGANTI daftar tags/subtask dengan yang dikirim — array yang hilang dibaca kosong, jadi tanpa ini suntingan Android akan menghapus subtask/tag yang dibuat web); pelampiran bukti menyusul bersama task bukti.

### Footer sticky (maks 1 primer kontekstual)
- `DRAFT` (atau laporan belum ada): **"Simpan draf" SEKUNDER + "Serahkan" PRIMER** (nonaktif tanpa butir — rute 422 "Belum ada item").
- `MENUNGGU_PERSETUJUAN` + `canApprove`: **"Setujui laporan" PRIMER**.
- `DISETUJUI`/`TERKUNCI`/beku: tanpa footer.
- Makna "Simpan draf": setiap butir tersimpan saat diedit (PUT per butir), jadi tombol ini menutup suntingan terbuka + menarik ulang draf dari server (menyerap perubahan bersamaan) + snackbar "Semua perubahan butir tersimpan" — tidak ada endpoint simpan-draf tingkat laporan.

### Kunci/beku (409) dan "Ajukan buka kunci"
Semua tulisan (PUT/PATCH/DELETE/POST) lewat `ApiError.Konflik` → banner `GalatAksi.Beku(pesan, reportId)` di layar atau `GalatSheet.Beku` di dalam sheet, plus **tombol "Ajukan buka kunci"** yang memanggil callback `onAjukanBukaKunci(reportId)` (alur POST /api/unlock-requests dipegang layar lain — sama seperti LaporanHarianScreen). `reportId` tidak dikirim rute weekly-input, jadi diambil dari laporan divisi termuat. Setelah 409, papan dimuat ulang agar ikut terkunci. Keadaan baca-saja dari GET (`writable=false`) → `CatatanKunci` (alasan `lockReason`, lencana "Dibuka sampai HH.mm WIB" bila `unlockUntil`, tombol ajukan bila laporan ada). `DISETUJUI` → EmptyNote done; `TERKUNCI` → EmptyNote gembok; keduanya tanpa FAB/footer/tombol tulis. Tulisan hanya terbuka pada `DRAFT` yang `writable` — menyunting butir laporan yang sudah diserahkan menariknya kembali ke draf (backToDraft rute), jadi MENUNGGU/DISETUJUI dibaca saja di Android supaya tidak ada penarikan diam-diam (web mengizinkan dengan pesan; disederhanakan di sini).

### Divisi lebih dari satu
GET membawa semua divisi yang dipimpin; bila >1 tampil `MkPilih` "Divisi" (pemilihan murni klien dari data termuat).

## Integrasi (di luar zona tugas ini)

- **MKShell belum memasang tab CAPAIAN_MINGGUAN** ke layar ini (zona `navigation/` milik tugas lain). Pemasangan yang disarankan di `IsiTab`:
  `peran == Peran.KEPALA_DIVISI && tab == TabId.CAPAIAN_MINGGUAN -> MingguanScreen(vm = hiltViewModel(), onAjukanBukaKunci = { id -> /* buka sheet pengajuan buka kunci */ })` (TI/SUPERADMIN menyusul sesuai kebutuhan).
- `offline` dipegang pemanggil (pemantau konektivitas belum ada, padanan F0/F1).

## Verifikasi

Gradle dilarang tugas ini — belum dikompilasi. Tanda tangan mengikuti komponen yang sudah terbangun (dibaca ulang setelah T6-C1 dan designsystem mendarat); keseimbangan kurung diperiksa. Hal yang perlu diperiksa saat build pertama: impor `warnaStatus`/`tabular` (ekstensi publik designsystem), smart-cast `galat.reportId` dalam lambda (pola sama dengan LaporanHarianScreen yang sudah terbangun), dan dobel `@Provides` bila T6-C1 kemudian menambah module `WeeklyInputApi` sendiri.
