package id.co.monitorkarya.feature.persetujuan

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.dto.UndoRequest
import id.co.monitorkarya.core.network.dto.UndoResponse
import id.co.monitorkarya.core.network.mkJson
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class PersetujuanViewModelTest {

    private lateinit var api: FakePersetujuanApi
    private lateinit var undo: FakeUndoApi
    private lateinit var vm: PersetujuanViewModel

    @Before
    fun siapkan() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        api = FakePersetujuanApi()
        undo = FakeUndoApi()
        vm = PersetujuanViewModel(api, undo)
        vm.mulai(Peran.DIREKTUR_ENTITAS)
    }

    @After
    fun bersihkan() = Dispatchers.resetMain()

    private fun meja(): MejaPersetujuan = (vm.state.value as PersetujuanUiState.Siap).meja

    private val kunciAnggaran = ItemPersetujuan.kunci(JenisAntrean.PERMINTAAN, "ar1")
    private val kunciTenggat = ItemPersetujuan.kunci(JenisAntrean.TENGGAT, "dp1")
    private val kunciProyek = ItemPersetujuan.kunci(JenisAntrean.PROYEK, "p5")

    @Test
    fun `mulai - antrean dan riwayat termuat`() {
        assertEquals(4, meja().menunggu)
        assertEquals(1, vm.riwayat.value.items.size)
        assertNull(vm.riwayat.value.galat)
        vm.mulai(Peran.DIREKTUR_ENTITAS)
        assertEquals(1, api.panggilRingkasan)
    }

    @Test
    fun `galat ringkasan - Galat, riwayat gagal tidak menggagalkan antrean`() {
        api.ringkasanRes = galat(500, """{"error":"Ringkasan belum bisa disusun. Coba lagi."}""")
        vm.ulang()
        assertEquals(
            "Data belum termuat. Ringkasan belum bisa disusun. Coba lagi.",
            (vm.state.value as PersetujuanUiState.Galat).pesan,
        )
        api.ringkasanRes = Response.success(contohRingkasan())
        api.riwayatRes = galat(500, """{"error":"Persetujuan belum termuat. Coba lagi."}""")
        vm.ulang()
        assertTrue(vm.state.value is PersetujuanUiState.Siap)
        assertEquals("Persetujuan belum termuat. Coba lagi.", vm.riwayat.value.galat)
    }

    @Test
    fun `setujui permintaan - baris ditandai, snackbar Urungkan PATCH undo`() {
        vm.setujui(kunciAnggaran)
        assertEquals(KeputusanRequest("ar1", "approve"), api.patchPermintaan.single())
        assertEquals(Keputusan.DISETUJUI, meja().permintaan[0].keputusan)
        assertEquals(3, meja().menunggu)
        val n = vm.notifikasi.value!!
        assertEquals("Anggaran \"Revisi anggaran Renovasi Ruang IT\" disetujui.", n.pesan)
        assertEquals(TiketUrungkan.Patch(JenisAntrean.PERMINTAAN, "ar1"), n.urungkan)

        vm.urungkan()
        assertEquals(KeputusanRequest("ar1", "undo"), api.patchPermintaan.last())
        assertNull(meja().permintaan[0].keputusan)
        assertEquals("Keputusan diurungkan. Permintaan kembali menunggu.", vm.notifikasi.value?.pesan)
    }

    @Test
    fun `tolak - alasan wajib minimal 5 huruf`() {
        vm.mintaTolak(kunciTenggat)
        assertTrue(vm.detail.value!!.menolak)
        vm.ubahAlasan("ok")
        vm.tolak()
        assertTrue(api.patchTenggat.isEmpty())
        assertEquals("Tulis alasan penolakan, minimal 5 huruf.", vm.detail.value?.galat)

        vm.ubahAlasan("  Tenggat tetap karena kampanye.  ")
        vm.tolak()
        assertEquals(KeputusanRequest("dp1", "reject", "Tenggat tetap karena kampanye."), api.patchTenggat.single())
        assertNull(vm.detail.value)
        assertEquals(Keputusan.DITOLAK, meja().tenggat.single().keputusan)
        assertEquals("Usulan tenggat Aplikasi Absensi ditolak. PIC menerima alasannya.", vm.notifikasi.value?.pesan)
    }

    @Test
    fun `setujui proyek - undoToken dipakai lewat api undo`() {
        vm.setujui(kunciProyek)
        assertEquals(KeputusanProyekRequest("p5", "DISETUJUI"), api.postProyek.single())
        assertEquals(TiketUrungkan.Token(JenisAntrean.PROYEK, "p5", "t-9"), vm.notifikasi.value?.urungkan)
        vm.urungkan()
        assertEquals("t-9", undo.tiket.single())
        assertEquals("Keputusan diurungkan. Pengajuan kembali menunggu.", vm.notifikasi.value?.pesan)
    }

    @Test
    fun `403 - baris jadi baca saja, pesan di sheet`() {
        api.patchPermintaanRes = galat(403, """{"error":"Peran Anda tidak memutuskan permintaan ini"}""")
        vm.buka(kunciAnggaran)
        vm.setujui(kunciAnggaran)
        assertEquals("Peran Anda tidak memutuskan permintaan ini", vm.detail.value?.galat)
        assertFalse(meja().permintaan[0].bisaPutuskan)
        // Tidak dikirim ulang setelah izin dicabut.
        vm.setujui(kunciAnggaran)
        assertEquals(1, api.patchPermintaan.size)
    }

    @Test
    fun `409 - antrean dimuat ulang dan pesan tampil di snackbar`() {
        api.patchPermintaanRes = galat(409, """{"error":"Permintaan ini sudah diputuskan"}""")
        vm.setujui(kunciAnggaran)
        assertEquals("Permintaan ini sudah diputuskan", vm.notifikasi.value?.pesan)
        assertNull(vm.notifikasi.value?.urungkan)
        assertEquals(2, api.panggilRingkasan)
    }

    @Test
    fun `berkas - tautan bertanda tangan diteruskan ke layar`() {
        vm.bukaBerkas("ar1")
        assertEquals("https://storage.contoh/x?token=abc", vm.tautan.value?.url)
        vm.tautanTerbuka()
        assertNull(vm.tautan.value)

        api.berkasRes = galat(404, """{"error":"Berkas tidak ditemukan"}""")
        vm.bukaBerkas("ar1")
        assertNull(vm.tautan.value)
        assertEquals("Berkas tidak ditemukan", vm.notifikasi.value?.pesan)
    }

    // ------------------------------------------------------------ C1 regresi

    @Test
    fun `C1-S7 - izin dicabut 403 dipulihkan saat muat ulang`() {
        api.patchPermintaanRes = galat(403, """{"error":"Sekarang giliran Admin PT"}""")
        vm.setujui(kunciAnggaran)
        assertFalse(meja().permintaan[0].bisaPutuskan)
        vm.ulang()
        assertTrue(meja().permintaan[0].bisaPutuskan)
    }

    @Test
    fun `C1-R1 - tautan berkas non-https ditolak`() {
        api.berkasRes = Response.success(TautanBerkasResponse("javascript:alert(1)"))
        vm.bukaBerkas("ar1")
        assertNull(vm.tautan.value)
        assertEquals("Berkas belum bisa dibuka.", vm.notifikasi.value?.pesan)
        api.berkasRes = Response.success(TautanBerkasResponse("intent://x#Intent;end"))
        vm.bukaBerkas("ar1")
        assertNull(vm.tautan.value)
    }

    @Test
    fun `C1-R4 - urungkan per baris tidak tertimpa keputusan berikutnya`() {
        var sekarang = 1_000_000L
        vm.jam = { sekarang }
        vm.setujui(kunciAnggaran)
        vm.setujui(kunciTenggat)
        // Snackbar kini milik keputusan kedua, tetapi baris pertama tetap bisa diurungkan.
        assertEquals(TiketUrungkan.Patch(JenisAntrean.TENGGAT, "dp1"), vm.notifikasi.value?.urungkan)
        assertTrue(meja().permintaan[0].bisaUrungkan)
        vm.urungkanBaris(kunciAnggaran)
        assertEquals(KeputusanRequest("ar1", "undo"), api.patchPermintaan.last())
        assertNull(meja().permintaan[0].keputusan)
        // Sekali pakai.
        vm.urungkanBaris(kunciAnggaran)
        assertEquals(2, api.patchPermintaan.size)
        // Lewat 15 menit: tidak dikirim, pengguna diberi tahu.
        sekarang += 15 * 60 * 1000L
        vm.urungkanBaris(kunciTenggat)
        assertTrue(api.patchTenggat.none { it.action == "undo" })
        assertEquals("Batas urungkan 15 menit sudah lewat.", vm.notifikasi.value?.pesan)
        assertFalse(meja().tenggat.single().bisaUrungkan)
    }

    @Test
    fun `C1-R9 - kemarin mengikuti hari kalender WIB`() {
        val sekarang = java.time.Instant.parse("2026-10-13T01:00:00Z") // 08.00 WIB 13 Okt
        // 12 Okt 23.00 WIB = 9 jam lalu -> masih "jam lalu".
        assertEquals("9 jam lalu", waktuRelatif("2026-10-12T16:00:00Z", sekarang))
        // 11 Okt 23.00 WIB = 33 jam lalu, dua hari kalender -> "2 hari lalu" (dulu "Kemarin").
        assertEquals("2 hari lalu", waktuRelatif("2026-10-11T16:00:00Z", sekarang))
        // 12 Okt 07.00 WIB = 25 jam lalu -> "Kemarin".
        assertEquals("Kemarin", waktuRelatif("2026-10-12T00:00:00Z", sekarang))
        assertTrue(tautanAman("https://storage.contoh/x?token=abc"))
        assertFalse(tautanAman("http://storage.contoh/x"))
        assertFalse(tautanAman("https://user:pw@storage.contoh/x"))
        assertFalse(tautanAman("file:///data/x"))
    }

    // ------------------------------------------------------------ palsu

    private fun <T> galat(kode: Int, isi: String): Response<T> =
        Response.error(kode, isi.toResponseBody("application/json".toMediaType()))

    private fun contohRingkasan() =
        mkJson.decodeFromString(RingkasanPersetujuanResponse.serializer(), PersetujuanDtoTest.JSON_RINGKASAN)

    private inner class FakePersetujuanApi : PersetujuanApi {
        var panggilRingkasan = 0
        val patchPermintaan = mutableListOf<KeputusanRequest>()
        val patchTenggat = mutableListOf<KeputusanRequest>()
        val postProyek = mutableListOf<KeputusanProyekRequest>()
        var ringkasanRes: Response<RingkasanPersetujuanResponse> = Response.success(contohRingkasan())
        var riwayatRes: Response<DaftarPermintaanResponse> = Response.success(
            mkJson.decodeFromString(DaftarPermintaanResponse.serializer(), PersetujuanDtoTest.JSON_RIWAYAT),
        )
        var patchPermintaanRes: Response<KeputusanResponse> =
            Response.success(KeputusanResponse(ok = true, status = "DISETUJUI", undoMinutes = 15))
        var berkasRes: Response<TautanBerkasResponse> =
            Response.success(TautanBerkasResponse("https://storage.contoh/x?token=abc"))

        override suspend fun ringkasan(): Response<RingkasanPersetujuanResponse> {
            panggilRingkasan++
            return ringkasanRes
        }

        override suspend fun riwayat(decided: String): Response<DaftarPermintaanResponse> = riwayatRes

        override suspend fun putuskanPermintaan(body: KeputusanRequest): Response<KeputusanResponse> {
            patchPermintaan += body
            return if (body.action == KeputusanRequest.URUNGKAN) Response.success(KeputusanResponse(ok = true)) else patchPermintaanRes
        }

        override suspend fun tautanBerkas(id: String): Response<TautanBerkasResponse> = berkasRes

        override suspend fun putuskanTenggat(body: KeputusanRequest): Response<KeputusanResponse> {
            patchTenggat += body
            return Response.success(KeputusanResponse(ok = true))
        }

        override suspend fun putuskanProyek(body: KeputusanProyekRequest): Response<KeputusanProyekResponse> {
            postProyek += body
            return Response.success(KeputusanProyekResponse(ok = true, lifecycle = "DIUSULKAN", pending = "MANAJEMEN", undoToken = "t-9"))
        }
    }

    private class FakeUndoApi : UndoApi {
        val tiket = mutableListOf<String>()
        override suspend fun urungkan(body: UndoRequest): Response<UndoResponse> {
            tiket += body.token
            return Response.success(
                UndoResponse(ok = true, action = "APPROVE_PROJECT", targetType = "PROJECT", targetId = "p5", message = "Persetujuan diurungkan."),
            )
        }
    }
}
