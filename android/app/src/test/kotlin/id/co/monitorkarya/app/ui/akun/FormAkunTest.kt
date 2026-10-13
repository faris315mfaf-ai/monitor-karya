package id.co.monitorkarya.app.ui.akun

import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.dto.AkunBaruRequest
import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** BUG-03: logika murni wizard tambah/ubah akun (validasi, badan, galat, sandi). */
class FormAkunTest {

    private val boleh = setOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK")

    private fun formSah(peran: String = "ADMIN_PT") = FormAkun(peran = peran).denganNama("Rani Kusuma")

    // ---------------- Identitas ----------------

    @Test
    fun slug_username_mengikuti_slugify_web() {
        assertEquals("ranikusuma", slugUsername("Rani Kusuma"))
        assertEquals("josenunez", slugUsername("José Núñez"))
        assertEquals(24, slugUsername("a".repeat(40)).length)
    }

    @Test
    fun username_ikut_nama_sampai_disentuh() {
        val f = FormAkun().denganNama("Budi Santoso")
        assertEquals("budisantoso", f.username)
        val disentuh = f.denganUsername("Budi.S")
        assertEquals("budi.s", disentuh.username)
        assertEquals("budi.s", disentuh.denganNama("Budi Lain").username)
    }

    @Test
    fun galat_identitas_tiap_medan() {
        val kosong = galatLangkah(FormAkun(peran = "ADMIN_PT"), LangkahAkun.IDENTITAS, boleh).map { it.medan }
        assertTrue(MedanAkun.NAMA in kosong)
        assertTrue(MedanAkun.USERNAME in kosong)
        assertFalse("email kosong boleh saat membuat", MedanAkun.EMAIL in kosong)

        val salah = formSah().copy(email = "bukan-email", telepon = "12ab", jabatan = "x".repeat(121))
        val medan = galatLangkah(salah, LangkahAkun.IDENTITAS, boleh).map { it.medan }
        assertEquals(listOf(MedanAkun.EMAIL, MedanAkun.JABATAN, MedanAkun.TELEPON), medan)

        assertTrue(galatLangkah(formSah().copy(telepon = "+62 812-3456-789"), LangkahAkun.IDENTITAS, boleh).isEmpty())
        assertFalse(usernameSah("ab"))
        assertFalse(usernameSah("Rani"))
        assertTrue(usernameSah("rani.k_2"))
    }

    @Test
    fun email_wajib_saat_mengubah() {
        val ubah = formDariAkun(AkunBaris(id = "u1", nama = "Citra", username = "citra", email = null, peran = "PIC_PROYEK"))
        assertEquals(
            listOf(MedanAkun.EMAIL),
            galatLangkah(ubah, LangkahAkun.IDENTITAS, boleh).map { it.medan },
        )
    }

    // ---------------- Posisi ----------------

    @Test
    fun galat_posisi_peran_di_luar_wewenang_dan_nama_baru_kosong() {
        val direktur = formSah("DIREKTUR_ENTITAS")
        assertEquals(listOf(MedanAkun.PERAN), galatLangkah(direktur, LangkahAkun.POSISI, boleh).map { it.medan })

        val kadiv = formSah("KEPALA_DIVISI").copy(divisi = PILIH_BARU)
        assertEquals(listOf(MedanAkun.DIVISI_BARU), galatLangkah(kadiv, LangkahAkun.POSISI, boleh).map { it.medan })
        assertTrue(galatLangkah(kadiv.copy(namaDivisiBaru = "Keuangan"), LangkahAkun.POSISI, boleh).isEmpty())

        val pic = formSah("PIC_PROYEK").copy(proyek = PILIH_BARU)
        assertEquals(listOf(MedanAkun.PROYEK_BARU), galatLangkah(pic, LangkahAkun.POSISI, boleh).map { it.medan })
    }

    @Test
    fun ganti_peran_melepas_pilihan_divisi_proyek() {
        val f = formSah("KEPALA_DIVISI").copy(divisi = "d1").denganPeran("PIC_PROYEK")
        assertEquals("", f.divisi)
        assertEquals("PIC_PROYEK", f.peran)
    }

