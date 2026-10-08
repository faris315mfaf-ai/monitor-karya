# Laporan T5-B4 — Layar Meja Kerja PIC (Fase 1)

Disusun agen T5-B4-ULANG, 8 Oktober 2026 (tugas sebelumnya putus sebelum menulis apa pun). Zona tulis: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/mejakerja/` saja (+ dokumen ini). Tanpa git/jaringan/DB; gradle TIDAK dijalankan sesuai batas tugas (pembangunan oleh parent). Acuan perilaku: `src/components/views/work-desk-view.tsx` + `src/components/work-desk/pic-desk.tsx` (web), `src/app/api/work-desk/route.ts` (cabang PIC), `android/core/network/api/WorkDeskApi.kt` + `dto/DtosFase1.kt` (T5-B1), komponen designsystem F0/F1.

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/mejakerja/MejaKerjaViewModel.kt` | @HiltViewModel + state `Memuat/Sukses(data)/Galat(pesan)` + modul DI lokal `MejaKerjaModule` (WorkDeskApi + TasksApi dari Retrofit tunggal) + susunan data murni (`susunMeja`, `sisaTeks`, `subTugas`, `jamWib`) |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/mejakerja/MejaKerjaScreen.kt` | LazyColumn: kepala t-title-3 + kalimat jawaban + ringkasan, MkCard StatTile "Tugas selesai x dari y" + tombol cepat, daftar tugas MkListRow + StatusBadge, skeleton/ErrorNote/EmptyNote, pratinjau `@PreviewGanda` |
| `android/docs/fase1/T5-B4-LAPORAN.md` | Dokumen ini |

## Kontrak T5-B8 — dipenuhi persis

`MKShell.IsiTab` memanggil `MejaKerjaScreen(vm = hiltViewModel(), onBukaLaporan = …, onBukaTugas = …)`. Tanda tangan yang mendarat:

```kotlin
@Composable
fun MejaKerjaScreen(
    vm: MejaKerjaViewModel,
    onBukaLaporan: () -> Unit,
    onBukaTugas: () -> Unit,
    modifier: Modifier = Modifier,
)
```

Catatan nama: brief menyebut parameter `viewModel`, tetapi pemanggil nyata (MKShell, laporan T5-B8) memakai **`vm`** — mengikuti layar tetangga (`LaporanHarianScreen(vm = …)`) dan panggilan bernama di MKShell, parameter dinamai `vm`. Tipe tetap `MejaKerjaViewModel`, urutan parameter sama; MKShell dikompilasi tanpa jahitan.

## Sumber data: WorkDeskApi (T5-B1, dipakai langsung) + TasksApi per proyek

- `GET /api/work-desk` (cabang PIC, `WorkDeskApi.meja()`) memberi ringkasan otoritatif per proyek: `tasks {total, done, blocked}`, `report` hari ini, `countdown/locked/cutoffLabel`, `remindedAt/remindedBy`. Tidak ada DTO lokal — `WorkDeskPicResponse`/`PicProyekDto`/`PicTugasHariIniDto`/`CountdownDto` diimpor dari `core/network` (instruksi "pakai itu, jangan port lokal" dipenuhi; beda dengan B5 yang menulis port lokal sebelum T5-B1 mendarat).
- Judul + jam tugas harian **tidak ada** di respons work-desk (hanya hitungan). Daftar baris tugas diambil dari `TasksApi.perHari(projectId)` (GET `api/tasks` tanpa `date` = hari ini) untuk setiap proyek PIC **secara paralel** (`coroutineScope + async/awaitAll`). Kegagalan satu proyek ditelan (`runCatching … getOrDefault(kosong)`) — daftar tugas proyek itu kosong, angka ringkasan tetap dari work-desk. Kegagalan `meja()` → `Galat` layar penuh.
- Dekode respons untuk KADIV/ADMIN memang gagal (DTO hanya cabang PIC) — sesuai kontrak DtosFase1 ("menunggu Fase 2"); layar ini hanya dipasang untuk `PIC_PROYEK` di MKShell.

## DI: modul lokal pola LaporanModule

`AppModule` baru membinding `AuthApi` + `RingkasanApi`. Sesuai instruksi brief ("ikuti pola modul lokal layar tetangga bila API belum dibinding pusat"), `MejaKerjaModule` (@Module @InstallIn(SingletonComponent)) menyediakan `WorkDeskApi` dan `TasksApi` dari Retrofit tunggal. **Saat parent membinding keduanya di AppModule, hapus MejaKerjaModule tanpa mengubah pemakaian** (komentar sama tertanam di kode). Tidak ada binding ganda hari ini (dicek: hanya AppModule, LaporanModule, AkunViewModel yang membuat API; TasksApi belum dibinding siapa pun).

## Struktur layar (versi ponsel PicDeskView)

1. **Kepala** — judul `R.string.layar_meja_kerja` ("Meja kerja", token B8) gaya `title3` (t-title-3); kalimat jawaban body ink: "Ada n tugas hari ini, m selesai." (varian: "Belum ada tugas untuk hari ini." bila n=0; "Belum ada proyek aktif yang Anda pegang." bila PIC tanpa proyek); ringkasan footnote ink2: tenggat cutoffLabel + sisa countdown → "Tenggat 17.00 WIB, 2 jam 15 menit lagi." / "…sudah lewat; laporan hari ini terkunci.", keadaan laporan "k dari n laporan belum terkirim." / "Semua laporan hari ini sudah terkirim.", pengingat "X mengingatkan pukul HH.mm." (padanan `support` web; cutoffLabel server sudah menyertakan "WIB").
2. **Kartu ringkas** (satu MkCard, hanya bila ada proyek aktif) — StatTile INSET "Tugas selesai" nilai "x dari y", delta "p% hari ini" (tone ON bila semua selesai; "Tambahkan tugas hari ini" bila y=0 — padanan StatTile "Task selesai" web) + dua tombol cepat: **"Isi laporan harian" PRIMARY** → `onBukaLaporan` (dinonaktifkan bila `locked && laporanBelumTerkirim > 0`, aturan yang sama dengan tombol Hero web) dan **"Kelola tugas" SECONDARY** → `onBukaTugas`. Satu primer per kartu, sesuai aturan desain.
3. **Daftar tugas hari ini** — label kecil "Tugas hari ini" + MkCard(padding space1) berisi `MkListRow` (komponen F1 designsystem, sudah ada): judul = judul tugas, sub = "Nama proyek · 08.00–10.00 WIB" (jam dari `startAt/endAt` ISO diformat HH.mm WIB; hanya mulai → "mulai HH.mm"; tanpa jam → nama proyek saja), trailing `StatusBadge` SM (warna+ikon+kata). Urut `startAt` lalu judul. Baris diklik → `onBukaTugas` (detail tugas dibuka layar kelola tugas, bukan pindah halaman sendiri).
4. **Keadaan kosong** — PIC tanpa proyek: MkCard + EmptyNote "Belum ada proyek aktif yang Anda pegang…" (KPI/tombol disembunyikan — padanan return dini PicDeskView). Ada proyek tapi tanpa tugas: MkCard + EmptyNote "Belum ada tugas untuk hari ini…".
5. **Skeleton** (Memuat) — LazyColumn kerangka: blok kepala + kartu 168dp + 4 baris 56dp (`MkSkeleton`, denyut, hormat reduced-motion).
6. **Galat** — `ErrorNote` (role=alert) + "Coba lagi" → `vm.ulang()`.

## Pemetaan status task → MkStatus (sesuai brief)

| Status server | MkStatus | Label badge |
|---|---|---|
| `BELUM_MULAI` | NEUTRAL | Belum mulai |
| `BERJALAN` | ON | Berjalan |
| `SELESAI` | DONE | Selesai |
| `TERKENDALA` | RISK | Terkendala |
| `MENUNGGU_KEPUTUSAN` | **RISK** | Menunggu keputusan |
| lainnya | NEUTRAL | string mentah |

Catatan deviasi sadar: web `TASK_STATUS_META` memetakan `MENGGU_KEPUTUSAN` → `info`, brief T5-B4 menetapkan **RISK** — brief yang diikuti (komentar tertanam di `mkStatusTugas`); bila parent ingin paritas penuh dengan web, ubah satu baris itu ke `MkStatus.INFO`.

## Yang TIDAK dibawa dari web (batas Fase 1 ponsel)

DeadlineRing/CountUp, riwayat 10 hari (DayStrip), antrean laporan per proyek dengan pilihan proyek, OutputsCard/NotesCard, aksi centang tugas langsung dari meja (POST/PUT /api/tasks dari layar ini), dan cabang KADIV/ADMIN — menyusul fase berikutnya. `remindedAt/remindedBy` dipakai sebagai kalimat pengingat di ringkasan (web: catatan di baris antrean).

## Verifikasi

Tanpa gradle (batas tugas). Terverifikasi manual terhadap sumber: bentuk respons `picDesk()` route work-desk = `WorkDeskPicResponse` field-per-field; kontrak MKShell (nama parameter `vm`, urutan, paket `id.co.monitorkarya.app.ui.mejakerja`); signature komponen designsystem (`MkCard`, `StatTile`, `StatusBadge`, `MkListRow`, `MkSkeleton`, `EmptyNote`, `ErrorNote`, `MkButton`); pola DI tetangga; `cutoffLabel` = "HH.00 WIB" (`hourLabel` lock.ts); enum Task status `BELUM_MULAI | BERJALAN | SELESAI | TERKENDALA | MENUNGGU_KEPUTUSAN` (schema.prisma). `:app` belum dikompilasi sampai B7 (`ui/proyek`) mendarat — MKShell mengimpor `ProyekScreen` yang belum ada (dirancang demikian oleh swarm paralel, lihat laporan B8).

## Catatan untuk parent

- Indeks `android/docs/fase1/README.md` baris T5-B4 masih "*belum ada* / belum — MKShell menunggu" — mohon perbarui ke laporan ini (README di luar zona tulis agen).
- Saat membinding `WorkDeskApi`/`TasksApi` di AppModule, hapus `MejaKerjaModule` (satu objek kecil di ViewModel file).
