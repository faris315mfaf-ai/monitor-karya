package id.co.monitorkarya.feature.entitas.data

import id.co.monitorkarya.core.network.mkJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Dekode DTO tab Entitas terhadap JSON berbentuk jawaban rute sebenarnya:
 * src/app/api/entities/route.ts, src/app/api/entities/[id]/route.ts, dan
 * src/app/api/entity-activity/route.ts. Dekoder = mkJson (ignoreUnknownKeys).
 */
class EntitasDtoTest {

    private inline fun <reified T> urai(json: String): T = mkJson.decodeFromString(json)

    @Test
    fun pohonEntitas_ptBerkpiNullDanNonPtTanpaKunciKpi() {
        val dto = urai<PohonEntitasResponse>(
            """
            {
              "tree": [
                {
                  "id": "h1", "name": "Holding Karya", "code": "HOLDING-KARYA", "type": "HOLDING", "region": null,
                  "children": [
                    {
                      "id": "sh1", "name": "Sub Konstruksi", "code": "SH-KON", "type": "SUB_HOLDING", "region": null,
                      "children": [
                        { "id": "pt1", "name": "PT Medcreatix", "code": "PT-MED", "type": "PT", "region": "Jakarta",
                          "kpi": { "complianceScore": 92.5, "onTimeDailyPct": 88, "weeklyCompletenessPct": 100,
                                   "lateToday": 1, "pendingReports": 3 },
                          "children": [] },
                        { "id": "pt2", "name": "PT Baru", "code": "PT-BARU", "type": "PT", "region": null,
                          "kpi": null, "children": [] }
                      ]
                    }
                  ]
                }
              ],
              "periodKey": "2026-10"
            }
            """.trimIndent(),
        )
        assertEquals("2026-10", dto.periodKey)
        val holding = dto.tree.single()
        assertNull(holding.kpi)
        val pts = holding.children.single().children
        assertEquals(92.5, pts[0].kpi!!.complianceScore, 0.0)
        assertEquals(88.0, pts[0].kpi!!.onTimeDailyPct, 0.0)
        assertEquals(3, pts[0].kpi!!.pendingReports)
        assertNull(pts[1].kpi)
        assertNull(pts[1].region)
    }

    @Test
    fun rincianPt_lengkap() {
        val dto = urai<DetailEntitasResponse>(
            """
            {
              "entity": { "id": "pt1", "name": "PT Medcreatix", "code": "PT-MED", "type": "PT", "path": "/karya/PT-MED/",
                          "region": "Jakarta", "parentId": "h1", "isActive": true,
                          "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-10-01T00:00:00.000Z" },
              "parentChain": [ { "id": "h1", "name": "Holding Karya", "code": "HOLDING-KARYA", "type": "HOLDING", "region": null } ],
              "children": [],
              "divisions": [
                { "id": "d1", "entityId": "pt1", "divisionTypeId": "t1", "name": "Keuangan", "headUserId": null, "isActive": true,
                  "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z",
                  "divisionType": { "id": "t1", "code": "KEU", "name": "Keuangan" } }
              ],
              "projects": [
                { "id": "p1", "name": "Gedung A", "code": "PT-MED-PRJ-01", "phase": "PELAKSANAAN", "lifecycle": "AKTIF",
                  "picName": "Citra", "startDate": "2026-02-01T00:00:00.000Z", "targetEndDate": null }
              ],
              "adminAppointments": [
                { "id": "a1", "entityId": "pt1", "userName": "Rani", "userEmail": "rani@x.id", "kind": "UTAMA",
                  "skNumber": "SK-01", "validFrom": "2026-01-01T00:00:00.000Z", "validUntil": "2026-12-31T00:00:00.000Z",
                  "status": "AKTIF", "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z" }
              ],
              "currentKpi": { "id": "k1", "entityId": "pt1", "periodType": "BULANAN", "periodKey": "2026-10",
                              "onTimeDailyPct": 80, "weeklyCompletenessPct": 75, "evidenceCompletenessPct": 60,
                              "highPriorityCompletionPct": 50, "avgEscalationDays": 2.5, "totalProjects": 4,
                              "activeProjects": 3, "reportsToday": 2, "lateToday": 1, "pendingReports": 2,
                              "complianceScore": 71.25 },
              "recentDailyReports": [
                { "id": "r1", "projectId": "p1", "entityId": "pt1", "reportDate": "2026-10-09T17:00:00.000Z",
                  "status": "ON_PROGRESS", "progressPct": 45, "phase": "PELAKSANAAN", "achievementToday": "Cor lantai 2",
                  "obstacle": null, "isLocked": false, "isLate": true,
                  "project": { "id": "p1", "name": "Gedung A", "code": "PT-MED-PRJ-01" } }
              ],
              "recentWeeklyReports": [
                { "id": "w1", "divisionId": "d1", "entityId": "pt1", "isoYear": 2026, "isoWeek": 41,
                  "statusHeader": "MENUNGGU_PERSETUJUAN", "isLocked": false,
                  "division": { "id": "d1", "name": "Keuangan" },
                  "approvedBy": null }
              ]
            }
            """.trimIndent(),
        )
        assertEquals("PT", dto.entity.type)
        assertEquals("Holding Karya", dto.parentChain.single().name)
        assertEquals("Keuangan", dto.divisions!!.single().divisionType!!.name)
        assertEquals("Citra", dto.projects!!.single().picName)
        assertEquals("AKTIF", dto.adminAppointments!!.single().status)
        assertEquals(71.25, dto.currentKpi!!.complianceScore, 0.0)
        assertEquals(3, dto.currentKpi.activeProjects)
        val r = dto.recentDailyReports!!.single()
        assertTrue(r.isLate)
        assertEquals(45, r.progressPct)
        assertEquals("Gedung A", r.project.name)
        assertEquals(41, dto.recentWeeklyReports!!.single().isoWeek)
    }

