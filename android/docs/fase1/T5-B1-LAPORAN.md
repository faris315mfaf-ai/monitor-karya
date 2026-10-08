# T5-B1 — Laporan perluasan `core/network` API + DTO PIC Fase 1

Tanggal: 8 Oktober 2026 · Cabang: `codex/kerja` · Agen: T5-B1

Sumber kebenaran bentuk JSON: route asli di `src/app/api/…` (dibaca satu per
satu, bukan dari teks tugas). Semua stempel waktu adalah string ISO-8601
(`JSON.stringify` Date); kunci tanggal laporan `"YYYY-MM-DD"` WIB.

## Berkas yang ditulis (hanya `android/core/network/`)

| Berkas | Isi |
| --- | --- |
| `dto/DtosFase1.kt` | Semua DTO Fase 1 (@Serializable, field persis) |
| `api/DailyInputApi.kt` | GET/PUT/DELETE `/api/daily-input` |
| `api/TasksApi.kt` | GET hari/mingguan, POST/PUT/PATCH/DELETE `/api/tasks` |
| `api/EvidenceApi.kt` | GET/POST tautan, POST multipart upload, GET/DELETE `{id}` |
| `api/WorkDeskApi.kt` | GET/POST `/api/work-desk` (cabang PIC) |
| `api/ProjectsApi.kt` | GET `/api/projects` |
| `api/DailyReportsApi.kt` | GET `/api/daily-reports` (filter projectId T3-A1) |
| `api/UnlockApi.kt` | GET + POST `/api/unlock-requests` |
| `api/UndoApi.kt` | POST `/api/undo` |
| `api/NotificationsApi.kt` | GET inbox/riwayat + PATCH `/api/notifications` |
| `ApiError.kt` | `Konflik` diperluas `locked/frozen/reportId` (aman mundur) |

## Bentuk respons per route (cuplikan inti)

### GET /api/daily-input?date=YYYY-MM-DD
Query hanya `date` (opsional, bawaan hari ini) — **projectId TIDAK ada**;
daftar proyek diambil dari sesi (PIC: proyeknya; Admin PT: PT-nya).

```json
{
  "reportDate": "…", "reportDateKey": "2026-10-08", "today": true, "todayKey": "2026-10-08",
  "lockAt": "…", "locked": false,
  "countdown": { "hours": 3, "minutes": 12, "totalMs": 11520000, "passed": false },
  "canRequestUnlock": true,
  "openDays": [ { "reportId": "…", "projectId": "…", "projectName": "…", "date": "2026-10-06", "unlockUntil": "…" } ],
  "projects": [ {
    "id": "…", "code": "PT-X-PRJ-01", "name": "…", "phase": "PELAKSANAAN",
    "taskCount": 4, "derived": true, "editable": false,
    "lockReason": "FORWARDED | LOCKED | TIME | null",
    "unlock": { "id": "…", "status": "DIEKSEKUSI", "unlockUntil": "…" },
    "report": {
      "id": "…", "status": "ON_PROGRESS", "progressPct": 40,
      "achievementToday": "…", "obstacle": null, "followUp": null,
      "decisionRequestedFrom": null, "evidenceCount": 2,
      "submittedAt": "…", "forwardedAt": null, "isLocked": false,
      "evidence": [ { "id": "…", "targetId": "…", "fileName": "…", "url": null, "mime": "image/jpeg", "size": 12345, "createdAt": "…" } ]
    }
  } ]
}
```

### PUT /api/daily-input → `{ ok, reportId, submitted, derivedFromTasks }`

**Tidak ada `undoToken`** — telusuran route: respons PUT harian persis 4 field
di atas. (422 membawa `{ error, errors, evidenceCount }`.)

### DELETE /api/daily-input?projectId=&date= → `{ ok: true }` (laporan + baris buktinya; task tidak ikut)

### 409 dari daily-input/tasks (semua tulis)
```json
{ "error": "…", "locked": true, "frozen": "FORWARDED|LOCKED", "reportId": "…" }
{ "error": "…", "locked": true, "reportId": "…" }          // lewat 17.00 / minggu terkunci
{ "error": "…", "locked": false }                            // simpan bersamaan (P2002)
```
Diurai `ApiError.Konflik(locked, frozen, reportId)`; kolom absen = null.

### GET /api/tasks?projectId=&date= → `{ workDate, locked, frozen, reportId, unlockUntil, tasks:[TaskDto] }`
### GET /api/tasks?projectId=&week=2026-W37
```json
{ "mode": "MINGGUAN",
  "period": { "key": "2026-W41", "start": "…", "end": "…", "lockAt": "…", "current": true },
  "locked": false, "frozenDays": ["…"], "today": "…", "days": ["…","…"], "tasks": [TaskDto] }
```
`TaskDto` = seluruh kolom tabel Task + `subtasks[]` (id, taskId, weeklyItemId,
title, isDone, position, createdAt) + `picUser {id,name}` + `escalation
{id,status,needed,decisionText}` + `evidence[]` (bentuk EvidenceRingkas di atas).

POST/PUT → `{ ok, task }`; PATCH moves `{projectId, week, moves:[{id, lane,
sortOrder}]}` → `{ ok, moved }`; DELETE ?id=&context= → `{ ok }`.

### Bukti
- GET `?targetType=&targetId=` → `{ items: [EvidenceItemDto utuh], total }`
  (EvidenceItemDto: id, targetType, targetId, storageKey, fileName, mime, size,
  url, uploadedById, createdAt).
- POST `/api/evidence` (tautan) `{targetType,targetId,fileName,url}` →
  `{ ok, evidence: EvidenceItemDto, evidenceCount }`.
