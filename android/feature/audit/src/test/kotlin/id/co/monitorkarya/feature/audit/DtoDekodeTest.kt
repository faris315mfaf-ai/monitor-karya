package id.co.monitorkarya.feature.audit

import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.audit.data.AuditLogListDto
import id.co.monitorkarya.feature.audit.data.KesiapanDto
import id.co.monitorkarya.feature.audit.data.PengajuanAksesListDto
import id.co.monitorkarya.feature.audit.data.PeranListDto
import id.co.monitorkarya.feature.audit.data.PutusanAksesResponse
import id.co.monitorkarya.feature.audit.data.SistemDto
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dekode DTO terhadap bentuk JSON rute server sebenarnya (lihat komentar tiap kasus). */
class DtoDekodeTest {

    /** src/app/api/audit-logs/route.ts: items[] + total/page/pageSize/canExport; parseJson memberi objek atau string mentah. */
    @Test
    fun `audit-logs - objek, string mentah, aktor null`() {
        val json = """
            {"items":[
              {"id":"a1","actorId":"u1","actor":{"id":"u1","name":"Rina","email":"rina@karya.co.id","role":"TI"},
               "action":"UPDATE_ACCOUNT","targetType":"USER","targetId":"u9",
               "beforeData":{"role":"PIC_PROYEK","isActive":true},"afterData":{"role":"KEPALA_DIVISI","isActive":true},
               "ip":"10.0.0.1","userAgent":"Mozilla/5.0","at":"2026-10-13T07:05:00.000Z"},
              {"id":"a2","actorId":null,"actor":null,"action":"KPI_SNAPSHOT","targetType":"KPI_SNAPSHOT","targetId":"2026-10-13",
               "beforeData":null,"afterData":"<b>bukan json</b>","ip":null,"userAgent":null,"at":"2026-10-13T00:00:00.000Z"}
            ],"total":42,"page":1,"pageSize":20,"canExport":true}
        """.trimIndent()
        val d = mkJson.decodeFromString(AuditLogListDto.serializer(), json)
        assertEquals(2, d.items.size)
        assertEquals(42, d.total)
        assertTrue(d.canExport)
        val a = d.items[0]
        assertEquals("Rina", a.actor?.name)
        assertTrue(a.beforeData is JsonObject)
        val b = d.items[1]
        assertNull(b.actor)
        assertNull(b.beforeData)
        assertEquals(JsonPrimitive("<b>bukan json</b>"), b.afterData)
    }

    /** Respons lama tanpa canExport tetap terbaca (bawaan false). */
    @Test
    fun `audit-logs - tanpa canExport`() {
        val d = mkJson.decodeFromString(AuditLogListDto.serializer(), """{"items":[],"total":0,"page":1,"pageSize":20}""")
        assertFalse(d.canExport)
        assertTrue(d.items.isEmpty())
    }

    /** src/app/api/system/route.ts consoleData() + lockingSummary() dengan perEntity (T13). */
    @Test
    fun `system - lengkap dengan perEntity dan technical`() {
        val json = """
        {"technical":{"unlocks":{"waitingApproval":2,"waitingExecution":1,"activeNow":3},"accessPending":4,
          "cron":[{"job":"reminder-rules","label":"Pengingat otomatis","schedule":"Tiap 30 menit","lastAt":"2026-10-13T02:00:00.000Z","health":"on"},
                  {"job":"kpi-snapshot","label":"KPI harian","schedule":"00.10 WIB","lastAt":null,"health":"neutral"}],
          "reminders":{"enabled":7,"total":8,"lastRunAt":null},
          "accounts":{"active":90,"inactive":7,"neverLoggedIn":5,"noPassword":0,"mustChange":null},
          "notifications":{"failed7d":0}},
         "reminders":[{"entityId":"e1","entityName":"PT Karya","entityCode":"KRY","rules":[
            {"kind":"HARIAN","enabled":true,"time":"16:30","weekday":null,"days":null,"lastRunAt":null},
            {"kind":"ESKALASI_KADIV","enabled":false,"time":"09:00","weekday":null,"days":2,"lastRunAt":null}]}],
         "access":{"byRole":[{"role":"PIC_PROYEK","count":60,"capabilities":9}],"inactiveUsers":7,"noPassword":0,
           "users":[{"id":"u1","name":"Rina","email":"r@k.id","role":"TI","lastLoginAt":null,"hasPassword":true,"scopeEntityId":null}]},
         "locking":{"dailyCutoff":"beragam per PT","dailyLockAt":"2026-10-13T10:00:00.000Z","dailyLocked":false,
           "dailyCountdown":{"hours":2,"minutes":15,"totalMs":8100000,"passed":false},
           "weeklyHandoverBy":"2026-10-16T10:00:00.000Z","weeklyLockAt":"2026-10-17T10:00:00.000Z",
           "perEntity":[{"entityId":"e1","name":"PT Karya","code":"KRY","dailyCutoff":"24.00 WIB","dailyOpen":true,
              "dailyLockAt":"2026-10-13T17:00:00.000Z","dailyLocked":false,"workingDays":[],"weeklyOpen":true,
              "weeklyHandoverBy":"2026-10-16T10:00:00.000Z","weeklyLockAt":"2026-10-17T10:00:00.000Z"},
             {"entityId":"e2","name":"PT Dua","code":"DUA","dailyCutoff":"ditutup","dailyOpen":false,
              "dailyLockAt":"2026-10-13T10:00:00.000Z","dailyLocked":true,"workingDays":[1,2,3,4,5],"weeklyOpen":false,
              "weeklyHandoverBy":"2026-10-16T10:00:00.000Z","weeklyLockAt":"2026-10-17T10:00:00.000Z"}],
           "lockedToday":5,"pendingUnlocks":3},
         "notifications":{"sent":100,"failed":2},
         "data":{"entities":3,"projects":40,"divisions":9,"dailyReports":741,"weeklyReports":50,"evidence":120,"auditLogs":9000},
         "recentAudit":[{"id":"r1","action":"LOGIN","at":"2026-10-13T01:00:00.000Z","actorName":"Rina","actorRole":"TI","targetType":"USER"}]}
        """.trimIndent()
        val d = mkJson.decodeFromString(SistemDto.serializer(), json)
        assertEquals(2, d.technical?.unlocks?.waitingApproval)
        assertNull(d.technical?.accounts?.mustChange)
        assertEquals(2, d.technical?.cron?.size)
        assertEquals(2, d.locking.perEntity.size)
        val dua = d.locking.perEntity[1]
        assertFalse(dua.dailyOpen)
        assertTrue(dua.dailyLocked)
        assertEquals(listOf(1, 2, 3, 4, 5), dua.workingDays)
        assertEquals("beragam per PT", d.locking.dailyCutoff)
        assertEquals(2.0, d.reminders?.first()?.rules?.get(1)?.days)
        assertEquals(9000, d.data.auditLogs)
        assertEquals("Rina", d.recentAudit.first().actorName)
    }