    @Test
    fun rincianNonPt_tanpaKolomPt() {
        val dto = urai<DetailEntitasResponse>(
            """
            {
              "entity": { "id": "sh1", "name": "Sub Konstruksi", "code": "SH-KON", "type": "SUB_HOLDING",
                          "path": "/karya/SH-KON/", "region": null, "parentId": "h1", "isActive": false },
              "parentChain": [],
              "children": [ { "id": "pt1", "name": "PT Medcreatix", "code": "PT-MED", "type": "PT", "region": "Jakarta", "isActive": true } ]
            }
            """.trimIndent(),
        )
        assertFalse(dto.entity.isActive)
        assertNull(dto.divisions)
        assertNull(dto.currentKpi)
        assertEquals("PT", dto.children.single().type)
    }

    @Test
    fun aktivitasEntitas_harian() {
        val dto = urai<AktivitasEntitasResponse>(
            """
            {
              "cadence": "HARIAN", "priority": "ALL", "date": "2026-10-10",
              "period": { "key": "2026-10-10", "start": "2026-10-09T17:00:00.000Z", "end": "2026-10-09T17:00:00.000Z",
                          "isoWeek": 41, "isoYear": 2026 },
              "prev": "2026-10-09", "next": "2026-10-11", "today": "2026-10-10",
              "entities": [
                {
                  "id": "pt1", "code": "PT-MED", "name": "PT Medcreatix", "region": "Jakarta",
                  "stats": { "projects": 1, "divisions": 1, "tasks": 2, "tasksDone": 1, "tasksBlocked": 1,
                             "dailyReports": 1, "dailyLate": 0, "weeklyItems": 1, "weeklyItemsBlocked": 0, "weeklyReports": 1 },
                  "projects": [
                    {
                      "id": "p1", "code": "PT-MED-PRJ-01", "name": "Gedung A", "phase": "PELAKSANAAN", "picName": "Citra",
                      "tasks": [
                        { "id": "t1", "title": "Pasang bekisting", "workDate": "2026-10-09T17:00:00.000Z", "scope": "HARIAN",
                          "status": "TERKENDALA", "progressPct": 30, "urgency": "KRITIS", "picName": null,
                          "note": "Hujan", "subtaskDone": 1, "subtaskTotal": 3 }
                      ],
                      "taskStats": { "total": 2, "done": 1, "blocked": 1 },
                      "dailyReports": [
                        { "id": "r1", "date": "2026-10-09T17:00:00.000Z", "status": "ON_PROGRESS", "progressPct": 45,
                          "achievement": "Cor lantai 2", "obstacle": null, "followUp": null, "submitted": true,
                          "late": false, "evidenceCount": 2 }
                      ],
                      "dailyStats": { "submitted": 1, "late": 0, "blocked": 0 },
                      "progressReport": null
                    }
                  ],
                  "divisions": [
                    {
                      "id": "d1", "name": "Keuangan", "headName": "Budi",
                      "reports": [ { "id": "w1", "isoWeek": 41, "statusHeader": "DRAFT", "submitted": false, "approved": false, "itemCount": 1 } ],
                      "items": [
                        { "id": "i1", "workItem": "Rekonsiliasi", "workDate": null, "status": "ON_PROGRESS", "progressPct": 50,
                          "achievement": "Separuh", "obstacle": null, "followUp": null, "priority": "TINGGI",
                          "aspect": "Keuangan", "picName": "Budi", "evidenceCount": 0 }
                      ],
                      "itemStats": { "total": 1, "done": 0, "blocked": 0 }
                    }
                  ]
                }
              ]
            }
            """.trimIndent(),
        )
        assertEquals("2026-10-09", dto.prev)
        val pt = dto.entities.single()
        assertEquals(1, pt.stats.tasksBlocked)
        val tugas = pt.projects.single().tasks.single()
        assertEquals("KRITIS", tugas.urgency)
        assertNull(tugas.picName)
        assertNull(pt.projects.single().progressReport)
        assertEquals("TINGGI", pt.divisions.single().items.single().priority)
        assertNotNull(pt.divisions.single().reports.single())
    }
}
