# Fase 2 — Kepala divisi & Admin PT Monitor Karya di Android

Disusun agen T6-C10 (tes dan dokumen), 8 Oktober 2026 malam, saat swarm Fase 2
(T6-C1 sampai T6-C9) sedang berjalan paralel. Sumber rancangan:
[`docs/zcode/RANCANGAN-ANDROID-NATIVE.md`](../docs/zcode/RANCANGAN-ANDROID-NATIVE.md)
§5 (inventaris fase), §4 (offline-first), §7 (pengujian). Lanjutan dari
[`android/docs/FASE0.md`](FASE0.md) dan [`android/docs/FASE1.md`](FASE1.md).
Indeks laporan per agen: [`docs/fase2/README.md`](fase2/README.md).
Audit silang antar-agen: [`docs/fase2/T6-C10-AUDIT.md`](fase2/T6-C10-AUDIT.md).

> Ringkasan satu kalimat: Fase 2 menuntaskan pekan kerja Kepala divisi dan
> Admin PT — papan capaian mingguan (serah/setujui) beserta ringkasan untuk
> Direktur dan tim, antrean Penerimaan dengan teruskan + Urungkan yang menangani
> 409 beku dengan baik, kepatuhan laporan per divisi dengan pengingat, dan meja
> akun terbatas Admin PT.

## 1. Definisi selesai

Kalimat kunci (rancangan §5): **kepala divisi bisa menyerahkan dan menyetujui
capaian mingguan dari HP, dan Admin PT bisa menjalankan penerimaan, kepatuhan,
serta meja akun terbatasnya tanpa membuka web.** Diurai jadi butir yang bisa
diperiksa:

### 1a. Kepala divisi

| # | Butir | Bukti |
| --- | --- | --- |
| K1 | Melihat papan capaian mingguan divisinya per hari + lajur "Mingguan" (baca dari Room, tarik `GET /api/weekly-input`) | `MingguanRepo.tarikPapan` + layar Capaian mingguan |
| K2 | Menambah/mengubah/memindah/menghapus butir pekerjaan (aspek, prioritas, status, %, kendala wajib saat TERKENDALA) | `PUT/PATCH/DELETE /api/weekly-input` |
| K3 | Alur status tampil jujur: DRAFT → MENUNGGU_PERSETUJUAN (serah) → DISETUJUI (setujui); label + warna + ikon dari satu peta | `StatusHeaderMingguan` (kontrak §3) — diuji `MingguanStatusTest` |
| K4 | Serah hanya dari DRAFT, setujui hanya dari MENUNGGU_PERSETUJUAN; 409/422 server ditampilkan sebagai kegagalan final, tidak ditimpa lokal | `MingguanRepo.serah/setujui` + `MingguanStatusTest` |
| K5 | Laporan yang sudah diteruskan (beku, `FORWARDED`) terkunci di UI dengan pesan ajukan buka kunci; koreksi saat buka kunci aktif tersimpan tanpa diserahkan ulang | 409 `{error, locked:true, frozen, reason:"FORWARDED"}` |
| K6 | Ringkasan mingguan untuk Direktur: draf 1–3 poin (≤ 280 huruf), kirim (TERKIRIM, lonceng direktur), tarik kembali ≤ 15 menit; 409 `PENDING_REVIEW`/`SENT` ditangani baik | `GET/PUT/POST /api/kadiv/weekly-summary` |
| K7 | Ringkasan tim: laporan harian per anggota, kehadiran (cuti/sakit/izin), ingatkan anggota, tandai dibaca (dengan Urungkan) | `GET/POST /api/kadiv/team`, `GET /api/kadiv/members` |

### 1b. Admin PT

