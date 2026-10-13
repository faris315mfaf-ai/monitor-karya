package id.co.monitorkarya.core.network

import okhttp3.Request
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** C5-S6 (401 basi tidak menghapus sesi baru) dan C5-R2 (Cookie tidak ikut redirect lintas host). */
class SesiCookieC5Test {

    private class Toko(var nilai: String?) : MkAuthStore {
        var dihapus = 0
        override fun simpan(setCookieHeaders: List<String>) = Unit
        override fun header(): String? = nilai
        override fun hapus() {
            dihapus++
            nilai = null
        }
    }

    private val a = MockWebServer()
    private val b = MockWebServer()

    @After
    fun tutup() {
        a.shutdown()
        b.shutdown()
    }

    @Test
    fun cookieMasihBerlakuHanyaBilaSamaDenganYangTersimpan() {
        assertTrue(MkClient.cookieMasihBerlaku("mk=1", "mk=1"))
        assertFalse(MkClient.cookieMasihBerlaku("mk=lama", "mk=baru"))
        assertFalse(MkClient.cookieMasihBerlaku(null, "mk=1"))
        assertTrue(MkClient.bolehBawaCookie("monitorkarya.tech", "MonitorKarya.tech"))
        assertFalse(MkClient.bolehBawaCookie("monitorkarya.tech", "cdn.lain.com"))
    }

    @Test
    fun jawaban401DariPermintaanBasiTidakMenghapusSesiBaru() {
        val toko = Toko("mk=lama")
        val peristiwa = mutableListOf<PeristiwaSesi>()
        a.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                // Selama permintaan lama di jalan, pengguna masuk lagi → cookie baru.
                toko.nilai = "mk=baru"
                return MockResponse().setResponseCode(401)
            }
        }
        a.start()
        val klien = MkClient.okHttp(toko, debug = false) { peristiwa += it }
        klien.newCall(Request.Builder().url(a.url("/api/tasks")).build()).execute().close()

        assertEquals("mk=lama", a.takeRequest().getHeader("Cookie"))
        assertEquals("mk=baru", toko.nilai)
        assertEquals(0, toko.dihapus)
        assertTrue(peristiwa.isEmpty())
    }

    @Test
    fun jawaban401AtasSesiYangSamaTetapMengakhiriSesi() {
        val toko = Toko("mk=1")
        val peristiwa = mutableListOf<PeristiwaSesi>()
        a.enqueue(MockResponse().setResponseCode(401))
        a.start()
        MkClient.okHttp(toko, debug = false) { peristiwa += it }
            .newCall(Request.Builder().url(a.url("/api/tasks")).build()).execute().close()
        assertNull(toko.nilai)
        assertEquals(listOf(PeristiwaSesi.BERAKHIR), peristiwa)
    }

    @Test
    fun cookieTidakIkutRedirectKeHostLain() {
        b.enqueue(MockResponse().setBody("ok"))
        b.start()
        a.start()
        // a dipanggil lewat "localhost", b lewat "127.0.0.1": host berbeda.
        val tujuan = b.url("/luar").newBuilder().host("127.0.0.1").build()
        a.enqueue(MockResponse().setResponseCode(302).setHeader("Location", tujuan.toString()))
        val asal = a.url("/api/x").newBuilder().host("localhost").build()

        MkClient.okHttp(Toko("mk=rahasia"), debug = false)
            .newCall(Request.Builder().url(asal).build()).execute().close()

        assertEquals("mk=rahasia", a.takeRequest().getHeader("Cookie"))
        assertNull(b.takeRequest().getHeader("Cookie"))
    }
}
