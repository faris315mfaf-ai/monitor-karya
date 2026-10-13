package id.co.monitorkarya.core.data.db

import androidx.sqlite.db.SupportSQLiteDatabase
import java.io.File
import java.lang.reflect.Proxy
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kebijakan migrasi Room tanpa perangkat (JVM murni): rantai migrasi lengkap,
 * tidak ada pernyataan yang menghapus data, dan hasil MIGRASI_2_3 yang
 * DIJALANKAN sungguhan (lewat SupportSQLiteDatabase rekaman) menghasilkan
 * kolom outbox persis seperti skema ekspor versi 3 — tabel lain tak berubah.
 * Tes migrasi SQLite nyata (MigrationTestHelper) butuh androidTest/Robolectric
 * — dicatat di A1-LURING.md sebagai tindak lanjut.
 */
class MigrasiMkTest {

    private val folderSkema = File("schemas/id.co.monitorkarya.core.data.db.MkDatabase")

    private fun skema(versi: Int): JsonObject {
        val berkas = File(folderSkema, "$versi.json")
        assertTrue("skema ekspor $berkas wajib ada (jangan dihapus)", berkas.isFile)
        return Json.parseToJsonElement(berkas.readText()).jsonObject["database"]!!.jsonObject
    }

    private fun tabel(db: JsonObject, nama: String): JsonObject? =
        db["entities"]!!.jsonArray.map { it.jsonObject }.firstOrNull { it["tableName"]!!.jsonPrimitive.content == nama }

    /** Jalankan migrasi pada basis data rekaman; kembalikan pernyataan SQL yang dieksekusi. */
    private fun rekamMigrasi(m: androidx.room.migration.Migration): List<String> {
        val terekam = mutableListOf<String>()
        val db = Proxy.newProxyInstance(
            SupportSQLiteDatabase::class.java.classLoader,
            arrayOf(SupportSQLiteDatabase::class.java),
        ) { _, metode, argumen ->
            when (metode.name) {
                "execSQL" -> { terekam += argumen!![0] as String; null }
                "getVersion" -> m.startVersion
                "isOpen" -> true
                else -> error("Migrasi memanggil ${metode.name} yang tidak direkam tes ini")
            }
        } as SupportSQLiteDatabase
        m.migrate(db)
        return terekam
    }

    private data class Kolom(val nama: String, val afinitas: String, val notNull: Boolean, val bawaan: String?)

    private fun kolomSkema(t: JsonObject) = t["fields"]!!.jsonArray.map { f ->
        val o = f.jsonObject
        Kolom(
            nama = o["columnName"]!!.jsonPrimitive.content,
            afinitas = o["affinity"]!!.jsonPrimitive.content,
            notNull = o["notNull"]?.jsonPrimitive?.boolean ?: false,
            bawaan = o["defaultValue"]?.jsonPrimitive?.content,
        )
    }.toSet()

    private fun namaTabel(db: JsonObject) = db["entities"]!!.jsonArray.map { it.jsonObject["tableName"]!!.jsonPrimitive.content }.toSet()

    @Test
    fun rantaiMigrasiLengkapDariVersiRilisPertama() {
        val dariKe = MigrasiMk.SEMUA.map { it.startVersion to it.endVersion }
        for (v in 2 until MigrasiMk.VERSI) {
            assertTrue("migrasi $v → ${v + 1} wajib ada", (v to v + 1) in dariKe)
        }
        // Hanya versi pra-rilis 1 yang boleh destruktif.
        assertTrue(MigrasiMk.VERSI_PRA_RILIS.all { it < 2 })
        assertEquals(MigrasiMk.VERSI, skema(MigrasiMk.VERSI)["version"]!!.jsonPrimitive.int)
    }

    @Test
    fun tidakAdaPernyataanPenghapusData() {
        for (m in MigrasiMk.SEMUA) {
            for (sql in rekamMigrasi(m)) {
                val s = sql.uppercase()
                assertFalse("migrasi tak boleh DROP/DELETE: $sql", "DROP " in s || "DELETE " in s)
            }
        }
    }

