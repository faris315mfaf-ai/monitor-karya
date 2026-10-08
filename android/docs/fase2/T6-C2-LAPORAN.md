# T6-C2 — Laporan Fase 2: API jaringan sisi Admin PT

Tanggal: 8 Oktober 2026 · Zona: `android/core/network/` (hanya berkas baru) · Tanpa git/jaringan/DB/gradle.

## Berkas baru

| Berkas | Isi |
| --- | --- |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/api/InboxApi.kt` | GET `api/inbox`, POST `api/inbox` (teruskan) |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/api/AdminComplianceApi.kt` | GET `api/admin/compliance` (?entityId=), POST `api/admin/compliance/remind` |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/api/AkunApi.kt` | GET/POST/PATCH/DELETE `api/companies/users` + GET/POST `api/companies/users/activation` |
| `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/dto/DtosFase2Admin.kt` | Semua DTO fase 2 admin |

Mengikuti pola kontrak F0 (`AuthApi.kt` + `Factory.buatApi`, baseUrl berakhiri `/`, `mkJson` dengan `ignoreUnknownKeys`). Tidak ada perubahan `build.gradle.kts` maupun berkas lama.

## Sumber kebenaran yang dibaca

`src/app/api/inbox/route.ts`, `src/app/api/admin/compliance/route.ts` + `remind/route.ts`, `src/app/api/companies/users/route.ts` + `activation/route.ts`, ditambah pustaka pembentuk respons: `src/lib/admin-compliance.ts` + `admin-compliance-server.ts` (`loadCompliance`), `src/lib/reminders-pic.ts` (`RemindResult`), `src/lib/companies.ts` (`PositionInput`, `createAccount`), `src/lib/account-activation.ts`, `src/lib/lock.ts` (`dailyCountdown`), `src/lib/undo.ts`, `src/lib/security.ts` (429).

## 1. Penerimaan — GET /api/inbox

```json
{
  "reportDate": "2026-10-07T17:00:00.000Z",
  "dailyLockAt": "2026-10-08T10:00:00.000Z",
  "dailyCountdown": { "hours": 3, "minutes": 24, "totalMs": 12240000, "passed": false },
  "dailyLocked": false,
  "week": { "isoYear": 2026, "isoWeek": 41, "handoverBy": "...", "lockAt": "..." },
  "daily": [{
    "projectId": "...", "code": "PRJ-001", "name": "...", "picName": "..." ,
    "reportId": "..." , "status": "DIKIRIM", "progressPct": 40, "evidenceCount": 2,
    "submittedAt": "...", "submittedBy": "...", "forwardedAt": null, "readyToForward": true
  }],
  "weekly": [{
    "divisionId": "...", "name": "...", "headName": "...", "reportId": "...",
    "statusHeader": "DISETUJUI", "itemCount": 5, "submittedAt": "...", "approvedAt": "...",
    "forwardedAt": null, "readyToForward": true
  }]
}
```

403 `{"error":"Peran Anda tidak menerima penerusan"}` bila tanpa kapabilitas daily/weekly:forward.

## 2. Teruskan — POST /api/inbox

Badan persis route: `{ "kind": "daily" | "weekly", "id": "<id laporan>" }` — `id` adalah id `DailyProjectReport`/`WeeklyDivisionReport`, BUKAN id proyek/divisi. `kind` selain `"weekly"` diperlakukan `"daily"`. Pembantu: `TeruskanRequest.harian(id)` / `mingguan(id)`.

Respons sukses:

```json
{ "ok": true, "undoToken": "..." }
```

- **undoToken hanya kadang ada** [F2-URUNGKAN]: diterbitkan setelah transaksi berhasil (`issueUndo`); bila gagal (mis. migrasi 0025 belum ada) field TIDAK dikirim → `TeruskanResponse.undoToken: String? = null`. Penerusan tetap sukses; UI hanya tidak menawarkan "Urungkan". Tiket: 15 menit, sekali pakai, hanya pelaku yang sama, dikonsumsi POST /api/undo.
- Teruskan harian sekaligus membekukan laporan (`isLocked: true, lockedAt`), 6 Okt 2026.
- Klik ganda aman (klaim bersyarat / P2025) → 409.

Galat: 400 id kosong · 403 di luar entitas/wewenang · 404 tidak ditemukan · 422 PIC belum kirim / kepala divisi belum menyetujui · **409 `{"error":"Laporan ini sudah diteruskan"}`** — di route ini 409 HANYA `{error}`. Bentuk lengkap `{error, locked, frozen, reportId}` itu milik `/api/tasks` (zona T6-C1); tetap didukung pembaruannya lewat `GalatDto` yang opsional semua fieldnya.

## 3. Kepatuhan — GET /api/admin/compliance?entityId=

Bentuk dari `ComplianceData` (src/lib/admin-compliance.ts):

```json
{
  "today": "...", "days": ["..."], "locked": false,
  "week": { "isoYear": 2026, "isoWeek": 41, "handoverBy": "...", "lockAt": "...", "handoverPassed": false },
  "totals": { "expected": 12, "reported": 9, "onLeave": 1, "reminded": 2, "unassigned": 0 },
  "divisions": [{
    "id": "...", "name": "...", "entityId": "...",
    "head": { "id": "...", "name": "...", "email": null, "phone": null },
    "expected": 4, "reported": 2, "onLeave": 0,
    "missing": [{
      "id": "...", "name": "...", "role": "Manager / PIC proyek",
      "lastReportAt": "...", "remindedAt": null, "projects": ["Jalan A"]
    }],
    "history": [100, 75, null],
    "weekly": { "state": "MASUK", "statusHeader": "DISETUJUI", "submittedAt": "...",
                "approvedAt": "...", "forwardedAt": null }
  }],
  "canRemind": true
}
```

- `weekly.state`: `"MASUK" | "TERLAMBAT" | "BELUM"` (konstanta di `MingguanDivisiDto` companion).
- `history`: larik `Int?` — null = tidak ada yang wajib lapor hari itu.
- `head`: null bila divisi tanpa kepala / kepala nonaktif.
- `?entityId=` opsional (peran grup); PT tak ditemukan → 404 `{"error":"Perusahaan tidak ditemukan"}`. Retrofit: `@Query` null tidak dikirim.

## 4. Pengingat — POST /api/admin/compliance/remind

Tepat satu dari `{userId}` | `{divisionId}` | `{all:true}` (dua terisi → 400 "Pilih satu orang, satu divisi, atau semua."). Pembantu: `IngatkanRequest.orang/divisi/semua()`.

```json
{ "ok": true, "people": [{ "userId": "...", "name": "...", "remindedAt": "..." }],
  "sent": 3, "skipped": 1 }
