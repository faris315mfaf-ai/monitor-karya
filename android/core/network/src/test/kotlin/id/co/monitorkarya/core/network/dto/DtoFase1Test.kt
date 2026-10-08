package id.co.monitorkarya.core.network.dto

import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Uji dekode DTO Fase 1 hasil agen T5-B1 (`dto/DtosFase1.kt`) terhadap contoh
 * JSON bentuk nyata route web (tes oleh agen T5-B9). Sumber cuplikan:
 * `src/app/api/daily-input/route.ts` (GET/PUT), `src/app/api/tasks/route.ts`
 * (GET/POST), `src/app/api/unlock-requests/route.ts` (POST),
 * `src/app/api/notifications/route.ts` (GET inbox), `src/app/api/undo/route.ts`
 * + `src/lib/undo.ts` (POST). Dekoder memakai [mkJson] (ignoreUnknownKeys)
 * sehingga kolom baru server tidak memecah klien. Murni JVM, tanpa Android.
 */
class DtoFase1Test {

    private inline fun <reified T : Any> urai(json: String): T = mkJson.decodeFromString(json)

    // ---------------------------------------------------------- GET daily-input

    @Test
    fun mejaHarianBidiLengkap() {
        val dto = urai<DailyInputGetResponse>(
            """
            {
              "reportDate": "2026-10-06T00:00:00.000Z",
              "reportDateKey": "2026-10-06",
              "today": true,
              "todayKey": "2026-10-06",
              "lockAt": "2026-10-06T10:00:00.000Z",
              "locked": false,
              "countdown": { "hours": 4, "minutes": 12, "totalMs": 15120000, "passed": false },
              "canRequestUnlock": true,
              "openDays": [
                {
                  "reportId": "rep-31",
                  "projectId": "p-1",
                  "projectName": "Aplikasi Absensi",
                  "date": "2026-10-05",
                  "unlockUntil": "2026-10-08T06:00:00.000Z"
                }
              ],
              "projects": [
                {
                  "id": "p-1",
                  "code": "PRJ-1",
                  "name": "Aplikasi Absensi",
                  "phase": "PELAKSANAAN",
                  "taskCount": 3,
                  "derived": true,
                  "editable": true,
                  "lockReason": null,
                  "unlock": null,
                  "report": {
                    "id": "rep-77",
                    "status": "ON_PROGRESS",
                    "progressPct": 40,
                    "achievementToday": "Modul izin selesai diuji",
                    "obstacle": null,
                    "followUp": "Rilis besok pagi",
                    "decisionRequestedFrom": null,
                    "evidenceCount": 2,
                    "submittedAt": "2026-10-06T09:30:00.000Z",
                    "forwardedAt": null,
                    "isLocked": false,
                    "evidence": [
                      {
                        "id": "ev-1",
                        "targetId": "rep-77",
                        "fileName": "foto-panel.png",
                        "url": null,
                        "mime": "image/png",
                        "size": 482133,
                        "createdAt": "2026-10-06T09:31:00.000Z"
                      }
                    ]
                  }
                },
                {
                  "id": "p-2",
                  "code": "PRJ-2",
                  "name": "Portal Vendor",
                  "phase": "PERENCANAAN",
                  "taskCount": 0,
                  "derived": false,
                  "editable": true,
                  "lockReason": null,
                  "unlock": null,
                  "report": null
                }
              ]
            }
            """.trimIndent(),
        )
        assertEquals("2026-10-06", dto.reportDateKey)
        assertTrue(dto.today)
        assertEquals(4, dto.countdown.hours)
        assertEquals(false, dto.countdown.passed)
        assertTrue(dto.canRequestUnlock)
        assertEquals(1, dto.openDays.size)
        assertEquals("2026-10-05", dto.openDays[0].date)
        assertEquals(2, dto.projects.size)

        val pertama = dto.projects[0]
        assertEquals("PRJ-1", pertama.code)
        assertTrue(pertama.derived)
        assertNull(pertama.lockReason)
        assertNull(pertama.unlock)
        val laporan = pertama.report
        assertEquals("rep-77", laporan?.id)
        assertEquals("ON_PROGRESS", laporan?.status)
        assertEquals(40, laporan?.progressPct)
        assertEquals("Modul izin selesai diuji", laporan?.achievementToday)
        assertNull(laporan?.obstacle)
        assertEquals(2, laporan?.evidenceCount)
        assertEquals(1, laporan?.evidence?.size)
        assertEquals("foto-panel.png", laporan?.evidence?.first()?.fileName)
        assertEquals(482133, laporan?.evidence?.first()?.size)
        assertNull(laporan?.evidence?.first()?.url)

        assertNull(dto.projects[1].report)
        assertEquals(0, dto.projects[1].taskCount)
    }

