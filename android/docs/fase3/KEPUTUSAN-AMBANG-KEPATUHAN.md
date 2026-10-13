# Keputusan ambang skor kepatuhan (13 Okt 2026)

Menutup temuan **B15** di [E2E-3-PEMANTAU-TI.md](E2E-3-PEMANTAU-TI.md): peta kepatuhan dan grafik "10 PT terendah" memakai ambang dan label berbeda (PT 80,8 hijau "Sesuai jadwal" di peta, oranye "Perlu perhatian" di grafik; legenda peta "≥ 90 selesai").

## Keputusan pemilik

Satu ambang untuk **semua** tampilan skor kepatuhan (0–100), web dan Android:

| Rentang skor | Tone desain | Warna | Label (kata) | Ikon (StatusBadge) |
|---|---|---|---|---|
| skor ≥ 90 | `on` | hijau (`--sukses`) | **Baik** | `selesai` |
| 75 ≤ skor < 90 | `risk` | oranye (`--waspada`) | **Perlu perhatian** | `peringatan` |
| skor < 75 | `late` | merah (`--bahaya`) | **Kritis** | `waktu` |
| skor tidak ada (`null`) | `neutral` | abu | (tanpa lencana skor) | — |

Aturan:

1. Pembanding memakai **skor mentah**, tanpa pembulatan: 89,9 = Perlu perhatian; 74,9 = Kritis; 90 = Baik; 75 = Perlu perhatian.
2. **Jangan** memakai label status proyek ("Selesai", "Sesuai jadwal", "Terlambat") atau "Sesuai target"/"Di bawah target" untuk skor kepatuhan. Tone `done` tidak dipakai untuk skor.
3. Status selalu warna + ikon + kata (StatusBadge), angka skor tetap tertulis.
4. Legenda (urutan tetap): `Baik ≥ 90` · `Perlu perhatian 75–89` · `Kritis < 75`.
5. Target/garis acuan pada batang skor = 90 (ambang Baik).
6. Ringkasan `diBawahTarget` dari `/api/management-charts` sudah menghitung `skor < 75`, jadi kalimatnya: "{n} dari {m} entitas berstatus kritis (skor di bawah 75)." API tidak mengirim tone/label, sehingga API tidak diubah.

## Sumber kebenaran di web

- `src/lib/compliance-band.ts`: `complianceBand(score) → { tone, label }`, `COMPLIANCE_GOOD_MIN = 90`, `COMPLIANCE_ATTENTION_MIN = 75`, `COMPLIANCE_LEGEND`.
- Tes batas: `tests/lib/compliance-band.test.ts` (90 / 89,9 / 75 / 74,9 / 80,8).
- Pemakai: `src/components/status-badges.tsx` (`complianceStatus`, `complianceLabel`, `ComplianceBadge` → pohon & ubin tab Entitas), `src/components/dashboard/compliance-treemap.tsx` (peta + legenda), `src/components/views/management-charts.tsx` (sub-holding + 10 PT terendah), `src/lib/constants.ts` (`complianceColor`).

## Yang perlu disamakan di Android (belum diubah)

`android/feature/ringkasangrup/src/main/kotlin/id/co/monitorkarya/feature/ringkasangrup/logika/Pemetaan.kt`:

- `statusSkorPeta` (kini 90 DONE / 75 ON / 60 RISK / lainnya LATE) dan `statusSkorTarget` + `labelSkorTarget` (kini <75 LATE / <85 RISK / ON, "Di bawah target"/"Perlu perhatian"/"Sesuai target") → ganti dengan satu fungsi, misalnya `pitaKepatuhan(skor: Double): Pair<StatusRingkas, String>` sesuai tabel di atas (`null` → NEUTRAL).
- `TARGET_KEPATUHAN = 75` → pisahkan menjadi `KEPATUHAN_BAIK_MIN = 90` (garis target batang) dan `KEPATUHAN_PERHATIAN_MIN = 75`.
- `RingkasanGrupTab.kt` baris ~532 (meta " · di bawah target"), ~544/554 (status + target batang), ~728 (label 10 PT terendah), ~737 (kalimat ringkasan) dan legenda peta → pakai fungsi dan kalimat di atas.
- `PemetaanTest.kt` baris 91–98 → ganti dengan kasus batas 90 / 89,9 / 75 / 74,9 / 80,8 / null.