    @Test
    fun posisi_boleh_mengikuti_manageable_roles_dan_urutan_web() {
        assertEquals(listOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK"), posisiBoleh(setOf("PIC_PROYEK", "ADMIN_PT", "KEPALA_DIVISI")).map { it.peran })
        assertTrue(posisiBoleh(emptySet()).isEmpty())
    }

    // ---------------- Navigasi langkah ----------------

    @Test
    fun lanjut_menahan_langkah_bergalat_lalu_maju_bila_sah() {
        val awal = FormAkun(peran = "ADMIN_PT")
        val ditahan = lanjut(awal, boleh)
        assertEquals(LangkahAkun.IDENTITAS, ditahan.langkah)
        assertTrue(ditahan.tampilkanGalat())

        val maju = lanjut(formSah(), boleh)
        assertEquals(LangkahAkun.POSISI, maju.langkah)
        assertEquals(LangkahAkun.TINJAU, lanjut(maju, boleh).langkah)
        assertEquals(LangkahAkun.POSISI, kembali(lanjut(maju, boleh)).langkah)
        assertEquals(LangkahAkun.IDENTITAS, kembali(awal).langkah)
    }

    @Test
    fun langkah_salah_pertama() {
        assertEquals(LangkahAkun.IDENTITAS, langkahSalahPertama(FormAkun(peran = "ADMIN_PT"), boleh))
        assertEquals(LangkahAkun.POSISI, langkahSalahPertama(formSah(""), boleh))
        assertNull(langkahSalahPertama(formSah(), boleh))
    }

    // ---------------- Badan permintaan ----------------

    @Test
    fun badan_post_kepala_divisi_baru_dan_tanpa_null() {
        val f = formSah("KEPALA_DIVISI").copy(
            email = "  Rani@PT.co.id ",
            jabatan = " Kepala Keuangan ",
            divisi = PILIH_BARU,
            namaDivisiBaru = " Keuangan ",
            anggotaDivisi = "d9",
        )
        val req = keRequestBaru(f, sandi = "SandiAwal234", idPt = "pt1")
        assertEquals(
            AkunBaruRequest(
                name = "Rani Kusuma",
                role = "KEPALA_DIVISI",
                entityId = "pt1",
                username = "ranikusuma",
                email = "rani@pt.co.id",
                password = "SandiAwal234",
                title = "Kepala Keuangan",
                memberDivisionId = "d9",
                divisionName = "Keuangan",
            ),
            req,
        )
        val json = mkJson.parseToJsonElement(mkJson.encodeToString(AkunBaruRequest.serializer(), req)).jsonObject
        assertFalse("null tidak dikirim", "phone" in json || "divisionId" in json || "projectId" in json)
    }

    @Test
    fun badan_post_mengabaikan_tautan_posisi_lain_dan_email_kosong() {
        val f = formSah("PIC_PROYEK").copy(proyek = "p1", divisi = "d1")
        val req = keRequestBaru(f, sandi = "x".repeat(14), idPt = null)
        assertEquals("p1", req.projectId)
        assertNull(req.divisionId)
        assertNull(req.email)
        assertNull(req.entityId)
        assertNull(req.memberDivisionId)
    }

    @Test
    fun badan_patch_hanya_medan_berubah() {
        val asal = AkunBaris(
            id = "u2",
            nama = "Budi Santoso",
            username = "budi",
            email = "budi@pt.co.id",
            peran = "PIC_PROYEK",
            jabatan = "Staf",
            telepon = "0812345678",
        )
        val tanpaUbah = keRequestUbah(formDariAkun(asal), asal)
        assertFalse(adaPerubahan(tanpaUbah))

        val f = formDariAkun(asal).copy(jabatan = "", nama = "Budi S.").denganPeran("KEPALA_DIVISI").copy(divisi = "d1")
        val req = keRequestUbah(f, asal)
        assertTrue(adaPerubahan(req))
        assertEquals("u2", req.id)
        assertEquals("Budi S.", req.name)
        assertEquals("", req.title) // "" = kosongkan
        assertEquals("KEPALA_DIVISI", req.role)
        assertEquals("d1", req.divisionId)
        assertNull(req.username)
        assertNull(req.email)
        assertNull(req.phone)
        assertNull(req.password)
        assertNull(req.isActive)
    }

    // ---------------- Galat server ----------------

    private fun galatHttp(kode: Int, pesan: String): String =
        ApiError.dari(HttpException(Response.error<Any>(kode, """{"error":"$pesan"}""".toResponseBody()))).pesanTampil()

    @Test
    fun galat_422_username_dipakai_kembali_ke_identitas() {
        val pesan = galatHttp(422, "Username \\\"citra\\\" sudah dipakai.")
        assertEquals("Username \"citra\" sudah dipakai.", pesan)
        assertEquals(LangkahAkun.IDENTITAS, langkahUntukGalatServer(pesan))
        assertEquals(LangkahAkun.IDENTITAS, langkahUntukGalatServer("Email \"a@b.co\" sudah dipakai."))
        assertEquals(LangkahAkun.IDENTITAS, langkahUntukGalatServer("Nama pemegang posisi wajib diisi."))
    }

    @Test
    fun galat_409_dan_403_posisi() {
        val konflik = galatHttp(409, "Username sudah dipakai akun lain.")
        assertEquals(LangkahAkun.IDENTITAS, langkahUntukGalatServer(konflik))
        assertEquals(LangkahAkun.POSISI, langkahUntukGalatServer(galatHttp(422, "Divisi itu bukan divisi aktif di perusahaan akun ini.")))
        assertEquals(LangkahAkun.POSISI, langkahUntukGalatServer(galatHttp(403, "Posisi Direktur Perusahaan hanya dapat dikelola Super Admin.")))
        assertNull(langkahUntukGalatServer(galatHttp(500, "Gagal menambah akun. Coba lagi.")))
    }

    @Test
    fun galat_jaringan_dipetakan_ke_pesan_daring() {
        assertEquals(PESAN_AKUN_LURING, pesanGalatKirimAkun(java.io.IOException("putus")))
        assertEquals(
            "Username \"x\" sudah dipakai.",
            pesanGalatKirimAkun(HttpException(Response.error<Any>(422, """{"error":"Username \"x\" sudah dipakai."}""".toResponseBody()))),
        )
    }

    // ---------------- Sandi serah terima ----------------

    @Test
    fun sandi_serah_terima_tidak_bocor_lewat_tostring() {
        val sandi = Rahasia("SandiAwalRahasia9")
        val ui = WizardAkunUi(
            form = formSah(),
            sandi = sandi,
            hasil = HasilAkunBaru(idAkun = "u9", nama = "Rani", username = "rani", peran = "ADMIN_PT", sandi = sandi),
        )
        assertFalse(ui.toString().contains("SandiAwalRahasia9"))
        assertEquals("SandiAwalRahasia9", ui.hasil!!.sandi.nilai)
    }

    // ---------------- Parsing meja ----------------

    @Test
    fun parse_meja_membawa_pt_divisi_proyek_dan_telepon() {
        val root = mkJson.parseToJsonElement(
            """
            {"me":"u1","manageableRoles":["ADMIN_PT","KEPALA_DIVISI","PIC_PROYEK"],
             "companies":[{"id":"pt1","name":"PT Satu","type":"PT",
               "users":[{"id":"u2","name":"Budi","role":"KEPALA_DIVISI","phone":"0812","divisionName":"Keuangan"}],
               "divisions":[{"id":"d1","name":"Keuangan","headUserId":"u2","headName":"Budi"},{"id":"d2","name":"TI","headName":null}],
               "projects":[{"id":"p1","code":"PT-PRJ-01","name":"Jalan","picName":null}]}]}
            """.trimIndent(),
        ) as JsonObject
        val meja = (parseMeja(root) as AkunUiState.Siap).meja
        assertEquals("pt1", meja.idPt)
        assertEquals("PT", meja.tipePt)
        assertEquals(listOf(DivisiPt("d1", "Keuangan", "Budi"), DivisiPt("d2", "TI", null)), meja.divisi)
        assertEquals(listOf(ProyekPt("p1", "Jalan", null)), meja.proyek)
        assertEquals("0812", meja.akun.single().telepon)
        assertEquals("Keuangan", meja.akun.single().namaDivisiDipimpin)
    }
}
