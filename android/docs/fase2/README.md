# Indeks laporan Fase 2 (T6-C1 sampai T6-C10)

Swarm Fase 2 — Kepala divisi & Admin PT, 8 Oktober 2026. Definisi fase, peta
layar, tabel kontrak, dan cara uji: [`../FASE2.md`](../FASE2.md). Swarm berjalan
paralel; baris diperbarui saat laporan mendarat.

| Agen | Zona | Laporan | Isi ringkas |
| --- | --- | --- | --- |
| T6-C1 | `:core:network` (API kadiv) | [T6-C1-LAPORAN.md](T6-C1-LAPORAN.md) | `WeeklyInputApi`, `WeeklyReportsApi`, `KadivApi`, `LaporanDibacaApi`, `DtosFase2Kadiv` (69 DTO, `KonflikDto` dengan `reason/code`) |
| T6-C2 | `:core:network` (API admin) | [T6-C2-LAPORAN.md](T6-C2-LAPORAN.md) | `InboxApi`, `AdminComplianceApi`, `AkunApi`, `DtosFase2Admin` (penerimaan, kepatuhan, meja akun, aktivasi, `GalatDto`) |
| T6-C3 | `:core:data` (repo + Room F2) | [T6-C3-LAPORAN.md](T6-C3-LAPORAN.md) | `EntitiesFase2` + `DaosFase2`, `MingguanRepo`, `PenerimaanRepo`, `KepatuhanRepo`, `Hasil` — perlu penyesuaian ke API terketik C1 (audit A1–A3) |
| T6-C4 | `:designsystem` (komponen data) | [T6-C4-LAPORAN.md](T6-C4-LAPORAN.md) | `MkDivisionBar` + `nadaDivisi`, `MkQueueItem`, `MkBoardColumn`, `MkRing` |
| T6-C5 | — | belum mendarat | — |
| T6-C6 | `:app` `ui/tim/` | [T6-C6-LAPORAN.md](T6-C6-LAPORAN.md) | `TimScreen`+VM (daftar anggota MkListRow + lencana lapor hari ini, sheet ringkas per orang), `RingkasanDirekturSheet`+VM (poin MkField tambah/hapus, kirim/tarik, 409 PENDING_REVIEW/SENT) |
| T6-C7 | `:app` `ui/penerimaan/` | [T6-C7-LAPORAN.md](T6-C7-LAPORAN.md) | `PenerimaanScreen` + VM: dua arus, teruskan/teruskan semua, 409 → BEKU, toast Urungkan |
| T6-C8 | `:app` `ui/kepatuhan/` | [T6-C8-LAPORAN.md](T6-C8-LAPORAN.md) | `KepatuhanScreen` + VM: harian/mingguan, belum-lapor + Ingatkan (orang/divisi), kunci 17.00 |
| T6-C9 | `:app` `ui/akun/` | [T6-C9-LAPORAN.md](T6-C9-LAPORAN.md) | `AkunScreen` + VM: daftar `GET /api/companies`, guard baca-saja `ADMIN_PT_MANAGED_ROLES`, aktif/nonaktif, sandi, aktivasi |
| T6-C10 | `docs/` + `core/*/src/test/` | [T6-C10-LAPORAN.md](T6-C10-LAPORAN.md), [T6-C10-AUDIT.md](T6-C10-AUDIT.md) | FASE2.md, indeks ini, tes kontrak `InboxTeruskan409Test`/`MingguanStatusTest`/`AkunGuardTest`, audit silang |

Catatan: komponen formulir designsystem (`MkField`, `MkPilih`, `MkSegmented`,
`MkListRow`, `MkLampiran`, `MkFAB`, `MkSnackbar`) mendarat tanpa laporan
terpisah — pemetaan agennya dilengkapi saat indeks diperbarui. T6-C5 belum
mendarat hingga indeks ini ditutup (papan mingguan kadiv, `ui/mingguan`).
Audit silang T6-C10 memotret keadaan pohon per 8 Okt ±21.30 WIB.