- POST `/api/evidence/upload` — multipart, nama field **`file`, `targetType`,
  `targetId`, `label`** (opsional). Batas **20 MB** (413 bila lebih; content-length
  > 21 MB ditolak sebelum badan dibaca). MIME+ekstensi+isi harus cocok (415).
  → `{ ok, evidence: { id, fileName, mime, size, storageKey, url: null, createdAt }, evidenceCount }`.
- GET `/api/evidence/{id}` → `{ url, kind: "link"|"file", expiresInSeconds: 300? }`.
- DELETE `/api/evidence/{id}` → `{ ok, evidenceCount }`.

### GET /api/work-desk (cabang PIC)
```json
{ "kind": "PIC", "today": "…", "lockAt": "…", "locked": false, "countdown": {…},
  "cutoffLabel": "17.00 WIB", "days": ["…"],
  "projects": [ { "id": "…", "code": "…", "name": "…", "phase": "…",
      "startDate": "…", "targetEndDate": "…", "entityName": "…",
      "tasks": { "total": 5, "done": 2, "blocked": 1 },
      "report": { "status": "…", "progressPct": 40, "submittedAt": "…", "forwardedAt": null, "isLate": false, "evidenceCount": 1 },
      "history": [ { "date": "…", "submitted": true, "isLate": false, "status": "…", "progressPct": 40 } ],
      "remindedAt": null, "remindedBy": null } ] }
```
Bentuk KADIV/ADMIN (peran lain) tidak dimodelkan — Fase 2. POST
`{action:"remind-pic",projectId}` → `{ok,projectId,picName,remindedAt}`;
`{action:"remind-all-pics"}` → `{ok,sent,skipped}` (aksi Admin PT).

### GET /api/projects → `{ items:[ProjectDto], total, page, pageSize, summary:{running,waiting,resubmit,late,risk,silent} }`
`ProjectDto` = format() route: id, name, code, phase, lifecycle, picName,
picUserId, divisionId, division{id,name}, description, purpose,
proposedBy{id,name,role}, proposedAt, approvalChain[], pendingRole,
approvals[{role,decision,note,decidedAt,decidedByName}], relatedEntities[{id,name,code}],
startDate, targetEndDate, approvedByName, approvedAt, noApproval, createdAt,
updatedAt, entity{id,name,code,region}, latestReport{status,progressPct,reportDate,isLate,obstacle,needsEscalation},
permissions{manage,setLifecycle,approve,resubmit}.

### GET /api/daily-reports?projectId=&pageSize=&… → `{ items:[DailyReportRowDto], total, page, pageSize }`
Baris utuh DailyProjectReport + `project{id,name,code}` + `entity{id,name,code,region}`
+ `submittedBy{id,name,email}`.

### GET /api/unlock-requests → `{ items:[UnlockRequestDto+targetLabel], total, page, pageSize, can:{request,approve,execute}, me }`
POST `{targetType:"DAILY_REPORT", targetId, reason(≥10 karakter)}` → 201
`{ ok, item: { …baris baru…, targetLabel } }`. 409 bila masih diproses.

### POST /api/undo — `{ token }` → `{ ok, action, targetType, targetId, message }`

### Notifikasi
- GET `?inbox=1` → `{ unread, items:[{id,template,title,body,tab,createdAt,readAt}] }`
  (kelas klien `NotificationsInboxResponse` — nama `InboxResponse` sudah
  dipakai DTO Fase 2 milik agen lain di paket yang sama).
- GET tanpa inbox → `{ items:[NotificationLogDto], total, page, pageSize }`.
- PATCH `{ids:[…]|all:true}` → `{ ok, marked }`.

## undoToken — temuan penting

Tiket `undoToken` **tidak diterbitkan oleh route Fase 1 yang dipakai PIC**
(daily-input PUT, tasks, evidence, unlock POST, notifications — diverifikasi
satu per satu). Penerbit (untuk toast "Urungkan" alur `src/lib/undo-client.ts`,
berlaku 15 menit, sekali pakai, pelaku sama):

| Route asal | Aksi | UndoAction |
| --- | --- | --- |
| projects PATCH (`resubmit`) | ajukan ulang ditolak | RESUBMIT_PROJECT |
| projects PATCH (lifecycle DIARSIPKAN) | arsip | ARCHIVE_PROJECT |
| projects/{id}/approvals | keputusan pengajuan | APPROVE/REJECT_PROJECT |
| eskalasi | tinjau/putuskan/tutup | *_ESCALATION |
| Penerimaan (penerusan) | harian/mingguan | FORWARD_DAILY/WEEKLY_REPORT |

Fase 1 tetap menyediakan `UndoApi` + `UndoRequest/UndoResponse` agar UI toast
siap; respons terkait (mis. PATCH projects) cukup menambah `undoToken: String?`
nanti tanpa memecah pemakaian sekarang.

## Catatan teknis

- `mkJson` memakai `encodeDefaults = false`: properti request bernilai bawaan
  TIDAK dikirim. Ini sengaja dipakai di `TaskSaveRequest` — `picUserId` null
  berarti tidak dikirim (PUT mempertahankan PIC lama); kirim `""` untuk
  melepasnya (server membaca string kosong sebagai null).
- `Konflik` lama (`Konflik(pesan)`) tetap sah — tiga field baru bernilai
  default null, dan 409 yang sebelumnya jatuh ke `Lainnya` kini menjadi
  `Konflik` dengan payload lengkap.
- `WorkDeskApi.meja()` bertipe cabang PIC; peran lain gagal dekode (memang
  belum didukung sampai Fase 2).
- Tidak menjalankan gradle/git/DB sesuai batas tugas.
