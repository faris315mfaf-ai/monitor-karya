package id.co.monitorkarya.feature.ringkasangrup.data

import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.mkJson
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Kontrak DTO vs JSON route web sebenarnya. Contoh disusun dari kode route
 * (diverifikasi 13 Okt 2026): ringkasan/route.ts (NextResponse.json di akhir
 * GET, termasuk projects[].escalations T3-A1), daily-reports/route.ts
 * ({items,total,page,pageSize} + include project/entity/submittedBy),
 * management-charts/route.ts (weeklyByGroup baris campuran), kpi-trends,
 * compliance-map (tree rekursif tanpa `type`), late-incidents (entity disisipkan).
 */
class DtoRingkasanGrupTest {

    private lateinit var server: MockWebServer
    private lateinit var api: RingkasanGrupApi

    @Before
    fun siapkan() {
        server = MockWebServer()
        server.start()
        api = buatApi(OkHttpClient(), server.url("/").toString(), RingkasanGrupApi::class.java)
    }

    @After
    fun matikan() = server.shutdown()

    @Test
    fun ringkasan_terdekode_lengkap() {
        val d = mkJson.decodeFromString(RingkasanGrupDto.serializer(), JSON_RINGKASAN)
        assertEquals("RINGKASAN", d.kind)
        assertEquals(41, d.week)
        assertTrue(d.scope.global)
        assertEquals(2, d.projects.size)
        val p = d.projects.first()
        assertEquals("ent-1", p.entityId)
        assertEquals("risk", p.status)
        assertTrue(p.reportedToday)
        assertEquals(1, p.escalations.size)
        assertEquals("KEPUTUSAN", p.escalations.first().needed)
        assertTrue(p.escalations.first().overdue)
        assertNull(d.projects[1].pic)
        assertEquals(3.0, d.progressComparison!!.delta, 0.0)
        assertEquals(92, d.daily.onTime30Pct)
        assertEquals("M41", d.trend.last().label)
        assertNull(d.byEntity[1].onTimePct)
        assertEquals("output", d.divisions.first().onTime!!.basis)
        assertEquals(1, d.deadlineProposals.size)
        assertEquals("Sistem", d.activity.first().who)
    }

    @Test
    fun ringkasan_respons_lama_tanpa_bagian_P2D_tetap_terbaca() {
        val lama = """{"kind":"RINGKASAN","week":40,"scope":{"entities":1,"divisions":0,"global":false},
            "projects":[],"counts":{"on":0,"risk":0,"late":0,"done":0,"neutral":0},
            "daily":{"expected":0,"submitted":0,"onTime30Pct":0,"onTime30":0,"total30":0},
            "weekly":{"expected":0,"submitted":0,"approved":0},"trend":[],"byEntity":[],
            "decisions":[],"escalations":[],"activity":[]}"""
        val d = mkJson.decodeFromString(RingkasanGrupDto.serializer(), lama)
        assertTrue(d.divisions.isEmpty())
        assertNull(d.outputs)
        assertNull(d.progressComparison)
    }

    @Test
    fun laporanProyek_memanggil_daily_reports_dengan_projectId_dan_pageSize() = runBlocking {
        server.enqueue(MockResponse().setBody(JSON_LAPORAN))
        val res = api.laporanProyek("prj-1")
        val req = server.takeRequest()
        assertEquals("/api/daily-reports?projectId=prj-1&pageSize=14", req.path)
        val badan = res.body()!!
        assertEquals(2, badan.items.size)
        assertTrue(badan.items[1].isLate)
        assertEquals("Rani", badan.items.first().submittedBy!!.name)
        assertEquals("TERKENDALA", badan.items[1].status)
    }

