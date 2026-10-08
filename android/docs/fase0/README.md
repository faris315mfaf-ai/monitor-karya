# Laporan Fase 0 — indeks T4-A1 sampai T4-A10

Swarm Fase 0 Android, 8 Oktober 2026, cabang `codex/kerja`, direktori `android/`.
Ringkasan status dan definisi selesai: [`../FASE0.md`](../FASE0.md).
Audit silang antar-agen (baca-saja, tanpa perbaikan kode): [`T4-A10-AUDIT.md`](T4-A10-AUDIT.md).

| Agen | Zona | Laporan | Ringkas |
| --- | --- | --- | --- |
| T4-A1 | `android/` scaffold Gradle | [`T4-A1-LAPORAN.md`](T4-A1-LAPORAN.md) | Skeleton multi-modul, katalog versi terkunci, detekt+ktlint, manifest modul; wrapper sengaja belum dibangkitkan |
| T4-A2 | `designsystem/…/theme/` | [`T4-A2-LAPORAN.md`](T4-A2-LAPORAN.md) | Token tokens.css → Kotlin (56/56 nilai terverifikasi), `MKTheme` + object `MkTheme`, 6 aksen terang/gelap, tipografi tnum |
| T4-A3 | `designsystem/…/components/` (inti) | [`T4-A3-LAPORAN.md`](T4-A3-LAPORAN.md) | MkButton, MkCard, StatusBadge+MkStatus, StatTile, MkChip, MkIconBtn + pratinjau terang/gelap |
| T4-A4 | `designsystem/…/components/` (lengkap) | [`T4-A4-LAPORAN.md`](T4-A4-LAPORAN.md) | MkSheet (bawah <840dp / samping 440dp), ProjectRow, ActivityItem, EmptyNote, MkSkeleton, ErrorNote, MkOfflineBanner |
| T4-A5 | `core/network/` | [`T4-A5-LAPORAN.md`](T4-A5-LAPORAN.md) | Cookie jar terenkripsi, MkClient (tanpa header Origin), ApiError + pesan Indonesia, AuthApi/RingkasanApi + DTO |
| T4-A6 | `core/data/` | [`T4-A6-LAPORAN.md`](T4-A6-LAPORAN.md) | Room 5 entitas + DAO (outbox antre 7 hari), `buatDb`, MkPrefs DataStore |
| T4-A7 | `core/domain/` | [`T4-A7-LAPORAN.md`](T4-A7-LAPORAN.md) | Port rbac.ts (ROLE_TABS/ROLE_DUTIES), project-status.ts, Wib 17.00, SesiUseCase + kebijakan sandi |
| T4-A8 | `app/` kerangka | [`T4-A8-LAPORAN.md`](T4-A8-LAPORAN.md) | MKApp/MainActivity, AppModule (DI tunggal), MkNavHost gerbang sesi, MKShell tab per peran, SesiViewModel, strings.xml |
| T4-A9 | `app/ui/` layar | [`T4-A9-LAPORAN.md`](T4-A9-LAPORAN.md) | LoginScreen, GantiSandiScreen, RingkasanScreen + ViewModel (parse defensif), PlaceholderTabScreen |
| T4-A10 | CI + docs + audit | [`T4-A10-LAPORAN.md`](T4-A10-LAPORAN.md) | Workflow `android.yml`, `FASE0.md`, indeks ini, `.editorconfig`, audit silang kontrak |

Ketentuan umum seluruh agen: tanpa git, tanpa jaringan, tanpa DB; Gradle tidak
dijalankan — verifikasi kompilasi pertama dilakukan CI setelah `gradlew` tersedia.
