package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.core.network.api.EntriLaporanApi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.dto.EntriHariResponse
import id.co.monitorkarya.core.network.dto.EntriLaporanDto
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.EvidenceAttachResponse
import id.co.monitorkarya.core.network.dto.EvidenceDeleteResponse
import id.co.monitorkarya.core.network.dto.EvidenceLinkRequest
import id.co.monitorkarya.core.network.dto.EvidenceListResponse
import id.co.monitorkarya.core.network.dto.EvidenceUploadItemDto
import id.co.monitorkarya.core.network.dto.EvidenceUploadResponse
import id.co.monitorkarya.core.network.dto.EvidenceUrlResponse
import id.co.monitorkarya.core.network.dto.OkResponse
import id.co.monitorkarya.core.network.dto.PayloadHapusEntri
import id.co.monitorkarya.core.network.dto.PayloadUnggahBukti
import id.co.monitorkarya.core.network.dto.SubtaskInputDto
import id.co.monitorkarya.core.network.dto.TaskMovedResponse
import id.co.monitorkarya.core.network.dto.TaskMovesRequest
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import id.co.monitorkarya.core.network.dto.TaskSaveResponse
import id.co.monitorkarya.core.network.dto.TasksDayResponse
import id.co.monitorkarya.core.network.dto.TasksWeekResponse
import id.co.monitorkarya.core.network.mkJson
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

/**
 * B2 — outbox laporan harian PIC: payload entri UTUH (tanpa medan hilang),
 * FIFO per laporan dengan penggantian id lokal, 409/422 = GAGAL final yang
 * menahan penerus, unggah bukti dari folder privat + penyapu berkas.
 */
class OutboxEntriPicTest {

    private val kunci = KunciOutbox.laporanHarian("p-1", "2026-10-13")
    private val folder: File = Files.createTempDirectory("bukti-antre").toFile()
    private val berkas = BerkasAntre(folder)
    private val api = ApiPalsu()
    private val dao = FakeOutboxDao()
    private val peta = FakePetaIdDao()
    private val pengirim = PengirimLaporanPic(dao, api, api, api, berkas, peta)
    private val prosesor = OutboxProsesor(dao) { p -> pengirim.kirim(p) ?: HasilKirim.GagalPermanen("jenis asing") }

    @After
    fun bersih() {
        folder.deleteRecursively()
    }

    private fun entri(
        id: String? = null,
        projectId: String? = "p-1",
        workDate: String? = "2026-10-13",
        judul: String = "Pasang panel",
    ) = EntriSimpanRequest(
        context = "HARIAN",
        title = judul,
        description = "Segmen 3",
        picName = "Rani",
        status = "TERKENDALA",
        progressPct = 40,
        obstacle = "Hujan",
        decisionNeeded = "Tambah tenda",
        achievementToday = "Panel 1-4 terpasang",
        followUp = "Lanjut panel 5",
        needsEscalation = true,
        projectId = projectId,
        id = id,
        workDate = workDate,
        picUserId = "u-9",
        tags = listOf("listrik"),
        urgency = "TINGGI",
        startTime = "08:00",
        endTime = "11:30",
        subtasks = listOf(SubtaskInputDto("Kabel", true)),
    )

    private suspend fun antre(jenis: String, payload: String, label: String = jenis): Long =
        dao.tambah(OutboxEntity(jenis = jenis, payloadJson = payload, dibuatPada = System.currentTimeMillis(), kunci = kunci, label = label))

    private fun json(e: EntriSimpanRequest) = mkJson.encodeToString(EntriSimpanRequest.serializer(), e)