| # | Butir | Bukti |
| --- | --- | --- |
| A1 | Antrean Penerimaan dua arus (harian per proyek, mingguan per divisi) dengan status BARU/SIAP/DITERUSKAN | `GET /api/inbox` → `PenerimaanEntity` |
| A2 | Teruskan satu laporan; harian ikut dibekukan; klik ganda aman (409 "sudah diteruskan") | `POST /api/inbox` `{kind, id}` — diuji `InboxTeruskan409Test` |
| A3 | Toast "Urungkan" penerusan dari `undoToken` (hanya bila diterbitkan; 15 menit, sekali pakai, pelaku sama); batas/sudah-diurungkan ditampilkan sebagai kegagalan | `TeruskanResponse.undoToken` + `POST /api/undo` |
| A4 | Kepatuhan per divisi: wajib lapor, belum lapor + pengingat hari ini, peta panas 10 hari, status mingguan MASUK/TERLAMBAT/BELUM, kontak kepala divisi | `GET /api/admin/compliance` |
| A5 | Ingatkan satu orang / satu divisi / semua; 409 kunci 17.00, sudah-diingatkan, cuti — semua ditangani baik (pesan + tidak mengulang otomatis) | `POST /api/admin/compliance/remind` |
| A6 | Meja akun terbatas: daftar akun PT-nya (dari `GET /api/companies` bentuk meja akun), tambah/ubah/aktifkan/nonaktifkan/hapus, setel ulang sandi, terbitkan tautan aktivasi (24 jam, token hanya di fragmen) | `/api/companies/users(+/activation)` |
| A7 | Pagar meja akun: hanya posisi ADMIN_PT/KEPALA_DIVISI/PIC_PROYEK yang bisa disentuh; baris di luar wewenang tampil **baca-saja**; akun sendiri & Super Admin terakhir dilindungi 409 | `ADMIN_PT_MANAGED_ROLES` — diuji `AkunGuardTest` |
| A8 | Interaksi sesuai desain: konfirmasi hanya untuk hapus; aktif ⇄ nonaktif memakai toast "Urungkan"; detail di Sheet, tidak pindah halaman | `docs/design/04-admin-pt.md` |

### Butir umum

| # | Butir | Bukti |
| --- | --- | --- |
| G1 | Unit test kontrak Fase 2 menghijau (`:core:network:testDebugUnitTest`, `:core:data:testDebugUnitTest`) | tiga berkas tes T6-C10 |
| G2 | `:app:assembleDebug` hijau dengan tab KEPALA_DIVISI dan ADMIN_PT memuat layar nyata (bukan placeholder) | integrasi parent |
| G3 | Tab lain dari peran itu (Ringkasan, Eskalasi, dsb.) tetap berprilaku F0/F1 | `ROLE_TABS` tidak berubah |

## 2. Peta layar dan rute

Tab sudah dikunci Fase 0 di `ROLE_TABS` (`core:domain`), tidak boleh berubah
di fase ini. Tab pendarat kedua peran = `RINGKASAN`.

| Peran | Tab | Isi Fase 2 | Endpoint pendamping |
| --- | --- | --- | --- |
| KEPALA_DIVISI | Ringkasan (F0) | Satu kalimat tugas + status pekan | `GET /api/ringkasan` |
| KEPALA_DIVISI | Meja kerja | Ringkas capaian pekan berjalan + status serah terima (ke Fase 3 disempurnakan) | `GET /api/work-desk` (cabang KADIV) |
| KEPALA_DIVISI | **Capaian mingguan** | Papan butir per hari + lajur Mingguan; serah/setujui; Sheet butir; badge statusHeader | `GET/PUT/PATCH/DELETE /api/weekly-input`, `POST /api/weekly-input` (submit/approve) |
| KEPALA_DIVISI | Divisi | Ringkasan tim (anggota, kehadiran, belum lapor, ingatkan, tandai dibaca) + Sheet ringkasan mingguan ke Direktur | `GET/POST /api/kadiv/team`, `GET/PUT/POST /api/kadiv/weekly-summary`, `GET /api/kadiv/members` |
| ADMIN_PT | Ringkasan (F0) | Tetap | `GET /api/ringkasan` |
| ADMIN_PT | Meja kerja | Cabang ADMIN dari work-desk (Fase 1 hanya cabang PIC) | `GET /api/work-desk` |
| ADMIN_PT | **Penerimaan** | Dua arus + hitung mundur 17.00; teruskan; toast Urungkan; 409 beku/sudah-diteruskan | `GET/POST /api/inbox`, `POST /api/undo` |
| ADMIN_PT | Laporan harian / Proyek / Divisi / Eskalasi | Sisa milik Fase 1/3 | lihat FASE1.md |
| ADMIN_PT | **Meja akun** (di balik Pengaturan, bukan tab — sama dengan web `settings-dialog`) | Daftar akun PT-nya, sheet akun (ubah, sandi, aktif/nonaktif), wizard akun, terbitkan aktivasi | `GET /api/companies`, `/api/companies/users(+/activation)` |
| SUPERADMIN / TI | Tab bernama sama | Paritas: meja penuh (SUPERADMIN) / tanpa meja akun (TI) | sama |

Rute Compose mengikuti pola Fase 1 (T5-B8): tetap tiga rute akar gerbang sesi;
layar baru hidup sebagai tujuan `tab/<id>` di `MKShell` dan sebagai rute detail
berparameter di NavHost tingkat-tab (mis. `tab/penerimaan/{id}`). Detail selalu
Sheet (desktop 440 samping, ponsel layar didorong).

