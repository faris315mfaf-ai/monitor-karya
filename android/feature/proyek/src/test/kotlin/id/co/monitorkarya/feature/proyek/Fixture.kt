package id.co.monitorkarya.feature.proyek

/**
 * Contoh JSON disalin dari bentuk respons rute server (baca 13 Okt 2026):
 * `format()` src/app/api/projects/route.ts (Date → ISO string lewat
 * NextResponse.json), opsi formulir, project-stages, deadline-proposals,
 * daily-reports (item Prisma + include project/entity/submittedBy), outputs
 * (`shape()`), escalations (item Prisma + ageDays/isOverdue), undo.
 */
object Fixture {

    fun proyek(
        id: String = "p1",
        lifecycle: String = "AKTIF",
        approve: Boolean = false,
        manage: Boolean = false,
        setLifecycle: Boolean = false,
        resubmit: Boolean = false,
        pendingRole: String? = null,
        targetEndDate: String? = "2026-12-31T00:00:00.000Z",
        latestReport: String? = """{"status":"ON_PROGRESS","progressPct":40,"reportDate":"2026-10-12T17:00:00.000Z","isLate":false,"obstacle":null,"needsEscalation":false}""",
        approvals: String = "[]",
        chain: String = "[]",
    ): String = """
        {
          "id": "$id",
          "name": "Gudang Distribusi Timur $id",
          "code": "PT-SIGMA-PRJ-0${id.last()}",
          "phase": "PELAKSANAAN",
          "lifecycle": "$lifecycle",
          "picName": "Rani Kusuma",
          "picUserId": "u-pic",
          "divisionId": "d1",
          "division": { "id": "d1", "name": "Operasional" },
          "description": "Pembangunan gudang distribusi wilayah timur tahap satu.",
          "purpose": null,
          "proposedBy": { "id": "u-admin", "name": "Budi Admin", "role": "ADMIN_PT" },
          "proposedAt": "2026-09-01T03:00:00.000Z",
          "approvalChain": $chain,
          "pendingRole": ${pendingRole?.let { "\"$it\"" } ?: "null"},
          "approvals": $approvals,
          "relatedEntities": [ { "id": "e2", "name": "PT Delta", "code": "PT-DELTA" } ],
          "startDate": "2026-09-01T00:00:00.000Z",
          "targetEndDate": ${targetEndDate?.let { "\"$it\"" } ?: "null"},
          "approvedByName": "Budi Admin",
          "approvedAt": "2026-09-02T03:00:00.000Z",
          "noApproval": false,
          "createdAt": "2026-09-01T03:00:00.000Z",
          "updatedAt": "2026-10-12T03:00:00.000Z",
          "entity": { "id": "e1", "name": "PT Sigma", "code": "PT-SIGMA", "region": "Jakarta" },
          "latestReport": ${latestReport ?: "null"},
          "permissions": { "manage": $manage, "setLifecycle": $setLifecycle, "approve": $approve, "resubmit": $resubmit }
        }
    """.trimIndent()

    fun daftar(vararg proyek: String, total: Int = proyek.size, page: Int = 1): String = """
        {
          "items": [${proyek.joinToString(",")}],
          "total": $total, "page": $page, "pageSize": 20,
          "summary": { "running": 3, "waiting": 1, "resubmit": 0, "late": 1, "risk": 0, "silent": 1 }
        }
    """.trimIndent()

    val opsi = """
        {
          "entity": { "id": "e1", "code": "PT-SIGMA", "name": "PT Sigma" },
          "entityPinned": true,
          "entities": [
            { "id": "e1", "code": "PT-SIGMA", "name": "PT Sigma" },
            { "id": "e2", "code": "PT-DELTA", "name": "PT Delta" }
          ],
          "candidates": [ { "id": "u-pic", "name": "Rani Kusuma", "email": "rani@x.id", "activeProjects": 2 } ],
          "divisions": [ { "id": "d1", "name": "Operasional" } ],
          "chain": ["ADMIN_PT", "DIREKTUR_ENTITAS"],
          "picIsSelf": true
        }
    """.trimIndent()

    val tahapan = """
        {
          "projectId": "p1",
          "targetEndDate": "2026-12-31T00:00:00.000Z",
          "proposedEndDate": null,
          "canEdit": true,
          "done": 1,
          "total": 2,
          "items": [
            { "id": "s1", "name": "Perencanaan", "position": 0, "startDate": "2026-08-31T17:00:00.000Z", "dueDate": "2026-09-14T17:00:00.000Z", "status": "SELESAI", "note": null, "updatedAt": "2026-09-15T03:00:00.000Z" },
            { "id": "s2", "name": "Konstruksi", "position": 1, "startDate": null, "dueDate": null, "status": "TERTAHAN", "note": "Material terlambat", "updatedAt": "2026-10-01T03:00:00.000Z" }
          ]
        }
    """.trimIndent()