    @Test
    fun entriLuringTerkirimFifoDenganIdLokalDigantiDanMedanUtuh() = runBlocking {
        val idTambah = antre(JenisOutbox.TAMBAH_ENTRI, json(entri()))
        val lokal = IdLokal.dari(idTambah)
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = lokal, projectId = null, workDate = null, judul = "Pasang panel (revisi)")))
        val namaBerkas = berkas.simpan(byteArrayOf(1, 2, 3), "foto.jpg")
        antre(
            JenisOutbox.UNGGAH_BUKTI,
            mkJson.encodeToString(PayloadUnggahBukti.serializer(), PayloadUnggahBukti(lokal, namaBerkas, "foto.jpg", "image/jpeg", 3)),
        )
        antre(JenisOutbox.HAPUS_ENTRI, mkJson.encodeToString(PayloadHapusEntri.serializer(), PayloadHapusEntri("t-lama")))

        val r = prosesor.prosesAntrean()

        assertEquals(4, r.terkirim)
        assertEquals(listOf("POST", "PUT", "UPLOAD", "DELETE"), api.panggilan.map { it.first })
        // PUT memakai id server hasil POST, bukan id lokal.
        val put = api.badanUbah.single()
        assertEquals("t-baru", put.id)
        // Tidak ada medan entri yang hilang di perjalanan antrean.
        assertEquals(entri(id = "t-baru", projectId = null, workDate = null, judul = "Pasang panel (revisi)"), put)
        assertEquals(entri(), api.badanTambah.single())
        assertEquals("t-baru", api.unggahTarget.single())
        assertEquals("t-lama" to "HARIAN", api.hapusArg.single())
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun konflik409PadaTambahMenjadiGagalFinalDanMenahanPenerus() = runBlocking {
        api.kodeTambah = 409
        api.badanGalat = """{"error":"Laporan sudah diteruskan ke holding.","locked":true,"frozen":"FORWARDED"}"""
        val idTambah = antre(JenisOutbox.TAMBAH_ENTRI, json(entri()))
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = IdLokal.dari(idTambah), projectId = null, workDate = null)))
        antre(JenisOutbox.KIRIM_LAPORAN, "{}")

        val r = prosesor.prosesAntrean()

        assertEquals(1, r.gagalFinal)
        assertEquals(listOf("POST"), api.panggilan.map { it.first })
        val tambah = dao.baris.first()
        assertEquals(OutboxEntity.STATUS_GAGAL, tambah.status)
        assertEquals("Laporan sudah diteruskan ke holding.", tambah.pesanGalat)
        // Penerus tetap MENUNGGU, tidak dikirim, tidak ditimpa.
        assertTrue(dao.baris.drop(1).all { it.status == OutboxEntity.STATUS_MENUNGGU && it.percobaan == 0 })
        // Putaran berikutnya pun tidak melompati GAGAL final.
        prosesor.prosesAntrean()
        assertEquals(1, api.panggilan.size)
    }

    @Test
    fun validasi422PadaUbahMenjadiGagalDenganPesanServer() = runBlocking {
        api.kodeUbah = 422
        api.badanGalat = """{"error":"Judul task wajib diisi.","errors":["Judul task wajib diisi."]}"""
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = "t-1", projectId = null, workDate = null)))
        prosesor.prosesAntrean()
        val p = dao.baris.single()
        assertEquals(OutboxEntity.STATUS_GAGAL, p.status)
        assertEquals("Judul task wajib diisi.", p.pesanGalat)
    }

    @Test
    fun konflik409LockedFalseHanyaSementara() = runBlocking {
        api.kodeUbah = 409
        api.badanGalat = """{"error":"Laporan sedang disimpan bersamaan. Coba lagi.","locked":false}"""
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = "t-1", projectId = null, workDate = null)))
        val r = prosesor.prosesAntrean()
        assertEquals(1, r.gagalSementara)
        assertEquals(OutboxEntity.STATUS_MENUNGGU, dao.baris.single().status)
    }

    @Test
    fun idLokalTanpaPesanTambahGagalFinalTidakDikirim() = runBlocking {
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = IdLokal.dari(99), projectId = null, workDate = null)))
        prosesor.prosesAntrean()
        assertTrue(api.panggilan.isEmpty())
        assertEquals(PengirimLaporanPic.PESAN_ASAL_BELUM, dao.baris.single().pesanGalat)
    }

    @Test
    fun idLokalTidakMenimpaIdLokalLainBerawalanSama() = runBlocking {
        dao.tambah(OutboxEntity(jenis = "X", payloadJson = "{\"id\":\"lokal:12\",\"b\":\"lokal:1\"}", dibuatPada = 0, kunci = kunci))
        dao.gantiTeksPayload(kunci, IdLokal.kutip(IdLokal.dari(1)), IdLokal.kutip("srv"))
        assertEquals("{\"id\":\"lokal:12\",\"b\":\"srv\"}", dao.baris.single().payloadJson)
    }

    @Test
    fun berkasBuktiHilangGagalFinalDenganPesanJelas() = runBlocking {
        antre(
            JenisOutbox.UNGGAH_BUKTI,
            mkJson.encodeToString(PayloadUnggahBukti.serializer(), PayloadUnggahBukti("t-1", "tidak-ada.jpg", "a.jpg", "image/jpeg", 1)),
        )
        prosesor.prosesAntrean()
        assertEquals(OutboxEntity.STATUS_GAGAL, dao.baris.single().status)
        assertTrue(dao.baris.single().pesanGalat!!.contains("a.jpg"))
    }

    @Test
    fun penyapuMembuangBerkasYatimSajaDanMenolakJalur() = runBlocking {
        val dipakai = berkas.simpan(byteArrayOf(1), "a.jpg")
        val yatim = berkas.simpan(byteArrayOf(2), "b.pdf")
        antre(
            JenisOutbox.UNGGAH_BUKTI,
            mkJson.encodeToString(PayloadUnggahBukti.serializer(), PayloadUnggahBukti("t-1", dipakai, "a.jpg", "image/jpeg", 1)),
        )
        // Masa tenggang: berkas baru tidak disapu.
        assertEquals(0, pengirim.sapuBerkas())
        File(folder, yatim).setLastModified(System.currentTimeMillis() - BerkasAntre.MASA_TENGGANG_MS - 1000)
        File(folder, dipakai).setLastModified(System.currentTimeMillis() - BerkasAntre.MASA_TENGGANG_MS - 1000)
        assertEquals(1, pengirim.sapuBerkas())
        assertTrue(File(folder, dipakai).isFile)
        assertFalse(File(folder, yatim).exists())
        assertNull(berkas.berkas("../rahasia"))
        assertFalse(BerkasAntre.namaSah("a/b.jpg"))
    }

    // ------------------------------------------------------------------ C5-T1 peta id lokal

    @Test
    fun buktiUbahanDanHapusSesudahEntriTerkirimDiterjemahkanLewatPeta() = runBlocking {
        val idTambah = antre(JenisOutbox.TAMBAH_ENTRI, json(entri()))
        val lokal = IdLokal.dari(idTambah)
        prosesor.prosesAntrean()
        assertEquals("t-baru", peta.peta[lokal])
        assertTrue(dao.baris.isEmpty())

        // Sheet masih terbuka dengan id lokal: bukti + ubahan + hapus dibuat SESUDAH TAMBAH terkirim.
        val namaBerkas = berkas.simpan(byteArrayOf(7), "foto.jpg")
        antre(
            JenisOutbox.UNGGAH_BUKTI,
            mkJson.encodeToString(PayloadUnggahBukti.serializer(), PayloadUnggahBukti(lokal, namaBerkas, "foto.jpg", "image/jpeg", 1)),
        )
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = lokal, projectId = null, workDate = null, judul = "Revisi")))
        antre(JenisOutbox.HAPUS_ENTRI, mkJson.encodeToString(PayloadHapusEntri.serializer(), PayloadHapusEntri(lokal)))

        val r = prosesor.prosesAntrean()

        assertEquals(3, r.terkirim)
        assertEquals(0, r.gagalFinal)
        assertEquals(listOf("t-baru"), api.unggahTarget)
        assertEquals("t-baru", api.badanUbah.single().id)
        assertEquals("t-baru" to "HARIAN", api.hapusArg.single())
        assertTrue(dao.baris.isEmpty())
    }

    @Test
    fun idLokalYangTambahnyaMasihDiAntreanMenungguBukanGagalFinal() = runBlocking {
        // TAMBAH berkunci lain dan GAGAL (menunggu tindakan pengguna).
        val idTambah = dao.tambah(
            OutboxEntity(jenis = JenisOutbox.TAMBAH_ENTRI, payloadJson = json(entri()), dibuatPada = System.currentTimeMillis(), kunci = "laporan:lain", status = OutboxEntity.STATUS_GAGAL),
        )
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = IdLokal.dari(idTambah), projectId = null, workDate = null)))
        val r = prosesor.prosesAntrean()
        assertTrue(api.panggilan.isEmpty())
        assertEquals(1, r.gagalSementara)
        val ubah = dao.baris.last()
        assertEquals(OutboxEntity.STATUS_MENUNGGU, ubah.status)
        assertEquals(PengirimLaporanPic.PESAN_MENUNGGU_ASAL, ubah.pesanGalat)
    }

    @Test
    fun ulanganRingkasTanpaTaskMemakaiResourceIdSebagaiIdServer() = runBlocking {
        api.ringkas = true
        val idTambah = antre(JenisOutbox.TAMBAH_ENTRI, json(entri()))
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = IdLokal.dari(idTambah), projectId = null, workDate = null)))
        val r = prosesor.prosesAntrean()
        assertEquals(2, r.terkirim)
        assertEquals("t-ringkas", peta.peta[IdLokal.dari(idTambah)])
        assertEquals("t-ringkas", api.badanUbah.single().id)
    }

    @Test
    fun buangEntriLokalHanyaBilaTambahBelumPernahDicoba() = runBlocking {
        val pembuang = PembuangAntrean(dao, berkas)
        // Belum pernah dicoba: TAMBAH + penerus (ubah, bukti + berkasnya) terbuang, tanpa kiriman.
        val idTambah = antre(JenisOutbox.TAMBAH_ENTRI, json(entri()))
        val lokal = IdLokal.dari(idTambah)
        antre(JenisOutbox.UBAH_ENTRI, json(entri(id = lokal, projectId = null, workDate = null)))
        val namaBerkas = berkas.simpan(byteArrayOf(1), "a.jpg")
        antre(
            JenisOutbox.UNGGAH_BUKTI,
            mkJson.encodeToString(PayloadUnggahBukti.serializer(), PayloadUnggahBukti(lokal, namaBerkas, "a.jpg", "image/jpeg", 1)),
        )
        val lain = antre(JenisOutbox.KIRIM_LAPORAN, "{}")
        assertTrue(pembuang.buangBilaBelumDicoba(idTambah))
        assertEquals(listOf(lain), dao.baris.map { it.id })
        assertNull(berkas.berkas(namaBerkas))

        // Pernah dicoba (ambigu) atau sedang dikirim: TIDAK dibuang.
        val ambigu = antre(JenisOutbox.TAMBAH_ENTRI, json(entri()))
        dao.perbarui(ambigu, OutboxEntity.STATUS_MENUNGGU, "luring", 1, 0)
        assertFalse(pembuang.buangBilaBelumDicoba(ambigu))
        val terbang = antre(JenisOutbox.TAMBAH_ENTRI, json(entri()))
        assertEquals(1, dao.klaim(terbang))
        assertFalse(pembuang.buangBilaBelumDicoba(terbang))
        assertTrue(dao.baris.any { it.id == ambigu } && dao.baris.any { it.id == terbang })
        assertTrue(api.panggilan.isEmpty())
    }

    // ------------------------------------------------------------------ API palsu

    private class ApiPalsu : EntriLaporanApi, TasksApi, EvidenceApi {
        val panggilan = mutableListOf<Pair<String, String>>()
        val badanTambah = mutableListOf<EntriSimpanRequest>()
        val badanUbah = mutableListOf<EntriSimpanRequest>()
        val unggahTarget = mutableListOf<String>()
        val hapusArg = mutableListOf<Pair<String, String?>>()
        var kodeTambah = 200
        var kodeUbah = 200
        var badanGalat = "{}"

        /** C5-R3: jawab TAMBAH seperti ulangan berbadan besar yang diringkas server. */
        var ringkas = false

        private fun <T> galat(kode: Int): Response<T> =
            Response.error(kode, badanGalat.toResponseBody("application/json".toMediaType()))

        private fun dto(id: String, e: EntriSimpanRequest) = EntriLaporanDto(
            id = id,
            projectId = e.projectId ?: "p-1",
            workDate = "2026-10-12T17:00:00.000Z",
            title = e.title,
            status = e.status,
        )

        override suspend fun tambahEntri(body: EntriSimpanRequest, kunciIdempotensi: String?): Response<id.co.monitorkarya.core.network.dto.EntriSimpanResponse> {
            panggilan += "POST" to body.title
            if (kodeTambah != 200) return galat(kodeTambah)
            badanTambah += body
            if (ringkas) return Response.success(id.co.monitorkarya.core.network.dto.EntriSimpanResponse(ok = true, resourceId = "t-ringkas"))
            return Response.success(id.co.monitorkarya.core.network.dto.EntriSimpanResponse(ok = true, task = dto("t-baru", body)))
        }

        override suspend fun ubahEntri(body: EntriSimpanRequest, kunciIdempotensi: String?): Response<id.co.monitorkarya.core.network.dto.EntriSimpanResponse> {
            panggilan += "PUT" to (body.id ?: "")
            if (kodeUbah != 200) return galat(kodeUbah)
            badanUbah += body
            return Response.success(id.co.monitorkarya.core.network.dto.EntriSimpanResponse(ok = true, task = dto(body.id!!, body)))
        }

        override suspend fun hapus(id: String, konteks: String?, kunciIdempotensi: String?): Response<OkResponse> {
            panggilan += "DELETE" to id
            hapusArg += id to konteks
            return Response.success(OkResponse(ok = true))
        }

        override suspend fun unggah(
            berkas: MultipartBody.Part,
            targetType: RequestBody,
            targetId: RequestBody,
            label: RequestBody?,
            kunciIdempotensi: String?,
        ): Response<EvidenceUploadResponse> {
            val target = Buffer().also { targetId.writeTo(it) }.readUtf8()
            panggilan += "UPLOAD" to target
            unggahTarget += target
            return Response.success(
                EvidenceUploadResponse(ok = true, evidence = EvidenceUploadItemDto("e-1", "foto.jpg", "image/jpeg", 3, "k", null, "2026-10-13T00:00:00Z")),
            )
        }

        override suspend fun entriHari(projectId: String, tanggal: String?): Response<EntriHariResponse> = error("tak dipakai")
        override suspend fun perHari(projectId: String, tanggal: String?): Response<TasksDayResponse> = error("tak dipakai")
        override suspend fun perMingguan(projectId: String, minggu: String): Response<TasksWeekResponse> = error("tak dipakai")
        override suspend fun buat(body: TaskSaveRequest, kunciIdempotensi: String?): Response<TaskSaveResponse> = error("tak dipakai")
        override suspend fun ubah(body: TaskSaveRequest, kunciIdempotensi: String?): Response<TaskSaveResponse> = error("tak dipakai")
        override suspend fun pindah(body: TaskMovesRequest): Response<TaskMovedResponse> = error("tak dipakai")
        override suspend fun daftar(targetType: String, targetId: String): Response<EvidenceListResponse> = error("tak dipakai")
        override suspend fun tautan(body: EvidenceLinkRequest): Response<EvidenceAttachResponse> = error("tak dipakai")
        override suspend fun buka(id: String): Response<EvidenceUrlResponse> = error("tak dipakai")
        override suspend fun hapus(id: String): Response<EvidenceDeleteResponse> = error("tak dipakai")
    }
}
