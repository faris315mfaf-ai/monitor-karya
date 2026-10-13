package id.co.monitorkarya.feature.audit

import id.co.monitorkarya.feature.audit.data.AksesDto
import id.co.monitorkarya.feature.audit.data.AkunTeknisDto
import id.co.monitorkarya.feature.audit.data.BukaKunciTeknisDto
import id.co.monitorkarya.feature.audit.data.CronDto
import id.co.monitorkarya.feature.audit.data.HitungMundurDto
import id.co.monitorkarya.feature.audit.data.KelompokPeranDto
import id.co.monitorkarya.feature.audit.data.KesiapanDto
import id.co.monitorkarya.feature.audit.data.NotifTeknisDto
import id.co.monitorkarya.feature.audit.data.PengajuanAksesDto
import id.co.monitorkarya.feature.audit.data.PengajuanAksesListDto
import id.co.monitorkarya.feature.audit.data.PenguncianDto
import id.co.monitorkarya.feature.audit.data.PeranListDto
import id.co.monitorkarya.feature.audit.data.PutusanAksesRequest
import id.co.monitorkarya.feature.audit.data.PutusanAksesResponse
import id.co.monitorkarya.feature.audit.data.SistemApi
import id.co.monitorkarya.feature.audit.data.SistemDto
import id.co.monitorkarya.feature.audit.data.TeknisDto
import id.co.monitorkarya.feature.audit.sistem.KesiapanServer
import id.co.monitorkarya.feature.audit.sistem.Muatan
import id.co.monitorkarya.feature.audit.sistem.Putusan
import id.co.monitorkarya.feature.audit.sistem.SistemAksesViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class SistemAksesViewModelTest {

    private val disp = StandardTestDispatcher()

    @Before
    fun pasang() = Dispatchers.setMain(disp)

    @After
    fun lepas() = Dispatchers.resetMain()

    private fun <T> galat(kode: Int, json: String): Response<T> =
        Response.error(kode, json.toResponseBody("application/json".toMediaType()))

    private fun pengajuan(id: String, type: String = "PINDAH_PERAN", status: String = "DIAJUKAN") = PengajuanAksesDto(
        id = id,
        type = type,
        status = status,
        title = "Permintaan $id",
        createdAt = "2026-10-13T03:00:00Z",
        canDecide = status == "DIAJUKAN",
    )

    private class ApiPalsu(
        var sistemJawab: () -> Response<SistemDto> = { Response.success(SistemDto()) },
        var aksesJawab: () -> Response<PengajuanAksesListDto>,
        var putusJawab: (PutusanAksesRequest) -> Response<PutusanAksesResponse> = { error("tidak dipanggil") },
        var kesiapanJawab: () -> Response<KesiapanDto> = { Response.success(KesiapanDto(true, "ready")) },
    ) : SistemApi {
        val putusan = mutableListOf<PutusanAksesRequest>()
        var muatAkses = 0
        var muatPeran = 0
        override suspend fun sistem() = sistemJawab()
        override suspend fun pengajuanAkses(status: String): Response<PengajuanAksesListDto> {
            muatAkses++
            return aksesJawab()
        }
        override suspend fun putuskan(body: PutusanAksesRequest): Response<PutusanAksesResponse> {
            putusan += body
            return putusJawab(body)
        }
        override suspend fun peran(): Response<PeranListDto> {
            muatPeran++
            return Response.success(PeranListDto(listOf(KelompokPeranDto("TI", "Tim TI"))))
        }
        override suspend fun kesiapan() = kesiapanJawab()
    }

    private fun daftar(vararg p: PengajuanAksesDto) =
        Response.success(PengajuanAksesListDto(items = p.toList(), pending = p.count { it.status == "DIAJUKAN" }, canDecide = true))

    @Test
    fun `muat awal mengisi sistem, antrean, dan kesiapan`() = runTest(disp) {
        val api = ApiPalsu(aksesJawab = { daftar(pengajuan("q1")) })
        val vm = SistemAksesViewModel(api)
        advanceUntilIdle()
        assertTrue(vm.sistem.value is Muatan.Siap)
        assertEquals(1, (vm.akses.value as Muatan.Siap).data.menunggu)
        assertEquals(KesiapanServer.SIAP, vm.kesiapan.value)
    }

    @Test
    fun `403 konsol tampil sebagai galat`() = runTest(disp) {
        val api = ApiPalsu(
            sistemJawab = { galat(403, """{"error":"Konsol sistem hanya untuk Tim TI dan Super Admin"}""") },
            aksesJawab = { daftar() },
            kesiapanJawab = { galat(503, """{"ok":false,"status":"unavailable"}""") },
        )
        val vm = SistemAksesViewModel(api)
        advanceUntilIdle()
        assertEquals("Konsol sistem hanya untuk Tim TI dan Super Admin", (vm.sistem.value as Muatan.Galat).pesan)
        assertEquals(KesiapanServer.MATI, vm.kesiapan.value)
    }

    @Test
    fun `putusan ditahan 5 detik lalu dikirim dan menggantikan item`() = runTest(disp) {
        val api = ApiPalsu(
            aksesJawab = { daftar(pengajuan("q1")) },
            putusJawab = { Response.success(PutusanAksesResponse(true, pengajuan("q1", status = "DISETUJUI"))) },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        val item = (vm.akses.value as Muatan.Siap).data.items.first()
        vm.putuskan(item, Putusan.SETUJUI)
        assertEquals(Putusan.SETUJUI, vm.lokal.value["q1"])
        assertEquals("q1", vm.pesan.value?.urungkanId)
        advanceTimeBy(SistemAksesViewModel.TAHAN_MS - 1)
        runCurrent()
        assertTrue(api.putusan.isEmpty())
        advanceUntilIdle()
        assertEquals(listOf(PutusanAksesRequest("q1", "approve")), api.putusan)
        val siap = (vm.akses.value as Muatan.Siap).data
        assertEquals("DISETUJUI", siap.items.first().status)
        assertEquals(0, siap.menunggu)
        assertFalse("q1" in vm.lokal.value)
    }

    @Test
    fun `urungkan membatalkan sebelum terkirim`() = runTest(disp) {
        val api = ApiPalsu(aksesJawab = { daftar(pengajuan("q1")) })
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        vm.putuskan((vm.akses.value as Muatan.Siap).data.items.first(), Putusan.TOLAK)
        advanceTimeBy(1_000)
        vm.urungkan("q1")
        advanceUntilIdle()
        assertTrue(api.putusan.isEmpty())
        assertTrue(vm.lokal.value.isEmpty())
    }

    @Test
    fun `409 sudah diputuskan memuat ulang antrean`() = runTest(disp) {
        val api = ApiPalsu(
            aksesJawab = { daftar(pengajuan("q1")) },
            putusJawab = { galat(409, """{"error":"Permintaan ini sudah diputuskan."}""") },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        val awal = api.muatAkses
        vm.putuskan((vm.akses.value as Muatan.Siap).data.items.first(), Putusan.TOLAK)
        advanceUntilIdle()
        assertEquals("Permintaan ini sudah diputuskan.", vm.pesan.value?.teks)
        assertEquals(awal + 1, api.muatAkses)
        assertTrue(vm.lokal.value.isEmpty())
    }

    @Test
    fun `akun baru disetujui mengarahkan aktivasi ke web`() = runTest(disp) {
        val api = ApiPalsu(
            aksesJawab = { daftar(pengajuan("q2", type = "AKUN_BARU")) },
            putusJawab = { Response.success(PutusanAksesResponse(true, pengajuan("q2", "AKUN_BARU", "DISETUJUI"))) },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        vm.putuskan((vm.akses.value as Muatan.Siap).data.items.first(), Putusan.SETUJUI)
        advanceUntilIdle()
        assertEquals(SistemAksesViewModel.PESAN_AKTIVASI, vm.pesan.value?.teks)
    }

    @Test
    fun `item yang tidak bisa diputuskan diabaikan`() = runTest(disp) {
        val api = ApiPalsu(aksesJawab = { daftar(pengajuan("q3", status = "DITOLAK")) })
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        vm.putuskan((vm.akses.value as Muatan.Siap).data.items.first(), Putusan.SETUJUI)
        advanceUntilIdle()
        assertTrue(api.putusan.isEmpty())
        assertTrue(vm.lokal.value.isEmpty())
    }

    @Test
    fun `direktori peran dimuat sekali`() = runTest(disp) {
        val api = ApiPalsu(aksesJawab = { daftar() })
        val vm = SistemAksesViewModel(api)
        advanceUntilIdle()
        vm.bukaPeran("TI")
        advanceUntilIdle()
        vm.tutupPeran()
        vm.bukaPeran("TI")
        advanceUntilIdle()
        assertEquals(1, api.muatPeran)
        assertEquals("TI", vm.peranTerbuka.value)
    }

    @Test
    fun `ringkasan kesehatan mengikuti web`() {
        val sehat = SistemDto(
            technical = TeknisDto(cron = listOf(CronDto(label = "Pengingat otomatis", health = "on"))),
            locking = PenguncianDto(dailyCutoff = "17.00 WIB", dailyCountdown = HitungMundurDto(2, 15), lockedToday = 3),
        )
        val r = SistemAksesViewModel.ringkas(sehat)
        assertTrue(r.sehat)
        assertEquals("Sistem sehat, tidak ada yang perlu ditangani.", r.kalimat)
        assertEquals("Kunci harian 17.00 WIB, 2 jam 15 menit lagi. 3 laporan terkunci hari ini.", r.dukungan)

        val sakit = SistemDto(
            technical = TeknisDto(
                unlocks = BukaKunciTeknisDto(waitingApproval = 1, waitingExecution = 2),
                cron = listOf(CronDto(label = "Pengingat otomatis", health = "late"), CronDto(label = "Pengingat divisi mingguan", health = "late")),
                accounts = AkunTeknisDto(),
                notifications = NotifTeknisDto(failed7d = 4),
            ),
            access = AksesDto(noPassword = 1),
            locking = PenguncianDto(dailyCutoff = "beragam per PT", dailyLocked = true),
        )
        val s = SistemAksesViewModel.ringkas(sakit)
        assertFalse(s.sehat)
        assertEquals(
            "4 hal perlu ditangani: pengingat otomatis dan pengingat divisi mingguan terlambat berjalan, 4 notifikasi gagal terkirim, " +
                "1 akun belum punya kata sandi, 2 buka kunci menunggu dibuka.",
            s.kalimat,
        )
        assertTrue(s.dukungan.startsWith("Kunci harian beragam per PT, hari ini sudah terkunci."))
        assertEquals(3, SistemAksesViewModel.bukaKunciMenunggu(sakit))
    }

    @Test
    fun `urutan antrean - menunggu dulu`() {
        val l = listOf(pengajuan("a", status = "DISETUJUI"), pengajuan("b"), pengajuan("c", status = "DITOLAK"), pengajuan("d"))
        assertEquals(listOf("b", "d", "a"), SistemAksesViewModel.urutAntrean(l, batas = 3).map { it.id })
    }

    @Test
    fun `pesanTampil dengan id tidak menghapus pesan yang lebih baru (C1-T3)`() = runTest(disp) {
        val api = ApiPalsu(aksesJawab = { daftar(pengajuan("q1"), pengajuan("q2")) })
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        val items = (vm.akses.value as Muatan.Siap).data.items
        vm.putuskan(items[0], Putusan.TOLAK)
        val lama = vm.pesan.value!!.id
        vm.urungkan("q1")
        vm.putuskan(items[1], Putusan.TOLAK)
        val baru = vm.pesan.value!!
        vm.pesanTampil(lama)
        assertEquals(baru, vm.pesan.value)
        vm.pesanTampil(baru.id)
        assertEquals(null, vm.pesan.value)
        vm.urungkan("q2")
    }

    // ---------------- E2E-3 B2: Urungkan tidak boleh menyentuh permintaan lain ----------------

    @Test
    fun `B2 - urungkan setelah 5 detik tidak menyetujui permintaan kedua`() = runTest(disp) {
        val api = ApiPalsu(
            aksesJawab = { daftar(pengajuan("q1"), pengajuan("q2")) },
            putusJawab = { b -> Response.success(PutusanAksesResponse(true, pengajuan(b.id, status = "DISETUJUI"))) },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        val q1 = (vm.akses.value as Muatan.Siap).data.tampil.first()
        assertEquals("q1", q1.id)
        vm.putuskan(q1, Putusan.SETUJUI)
        // Jendela Urungkan lewat (seperti E2E: ketuk Urungkan 5-7 detik kemudian).
        advanceTimeBy(SistemAksesViewModel.TAHAN_MS + 2_000)
        runCurrent()
        vm.urungkan("q1")
        advanceUntilIdle()

        // Hanya q1 yang dikirim; q2 tidak tersentuh.
        assertEquals(listOf(PutusanAksesRequest("q1", "approve")), api.putusan)
        val siap = (vm.akses.value as Muatan.Siap).data
        // Urutan baris tetap: q1 tetap di posisi pertama dengan status barunya,
        // sehingga Setujui milik q2 tidak bergeser ke bawah jari.
        assertEquals(listOf("q1", "q2"), siap.tampil.map { it.id })
        assertEquals("DISETUJUI", siap.tampil[0].status)
        assertEquals("DIAJUKAN", siap.tampil[1].status)
        assertEquals(SistemAksesViewModel.PESAN_TERLAMBAT_URUNG, vm.pesan.value?.teks)
    }

    @Test
    fun `B2 - urungkan dalam jendela hanya membatalkan permintaan itu`() = runTest(disp) {
        val api = ApiPalsu(
            aksesJawab = { daftar(pengajuan("q1"), pengajuan("q2")) },
            putusJawab = { b -> Response.success(PutusanAksesResponse(true, pengajuan(b.id, status = "DITOLAK"))) },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        val tampil = (vm.akses.value as Muatan.Siap).data.tampil
        vm.putuskan(tampil[0], Putusan.SETUJUI)
        vm.urungkan("q1")
        advanceUntilIdle()
        assertTrue(api.putusan.isEmpty())
        // Sesudah diurungkan, q2 bisa diputuskan dan hanya q2 yang dikirim.
        vm.putuskan(tampil[1], Putusan.TOLAK)
        advanceUntilIdle()
        assertEquals(listOf(PutusanAksesRequest("q2", "reject")), api.putusan)
        val siap = (vm.akses.value as Muatan.Siap).data
        assertEquals("DIAJUKAN", siap.tampil.first { it.id == "q1" }.status)
        assertEquals("DITOLAK", siap.tampil.first { it.id == "q2" }.status)
    }

    @Test
    fun `B2 - selama satu putusan berjalan baris lain tidak bisa diputuskan`() = runTest(disp) {
        val api = ApiPalsu(
            aksesJawab = { daftar(pengajuan("q1"), pengajuan("q2")) },
            putusJawab = { b -> Response.success(PutusanAksesResponse(true, pengajuan(b.id, status = "DISETUJUI"))) },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        val tampil = (vm.akses.value as Muatan.Siap).data.tampil
        vm.putuskan(tampil[0], Putusan.SETUJUI)
        assertTrue(vm.adaAksiBerjalan)
        vm.putuskan(tampil[1], Putusan.SETUJUI) // ketukan "tergeser" — diabaikan
        assertEquals(setOf("q1"), vm.lokal.value.keys)
        advanceUntilIdle()
        assertFalse(vm.adaAksiBerjalan)
        assertEquals(listOf(PutusanAksesRequest("q1", "approve")), api.putusan)
    }

    @Test
    fun `B2 - muat ulang sesudah 409 mempertahankan posisi baris`() = runTest(disp) {
        var panggil = 0
        val api = ApiPalsu(
            aksesJawab = {
                panggil++
                if (panggil == 1) {
                    daftar(pengajuan("q1"), pengajuan("q2"), pengajuan("q3"))
                } else {
                    // Server: q1 sudah diputus pihak lain, q4 permintaan baru.
                    daftar(pengajuan("q4"), pengajuan("q2"), pengajuan("q1", status = "DITOLAK"), pengajuan("q3"))
                }
            },
            putusJawab = { galat(409, """{"error":"Permintaan ini sudah diputuskan."}""") },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        vm.putuskan((vm.akses.value as Muatan.Siap).data.tampil.first(), Putusan.SETUJUI)
        advanceUntilIdle()
        val siap = (vm.akses.value as Muatan.Siap).data
        assertEquals(listOf("q1", "q2", "q3", "q4"), siap.tampil.map { it.id })
        assertEquals("DITOLAK", siap.tampil[0].status)
    }

    @Test
    fun `susunTampil tanpa urutan lama sama dengan urutAntrean`() {
        val l = listOf(pengajuan("a", status = "DISETUJUI"), pengajuan("b"))
        assertEquals(listOf("b", "a"), SistemAksesViewModel.susunTampil(l, null).map { it.id })
        assertEquals(listOf("a", "b"), SistemAksesViewModel.susunTampil(l, listOf("a", "b")).map { it.id })
    }

    @Test
    fun `meninggalkan layar mengirim putusan tertahan segera (C1-R3)`() = runTest(disp) {
        val api = ApiPalsu(
            aksesJawab = { daftar(pengajuan("q1")) },
            putusJawab = { Response.success(PutusanAksesResponse(true, pengajuan("q1", status = "DITOLAK"))) },
        )
        val vm = SistemAksesViewModel(api).apply { lingkupSusulan = this@runTest }
        advanceUntilIdle()
        vm.putuskan((vm.akses.value as Muatan.Siap).data.items.first(), Putusan.TOLAK)
        advanceTimeBy(500)
        vm.kirimTertahanSekarang()
        runCurrent()
        assertEquals(listOf(PutusanAksesRequest("q1", "reject")), api.putusan)
        // Tugas tertahan dibatalkan: tidak terkirim dua kali.
        advanceUntilIdle()
        assertEquals(1, api.putusan.size)
    }
}