    @Test
    fun mejaHarianProyekTerbekukanMembawaBukaKunci() {
        val dto = urai<DailyInputGetResponse>(
            """
            {
              "reportDate": "2026-10-06T00:00:00.000Z",
              "reportDateKey": "2026-10-06",
              "today": true,
              "todayKey": "2026-10-06",
              "lockAt": "2026-10-06T10:00:00.000Z",
              "locked": true,
              "countdown": { "hours": 0, "minutes": 0, "totalMs": 0, "passed": true },
              "canRequestUnlock": true,
              "projects": [
                {
                  "id": "p-1",
                  "code": "PRJ-1",
                  "name": "Aplikasi Absensi",
                  "phase": "PELAKSANAAN",
                  "taskCount": 2,
                  "derived": true,
                  "editable": false,
                  "lockReason": "FORWARDED",
                  "unlock": { "id": "ul-9", "status": "DISETUJUI", "unlockUntil": null },
                  "report": null
                }
              ]
            }
            """.trimIndent(),
        )
        val proyek = dto.projects[0]
        assertEquals(false, proyek.editable)
        assertEquals("FORWARDED", proyek.lockReason)
        assertEquals("DISETUJUI", proyek.unlock?.status)
        assertNull(proyek.unlock?.unlockUntil)
        assertTrue(dto.locked)
        assertTrue(dto.countdown.passed)
    }

    // ---------------------------------------------------------- PUT daily-input

    @Test
    fun simpanLaporanRequestDanRespons() {
        val permintaan = urai<DailyInputRequest>(
            """
            {
              "projectId": "p-1",
              "action": "submit",
              "status": "ON_PROGRESS",
              "achievementToday": "Modul izin selesai diuji",
              "obstacle": null,
              "followUp": "Rilis besok pagi",
              "decisionRequestedFrom": null,
              "progressPct": 40,
              "reportDate": "2026-10-06"
            }
            """.trimIndent(),
        )
        assertEquals("p-1", permintaan.projectId)
        assertEquals("submit", permintaan.action)
        assertEquals("2026-10-06", permintaan.reportDate)
        assertEquals(40, permintaan.progressPct)

        val respons = urai<DailyInputPutResponse>(
            """
            {
              "ok": true,
              "reportId": "rep-77",
              "submitted": true,
              "derivedFromTasks": true
            }
            """.trimIndent(),
        )
        assertTrue(respons.ok)
        assertEquals("rep-77", respons.reportId)
        assertTrue(respons.submitted)
        assertTrue(respons.derivedFromTasks)
    }

    @Test
    fun responsPutMenerimaKolomBaruTanpaPecah() {
        // PUT /api/daily-input hari ini tidak membawa undoToken (temuan B1:
        // penerbit tiket adalah route inbox/approve/eskalasi). Saat server
        // menambahkan kolom apa pun (undoToken, isLate, …), dekode tetap
        // berhasil karena mkJson memakai ignoreUnknownKeys — klien Fase 1
        // tinggal menambahkan properti bila mau memakainya (pola defensif
        // yang dipakai LaporanViewModel zona T5-B5).
        val respons = urai<DailyInputPutResponse>(
            """
            { "ok": true, "reportId": "rep-77", "submitted": true,
              "derivedFromTasks": false, "undoToken": "cmd4tok123", "isLate": false }
            """.trimIndent(),
        )
        assertTrue(respons.ok)
        assertEquals("rep-77", respons.reportId)
    }

