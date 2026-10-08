# Hasil — kajian drift migrasi 0001–0012

Dikerjakan Zcode, 8 Oktober 2026. Zona: `prisma/schema.prisma`, `docs/zcode/**`. Tanpa migrasi baru, tanpa menyentuh DB pengguna 54339 dan produksi.

## Metode

Selisih dihitung dengan `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` pada kontainer PostgreSQL 17 **sekali pakai** (port lokal 54359, tanpa volume bernama, dihapus setelah selesai). Migrasi 0006 mengharapkan `storage.buckets`, sehingga kontainer diberi metadata tiruan yang isinya sama dengan konfigurasi `docker-compose.dev.yml` (bukan layanan Storage). `prisma.config.ts` memang mewajibkan `DATABASE_URL`/`DIRECT_URL` eksplisit; keduanya menunjuk kontainer itu saja.

## Temuan

1. Selisih migrasi vs skema ternyata **murni indeks**: 40 indeks yang dibuat migrasi 0003–0012 tidak dideklarasikan `schema.prisma`. Tanpa deklarasi, `prisma migrate dev` berikutnya mengusulkan SQL penghapusan seluruhnya (hasil diff tersimpan pada pemeriksaan; daftar lengkap di bawah).
2. **Klaim lama soal `Project.approvalChain` NOT NULL sudah tidak relevan**: migrasi 0012 menambahkan kolom sebagai `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`, dan skema mendeklarasikan `String[] @default([])` — keduanya sama artinya. Diff menunjukkan nol perbedaan kolom dan tipe.
3. 14 dari 40 indeks memakai nama non-baku Prisma (tanpa akhiran `_idx` atau singkatan, mis. `AuditLog_at`, `KpiSnapshot_period`, `DailyProjectReport_entity_date`, `User_role_scope`).

## Solusi yang diterapkan

Deklarasi `@@index` untuk seluruh 40 indeks pada 20 model `schema.prisma` (commit `CX-DRIFT`). Nama baku (26) mengikuti konvensi Prisma sehingga cocok tanpa `map:`; nama non-baku (14) dideklarasikan dengan `map: "<nama sebenarnya>"` agar sama dengan indeks yang sudah ada di setiap basis data yang dibangun dari migrasi ini. **Tidak ada SQL migrasi baru** — indeksnya sudah ada di semua basis data riwayat; skema kini jujur menyatakannya. Ini meneladani pola 0026 (indeks FK dideklarasikan di skema).

| Model | Indeks dideklarasikan (peta = nama non-baku) |
|---|---|
| Entity | `(parentId)`, `(path)` |
| Division | `(divisionTypeId)`, `(entityId)` peta `Division_entityId`, `(headUserId)` |
| Project | `(entityId)` peta `Project_entityId`, `(picUserId)`, `(proposedById)` |
| ProjectApproval | `(decidedById)` |
| ProjectProgressReport | `(submittedById)` |
| AdminAppointment | `(entityId)` |
| Holiday | `(workCalendarId)` |
| User | `(role, scopeEntityId)` peta `User_role_scope` |
| DailyProjectReport | `(entityId, reportDate)` peta `DailyProjectReport_entity_date`, `(reportDate)` peta `DailyProjectReport_reportDate`, `(submittedById)`, `(forwardedById)` |
| WeeklyDivisionReport | `(entityId, isoYear, isoWeek)` peta `WeeklyDivisionReport_entity`, `(submittedById)`, `(forwardedById)`, `(approvedById)` |
| WeeklyReportItem | `(weeklyReportId)` peta `WeeklyReportItem_report`, `(aspectCategoryId)`, `(priorityId)` |
| Escalation | `(entityId)` peta `Escalation_entityId`, `(raisedById)`, `(decidedById)`, `(status, raisedAt)` peta `Escalation_status_raisedAt` |
| UnlockRequest | `(requestedById)`, `(approvedById)`, `(executedById)` |
| AuditLog | `(actorId)` peta `AuditLog_actorId`, `(at)` peta `AuditLog_at` |
| LateIncident | `(entityId)` peta `LateIncident_entityId` |
| SpotCheck | `(checkedById)` |
| NotificationLog | `(userId)`, `(createdAt)` peta `NotificationLog_createdAt` |
| KpiSnapshot | `(periodType, periodKey)` peta `KpiSnapshot_period` |
| Task | `(createdById)`, `(escalationId)` |

## Bukti

- Sebelum: `migrate diff --exit-code` keluar dengan daftar penghapusan 40 indeks pada 19 tabel (exit ≠ 0).
- Sesudah: `npx prisma validate` lulus; `migrate diff` yang sama menghasilkan **"No difference detected."** (exit 0) — basis data apa pun yang dibangun lewat `migrate deploy` kini identik dengan skema.
- `prisma generate`, TypeScript, dan ESLint lulus pada gerbang hari yang sama (lihat HASIL-TAHAP1).

## Dampak dan batasan

- `prisma migrate dev` berikutnya tidak lagi mengusulkan penghapusan indeks lama; risiko SQL destruktif saat persiapan rilis hilang.
- Tidak ada perubahan perilaku aplikasi: `@@index` tidak mengubah klien Prisma maupun hasil kueri, hanya deklarasi.
- DB produksi tetap wajib menjalani urutan migrasi tertunda oleh operator (bagian A1 SISA-PEKERJAAN); deklarasi skema tidak menggantikan itu.
- Jika suatu saat dibutuhkan migrasi penataan ulang nama indeks ke konvensi baku, itu keputusan terpisah dengan SQL `ALTER INDEX ... RENAME` dan pengujian sendiri; saat ini `map:` dipilih karena nol risiko.
