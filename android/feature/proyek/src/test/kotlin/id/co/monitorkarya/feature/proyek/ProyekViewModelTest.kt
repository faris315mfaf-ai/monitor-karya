package id.co.monitorkarya.feature.proyek

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import id.co.monitorkarya.core.network.MkProfilStore
import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.feature.proyek.data.ProyekApi
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.ui.AksiUrungkan
import id.co.monitorkarya.feature.proyek.ui.BATAS_CATATAN_KEPUTUSAN
import id.co.monitorkarya.feature.proyek.ui.PESAN_AJUKAN_ULANG_TAK_TERCATAT
import id.co.monitorkarya.feature.proyek.ui.PESAN_SIMPAN_BERJALAN
import id.co.monitorkarya.feature.proyek.ui.Bagian
import id.co.monitorkarya.feature.proyek.ui.Konfirmasi
import id.co.monitorkarya.feature.proyek.ui.Muat
import id.co.monitorkarya.feature.proyek.ui.ProyekViewModel
import java.net.InetAddress
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * ViewModel tab Proyek dengan Retrofit nyata di atas MockWebServer: jalur
 * permintaan, badan JSON, dan pemetaan 401/403/409/422 lewat ApiError ikut diuji.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProyekViewModelTest {

    private lateinit var server: MockWebServer
    private lateinit var api: ProyekApi

    /** Jawaban per "METODE path" (path tanpa query) — boleh ditimpa per tes. */
    private val jawaban = ConcurrentHashMap<String, Pair<Int, String>>()
    private val tercatat = CopyOnWriteArrayList<RecordedRequest>()

    /** Gerbang per kunci: jawaban ditahan sampai gerbang dibuka (uji balapan). */
    private val tahan = ConcurrentHashMap<String, CountDownLatch>()

    private val profil = object : MkProfilStore {
        override fun simpan(pengguna: PeranPengguna) = Unit
        override fun baca(): PeranPengguna = PeranPengguna("u-dir", "Dewi Direktur", "dewi@contoh.id", Peran.DIREKTUR_ENTITAS, null)
        override fun hapus() = Unit
    }

    @Before
    fun siapkan() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                tercatat += request
                val path = request.requestUrl!!.encodedPath
                val kunci = when {
                    request.method == "GET" && request.requestUrl!!.queryParameter("options") == "1" -> "GET opsi"
                    request.method == "GET" && path == "/api/projects" && request.requestUrl!!.queryParameter("page") == "2" -> "GET /api/projects#2"
                    else -> "${request.method} $path"
                }
                tahan[kunci]?.await(5, TimeUnit.SECONDS)
                val (kode, badan) = jawaban[kunci] ?: (404 to """{"error":"Tidak ada fixture untuk $kunci"}""")
                return MockResponse().setResponseCode(kode).setHeader("Content-Type", "application/json").setBody(badan)
            }
        }
        // G3: ikat dan alamatkan IPv4 literal. "localhost" diresolusi OkHttp ke ::1
        // lebih dulu (fast fallback); bila proses lain (mis. emulator qemu) kebetulan
        // mendengar di [::1] dengan nomor port yang sama, permintaan masuk ke sana
        // dan menggantung sampai batas waktu tes.
        server.start(InetAddress.getByName("127.0.0.1"), 0)
        api = buatApi(OkHttpClient(), "http://127.0.0.1:${server.port}/", ProyekApi::class.java)
        jawaban["GET /api/projects"] = 200 to Fixture.daftar(Fixture.proyek("p1", manage = true, setLifecycle = true))
        jawaban["GET opsi"] = 200 to Fixture.opsi
    }

    /**
     * Pemilik ViewModel tes (G3). Tanpa ini viewModelScope tidak pernah
     * dibatalkan: respons OkHttp yang tiba setelah asersi melanjutkan coroutine
     * VM di thread OkHttp dan membaca Dispatchers.Main bersamaan dengan
     * resetMain/setMain tes berikutnya -> "Dispatchers.Main is used concurrently
     * with setting it".
     */
    private val tokoVm = ViewModelStore()
    private val jobVm = CopyOnWriteArrayList<Job>()

    @After
    fun bongkar() {
        // Urutan penting: batalkan coroutine VM dan tunggu tuntas dulu,
        // baru lepas gerbang, matikan server, lalu kembalikan Main.
        tokoVm.clear()
        runBlocking { withTimeout(5_000) { jobVm.forEach { it.join() } } }
        tahan.values.forEach { it.countDown() }
        server.shutdown()
        Dispatchers.resetMain()
    }

    /** ViewModel yang dibersihkan di [bongkar] seperti saat layar ditutup. */
    private fun buatVm(): ProyekViewModel {
        val vm = ViewModelProvider.create(tokoVm, viewModelFactory { initializer { ProyekViewModel(api, profil) } })["vm${jobVm.size}", ProyekViewModel::class]
        jobVm += vm.viewModelScope.coroutineContext[Job]!!
        return vm
    }

    /** Tunggu sampai [syarat] terpenuhi; bila habis waktu, nilai terakhir ikut dilaporkan (G3). */
    private fun <T> tunggu(flow: StateFlow<T>, syarat: (T) -> Boolean): T = runBlocking {
        try {
            withTimeout(5_000) { flow.first(syarat) }
        } catch (e: TimeoutCancellationException) {
            throw AssertionError("Syarat tidak terpenuhi dalam 5 dtk; nilai terakhir: ${flow.value}", e)
        }
    }

    private fun permintaan(metode: String, path: String): List<RecordedRequest> =
        tercatat.filter { it.method == metode && it.requestUrl!!.encodedPath == path }

    private fun badan(r: RecordedRequest) = mkJson.parseToJsonElement(r.body.readUtf8()).jsonObject

    private fun proyek(json: String): ProyekDto = mkJson.decodeFromString(json)

    private fun vmSiap(): ProyekViewModel {
        val vm = buatVm()
        tunggu(vm.daftar) { it.muat == Muat.SIAP }
        return vm
    }

    @Test
    fun muatAwalMembawaSaringanBawaanDanIzinAjukanDariServer() {
        val vm = vmSiap()
        val d = tunggu(vm.daftar) { it.bolehAjukan }
        assertEquals(1, d.items.size)
        assertEquals(1, d.ringkasan?.waiting)
        val q = permintaan("GET", "/api/projects").first { it.requestUrl!!.queryParameter("options") == null }.requestUrl!!
        assertEquals("AKTIF", q.queryParameter("lifecycle"))
        assertEquals("1", q.queryParameter("page"))
        assertEquals("20", q.queryParameter("pageSize"))
        assertNull(q.queryParameter("phase"))
    }

    @Test
    fun opsiDitolak403BerartiTidakBolehAjukan() {
        jawaban["GET opsi"] = 403 to """{"error":"Tidak diizinkan"}"""
        val vm = vmSiap()
        runBlocking { withTimeout(5_000) { while (permintaan("GET", "/api/projects").none { it.requestUrl!!.queryParameter("options") == "1" }) kotlinx.coroutines.delay(10) } }
        Thread.sleep(100)
        assertFalse(vm.daftar.value.bolehAjukan)
    }

    @Test
    fun sesiBerakhir401TampilSebagaiGalat() {
        jawaban["GET /api/projects"] = 401 to """{"error":"Sesi berakhir. Silakan masuk kembali."}"""
        val vm = buatVm()
        val d = tunggu(vm.daftar) { it.muat == Muat.GALAT }
        assertEquals("Sesi berakhir. Silakan masuk kembali.", d.galat)
    }

    @Test
    fun saringanSiklusDanFaseDikirimKeServer() {
        val vm = vmSiap()
        vm.pilihSiklus("DIUSULKAN")
        vm.pilihFase("PELAKSANAAN")
        runBlocking {
            withTimeout(5_000) {
                while (permintaan("GET", "/api/projects").none { it.requestUrl!!.queryParameter("phase") == "PELAKSANAAN" }) kotlinx.coroutines.delay(10)
            }
        }
        val q = permintaan("GET", "/api/projects").last { it.requestUrl!!.queryParameter("phase") != null }.requestUrl!!
        assertEquals("DIUSULKAN", q.queryParameter("lifecycle"))
    }

    @Test
    fun setujuiCepatMengirimKeputusanDanMenawarkanUrungkan() {
        jawaban["GET /api/projects"] = 200 to Fixture.daftar(
            Fixture.proyek("p2", lifecycle = "DIUSULKAN", approve = true, pendingRole = "ADMIN_PT", chain = """["ADMIN_PT"]"""),
        )
        jawaban["POST /api/projects/approve"] = 200 to """{"ok":true,"lifecycle":"AKTIF","pending":null,"approvals":[],"undoToken":"tok-setuju"}"""
        jawaban["POST /api/undo"] = 200 to """{"ok":true,"action":"APPROVE_PROJECT","targetType":"PROJECT","targetId":"p2","message":"Persetujuan diurungkan."}"""
        val vm = vmSiap()
        val antre = vm.daftar.value.antrean
        assertEquals(1, antre.size)
        vm.setujuiCepat(antre.single())
        val n = tunggu(vm.notifikasi) { it != null }!!
        assertTrue(n.pesan.contains("disetujui sebagai Admin PT"))
        assertEquals(AksiUrungkan.Tiket("tok-setuju"), n.urungkan)
        val b = badan(permintaan("POST", "/api/projects/approve").single())
        assertEquals("p2", b["projectId"]!!.jsonPrimitive.content)
        assertEquals("DISETUJUI", b["decision"]!!.jsonPrimitive.content)

        vm.urungkan()
        val u = tunggu(vm.notifikasi) { it?.pesan == "Persetujuan diurungkan." }
        assertNotNull(u)
        assertEquals("tok-setuju", badan(permintaan("POST", "/api/undo").single())["token"]!!.jsonPrimitive.content)
    }

    @Test
    fun tolakTanpaAlasanDitahanKlienTanpaPermintaan() {
        val vm = vmSiap()
        vm.bukaDetail(proyek(Fixture.proyek("p3", lifecycle = "DIUSULKAN", approve = true, pendingRole = "ADMIN_PT")), "DITOLAK")
        vm.ubahCatatan("tdk")
        vm.kirimKeputusan()
        assertEquals("Tulis alasan penolakan minimal 5 karakter.", vm.detail.value?.galat)
        assertTrue(permintaan("POST", "/api/projects/approve").isEmpty())
    }

    @Test
    fun keputusan403DariServerTampilDiSheet() {
        jawaban["POST /api/projects/approve"] = 403 to """{"error":"Sekarang giliran Direktur entitas di PT pemilik proyek. Anda tidak bisa menandatangani slot ini."}"""
        val vm = vmSiap()
        vm.bukaDetail(proyek(Fixture.proyek("p3", lifecycle = "DIUSULKAN", approve = true, pendingRole = "ADMIN_PT")))
        vm.mulaiKeputusan("DISETUJUI")
        vm.kirimKeputusan()
        val d = tunggu(vm.detail) { it?.galat != null }!!
        assertTrue(d.galat!!.startsWith("Sekarang giliran Direktur entitas"))
        assertNull(d.sibuk)
    }

    @Test
    fun hapusDitolak409MenawarkanArsipLaluArsipBisaDiurungkan() {
        jawaban["DELETE /api/projects"] = 409 to """{"error":"Proyek ini sudah punya 4 laporan/task, jadi tidak dihapus agar riwayatnya utuh. Arsipkan saja.","activity":4,"canArchive":true}"""
        jawaban["PATCH /api/projects"] = 200 to """{"ok":true,"project":${Fixture.proyek("p1", lifecycle = "DIARSIPKAN")},"undoToken":"tok-arsip"}"""
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        vm.mintaHapus()
        assertEquals(Konfirmasi.HapusProyek, vm.detail.value?.konfirmasi)
        vm.setujuKonfirmasi()
        val d = tunggu(vm.detail) { it?.konfirmasi is Konfirmasi.ArsipkanProyek }!!
        assertTrue((d.konfirmasi as Konfirmasi.ArsipkanProyek).pesan.contains("Arsipkan saja"))
        assertEquals("p1", permintaan("DELETE", "/api/projects").single().requestUrl!!.queryParameter("id"))

        vm.setujuKonfirmasi()
        val n = tunggu(vm.notifikasi) { it?.urungkan != null }!!
        assertEquals(AksiUrungkan.Tiket("tok-arsip"), n.urungkan)
        val b = badan(permintaan("PATCH", "/api/projects").single())
        assertEquals("DIARSIPKAN", b["lifecycle"]!!.jsonPrimitive.content)
        assertNull(vm.detail.value)
    }

    @Test
    fun simpanFormulirMenampilkanDaftarGalat422() {
        jawaban["POST /api/projects"] = 422 to """{"error":"PIC yang dipilih bukan Manager/PIC Proyek aktif di PT ini.","errors":["PIC yang dipilih bukan Manager/PIC Proyek aktif di PT ini.","Ada PT terkait yang tidak dikenali."]}"""
        val vm = vmSiap()
        vm.bukaFormBaru()
        tunggu(vm.form) { it?.opsi is Bagian.Siap }
        vm.ubahForm { it.copy(nama = "Gudang Baru Timur", penjelasan = "Pembangunan gudang baru wilayah timur.", picId = "u-x") }
        vm.simpanForm()
        val f = tunggu(vm.form) { it?.galat?.isNotEmpty() == true }!!
        assertEquals(2, f.galat.size)
        assertFalse(f.sibuk)
        val b = badan(permintaan("POST", "/api/projects").single())
        assertEquals("e1", b["entityId"]!!.jsonPrimitive.content)
        assertEquals("u-x", b["picUserId"]!!.jsonPrimitive.content)
    }

    @Test
    fun formulirTidakSahTidakMengirim() {
        val vm = vmSiap()
        vm.bukaFormBaru()
        tunggu(vm.form) { it?.opsi is Bagian.Siap }
        vm.ubahForm { it.copy(nama = "abc", penjelasan = "pendek") }
        vm.simpanForm()
        assertEquals(2, vm.form.value?.galat?.size)
        assertTrue(permintaan("POST", "/api/projects").isEmpty())
    }

    @Test
    fun ubahProyekMengirimSiklusHanyaBilaBerubah() {
        jawaban["PATCH /api/projects"] = 200 to """{"ok":true,"project":${Fixture.proyek("p1", lifecycle = "DITUTUP")},"undoToken":null}"""
        val vm = vmSiap()
        vm.bukaFormUbah(vm.daftar.value.items.single())
        tunggu(vm.form) { it?.opsi is Bagian.Siap }
        vm.ubahForm { it.copy(siklus = "DITUTUP") }
        vm.simpanForm()
        tunggu(vm.notifikasi) { it?.pesan == "Perubahan proyek tersimpan." }
        val b = badan(permintaan("PATCH", "/api/projects").single())
        assertEquals("DITUTUP", b["lifecycle"]!!.jsonPrimitive.content)
        assertFalse(b.containsKey("divisionId"))
        // C2 R5: tanggal yang tidak diubah tidak dikirim (tenggat hasil usulan tidak tergeser).
        assertFalse(b.containsKey("targetEndDate"))
        assertFalse(b.containsKey("startDate"))
    }

    @Test
    fun ubahProyekMengirimTanggalHanyaYangBerubah() {
        jawaban["PATCH /api/projects"] = 200 to """{"ok":true,"project":${Fixture.proyek("p1")},"undoToken":null}"""
        val vm = vmSiap()
        vm.bukaFormUbah(vm.daftar.value.items.single())
        tunggu(vm.form) { it?.opsi is Bagian.Siap }
        vm.ubahForm { it.copy(selesai = "2027-02-01") }
        vm.simpanForm()
        tunggu(vm.notifikasi) { it?.pesan == "Perubahan proyek tersimpan." }
        val b = badan(permintaan("PATCH", "/api/projects").single())
        assertEquals("2027-02-01", b["targetEndDate"]!!.jsonPrimitive.content)
        assertFalse(b.containsKey("startDate"))
    }

    @Test
    fun detailMengambilEskalasiTerkaitLewatSaringanProjectIdServer() {
        jawaban["GET /api/project-stages"] = 200 to Fixture.tahapan
        jawaban["GET /api/deadline-proposals"] = 200 to Fixture.usulan
        jawaban["GET /api/daily-reports"] = 200 to Fixture.laporan
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 200 to Fixture.eskalasi
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        // Kelima bagian dimuat paralel dan tiba dalam urutan acak; tunggu semuanya,
        // termasuk laporan yang di-cast di bawah (G3: dulu sesekali masih Memuat).
        val d = tunggu(vm.detail) {
            it != null && it.eskalasi is Bagian.Siap && it.tahapan is Bagian.Siap &&
                it.output is Bagian.Siap && it.usulan is Bagian.Siap && it.laporan is Bagian.Siap
        }!!
        val esk = (d.eskalasi as Bagian.Siap).data
        // Apa adanya dari server: termasuk laporan lama di luar riwayat dan eskalasi task.
        assertEquals(listOf("x1", "x2", "x3"), esk.map { it.id })
        assertEquals("dp1", d.usulanTerbuka?.id)
        assertEquals(2, (d.laporan as Bagian.Siap).data.size)
        val qEsk = permintaan("GET", "/api/escalations").single().requestUrl!!
        assertEquals("p1", qEsk.queryParameter("projectId"))
        assertNull(qEsk.queryParameter("entityId"))
        assertEquals("50", qEsk.queryParameter("pageSize"))
        val qLap = permintaan("GET", "/api/daily-reports").single().requestUrl!!
        assertEquals("p1", qLap.queryParameter("projectId"))
        assertEquals("10", qLap.queryParameter("pageSize"))
    }

    @Test
    fun eskalasiTerkaitTidakBergantungPadaRiwayatLaporan() {
        jawaban["GET /api/project-stages"] = 200 to Fixture.tahapan
        jawaban["GET /api/deadline-proposals"] = 200 to Fixture.usulan
        jawaban["GET /api/daily-reports"] = 500 to """{"error":"Riwayat belum termuat."}"""
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 200 to Fixture.eskalasi
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        val d = tunggu(vm.detail) { it?.laporan is Bagian.Galat && it.eskalasi is Bagian.Siap }!!
        assertEquals(3, (d.eskalasi as Bagian.Siap).data.size)
    }

    @Test
    fun eskalasiTerkait403TampilGalatTanpaMenjatuhkanLaporan() {
        jawaban["GET /api/project-stages"] = 200 to Fixture.tahapan
        jawaban["GET /api/deadline-proposals"] = 200 to Fixture.usulan
        jawaban["GET /api/daily-reports"] = 200 to Fixture.laporan
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 403 to """{"error":"Proyek ini di luar tanggung jawab Anda"}"""
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        val d = tunggu(vm.detail) { it?.eskalasi is Bagian.Galat && it.laporan is Bagian.Siap }!!
        assertEquals("Proyek ini di luar tanggung jawab Anda", (d.eskalasi as Bagian.Galat).pesan)
    }

    @Test
    fun detailPengajuanTidakMemuatBagianPemantauan() {
        val vm = vmSiap()
        vm.bukaDetail(proyek(Fixture.proyek("p5", lifecycle = "DIUSULKAN", pendingRole = "ADMIN_PT")))
        Thread.sleep(150)
        assertTrue(permintaan("GET", "/api/project-stages").isEmpty())
        assertFalse(vm.detail.value!!.berjalan)
    }

    @Test
    fun bagianDetail403TampilGalatTanpaMenjatuhkanBagianLain() {
        jawaban["GET /api/project-stages"] = 403 to """{"error":"Proyek ini di luar tanggung jawab Anda"}"""
        jawaban["GET /api/deadline-proposals"] = 200 to Fixture.usulan
        jawaban["GET /api/daily-reports"] = 200 to Fixture.laporan
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 200 to Fixture.eskalasi
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        val d = tunggu(vm.detail) { it?.tahapan is Bagian.Galat && it.output is Bagian.Siap }!!
        assertEquals("Proyek ini di luar tanggung jawab Anda", (d.tahapan as Bagian.Galat).pesan)
    }

    @Test
    fun usulTenggatDivalidasiLaluDikirim() {
        jawaban["GET /api/project-stages"] = 200 to Fixture.tahapan
        jawaban["GET /api/deadline-proposals"] = 200 to """{"items":[],"canDecide":false}"""
        jawaban["GET /api/daily-reports"] = 200 to Fixture.laporan
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 200 to Fixture.eskalasi
        jawaban["POST /api/deadline-proposals"] = 201 to """{"ok":true}"""
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        tunggu(vm.detail) { it?.tahapan is Bagian.Siap && it.usulan is Bagian.Siap }
        vm.bukaUsulTenggat()
        val hariIni = LocalDate.of(2026, 10, 13)
        vm.ubahUsulTenggat { it.copy(tanggal = "2026-10-13", alasan = "pendek") }
        vm.kirimUsulTenggat(hariIni)
        val u = vm.detail.value!!.usulTenggat!!
        assertEquals("Tenggat baru harus setelah hari ini", u.galatTanggal)
        assertNotNull(u.galatAlasan)
        assertTrue(permintaan("POST", "/api/deadline-proposals").isEmpty())

        vm.ubahUsulTenggat { it.copy(tanggal = "2027-01-15", alasan = "Material baja terlambat dua minggu") }
        vm.kirimUsulTenggat(hariIni)
        tunggu(vm.notifikasi) { it?.pesan == "Usulan tenggat dikirim ke Direktur." }
        val b = badan(permintaan("POST", "/api/deadline-proposals").single())
        assertEquals("2027-01-15", b["proposedDate"]!!.jsonPrimitive.content)
        assertNull(vm.detail.value!!.usulTenggat)
    }

    @Test
    fun simpanTahapTertahanWajibAlasanDanKonflik422DariServer() {
        jawaban["GET /api/project-stages"] = 200 to Fixture.tahapan
        jawaban["GET /api/deadline-proposals"] = 200 to Fixture.usulan
        jawaban["GET /api/daily-reports"] = 200 to Fixture.laporan
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 200 to Fixture.eskalasi
        jawaban["POST /api/project-stages"] = 422 to """{"error":"Maksimal 20 tahap per proyek"}"""
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        tunggu(vm.detail) { it?.tahapan is Bagian.Siap }
        vm.bukaEditorTahap()
        vm.ubahDrafTahap { it.copy(nama = "Uji beban", status = "TERTAHAN") }
        vm.simpanTahap()
        assertEquals("Tulis alasan tahap tertahan", vm.detail.value!!.editorTahap!!.galat)
        vm.ubahDrafTahap { it.copy(catatan = "Alat uji belum datang") }
        vm.simpanTahap()
        val d = tunggu(vm.detail) { it?.editorTahap?.galat == "Maksimal 20 tahap per proyek" }!!
        assertFalse(d.editorTahap!!.sibuk)
        val b = badan(permintaan("POST", "/api/project-stages").single())
        assertEquals("p1", b["projectId"]!!.jsonPrimitive.content)
        assertEquals("TERTAHAN", b["status"]!!.jsonPrimitive.content)
    }

    @Test
    fun urutTahapMengirimUrutanLengkap() {
        jawaban["GET /api/project-stages"] = 200 to Fixture.tahapan
        jawaban["GET /api/deadline-proposals"] = 200 to Fixture.usulan
        jawaban["GET /api/daily-reports"] = 200 to Fixture.laporan
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 200 to Fixture.eskalasi
        jawaban["PATCH /api/project-stages"] = 200 to """{"ok":true}"""
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        tunggu(vm.detail) { it?.tahapan is Bagian.Siap }
        vm.pindahTahap(1, -1)
        runBlocking { withTimeout(5_000) { while (permintaan("PATCH", "/api/project-stages").isEmpty()) kotlinx.coroutines.delay(10) } }
        val b = badan(permintaan("PATCH", "/api/project-stages").single())
        assertEquals("""["s2","s1"]""", b["order"].toString())
    }

    /* ------------------------------------------------------------------ */
    /* Regresi C2 (android/docs/fase3/C2-QA-PROYEK-ESKALASI.md)            */
    /* ------------------------------------------------------------------ */

    private fun tungguPermintaan(metode: String, path: String, jumlah: Int = 1) = runBlocking {
        withTimeout(5_000) { while (permintaan(metode, path).size < jumlah) kotlinx.coroutines.delay(10) }
    }

    private fun siapkanBagianDetail() {
        jawaban["GET /api/project-stages"] = 200 to Fixture.tahapan
        jawaban["GET /api/deadline-proposals"] = 200 to Fixture.usulan
        jawaban["GET /api/daily-reports"] = 200 to Fixture.laporan
        jawaban["GET /api/outputs"] = 200 to Fixture.output
        jawaban["GET /api/escalations"] = 200 to Fixture.eskalasi
    }

    @Test
    fun k1AjukanUlangMengirimResubmitTrue() {
        jawaban["PATCH /api/projects"] = 200 to """{"ok":true,"project":${Fixture.proyek("p6", lifecycle = "DIUSULKAN")},"undoToken":"tok-ulang"}"""
        val vm = vmSiap()
        vm.bukaDetail(proyek(Fixture.proyek("p6", lifecycle = "DITOLAK", resubmit = true, manage = true)))
        vm.ajukanUlang()
        val n = tunggu(vm.notifikasi) { it != null }!!
        assertTrue(n.pesan.endsWith("diajukan ulang."))
        assertEquals(AksiUrungkan.Tiket("tok-ulang"), n.urungkan)
        val b = badan(permintaan("PATCH", "/api/projects").single())
        assertEquals("p6", b["id"]!!.jsonPrimitive.content)
        assertEquals("true", b["resubmit"].toString())
    }

    @Test
    fun k1AjukanUlangYangTetapDitolakTidakDilaporkanSukses() {
        // Jawaban server untuk PATCH tanpa resubmit: 200 dengan proyek tetap DITOLAK.
        jawaban["PATCH /api/projects"] = 200 to """{"ok":true,"project":${Fixture.proyek("p6", lifecycle = "DITOLAK")},"undoToken":null}"""
        val vm = vmSiap()
        vm.bukaDetail(proyek(Fixture.proyek("p6", lifecycle = "DITOLAK", resubmit = true, manage = true)))
        vm.ajukanUlang()
        val d = tunggu(vm.detail) { it?.galat != null }!!
        assertEquals(PESAN_AJUKAN_ULANG_TAK_TERCATAT, d.galat)
        assertNull(d.sibuk)
        assertTrue(vm.notifikasi.value?.pesan?.endsWith("diajukan ulang.") != true)
    }

    @Test
    fun s1Hapus409SetelahSheetBergantiTidakMembukaArsipDiProyekLain() {
        jawaban["DELETE /api/projects"] = 409 to """{"error":"Proyek ini sudah punya 4 laporan/task. Arsipkan saja.","activity":4,"canArchive":true}"""
        val gerbang = CountDownLatch(1).also { tahan["DELETE /api/projects"] = it }
        val vm = vmSiap()
        val a = vm.daftar.value.items.single()
        vm.bukaDetail(a)
        vm.mintaHapus()
        vm.setujuKonfirmasi()
        tungguPermintaan("DELETE", "/api/projects")
        // Pengguna menutup Sheet A lalu membuka proyek B sebelum jawaban datang.
        vm.tutupDetail()
        val b = proyek(Fixture.proyek("p7", lifecycle = "DIUSULKAN", manage = true))
        vm.bukaDetail(b)
        gerbang.countDown()
        val n = tunggu(vm.notifikasi) { it?.pesan?.contains("Arsipkan saja") == true }
        assertNotNull(n)
        val d = vm.detail.value!!
        assertEquals("p7", d.proyek.id)
        assertNull(d.konfirmasi)
        assertNull(d.galat)
        assertNull(d.sibuk)
        assertTrue(permintaan("PATCH", "/api/projects").isEmpty())
    }

    @Test
    fun s1KonfirmasiArsipMembawaIdProyekAsal() {
        jawaban["DELETE /api/projects"] = 409 to """{"error":"Arsipkan saja.","activity":4,"canArchive":true}"""
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        vm.mintaHapus()
        vm.setujuKonfirmasi()
        val d = tunggu(vm.detail) { it?.konfirmasi is Konfirmasi.ArsipkanProyek }!!
        assertEquals("p1", (d.konfirmasi as Konfirmasi.ArsipkanProyek).proyek.id)
    }

    @Test
    fun s1GalatKeputusanSetelahSheetDitutupMasukSnackbar() {
        jawaban["POST /api/projects/approve"] = 403 to """{"error":"Sekarang giliran Direktur entitas."}"""
        val gerbang = CountDownLatch(1).also { tahan["POST /api/projects/approve"] = it }
        val vm = vmSiap()
        vm.bukaDetail(proyek(Fixture.proyek("p3", lifecycle = "DIUSULKAN", approve = true, pendingRole = "ADMIN_PT")))
        vm.mulaiKeputusan("DISETUJUI")
        vm.kirimKeputusan()
        tungguPermintaan("POST", "/api/projects/approve")
        vm.tutupDetail()
        gerbang.countDown()
        val n = tunggu(vm.notifikasi) { it != null }!!
        assertEquals("Sekarang giliran Direktur entitas.", n.pesan)
        assertNull(vm.detail.value)
    }

    @Test
    fun s1SheetDibukaUlangSelamaAksiBerjalanTetapTerkunci() {
        jawaban["POST /api/projects/approve"] = 200 to """{"ok":true,"lifecycle":"AKTIF","pending":null,"undoToken":null}"""
        val gerbang = CountDownLatch(1).also { tahan["POST /api/projects/approve"] = it }
        val vm = vmSiap()
        val p = proyek(Fixture.proyek("p3", lifecycle = "DIUSULKAN", approve = true, pendingRole = "ADMIN_PT"))
        vm.bukaDetail(p)
        vm.mulaiKeputusan("DISETUJUI")
        vm.kirimKeputusan()
        tungguPermintaan("POST", "/api/projects/approve")
        vm.tutupDetail()
        vm.bukaDetail(p)
        assertEquals("decide", vm.detail.value?.sibuk)
        gerbang.countDown()
        tunggu(vm.notifikasi) { it?.pesan?.endsWith("disetujui.") == true }
        assertEquals(1, permintaan("POST", "/api/projects/approve").size)
    }

    @Test
    fun s2GalatSimpanSetelahFormulirDitutupMasukSnackbar() {
        jawaban["POST /api/projects"] = 422 to """{"error":"Ada PT terkait yang tidak dikenali.","errors":["Ada PT terkait yang tidak dikenali."]}"""
        val gerbang = CountDownLatch(1).also { tahan["POST /api/projects"] = it }
        val vm = vmSiap()
        vm.bukaFormBaru()
        tunggu(vm.form) { it?.opsi is Bagian.Siap }
        vm.ubahForm { it.copy(nama = "Gudang Baru Timur", penjelasan = "Pembangunan gudang baru wilayah timur.") }
        vm.simpanForm()
        tungguPermintaan("POST", "/api/projects")
        vm.tutupForm()
        gerbang.countDown()
        val n = tunggu(vm.notifikasi) { it != null }!!
        assertEquals("Ada PT terkait yang tidak dikenali.", n.pesan)
        assertNull(vm.form.value)
    }

    @Test
    fun s2SimpanGandaSelamaPostBerjalanDitolakKlien() {
        jawaban["POST /api/projects"] = 201 to """{"ok":true,"project":${Fixture.proyek("p8", lifecycle = "DIUSULKAN")},"undoToken":null}"""
        val gerbang = CountDownLatch(1).also { tahan["POST /api/projects"] = it }
        val vm = vmSiap()
        vm.bukaFormBaru()
        tunggu(vm.form) { it?.opsi is Bagian.Siap }
        vm.ubahForm { it.copy(nama = "Gudang Baru Timur", penjelasan = "Pembangunan gudang baru wilayah timur.") }
        vm.simpanForm()
        tungguPermintaan("POST", "/api/projects")
        vm.tutupForm()
        // Formulir baru dibuka dan diajukan lagi selagi POST pertama berjalan.
        vm.bukaFormBaru()
        tunggu(vm.form) { it?.opsi is Bagian.Siap }
        vm.ubahForm { it.copy(nama = "Gudang Baru Timur", penjelasan = "Pembangunan gudang baru wilayah timur.") }
        vm.simpanForm()
        assertEquals(PESAN_SIMPAN_BERJALAN, vm.notifikasi.value?.pesan)
        gerbang.countDown()
        tunggu(vm.notifikasi) { it?.pesan == "Proyek dibuat dan langsung aktif." || it?.pesan == "Pengajuan proyek terkirim." }
        assertEquals(1, permintaan("POST", "/api/projects").size)
        // Formulir kedua (sesi lain) tidak ikut ditutup oleh hasil POST pertama.
        assertNotNull(vm.form.value)
    }

    @Test
    fun s3MuatLagiDitolakSelamaMenyegarkan() {
        jawaban["GET /api/projects"] = 200 to Fixture.daftar(Fixture.proyek("p1"), total = 40)
        val vm = vmSiap()
        assertTrue(vm.daftar.value.adaLagi)
        val gerbang = CountDownLatch(1).also { tahan["GET /api/projects"] = it }
        vm.muatDaftar()
        assertTrue(vm.daftar.value.menyegarkan)
        vm.muatLagi()
        assertFalse(vm.daftar.value.memuatLagi)
        gerbang.countDown()
        tunggu(vm.daftar) { !it.menyegarkan }
        Thread.sleep(100)
        assertTrue(tercatat.none { it.requestUrl!!.encodedPath == "/api/projects" && it.requestUrl!!.queryParameter("page") == "2" })
    }

    @Test
    fun s3MuatLagiYangBerjalanDibatalkanSaatDaftarDisegarkan() {
        jawaban["GET /api/projects"] = 200 to Fixture.daftar(Fixture.proyek("p1"), total = 40)
        jawaban["GET /api/projects#2"] = 200 to Fixture.daftar(Fixture.proyek("p9"), total = 40, page = 2)
        val vm = vmSiap()
        val gerbang = CountDownLatch(1).also { tahan["GET /api/projects#2"] = it }
        vm.muatLagi()
        assertTrue(vm.daftar.value.memuatLagi)
        runBlocking { withTimeout(5_000) { while (tercatat.none { it.requestUrl!!.queryParameter("page") == "2" }) kotlinx.coroutines.delay(10) } }
        vm.muatDaftar()
        assertFalse(vm.daftar.value.memuatLagi)
        tunggu(vm.daftar) { !it.menyegarkan }
        gerbang.countDown()
        Thread.sleep(200)
        val d = vm.daftar.value
        assertEquals(listOf("p1"), d.items.map { it.id })
        assertEquals(1, d.halaman)
        assertFalse(d.memuatLagi)
    }

    @Test
    fun s4IzinAjukanDiperiksaUlangSetelahGalatJaringan() {
        jawaban["GET opsi"] = 503 to """{"error":"Layanan sedang sibuk."}"""
        val vm = vmSiap()
        runBlocking { withTimeout(5_000) { while (permintaan("GET", "/api/projects").none { it.requestUrl!!.queryParameter("options") == "1" }) kotlinx.coroutines.delay(10) } }
        Thread.sleep(100)
        assertFalse(vm.daftar.value.bolehAjukan)
        jawaban["GET opsi"] = 200 to Fixture.opsi
        vm.muatDaftar()
        tunggu(vm.daftar) { it.bolehAjukan }
    }

    @Test
    fun s4Opsi403TidakDiperiksaUlang() {
        jawaban["GET opsi"] = 403 to """{"error":"Tidak diizinkan"}"""
        val vm = vmSiap()
        runBlocking { withTimeout(5_000) { while (permintaan("GET", "/api/projects").none { it.requestUrl!!.queryParameter("options") == "1" }) kotlinx.coroutines.delay(10) } }
        Thread.sleep(100)
        vm.muatDaftar()
        tunggu(vm.daftar) { !it.menyegarkan }
        Thread.sleep(100)
        assertEquals(1, permintaan("GET", "/api/projects").count { it.requestUrl!!.queryParameter("options") == "1" })
        assertFalse(vm.daftar.value.bolehAjukan)
    }

    @Test
    fun r3SetujuiCepat409MemuatUlangAntrean() {
        jawaban["GET /api/projects"] = 200 to Fixture.daftar(
            Fixture.proyek("p2", lifecycle = "DIUSULKAN", approve = true, pendingRole = "ADMIN_PT", chain = """["ADMIN_PT"]"""),
        )
        jawaban["POST /api/projects/approve"] = 409 to """{"error":"Pengajuan ini sudah diputuskan."}"""
        val vm = vmSiap()
        val sebelum = permintaan("GET", "/api/projects").count { it.requestUrl!!.queryParameter("options") == null }
        vm.setujuiCepat(vm.daftar.value.antrean.single())
        tunggu(vm.notifikasi) { it?.pesan == "Pengajuan ini sudah diputuskan." }
        runBlocking {
            withTimeout(5_000) {
                while (permintaan("GET", "/api/projects").count { it.requestUrl!!.queryParameter("options") == null } <= sebelum) kotlinx.coroutines.delay(10)
            }
        }
    }

    @Test
    fun r4PindahTahapGandaHanyaSatuPatch() {
        siapkanBagianDetail()
        jawaban["PATCH /api/project-stages"] = 200 to """{"ok":true}"""
        val gerbang = CountDownLatch(1).also { tahan["PATCH /api/project-stages"] = it }
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        tunggu(vm.detail) { it?.tahapan is Bagian.Siap }
        vm.pindahTahap(1, -1)
        assertTrue(vm.detail.value!!.sibukUrut)
        vm.pindahTahap(1, -1)
        gerbang.countDown()
        tunggu(vm.detail) { it?.sibukUrut == false }
        assertEquals(1, permintaan("PATCH", "/api/project-stages").size)
    }

    @Test
    fun r6CatatanKeputusanDipotongSesuaiBatasServer() {
        val vm = vmSiap()
        vm.bukaDetail(proyek(Fixture.proyek("p3", lifecycle = "DIUSULKAN", approve = true, pendingRole = "ADMIN_PT")), "DITOLAK")
        vm.ubahCatatan("x".repeat(BATAS_CATATAN_KEPUTUSAN + 50))
        assertEquals(BATAS_CATATAN_KEPUTUSAN, vm.detail.value!!.catatan.length)
    }

    @Test
    fun usulTenggatGagalSetelahSheetDitutupMasukSnackbar() {
        siapkanBagianDetail()
        jawaban["GET /api/deadline-proposals"] = 200 to """{"items":[],"canDecide":false}"""
        jawaban["POST /api/deadline-proposals"] = 422 to """{"error":"Tanggal yang diusulkan sama dengan tenggat sekarang"}"""
        val gerbang = CountDownLatch(1).also { tahan["POST /api/deadline-proposals"] = it }
        val vm = vmSiap()
        vm.bukaDetail(vm.daftar.value.items.single())
        tunggu(vm.detail) { it?.tahapan is Bagian.Siap && it.usulan is Bagian.Siap }
        vm.bukaUsulTenggat()
        vm.ubahUsulTenggat { it.copy(tanggal = "2027-01-15", alasan = "Material baja terlambat dua minggu") }
        vm.kirimUsulTenggat(LocalDate.of(2026, 10, 13))
        tungguPermintaan("POST", "/api/deadline-proposals")
        vm.tutupUsulTenggat()
        gerbang.countDown()
        val n = tunggu(vm.notifikasi) { it != null }!!
        assertEquals("Tanggal yang diusulkan sama dengan tenggat sekarang", n.pesan)
    }
}