    /** Respons lama (sebelum F2-GRUP/T13): tanpa technical, reminders, perEntity. */
    @Test
    fun `system - respons lama tetap terbaca`() {
        val json = """
        {"access":{"byRole":[],"inactiveUsers":0,"noPassword":1,"users":[]},
         "locking":{"dailyCutoff":"17.00 WIB","dailyLocked":true,"dailyCountdown":{"hours":0,"minutes":0,"passed":true},
           "lockedToday":0,"weeklyHandoverBy":"2026-10-16T10:00:00.000Z","weeklyLockAt":"2026-10-17T10:00:00.000Z","pendingUnlocks":0},
         "notifications":{"sent":0,"failed":0},
         "data":{"entities":0,"projects":0,"divisions":0,"dailyReports":0,"weeklyReports":0,"evidence":0,"auditLogs":0},
         "recentAudit":[]}
        """.trimIndent()
        val d = mkJson.decodeFromString(SistemDto.serializer(), json)
        assertNull(d.technical)
        assertNull(d.reminders)
        assertTrue(d.locking.perEntity.isEmpty())
        assertTrue(d.locking.dailyCountdown.passed)
    }

    /** src/app/api/access-requests/route.ts GET: {items, pending, canDecide}; item = AccessRequestItem + canActivate. */
    @Test
    fun `access-requests - daftar`() {
        val json = """
        {"items":[{"id":"q1","type":"PINDAH_PERAN","status":"DIAJUKAN","title":"Pindah peran Galih","detail":"Operasional · peran Kepala divisi",
          "reason":null,"entityId":"e1","entityName":"PT Karya","requester":{"id":"u2","name":"Admin"},"target":{"id":"u3","name":"Galih"},
          "decidedBy":null,"decidedAt":null,"decisionNote":null,"expiresAt":null,"revertedAt":null,"createdAt":"2026-10-13T03:00:00.000Z",
          "canActivate":false,"canDecide":true}],"pending":1,"canDecide":true}
        """.trimIndent()
        val d = mkJson.decodeFromString(PengajuanAksesListDto.serializer(), json)
        assertEquals(1, d.pending)
        assertTrue(d.items.first().canDecide)
        assertEquals("Galih", d.items.first().target?.name)
    }

    /** PATCH: {ok, item, activation} — activation (token) diabaikan dekoder. */
    @Test
    fun `access-requests - patch mengabaikan activation`() {
        val json = """
        {"ok":true,"item":{"id":"q1","type":"AKUN_BARU","status":"DISETUJUI","title":"Akun baru Galih","detail":"","createdAt":"2026-10-13T03:00:00.000Z","canDecide":false},
         "activation":{"userId":"u3","username":"galih","path":"/login/aktivasi#token=abc","expiresAt":"2026-10-14T03:00:00.000Z"}}
        """.trimIndent()
        val d = mkJson.decodeFromString(PutusanAksesResponse.serializer(), json)
        assertTrue(d.ok)
        assertEquals("DISETUJUI", d.item?.status)
    }

    /** src/app/api/roles/route.ts dan health/ready. */
    @Test
    fun `roles dan health`() {
        val r = mkJson.decodeFromString(
            PeranListDto.serializer(),
            """{"roles":[{"role":"TI","label":"Tim TI","users":[{"id":"u1","name":"Rina","email":"r@k.id","role":"TI","scopeEntityId":null,"avatarColor":"#fff","lastLoginAt":null}]}]}""",
        )
        assertEquals("Rina", r.roles.first().users.first().name)
        val h = mkJson.decodeFromString(KesiapanDto.serializer(), """{"ok":true,"status":"degraded"}""")
        assertTrue(h.ok)
        assertEquals("degraded", h.status)
    }

    /** C1-R5: `days` dari params JSON bebas bisa pecahan — tidak boleh memecah /api/system. */
    @Test
    fun `system - days pecahan tetap terdekode`() {
        val json = """
        {"reminders":[{"entityId":"e1","entityName":"PT Karya","entityCode":"KRY","rules":[
            {"kind":"ESKALASI_KADIV","enabled":true,"time":"09:00","weekday":null,"days":1.5,"lastRunAt":null}]}]}
        """.trimIndent()
        val d = mkJson.decodeFromString(SistemDto.serializer(), json)
        assertEquals(1.5, d.reminders?.first()?.rules?.first()?.days)
    }
}
