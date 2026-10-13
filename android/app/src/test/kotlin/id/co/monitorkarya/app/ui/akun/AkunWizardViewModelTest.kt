package id.co.monitorkarya.app.ui.akun

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import id.co.monitorkarya.core.network.mkJson
import java.util.concurrent.AbstractExecutorService
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Dispatcher
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit

/**
 * BUG-03/BUG-12: alur ViewModel wizard tambah akun lewat Retrofit sungguhan
 * dengan OkHttp sinkron (interceptor palsu, eksekutor langsung) — tanpa server.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AkunWizardViewModelTest {

    private val penjadwal = StandardTestDispatcher()

    /** Eksekutor yang menjalankan panggilan di utas pemanggil (enqueue jadi sinkron). */
    private class EksekutorLangsung : AbstractExecutorService() {
        override fun execute(command: Runnable) = command.run()
        override fun shutdown() = Unit
        override fun shutdownNow(): MutableList<Runnable> = mutableListOf()
        override fun isShutdown(): Boolean = false
        override fun isTerminated(): Boolean = false
        override fun awaitTermination(timeout: Long, unit: TimeUnit): Boolean = true
    }

    private val permintaan = mutableListOf<Pair<String, String>>()
    private var jawabPost: (Request) -> Response = { ok(it, """{"ok":true,"account":{"id":"u9","name":"Rani Kusuma","username":"ranikusuma","role":"ADMIN_PT"}}""") }
    private var jumlahGet = 0

    private fun ok(req: Request, badan: String, kode: Int = 200) = Response.Builder()
        .request(req)
        .protocol(Protocol.HTTP_1_1)
        .code(kode)
        .message("x")
        .body(badan.toResponseBody("application/json".toMediaType()))
        .build()

    private fun buatVm(): AkunViewModel {
        val klien = OkHttpClient.Builder()
            .dispatcher(Dispatcher(EksekutorLangsung()))
            .addInterceptor { chain ->
                val req = chain.request()
                val badan = req.body?.let { b -> Buffer().also { b.writeTo(it) }.readUtf8() }.orEmpty()
                permintaan += "${req.method} ${req.url.encodedPath}" to badan
                when {
                    req.method == "GET" && req.url.encodedPath == "/api/companies" -> {
                        jumlahGet++
                        ok(req, JSON_MEJA)
                    }
                    req.method == "POST" -> jawabPost(req)
                    else -> ok(req, "{}", 404)
                }
            }
            .build()
        val retrofit = Retrofit.Builder()
            .baseUrl("http://uji.local/")
            .client(klien)
            .addConverterFactory(mkJson.asConverterFactory("application/json".toMediaType()))
            .build()
        return AkunViewModel(retrofit)
    }

    @Before
    fun siapkan() = Dispatchers.setMain(penjadwal)

    @After
    fun bersihkan() = Dispatchers.resetMain()

    private fun AkunViewModel.isiSah() {
        ubahFormAkun { it.denganNama("Rani Kusuma") }
        lanjutWizard()
        lanjutWizard()
    }

    @Test
    fun buat_akun_mengirim_sandi_yang_lalu_diserahkan_dan_memuat_ulang() = runTest(penjadwal) {
        val vm = buatVm()
        advanceUntilIdle()
        vm.bukaTambahAkun()
        val sandiAwal = vm.wizard!!.sandi!!.nilai
        assertEquals(PANJANG_SANDI_ACAK, sandiAwal.length)
        vm.isiSah()
        assertEquals(LangkahAkun.TINJAU, vm.wizard!!.form.langkah)
        val getSebelum = jumlahGet

        vm.kirimWizard(luring = false)
        assertTrue(vm.wizard!!.sibuk)
        vm.kirimWizard(luring = false) // klik ganda diabaikan
        advanceUntilIdle()

        val post = permintaan.filter { it.first == "POST /api/companies/users" }
        assertEquals(1, post.size)
        val badan = mkJson.parseToJsonElement(post.single().second) as JsonObject
        assertEquals(sandiAwal, badan["password"]!!.jsonPrimitive.content)
        assertEquals("pt1", badan["entityId"]!!.jsonPrimitive.content)
        assertEquals("ranikusuma", badan["username"]!!.jsonPrimitive.content)

        val hasil = vm.wizard!!.hasil
        assertNotNull(hasil)
        assertEquals(sandiAwal, hasil!!.sandi.nilai)
        assertEquals("u9", hasil.idAkun)
        assertTrue("daftar dimuat ulang", jumlahGet > getSebelum)

        vm.tutupWizard()
        assertNull(vm.wizard)
    }

    @Test
    fun galat_422_tampil_dan_kembali_ke_identitas_dengan_sandi_sama() = runTest(penjadwal) {
        jawabPost = { ok(it, """{"error":"Username \"ranikusuma\" sudah dipakai."}""", 422) }
        val vm = buatVm()
        advanceUntilIdle()
        vm.bukaTambahAkun()
        val sandiAwal = vm.wizard!!.sandi!!.nilai
        vm.isiSah()
        vm.kirimWizard(luring = false)
        advanceUntilIdle()

        val w = vm.wizard!!
        assertEquals("Username \"ranikusuma\" sudah dipakai.", w.galat)
        assertEquals(LangkahAkun.IDENTITAS, w.form.langkah)
        assertEquals(false, w.sibuk)
        assertNull(w.hasil)
        assertEquals("sandi tidak diacak ulang", sandiAwal, w.sandi!!.nilai)

        // Mengubah isian membuang galat server lama.
        vm.ubahFormAkun { it.denganUsername("rani.k") }
        assertNull(vm.wizard!!.galat)
    }

    @Test
    fun luring_ditolak_tanpa_permintaan() = runTest(penjadwal) {
        val vm = buatVm()
        advanceUntilIdle()
        vm.bukaTambahAkun()
        vm.isiSah()
        vm.kirimWizard(luring = true)
        assertEquals(PESAN_AKUN_LURING, vm.wizard!!.galat)
        assertTrue(permintaan.none { it.first.startsWith("POST") })
        assertNull(vm.wizard!!.hasil)
    }

    @Test
    fun kirim_dengan_langkah_bergalat_lompat_ke_langkahnya() = runTest(penjadwal) {
        val vm = buatVm()
        advanceUntilIdle()
        vm.bukaTambahAkun()
        vm.kirimWizard(luring = false)
        assertEquals(LangkahAkun.IDENTITAS, vm.wizard!!.form.langkah)
        assertTrue(vm.wizard!!.form.tampilkanGalat())
        assertTrue(permintaan.none { it.first.startsWith("POST") })
    }

    @Test
    fun saat_tampil_lagi_memuat_ulang_daftar() = runTest(penjadwal) {
        val vm = buatVm()
        vm.saatTampil() // muat init masih berjalan: tidak dobel
        advanceUntilIdle()
        assertEquals(1, jumlahGet)
        vm.saatTampil()
        advanceUntilIdle()
        assertEquals(2, jumlahGet)
        assertTrue(vm.state.value is AkunUiState.Siap)
    }

    private companion object {
        const val JSON_MEJA = """
            {"me":"u1","manageableRoles":["ADMIN_PT","KEPALA_DIVISI","PIC_PROYEK"],
             "companies":[{"id":"pt1","name":"PT Satu","type":"PT",
               "users":[{"id":"u1","name":"Admin","role":"ADMIN_PT"}],
               "divisions":[],"projects":[]}]}
        """
    }
}