    // ---------------------------------------------------------- GET/POST tasks

    @Test
    fun lajurHarianDenganTugasDanBukti() {
        val dto = urai<TasksDayResponse>(
            """
            {
              "workDate": "2026-10-06T00:00:00.000Z",
              "locked": false,
              "frozen": null,
              "reportId": "rep-77",
              "unlockUntil": null,
              "tasks": [
                {
                  "id": "t-1",
                  "projectId": "p-1",
                  "entityId": "e-1",
                  "workDate": "2026-10-06T00:00:00.000Z",
                  "title": "Uji modul izin",
                  "description": "Uji regresi tiket 12-15",
                  "tags": ["uji"],
                  "picUserId": null,
                  "picName": "Rina",
                  "startAt": "2026-10-06T02:00:00.000Z",
                  "endAt": "2026-10-06T05:00:00.000Z",
                  "durationMin": 180,
                  "status": "BERJALAN",
                  "progressPct": 60,
                  "urgency": "TINGGI",
                  "sortOrder": 0,
                  "scope": "HARIAN",
                  "obstacle": null,
                  "decisionNeeded": null,
                  "createdAt": "2026-10-06T02:05:00.000Z",
                  "updatedAt": "2026-10-06T05:10:00.000Z",
                  "subtasks": [
                    { "id": "st-1", "taskId": "t-1", "weeklyItemId": null,
                      "title": "Siapkan data", "isDone": true, "position": 0,
                      "createdAt": "2026-10-06T02:05:00.000Z" }
                  ],
                  "picUser": { "id": "pic-1", "name": "Rina Kartika" },
                  "escalation": null,
                  "evidence": []
                }
              ]
            }
            """.trimIndent(),
        )
        assertEquals(false, dto.locked)
        assertNull(dto.frozen)
        assertEquals("rep-77", dto.reportId)
        val tugas = dto.tasks.single()
        assertEquals("Uji modul izin", tugas.title)
        assertEquals("BERJALAN", tugas.status)
        assertEquals(60, tugas.progressPct)
        assertEquals("TINGGI", tugas.urgency)
        assertEquals("HARIAN", tugas.scope)
        assertEquals(180, tugas.durationMin)
        assertEquals("Rina Kartika", tugas.picUser?.name)
        assertEquals(1, tugas.subtasks.size)
        assertTrue(tugas.subtasks[0].isDone)
        assertNull(tugas.subtasks[0].weeklyItemId)
    }

    @Test
    fun simpanTugasRequestDanRespons() {
        val permintaan = urai<TaskSaveRequest>(
            """
            {
              "projectId": "p-1",
              "context": "HARIAN",
              "workDate": "2026-10-06",
              "title": "Uji modul izin",
              "description": "Uji regresi tiket 12-15",
              "tags": ["uji"],
              "status": "BERJALAN",
              "progressPct": 60,
              "urgency": "TINGGI",
              "startTime": "09:00",
              "endTime": "12:00",
              "subtasks": [ { "title": "Siapkan data", "isDone": true } ]
            }
            """.trimIndent(),
        )
        assertEquals("p-1", permintaan.projectId)
        assertEquals("HARIAN", permintaan.context)
        assertEquals("09:00", permintaan.startTime)
        assertEquals(1, permintaan.subtasks.size)
        assertTrue(permintaan.subtasks[0].isDone)

        val respons = urai<TaskSaveResponse>(
            """
            {
              "ok": true,
              "task": {
                "id": "t-2", "projectId": "p-1", "entityId": "e-1",
                "workDate": "2026-10-06T00:00:00.000Z", "title": "Uji modul izin",
                "status": "BERJALAN", "progressPct": 60, "urgency": "TINGGI",
                "sortOrder": 1, "scope": "HARIAN",
                "createdAt": "2026-10-06T02:05:00.000Z",
                "updatedAt": "2026-10-06T02:05:00.000Z",
                "subtasks": [], "evidence": []
              }
            }
            """.trimIndent(),
        )
        assertTrue(respons.ok)
        assertEquals("t-2", respons.task.id)
        assertEquals(1, respons.task.sortOrder)
    }