    @Test
    fun migrasi3ke4HanyaMenambahCacheLayarPersisSkemaEkspor() {
        val v3 = skema(3)
        val v4 = skema(4)
        val sql = rekamMigrasi(MigrasiMk.MIGRASI_3_4)
        assertEquals(MigrasiMk.PERNYATAAN_3_4, sql)

        // CREATE TABLE migrasi == createSql Room untuk tabel baru di 4.json.
        val baru = tabel(v4, "cache_layar")
        assertNotNull("4.json wajib memuat cache_layar", baru)
        val createSql = baru!!["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", "cache_layar")
        assertEquals(listOf(createSql), sql)

        // Tabel lama identik (outbox dan cache lain tak tersentuh).
        val nama3 = v3["entities"]!!.jsonArray.map { it.jsonObject["tableName"]!!.jsonPrimitive.content }.toSet()
        val nama4 = v4["entities"]!!.jsonArray.map { it.jsonObject["tableName"]!!.jsonPrimitive.content }.toSet()
        assertEquals(nama3 + "cache_layar", nama4)
        for (n in nama3) {
            assertEquals("tabel $n berubah tanpa migrasi", tabel(v3, n), tabel(v4, n))
        }
    }

    /**
     * Gelombang E: 4 → 5 menambah `outbox.kunciIdempotensi` (TEXT null) lalu
     * MENGISI baris lama dengan UUID v4 per baris. Antrean dipertahankan: hanya
     * ADD COLUMN + UPDATE yang dibatasi `IS NULL` (tanpa DELETE/DROP/salin
     * tabel), kolom lama dan tabel lain identik dengan 4.json.
     */
    @Test
    fun migrasi4ke5MenambahKunciIdempotensiTanpaMenyentuhIsiAntrean() {
        val v4 = skema(4)
        val v5 = skema(5)
        val sql = rekamMigrasi(MigrasiMk.MIGRASI_4_5)
        assertEquals(MigrasiMk.PERNYATAAN_4_5, sql)
        assertEquals(2, sql.size)

        // ALTER: kolom outbox v4 + kunciIdempotensi TEXT null == kolom outbox 5.json.
        assertEquals("ALTER TABLE `outbox` ADD COLUMN `kunciIdempotensi` TEXT", sql[0])
        val outboxV4 = kolomSkema(tabel(v4, "outbox")!!)
        val outboxV5 = kolomSkema(tabel(v5, "outbox")!!)
        assertEquals(outboxV5, outboxV4 + Kolom("kunciIdempotensi", "TEXT", notNull = false, bawaan = null))
        // Kunci primer / indeks outbox tidak berubah.
        val tanpaKolom = { t: JsonObject -> JsonObject(t.filterKeys { it != "fields" && it != "createSql" }) }
        assertEquals(tanpaKolom(tabel(v4, "outbox")!!), tanpaKolom(tabel(v5, "outbox")!!))

        // UPDATE: hanya kolom baru, hanya baris yang belum punya kunci, nilai = UUID v4 per baris.
        val isi = sql[1]
        assertEquals("UPDATE `outbox` SET `kunciIdempotensi` = ${MigrasiMk.SQL_UUID_V4} WHERE `kunciIdempotensi` IS NULL", isi)
        val atas = isi.uppercase()
        for (terlarang in listOf("DELETE", "DROP", "INSERT", "CREATE", "RENAME", "PAYLOADJSON", "STATUS", "PERCOBAAN")) {
            assertFalse("UPDATE tidak boleh menyentuh $terlarang: $isi", terlarang in atas)
        }
        // Ekspresi UUID dievaluasi per baris (fungsi acak SQLite), versi "4" dan varian 8/9/a/b.
        assertTrue("randomblob(" in MigrasiMk.SQL_UUID_V4 && "'-4'" in MigrasiMk.SQL_UUID_V4 && "'89ab'" in MigrasiMk.SQL_UUID_V4)
        assertFalse("tanpa abs(random()) (luapan bilangan)", "abs(" in MigrasiMk.SQL_UUID_V4)

        // Tabel lain identik.
        assertEquals(namaTabel(v4), namaTabel(v5))
        for (n in namaTabel(v4) - "outbox") {
            assertEquals("tabel $n berubah tanpa migrasi", tabel(v4, n), tabel(v5, n))
        }
    }

