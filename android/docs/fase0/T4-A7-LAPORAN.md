# T4-A7 — Laporan Fase 0: domain Android Monitor Karya

Tanggal: 8 Oktober 2026. Cabang: `codex/kerja`. Zona: `android/core/domain/` saja.

## Berkas yang ditulis

| Berkas | Sumber TS |
| --- | --- |
| `android/core/domain/src/main/kotlin/id/co/monitorkarya/core/domain/time/Wib.kt` | `src/lib/wib.ts`, `src/lib/lock.ts` (bagian harian) |
| `.../domain/model/Models.kt` | `src/lib/constants.ts` (ROLE_LABELS), `src/components/mk/core.tsx` (STATUS) |
| `.../domain/status/StatusProyek.kt` | `src/lib/project-status.ts` |
| `.../domain/roles/RoleTabs.kt` | `src/lib/rbac.ts` (ROLE_TABS, ROLE_DUTIES, tabsForRole/canSeeTab/defaultTabForRole), `src/lib/constants.ts` (NAV_TABS) |
| `.../domain/usecase/SesiUseCase.kt` | `src/app/api/login`, `src/lib/password-policy.ts` |

Hanya `java.time` + `kotlin-stdlib`; tanpa dependensi lain; gradle tidak dijalankan. Berkas build modul (`core/domain/build.gradle.kts`) dibuat agen kerangka T4-A1; sumber di atas kompatibel dengannya.

## Verifikasi ROLE_TABS

Setiap peran dicek satu per satu terhadap `ROLE_TABS` di `src/lib/rbac.ts` (urutan sama): PIC_PROYEK, KEPALA_DIVISI, ADMIN_PT, DIREKTUR_ENTITAS, DIREKTUR_SDM_GA, TI, SUPERADMIN, MANAJEMEN, AUDITOR — semuanya cocok. Label tab diambil dari `NAV_TABS` (catatan: `divisions` = "Divisi", `audit` = "Log aktivitas"). ROLE_DUTIES disalin persis (Indonesia). Yang belum diport dari rbac.ts: ROLE_CAPABILITIES/can(), ROLE_COMPACT_TABS, PROJECT_APPROVAL_CHAIN, PROJECT_SLOT_SIGNERS, MASTER_ROLES/ENTITY_ROLES/HOLDING_ROLES — di luar lingkup T4-A7.

## Gap port project-status.ts (StatusProyek.kt)

1. **lifecycle tidak ada di ProyekRingkas.** Cek `lifecycle === 'DITUTUP'` di TS tidak bisa dievaluasi dari model domain; disediakan parameter opsional `siklusHidup: String? = null` — null berarti cek dilewati (proyek DITUTUP akan dinilai dari laporan/progres saja). Butuh field `lifecycle` di ProyekRingkas agar penuh.
2. **needsEscalation tidak ada di LaporanHarian.** `latest.needsEscalation` di TS tidak tersedia; disediakan parameter opsional `perluEskalasi: Boolean = false`. Bila eskalasi aktif, TS tetap risk bahkan tanpa status TERKENDALA/MENUNGGU_KEPUTUSAN — perilaku ini hanya aktif bila pemanggil mengisi parameter itu.
3. **Tipe tenggat berbeda.** TS membandingkan instan `Date` (`targetEndDate.getTime() < now.getTime()`) dengan `Math.floor(diff/DAY)` untuk umur keterlambatan; Kotlin memakai `LocalDate` — dianggap lewat bila `tenggat < hari WIB sekarang`, umur = `ChronoUnit.DAYS.between(tenggat, hariIni)` minimal 1. Asumsi: tenggat berarti akhir hari; bila nanti skema menyimpan jam tenggat, sesuaikan.
4. **`hitung(...)` mengembalikan MkStatusDomain saja** (sesuai spesifikasi T4-A7); alasan + progres tersedia lewat `hitungLengkap(...)` yang mengembalikan `Hasil(status, alasan, progres)`.
5. **Kepingan port yang dipertahankan:** pemotongan alasan `> 90` karakter → ambil 88 + "…" (perilaku `firstSentence` TS, termasuk nilai 90/88-nya, disalin persis).
6. **STATUS_ORDER** diport sebagai `StatusProyek.URUTAN` (late=0, risk=1, on=2, neutral=3, done=4).

## Gap port Wib (wib.ts/lock.ts)

- Hanya bagian harian yang diminta spesifikasi: `hariIni`, konversi epoch millis, kunci 17.00 WIB, `terkunciHarian`, `labelJam "HH.mm"`. Helper mingguan/bulanan (isoWeekKey, weeklyDeadlines, periodOf, progressLockAt, validasi laporan) belum diport — belum dibutuhkan Fase 0.
- `DAILY_CUTOFF_HOUR` di web bisa diatur lewat env; di Android dikunci konstanta 17.00 WIB. Bila ritme pelaporan berubah, ubah `Wib.kunciHarian`.

## Catatan SesiUseCase

- Empat fungsi disuntikkan via konstruktor (`login`, `saya`, `gantiSandi`, `keluarSesi`) — domain tidak bergantung HTTP.
- Kebijakan sandi (min 8, maks 256, bukan spasi saja, tidak sama dengan yang lama) dan pesannya diport dari `src/lib/password-policy.ts`; pesan kredensial salah: "Nama pengguna atau kata sandi tidak cocok."
- `CancellationException` diteruskan supaya pembatalan coroutine tidak tertelan blok `catch (Exception)`.

## Saran lanjutan

- Tambah `lifecycle` dan `needsEscalation` (atau `eskalasiAktif`) ke model domain saat lapisan data dibuat agar port project-status 100%.
- Unit test StatusProyek/Wib saat modul `android/core/domain` punya rangka uji (gradle tidak disentuh di fase ini).