    // ------------------------------------------------- unlock, undo, notifikasi

    @Test
    fun ajukanBukaKunciRequestDanRespons() {
        val permintaan = urai<UnlockCreateRequest>(
            """
            { "targetType": "DAILY_REPORT", "targetId": "rep-77",
              "reason": "Salah tulis capaian, mohon dibuka untuk diperbaiki." }
            """.trimIndent(),
        )
        assertEquals("DAILY_REPORT", permintaan.targetType)
        assertEquals("rep-77", permintaan.targetId)
        assertTrue(permintaan.reason.length >= 10)

        // Respons 201: baris baru + targetLabel; relasi requestedBy dst. absen.
        val respons = urai<UnlockCreateResponse>(
            """
            {
              "ok": true,
              "item": {
                "id": "ul-9", "targetType": "DAILY_REPORT", "targetId": "rep-77",
                "requestedById": "pic-1",
                "reason": "Salah tulis capaian, mohon dibuka untuk diperbaiki.",
                "status": "DIAJUKAN",
                "createdAt": "2026-10-06T09:40:00.000Z",
                "updatedAt": "2026-10-06T09:40:00.000Z",
                "targetLabel": "PRJ-1 · 6 Okt 2026"
              }
            }
            """.trimIndent(),
        )
        assertTrue(respons.ok)
        assertEquals("DIAJUKAN", respons.item.status)
        assertEquals("pic-1", respons.item.requestedById)
        assertNull(respons.item.approvedBy)
        assertEquals("PRJ-1 · 6 Okt 2026", respons.item.targetLabel)
    }

    @Test
    fun undoRequestDanResponsSukses() {
        val permintaan = urai<UndoRequest>("""{ "token": "cmd4tok123" }""".trimIndent())
        assertEquals("cmd4tok123", permintaan.token)

        // Bentuk sukses applyUndo (src/lib/undo.ts baris 311).
        val respons = urai<UndoResponse>(
            """
            { "ok": true, "action": "FORWARD_DAILY_REPORT", "targetType": "DAILY_REPORT",
              "targetId": "rep-77", "message": "Penerusan laporan harian dibatalkan." }
            """.trimIndent(),
        )
        assertTrue(respons.ok)
        assertEquals("FORWARD_DAILY_REPORT", respons.action)
        assertEquals("Penerusan laporan harian dibatalkan.", respons.message)
    }

    @Test
    fun notifikasiInboxLonceng() {
        // GET /api/notifications?inbox=1 — payload sudah diurai server.
        val dto = urai<NotificationsInboxResponse>(
            """
            {
              "unread": 2,
              "items": [
                { "id": "n-1", "template": "DAILY_REMINDER",
                  "title": "Laporan hari ini belum dikirim", "body": "Tenggat 17.00 WIB.",
                  "tab": "laporan_harian", "createdAt": "2026-10-06T09:00:00.000Z",
                  "readAt": null },
                { "id": "n-2", "template": "WEEKLY_LOCKED",
                  "title": "Minggu lalu sudah dikunci", "body": "",
                  "tab": null, "createdAt": "2026-10-05T09:00:00.000Z",
                  "readAt": "2026-10-05T10:00:00.000Z" }
              ]
            }
            """.trimIndent(),
        )
        assertEquals(2, dto.unread)
        assertEquals(2, dto.items.size)
        assertEquals("laporan_harian", dto.items[0].tab)
        assertNull(dto.items[1].tab)
        assertNull(dto.items[0].readAt)
    }
}
