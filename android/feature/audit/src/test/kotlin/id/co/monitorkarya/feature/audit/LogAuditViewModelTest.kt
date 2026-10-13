package id.co.monitorkarya.feature.audit

import id.co.monitorkarya.feature.audit.data.AktorDto
import id.co.monitorkarya.feature.audit.data.AuditLogApi
import id.co.monitorkarya.feature.audit.data.AuditLogDto
import id.co.monitorkarya.feature.audit.data.AuditLogListDto
import id.co.monitorkarya.feature.audit.log.LogAuditUiState
import id.co.monitorkarya.feature.audit.log.LogAuditViewModel
import id.co.monitorkarya.feature.audit.log.SaringanAudit
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.Headers.Companion.headersOf
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody
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
class LogAuditViewModelTest {

    private val disp = StandardTestDispatcher()

    @Before
    fun pasang() = Dispatchers.setMain(disp)

    @After
    fun lepas() = Dispatchers.resetMain()

    private data class Panggilan(
        val page: Int,
        val actorId: String?,
        val action: String?,
        val targetType: String?,
        val role: String?,
        val dateFrom: String?,
        val dateTo: String?,
    )

    private class ApiPalsu(
        var daftarJawab: (Int) -> Response<AuditLogListDto>,
        var eksporJawab: () -> Response<ResponseBody> = { error("tidak dipanggil") },
    ) : AuditLogApi {
        val panggilan = mutableListOf<Panggilan>()
        var eksporArg: Triple<String?, String?, String?>? = null

        override suspend fun daftar(
            page: Int,
            pageSize: Int,
            actorId: String?,
            action: String?,
            targetType: String?,
            role: String?,
            dateFrom: String?,
            dateTo: String?,
        ): Response<AuditLogListDto> {
            panggilan += Panggilan(page, actorId, action, targetType, role, dateFrom, dateTo)
            return daftarJawab(page)
        }

        override suspend fun ekspor(dateFrom: String?, dateTo: String?, action: String?): Response<ResponseBody> {
            eksporArg = Triple(dateFrom, dateTo, action)
            return eksporJawab()
        }
    }

    private fun log(id: String, nama: String? = "Rina") = AuditLogDto(
        id = id,
        actorId = nama?.let { "u-$id" },
        actor = nama?.let { AktorDto(id = "u-$id", name = it, email = "x@k.id", role = "TI") },
        action = "LOGIN",
        targetType = "USER",
        targetId = "t",
        at = "2026-10-13T04:55:00Z",
    )

    private fun halaman(page: Int, total: Int, vararg id: String) =
        Response.success(AuditLogListDto(items = id.map { log(it) }, total = total, page = page, pageSize = 20, canExport = true))

    private fun <T> galat(kode: Int, json: String): Response<T> =
        Response.error(kode, json.toResponseBody("application/json".toMediaType()))

    @Test
    fun `muat awal lalu muat lagi menambah tanpa duplikat`() = runTest(disp) {
        val api = ApiPalsu({ p -> if (p == 1) halaman(1, 3, "a", "b") else halaman(2, 3, "b", "c") })
        val vm = LogAuditViewModel(api)
        advanceUntilIdle()
        val s1 = vm.state.value as LogAuditUiState.Siap
        assertEquals(listOf("a", "b"), s1.items.map { it.id })
        assertTrue(s1.adaLagi)
        assertTrue(s1.bolehEkspor)

        vm.muatLagi()
        advanceUntilIdle()
        val s2 = vm.state.value as LogAuditUiState.Siap
        assertEquals(listOf("a", "b", "c"), s2.items.map { it.id })
        assertFalse(s2.adaLagi)
        assertEquals(2, api.panggilan.last().page)
    }

    @Test
    fun `saringan dikirim ke server dan tanggal terbalik ditukar`() = runTest(disp) {
        val api = ApiPalsu({ halaman(1, 0) })
        val vm = LogAuditViewModel(api)
        advanceUntilIdle()
        vm.terapkan(
            SaringanAudit(
                action = "LOGIN",
                targetType = "DAILY_REPORT",
                role = "AUDITOR",
                dari = LocalDate.of(2026, 10, 13),
                sampai = LocalDate.of(2026, 10, 1),
            ),
        )
        advanceUntilIdle()
        val p = api.panggilan.last()
        assertEquals(1, p.page)
        assertEquals("LOGIN", p.action)
        assertEquals("DAILY_REPORT", p.targetType)
        assertEquals("AUDITOR", p.role)
        assertEquals("2026-10-01", p.dateFrom)
        assertEquals("2026-10-13", p.dateTo)
        assertEquals(4, vm.saringan.value.jumlah)
    }

