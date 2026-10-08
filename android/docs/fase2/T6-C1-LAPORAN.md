# T6-C1 — Laporan Fase 2: API jaringan sisi kepala divisi

Tanggal: 8 Oktober 2026 · Zona: `android/core/network/` (hanya berkas baru) · Tanpa git/jaringan/DB/gradle.

## Berkas baru

| Berkas | Isi |
| --- | --- |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/api/WeeklyInputApi.kt` | GET/PUT/PATCH/DELETE/POST `api/weekly-input` (papan butir capaian mingguan) |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/api/WeeklyReportsApi.kt` | GET `api/weekly-reports` (arsip laporan mingguan, terpaginasi) |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/api/KadivApi.kt` | GET/POST `api/kadiv/team`, GET/PUT `api/kadiv/members`, GET/PUT/POST `api/kadiv/weekly-summary` |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/api/LaporanDibacaApi.kt` | POST/DELETE `api/ringkasan/laporan-dibaca` |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/dto/DtosFase2Kadiv.kt` | Semua DTO di atas (69 deklarasi, termasuk `OkResponse` F0 yang dipakai ulang) |

Mengikuti pola kontrak F0 (`AuthApi.kt`; `@Query` null tidak dikirim; komentar bahasa Indonesia; impor eksplisit). Tidak menyentuh `build.gradle.kts`, `JsonConfig.kt`, `Factory.kt`, maupun berkas agen paralel (T5-B1: `DailyInputApi`/`TasksApi`/`DtosFase1`, T6-C2: `InboxApi`/`AdminComplianceApi`/`AkunApi`/`DtosFase2Admin`). Pemeriksaan duplikat nama `class` di paket `dto` dan `interface` di paket `api`: kosong.

## Sumber kebenaran yang dibaca

`src/app/api/weekly-input/route.ts`, `weekly-reports/route.ts`, `kadiv/team/route.ts`, `kadiv/members/route.ts`, `kadiv/weekly-summary/route.ts`, `ringkasan/laporan-dibaca/route.ts`, ditambah pembentuk respons: `src/lib/kadiv.ts` (`buildTeam`, `remindTeam`, `markMemberRead`, `buildWeeklySummary`, `entityDirectors`), `src/lib/kadiv-math.ts` (`normalizePoints`, `summaryBlock`), `src/lib/lock.ts` (`weeklyDeadlines`, `weeklyWriteBlock`, `weekPeriodOf`, `daysOfWeek`), `src/components/kadiv/types.ts`, dan `prisma/schema.prisma` (WeeklyDivisionReport, WeeklyReportItem, WeeklyDivisionSummary, WeeklyReportRead, AspectCategory, Priority, Subtask, Entity).

## Ritme waktu yang dipegang klien (tampilan, bukan validasi)

- **handoverBy = Kamis 17.00 WIB** — tenggat kepala divisi menyerahkan capaian ke Admin PT (WEEKLY_HANDOVER_LABEL).
- **lockAt = Jumat 17.00 WIB** — pekan terkunci; setelah ini semua tulisan 409 kecuali buka kunci aktif.
- Tulisan hanya untuk **minggu berjalan**; minggu lalu baca-saja, minggu depan ditolak.
- Ringkasan Direktur mengikuti ritme yang sama: beku setelah laporan diteruskan, terkunci sejak Jumat 17.00.
- Server tetap satu-satunya penentu (pra-validasi klien hanya untuk pesan cepat).

## 1. Papan mingguan — GET /api/weekly-input?entityId=&week=

```json
{
  "week": { "key": "2026-W41", "isoYear": 2026, "isoWeek": 41, "start": "...", "end": "...",
            "handoverBy": "Kamis 17.00", "lockAt": "Jumat 17.00", "current": true },
  "locked": false,
  "days": ["Senin..Minggu (7 entri ISO tengah malam WIB)"],
  "weeks": [{ "key": "...", "start": "...", "end": "...", "current": true }],
  "entities": [{ "id": "...", "code": "...", "name": "..." }],
  "entityId": "...", "entityPinned": false,
  "aspects": [{ "id": "...", "code": "...", "name": "...", "isActive": true, "createdAt": "..." }],
  "priorities": [{ "id": "...", "code": "...", "name": "...", "weight": 3, "createdAt": "..." }],
  "canApprove": true, "canRemind": true,
  "divisions": [{
    "id": "...", "name": "Divisi Keuangan", "type": "Fungsional", "headName": "...",
    "writable": false,
    "lockReason": "Laporan minggu ini sudah diteruskan ke holding dan dibekukan. ...",
    "frozen": true, "unlockUntil": null,
    "report": {
      "id": "...", "statusHeader": "DISETUJUI",
      "submittedAt": "...", "approvedAt": "...", "forwardedAt": "...", "isLocked": false,
      "items": [{ "...seluruh kolom WeeklyReportItem...": "",
        "workDate": "2026-10-06...", "position": 0, "followUp": null,
        "aspectCategory": { "id": "...", "code": "...", "name": "..." },
        "priority": { "id": "...", "code": "...", "name": "..." },
        "subtasks": [{ "id": "...", "title": "...", "isDone": false, "position": 0 }],
        "evidence": [{ "id": "...", "targetId": "...", "fileName": "...", "url": null,
                       "mime": "...", "size": 1234, "createdAt": "..." }],
        "escalationRaised": false }]
    }
  }]
}
```

- `weeks` berisi 8 entri, indeks 0 = minggu berjalan. `entityPinned` true untuk semua peran kecuali TI/Super Admin (yang boleh memilih `entityId`).
- **Kolom datar bentuk lama** (`isoYear`, `isoWeek`, `periodStart`, `periodEnd`, `handoverBy`, `lockAt` di puncak objek) tetap dikirim server demi pembaca lain — DTO hanya memakai objek `week` (+ `locked`); sisanya diabaikan lewat `ignoreUnknownKeys`.
- `statusHeader`: `DRAFT | MENUNGGU_PERSETUJUAN | DISETUJUI | TERKUNCI` (konstanta di `WeeklyReportHeadDto.Companion`).
- Item memuat `needsEscalation` otomatis true saat status `TERKENDALA`; `escalationRaised` mencegah UI menawarkan eskalasi dua kali.

## 2. Simpan butir — PUT /api/weekly-input

Badan (`WeeklyItemSaveRequest`): `divisionId` wajib; `itemId` null = baru; `week` null = minggu berjalan; `workItem`/`status`/`aspectCategoryId`/`priorityId` wajibi (422 bila kosong); `progressPct` dijepit 0–100; `tags` maks 8; `subtasks` dikirim utuh (maks 30) MENGGANTIKAN daftar lama; teks bebas dipangkas 4000 huruf oleh server.

```json
{ "ok": true, "reportId": "...", "itemId": "..." }
```

Perilaku penting:
- **`workDate` tri-semesta**: null (tidak dikirim) = pertahankan hari yang ada; `""` = pindah ke lajur "Mingguan"; `"YYYY-MM-DD"` = hari tertentu (422 bila di luar pekan). Karena mkJson tidak menulis field bernilai bawaan, null memang berarti "tidak dikirim" — string kosong adalah satu-satunya cara eksplisit mengosongkan.
- Kartu yang pindah lajur jatuh ke urutan paling bawah lajur barunya.
- Suntingan pada laporan `MENUNGGU_PERSETUJUAN`/`DISETUJUI` **menariknya kembali ke DRAFT** (submittedAt/dst. di-nol-kan) — kecuali yang sudah diteruskan.
- **Beku setelah diteruskan**: `forwardedAt` terisi → 409 `{error, locked: true, frozen: true, reason: "FORWARDED"}`. Saat buka kunci aktif koreksi tersimpan langsung TANPA menarik status dan tanpa diserahkan ulang.
- Alasan `reason` lain dari `weeklyWriteBlock`: `FUTURE_WEEK` | `PAST_WEEK` | `TIME_LOCKED` | `REPORT_LOCKED`.
- Validasi ramah klien sebelum kirim: aspek+prioritas terpilih; uraian+status terisi; status `TERKENDALA` wajib mengisi `obstacleFollowUp` (422 "Kendala wajib diisi...").

## 3. Seret-lepas — PATCH /api/weekly-input

`{divisionId, week?, moves: [{itemId, workDate, position}]}` (maks 200 kartu) → `{ok, moved}`. Mengurutkan **tidak** menarik laporan kembali ke draf — hanya isi yang tidak berubah. 422 bila ada kartu bukan milik laporan ini atau hari tujuan di luar pekan.

## 4. Hapus butir — DELETE /api/weekly-input?itemId=

→ `{ok: true}`. Lampiran ikut terhapus dari penyimpanan. 409 bila item sudah dieskalasi ("Item yang sudah dieskalasi tidak dapat dihapus.") atau laporannya terkunci/beku (bentuk galat sama dengan PUT).

## 5. Serah / setujui — POST /api/weekly-input

`{divisionId, week?, action}` dengan `action` `"submit"` (hanya DRAFT) atau `"approve"` (hanya MENUNGGU_PERSETUJUAN); pembantu `WeeklyAksiRequest.serahkan(...)` / `.setujui(...)`.

```json
{ "ok": true, "statusHeader": "MENUNGGU_PERSETUJUAN" }
```

- Setiap butir harus lolos `validateWeeklyItem` dulu → 422 `{error: "2 item belum lolos validasi", errors: ["Uraian: ...", ...]}` (ApiError F0 sudah memetakan `errors`).
- Pagar status lengkap: 409/422 untuk "sudah diteruskan", "masih draf" (approve), "sudah disetujui", "sudah diserahkan", dan **409 balapan suntingan**: "Status laporan sudah berubah. Muat ulang lalu coba lagi." (klaim bersyarat P2025) — jangan pernah ditimpa lokal.
- `approve` mencatat `approvalHash` sha256 (ringkasan jujur isi yang disetujui).

## 6. Arsip — GET /api/weekly-reports

Saringan `page`/`pageSize` (maks 200)/`entityId`/`statusHeader`/`search` (nama divisi, PT, region)/`isoYear`/`isoWeek`; `@Query` null tidak dikirim.

```json
{ "items": [{ "id": "...", "divisionId": "...", "entityId": "...", "isoYear": 2026, "isoWeek": 41,
              "periodStart": "...", "periodEnd": "...", "statusHeader": "DISETUJUI",
              "submittedById": "...", "submittedAt": "...", "forwardedById": null, "forwardedAt": null,
              "approvedById": "...", "approvedAt": "...", "approvalHash": "sha256:...",
              "isLocked": false, "lockedAt": null, "isLate": false,
              "createdAt": "...", "updatedAt": "...",
              "division": { "id": "...", "name": "..." },
              "entity": { "id": "...", "name": "...", "code": "...", "region": null },
              "approvedBy": { "id": "...", "name": "...", "email": "..." },
              "items": [WeeklyItemDto tanpa subtasks/evidence/escalationRaised] }],
  "total": 42, "page": 1, "pageSize": 20, "summary": { "waiting": 3, "late": 1 } }
