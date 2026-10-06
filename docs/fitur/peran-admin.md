# Peran Admin PT — status per butir spesifikasi

[← Indeks](README.md) · Spesifikasi: [`04-admin-pt.md`](../design/peran/04-admin-pt.md) · Terkait: [pengingat](pengingat.md), [permintaan akses](permintaan-akses.md), [log](log.md), [meja kerja](meja-kerja.md)

Audit F2-ADMIN, 6 Okt 2026. Status: **Selesai**, **Sebagian**, atau **Belum**. Semua yang berstatus Selesai sudah lolos `tsc`, `eslint`, dan `vitest`. Belum ada yang diuji pada basis data sungguhan. Data contoh untuk `/pratinjau?peran=ADMIN_PT` ada di `src/components/preview/mock-admin.ts`.

## Ringkasan (desktop)

| # | Butir spesifikasi | Status | Di mana |
| --- | --- | --- | --- |
| 1 | Sidebar "Admin PT · 3 entitas", nav Kepatuhan · Permintaan akses · Pengguna · Data induk · Log · Pengingat dengan lencana angka | **Sebagian** | Tab tetap mengikuti `ROLE_TABS` (Ringkasan · Meja kerja · Penerimaan · …). Kepatuhan, permintaan akses, pengingat, data induk, dan log tampil sebagai kartu di Ringkasan. Menambah tab berarti mengubah `rbac.ts` dan `shell.tsx`, yang bukan milik wilayah ini. |
| 2 | Header tanggal, jam, sapaan, dan SearchField "Cari pengguna, divisi, proyek" | **Sebagian** | `DashHeader` sudah menampilkan tanggal dan sapaan. Palet ⌘K (F2-DIREKTUR) bisa dibuka dengan pintasan dan dibatasi PT Admin; kolom cari di header belum ada. |
| 3 | Hero "x% laporan harian sudah masuk hari ini", tombol "Kirim pengingat ke semua" (→ "Semua sudah diingatkan"), tautan "Tinjau n permintaan akses" | **Selesai** | `src/components/admin/admin-summary.tsx`. Angkanya per **orang** dari `/api/admin/compliance`, dengan cadangan per proyek bila belum ada PIC. Setelah 17.00, atau bila semua sudah lapor, tombol primer menjadi "Teruskan n laporan" atau "Buka meja kerja". |
| 3 | Cincin Laporan harian · Laporan mingguan · Akun aktif | **Selesai** | Cincin mingguan menghitung divisi yang sudah menyerahkan (Masuk atau Terlambat). |
| 3 | KPI: Laporan harian masuk (gradien, rata-rata 10 hari) · Belum lapor · Permintaan akses · Akun tidak aktif | **Selesai** | Keterangan "Akun tidak aktif" berbunyi "dari n akun", bukan "dinonaktifkan otomatis". Penonaktifan otomatis hanya terjadi pada akses sementara yang berakhir. |
| 4 | Kepatuhan per divisi: Harian/Mingguan, DivisionBar "x dari y orang", status Lengkap / n belum / Diingatkan, tombol Ingatkan; mingguan Masuk / Terlambat / Belum masuk | **Selesai** | `ComplianceCard` di `src/components/admin/compliance.tsx`. Nama kepala divisi tampil di baris keterangan, bukan di kolom sendiri. |
| 5 | Peta panas 6 divisi × 10 hari, nada hijau | **Selesai** | `ComplianceHeatmapCard`. |
| 5 | Donat Pengguna per peran | **Selesai** | Warnanya diganti dari `data-1..6` ke palet aksen, karena `data-*` khusus untuk divisi. Peran "Staf" tidak ada di sistem, jadi donat memakai peran yang ada. |
| 6 | Permintaan akses (ApprovalItem) dan kosong "Semua permintaan sudah diproses." | **Selesai** | `access-requests-card.tsx`. Avatar kini memakai warna aksen, bukan `data-*`. |
| 6 | Pengingat otomatis, 4 sakelar | **Selesai** | `reminder-rules-card.tsx`. Sakelar berlaku seketika, bisa di-Urungkan, dan konfirmasinya ("Maya Lestari mematikan ringkasan untuk manajemen") langsung muncul di Log aktivitas. |
| 7 | Data induk, 5 ubin | **Selesai** | `master-data.tsx`. Ubin "Template" menghitung jenis divisi, karena belum ada model template. |
| 8 | Log aktivitas dan tombol "Unduh log" | **Selesai** | `ActivityLogCard` (`activity-log.tsx`) membaca `GET /api/admin/activity`. Unduhan: `GET /api/audit-logs/export`. |

## Sheet divisi

