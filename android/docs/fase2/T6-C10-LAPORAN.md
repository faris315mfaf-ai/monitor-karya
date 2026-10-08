# T6-C10 — Laporan Fase 2: dokumen, tes kontrak, audit silang

Disusun agen T6-C10, 8 Oktober 2026 malam. Zona tulis: `android/docs/**`,
`android/core/*/src/test/**` saja. Tanpa git/jaringan/DB; gradle tidak
dijalankan sesuai batas tugas.

## Berkas yang ditulis

| Berkas | Isi |
| --- | --- |
| `android/docs/FASE2.md` | Definisi selesai fase (kadiv: serah+setujui mingguan, ringkasan direktur, tim; admin: penerimaan teruskan+urungkan, kepatuhan+ingatkan, meja akun terbatas), peta layar per tab `ROLE_TABS`, tabel kontrak nama lintas agen C1..C9 (status per 21.30 WIB), sisa menuju Fase 3, cara uji |
| `android/docs/fase2/README.md` | Indeks laporan T6-C1..C10 (diperbarui selaras laporan yang mendarat; baris C6 sempat diisi agennya sendiri dan dipertahankan) |
| `android/docs/fase2/T6-C10-AUDIT.md` | Audit silang BACA-SAJI: 14 temuan (A1–A14) + 7 verifikasi lulus + potret pohon |
| `android/core/network/src/test/.../api/InboxTeruskan409Test.kt` | 10 tes: dekode meja dua arus, badan `{kind,id}` persis, undoToken ada/tidak, 409 "sudah diteruskan", 409 beku (`frozen:true, reason:"FORWARDED"` via `KonflikDto`/`GalatDto`), alur `POST /api/undo` + 409 jendela, 409 remind kunci 17.00. Jalur MockWebServer penuh (`buatApi`) |
| `android/core/data/src/test/.../mingguan/MingguanStatusTest.kt` | Peta `statusHeader → label/lencana` (padanan WEEKLY_HEADER web), transisi sah DRAFT→MENUNGGU_PERSETUJUAN→DISETUJUI (submit hanya dari DRAFT, approve hanya dari MENUNGGU), konsistensi konstanta tiga zona, dekode DTO C2, `labelState` kepatuhan |
| `android/core/data/src/test/.../akun/AkunGuardTest.kt` | `ADMIN_PT_MANAGED_ROLES` persis tiga; meja penuh SUPERADMIN (semua peran), meja terbatas ADMIN_PT terpaku PT, tanpa PT = tanpa meja, TI/peran lain tanpa meja; bendera baca-saja (`bolehKelola` = false) untuk DIREKTUR_ENTITAS, peran grup, dan PT lain |

## Status tes terhadap kode yang mendarat

- `InboxTeruskan409Test` (**core:network**) ditulis terhadap kontrak T6-C2
  yang SUDAH mendarat (`InboxApi`, `DtosFase2Admin`, `ApiError.Konflik`
  perluasan T5-B1) dan T6-C1 (`KonflikDto`); mengompilasi dan menghijau
  sekarang selama sisa tes modul itu (`ApiError409Test`, `DtoFase1Test`
  versi terkini) juga sudah selaras T5-B1.
- `MingguanStatusTest` dan `AkunGuardTest` (**core:data**) adalah spesifikasi
  eksekusi mengikuti pola T5-B9: bagian dekode menguji DTO C1/C2 yang sudah
  ada; bagian `StatusHeaderMingguan.label/lencana/transisiSah` dan
  `AkunGuard.mejaAkun/bolehKelola` menghijau setelah kontrak itu mendarat di
  `:core:domain` (nama final sudah dicegah bentroknya — audit A9). Modul
  `:core:data` juga menunggu dependensi serialization (audit A6) dan
  penyesuaian repo (audit A1–A3) sebelum seluruh rangka ujinya berjalan.
- Kontrak C1/C2/C9 yang diuji: C1+C2 dibaca dari berkas+laporan mereka yang
  mendarat; C9 dibaca dari `ui/akun` + laporan T6-C9 (guard di sana berupa
  model tampilan — kontrak domainnya yang diuji, `AksesMejaAkun`, dinamai
  ulang agar tidak kembar).

## Temuan audit utama (ringkas — rinci di T6-C10-AUDIT.md)

1. **A1–A3 (pecah-kompilasi)**: tiga repo T6-C3 (`MingguanRepo`,
   `PenerimaanRepo`, `KepatuhanRepo`) ditulis menghadap stub
   `Response<JsonObject>` sebelum T6-C1/T6-C2 mendarat bertipe — panggilan
   `serahAtauSetujui(JsonObject)`, `daftar` 6-arg, dan parse `isi["daily"]`
   dsb. tidak mengompilasi terhadap API terketik.
2. **A6**: `:core:data` memakai kotlinx-serialization tanpa mendeklarasikan
   dependensinya di `build.gradle.kts` (klaim "tanpa dependensi baru" pada
   laporan T6-C3 keliru).
3. **A7 + A13**: meja kepatuhan diimplementasi dua kali (repo C3 vs ViewModel
   C8) dan tiga klaim laporan C3 drift dari kodenya.
4. **A5**: 409 beku mingguan mengirim `frozen` BOOLEAN + `reason` string;
   `ApiError.Konflik.frozen:String?` kehilangan reason — pola baca
   `KonflikDto.reason` dikunci tes sebagai jalan resmi.
5. **A8**: daftar akun meja = `GET /api/companies` belum punya kontrak di
   `core/network` (C9 memakai antarmuka lokal JsonObject).
6. **A10–A12**: jahitan tertunda untuk parent — `MkDatabase` versi 2, modul
   DI lokal kembar potensial, cabang KADIV/ADMIN `work-desk`; **T6-C5 tidak
   mendarat** (papan mingguan kadiv) hingga laporan ini ditutup.

## Catatan kerja

- Swarm berjalan paralel saat tugas ini dieksekusi: pada awal pemeriksaan
  pohon masih bersih (hanya Fase 0), laporan C1..C9 mendarat bertahap
  selama penulisan — FASE2.md, indeks, dan audit memotret keadaan
  ±21.30 WIB dan menyebut status itu eksplisit.
- Indeks `fase2/README.md` sempat diperbarui agen lain (baris C6);
  perubahan itu dipertahankan, hanya baris basi yang diperbarui.
