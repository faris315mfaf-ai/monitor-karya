package id.co.monitorkarya.feature.entitas

import id.co.monitorkarya.feature.entitas.data.AkunBarisDto
import id.co.monitorkarya.feature.entitas.data.AkunTersimpanDto
import id.co.monitorkarya.feature.entitas.data.AkunTersimpanResponse
import id.co.monitorkarya.feature.entitas.data.AktivasiTerbitDto
import id.co.monitorkarya.feature.entitas.data.AktivitasEntitasResponse
import id.co.monitorkarya.feature.entitas.data.DetailEntitasResponse
import id.co.monitorkarya.feature.entitas.data.EntitasApi
import id.co.monitorkarya.feature.entitas.data.EntitasDto
import id.co.monitorkarya.feature.entitas.data.KeanggotaanAkunDto
import id.co.monitorkarya.feature.entitas.data.KelayakanAktivasiDto
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.OkDto
import id.co.monitorkarya.feature.entitas.data.PerusahaanApi
import id.co.monitorkarya.feature.entitas.data.PerusahaanDto
import id.co.monitorkarya.feature.entitas.data.HitunganPerusahaanDto
import id.co.monitorkarya.feature.entitas.perusahaan.laporanPenghalangHapus
import id.co.monitorkarya.feature.entitas.data.PohonEntitasResponse
import id.co.monitorkarya.feature.entitas.data.SimpulEntitasDto
import id.co.monitorkarya.feature.entitas.data.TambahAkunRequest
import id.co.monitorkarya.feature.entitas.data.TambahPerusahaanRequest
import id.co.monitorkarya.feature.entitas.data.TambahPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.TerbitkanAktivasiBody
import id.co.monitorkarya.feature.entitas.data.TerbitkanAktivasiJawaban
import id.co.monitorkarya.feature.entitas.data.UbahAkunRequest
import id.co.monitorkarya.feature.entitas.data.UbahPerusahaanRequest
import id.co.monitorkarya.feature.entitas.data.UbahPerusahaanResponse
import id.co.monitorkarya.feature.entitas.di.AsalServer
import id.co.monitorkarya.feature.entitas.entitas.DetailUi
import id.co.monitorkarya.feature.entitas.entitas.EntitasViewModel
import id.co.monitorkarya.feature.entitas.entitas.Kadens
import id.co.monitorkarya.feature.entitas.entitas.PohonUi
import id.co.monitorkarya.feature.entitas.perusahaan.FormAkun
import id.co.monitorkarya.feature.entitas.perusahaan.MejaUi
import id.co.monitorkarya.feature.entitas.perusahaan.PerusahaanViewModel
import id.co.monitorkarya.feature.entitas.perusahaan.Rahasia
import id.co.monitorkarya.feature.entitas.perusahaan.StatusFormAkun
import id.co.monitorkarya.feature.entitas.perusahaan.StatusWizard
import id.co.monitorkarya.feature.entitas.data.PosisiBaruRequest
import id.co.monitorkarya.feature.entitas.data.EntitasBaruDto
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
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