```

`people` satu entri per orang (dedup), `sent` per proyek. Galat penting:
- 409 `{"error":"Laporan hari ini sudah dikunci pukul 17.00 WIB.","locked":true}`
- 409 `{"error":"Orang ini sudah diingatkan hari ini.","remindedAt":"..."}` (atau "Semua laporannya hari ini sudah terkirim.", `remindedAt: null`)
- 409 `{"error":"Orang ini tercatat cuti atau izin hari ini."}`
- 404 orang/divisi tidak ada di PT pengirim · 403 akun grup tanpa PT · 429 `{"error","retryAfter"}` (satu pengingat per proyek per hari).

## 5. Meja akun — /api/companies/users

- **GET ?id=** → `{"id":"...","memberDivisionId":"..." | null}` (`KeanggotaanDivisiDto`; memberDivisionId = divisi yang diikuti sebagai ANGGOTA, bukan yang dipimpin).
- **POST** `AkunBaruRequest` (nama, peran wajib; username/email/password kosong → slug/nama@karya.co.id/acak; akun selalu wajib ganti sandi) → `{"ok":true,"account":{"id","name","role","username","email","divisionId"?,"projectId"?}}`.
- **PATCH** `AkunUbahRequest` (semua opsional kecuali `id`) → `{"ok":true,"account":{"id","name","username","email","role","title","isActive","scopeEntityId","divisionId"?,"projectId"?}}`.
- **DELETE ?id=** → `{"ok":true}` (memakai `OkResponse` F0).

Catatan kontrak penting:
- **`mustChangePassword` tidak pernah dikirim route ini** (hanya `/api/auth/me`); di `AkunDto` disediakan opsional demi toleransi. Efeknya nyata di PATCH `password` untuk orang lain (server memaksa ganti sandi) dan respons `account` tetap tanpa field itu.
- **Mengosongkan nilai di PATCH memakai string kosong `""`, bukan null**: serializer menghilangkan field null (mkJson `encodeDefaults=false` + bawaan `= null`), sedangkan server membaca `""` sebagai kosongkan (`memberDivisionId`, `title`, `phone`, `entityId` ke tingkat holding). `password: ""` dilewati server.
- Pagar 409: akun sendiri tidak bisa dinonaktifkan/dihapus; Super Admin aktif terakhir tidak bisa diturunkan/dinonaktifkan/dihapus. 403 meja terbatas (Admin PT) untuk peran di luar jangkauan; 422 pesan aman klien (username/email dipakai, sandi lemah).

## 6. Aktivasi — /api/companies/users/activation

- **GET ?id=** → `{"canActivate":true}` (hanya itu; metadata punya token tidak pernah terbaca setelah terbit). Galat: 403/404/409 `{"error"}` (mis. "Kredensial akun ini sudah berubah. Gunakan pengaturan kata sandi.").
- **POST {userId}** → `{"ok":true,"activation":{"userId":"...","username":"...","path":"/login/aktivasi#token=...","expiresAt":"..."}}`. Token hanya di fragmen `path` (tidak dikirim ke server saat dibuka), berlaku 24 jam, `Cache-Control: no-store`. Batas 429: 20/pengelola dan 5/akun per 15 menit.

## Keputusan teknis

1. **Field opsional selalu `= null`** → mkJson (encodeDefaults=false) menghilangkannya saat mengirim; penting untuk PATCH (kehadiran field = sinyal ubah).
2. **Satu `GalatDto` seragam** (`error, locked?, frozen?, reportId?, remindedAt?, retryAfter?`) untuk mengurai `errorBody()` 409/429 bila pemanggil butuh lebih dari pesan; `ApiError.dari()` F0 tetap jalur utama penerjemahan galat.
3. `history: List<Int?>` dan `head: ...? = null` mengikuti JSON yang memang bisa null.
4. Tidak menyentuh `JsonConfig.kt`/`Factory.kt`/`MkClient.kt` (berkas lama); antarmuka baru langsung jalan lewat `buatApi(...)` yang ada.
5. Belum dikompilasi (gradle dilarang tugas ini); tanda tangan Retrofit/kotlinx.serialization mengikuti pola F0 yang sudah terbukti terbangun.
