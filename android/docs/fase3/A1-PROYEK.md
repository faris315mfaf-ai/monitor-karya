# A1 — Tab Proyek (Fase 3, gelombang A1)

Agen pembangun A1, 13 Oktober 2026. Lingkup: `android/feature/proyek/**` saja.
Paritas web: `src/components/views/projects-view.tsx` + bagian detail dari
`src/components/pic/stages.tsx` dan `src/components/oversight/company-reports.tsx`.

Status: `:feature:proyek:compileDebugKotlin` hijau, `:feature:proyek:testDebugUnitTest`
hijau — 31 tes (KontrakDtoTest 7, TampilanTest 7, ProyekViewModelTest 17).

## Titik masuk

```kotlin
// paket id.co.monitorkarya.feature.proyek
@Composable fun ProyekTab(peran: Peran, modifier: Modifier = Modifier)
```

Memakai `hiltViewModel()` (`androidx.hilt.lifecycle.viewmodel.compose`) → `ProyekViewModel`.
`ProyekModule` (`@InstallIn(SingletonComponent)`) menyediakan `ProyekApi` dari `Retrofit` bersama AppModule.

## Fitur

| Bagian | Isi | Izin (dari server) |
| --- | --- | --- |
| Kepala | Konteks, judul, satu kalimat jawaban (`answerFor`), kalimat dukungan dari `summary` | — |
| Saringan | Chip siklus (Aktif/Diusulkan/Ditolak/Ditutup/Diarsipkan/Semua), pilih tahap, cari (jeda 350 ms) | — |
| Antrean | "Menunggu keputusan Anda": Setujui di tempat (Urungkan), Tolak → detail dengan alasan | `permissions.approve` |
| Daftar | Baris proyek: PT · PIC · tenggat, lencana status (warna+ikon+kata), progres; "Muat lagi" (20/halaman) | — |
| Detail (Sheet) | Lencana, cincin progres, tenggat, laporan terakhir/terlambat, alasan risiko, PT/region, PIC, divisi, rentang tanggal, PT terkait, tag fase/siklus/tanpa persetujuan, penjelasan, tujuan, rantai persetujuan (ikon+kata per slot), alasan penolakan | — |
| Keputusan pengajuan | Setujui / Tolak (alasan ≥ 5 huruf) + Urungkan | `permissions.approve` |
| Ajukan ulang | Tanpa konfirmasi, Urungkan | `permissions.resubmit` |
| Ubah proyek | Formulir yang sama dengan web, termasuk ganti status (Aktif/Ditutup/Diarsipkan) | `permissions.manage`, `setLifecycle` |
| Hapus | Konfirmasi; 409 `canArchive` → konfirmasi arsip → PATCH DIARSIPKAN + Urungkan | `permissions.manage` |
| Ajukan proyek | PT pemilik (peran global), nama, penjelasan, tujuan, tahap awal, PIC, divisi, tanggal, PT terkait, lewati persetujuan (tahap awal) | tombol tampil hanya bila `GET ?options=1` 200 |
| Tahapan | Daftar tahap bertanggal + "n dari m selesai"; Sheet Atur tahapan: tambah/ubah/urutkan/hapus (konfirmasi) | `canEdit` dari project-stages |
| Tenggat | Sisa hari, usulkan tenggat (Sheet), tarik usulan (Urungkan = ajukan kembali), setujui/tolak usulan (Urungkan ≤ 15 menit) | `canEdit`, `canDecide` |
| Riwayat laporan | 10 laporan terbaru: tanggal · progres, capaian, kendala, pengirim, terlambat, lencana status | server (cakupan pelaksana) |
| Output | Judul, target, bukti, pemilik, catatan revisi, lencana status (baca saja) | server |
| Eskalasi terkait | Eskalasi `DAILY_REPORT` yang `sourceId`-nya laporan proyek ini; "Lewat SLA" bila overdue | server |
| Status | Kerangka memuat, galat + Coba lagi, kosong (Hapus saringan / Ajukan proyek), galat per bagian detail tanpa menjatuhkan bagian lain | — |

Pengajuan/penolakan (DIUSULKAN/DITOLAK) tidak memuat progres, tahapan, laporan,
output, eskalasi — sama dengan web (dan PIC tanpa proyek akan 403 di guard).

## Kontrak endpoint (diverifikasi terhadap `src/app/api/**`)

| Metode | Rute | Badan / query | Respons dipakai |
| --- | --- | --- | --- |
| GET | `/api/projects` | `page, pageSize=20, lifecycle, phase?, search?, id?` | `{items[format()], total, page, pageSize, summary}` |
| GET | `/api/projects?options=1` | `entityId?` | `{entity, entityPinned, entities, candidates, divisions, chain, picIsSelf}`; 403 = tidak boleh mengajukan |
| POST | `/api/projects` | `{name, description, purpose, phase, picUserId, divisionId, startDate, targetEndDate, relatedEntityIds, entityId?, skipApproval?}` | `{ok, project}`; 422 `{error, errors[]}` |
| PATCH | `/api/projects` | ubah: semua kolom + `relatedEntityIds` selalu; `divisionId`/`lifecycle` hanya bila berubah · `{id, lifecycle}` · `{id, resubmit:true}` | `{ok, project, undoToken?}` |
| DELETE | `/api/projects?id=` | — | `{ok}`; 409 `{error, activity, canArchive}` |
| POST | `/api/projects/approve` | `{projectId, decision, note}` | `{ok, lifecycle, pending, undoToken}`; 403 giliran slot, 409 berubah, 422 alasan |
| GET/POST/PUT/PATCH/DELETE | `/api/project-stages` | GET `?projectId`; POST `{projectId,name,startDate,dueDate,status,note}`; PUT `{id,…}` (null eksplisit mengosongkan tanggal); PATCH `{projectId, order}`; DELETE `?id` | `{projectId, targetEndDate, proposedEndDate, canEdit, done, total, items}` |
| GET/POST/PATCH | `/api/deadline-proposals` | GET `?projectId`; POST `{projectId, proposedDate, reason}`; PATCH `{id, action: withdraw/approve/reject/undo, note?}` | `{items, canDecide}` |
| GET | `/api/daily-reports` | `projectId, pageSize=30` | `{items, total}` (30 diambil untuk pencocokan eskalasi, 10 ditampilkan) |
| GET | `/api/outputs` | `projectId` | `{items, counts, total}` |
| GET | `/api/escalations` | `entityId, pageSize=200` | `{items}` disaring klien per `sourceId` laporan proyek |
| POST | `/api/undo` | `{token}` | `{ok, message}` |