## 3. Kontrak nama lintas agen C1..C9

Pola paket `id.co.monitorkarya.<modul>.<sub>`. Ubah nama hanya di zona agennya.
Sumber kolom status: pemeriksaan berkas di pohon kerja + laporan agen di
`docs/fase2/` per 8 Okt 2026 ±21.30 WIB (T6-C5 belum mendarat; potret lengkap
dan ketidaksesuaiannya di T6-C10-AUDIT).

| Nama | Modul / paket | Pemilik zona | Status 8 Okt malam |
| --- | --- | --- | --- |
| `InboxApi.inbox()/teruskan()` | `:core:network` `…network.api` | T6-C2 | **ada** (laporan T6-C2) |
| `AdminComplianceApi.kepatuhan()/ingatkan()` | `:core:network` `…network.api` | T6-C2 | **ada** |
| `AkunApi.keanggotaan/tambah/ubah/hapus/ketersediaanAktivasi/terbitkanAktivasi` | `:core:network` `…network.api` | T6-C2 | **ada** |
| DTO `InboxResponse`, `InboxHarianDto`, `InboxMingguanDto`, `TeruskanRequest.harian()/mingguan()`, `TeruskanResponse(ok, undoToken?)`, `KepatuhanResponse` + `MingguanDivisiDto` (STATE_MASUK/TERLAMBAT/BELUM), `IngatkanRequest.orang()/divisi()/semua()`, `AkunBaruRequest`/`AkunUbahRequest`/`AkunDto`/`KeanggotaanDivisiDto`, `AktivasiDto`, `GalatDto` | `:core:network` `…network.dto` (DtosFase2Admin.kt) | T6-C2 | **ada** |
| `WeeklyInputApi` (`papan/simpanButir/pindahkanButir/hapusButir/aksi`), `WeeklyReportsApi.daftar(...)`, `KadivApi` (`team`, `aksiTim`, `members`, `ringkasanMingguan`, dsb.), `LaporanDibacaApi`; DTO `DtosFase2Kadiv.kt` (`WeeklyReportHeadDto` + konstanta status, `WeeklyAksiRequest.serahkan()/setujui()`, `KonflikDto` dengan `code/reason/pendingReview`) | `:core:network` `…network.api` + `…network.dto` | T6-C1 | **ada** (laporan T6-C1) |
| `MkField`, `MkPilih`, `MkSegmented`, `MkListRow`, `MkLampiran`, `MkFAB`, `MkSnackbar` | `:designsystem` `…components` | agen komponen formulir (T6-C?) | **ada di pohon, laporan belum** |
| `MkDivisionBar` + `nadaDivisi/nadaDivisiCerah`, `MkQueueItem`, `MkBoardColumn`/`MkKartuPapan`, `MkRing` | `:designsystem` `…components` | T6-C4 | **ada** (laporan T6-C4) |
| `MingguanLaporanEntity`/`MingguanButirEntity` (konstanta `DRAFT/MENUNGGU_PERSETUJUAN/DISETUJUI/TERKUNCI`), `PenerimaanEntity` (JENIS_*, STATUS_*, `idHarian/idMingguan`, kolom `laporanId`) + `MingguanLaporanDao`/`MingguanButirDao`/`PenerimaanDao` | `:core:data` `…data.db` (EntitiesFase2.kt, DaosFase2.kt) | T6-C3 | **ada** (laporan T6-C3) |
| `Hasil` (Sukses/Gagal/Luring) + helper `sebagaiObjek/teks/angka/tagal/keEpochMillis`; `MingguanRepo` (tarikArsip/tarikPapan/serah/setujui), `PenerimaanRepo` (tarik/teruskan), `KepatuhanRepo` (tarik/ingatkan*) + `KepatuhanData`/`KepatuhanDivisi.labelState` | `:core:data` `…data.repo` | T6-C3 | **ada** — repositori ditulis menghadap stub JsonObject mingguan; perlu penyesuaian ke API terketik T6-C1 (lihat audit butir 1–3) |
| `StatusHeaderMingguan` — `label(nilai)`, `lencana(nilai)`, `transisiSah(dari, aksi)`; konstanta status (`DRAFT`, `MENUNGGU_PERSETUJUAN`, `DISETUJUI`, `TERKUNCI`, sama dengan `WeeklyReportHeadDto`/`MingguanLaporanEntity`) | `:core:domain` `…domain.status` (berkas `StatusHeaderMingguan.kt`) | agen papan mingguan (T6-C5?) | **belum ada** — diuji `MingguanStatusTest`; `lencana` memakai kosa kata Status web `info/risk/done/neutral`. Nama dipilih agar tidak bentrok `StatusMingguan` (enum state kepatuhan MASUK/TERLAMBAT/BELUM) yang sudah dipakai `ui/kepatuhan` |
| `AkunGuard` — `ADMIN_PT_MANAGED_ROLES`, `mejaAkun(peran, scopeEntitasId): AksesMejaAkun?`, `bolehKelola(meja, peranAkun, entitasAkunId)`; `AksesMejaAkun(penuh, peranTerkelola, entitasId)` | `:core:domain` `…domain.roles` (berkas `AkunGuard.kt`) | agen meja akun (T6-C9) | **belum ada** — diuji `AkunGuardTest`; guard versi tampilan sudah ada lokal di `ui/akun` (`MejaAkun.bisaKelola`), domain menjadi rumah bersamanya |
| `MkDatabase` versi 2 + accessor DAO Fase 2 | `:core:data` `…data.db` | parent (integrasi) | belum (entitas menunggu pendaftaran — jahitan terencana T6-C3) |
| `PenerimaanScreen` + `PenerimaanViewModel` (`MejaPenerimaan`, `StatusAntrean`, `PenerimaanModule`) | `:app` `ui/penerimaan/` | T6-C7 | **ada** (laporan T6-C7; sambungan navigasi + binding DI menunggu parent) |
| `KepatuhanScreen` + `KepatuhanViewModel` (`MejaKepatuhan`, `KepatuhanModule`) | `:app` `ui/kepatuhan/` | T6-C8 | **ada** (laporan T6-C8; langsung dari `KepatuhanResponse` T6-C2) |
| `AkunScreen` + `AkunViewModel` + `SheetAkunDetail` (`MejaAkunListApi` lokal, guard `MejaAkun.bisaKelola`) | `:app` `ui/akun/` | T6-C9 | **ada** (laporan T6-C9; daftar dari `GET /api/companies`) |
| `TimScreen`/`TimViewModel` + `RingkasanDirekturSheet`/`RingkasanDirekturViewModel` (`TimModule`) | `:app` `ui/tim/` | T6-C6 | **ada** (laporan T6-C6; remind/read anggota + `kadiv/members` belum dipakai — antarmuka tersedia di `KadivApi`) |
| `CapaianMingguanScreen` + VM (papan butir mingguan kadiv) | `:app` `ui/mingguan/` | agen papan mingguan (T6-C5?) | **belum ada** (laporan belum mendarat) |
| `SesiViewModel`/`MKShell` penyambung tab baru | `:app` | agen layar + parent | belum berubah |

