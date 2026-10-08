# Laporan T6-C6 — Layar Tim kepala divisi + Sheet Ringkasan Direktur (Fase 2)

Disusun agen T6-C6, 8 Oktober 2026. Zona tulis:
`android/app/src/main/kotlin/id/co/monitorkarya/app/ui/tim/` saja (+ dokumen
ini). Tanpa git/jaringan/DB; gradle tidak dijalankan (pembangunan oleh
parent). Acuan perilaku: `src/components/kadiv/team-cards.tsx`
(TeamDailyCard) + `parts.tsx` (ReportBadge) + `member-sheet.tsx` +
`weekly-summary-card.tsx`, rute `src/app/api/kadiv/team/route.ts`,
`kadiv/members/route.ts`, `kadiv/weekly-summary/route.ts`, bentuk data
`src/components/kadiv/types.ts` + `src/lib/kadiv.ts` (`buildTeam`,
`buildWeeklySummary`). Kontrak jaringan: `KadivApi` + `DtosFase2Kadiv`
(T6-C1, mendarat saat tugas ini berjalan — binding dipakai langsung, tanpa
port lokal). Komponen designsystem F0/F1/F2: MkListRow, MkCard, MkSheet,
MkField, MkButton, StatusBadge, MkSkeleton, ErrorNote, EmptyNote,
MkOfflineBanner.

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `app/…/ui/tim/TimViewModel.kt` | `TimModule` (penyedia `KadivApi` sementara dari Retrofit tunggal, pola `LaporanModule`/`PenerimaanModule`), model tampilan `TimUi`/`AnggotaUi`/`LaporanAnggota`, label kehadiran + peran (padanan `ATTENDANCE_LABELS`/`ROLE_LABELS`), pemetaan `KadivTeamResponse → TimUi` (defensif), status `Memuat/Siap/Galat`, `pilih(anggotaId)` untuk sheet per orang |
| `app/…/ui/tim/TimScreen.kt` | Kartu "Laporan harian tim" (subjudul "x dari y masuk · tenggat 17.00 WIB"), baris anggota `MkListRow` nama·jabatan/peran·proyek + `StatusBadge` lapor hari ini (port ReportBadge: Terkirim HH.mm / Diingatkan HH.mm / "x dari y masuk" / Belum masuk / label kehadiran / Tidak wajib lapor; LATE bila terkunci), urut BELUM → TERKIRIM → ABSEN → TIDAK_WAJIB lalu nama; Sheet ringkas per orang (baca-saja: laporan hari ini, beban kerja, capaian, kendala); kerangka 4 baris, ErrorNote+Coba lagi, EmptyNote tanpa divisi / tanpa anggota; `@PreviewGanda` ×4 |
| `app/…/ui/tim/RingkasanDirekturViewModel.kt` | `@HiltViewModel` ringkasan mingguan: `muat` (GET minggu berjalan), sunting poin `ubahPoin/tambahPoin/hapusPoin/pakaiOtomatis` (1–3 baris, ≤ 280 huruf dipangkas klien), `simpanDraf` (PUT), `kirim(konfirmasi)` (POST send; 409 `PENDING_REVIEW` → status konfirmasi, tombol "Kirim tetap" mengirim `confirmPending=true`; 409 `SENT`/lain → pesan), `tarik` (POST unsend; 409 → pesan jendela 15 menit); penerjemahan galat lewat `KonflikDto.serializer()` + `ApiError.dari` untuk non-409; model `RingkasanDirekturUi` (angka tampil = saved saat TERKIRIM, selain itu live — sama dengan web) |
| `app/…/ui/tim/RingkasanDirekturSheet.kt` | `MkSheet` "Laporan mingguan M{w} untuk Direktur": baris status (TERKIRIM → badge done + "Dikirim … WIB · dapat ditarik kembali 15 menit", Terkunci, Draf (+LATE bila lewat tenggat serah)), tiga angka minggu (Output diterima/target, Proyek sesuai x/y, Kendala terbuka), catatan "N output menunggu review" (risk-soft), poin baris `MkField` (2 baris, penghitung n/280) + Hapus per baris + Tambah poin + Pakai draf otomatis (nonaktif saat terkirim/terkunci), konfirmasi "Kirim sebelum review selesai?" (late-soft), footer: [Simpan draf][Kirim ke Direktur] / [Tarik untuk disunting]; pesan aksi hilang sendiri 4 detik (live region); `@PreviewGanda` draf + terkirim |