Galat: semua lewat `panggil()` → `ApiError.dari(HttpException)` (core:network): 401
sesi berakhir (interceptor MkClient tetap memicu kembali ke layar masuk), 403 pesan
server, 409 konflik, 422 `Validasi.errors` ditampilkan sebagai daftar. Badan galat
disalin agar kolom tambahan (`canArchive`) tetap bisa dibaca.

## Keputusan

1. **Izin tidak ditebak.** Tombol aksi hanya dari `permissions.*`, `canEdit`, `canDecide`;
   "Ajukan proyek" dari keberhasilan `GET ?options=1` (403 = sembunyi). Parameter
   `peran` hanya untuk teks kosong PIC.
2. **DTO lokal modul** (bukan `ProjectDto` core) supaya kontrak tab ini dikunci tesnya sendiri;
   bawaan aman untuk kolom opsional; `mkJson` (`encodeDefaults=false`) dimanfaatkan untuk
   melewatkan `divisionId`/`lifecycle`/`skipApproval` yang tidak berubah, sedangkan
   `relatedEntityIds` dan tanggal tahap tanpa bawaan agar selalu terkirim (bisa dikosongkan).
3. **Status proyek** via `StatusProyek.hitungLengkap` (core:domain) dengan `tenggatInstan`
   (instan server, T12 #10); pengajuan/arsip/tutup memakai label siklus seperti `projectState` web.
4. **Daftar halaman bertambah** ("Muat lagi") menggantikan navigasi halaman web — ponsel-first.
   Respons lama dibuang lewat nomor permintaan.
5. **Eskalasi terkait**: server belum punya saringan `projectId`; diambil per PT lalu dicocokkan
   ke id laporan proyek (30 terbaru). Eskalasi dari laporan lebih lama tidak tampil.
6. **Konfirmasi hanya untuk hapus** (proyek, tahap) dan arsip-setelah-hapus-ditolak (mengikuti web);
   setujui/tolak/ajukan ulang/arsip/tarik usulan memakai snackbar Urungkan.
7. Editor tahapan & usul tenggat tampil sebagai Sheet pengganti Sheet detail (tidak bertumpuk).
8. **Tidak dibuat** (tidak ada di projects-view web): linimasa proyek, buka kunci laporan
   (`/api/unlock-requests` tidak dipakai dari detail proyek web), kelola output (ada di meja PIC/kadiv).

## Butuh parent

1. Pasang di `MKShell`: `tab == TabId.PROYEK -> ProyekTab(peran = peran)` untuk semua peran
   (dependensi `:feature:proyek` sudah ada di `app/build.gradle.kts`). `:app:assembleDebug`
   belum dijalankan agen ini — graf Hilt (`ProyekModule`, `ProyekViewModel`) perlu diverifikasi parent.
2. `:designsystem` belum punya: varian tombol destructive (dibuat lokal `TombolBahaya`),
   kolom tanggal ber-DatePicker (`KolomTanggal`), kotak catatan bernada (`KotakCatatan`),
   `Tag`, `FlowDiagram`/langkah rantai, `ProjectRow` dengan teks status kustom. Semua lokal di
   `ui/Komponen.kt`; layak dipindah ke designsystem.
3. `ProjectsApi`/`ProjectDto` di core:network kini kembar sebagian dengan DTO modul ini;
   pilih salah satu sumber saat konsolidasi.
4. Server (opsional): saringan `projectId` di `GET /api/escalations` agar eskalasi terkait
   tidak dibatasi 30 laporan terakhir.

## Berkas

- `feature/proyek/src/main/kotlin/id/co/monitorkarya/feature/proyek/ProyekTab.kt`
- `…/data/ProyekDto.kt`, `ProyekApi.kt`, `Panggil.kt`; `…/di/ProyekModule.kt`
- `…/domain/Tampilan.kt` (port projectState/answerFor/supportFor/approvalSteps + label)
- `…/ui/ProyekViewModel.kt`, `ProyekUiState.kt`, `ProyekLayar.kt`, `DetailProyekSheet.kt`,
  `FormProyekSheet.kt`, `TahapanSheet.kt`, `Komponen.kt`
- `feature/proyek/src/main/res/values/strings_proyek.xml`
- Tes: `feature/proyek/src/test/kotlin/id/co/monitorkarya/feature/proyek/{Fixture,KontrakDtoTest,TampilanTest,ProyekViewModelTest}.kt`