Aturan yang berlaku ulang: galat selalu lewat `ApiError.dari(...)` lalu
`pesanTampil()`; hasil server final (409/422 tidak pernah ditimpa lokal); tulis
mingguan/teruskan/ingatkan/akun jujur daring (tanpa outbox; keputusan domain
tidak bisa diantrekan); cookie hanya di `EncryptedAuthStore`; klien tidak pernah
menyetel `Origin`; string Indonesia tanpa seru/emoji.

## 4. Cara menguji

Tanpa Gradle dari agen (larangan fase ini); verifikasi oleh manusia/parent:

1. **Unit test kontrak** (murni JVM):
   `./gradlew :core:network:testDebugUnitTest :core:data:testDebugUnitTest`
   - `InboxTeruskan409Test` (network) — menghijau sekarang terhadap kode T6-C2
     yang sudah mendarat: dekode `InboxResponse`, badan teruskan `{kind, id}`,
     `undoToken` ada/tidak, 409 "sudah diteruskan", 409 beku mingguan
     (`frozen:true, reason:"FORWARDED"`), alur `POST /api/undo` dan `GalatDto`.
   - `MingguanStatusTest` (data) — peta `statusHeader → label/lencana`,
     transisi sah DRAFT→MENUNGGU_PERSETUJUAN→DISETUJUI, konsistensi konstanta
     `MingguanLaporanEntity` ↔ `StatusHeaderMingguan`, dekode DTO C2, `labelState`
     kepatuhan. Menghijau penuh setelah `StatusHeaderMingguan` mendarat di domain.
   - `AkunGuardTest` (data) — peran di luar `ADMIN_PT_MANAGED_ROLES` menjadi
     baca-saja; SUPERADMIN penuh; TI/AUDITOR tanpa meja. Menghijau penuh
     setelah `AkunGuard` mendarat di domain.
