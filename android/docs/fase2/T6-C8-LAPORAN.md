# Laporan T6-C8 — Layar Kepatuhan Admin PT (Fase 2)

Disusun agen T6-C8, 8 Oktober 2026. Zona tulis: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/kepatuhan/` saja (+ dokumen ini). Tanpa git/jaringan/DB; gradle tidak dijalankan (pembangunan oleh parent). Acuan perilaku: `src/components/admin/compliance.tsx` (web), `src/app/api/admin/compliance/route.ts` + `remind/route.ts`, `src/lib/admin-compliance.ts` (aturan hitung + label), `docs/design/peran/04-admin-pt.md` §4–5, `android/core/network/api/AdminComplianceApi.kt` (T6-C2), designsystem `MkSegmentedControl`/`MkListRow`/`MkCard`/`StatusBadge`.

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/kepatuhan/KepatuhanViewModel.kt` | @HiltViewModel + `KepatuhanModule` (penyedia `AdminComplianceApi` sementara) + model tampilan (`MejaKepatuhan`/`DivisiKepatuhan`/`OrangBelumLapor`) + aksi `ingatkanOrang`/`ingatkanDivisi` + lencana status per divisi |
| `app/src/main/kotlin/id/co/monitorkarya/app/ui/kepatuhan/KepatuhanScreen.kt` | Kalimat jawaban + `MkSegmentedControl` Harian/Mingguan + daftar divisi (BatangDivisi + StatusBadge + bentang) + belum lapor per orang dengan tombol "Ingatkan" + "Ingatkan semua" + banner "Sudah lewat tenggat" + snackbar; port lokal `BatangDivisi`/`SeriDivisi`/`seriDivisi` |
| `android/docs/fase2/T6-C8-LAPORAN.md` | Dokumen ini |

## Sumber data: satu GET, dua aksi POST

`GET /api/admin/compliance` (Admin PT selalu PT-nya sendiri, tanpa `entityId`) memberi seluruh meja: `totals` (expected/reported/onLeave/reminded/unassigned), `divisions[]` (expected/reported/onLeave/`missing[]` dengan `remindedAt` hari ini, `weekly.state` MASUK/TERLAMBAT/BELUM), `locked` (kunci 17.00 WIB), `week.handoverPassed`, `canRemind`. DTO `KepatuhanResponse` (T6-C2, `DtosFase2Admin.kt`) sudah bertipe lengkap sehingga tidak perlu parsing manual — pemetaan `petaMeja`/`petaDivisi` murni menyusun model tampilan. Kolom `days`/`history` (peta panas 10 hari) **belum dipakai** — di luar lingkup tugas ini; model menyisihkannya dengan sengaja.

Aksi pengingat memakai `POST /api/admin/compliance/remind` dengan tepat satu dari `{userId}` / `{divisionId}` (`IngatkanRequest.orang/divisi`; varian `semua()` tidak dipakai layar ini — di web tombol "Kirim pengingat ke semua" ada di Ringkasan Admin, bukan kartu kepatuhan).

## Status UI ViewModel

- `state: KepatuhanUiState` — Memuat → Siap(meja) / Galat(pesan).
- `mode: ModeKepatuhan` (HARIAN bawaan) — padanan `SegmentedControl` web; `pilihMode()`.
- `terbuka: String?` — id divisi yang dibentangkan (bentang inline menggantikan Sheet web di ponsel); `bukaTutupDivisi()` toggle.
- `mengirim: String?` — kunci `"user:<id>"`/`"divisi:<id>"` aksi yang sedang berjalan; semua tombol Ingatkan menunggu (`Mengirim…`), padanan `busy` web satu kartu.
- `notifikasi: NotifikasiKepatuhan?` — snackbar satu-kali.

Sukses pengingat menandai `people` yang dikembalikan server sebagai sudah diingatkan **di data lokal** (padanan `sendReminder` web: `remindedAt` diisi, `totals.reminded` naik) tanpa menunggu muat ulang. Toast: satu orang → "Nama diingatkan. Tercatat di log aktivitas."; divisi → "x orang diingatkan. Tercatat di log aktivitas."; kosong → "Tidak ada yang perlu diingatkan." (server 409 lebih dulu untuk kasus orang tunggal, jadi cabang ini defensif).