    @Test
    fun `saring pelaku dari rincian menutup sheet`() = runTest(disp) {
        val api = ApiPalsu({ halaman(1, 1, "a") })
        val vm = LogAuditViewModel(api)
        advanceUntilIdle()
        val l = (vm.state.value as LogAuditUiState.Siap).items.first()
        vm.buka(l)
        vm.saringPelaku(l)
        advanceUntilIdle()
        assertNull(vm.terbuka.value)
        assertEquals("u-a", api.panggilan.last().actorId)
        assertEquals("Rina", vm.saringan.value.actorNama)
        vm.hapusPelaku()
        advanceUntilIdle()
        assertNull(api.panggilan.last().actorId)
    }

    @Test
    fun `galat 400 server tampil apa adanya`() = runTest(disp) {
        val api = ApiPalsu({ galat(400, """{"error":"Format tanggal tidak valid"}""") })
        val vm = LogAuditViewModel(api)
        advanceUntilIdle()
        assertEquals("Format tanggal tidak valid", (vm.state.value as LogAuditUiState.Galat).pesan)
    }

    @Test
    fun `kalimat jawaban mengikuti web`() {
        val kini = Instant.parse("2026-10-13T05:00:00Z")
        val siap = LogAuditUiState.Siap(listOf(log("a")), total = 1234, halaman = 1, ukuranHalaman = 20, bolehEkspor = false)
        assertEquals(
            "1.234 aktivitas tercatat untuk saringan ini; terakhir oleh Rina, 5 menit lalu.",
            LogAuditViewModel.kalimatJawaban(siap, disaring = true, sekarang = kini),
        )
        val kosong = siap.copy(items = emptyList(), total = 0)
        assertEquals("Belum ada aktivitas yang tercatat.", LogAuditViewModel.kalimatJawaban(kosong, false, kini))
    }

    @Test
    fun `ekspor menulis CSV dan menyebut batas baris`() = runTest(disp) {
        val csv = "﻿Waktu (WIB),Pelaku\r\n2026-10-13 14:05:00,Rina\r\n"
        val api = ApiPalsu(
            { halaman(1, 0) },
            {
                Response.success(
                    csv.toResponseBody("text/csv".toMediaType()),
                    headersOf("X-Exported-Rows", "5000", "X-Total-Rows", "6000"),
                )
            },
        )
        val vm = LogAuditViewModel(api).apply { dispatcherIo = disp }
        advanceUntilIdle()
        vm.terapkan(SaringanAudit(action = "LOGIN", dari = LocalDate.of(2026, 10, 1), sampai = LocalDate.of(2026, 10, 13)))
        advanceUntilIdle()
        val keluar = ByteArrayOutputStream()
        var dihapus = false
        vm.ekspor(keluaran = { keluar }, hapus = { dihapus = true })
        advanceUntilIdle()
        assertEquals(csv, keluar.toString(Charsets.UTF_8.name()))
        assertFalse(dihapus)
        assertEquals(Triple("2026-10-01", "2026-10-13", "LOGIN"), api.eksporArg)
        assertEquals("5.000 dari 6.000 baris tersimpan (batas 5.000 terbaru).", vm.pesan.value?.teks)
        assertFalse(vm.mengekspor.value)
    }

    @Test
    fun `ekspor 429 membuang berkas dan memberi pesan tunggu`() = runTest(disp) {
        val api = ApiPalsu({ halaman(1, 0) }, { galat(429, """{"error":"Terlalu sering","retryAfter":120}""") })
        val vm = LogAuditViewModel(api).apply { dispatcherIo = disp }
        advanceUntilIdle()
        var dihapus = false
        vm.ekspor(keluaran = { ByteArrayOutputStream() }, hapus = { dihapus = true })
        advanceUntilIdle()
        assertTrue(dihapus)
        assertEquals("Terlalu banyak percobaan. Coba lagi dalam 2 menit.", vm.pesan.value?.teks)
    }

    @Test
    fun `catatan CSV menyebut saringan yang tidak ikut (C1-S6)`() {
        val tanggal = SaringanAudit(dari = LocalDate.of(2026, 10, 1), sampai = LocalDate.of(2026, 10, 13), action = "LOGIN")
        assertNull(LogAuditViewModel.catatanCsv(tanggal))
        val pelaku = tanggal.copy(actorId = "u1", actorNama = "Rina")
        assertTrue(LogAuditViewModel.catatanCsv(pelaku)!!.contains("pelaku"))
        val semuaWaktu = SaringanAudit(actorId = "u1")
        val c = LogAuditViewModel.catatanCsv(semuaWaktu)!!
        assertTrue(c.contains("30 hari"))
        assertTrue(c.contains("pelaku"))
        assertTrue(LogAuditViewModel.catatanCsv(SaringanAudit())!!.contains("30 hari"))
    }
}