    @Test
    fun grafikManajemen_terdekode_termasuk_baris_campuran() {
        val g = mkJson.decodeFromString(GrafikManajemenDto.serializer(), JSON_GRAFIK)
        assertEquals(72.5, g.ringkasan.rataKepatuhan, 0.0)
        assertEquals(4, g.escalationAging.size)
        assertEquals(2, g.escalationAging.last().lewatSla)
        assertEquals("Selesai", g.dailyStatus.first().label)
        assertEquals(1, g.weeklyByGroup.size)
        assertEquals("", g.lowestPt.first().region)
        assertEquals(58.3, g.lowestPt.first().skor, 0.0)
    }

    @Test
    fun trenKpi_petaKepatuhan_insiden_terdekode() {
        val t = mkJson.decodeFromString(TrenKpiDto.serializer(), JSON_KPI)
        assertEquals("Okt 26", t.months.last().label)
        assertEquals(81.25, t.months.last().avgCompliance, 0.0)

        val p = mkJson.decodeFromString(PetaKepatuhanDto.serializer(), JSON_PETA)
        assertEquals(1, p.tree.size)
        assertEquals(2, p.tree.first().children.size)
        assertNull(p.tree.first().type)
        assertEquals(91.0, p.tree.first().children.first().complianceScore!!, 0.0)

        val i = mkJson.decodeFromString(HalamanInsidenDto.serializer(), JSON_INSIDEN)
        assertEquals("HARIAN", i.items.first().cycle)
        assertEquals(3, i.items.first().occurrenceInMonth)
        assertEquals("PT Medcreatix", i.items.first().entity!!.name)
        assertNull(i.items[1].entity)
    }

    @Test
    fun jalur_route_lain_benar() = runBlocking {
        repeat(5) { server.enqueue(MockResponse().setBody("{}")) }
        api.ringkasan()
        assertEquals("/api/ringkasan", server.takeRequest().path)
        api.grafikManajemen()
        assertEquals("/api/management-charts", server.takeRequest().path)
        api.trenKpi()
        assertEquals("/api/kpi-trends", server.takeRequest().path)
        api.petaKepatuhan()
        assertEquals("/api/compliance-map", server.takeRequest().path)
        val r = api.insidenTerlambat()
        assertEquals("/api/late-incidents?pageSize=20", server.takeRequest().path)
        assertFalse(r.body()!!.items.isNotEmpty())
    }