    /**
     * C5: 5 → 6 menambah `outbox.pemilikUid` (TEXT null) + tabel baru
     * `peta_id_lokal`. Hanya ADD COLUMN + CREATE TABLE; kolom outbox lain,
     * PK/indeks, dan tabel lain identik dengan 5.json.
     */
    @Test
    fun migrasi5ke6MenambahPemilikDanPetaIdTanpaMenyentuhAntrean() {
        val v5 = skema(5)
        val v6 = skema(6)
        val sql = rekamMigrasi(MigrasiMk.MIGRASI_5_6)
        assertEquals(MigrasiMk.PERNYATAAN_5_6, sql)
        assertEquals(2, sql.size)

        assertEquals("ALTER TABLE `outbox` ADD COLUMN `pemilikUid` TEXT", sql[0])
        val outboxV5 = kolomSkema(tabel(v5, "outbox")!!)
        val outboxV6 = kolomSkema(tabel(v6, "outbox")!!)
        assertEquals(outboxV6, outboxV5 + Kolom("pemilikUid", "TEXT", notNull = false, bawaan = null))
        val tanpaKolom = { t: JsonObject -> JsonObject(t.filterKeys { it != "fields" && it != "createSql" }) }
        assertEquals(tanpaKolom(tabel(v5, "outbox")!!), tanpaKolom(tabel(v6, "outbox")!!))

        val peta = tabel(v6, "peta_id_lokal")
        assertNotNull("6.json wajib memuat peta_id_lokal", peta)
        val createSql = peta!!["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", "peta_id_lokal")
        assertEquals(createSql, sql[1])

        assertEquals(namaTabel(v5) + "peta_id_lokal", namaTabel(v6))
        for (n in namaTabel(v5) - "outbox") {
            assertEquals("tabel $n berubah tanpa migrasi", tabel(v5, n), tabel(v6, n))
        }
    }

    /**
     * G1: 6 → 7 hanya menambah tabel `draf_sunting` + indeks `uid` — teks SQL
     * sama persis dengan createSql tabel & indeks di 7.json, tabel lain
     * (termasuk outbox) identik dengan 6.json.
     */
    @Test
    fun migrasi6ke7MenambahDrafSuntingPersisSkemaEkspor() {
        val v6 = skema(6)
        val v7 = skema(7)
        val sql = rekamMigrasi(MigrasiMk.MIGRASI_6_7)
        assertEquals(MigrasiMk.PERNYATAAN_6_7, sql)
        assertEquals(2, sql.size)

        val draf = tabel(v7, "draf_sunting")
        assertNotNull("7.json wajib memuat draf_sunting", draf)
        val createSql = draf!!["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", "draf_sunting")
        assertEquals(createSql, sql[0])
        val indeks = draf["indices"]!!.jsonArray.map { it.jsonObject }
        assertEquals(1, indeks.size)
        val createIndeks = indeks[0]["createSql"]!!.jsonPrimitive.content.replace("\${TABLE_NAME}", "draf_sunting")
        assertEquals(createIndeks, sql[1])

        assertEquals(namaTabel(v6) + "draf_sunting", namaTabel(v7))
        for (n in namaTabel(v6)) {
            assertEquals("tabel $n berubah tanpa migrasi", tabel(v6, n), tabel(v7, n))
        }
        // Kolom draf: tanpa sandi/token — hanya alamat, pemilik, isian, waktu.
        assertEquals(
            setOf("kunci", "uid", "json", "disimpanPada"),
            kolomSkema(draf).map { it.nama }.toSet(),
        )
    }

    @Test
    fun migrasi2ke3MenghasilkanSkemaOutboxVersi3() {
        val v2 = skema(2)
        val v3 = skema(3)
        val sql = rekamMigrasi(MigrasiMk.MIGRASI_2_3)
        assertEquals(MigrasiMk.PERNYATAAN_2_3, sql)

        // Kolom outbox v2 + kolom yang ditambahkan migrasi == kolom outbox v3.
        val polaTambah = Regex(
            """ALTER TABLE `outbox` ADD COLUMN `(\w+)` (\w+)( NOT NULL)?( DEFAULT (\S+))?""",
        )
        val ditambah = sql.map { s ->
            val cocok = polaTambah.matchEntire(s)
            assertNotNull("pernyataan tak dikenal: $s", cocok)
            val m = cocok!!
            Kolom(
                nama = m.groupValues[1],
                afinitas = m.groupValues[2],
                notNull = m.groupValues[3].isNotEmpty(),
                bawaan = m.groupValues[5].ifEmpty { null },
            )
        }.toSet()

        val outboxV2 = kolomSkema(tabel(v2, "outbox")!!)
        val outboxV3 = kolomSkema(tabel(v3, "outbox")!!)
        assertEquals(outboxV3, outboxV2 + ditambah)

        // Tabel lain identik (migrasi hanya menyentuh outbox).
        val nama2 = v2["entities"]!!.jsonArray.map { it.jsonObject["tableName"]!!.jsonPrimitive.content }.toSet()
        val nama3 = v3["entities"]!!.jsonArray.map { it.jsonObject["tableName"]!!.jsonPrimitive.content }.toSet()
        assertEquals(nama2, nama3)
        for (n in nama2 - "outbox") {
            assertEquals("tabel $n berubah tanpa migrasi", tabel(v2, n), tabel(v3, n))
        }
    }
}