```

- `WeeklyItemDto` dipakai bersama weekly-input dan weekly-reports; ketiga field hanya-mingguan-input (`subtasks`, `evidence`, `escalationRaised`) diberi bawaan sehingga dekode kedua bentuk tetap berhasil. `priority.weight` hanya dikirim weekly-reports (bawaan 0).

## 7. Tim kepala divisi — GET /api/kadiv/team?divisionId=

Bentuk dari `buildTeam` (KadivTeam). `division` null bila akun tak memimpin divisi (sisa field kosong tetap terkirim). Poin penting per anggota (`KadivAnggotaDto`):

- `attendance`: `HADIR | TERLAMBAT | CUTI | SAKIT | IZIN` (bawaan HADIR; `TERLAMBAT` tetap dihitung hadir).
- `report.state`: `TERKIRIM | BELUM | ABSEN | TIDAK_WAJIB` — penyebut laporan hanya `reporters` (wajib lapor, tidak cuti).
- `report.readAt`: tanda baca kepala divisi atas laporan hari ini milik anggota (migrasi 0021); null = belum.
- `load.pct` null = tanpa kapasitas sisa minggu (cuti seminggu); >100 = kelebihan beban.
- `heat`: matriks baris=members kolom=`days` (10 hari kerja), sel `Int?` (null = absen); `onTime30.pct` null = belum ada laporan wajib.
- 403 `{"error":"Divisi ini di luar tanggung jawab Anda"}` bila `divisionId` bukan divisi yang dipimpin.

## 8. Aksi tim — POST /api/kadiv/team (DITAMBAHKAN di luar daftar tugas, lihat catatan)

Rute ini juga punya POST; klien Fase 2 (tombol Ingatkan + tanda baca) memerlukannya, jadi `KadivApi` menyediakan `ingatkanTim`/`tandaiBacaTim` dengan `KadivTeamAksiRequest`:

- `{"action":"remind","userId?":"..."}` → `{ok, sent: [{userId, name, projectId}], skipped}` — sekali per proyek per hari, orang cuti dilewati. 409 `{"error":"Laporan hari ini sudah dikunci pukul 17.00 WIB.","locked":true}`; 429 `{"error","retryAfter"}` (limitReminders); 404 bila userId bukan anggota tim.
- `{"action":"read"|"unread","userId"}` → `{ok, reportIds: [...]}` — menandai laporan harian **hari ini** milik anggota; tanda hanya untuk kepala divisi, alur PIC→Admin PT tidak berubah. 409 bila belum ada laporan masuk hari ini; 503 bila migrasi 0021 belum jalan.

## 9. Keanggotaan — GET/PUT /api/kadiv/members

GET `?divisionId=` → `{division: {id, name, entityId, entityName, headUserId}, people: [...], projects: [...]}`; `people` = akun PIC aktif se-PT (kandidat + anggota, `isMember` penanda), `projects` = proyek AKTIF PT dengan divisinya.

PUT memakai satu pasang saja — pembantu `KadivMemberPutRequest.orang(divisionId, userId, member)` / `.proyek(divisionId, projectId, assign)`:

- `member: true/false` mengubah `User.divisionId`; `assign: true/false` mengubah `Project.divisionId`.
- Respons `{ok, previousDivisionId}` atau `{ok, unchanged: true}` bila tidak mengubah apa pun (idempoten) — `KadivMemberPutResponse` menampung keduanya.
- 422 akun/proyek beda PT atau akun bukan PIC; **409 "Sudah tercatat di divisi lain. Minta Admin PT memindahkannya."** untuk kepala divisi memindahkan milik divisi lain (hanya Admin PT/TI boleh lintas divisi); 403 bila divisi di luar tanggung jawab.

## 10. Ringkasan mingguan untuk Direktur — /api/kadiv/weekly-summary

GET `?divisionId=&week=2026-W41` (bentuk `WeeklySummaryView`):

```json
{
  "division": { "id": "...", "name": "..." },
  "week": { "key": "2026-W41", "isoYear": 2026, "isoWeek": 41, "start": "...",
            "handoverBy": "Kamis 17.00", "lockAt": "Jumat 17.00" },
  "live": { "outputsAccepted": 4, "outputsTarget": 6, "projectsOnTrack": 3, "projectsTotal": 4,
            "openObstacles": 1, "pendingReview": 2, "points": ["...3 poin draf..."] },
  "saved": { "status": "DRAF", "points": ["..."], "...statistik potret...": 0,
             "sentAt": null, "updatedAt": "..." },
  "daily": { "sent": 9, "required": 10 },
  "report": { "id": "...", "statusHeader": "MENUNGGU_PERSETUJUAN", "submittedAt": "...",
              "approvedAt": null, "forwardedAt": null },
  "directors": [{ "id": "...", "name": "..." }],
  "blocked": null,
  "undoMinutes": 15
}
```

- `live` dihitung ulang tiap dibuka; `saved` adalah potret saat disimpan/dikirim (null bila belum pernah); `report.forwardedAt` terisi → ringkasan ikut beku.
- `blocked` null = boleh disunting/dikirim; selain itu `{code, message}` dengan code `NOT_CURRENT_WEEK | LOCKED | FORWARDED | PENDING_REVIEW`.

PUT `{divisionId, points}` — simpan draf. Poin wajib 1–3, tiap ≤280 huruf setelah dirapikan (422). 409 `{"error":"Ringkasan sudah dikirim ke Direktur. ...","code":"SENT"}` bila status TERKIRIM.

POST `{divisionId, action, points?, confirmPending?}`:

- `send`: server memotret angka + poin (`WeeklySummarySendRequest.kirim(...)`; `points` opsional menimpa draf), status `TERKIRIM`, notifikasi lonceng ke direktur PT terdekat → `{ok, sentAt, directors: [{id, name}]}`.
  - **409 `PENDING_REVIEW`** bila masih ada output menunggu review sebelum tenggat serah Kamis — kirim ulang dengan `confirmPending: true` (badan galat membawa `pendingReview`).
  - 409 `SENT` bila sudah terkirim; 409 "Minggu sudah berubah. Muat ulang ringkasan." balah pekan berganti di tengah jalan.
- `unsend` (`tarik(...)`): kembali ke DRAF — hanya pengirim, dalam `undoMinutes` (15 menit), sebelum pekan dikunci atau diteruskan; di luar itu 409 "jendela urungkan 15 menit sudah berakhir". Respons `{ok}`.
- 503 `{"error":"Ringkasan mingguan belum aktif. Minta TI menjalankan migrasi 0021."}` bila tabel belum ada.

## 11. Tanda baca pengawas — POST/DELETE /api/ringkasan/laporan-dibaca

Kedua metode memakai **badan JSON** `{"weeklyReportId": "..."}` (route membaca `req.json()`, bukan kueri — Retrofit `@Body` pada DELETE didukung OkHttp).

- POST (idempoten) → `{ok, readAt}`; DELETE → `{ok}` — dipakai toast "Urungkan" pengawas.
- Hanya peran `MANAJEMEN | DIREKTUR_ENTITAS | DIREKTUR_SDM_GA | SUPERADMIN` (403 lain); hanya laporan terserahkan dan dalam cakupan entitas — di luar cakupan **404 sama dengan yang tidak ada** (keberadaan tidak bocor); masih DRAFT → 409 "Laporan ini belum diserahkan".

## Keputusan teknis

1. **Satu `KonflikDto`** (`error, code?, locked?, frozen?, reason?, pendingReview?, retryAfter?`) untuk mengurai badan 409/429 semua rute ini bila pemanggil butuh lebih dari pesan (mis. membedakan beku `FORWARDED` dari kunci jam `TIME_LOCKED`, atau menawarkan dialog konfirmasi `PENDING_REVIEW`); `ApiError.dari()` F0 tetap jalur utama.
2. **Null vs string kosong**: mkJson tidak menulis field bernilai bawaan (encodeDefaults=false bawaan pustaka), maka "pertahankan nilai lama" = null (tidak dikirim) dan "kosongkan" = `""` — hanya relevan pada `WeeklyItemSaveRequest.workDate` dan `WeeklyMoveDto.workDate` (sudah didokumentasikan di DTO).
3. **Berkas DTO mandiri**: hanya `OkResponse` (F0, kontrak stabil) yang dipakai ulang. Subtask/bukti/pengguna dideklarasikan ulang dengan nama prefiks `Weekly*` (bukan memakai `SubtaskDto`/`EvidenceRingkasDto` T5-B1) supaya zona agen paralel tidak saling menggantung; duplikasi kecil, isolasi besar.
4. **POST kadiv/team ditambahkan** meski tugas hanya menyebut "GET kadiv/team" — rute aslinya punya POST (remind/read/unread) dan layar Fase 2 membutuhkannya; berada di berkas saya sendiri sehingga tidak menyentuh zona lain. Mudah dilepas bila koordinator ingin memindahnya.
5. **Satu `WeeklyItemDto` untuk dua rute** (weekly-input vs weekly-reports) — field hanya-mingguan-input diberi bawaan; `ignoreUnknownKeys` + `coerceInputValues` mkJson menutup perbedaan include.
6. `@Query` null tidak dikirim (perilaku Retrofit) — dipakai untuk saringan opsional weekly-reports dan `entityId`/`week`/`divisionId` di tempat lain.
7. **Belum dikompilasi** (gradle dilarang tugas ini); tanda tangan Retrofit/kotlinx.serialization mengikuti pola F0/T5-B1/T6-C2 yang sudah terbukti terbangun. Catatan lintas agen: bentrokan `InboxResponse` Fase1↔Fase2Admin sudah tidak ada — T5-B1 mengganti namanya menjadi `NotificationsInboxResponse` (20.58); verifikasi akhir nama duplikat paket `dto`/`api` hari ini kosong.