| Butir | Status | Catatan |
| --- | --- | --- |
| Judul "Divisi X", subjudul "Kepala divisi Y" | **Selesai** | |
| 2 ubin: Laporan harian x dari y · Laporan mingguan M lencana | **Selesai** | |
| Peta panas 10 hari divisi itu | **Selesai** | |
| Belum lapor: avatar, nama, "peran · terakhir lapor …", Ingatkan per orang (→ "Diingatkan HH.MM") | **Selesai** | Nama proyek yang belum terkirim juga ditampilkan. |
| Semua sudah lapor: "Semua anggota sudah lapor hari ini." | **Selesai** | |
| "Hubungi kepala divisi" | **Selesai** | Membuka `mailto:`, atau `tel:` bila email kosong, dari `User.email`/`User.phone`. Kontak juga tampil sebagai tautan di dalam sheet. |
| "Ingatkan semua" | **Selesai** | Tombol primer di kaki sheet. Kaki sheet menempel di ponsel. |

## Tablet dan ponsel

| Butir | Status | Catatan |
| --- | --- | --- |
| Tablet: tab Ringkasan · Kepatuhan · Akses · Data | **Belum** | Satu layar Ringkasan dengan kartu. Lihat butir sidebar di atas. |
| Tablet: kartu divisi 2 kolom | **Sebagian** | Memakai daftar baris yang sama dengan desktop. Barisnya melipat di layar sempit. |
| Ponsel: baris divisi = tombol ke detail, detail layar didorong "‹ Kepatuhan", tombol "Ingatkan semua" menempel | **Selesai** | Sheet menangani layar yang didorong. Teks tombol kembali: "Kepatuhan". |
| Ponsel: label peta panas 3 huruf | **Belum** | Label memakai nama lengkap. Peta panas bisa digeser ke samping (`mk-scroll-x`). |

## Aturan khusus

| Aturan | Status | Catatan |
| --- | --- | --- |
| Admin tidak menilai isi laporan (tanpa Terima/Revisi) | **Selesai** | |
| Pengingat manual dan otomatis memakai teks yang sama dan tercatat di log | **Selesai** | Semua jalur lewat `remindPicDaily` (`src/lib/reminders-pic.ts`). Setiap pengingat manual tercatat sebagai `REMIND_PIC`. Di log aktivitas, beberapa pengingat beruntun dari orang yang sama digabung menjadi "mengingatkan n PIC". |
| Sakelar berlaku segera dan ada konfirmasi di log | **Selesai** | |
| Perubahan peran/akses selalu lewat permintaan yang disetujui | **Sebagian** | Kepala divisi dan PIC kini bisa mengajukan permintaan (lihat di bawah). Admin PT masih bisa mengubah akun langsung lewat meja akun (fitur 5 Okt 2026). Setiap perubahan itu tercatat `UPDATE_ACCOUNT`. |
| Mingguan "Terlambat" = diserahkan setelah Kamis 17.00 WIB | **Selesai** | `weeklyState` di `src/lib/admin-compliance.ts`. Laporan yang belum diserahkan setelah tenggat lewat tampil "Belum masuk" dengan nada terlambat. |

## Fungsi tambahan F2-ADMIN

- **Pengingat per orang / per divisi / semua.** `POST /api/admin/compliance/remind` menerima `{ userId }`, `{ divisionId }`, atau `{ all: true }`.
  - Hanya untuk proyek di PT akun yang menekan (anti-IDOR). Peran yang boleh: `notify:remind` atau `daily:forward`.
  - Ditolak setelah 17.00 WIB. Orang yang tercatat cuti, sakit, atau izin hari ini dilewati.
  - Sekali per proyek per hari. Bila semua proyek seseorang sudah diingatkan, jawabannya 409 dengan `remindedAt`.
- **Unduh log.** `GET /api/audit-logs/export?dateFrom=&dateTo=&action=` mengembalikan CSV UTF-8 dengan BOM.
  - Rentang bawaan 30 hari terakhir, paling panjang 366 hari, paling banyak 5.000 baris (terbaru dulu). Header `X-Total-Rows` dan `X-Exported-Rows` dikirim.
  - Cakupan: Admin PT melihat akun di PT-nya (subtree), ditambah pekerjaan terjadwal yang menyasar PT itu. Peran `audit:read` mengikuti cakupannya sendiri.
  - Kolom IP dan perangkat hanya untuk peran `audit:read`.
  - Aman dari CSV injection: sel diawali `= + - @ tab CR` diberi awalan `'`, kutip digandakan, dan baris baru diratakan.
  - Dibatasi 10 unduhan per 10 menit per akun. Setiap unduhan tercatat `EXPORT_AUDIT_LOG`.