    val usulan = """
        {
          "items": [
            {
              "id": "dp1", "projectId": "p1",
              "previousDate": "2026-12-31T00:00:00.000Z", "proposedDate": "2027-01-15T17:00:00.000Z",
              "reason": "Material baja terlambat dua minggu dari vendor", "status": "DIAJUKAN",
              "proposedById": "u-pic", "decidedAt": null, "decisionNote": null, "createdAt": "2026-10-10T03:00:00.000Z",
              "projectName": "Gudang", "projectCode": "PT-SIGMA-PRJ-01", "currentTargetDate": "2026-12-31T00:00:00.000Z",
              "proposedByName": "Rani Kusuma", "decidedByName": null
            }
          ],
          "canDecide": false
        }
    """.trimIndent()

    val laporan = """
        {
          "items": [
            {
              "id": "r1", "projectId": "p1", "entityId": "e1", "reportDate": "2026-10-12T17:00:00.000Z",
              "status": "TERKENDALA", "progressPct": 40, "phase": "PELAKSANAAN",
              "achievementToday": "Pondasi blok A selesai", "obstacle": "Hujan deras", "followUp": null,
              "followUpTargetDate": null, "decisionRequestedFrom": null, "needsEscalation": true,
              "evidenceCount": 2, "isLocked": false, "lockedAt": null, "isLate": false,
              "submittedById": "u-pic", "submittedAt": "2026-10-13T09:00:00.000Z",
              "forwardedById": null, "forwardedAt": null,
              "createdAt": "2026-10-13T08:00:00.000Z", "updatedAt": "2026-10-13T09:00:00.000Z",
              "project": { "id": "p1", "name": "Gudang", "code": "PT-SIGMA-PRJ-01" },
              "entity": { "id": "e1", "name": "PT Sigma", "code": "PT-SIGMA", "region": "Jakarta" },
              "submittedBy": { "id": "u-pic", "name": "Rani Kusuma", "email": "rani@x.id" }
            },
            {
              "id": "r2", "projectId": "p1", "entityId": "e1", "reportDate": "2026-10-11T17:00:00.000Z",
              "status": "ON_PROGRESS", "progressPct": 35, "phase": "PELAKSANAAN",
              "achievementToday": "Galian", "obstacle": null, "needsEscalation": false,
              "evidenceCount": 0, "isLocked": true, "isLate": true,
              "submittedAt": null, "forwardedAt": null, "submittedBy": null
            }
          ],
          "total": 2, "page": 1, "pageSize": 30
        }
    """.trimIndent()

    val output = """
        {
          "items": [
            {
              "id": "o1", "projectId": "p1", "title": "Gambar kerja revisi B", "description": null,
              "status": "PERLU_REVISI", "dueDate": "2026-10-20T17:00:00.000Z", "ownerId": "u-pic",
              "reviewerId": "u-kadiv", "revisionNote": "Lengkapi detail sambungan", "submittedAt": null,
              "reviewedAt": "2026-10-09T03:00:00.000Z", "createdAt": "2026-10-01T03:00:00.000Z",
              "updatedAt": "2026-10-09T03:00:00.000Z",
              "projectName": "Gudang", "projectCode": "PT-SIGMA-PRJ-01", "ownerName": "Rani Kusuma",
              "reviewerName": "Kadiv Ops", "evidenceCount": 1
            }
          ],
          "counts": { "DIKERJAKAN": 0, "MENUNGGU_REVIEW": 0, "PERLU_REVISI": 1, "DITERIMA": 0 },
          "total": 1
        }
    """.trimIndent()

    /**
     * GET /api/escalations?projectId=p1 — sudah disaring server (B3): x1 dari laporan r1,
     * x2 dari laporan lama di luar 10 riwayat terbaru, x3 dari task proyek.
     */
    val eskalasi = """
        {
          "items": [
            {
              "id": "x1", "sourceType": "DAILY_REPORT", "sourceId": "r1", "entityId": "e1",
              "raisedById": "u-pic", "raisedAt": "2026-10-13T09:00:00.000Z", "summary": "Butuh keputusan tambahan anggaran pondasi",
              "needed": "ANGGARAN", "status": "DIAJUKAN", "decidedById": null, "decidedAt": null, "decisionText": null,
              "slaDays": 7, "createdAt": "2026-10-13T09:00:00.000Z", "updatedAt": "2026-10-13T09:00:00.000Z",
              "entity": { "id": "e1", "name": "PT Sigma", "code": "PT-SIGMA", "region": null },
              "raisedBy": { "id": "u-pic", "name": "Rani Kusuma", "email": "rani@x.id" },
              "decidedBy": null, "ageDays": 0, "isOverdue": false
            },
            { "id": "x2", "sourceType": "DAILY_REPORT", "sourceId": "r-lama", "entityId": "e1", "summary": "Lama", "needed": "KEPUTUSAN", "status": "DITINJAU", "slaDays": 7, "ageDays": 9, "isOverdue": true,
              "perms": { "mayReview": false, "mayDecide": false, "mayClose": false } },
            { "id": "x3", "sourceType": "TASK", "sourceId": "t1", "entityId": "e1", "summary": "Tugas", "needed": "KEPUTUSAN", "status": "DIAJUKAN", "slaDays": 7, "ageDays": 1, "isOverdue": false }
          ],
          "total": 3, "page": 1, "pageSize": 50
        }
    """.trimIndent()
}