2. **Jalan di perangkat**: Android Studio → Run `app` (utama Android ≥12,
   uji batas Android 8). `BASE_URL` produksi di `app/build.gradle.kts`;
   akun uji peran KEPALA_DIVISI dan ADMIN_PT (akun `uji-android@…` tugas
   server pendamping).
3. **Skenario manual inti**:
   - Kadiv: isi butir Kamis → serah (badge "Menunggu persetujuan") → setujui
     (badge "Disetujui") → coba setujui lagi → 409 ditampilkan baik.
   - Kadiv: kirim ringkasan ke Direktur dengan 1 poin → tarik kembali < 15 menit.
   - Admin: Penerimaan → teruskan harian → toast "Urungkan" → urungkan →
     baris kembali SIAP; teruskan lagi di web oleh rekan → 409 "sudah
     diteruskan" ditampilkan baik.
   - Admin: kepatuhan → Ingatkan satu orang yang belum lapor → 409 kunci
     setelah 17.00 WIB → pesan muncul, tidak mengulang.
   - Admin: meja akun → nonaktifkan PIC (toast Urungkan) → baris Direktur
     entitas tampil baca-saja (tanpa tombol ubah) → terbitkan aktivasi.
   - Beku: teruskan mingguan → kadiv mencoba menyunting butir → 409 beku →
     tawaran ajukan buka kunci.
4. **Luring**: papan mingguan & antrean penerimaan terbaca dari Room dengan
   tanda "tersimpan saat luring"; tombol tulis menampilkan pesan luring.
5. Gerbang rilis: bagian relevan `docs/design/15-checklist-review.md`
   (maks 1 tombol primer per kartu, warna+ikon+kata, angka tabular).

## 5. Status pekerjaan (8 Oktober 2026 malam)

- Fase 0 selesai build hijau; Fase 1 berjalan paralel (jaringan PIC, layar
  laporan, navigasi mendarat; lihat FASE1.md dan auditnya).
- Terpetakan laporan Fase 2: T6-C1 (jaringan kadiv), T6-C2 (jaringan admin),
  T6-C3 (data mingguan/penerimaan/kepatuhan), T6-C4 (komponen data
  designsystem), T6-C6 (layar tim + ringkasan direktur), T6-C7 (layar
  penerimaan), T6-C8 (layar kepatuhan), T6-C9 (layar meja akun terbatas).
  T6-C5 belum mendarat saat dokumen ini ditutup.
- Kontrak terverifikasi silang oleh tes T6-C10: DTO penerimaan/undo/GalatDto
  (C2) dan KonflikDto + konstanta status mingguan (C1) cocok dengan route web.
- Repositori T6-C3 ditulis menghadap stub mingguan JsonObject sebelum T6-C1
  mendarat — tiga berkas repo perlu penyesuaian tipe (daftar di
  T6-C10-AUDIT butir 1–3) sebelum `:core:data` mengompilasi.
- Zona domain (`StatusHeaderMingguan`, `AkunGuard`), layar papan mingguan
  (ui/mingguan), pendaftaran `MkDatabase` versi 2, dan penyambungan navigasi
  tab KEPALA_DIVISI/ADMIN_PT belum mendarat.

## 6. Sisa menuju Fase 3

1. Semua baris "belum ada" pada tabel §3: layar papan mingguan (T6-C5),
   kontrak domain `StatusHeaderMingguan`/`AkunGuard`, `MkDatabase` versi 2,
   penyambungan `MKShell`/`MkNavHost` untuk tab Capaian mingguan, Penerimaan,
   Divisi (tim), dan pintu meja akun di Pengaturan.
2. Penyelesaian ketidaksesuaian T6-C10-AUDIT (repo vs API terketik C1/C2,
   kosakata hasil ganda `Hasil`/`HasilKirim`, dependensi serialization
   `:core:data`, kontrak daftar akun `GET /api/companies`, `reason` 409 beku
   belum diurai `ApiError`).
3. Aksi tim kadiv (remind/read/unread) dan `kadiv/members` — antarmuka sudah
   ada di `KadivApi` (C1), pemakainya belum (C6 mencatat).
4. Cabang KADIV/ADMIN `GET /api/work-desk` untuk tab Meja kerja.
5. Uji perangkat + Maestro E2E ke staging setelah layar dan jahitan selesai
   (§7 rancangan).
6. Fase 3 (pemantau grup) menunggu: ringkasan per perusahaan → proyek →
   laporan + eskalasi, audit, grafik Compose, tata letak tablet.
