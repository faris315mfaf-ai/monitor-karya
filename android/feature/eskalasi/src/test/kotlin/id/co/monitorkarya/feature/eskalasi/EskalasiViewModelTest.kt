package id.co.monitorkarya.feature.eskalasi

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.dto.UndoRequest
import id.co.monitorkarya.core.network.dto.UndoResponse
import id.co.monitorkarya.core.network.mkJson
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class EskalasiViewModelTest {

    private lateinit var api: FakeEskalasiApi
    private lateinit var undo: FakeUndoApi
    private lateinit var vm: EskalasiViewModel

    @Before
    fun siapkan() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        api = FakeEskalasiApi()
        undo = FakeUndoApi()
        vm = EskalasiViewModel(api, undo)
    }

    @After
    fun bersihkan() = Dispatchers.resetMain()

    private fun siap(): PapanEskalasi = (vm.state.value as EskalasiUiState.Siap).papan

    @Test
    fun `mulai - memuat papan dengan izin dari perms server`() {
        vm.mulai(Peran.MANAJEMEN)
        val papan = siap()
        assertEquals(2, papan.items.size)
        assertTrue(papan.items[0].izin.putuskan)
        assertTrue(papan.items[1].izin.tutup)
        assertEquals(1, api.panggilDaftar.size)
    }

    @Test
    fun `saringan - diteruskan sebagai query server`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.pilihStatus(StatusEskalasi.DITINJAU)
        vm.pilihKebutuhan(KebutuhanEskalasi.ANGGARAN)
        vm.alihLewatSla()
        assertEquals(Triple("DITINJAU", "ANGGARAN", "true"), api.panggilDaftar.last())
        vm.hapusSaringan()
        assertEquals(Triple(null, null, null), api.panggilDaftar.last())
    }

    @Test
    fun `galat muat - Galat dengan pesan server`() {
        api.daftarRes = galat(500, """{"error":"Eskalasi belum termuat. Coba lagi."}""")
        vm.mulai(Peran.MANAJEMEN)
        val s = vm.state.value
        assertTrue(s is EskalasiUiState.Galat)
        assertEquals("Papan eskalasi belum termuat. Eskalasi belum termuat. Coba lagi.", (s as EskalasiUiState.Galat).pesan)
    }

    @Test
    fun `tinjau sukses - sheet tertutup, snackbar dengan Urungkan`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        vm.tinjau()
        assertEquals(AksiEskalasiRequest.tinjau("cmesc1"), api.panggilAksi.single())
        assertNull(vm.detail.value)
        val n = vm.notifikasi.value!!
        assertEquals("Eskalasi ditandai sudah ditinjau.", n.pesan)
        assertEquals("tiket-123", n.undoToken)
        assertEquals(2, api.panggilDaftar.size)

        vm.urungkan()
        assertEquals("tiket-123", undo.tiket.single())
        assertEquals("Peninjauan eskalasi diurungkan.", vm.notifikasi.value?.pesan)
        assertNull(vm.notifikasi.value?.undoToken)
    }

    @Test
    fun `putuskan - validasi lokal 10 karakter lalu kirim`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        vm.mulaiPutuskan()
        vm.ubahKeputusan("Oke")
        vm.simpanKeputusan()
        assertTrue(api.panggilAksi.isEmpty())
        assertNotNull(vm.detail.value?.galat)

        vm.ubahKeputusan("  Setujui anggaran memori server.  ")
        vm.simpanKeputusan()
        assertEquals(AksiEskalasiRequest.putuskan("cmesc1", "Setujui anggaran memori server."), api.panggilAksi.single())
    }

    @Test
    fun `403 - tombol aksi disembunyikan dan pesan tampil di sheet`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        api.aksiRes = galat(403, """{"error":"Eskalasi ini di luar cakupan Anda"}""")
        vm.tinjau()
        val d = vm.detail.value!!
        assertEquals("Eskalasi ini di luar cakupan Anda", d.galat)
        assertFalse(d.item.izin.tinjau)
        assertTrue(d.item.izin.putuskan)
        assertNull(d.sibuk)
    }

    @Test
    fun `409 - papan dimuat ulang, pesan konflik di sheet`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        api.aksiRes = galat(409, """{"error":"Eskalasi ini sudah melewati tahap peninjauan"}""")
        vm.tinjau()
        assertEquals("Eskalasi ini sudah melewati tahap peninjauan", vm.detail.value?.galat)
        assertEquals(2, api.panggilDaftar.size)
    }

    @Test
    fun `izin - perms server dipakai apa adanya, peran sesi tidak dipakai menebak`() {
        // Peran PIC dengan perms server "boleh menutup" (pengaju): tombol tutup tampil.
        api.daftarRes = Response.success(
            mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), EskalasiDtoTest.JSON_DAFTAR),
        )
        vm.mulai(Peran.PIC_PROYEK)
        val papan = siap()
        assertEquals(IzinAksi(tinjau = true, putuskan = true), papan.items[0].izin)
        assertEquals(IzinAksi(tutup = true), papan.items[1].izin)
    }

    @Test
    fun `izin - server lama tanpa perms membuat papan baca saja`() {
        api.daftarRes = Response.success(
            mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), EskalasiDtoTest.JSON_DAFTAR_TANPA_PERMS),
        )
        vm.mulai(Peran.MANAJEMEN)
        val papan = siap()
        assertEquals(2, papan.items.size)
        assertTrue(papan.items.none { it.izin.ada })
        assertEquals("1 lewat SLA. 1 sudah diputuskan dan menunggu ditutup.", papan.dukungan)
    }

    // ------------------------------------------------------------ regresi C2

    private val daftarTanpaEsc1: Response<EskalasiDaftarResponse>
        get() {
            val penuh = mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), EskalasiDtoTest.JSON_DAFTAR)
            return Response.success(penuh.copy(items = penuh.items.filter { it.id != "cmesc1" }, total = 1))
        }

    @Test
    fun `S5 - sheet boleh ditutup selama aksi, galat masuk snackbar`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        val gerbang = CompletableDeferred<Unit>().also { api.gerbang = it }
        api.aksiRes = galat(500, """{"error":"Server sedang sibuk."}""")
        vm.tinjau()
        assertEquals(AksiEskalasi.TINJAU, vm.detail.value?.sibuk)
        vm.tutupSheet()
        assertNull(vm.detail.value)
        gerbang.complete(Unit)
        assertNull(vm.detail.value)
        assertEquals("Server sedang sibuk.", vm.notifikasi.value?.pesan)
    }

    @Test
    fun `S5 - sukses aksi tidak menutup sheet eskalasi lain yang dibuka sesudahnya`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        val gerbang = CompletableDeferred<Unit>().also { api.gerbang = it }
        vm.tinjau()
        vm.tutupSheet()
        vm.buka("cmesc2")
        gerbang.complete(Unit)
        assertEquals("cmesc2", vm.detail.value?.item?.id)
        assertEquals("Eskalasi ditandai sudah ditinjau.", vm.notifikasi.value?.pesan)
    }

    @Test
    fun `S5 - sheet dibuka ulang selama aksi tetap terkunci, tidak ada kiriman ganda`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        val gerbang = CompletableDeferred<Unit>().also { api.gerbang = it }
        vm.tinjau()
        vm.tutupSheet()
        vm.buka("cmesc1")
        assertEquals(AksiEskalasi.TINJAU, vm.detail.value?.sibuk)
        vm.tinjau()
        assertEquals(1, api.panggilAksi.size)
        gerbang.complete(Unit)
    }

    @Test
    fun `S6 - 409 menutup mode Putuskan`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        vm.mulaiPutuskan()
        vm.ubahKeputusan("Setujui anggaran memori server.")
        api.aksiRes = galat(409, """{"error":"Eskalasi ini sudah diputuskan"}""")
        vm.simpanKeputusan()
        val d = vm.detail.value!!
        assertFalse(d.memutuskan)
        assertEquals("Eskalasi ini sudah diputuskan", d.galat)
        assertNull(d.sibuk)
    }

    @Test
    fun `S6 - 403 putuskan menutup mode Putuskan dan menyembunyikan tombolnya`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        vm.mulaiPutuskan()
        vm.ubahKeputusan("Setujui anggaran memori server.")
        api.aksiRes = galat(403, """{"error":"Hanya Manajemen yang memutuskan"}""")
        vm.simpanKeputusan()
        val d = vm.detail.value!!
        assertFalse(d.memutuskan)
        assertFalse(d.item.izin.putuskan)
        // Mode Putuskan tidak bisa dibuka lagi tanpa izin.
        vm.mulaiPutuskan()
        assertFalse(vm.detail.value!!.memutuskan)
    }

    @Test
    fun `S6 - 409 dan eskalasi keluar dari daftar menutup sheet, pesan di snackbar`() {
        vm.mulai(Peran.MANAJEMEN)
        vm.buka("cmesc1")
        vm.mulaiPutuskan()
        vm.ubahKeputusan("Setujui anggaran memori server.")
        api.aksiRes = galat(409, """{"error":"Eskalasi ini sudah diputuskan"}""")
        api.daftarRes = daftarTanpaEsc1
        vm.simpanKeputusan()
        assertNull(vm.detail.value)
        assertEquals("Eskalasi ini sudah diputuskan", vm.notifikasi.value?.pesan)
    }

    // ------------------------------------------------------------ palsu

    private fun <T> galat(kode: Int, isi: String): Response<T> =
        Response.error(kode, isi.toResponseBody("application/json".toMediaType()))

    private class FakeEskalasiApi : EskalasiApi {
        val panggilDaftar = mutableListOf<Triple<String?, String?, String?>>()
        val panggilAksi = mutableListOf<AksiEskalasiRequest>()
        var daftarRes: Response<EskalasiDaftarResponse> =
            Response.success(mkJson.decodeFromString(EskalasiDaftarResponse.serializer(), EskalasiDtoTest.JSON_DAFTAR))
        var aksiRes: Response<AksiEskalasiResponse> =
            Response.success(mkJson.decodeFromString(AksiEskalasiResponse.serializer(), EskalasiDtoTest.JSON_AKSI))

        override suspend fun daftar(
            page: Int,
            pageSize: Int,
            status: String?,
            needed: String?,
            overdue: String?,
        ): Response<EskalasiDaftarResponse> {
            panggilDaftar += Triple(status, needed, overdue)
            return daftarRes
        }

        /** Bila diisi, aksi menunggu sampai gerbang dibuka (uji Sheet ditutup selama aksi). */
        var gerbang: CompletableDeferred<Unit>? = null

        override suspend fun aksi(body: AksiEskalasiRequest): Response<AksiEskalasiResponse> {
            panggilAksi += body
            gerbang?.await()
            return aksiRes
        }
    }

    private class FakeUndoApi : UndoApi {
        val tiket = mutableListOf<String>()
        override suspend fun urungkan(body: UndoRequest): Response<UndoResponse> {
            tiket += body.token
            return Response.success(
                UndoResponse(ok = true, action = "REVIEW_ESCALATION", targetType = "ESCALATION", targetId = "cmesc1", message = "Peninjauan eskalasi diurungkan."),
            )
        }
    }
}
