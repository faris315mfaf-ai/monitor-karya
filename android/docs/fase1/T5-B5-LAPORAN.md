# Laporan T5-B5 — Layar Laporan Harian PIC (Fase 1)

Disusun agen T5-B5, 8 Oktober 2026. Zona tulis: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/laporan/` saja (+ dokumen ini). Tanpa git/jaringan/DB; gradle tidak dijalankan (pembangunan oleh parent). Acuan perilaku: `src/components/views/daily-input-view.tsx` (web), `src/app/api/daily-input/route.ts` (GET/PUT/DELETE), `src/lib/lock.ts` (`validateDailyReport`, `DAILY_STATUSES`), `src/lib/daily-rollup.ts` (`dailyGate`), `android/designsystem/components/**`.

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/laporan/LaporanViewModel.kt` | @HiltViewModel + kontrak `DailyInputApi` lokal (port sementara T5-B1) + DTO PUT + parsing GET defensif + kosakata status/format waktu WIB |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/laporan/LaporanHarianScreen.kt` | Dua tingkat: daftar "Proyek Anda hari ini" + FormLaporanSheet (MkSheet) + FAB + dialog buang perubahan + banner terlambat + snackbar; port lokal MkListRow/MkField/MkPilih |
| `android/docs/fase1/T5-B5-LAPORAN.md` | Dokumen ini |

## Sumber data: satu GET, tanpa projectId

Pertanyaan tugas "GET daily-input per proyek? ia butuh projectId?" — **tidak**. `GET /api/daily-input` (tanpa parameter) mengembalikan seluruh meja kerja: `projects[]` berisi semua proyek tanggung jawab akun (PIC: `picUserId`; Admin PT: PT-nya; TI/Superadmin: semua) beserta `report` hari ini per proyek, `taskCount`, `derived`, `editable`, `lockReason` (FORWARDED/LOCKED/TIME), `unlock`, plus level atas `lockAt`, `locked`, `countdown`, `canRequestUnlock`. ProjectsApi/`reportedToday` tidak diperlukan. Parsing dilakukan defensif (semua field opsional, padanan pola RingkasanViewModel) sehingga bentuk respons lama/baru sama-sama diterima.

Fase 1 Android hanya membuka **hari ini** (tanpa parameter `date`); `openDays` (tanggal lampau yang sedang dibuka lewat buka kunci) diabaikan dulu — menyusul bersama navigasi tanggal.

## Pemetaan field (PUT /api/daily-input)

| Form Android (`IsianLaporan`) | JSON rute | Catatan |
|---|---|---|
| status (chip MkPilih) | `status` | 4 opsi rutin + `MENUNGGU_KEPUTUSAN` hanya bila laporan tersimpan sudah memakainya (kosakata server lebih luas dari picker; lihat "Keputusan UX" no. 3) |
| progres (MkField angka, 0–100, "%") | `progressPct` | Hanya tampil bila hari **tanpa tugas** (`derived=false`); di-clamp `coerceIn(0,100)` |
| capaian (MkField 3 baris) | `achievementToday` | Wajib; dibatasi 4000 karakter di klien (sama dengan `slice(0,4000)` server) |
| kendala (MkField 2 baris) | `obstacle` | `null` bila kosong; wajib bila status TERKENDALA/MENUNGGU_KEPUTUSAN (pra-validasi ramah + 422 server) |
| tindak lanjut / "Rencana besok" (MkField 2 baris) | `followUp` | `null` bila kosong; wajib bila TERKENDALA (aturan `validateDailyReport`) |
| — | `projectId`, `action` | `action` = `"save"` (draf) / `"submit"` (kirim) |
| — | `reportDate` | Tidak dikirim (hari ini) |
| — | `decisionRequestedFrom` | Tidak ada di formulir Fase 1 (di web diisi lewat panel keputusan); menyusul |

Jawaban PUT yang dipakai: `ok`, `reportId`, `submitted`, `derivedFromTasks`. `undoToken` dan `isLate` **diurai defensif** — rute daily-input belum mengirim keduanya hari ini (bandingkan `escalations/actions` yang memang mengirim `undoToken`); bentuk DTO sudah siap sehingga saat rute menambahkannya tidak ada perubahan klien.

## Penanganan galat

| Kode | Bentuk rute | Penanganan Android |
|---|---|---|
| 409 | `{error, locked, frozen?, reportId}` (laporan dibekukan/diterkunci — `dailyGate`/`frozenMessage`; juga tabrakan simpan bersamaan P2002) | Dipetakan sendiri (bukan lewat `ApiError.dari`, karena 409 di `ApiError.dariHttp` jatuh ke `Lainnya`) menjadi `ApiError.Konflik` → `GalatForm.Beku(pesan, reportId)`; sheet menampilkan kotak galat + tombol **"Ajukan buka kunci"** (callback `onAjukanBukaKunci(reportId)` ke pemanggil — alur POST `/api/unlock-requests` dipegang layar lain). Meja dimuat ulang agar formulir ikut terkunci (padanan `onSaved()` web saat 409) |
| 422 | `{error, errors[], evidenceCount}` (validasi `validateDailyReport`: status & capaian wajib; kendala wajib utk Terkendala/Menunggu keputusan; tindak lanjut wajib utk Terkendala; bukti ≥1 kecuali Tanpa perubahan) | `ApiError.dari` → `ApiError.Validasi` → `GalatForm.Validasi`; pesan utama + field lain tampil di kotak galat dalam sheet (`role=alert` padanan `mk-note-box` web) |
| 401/403/429/5xx/jaringan | — | Lewat `ApiError.dari` terpusat → `GalatForm.Umum` (pesan siap tampil) |

## Keputusan UX

1. **Dua tingkat, tanpa pindah halaman.** Tingkat 1 daftar semua proyek PIC hari ini; tingkat 2 detail+formulir di `MkSheet` (440dp samping di layar lebar, bottom sheet di ponsel — perilaku komponen `MkSheet` designsystem). Padanan web: `mk-lap-row` + `Sheet wide`.
2. **Sub-status baris memakai kosakata status laporan** (tugas): `Selesai / Dikerjakan / Terkendala / Menunggu keputusan / Tanpa perubahan / Belum` via StatusBadge SM; **indikator terlambat terpisah** (badge LATE "Terlambat") bila (a) laporan dikirim setelah `lockAt` (dihitung klien `submittedAt > lockAt` — padanan `isLate` server) atau (b) tenggat lewat + tidak bisa diedit (`lockReason=TIME`) + belum terkirim. Keadaan kirim (terkirim HH.mm / draf / belum diisi / diteruskan) dibawa baris meta. Buka kunci aktif menampilkan badge INFO "Dibuka sampai HH.mm".
3. **Picker 4 status rutin** (SELESAI/ON_PROGRESS/TERKENDALA/TIDAK_ADA_PERUBAHAN, label Indonesia) sesuai tugas; `MENUNGGU_KEPUTUSAN` tetap bisa dibaca (badge/label) dan ditambahkan ke pilihan bila laporan tersimpan memakainya — supaya pengguna tidak "kehilangan" status yang sudah tercatat.
4. **FAB "Isi laporan"** hanya bila PIC memegang **satu-satunya** proyek dan laporannya belum dikirim serta masih bisa diedit (padanan web yang membuka form langsung untuk PIC satu proyek). PIC banyak proyek menyalakan sheet lewat baris (web: "Isi laporan berikutnya" → Android Fase 1 memakai baris, tanpa tombol tambahan).
5. **Draf vs kirim** = footer sheet: "Simpan draf" (SECONDARY) + "Kirim laporan" (PRIMARY; menjadi "Kirim ulang laporan" bila sudah pernah terkirim). Draf minimal = status + capaian (aturan server `action=save`); kirim menjalankan pra-validasi lengkap. Pra-validasi ramah bersifat mencegah panggilan sia-sia — 422 tetap sumber kebenaran.
6. **Hari dengan tugas (`derived`)**: status + progres hanya-baca (badge + "%"+ "Diringkas dari N progress"); capaian/kendala/tindak lanjut tetap bisa ditulis (server memakai narasi PIC bila terisi). Hari tanpa tugas: form manual + progres angka.
7. **Bukti**: klien Fase 1 belum bisa melampirkan bukti, jadi kirim manual (tanpa task) untuk status selain "Tanpa perubahan" akan ditolak server 422 "Bukti pendukang wajib dilampirkan minimal 1…". Kotak galat menampilkan pesan itu apa adanya; ada footnote penjelas di bawah status. Pelampiran bukti = tugas T5 lanjutan (bersama DELETE draf).
8. **Menutup sheet kotor** → dialog sederhana "Buang perubahan?" (Buang perubahan / Lanjut mengisi), hanya bila isian berubah sejak dibuka/disimpan terakhir. `versiForm` di ViewModel naik setelah simpan sukses + meja termuat ulang sehingga isian diikat ulang dari laporan tersimpan dan penanda kotor ikut reset.
9. **Terlambat**: banner kecil "Terkirim setelah tenggat 17.00 — tercatat terlambat" (jam mengikuti `lockAt` respons) tampil bila (a) PUT balas `isLate=true` (defensif) atau kirim terjadi saat `locked=true` (buka kunci aktif) — sheet dibiarkan terbuka agar banner terbaca, atau (b) laporan tersimpan dikirim setelah tenggat (dihitung klien). Padanan `isLate` di rute.
10. **Sukses**: snackbar "Laporan terkirim" / "Draf disimpan" (padanan toast web). Aksi **"Urungkan"** hanya muncul bila respons memuat `undoToken` (saat ini belum ada); token disimpan di state (`undoToken`) dan `urungkan()` siap disambung ke **UndoApi kontrak T5-B1** saat kontraknya hadir.
11. **Satu kalimat jawaban** di atas layar (single: keadaan laporan proyek itu; multi: "N dari M laporan hari ini belum dikirim."), baris tenggat + countdown ("Tenggat 17.00 WIB · 2 jam 15 menit lagi" / "…sudah lewat — laporan terkunci"), maks 1 badge ringkas. Waktu tampil dalam WIB (`Asia/Jakarta`), format "HH.mm".
12. **403 "Peran Anda tidak melakukan input harian"** → layar galat dengan Coba lagi (layar hanya dipasang untuk peran PIC/Admin PT di integrasi shell — di luar zona tugas ini).

## Jahitan untuk integrasi (parent / T5-B1)

1. **`DailyInputApi` duplikat sementara**: antarmuka + `LaporanModule` (@Provides dari Retrofit tunggal AppModule) hidup di paket `ui/laporan` karena `core/network/api/DailyInputApi.kt` (T5-B1) belum ada. Saat T5-B1 hadir: hapus `DailyInputApi`, `LaporanModule`, `SimpanLaporanRequest`, `SimpanLaporanResponse` dari `LaporanViewModel.kt`, ganti impor ke `id.co.monitorkarya.core.network.*`, dan tambahkan @Provides di AppModule. Tidak ada perubahan layar.
2. **Wire shell**: `MKShell` masih menampilkan `PlaceholderTabScreen` untuk `TabId.LAPORAN_HARIAN` (zona nav, bukan zona tugas ini). Penggantian: `LaporanHarianScreen(vm = hiltViewModel(), offline = …, onAjukanBukaKunci = { reportId -> … })`.
3. **MkListRow/MkField/MkPilih** adalah port lokal paket `ui/laporan` (designsystem belum punya). Bila dipromosikan ke `designsystem/components`, pindahkan `MkField`/`MkPilih`/baris daftar lalu hapus salinan lokal — perilaku tidak berubah.
4. **`hiltViewModel`**: masih paket lama `androidx.hilt.navigation.compose` (sesuai catatan FASE0.md; menyusul migrasi seragam Fase 1).
5. `pesanGalat` untuk Validasi menggabungkan `error` + `errors` (dedup) — rute mengirim `error = errors[0]`.

## Yang sengaja tidak dikerjakan (di luar cakupan)

- Pelampiran bukti (EvidencePanel) dan "Lampirkan foto" — butuh kontrak unggah T5 lanjutan.
- DELETE draf ("Hapus laporan") — kontrak sudah terdokumentasi di atas; UI menyusul bersama bukti.
- Kadens MINGGUAN/BULANAN (SegmentedControl web) dan `openDays`/navigasi tanggal lampau.
- Sheet pengajuan buka kunci (alasan minimal 10 karakter, POST `/api/unlock-requests`) — dipanggil lewat callback; layar penyusun tugas lain.
