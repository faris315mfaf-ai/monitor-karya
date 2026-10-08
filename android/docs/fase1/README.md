# Laporan Fase 1 — indeks

Dokumen fase: [`../FASE1.md`](../FASE1.md) (definisi selesai, peta layar/rute,
kontrak nama lintas agen, cara uji). Fase sebelumnya:
[`../fase0/README.md`](../fase0/README.md). Audit silang:
[`T5-B9-AUDIT.md`](T5-B9-AUDIT.md).

| Agen | Zona | Laporan | Status mendarat |
| --- | --- | --- | --- |
| T5-B1 | `:core:network` (API + DTO Fase 1, `Konflik` 409) | [T5-B1-LAPORAN.md](T5-B1-LAPORAN.md) | ya — diuji `ApiError409Test`, `DtoFase1Test` |
| T5-B2 | sinkronisasi/outbox (`:core:data` repo `Hasil.kt` dianggap kontraknya; `SyncScheduler`, `OutboxProsesor`) | *belum ada* | sebagian (`Hasil.kt`, repositori); pemroses antrean belum |
| T5-B4 | `ui/mejakerja` | *belum ada* | belum — `MKShell` menunggu |
| T5-B5 | `ui/laporan` | [T5-B5-LAPORAN.md](T5-B5-LAPORAN.md) | ya (dengan jahitan `DailyInputApi` lokal) |
| T5-B7 | `ui/proyek` | *belum ada* | belum — `MKShell` menunggu |
| T5-B8 | `app/navigation` + `strings.xml` | [T5-B8-LAPORAN.md](T5-B8-LAPORAN.md) | ya |
| T5-B9 | tes unit + dokumen fase + audit | [T5-B9-LAPORAN.md](T5-B9-LAPORAN.md) | ya |

Catatan: berkas cakupan Fase 2 (`PenerimaanRepo`, `KepatuhanRepo`,
`MingguanRepo`, `DtosFase2Admin.kt`, `ui/penerimaan`, `ui/tim`) sudah ada di
pohon; indeks keterangannya ada di `docs/fase2/` (T6-C2 dst.).
