# T6-C7 — Layar Penerimaan Admin PT (Fase 2 Android)

Tanggal: 8 Oktober 2026 · Cabang: `codex/kerja` · Status: selesai (verifikasi kompilasi menyusul; gradle dilarang pada tugas ini).

Padanan web: `src/components/views/inbox-view.tsx` + rute `src/app/api/inbox/route.ts` (dibaca lengkap). Zona tugas: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/penerimaan/` saja — navigasi dan AppModule tidak disentuh.

## Berkas yang dibuat

| Berkas | Isi |
| --- | --- |
| `PenerimaanViewModel.kt` | `@HiltViewModel PenerimaanViewModel` + model tampilan (`JenisLaporan`, `StatusAntrean`, `AntreanItem`, `MejaPenerimaan`, `AktivitasPenerimaan`, `NotifikasiPenerimaan`), parsing murni `parseMeja`, helper waktu WIB, dan `PenerimaanModule` (DI). |
| `PenerimaanScreen.kt` | `PenerimaanScreen(vm)` + versi state murni, kepala (konteks · judul · kalimat jawaban · dukungan), `MkSegmentedControl` Harian/Mingguan, daftar `MkListRow`, tombol primer "Teruskan semua (n)", `SnackbarHost` aksi "Urungkan", kerangka/galat/kosong, dua pratinjau `@PreviewGanda`. |

## Kontrak yang dipakai

- **InboxApi (T6-C2)** — `inbox(): Response<InboxResponse>` dan `teruskan(@Body TeruskanRequest): Response<TeruskanResponse>`; DTO `InboxHarianDto`/`InboxMingguanDto`/`TeruskanRequest.harian(id)/.mingguan(id)` dari `core/network/dto/DtosFase2Admin.kt`. Berkas ini muncul di worktree saat tugas berjalan; tugas ini mengonsumsinya 1:1 tanpa perubahan.
- **UndoApi (T5-B1)** — `urungkan(@Body UndoRequest): Response<UndoResponse>`; pesan sukses memakai `UndoResponse.message` (padanan `requestUndo` `src/lib/undo-client.ts`).
- **Design system (T5-B7)** — `MkQueueItem`/`MkSnackbar`/helper Urungkan belum ada saat tugas jalan, jadi dipakai padanannya yang sudah ada: `MkListRow` (judul + sub pengirim·waktu + slot `trailing` untuk lencana/tombol) sebagai baris antrean, `MkSegmentedControl` + `MkOpsi(count)` untuk tab Harian/Mingguan, dan `SnackbarHost` Material3 (warna sudah dijembatani token oleh `MKTheme`) dengan `actionLabel = "Urungkan"` dan `SnackbarDuration.Long` (10 detik = `UNDO_TOAST_MS` web). Bila MkSnackbar resmi hadir, snackbar lokal di layar ini bisa dipindah ke sana tanpa mengubah ViewModel.

## Perilaku

- **GET** sekali per muat; kalimat jawaban persis tugas: `"n laporan siap diteruskan ke holding."` (fallback: "Belum ada proyek atau divisi yang melapor ke Anda." / "Tidak ada laporan yang menunggu diteruskan."). Kalimat dukungan mengikuti Hero web ("x laporan harian belum masuk." + keadaan kunci 17.00 WIB).
- **teruskanSatu(idLaporan, jenis)** → POST `/api/inbox`; sukses: snackbar "<nama> diteruskan ke holding." + "Urungkan" bila ada `undoToken`, lalu muat ulang; 409: baris ditandai **BEKU**; galat lain: snackbar pesan `ApiError`. Tombol baris menampilkan "Meneruskan…" dan terkunci saat baris itu sibuk.
- **teruskanSemua** berurutan atas `antreanSiap` (harian lalu mingguan). Satu kegagalan TIDAK memutus loop; hasil parsial: `"x laporan diteruskan, y gagal. <pesan galat terakhir>"` (semua sukses: `"x laporan diteruskan ke holding."`; semua gagal: pesan galat). Tombol primer menampilkan progres "Meneruskan (2/5)…" dan semua tombol lain terkunci selama proses.
- **409 → BEKU**: id laporan dicatat di `bekuIds`; lencana berubah `StatusBadge(LATE, "Beku")` + sub baris diberi "perlu buka kunci" (frasa tugas "Beku — perlu buka kunci" dipecah dua baris agar lebar baris aman). Tanda ini **bertahan melewati muat ulang** di dalam hidup ViewModel (laporan harian memang terkunci begitu diteruskan — 6 Okt 2026) dan tidak menghalangi item lain.
- **Urungkan**: setiap sukses penerusan mengumpulkan `undoToken`; aksi snackbar memanggil `POST /api/undo` untuk SEMUA tiket bergiliran (masing-masing sekali pakai, 15 menit), lalu muat ulang — laporan yang diurungkan otomatis kembali SIAP. Kegagalan parsial dilaporkan "x diurungkan, y gagal. <pesan>".
- **Lencana** (`StatusAntrean` → `MkStatus`): BARU=INFO (draf PIC), SIAP=ON, DITERUSKAN=DONE, BEKU=LATE, BELUM_MASUK=NEUTRAL, MENUNGGU=RISK (mingguan belum disetujui kadiv). Selalu warna+ikon+kata (`StatusBadge` SM).
- Swipe-per-baris sengaja tidak ada (sesuai tugas) — tombol "Teruskan" (SECONDARY S, satu-satunya primer adalah "Teruskan semua").
- Kerangka memuat ≈ susunan isi (kepala + segmented + 5 baris); galat = `ErrorNote` + "Coba lagi"; kosong = `EmptyNote` ("Tidak ada proyek aktif." / "Tidak ada divisi."); spanduk luring bila `offline`.

## Keputusan integrasi (untuk penyambung)

1. **DI**: `PenerimaanModule` (internal, di berkas ViewModel) menyediakan `InboxApi` + `UndoApi` dari Retrofit tunggal AppModule — pola yang sama dengan `LaporanModule`. Bila penyedia pusat untuk jenis yang sama ditambahkan (mis. layar lain juga butuh `UndoApi`), hapus `@Provides` yang kembar di sini karena Hilt menolak binding ganda.
2. **Navigasi**: `MkNavHost`/`MKShell` belum punya rute penerimaan (zona tugas lain). Sambungkan lewat overload `PenerimaanScreen(vm, offline)` seperti `RingkasanScreen`.
3. **409 vs BEKU**: rute hanya mengirim 409 "Laporan ini sudah diteruskan" (klaim bersyarat anti klik ganda). Tugas meminta tanda "Beku — perlu buka kunci"; keduanya konsisten karena penerusan harian memang membekukan laporan. Setelah muat ulang, server melaporkan baris itu `forwardedAt` — tanda BEKU lokal tetap dipertahankan agar admin tahu perlunya buka kunci; edar penuh (hilang) terjadi saat ViewModel dibuat ulang.
4. Angka dan waktu mengikuti konvensi: angka di depan ("2 bukti", "12 item"), jam "HH.mm WIB" (`Asia/Jakarta`), tanggal panjang id-ID ("Kamis, 8 Oktober 2026 · M41 2026").

## Verifikasi

Gradle dilarang pada tugas ini — tidak ada build/lint yang dijalankan. Pemeriksaan manual: kontrak DTO/API/disain dicek langsung ke `InboxApi.kt`, `UndoApi.kt`, `DtosFase2Admin.kt`, `MkSegmented.kt`, `MkListRow.kt`, `StatusBadge.kt`, `MkButton.kt`, `MkError.kt`, `EmptyNote.kt`, `MkSkeleton.kt`, `MkOfflineBanner.kt`, `MKTheme.kt`, dan pola `RingkasanScreen`/`LaporanViewModel`; dependensi `:designsystem`, `:core:network`, `lifecycle-runtime-compose`, Retrofit, Hilt terkonfirmasi di `app/build.gradle.kts`.
