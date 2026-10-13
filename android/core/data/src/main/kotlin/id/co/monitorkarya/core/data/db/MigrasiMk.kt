// Migrasi Room bernomor (pengganti fallbackToDestructiveMigration fase 0).
//
// Kebijakan (A1-LURING.md §4):
// - SETIAP kenaikan versi mulai 2 wajib punya Migration nyata di [MigrasiMk.SEMUA]
//   — tabel outbox berisi tulisan pengguna yang belum terkirim dan tidak boleh
//   hilang karena pembaruan aplikasi. Tes MigrasiMkTest memeriksa rantai
//   2 → VERSI lengkap dan hasil migrasi sama dengan skema ekspor (schemas/).
// - Hanya versi 1 (pra-rilis Fase 0/1, outbox belum punya penulis sehingga pasti
//   kosong) yang boleh dihancurkan-dibangun-ulang: [VERSI_PRA_RILIS].
// - Skema diekspor ke core/data/schemas/<FQN MkDatabase>/<versi>.json; berkas
//   versi lama JANGAN diubah/dihapus (dipakai tes migrasi).
package id.co.monitorkarya.core.data.db

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

object MigrasiMk {

    /** Versi skema MkDatabase saat ini — dipakai @Database(version = ...). */
    const val VERSI: Int = 7

    /**
     * Versi yang boleh dihapus-bangun-ulang saat ditingkatkan. Versi 1 hanya
     * pernah ada di build pengembang (outbox dorman, tanpa penulis → kosong).
     */
    val VERSI_PRA_RILIS: IntArray = intArrayOf(1)

    /**
     * 2 → 3: outbox mendapat kunci dependensi FIFO, label tampil, dan jadwal
     * backoff. Hanya ADD COLUMN — baris antrean lama tetap utuh (kunci null =
     * pesan mandiri, berikutnyaPada 0 = segera dicoba).
     */
    val PERNYATAAN_2_3: List<String> = listOf(
        "ALTER TABLE `outbox` ADD COLUMN `kunci` TEXT",
        "ALTER TABLE `outbox` ADD COLUMN `label` TEXT",
        "ALTER TABLE `outbox` ADD COLUMN `berikutnyaPada` INTEGER NOT NULL DEFAULT 0",
    )

    val MIGRASI_2_3: Migration = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            PERNYATAAN_2_3.forEach(db::execSQL)
        }
    }

    /**
     * 3 → 4 (B2): tabel baru `cache_layar` untuk potret layar PIC saat luring.
     * Hanya CREATE TABLE — outbox dan tabel lain tidak disentuh. Teks SQL sama
     * persis dengan createSql skema ekspor 4.json (dikunci MigrasiMkTest).
     */
    val PERNYATAAN_3_4: List<String> = listOf(
        "CREATE TABLE IF NOT EXISTS `cache_layar` (`kunci` TEXT NOT NULL, `json` TEXT NOT NULL, " +
            "`disimpanPada` INTEGER NOT NULL, PRIMARY KEY(`kunci`))",
    )

    val MIGRASI_3_4: Migration = object : Migration(3, 4) {
        override fun migrate(db: SupportSQLiteDatabase) {
            PERNYATAAN_3_4.forEach(db::execSQL)
        }
    }

    /**
     * Ekspresi SQLite yang menghasilkan UUID v4 acak per baris (36 karakter,
     * huruf kecil, nibble versi "4", varian 8/9/a/b) — memakai randomblob/
     * random yang dievaluasi ulang untuk SETIAP baris UPDATE. `random() & 3`
     * (bukan abs(random()) % 4) supaya tidak ada galat luapan bilangan.
     */
    const val SQL_UUID_V4: String =
        "lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || " +
            "substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || " +
            "substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))"

    /**
     * 4 → 5 (gelombang E, idempotensi tulis): outbox mendapat kolom
     * `kunciIdempotensi` (header Idempotency-Key). Hanya ADD COLUMN + UPDATE
     * pengisian — tidak ada baris yang dihapus/diubah selain kolom baru.
     *
     * Baris lama DIISI UUID baru saat migrasi (bukan dibiarkan null): server
     * belum pernah melihat kunci itu, jadi percobaan pertama sesudah
     * pembaruan diproses seperti dulu, dan sejak itu setiap ulangan (proses
     * mati setelah POST sukses, IOException setelah server commit) dibalas
     * respons pertama — tanpa entri/bukti ganda. Kiriman yang mungkin sudah
     * sukses SEBELUM pembaruan tetap tidak terlindungi (server tidak pernah
     * mencatatnya); itu batas yang sama dengan perilaku lama.
     */
    val PERNYATAAN_4_5: List<String> = listOf(
        "ALTER TABLE `outbox` ADD COLUMN `kunciIdempotensi` TEXT",
        "UPDATE `outbox` SET `kunciIdempotensi` = $SQL_UUID_V4 WHERE `kunciIdempotensi` IS NULL",
    )

    val MIGRASI_4_5: Migration = object : Migration(4, 5) {
        override fun migrate(db: SupportSQLiteDatabase) {
            PERNYATAAN_4_5.forEach(db::execSQL)
        }
    }

    /**
     * 5 → 6 (C5-T1/T3): outbox mendapat `pemilikUid` (pekerja hanya mengirim
     * pesan milik uid sesi aktif; baris lama null diadopsi pengguna yang sama
     * saat sesi siap) + tabel baru `peta_id_lokal` (id lokal entri luring →
     * id server). Hanya ADD COLUMN + CREATE TABLE; tidak ada baris yang hilang.
     * Teks CREATE sama persis dengan createSql skema ekspor 6.json.
     */
    val PERNYATAAN_5_6: List<String> = listOf(
        "ALTER TABLE `outbox` ADD COLUMN `pemilikUid` TEXT",
        "CREATE TABLE IF NOT EXISTS `peta_id_lokal` (`idLokal` TEXT NOT NULL, `idServer` TEXT NOT NULL, " +
            "`dibuatPada` INTEGER NOT NULL, PRIMARY KEY(`idLokal`))",
    )

    val MIGRASI_5_6: Migration = object : Migration(5, 6) {
        override fun migrate(db: SupportSQLiteDatabase) {
            PERNYATAAN_5_6.forEach(db::execSQL)
        }
    }

    /**
     * 6 → 7 (G1, draf otomatis): tabel baru `draf_sunting` + indeks `uid`.
     * Hanya CREATE TABLE/INDEX — outbox dan tabel lain tidak disentuh. Teks
     * SQL sama persis dengan createSql skema ekspor 7.json (dikunci MigrasiMkTest).
     */
    val PERNYATAAN_6_7: List<String> = listOf(
        "CREATE TABLE IF NOT EXISTS `draf_sunting` (`kunci` TEXT NOT NULL, `uid` TEXT NOT NULL, " +
            "`json` TEXT NOT NULL, `disimpanPada` INTEGER NOT NULL, PRIMARY KEY(`kunci`))",
        "CREATE INDEX IF NOT EXISTS `index_draf_sunting_uid` ON `draf_sunting` (`uid`)",
    )

    val MIGRASI_6_7: Migration = object : Migration(6, 7) {
        override fun migrate(db: SupportSQLiteDatabase) {
            PERNYATAAN_6_7.forEach(db::execSQL)
        }
    }

    /** Seluruh migrasi berurutan; tambahkan MIGRASI_7_8 dst. di sini. */
    val SEMUA: Array<Migration> = arrayOf(MIGRASI_2_3, MIGRASI_3_4, MIGRASI_4_5, MIGRASI_5_6, MIGRASI_6_7)
}