## Penanganan galat remind

| Kode | Bentuk rute | Penanganan Android |
|---|---|---|
| 409 | `{error, locked: true}` — laporan hari ini dikunci 17.00 WIB | `GalatDto.locked` → `tandaiTerkunci()`: meja lokal ikut terkunci sehingga banner + tombol nonaktif muncul seketika; pesan server tampil di snackbar |
| 409 | `{error, remindedAt}` — orang itu sudah diingatkan hari ini | `GalatDto.remindedAt` → `tandaiDiingatkan(userId, remindedAt)` sehingga lencana orang itu berubah "Diingatkan HH.mm"; pesan server tampil di snackbar |
| 409 | lain (mis. "Semua laporannya hari ini sudah terkirim.") | Pesan server tampil di snackbar |
| 403/404/429/5xx/jaringan | — | Pesan server bila ada, selain itu lewat `ApiError.dari(...).pesanTampil()` (429 → "Terlalu banyak percobaan…" dari `limitReminders`) |

Body galat diurai dengan `mkJson.decodeFromString(GalatDto.serializer(), …)` (`GalatDto` T6-C2 sudah menyediakan `error/locked/remindedAt/retryAfter`) — toleran bila body bukan JSON.

## Layar

- **Kalimat jawaban** berganti mengikuti mode: Harian → "x dari y orang lapor hari ini." (persis kalimat tugas); Mingguan → "M41: k dari m divisi sudah menyerahkan laporan mingguan." Footnote penunjang: jumlah cuti/izin + PIC tanpa divisi (harian), "Tenggat serah terima Kamis 17.00 WIB." (mingguan).
- **MkSegmentedControl** Harian/Mingguan; nilai mode dikirim sebagai `name` enum lalu kembali lewat `String.dariNama()`.
- **Baris divisi** (mode harian): `BatangDivisi` — titik seri + nama + persen tabular, trek 10dp fill-1, isian seri, meta "x dari y orang · kepala divisi"; mode mingguan: nama + kepala divisi (+ "diserahkan <relatif>"). Kanan: `StatusBadge` SM + chevron berputar (Fast 150 ms, hormati reduced motion). Menyaring divisi seperti web: harian hanya `wajib > 0 || cuti > 0`, mingguan semua.
- **Bentang** (`AnimatedVisibility` expand/shrink + fade): mode mingguan menambah blok "Laporan mingguan M<n>" (lencana + diserahkan/tenggat); lalu "Belum lapor hari ini" — `MkListRow` per orang (inisial, "peran · terakhir lapor <relatif> · proyek, proyek") dengan trailing: `StatusBadge` INFO "Diingatkan HH.mm" bila sudah, tombol **"Ingatkan"** (MkButton S SECONDARY) bila belum dan bisa kirim, atau `StatusBadge` "Belum lapor" bila tidak boleh mengirim. Tombol **"Ingatkan semua (n)"** per divisi hanya muncul di mode harian bila masih ada yang belum diingatkan. Semua tombol sekunder — tidak ada tombol primer di layar ini (aturan maks 1 primer per kartu terpenuhi).
- **Terkunci 17.00** (`meja.terkunci`): banner kecil statusLateSoft + ikon Schedule "Sudah lewat tenggat 17.00 WIB — tombol pengingat aktif lagi besok." dan seluruh tombol Ingatkan nonaktif (enabled=false, alfa 0.4 dari MkButton). `canRemind=false` (akun grup tanpa PT tunggal) mematikan tombol yang sama tanpa banner (padanan web).
- Keadaan kosong: "Belum ada divisi aktif." / "Belum ada PIC proyek aktif di divisi mana pun." (`EmptyNote`); memuat → 4 kerangka; galat → `ErrorNote` + Coba lagi; `MkOfflineBanner` bila luring.

