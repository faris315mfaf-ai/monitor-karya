package id.co.monitorkarya.feature.pesan.data

import id.co.monitorkarya.core.data.repo.KotakMasuk
import id.co.monitorkarya.core.network.api.NotificationsApi
import id.co.monitorkarya.core.network.buatApi
import id.co.monitorkarya.core.network.dto.TandaiBacaRequest
import id.co.monitorkarya.core.network.mkJson
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Kontrak src/app/api/notifications/route.ts (diverifikasi 13 Okt 2026):
 * GET ?inbox=1 → {unread, items[{id,template,title,body,tab,createdAt,readAt}]};
 * PATCH {ids}|{all:true} → {ok, marked}; 422 {error} bila kosong.
 * D1 (S2): Pesan memakai NotificationsApi bersama (:core:network) lewat
 * KotakMasukRepo; tes ini mengunci kontrak + pemetaan ke model tampil Pesan.
 */
class DtoPesanTest {

    private lateinit var server: MockWebServer
    private lateinit var api: NotificationsApi

    @Before
    fun siapkan() {
        server = MockWebServer()
        server.start()
        api = buatApi(OkHttpClient(), server.url("/").toString(), NotificationsApi::class.java)
    }

    @After
    fun matikan() = server.shutdown()

    @Test
    fun kotakMasuk_terdekode_dan_jalur_benar() = runBlocking {
        server.enqueue(MockResponse().setBody(JSON_KOTAK))
        val mentah = api.kotakMasuk().body()!!
        assertEquals("/api/notifications?inbox=1", server.takeRequest().path)
        val badan = KotakMasuk(belumDibaca = mentah.unread, items = mentah.items, termuat = true).keKotak()
        assertEquals(2, badan.unread)
        assertEquals(3, badan.items.size)
        val a = badan.items.first()
        assertEquals("PENGINGAT_HARIAN_PIC", a.template)
        assertEquals("daily-input", a.tab)
        assertEquals("2026-10-13T02:55:00.000Z", a.createdAt)
        assertFalse(a.dibaca)
        assertTrue(badan.items[2].dibaca)
        // Payload lama bukan JSON: judul = nama template, isi kosong, tab null.
        assertEquals("", badan.items[1].body)
        assertNull(badan.items[1].tab)
    }

    @Test
    fun item_tanpa_kolom_tetap_terdekode() {
        val r = mkJson.decodeFromString(
            id.co.monitorkarya.core.network.dto.NotificationsInboxResponse.serializer(),
            """{"unread":1,"items":[{"id":"x"}]}""",
        )
        val p = r.items.single().kePesan()
        assertEquals("", p.title)
        assertNull(p.createdAt)
    }

    @Test
    fun tandai_mengirim_ids_atau_all_tanpa_kolom_bawaan() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"ok":true,"marked":1}"""))
        server.enqueue(MockResponse().setBody("""{"ok":true,"marked":2}"""))
        val r1 = api.tandaiBaca(TandaiBacaRequest(ids = listOf("n1")))
        val q1 = server.takeRequest()
        assertEquals("PATCH", q1.method)
        assertEquals("/api/notifications", q1.path)
        assertEquals("""{"ids":["n1"]}""", q1.body.readUtf8())
        assertEquals(1, r1.body()!!.marked)

        api.tandaiBaca(TandaiBacaRequest(all = true))
        assertEquals("""{"all":true}""", server.takeRequest().body.readUtf8())
    }

    @Test
    fun encode_langsung_sama_dengan_web() {
        assertEquals("""{"all":true}""", mkJson.encodeToString(TandaiBacaRequest.serializer(), TandaiBacaRequest(all = true)))
    }

    companion object {
        val JSON_KOTAK = """
        {"unread":2,"items":[
          {"id":"n1","template":"PENGINGAT_HARIAN_PIC","title":"Laporan harian belum dikirim",
           "body":"SIM RS Bhakti Rahayu belum melapor hari ini.","tab":"daily-input",
           "createdAt":"2026-10-13T02:55:00.000Z","readAt":null},
          {"id":"n2","template":"KEPUTUSAN_AKSES","title":"KEPUTUSAN_AKSES","body":"","tab":null,
           "createdAt":"2026-10-12T02:00:00.000Z","readAt":null},
          {"id":"n3","template":"REVIEW_OUTPUT","title":"Komentar pada output","body":"Perbaiki lampiran.",
           "tab":"approvals","createdAt":"2026-09-30T02:00:00.000Z","readAt":"2026-10-01T02:00:00.000Z"}
        ]}
        """.trimIndent()
    }
}
