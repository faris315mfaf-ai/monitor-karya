# Laporan T4-A6 — Fase 0: modul `:core:data` (Room + DataStore)

Tanggal: 8 Oktober 2026 · Lingkup: `android/core/data/` saja · Tanpa git/jaringan/DB/Gradle.

## Berkas yang dibuat

| Berkas | Isi |
|---|---|
| `core/data/src/main/kotlin/id/co/monitorkarya/core/data/db/Entities.kt` | 5 entitas Room: `ProjectEntity` (tabel `proyek`), `DailyReportEntity` (`daily_report`), `TaskEntity` (`tugas`), `EscalationEntity` (`eskalasi`), `OutboxEntity` (`outbox`). Nama field dan default persis sesuai tugas; tanggal `Long` epochMillis. |
| `core/data/src/main/kotlin/id/co/monitorkarya/core/data/db/Daos.kt` | `ProjectDao`, `DailyReportDao`, `TaskDao`, `EscalationDao`, `OutboxDao`: `@Upsert simpan(semua)/simpan(satu)`, kueri per proyek urut tanggal DESC, `hapusTersinkronLama(sebelum)`. `OutboxDao`: `antrian()` (status MENUNGGU urut id), `tandai(id, status, pesan, percobaan)`, `hapusBerhasil()`, `hapusKedaluwarsa(sebelum)`, `jumlahMenunggu(): Flow<Int>`. |
| `core/data/src/main/kotlin/id/co/monitorkarya/core/data/db/MkDatabase.kt` | `@Database` 5 entitas, version 1, `exportSchema = true`, tanpa `@TypeConverters` (semua kolom primitif). Akses DAO: `projectDao()`, `dailyReportDao()`, `taskDao()`, `escalationDao()`, `outboxDao()`. |
| `core/data/src/main/kotlin/id/co/monitorkarya/core/data/db/DbFactory.kt` | `buatDb(context)` → `Room.databaseBuilder` nama `"monitorkarya.db"` + `fallbackToDestructiveMigration()` berkomentar "hanya fase 0, sebelum rilis ganti migrasi". |
| `core/data/src/main/kotlin/id/co/monitorkarya/core/data/prefs/MkPrefs.kt` | `MkPrefs(context)` atas DataStore Preferences `"mk_pengaturan"`: Flow `aksen` (default "merah"), `tema` ("system"), `pernahMasuk` (false), `terakhirSinkron` (0), `uidTerakhir` (null) + setter suspend masing-masing (`setAksen`, `setTema`, `setPernahMasuk`, `setTerakhirSinkron`, `setUidTerakhir` — null menghapus kunci). |

## Keputusan teknis

1. **`proyek_id` di `daily_report`**: tugas menetapkan `@Index("proyek_id")`, maka field `proyekId` diberi `@ColumnInfo(name = "proyek_id")` agar nama kolom cocok dengan indeks (tanpa ini Room gagal verifikasi skema). Tabel `tugas` memakai indeks `proyekId` langsung tanpa `@ColumnInfo`, sesuai tugas.
2. **`EscalationDao` tanpa `hapusTersinkronLama`**: entitas eskalasi tidak punya kolom `tersinkronPada` (sesuai tugas), jadi pembersihan tidak berlaku; penyegaran penuh lewat `simpan` (diberi komentar di DAO).
3. **Urutan tugas**: `pilihPerProyek` di `TaskDao` diurut `tanggalKerja DESC, urutan ASC` — tanggal DESC sesuai tugas, `urutan ASC` menjaga urutan kartu papan dalam hari yang sama.
4. **Konstanta status outbox**: `OutboxEntity.Companion` menyimpan `STATUS_MENUNGGU/BERHASIL/GAGAL` untuk dipakai repository; SQL DAO menulis literal string agar verifikasi kueri Room sederhana.
5. **`simpan(satu)` outbox mengembalikan `Long`** (rowId entri baru) agar pemanggil bisa `tandai` baris tersebut.
6. **Kueri pelengkap kecil**: `ProjectDao.pilihSemua()/pilih(id)` (daftar + detail proyek) dan `EscalationDao.pilihSemua()` ditambahkan karena pola "per proyek" tidak memadai untuk kedua entitas itu; `DailyReportDao`/`TaskDao` murni per proyek sesuai tugas.

## Catatan untuk agen build (T-gradle)

- `exportSchema = true` butuh argumen KSP/kapt `room.schemaLocation` (mis. `$projectDir/schemas`) di `core/data/build.gradle.kts`; tanpa itu build Room memberi peringatan.
- Versi Room yang dipakai menentukan bentuk `fallbackToDestructiveMigration`: di Room ≥2.7 bentuk tanpa argumen dideprekasi (ganti `fallbackToDestructiveMigration(true)`); kode ini memakai bentuk tanpa argumen yang kompatibel 2.6 dan tetap ter-compile (dengan peringatan) di 2.7+.
- Dependensi yang diasumsikan: `androidx.room:room-runtime`, `room-ktx` (atau `room-ktx` digabung sejak 2.6), `androidx.datastore:datastore-preferences`, `kotlinx-coroutines`.
- Belum ada uji (unit/instrument) — fase 0 struktural; pengujian repository/outbox masuk fase berikutnya.

## Verifikasi

Tidak menjalankan Gradle (larangan tugas). Nama paket, nama berkas, nama kelas/fungsi/field, dan default dicek dua kali terhadap daftar tugas dan `prisma/schema.prisma` (Project, DailyProjectReport, Task, Escalation) serta `docs/zcode/RANCANGAN-ANDROID-NATIVE.md` §4 (hasil server final; antre maks 7 hari → `hapusKedaluwarsa` + komentar di DAO).