- **Log aktivitas.** `GET /api/admin/activity?limit=` menghasilkan kalimat "<nama> <tindakan> <sasaran>".
  - Tanpa IP, perangkat, atau isi sebelum/sesudah.
  - Masuk/keluar, simpan draf, dan urut ulang disembunyikan.
  - Admin PT bisa membacanya tanpa mendapat `audit:read`, sehingga tab Audit tetap tertutup.
- **Permintaan akses dari Kepala divisi dan PIC.**
  - Kartu `RequestAccessCard` (`src/components/admin/request-access-form.tsx`) ada di Meja kerja keduanya. Kartu itu menampilkan permintaan sendiri beserta statusnya, dan formulirnya dibuka di Sheet.
  - Pilihan diambil dari `GET /api/access-requests/options`: nama, label peran, divisi, dan status aktif saja.
  - Server (`src/lib/access-requesters.ts`) membatasi sasaran. Kepala divisi hanya menyasar anggota dan PIC proyek divisinya serta dirinya. PIC hanya menyasar dirinya dan anggota divisinya. Posisi yang boleh diminta hanya PIC proyek atau Kepala divisi. Penautan proyek ditolak.
- **Divisi pelaksana proyek.** Formulir proyek punya kolom "Divisi pelaksana" (`Project.divisionId`). `GET /api/projects?options=1` mengembalikan `divisions`, dan `POST`/`PATCH` menerima `divisionId` yang harus divisi aktif di PT pemilik. Nilainya tercatat di AuditLog.
- **Anggota divisi pada akun.** Sheet akun punya kolom "Anggota divisi" (`User.divisionId`).
  - Nama field-nya `memberDivisionId`, karena `divisionId` di rute itu berarti divisi yang dipimpin.
  - Nilai saat ini dibaca dari `GET /api/companies/users?id=`.
  - Pindah PT melepas keanggotaan lama. Perubahannya tercatat di `UPDATE_ACCOUNT`.
- **Buka kunci.** `GET /api/unlock-requests` untuk PIC proyek dan Kepala divisi kini hanya mengembalikan pengajuannya sendiri.

## Aturan hitung kepatuhan per orang (keputusan F2-ADMIN)

Dipakai `/api/admin/compliance`, dan diuji di `tests/lib/admin-compliance.test.ts`.

1. **Proyek ke divisi.** Pakai `Project.divisionId`. Bila kosong, pakai divisi PIC-nya (`User.divisionId`) di PT yang sama. Bila PIC juga tanpa divisi, pakai divisi yang ia pimpin di PT yang sama. Urutan ini sama dengan `src/lib/kadiv.ts`.
2. **Wajib lapor di sebuah divisi.** PIC proyek aktif divisi itu, ditambah anggota aktif divisi yang memegang proyek aktif.
3. **Sudah lapor.** Semua proyek aktif yang ia pegang dan sudah mulai pada hari itu terkirim pada hari itu.
4. **Cuti, sakit, izin.** Orang dengan status itu pada hari tersebut keluar dari penyebut.
5. **Total di hero.** Dihitung per orang unik, jadi orang di dua divisi tidak terhitung dua kali. PIC yang tidak masuk divisi mana pun ikut dalam total dan disebut di bawah kartu kepatuhan.
6. **Peta panas.** Persen orang yang lapor per hari kerja (Senin–Jumat). Hari tanpa orang wajib lapor dibiarkan kosong.

`/api/admin/overview` masih menghitung kepatuhan per anggota (`compliance`) dengan aturan lama P2-C. Bagian itu tidak lagi dipakai Ringkasan Admin, tetapi dibiarkan demi kompatibilitas.

## Migrasi

Tidak ada migrasi baru. Kolom `Project.divisionId`, `User.divisionId`, dan `User.phone` sudah ada (0015 dan sebelumnya). Indeks `AuditLog(at)`, `AuditLog(actorId)`, dan `NotificationLog(createdAt)` juga sudah ada (0002). Folder `0022_admin_more` tidak dibuat.

## Belum

- Tab atau sidebar khusus Admin (Kepatuhan, Permintaan akses, Pengguna, Data induk, Log, Pengingat) dan kolom cari di header.
- Label peta panas 3 huruf di ponsel.
- Uji dengan basis data sungguhan, terutama hitungan per orang setelah `User.divisionId` dan `Project.divisionId` diisi untuk data lama.
- ~~`ApprovalItem` merender "Setujui" primer di setiap baris.~~ Selesai (F4-B): `approveVariant="secondary"` dipakai di `AccessRequestsCard`.