## Lencana status per divisi (port dailyBadge/weeklyBadge web)

| Keadaan | Harian | Mingguan |
|---|---|---|
| Semua lapor | DONE "Lengkap" | MASUK → DONE "Masuk" |
| Semua yang belum sudah diingatkan | INFO "Diingatkan" (LATE bila terkunci) | TERLAMBAT → RISK "Terlambat" |
| Masih ada yang belum | RISK "n belum" (LATE bila terkunci) | BELUM → NEUTRAL "Belum masuk"; jadi LATE setelah `handoverPassed` |
| Tanpa wajib lapor | NEUTRAL "Semua cuti/izin" / "Tanpa PIC" | — |
| Ekstra mingguan | — | " · disetujui" / " · diteruskan" mengikuti `approvedAt`/`forwardedAt` |

## Port lokal (menunggu komponen bersama)

`MkDivisionBar`/`MkQueueItem` **belum ada** di designsystem saat tugas ini jalan (dipolling ±5 menit; yang tersedia: MkSegmented, MkListRow, MkField, MkPilih). Mengikuti preseden T5-B5 (port lokal paket), dua port berikut hidup di `KepatuhanScreen.kt` dan siap dipindahkan tanpa mengubah perilaku:

1. **`BatangDivisi` + `TitikSeri`** — port `DivisionBar` web (`.mk-divbar`): kolom gap 6dp; baris atas nama (weight 500/14sp + titik 8dp) dan persen (600 tabular); trek 10dp radius-penuh fill-1; isian animasi lebar `MkMotion.Data` 600 ms ease-standard (reduced motion: statis); meta caption ink-2. Tanpa garis target (web `target` tidak dipakai rute kepatuhan).
2. **`SeriDivisi` + `seriDivisi(nama)`** — port seri data `--data-1..6` tokens.css (terang + malam; "satu divisi satu warna", dipetakan dari NAMA via aturan regex `division-tone.ts` + hash cadangan). Deteksi tema malam dari `LocalMkColors.current.ink.luminance() > 0.5` karena `MkColors` belum membawa bendera tema. Saat designsystem mempromosikan seri data + MkDivisionBar, hapus port ini dan ganti pemanggilannya.

`MkListRow`/`MkSegmentedControl`/`MkOpsi` designsystem dipakai langsung (T6-C1 sudah mengirimkannya).

## Yang menunggu integrasi parent

1. **`KepatuhanModule`** menyediakan `AdminComplianceApi` dari Retrofit tunggal (AppModule belum menyediakannya). Saat penyedia API Fase 2 dipusatkan di AppModule, hapus modul ini — VM tidak berubah. Hati-hati binding ganda bila agent lain juga menyediakan API yang sama.
2. **Navigasi**: layar belum didaftarkan ke MKShell/tab ADMIN_PT (zona navigasi bukan milik tugas ini). Titik masuk: `KepatuhanScreen(vm: KepatuhanViewModel, offline: Boolean)`.
3. **Peta panas 10 hari** (`days`/`history`) dan **kontak kepala divisi** (mail/tel dari `head`) belum ditampilkan — kandidat lanjutan bersama komponen Heatmap Android.
4. Gradle tidak dijalankan (larangan tugas); kubectl/detekt/pratinjau menyusul parent. Panjang baris dan impor disesuaikan konvensi berkas tetangga.

## Verifikasi tanpa build

- Kontrak API dicocokkan langsung dari `AdminComplianceApi.kt` + `DtosFase2Admin.kt` (T6-C2) dan bentuk respons rute web (`loadCompliance`).
- Nama parameter komponen dicocokkan dari sumber designsystem (`MkSegmentedControl`, `MkListRow`, `MkButton`, `MkCard`, `StatusBadge`, `EmptyNote`, `ErrorNote`, `MkOfflineBanner`, `MkSkeleton`).
- Kosakata UI: bahasa Indonesia, sapaan "Anda", sentence case, angka di depan, tombol kata kerja + objek ("Ingatkan semua (3)"), tanpa tanda seru/emoji; status selalu warna + ikon + kata.