private fun <T> galat(kode: Int, pesan: String): Response<T> =
    Response.error(kode, """{"error":"$pesan"}""".toResponseBody("application/json".toMediaType()))

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelTest {

    @Before
    fun siap() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun bersih() {
        Dispatchers.resetMain()
    }

    // ------------------------------------------------------------ Entitas

    private class EntitasPalsu : EntitasApi {
        var pohon: Response<PohonEntitasResponse> = Response.success(
            PohonEntitasResponse(
                tree = listOf(
                    SimpulEntitasDto(
                        id = "h",
                        name = "Holding",
                        type = "HOLDING",
                        children = listOf(SimpulEntitasDto(id = "pt1", name = "PT Satu", type = "PT")),
                    ),
                ),
                periodKey = "2026-10",
            ),
        )
        var rincian: Response<DetailEntitasResponse> =
            Response.success(DetailEntitasResponse(entity = EntitasDto(id = "pt1", name = "PT Satu", type = "PT")))
        val panggilanAktivitas = mutableListOf<Triple<String, String, String?>>()

        override suspend fun pohon() = pohon
        override suspend fun rincian(id: String) = rincian
        override suspend fun aktivitas(cadence: String, priority: String, tanggal: String?): Response<AktivitasEntitasResponse> {
            panggilanAktivitas += Triple(cadence, priority, tanggal)
            return Response.success(AktivitasEntitasResponse(cadence = cadence, prev = "2026-10-09", next = "2026-10-11"))
        }
    }

    @Test
    fun entitas_muatPohonLaluBukaPt() = runTest {
        val api = EntitasPalsu()
        val vm = EntitasViewModel(api)
        assertTrue(vm.pohon.value is PohonUi.Siap)
        assertEquals(listOf("h", "pt1"), vm.baris.value.map { it.simpul.id })

        val pt = (vm.pohon.value as PohonUi.Siap).pohon.single().children.single()
        vm.pilih(pt)
        assertTrue(vm.detail.value is DetailUi.Siap)
        assertEquals(Triple("HARIAN", "ALL", null), api.panggilanAktivitas.single())

        vm.periodeSebelumnya()
        assertEquals("2026-10-09", api.panggilanAktivitas.last().third)
        vm.setKadens(Kadens.BULANAN)
        assertEquals("BULANAN", api.panggilanAktivitas.last().first)
        vm.kembaliKeHariIni()
        assertNull(api.panggilanAktivitas.last().third)
    }

    @Test
    fun entitas_403RincianJadiDitolakBukanGalat() = runTest {
        val api = EntitasPalsu().apply { rincian = galat(403, "Akses ditolak") }
        val vm = EntitasViewModel(api)
        vm.pilih(SimpulEntitasDto(id = "pt1", name = "PT Satu", type = "PT"))
        val d = vm.detail.value
        assertTrue(d is DetailUi.Ditolak)
        assertEquals("Akses ditolak", (d as DetailUi.Ditolak).pesanServer)

        api.rincian = galat(500, "Data entitas belum termuat. Coba lagi.")
        vm.muatDetail()
        assertTrue(vm.detail.value is DetailUi.Galat)
    }

    @Test
    fun entitas_nonPtTidakMemuatAktivitas() = runTest {
        val api = EntitasPalsu()
        val vm = EntitasViewModel(api)
        vm.pilih(SimpulEntitasDto(id = "h", name = "Holding", type = "HOLDING"))
        assertTrue(api.panggilanAktivitas.isEmpty())
        vm.pilih(null)
        assertNull(vm.terpilih.value)
    }

    @Test
    fun entitas_galatPohon() = runTest {
        val api = EntitasPalsu().apply { pohon = galat(500, "Data entitas belum termuat. Coba lagi.") }
        val vm = EntitasViewModel(api)
        assertEquals("Data entitas belum termuat. Coba lagi.", (vm.pohon.value as PohonUi.Galat).pesan)
    }

    // ------------------------------------------------------------ Perusahaan

    private class PerusahaanPalsu : PerusahaanApi {
        var meja: Response<MejaPerusahaanResponse> = Response.success(
            MejaPerusahaanResponse(
                companies = listOf(
                    PerusahaanDto(
                        id = "pt1",
                        name = "PT Satu",
                        users = listOf(
                            AkunBarisDto(id = "u2", name = "Budi", username = "budi", role = "PIC_PROYEK", scopeEntityId = "pt1"),
                        ),
                    ),
                ),
                me = "sa",
                scope = "ALL",
                canManageCompanies = true,
                manageableRoles = listOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK", "SUPERADMIN"),
            ),
        )
        val ubahAkun = mutableListOf<UbahAkunRequest>()
        val ubahPerusahaan = mutableListOf<UbahPerusahaanRequest>()
        var jawabHapusPerusahaan: Response<OkDto> = Response.success(OkDto(true))
        var jawabTambahAkun: Response<AkunTersimpanResponse> =
            Response.success(AkunTersimpanResponse(true, AkunTersimpanDto(id = "u9", name = "Dewi", username = "dewi")))
        var tambahAkunTerakhir: TambahAkunRequest? = null

        override suspend fun meja() = meja
        override suspend fun tambahPerusahaan(body: TambahPerusahaanRequest) =
            Response.success(TambahPerusahaanResponse(true, EntitasBaruDto(id = "pt9", name = body.name)))
        override suspend fun ubahPerusahaan(body: UbahPerusahaanRequest): Response<UbahPerusahaanResponse> {
            ubahPerusahaan += body
            return Response.success(UbahPerusahaanResponse(true))
        }
        override suspend fun hapusPerusahaan(id: String) = jawabHapusPerusahaan
        override suspend fun keanggotaan(id: String) = Response.success(KeanggotaanAkunDto(id, "d1"))
        override suspend fun tambahAkun(body: TambahAkunRequest): Response<AkunTersimpanResponse> {
            tambahAkunTerakhir = body
            return jawabTambahAkun
        }
        override suspend fun ubahAkun(body: UbahAkunRequest): Response<AkunTersimpanResponse> {
            ubahAkun += body
            return Response.success(AkunTersimpanResponse(true, AkunTersimpanDto(id = body.id)))
        }
        override suspend fun hapusAkun(id: String) = Response.success(OkDto(true))
        override suspend fun kelayakanAktivasi(id: String) = Response.success(KelayakanAktivasiDto(true))
        override suspend fun terbitkanAktivasi(body: TerbitkanAktivasiBody) = Response.success(
            TerbitkanAktivasiJawaban(
                true,
                AktivasiTerbitDto(body.userId, "budi", "/login/aktivasi#token=RAHASIA", "2026-10-11T05:00:00.000Z"),
            ),
        )
    }

    private val asal = AsalServer("https://monitorkarya.tech")

    @Test
    fun perusahaan_403MejaDitolak() = runTest {
        val api = PerusahaanPalsu().apply { meja = galat(403, "Peran Anda tidak mengelola akun") }
        val vm = PerusahaanViewModel(api, asal)
        val m = vm.meja.value as MejaUi.Galat
        assertTrue(m.ditolak)
        assertEquals("Peran Anda tidak mengelola akun", m.pesan)
    }

    @Test
    fun perusahaan_nonaktifkanAkunLaluUrungkan() = runTest {
        val api = PerusahaanPalsu()
        val vm = PerusahaanViewModel(api, asal)
        val budi = (vm.meja.value as MejaUi.Siap).meja.companies.single().users.single()
        vm.bukaAkun(budi.id, "pt1")
        assertEquals(true, vm.sheetAkun.value!!.aktivasiTersedia)
        assertEquals("d1", vm.sheetAkun.value!!.anggotaDivisiAwal)

        vm.setAktifAkun(budi, aktif = false)
        assertEquals(UbahAkunRequest(id = "u2", isActive = false), api.ubahAkun.last())
        assertTrue(vm.notif.value!!.bisaUrung)

        vm.urungkan()
        assertEquals(UbahAkunRequest(id = "u2", isActive = true), api.ubahAkun.last())
        assertFalse(vm.notif.value!!.bisaUrung)
        // Urungkan sekali pakai.
        vm.urungkan()
        assertEquals(2, api.ubahAkun.size)
    }

    @Test
    fun e2e3_b7_urungkanPindahKeLayarSaatSheetDitutup() = runTest {
        val api = PerusahaanPalsu()
        val vm = PerusahaanViewModel(api, asal)
        val c = (vm.meja.value as MejaUi.Siap).meja.companies.single()
        vm.bukaPerusahaan(c.id)
        vm.setAktifPerusahaan(c, aktif = false)
        val diSheet = vm.notif.value!!
        assertTrue(diSheet.bisaUrung)
        vm.tutupPerusahaan()
        // Pesan dipancarkan ulang (id baru) agar snackbar layar tampil penuh.
        val diLayar = vm.notif.value!!
        assertTrue(diLayar.bisaUrung)
        assertTrue(diLayar.id > diSheet.id)
        vm.urungkan()
        assertEquals(UbahPerusahaanRequest(id = "pt1", isActive = true), api.ubahPerusahaan.last())
    }

    @Test
    fun e2e3_b7_tutupTanpaUrungTidakMemancarkanUlang() = runTest {
        val api = PerusahaanPalsu()
        val vm = PerusahaanViewModel(api, asal)
        val c = (vm.meja.value as MejaUi.Siap).meja.companies.single()
        vm.bukaPerusahaan(c.id)
        vm.tutupPerusahaan()
        assertNull(vm.notif.value)
    }

    @Test
    fun e2e3_b16_ptBerlaporanTidakBolehDihapus() {
        val kosong = PerusahaanDto(id = "a", name = "A")
        assertEquals(0, laporanPenghalangHapus(kosong))
        val berriwayat = kosong.copy(counts = HitunganPerusahaanDto(dailyReports = 90, weeklyReports = 6))
        assertEquals(96, laporanPenghalangHapus(berriwayat))
    }

    @Test
    fun perusahaan_hapus409TampilPesanServer() = runTest {
        val pesan = "Perusahaan ini sudah punya 12 data laporan/task. Nonaktifkan saja agar riwayatnya tetap utuh."
        val api = PerusahaanPalsu().apply { jawabHapusPerusahaan = galat(409, pesan) }
        val vm = PerusahaanViewModel(api, asal)
        val c = (vm.meja.value as MejaUi.Siap).meja.companies.single()
        vm.bukaPerusahaan(c.id)
        vm.hapusPerusahaan(c)
        assertEquals(pesan, vm.sheetPerusahaan.value!!.galat)
        assertNull(vm.sheetPerusahaan.value!!.sibuk)
    }

    @Test
    fun perusahaan_aktivasiDariAsalDanDibuangSaatTutup() = runTest {
        val api = PerusahaanPalsu()
        val vm = PerusahaanViewModel(api, asal)
        val budi = (vm.meja.value as MejaUi.Siap).meja.companies.single().users.single()
        vm.bukaAkun(budi.id, "pt1")
        vm.terbitkanAktivasi(budi)
        assertEquals("https://monitorkarya.tech/login/aktivasi#token=RAHASIA", vm.sheetAkun.value!!.tautan!!.url)
        vm.tutupAkun()
        assertNull(vm.sheetAkun.value)
    }

    @Test
    fun perusahaan_simpanAkunMejaTerbatasTanpaPenempatanDanSandiTidakDisimpan() = runTest {
        val api = PerusahaanPalsu()
        val vm = PerusahaanViewModel(api, asal)
        vm.bukaAkun("u2", "pt1")
        val form = FormAkun(
            idPerusahaan = "pt1",
            peran = "PIC_PROYEK",
            nama = "Budi S",
            username = "budi",
            email = "",
            jabatan = "",
            telepon = "",
            anggotaDivisi = "",
        )
        vm.simpanAkun(form, sandi = "SandiRahasia9", kunciPerusahaan = true)
        val req = api.ubahAkun.last()
        assertNull(req.entityId)
        assertNull(req.email)
        assertEquals("SandiRahasia9", req.password)
        // Keanggotaan awal d1 -> "" = lepas divisi.
        assertEquals("", req.memberDivisionId)
        assertNull(vm.sheetAkun.value)
        assertFalse(vm.notif.value.toString().contains("SandiRahasia9"))
    }

    @Test
    fun perusahaan_tambahAkunMenampilkanSerahTerima() = runTest {
        val api = PerusahaanPalsu()
        val vm = PerusahaanViewModel(api, asal)
        vm.bukaAkun(null, "pt1")
        vm.simpanAkun(
            FormAkun(
                idPerusahaan = "pt1",
                peran = "KEPALA_DIVISI",
                nama = "Dewi",
                username = "dewi",
                email = "",
                jabatan = "",
                telepon = "",
                divisiDipimpin = "__new__",
                divisiBaru = "Keuangan",
            ),
            sandi = "AwalAcak1234",
            kunciPerusahaan = false,
        )
        val req = api.tambahAkunTerakhir!!
        assertEquals("pt1", req.entityId)
        assertEquals("Keuangan", req.divisionName)
        assertNull(req.divisionId)
        assertEquals("dewi", vm.sheetAkun.value!!.dibuat!!.username)
        assertFalse(vm.sheetAkun.value.toString().contains("AwalAcak1234"))

        api.jawabTambahAkun = galat(422, "Username dewi sudah dipakai.")
        vm.bukaAkun(null, "pt1")
        vm.simpanAkun(
            FormAkun("pt1", "ADMIN_PT", "Dewi", "dewi", "", "", ""),
            sandi = "",
            kunciPerusahaan = false,
        )
        assertEquals("Username dewi sudah dipakai.", vm.sheetAkun.value!!.galat)
    }

    // ------------------------------------------------------------ C1 regresi

    @Test
    fun c1_serahTerimaMemakaiSandiTerkirimDanDisamarkan() = runTest {
        val vm = PerusahaanViewModel(PerusahaanPalsu(), asal)
        vm.bukaAkun(null, "pt1")
        vm.simpanAkun(FormAkun("pt1", "ADMIN_PT", "Dewi", "dewi", "", "", ""), sandi = "Terkirim12345", kunciPerusahaan = false)
        val dibuat = vm.sheetAkun.value!!.dibuat!!
        assertEquals("Terkirim12345", dibuat.sandiAwal.nilai)
        assertFalse(dibuat.toString().contains("Terkirim12345"))
        // Ditutup = sandi ikut dibuang dari memori.
        vm.tutupAkun()
        assertNull(vm.sheetAkun.value)
    }

    @Test
    fun c1_formAkunStabilSelamaSheetTerbukaDanDibuangSaatTutup() = runTest {
        val vm = PerusahaanViewModel(PerusahaanPalsu(), asal)
        val meja = (vm.meja.value as MejaUi.Siap).meja
        vm.bukaAkun(null, "pt1")
        val a = vm.formAkun("baru:pt1") { StatusFormAkun.dari(null, "pt1", meja) }
        val sandiAwal = a.sandi
        // "Rotasi": komposisi baru meminta form lagi -> objek dan sandi sama.
        val b = vm.formAkun("baru:pt1") { StatusFormAkun.dari(null, "pt1", meja) }
        assertSame(a, b)
        assertEquals(sandiAwal, b.sandi)
        // Kunci lain (akun lain) = formulir baru.
        assertNotSame(a, vm.formAkun("u2:pt1") { StatusFormAkun.dari(null, "pt1", meja) })
        vm.tutupAkun()
        assertNotSame(b, vm.formAkun("u2:pt1") { StatusFormAkun.dari(null, "pt1", meja) })
    }

    @Test
    fun c1_wizardStabilDanSerahTerimaDariPermintaanTerkirim() = runTest {
        val vm = PerusahaanViewModel(PerusahaanPalsu(), asal)
        vm.bukaWizard()
        val w = vm.formWizard { StatusWizard(adaHolding = false, indukAwal = "") }
        w.nama = "PT Baru"
        assertSame(w, vm.formWizard { StatusWizard(adaHolding = false, indukAwal = "") })
        vm.kirimWizard(
            TambahPerusahaanRequest(
                name = "PT Baru",
                positions = listOf(PosisiBaruRequest(role = "ADMIN_PT", name = "Ani", username = "ani", password = "SandiAni12345")),
            ),
        )
        val ui = vm.wizard.value!!
        assertEquals("pt9", ui.hasil!!.id)
        assertEquals(Rahasia("SandiAni12345"), ui.serahTerima.single().sandi)
        assertFalse(ui.toString().contains("SandiAni12345"))
        vm.tutupWizard()
        assertNull(vm.wizard.value)
        assertNotSame(w, vm.formWizard { StatusWizard(adaHolding = false, indukAwal = "") })
    }

    @Test
    fun c1_aktivitasTidakDiunduhUlangSaatPindahPtKecualiMuatUlang() = runTest {
        val api = EntitasPalsu()
        val vm = EntitasViewModel(api)
        vm.pilih(SimpulEntitasDto(id = "pt1", name = "PT Satu", type = "PT"))
        vm.pilih(SimpulEntitasDto(id = "pt2", name = "PT Dua", type = "PT"))
        assertEquals(1, api.panggilanAktivitas.size)
        assertEquals("2026-10-09", vm.aktivitas.value.jawaban!!.prev)
        vm.muatAktivitas()
        assertEquals(2, api.panggilanAktivitas.size)
        // Kedaluwarsa: setelah 60 detik pindah PT menarik ulang.
        vm.jam = { System.currentTimeMillis() + 61_000L }
        vm.pilih(SimpulEntitasDto(id = "pt1", name = "PT Satu", type = "PT"))
        assertEquals(3, api.panggilanAktivitas.size)
    }
}