Nama final layar untuk FASE2.md §3: `TimScreen`/`TimViewModel` (tab Divisi
KEPALA_DIVISI) dan `RingkasanDirekturSheet`/`RingkasanDirekturViewModel`
(dibuka dari tab Divisi/Meja kerja — pemanggil mengendalikan `terlihat`).

## Keputusan dan batasan

1. **Binding `KadivApi`** disediakan `TimModule` di zona ini (pola kembar
   `PenerimaanModule`). Bila parent/T6-C10 memusatkan penyedia `KadivApi` di
   `AppModule` atau layar mingguan (ui/mingguan) ikut menyediakannya, hapus
   salah satu `@Provides` — Hilt menolak duplikat (catatan sama di kode).
2. **Tanpa aksi remind/read/unread dan tanpa pengatur anggota** — tugas ini
   hanya daftar + ringkas per orang (butir K7 FASE2.md tentang "ingatkan,
   tandai dibaca (dengan Urungkan)" dan `GET/PUT /api/kadiv/members` belum
   diimplementasi; antarmukanya sudah tersedia di `KadivApi`).
   `GET /api/kadiv/members` tidak dipakai layar ini (sumber anggota tim
   adalah `GET /api/kadiv/team` yang sudah membawa proyek + laporan).
3. **Kirim selalu membawa `points`** (rute menerima menimpa draf) sehingga
   suntingan terakhir ikut terkirim; `confirmPending` hanya dikirim saat
   true (mkJson `encodeDefaults=false` → false tidak dikirim, sesuai rute).
4. **409 ditangani sebagai kegagalan final** (pesan server ditampilkan,
   tidak ditimpa lokal); 422 poin divalidasi dulu di klien dengan pesan yang
   sama dengan rute ("Tulis 1 sampai 3 poin, …") — keputusan tetap di server.
5. Pesan sukses/gagal tampil sebagai catatan inline di dalam sheet (hilang
   sendiri 4 detik), bukan snackbar — sheet hidup sebagai dialog dan
   SnackbarHost milik layar pemanggil.
6. Angka `menungguReview` yang ditampilkan mengikuti aturan web: snapshot
   `saved.pendingReview` setelah TERKIRIM, selain itu `live.pendingReview`.
7. Waktu tampil selalu WIB: "HH.mm" untuk lencana (pemisah titik, padanan
   `formatTime`), "EEEE, d MMM HH.mm" untuk tenggat/waktu kirim.

## Verifikasi (tanpa gradle)

- Keseimbangan kurung/kurawal keempat berkas diperiksa skrip; tidak ada
  baris >140 karakter, tanpa spasi akhir.
- Kontrak silang dicocokkan manual: `KadivApi.tim/ringkasan/simpanRingkasan/
  kirimRingkasan` + `WeeklySummarySaveRequest`/`WeeklySummarySendRequest.
  kirim()/tarik()`/`WeeklySummaryResponse`/`KonflikDto` (DtosFase2Kadiv T6-C1),
  komponen `MkListRow(judul/sub/inisial/trailing/onClick)`, `MkField(nilai/
  onUbah/label/baris/enabled/supportingText)`, `MkSheet(visible/onTutup/judul/
  subjudul/backLabel/footer/konten)`, `MkButton(label/variant/size/enabled)`,
  `StatusBadge(status/text/size)`, `MkSkeleton`, `ErrorNote`, `EmptyNote`.
- Nama `TimModule` unik di app (kandidat bentrok diperiksa: hanya
  `LaporanModule`/`PenerimaanModule`/modul lain di paketnya masing-masing);
  `kadivApi` `@Provides` satu-satunya di pohon saat laporan ini disusun.
- Pratinjau `@PreviewGanda` (terang/gelap): Tim siap/memuat/galat/kosong,
  Ringkasan draf/terkirim — bangun tanpa ViewModel.

## Sambungan yang menunggu parent (integrasi)

- Daftarkan `TimScreen` di tab Divisi (`PEMBAGIAN_DIVISI`) KEPALA_DIVISI di
  `MKShell`, dan buka `RingkasanDirekturSheet` dari sana (terlihat=false
  awal; VM memuat saat dibuat).
- Keputusan binding `KadivApi` terpusat vs `TimModule` (lihat poin 1).
- `./gradlew :app:assembleDebug` + `ktlintCheck :app:detekt` oleh parent —
  agen tidak menjalankan gradle sesuai batasan fase.
