package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.DrafSuntingDao
import id.co.monitorkarya.core.data.db.DrafSuntingEntity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** DrafSuntingDao di memori — meniru semantik SQL DAO. */
private class DaoPalsu : DrafSuntingDao {
    val baris = linkedMapOf<String, DrafSuntingEntity>()
    var gagal = false

    private fun cek() {
        if (gagal) error("disk penuh")
    }

    override suspend fun simpan(satu: DrafSuntingEntity) {
        cek()
        baris[satu.kunci] = satu
    }

    override suspend fun ambil(kunci: String): DrafSuntingEntity? {
        cek()
        return baris[kunci]
    }

    override suspend fun hapus(kunci: String) {
        baris.remove(kunci)
    }

    override suspend fun hapusSelainUid(uid: String) {
        baris.values.removeAll { it.uid != uid }
    }

    override suspend fun hapusPerUid(uid: String) {
        baris.values.removeAll { it.uid == uid }
    }

    override suspend fun hapusLama(sebelum: Long) {
        baris.values.removeAll { it.disimpanPada < sebelum }
    }
}

/** G1: draf otomatis — simpan/pulihkan/buang, pemisahan uid, kedaluwarsa. */
class DrafSuntingTest {

    private val dao = DaoPalsu()
    private var uid: String? = "pic-1"
    private var jam = 1_000_000L
    private val draf = DrafSunting(dao, uidAktif = { uid }, jam = { jam })
    private val entriBaru = KunciDraf(KunciDraf.LAPORAN_ENTRI, KunciDraf.baru("proyek-A"), "2026-10-13")

    @Test
    fun simpan_lalu_ambil_memulihkan_isian_dan_waktu() = runBlocking {
        draf.simpan(entriBaru, """{"judul":"Cor pondasi"}""")
        val d = draf.ambil(entriBaru)
        assertEquals("""{"judul":"Cor pondasi"}""", d?.json)
        assertEquals(1_000_000L, d?.disimpanPada)
        // Satu baris per alamat: simpan kedua menimpa.
        jam += 5
        draf.simpan(entriBaru, """{"judul":"Cor pondasi 2"}""")
        assertEquals(1, dao.baris.size)
        assertEquals("""{"judul":"Cor pondasi 2"}""", draf.ambil(entriBaru)?.json)
    }

    @Test
    fun buang_menghapus_draf() = runBlocking {
        draf.simpan(entriBaru, "{}")
        draf.buang(entriBaru)
        assertNull(draf.ambil(entriBaru))
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun alamat_berbeda_tidak_saling_tertukar() = runBlocking {
        val tanggalLain = entriBaru.copy(tanggal = "2026-10-12")
        val proyekLain = entriBaru.copy(objek = KunciDraf.baru("proyek-B"))
        val entriAda = entriBaru.copy(objek = "task-9")
        val butir = KunciDraf(KunciDraf.MINGGUAN_BUTIR, KunciDraf.baru("proyek-A"), "2026-10-13")
        draf.simpan(entriBaru, "A")
        assertNull(draf.ambil(tanggalLain))
        assertNull(draf.ambil(proyekLain))
        assertNull(draf.ambil(entriAda))
        assertNull(draf.ambil(butir))
    }

    @Test
    fun draf_akun_lain_tidak_pernah_terbaca() = runBlocking {
        draf.simpan(entriBaru, "milik pic-1")
        uid = "pic-2"
        assertNull(draf.ambil(entriBaru))
        draf.simpan(entriBaru, "milik pic-2")
        assertEquals("milik pic-2", draf.ambil(entriBaru)?.json)
        uid = "pic-1"
        assertEquals("milik pic-1", draf.ambil(entriBaru)?.json)
        // Baris membawa uid pemiliknya.
        assertEquals(setOf("pic-1", "pic-2"), dao.baris.values.map { it.uid }.toSet())
    }

    @Test
    fun tanpa_sesi_aktif_tidak_menyimpan_atau_membaca() = runBlocking {
        uid = null
        draf.simpan(entriBaru, "x")
        assertTrue(dao.baris.isEmpty())
        uid = "  "
        draf.simpan(entriBaru, "x")
        assertTrue(dao.baris.isEmpty())
        uid = "pic-1"
        draf.simpan(entriBaru, "x")
        uid = null
        assertNull(draf.ambil(entriBaru))
    }

    @Test
    fun keluar_akun_membuang_semua_draf_akun_itu_saja() = runBlocking {
        draf.simpan(entriBaru, "1")
        draf.simpan(entriBaru.copy(objek = "task-1"), "2")
        uid = "pic-2"
        draf.simpan(entriBaru, "3")
        draf.buangSemua("pic-1")
        assertEquals(listOf("pic-2"), dao.baris.values.map { it.uid })
        draf.sapuSelain("pic-3")
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun draf_lebih_tua_dari_14_hari_dibuang() = runBlocking {
        draf.simpan(entriBaru, "lama")
        jam += DrafSunting.MASA_SIMPAN_MS + 1
        assertNull(draf.ambil(entriBaru))
        assertTrue(dao.baris.isEmpty())
        // Simpan baru juga menyapu draf basi lain.
        jam = 0
        draf.simpan(entriBaru.copy(objek = "task-lama"), "lama")
        jam = DrafSunting.MASA_SIMPAN_MS + 10
        draf.simpan(entriBaru, "baru")
        assertEquals(listOf(DrafSunting.kunciBaris("pic-1", entriBaru)), dao.baris.keys.toList())
    }

    @Test
    fun galat_penyimpanan_tidak_dilempar_ke_layar() = runBlocking {
        dao.gagal = true
        draf.simpan(entriBaru, "x")
        assertNull(draf.ambil(entriBaru))
    }

    @Test
    fun kunci_baris_memuat_uid_jenis_objek_tanggal() {
        assertEquals(
            "u:pic-1|laporan-entri|baru:proyek-A|2026-10-13",
            DrafSunting.kunciBaris("pic-1", entriBaru),
        )
    }
}