    companion object {
        val JSON_RINGKASAN = """
        {"kind":"RINGKASAN","week":41,"scope":{"entities":3,"divisions":5,"global":true},
         "projects":[
          {"id":"prj-1","code":"BRH-01","name":"SIM RS Bhakti Rahayu","phase":"PELAKSANAAN",
           "entityId":"ent-1","entityName":"PT Medcreatix","entityCode":"MDC","divisionId":"div-1",
           "divisionName":"Teknologi","pic":"Rani Kusuma","startDate":"2026-08-01T00:00:00.000Z",
           "targetEndDate":"2026-11-20T17:00:00.000Z","status":"risk","reason":"Progres di bawah rencana",
           "progress":64,"lastReportAt":"2026-10-12T17:00:00.000Z","lastNote":"Integrasi modul farmasi",
           "reportedToday":true,"outputsDone":3,"outputsTotal":8,
           "lastReview":{"at":"2026-10-10T03:00:00.000Z","by":"Budi"},"reviewedByMeAt":null,
           "escalations":[{"id":"esc-1","summary":"Server uji belum tersedia","needed":"KEPUTUSAN",
             "status":"DIAJUKAN","raisedAt":"2026-10-01T02:00:00.000Z","raisedBy":"Rani Kusuma",
             "ageDays":12,"overdue":true}]},
          {"id":"prj-2","code":"OPS-02","name":"Gudang","phase":"PERSIAPAN","entityId":"ent-2",
           "entityName":"PT Logistik","entityCode":"LOG","divisionId":null,"divisionName":null,
           "pic":null,"startDate":null,"targetEndDate":null,"status":"on","reason":null,"progress":30,
           "lastReportAt":null,"lastNote":null,"reportedToday":false,"outputsDone":0,"outputsTotal":0,
           "lastReview":null,"reviewedByMeAt":null,"escalations":[]}
         ],
         "counts":{"on":1,"risk":1,"late":0,"done":0,"neutral":0},
         "progressComparison":{"current":47,"previous":44,"delta":3,"projects":2,"asOf":"2026-10-11T17:00:00.000Z"},
         "daily":{"expected":2,"submitted":1,"onTime30Pct":92,"onTime30":46,"total30":50},
         "weekly":{"expected":5,"submitted":3,"approved":2},
         "trend":[{"label":"M40","submitted":9,"onTimePct":88},{"label":"M41","submitted":12,"onTimePct":92}],
         "byEntity":[{"id":"ent-1","name":"PT Medcreatix","code":"MDC","onTimePct":95,"onTime":19,"total":20,"projects":1,"reportedToday":1},
                     {"id":"ent-2","name":"PT Logistik","code":"LOG","onTimePct":null,"onTime":0,"total":0,"projects":1,"reportedToday":0}],
         "reportWeek":{"isoYear":2026,"isoWeek":41,"label":"M41","handoverBy":"2026-10-08T10:00:00.000Z","current":true},
         "divisions":[{"id":"div-1","name":"Teknologi","typeName":"Teknologi","entityId":"ent-1",
           "entityName":"PT Medcreatix","entityCode":"MDC","head":{"id":"u1","name":"Budi"},"projects":1,
           "weekly":{"id":null,"state":"missing","statusHeader":null,"submittedAt":null,"submittedBy":null,
             "readAt":null,"itemsTotal":0,"itemsDone":0,"summary":null,"points":[],"obstacles":[]},
           "outputs":{"total":8,"done":3,"active":5,"review":1,"onTime":3,"withDue":4,"trend":[1,2]},
           "onTime":{"pct":75,"ok":3,"total":4,"basis":"output"}}],
         "outputs":{"total":8,"done":3,"active":5,"review":1,"onTime":3,"withDue":4,
           "trend":{"week":[{"label":"M41","value":1}],"month":[],"quarter":[]}},
         "deadlineProposals":[{"id":"dp-1","projectId":"prj-1","projectName":"SIM RS","entityName":"PT Medcreatix",
           "divisionId":"div-1","proposer":"Rani","proposedAt":"2026-10-09T01:00:00.000Z",
           "previousDate":null,"proposedDate":"2026-12-01T00:00:00.000Z","reason":"Vendor"}],
         "attendance":null,
         "viewer":{"canRemind":true,"canMarkRead":true,"canDecideDeadline":false},
         "approvalRequests":[],"decisions":[],
         "escalations":[{"id":"esc-1","divisionId":"div-1","summary":"Server uji","needed":"KEPUTUSAN",
           "status":"DIAJUKAN","raisedAt":"2026-10-01T02:00:00.000Z","raisedBy":"Rani",
           "entityName":"PT Medcreatix","entityCode":"MDC","ageDays":12,"overdue":true}],
         "activity":[{"id":"a1","who":"Sistem","role":null,"text":"mengirim pengingat otomatis","at":"2026-10-13T02:00:00.000Z"}]}
        """.trimIndent()

        val JSON_LAPORAN = """
        {"items":[
          {"id":"r1","entityId":"ent-1","projectId":"prj-1","reportDate":"2026-10-12T17:00:00.000Z",
           "status":"ON_PROGRESS","progressPct":64,"achievementToday":"Integrasi modul\nfarmasi",
           "obstacle":null,"followUp":null,"needsEscalation":false,"isLate":false,
           "submittedAt":"2026-10-13T07:20:00.000Z","forwardedAt":null,
           "project":{"id":"prj-1","name":"SIM RS","code":"BRH-01"},
           "entity":{"id":"ent-1","name":"PT Medcreatix","code":"MDC","region":null},
           "submittedBy":{"id":"u2","name":"Rani","email":"rani@contoh.id"}},
          {"id":"r2","reportDate":"2026-10-11T17:00:00.000Z","status":"TERKENDALA","progressPct":60,
           "achievementToday":"","isLate":true,"submittedAt":null,"submittedBy":null}
         ],"total":2,"page":1,"pageSize":14}
        """.trimIndent()

        val JSON_GRAFIK = """
        {"periode":{"bulanIni":"2026-10","isoWeek":42,"isoYear":2026},
         "ringkasan":{"entitas":12,"rataKepatuhan":72.5,"diBawahTarget":4,"eskalasiTerbuka":7,"eskalasiLewatSla":2},
         "trend":[{"label":"Okt 26","kepatuhan":72.5,"tepatWaktu":80,"mingguan":70,"bukti":66}],
         "bySubHolding":[{"name":"PT Medcreatix","skor":91.2,"jumlahPt":1}],
         "dailyStatus":[{"status":"SELESAI","label":"Selesai","jumlah":3},{"status":"ON_PROGRESS","label":"Berjalan","jumlah":5}],
         "escalationAging":[{"bucket":"0–3 hari","dalamSla":2,"lewatSla":0},{"bucket":"4–7 hari","dalamSla":1,"lewatSla":0},
           {"bucket":"8–14 hari","dalamSla":1,"lewatSla":0},{"bucket":"> 14 hari","dalamSla":1,"lewatSla":2}],
         "weeklyByGroup":[{"name":"PT Medcreatix","Draft":1,"Menunggu persetujuan":0,"Disetujui":2,"Terkunci":0}],
         "lowestPt":[{"name":"PT Logistik","code":"LOG","region":"","skor":58.3}]}
        """.trimIndent()

        val JSON_KPI = """
        {"months":[{"periodKey":"2026-09","label":"Sep 26","avgCompliance":79,"avgOnTime":82.5,
          "avgWeeklyCompleteness":70,"avgEvidenceCompleteness":65,"avgHighPriorityCompletion":50,"totalEntities":12},
         {"periodKey":"2026-10","label":"Okt 26","avgCompliance":81.25,"avgOnTime":84,
          "avgWeeklyCompleteness":72,"avgEvidenceCompleteness":68,"avgHighPriorityCompletion":55,"totalEntities":12}]}
        """.trimIndent()

        val JSON_PETA = """
        {"tree":[{"id":"sh-1","name":"Sub-holding Kesehatan","code":"SHK","region":null,"complianceScore":0,
           "entityCount":2,"avgComplianceScore":78.5,"children":[
            {"id":"pt-1","name":"PT Medcreatix","code":"MDC","region":"Jakarta","complianceScore":91,
             "entityCount":1,"avgComplianceScore":91,"children":[]},
            {"id":"pt-2","name":"PT Farmasi","code":"FRM","region":null,"complianceScore":66,
             "entityCount":1,"avgComplianceScore":66,"children":[]}]}],
         "subHoldings":[],"periodKey":"2026-10","topLevelType":"SUB_HOLDING"}
        """.trimIndent()

        val JSON_INSIDEN = """
        {"items":[{"id":"li-1","entityId":"ent-2","cycle":"HARIAN","period":"2026-10-12","occurrenceInMonth":3,
           "actionTaken":"Teguran tertulis","createdAt":"2026-10-12T10:00:00.000Z",
           "entity":{"id":"ent-2","name":"PT Medcreatix","code":"MDC","region":"Jakarta"}},
          {"id":"li-2","entityId":"ent-x","cycle":"MINGGUAN","period":"2026-10-W41","occurrenceInMonth":1,
           "actionTaken":null,"createdAt":"2026-10-10T10:00:00.000Z","entity":null}],
         "total":2,"page":1,"pageSize":20}
        """.trimIndent()
    }
}
