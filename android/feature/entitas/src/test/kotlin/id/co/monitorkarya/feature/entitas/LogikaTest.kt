package id.co.monitorkarya.feature.entitas

import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.feature.entitas.data.AkunBarisDto
import id.co.monitorkarya.feature.entitas.data.DivisiPerusahaanDto
import id.co.monitorkarya.feature.entitas.data.KpiRingkasDto
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.PerusahaanDto
import id.co.monitorkarya.feature.entitas.data.SimpulEntitasDto
import id.co.monitorkarya.feature.entitas.entitas.kumpulkanPt
import id.co.monitorkarya.feature.entitas.entitas.ratakanPohon
import id.co.monitorkarya.feature.entitas.entitas.ringkasPohon
import id.co.monitorkarya.feature.entitas.entitas.saringPohon
import id.co.monitorkarya.feature.entitas.entitas.semuaTerbuka
import id.co.monitorkarya.feature.entitas.entitas.skorSimpul
import id.co.monitorkarya.feature.entitas.perusahaan.SaringAkun
import id.co.monitorkarya.feature.entitas.perusahaan.TEMPAT_GRUP
import id.co.monitorkarya.feature.entitas.perusahaan.TEMPAT_SEMUA
import id.co.monitorkarya.feature.entitas.perusahaan.bisaSentuh
import id.co.monitorkarya.feature.entitas.perusahaan.kelengkapan
import id.co.monitorkarya.feature.entitas.perusahaan.kodeTurunan
import id.co.monitorkarya.feature.entitas.perusahaan.posisiUntuk
import id.co.monitorkarya.feature.entitas.perusahaan.ringkasMeja
import id.co.monitorkarya.feature.entitas.perusahaan.sandiAcak
import id.co.monitorkarya.feature.entitas.perusahaan.saringAkun
import id.co.monitorkarya.feature.entitas.perusahaan.slugify
import id.co.monitorkarya.feature.entitas.perusahaan.usernameSah
import id.co.monitorkarya.feature.entitas.ui.kataKepatuhan
import id.co.monitorkarya.feature.entitas.ui.labelPeriode
import id.co.monitorkarya.feature.entitas.ui.statusKepatuhan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Logika murni dua tab (padanan pembantu entities-view.tsx, accounts.ts, company-sheet.tsx). */
class LogikaTest {

    private fun pt(id: String, nama: String, skor: Double?, tertunda: Int = 0, terlambat: Int = 0) = SimpulEntitasDto(
        id = id,
        name = nama,
        code = id.uppercase(),
        type = "PT",
        kpi = skor?.let { KpiRingkasDto(complianceScore = it, pendingReports = tertunda, lateToday = terlambat) },
    )

    private val pohon = listOf(
        SimpulEntitasDto(
            id = "h",
            name = "Holding",
            type = "HOLDING",
            children = listOf(
                SimpulEntitasDto(
                    id = "s",
                    name = "Sektor Bangun",
                    type = "SECTOR",
                    children = listOf(
                        SimpulEntitasDto(
                            id = "r",
                            name = "Wilayah Timur",
                            type = "REGION",
                            region = "Surabaya",
                            children = listOf(pt("a", "PT Alfa", 95.0, tertunda = 2), pt("b", "PT Beta", 55.0, terlambat = 1)),
                        ),
                    ),
                ),
                pt("c", "PT Gama", null),
            ),
        ),
    )

    @Test
    fun kumpulkanDanRingkas() {
        assertEquals(listOf("a", "b", "c"), kumpulkanPt(pohon).map { it.id })
        val r = ringkasPohon(pohon)
        assertEquals(3, r.jumlahPt)
        assertEquals(listOf("PT Beta"), r.perluPerhatian)
        assertEquals(75.0, r.rataRata!!, 0.001)
        assertEquals(2, r.tertunda)
        assertEquals(1, r.terlambatHariIni)
    }

    @Test
    fun skorTurunanAbaikanPtTanpaKpi() {
        val (skor, jumlah) = skorSimpul(pohon.single())
        assertEquals(75.0, skor!!, 0.001)
        assertEquals(2, jumlah)
        assertNull(skorSimpul(pt("x", "PT X", null)).first)
    }

    @Test
    fun saringMembawaInduk() {
        val hasil = saringPohon(pohon, "beta")
        val jalur = ratakanPohon(hasil, emptyMap(), mencari = true).map { it.simpul.id }
        assertEquals(listOf("h", "s", "r", "b"), jalur)
        // Wilayah cocok -> seluruh turunannya ikut.
        assertEquals(2, saringPohon(pohon, "surabaya").single().children.single().children.single().children.size)
        assertTrue(saringPohon(pohon, "tidak-ada").isEmpty())
    }

    @Test
    fun bawaanDuaTingkatTerbuka() {
        val baris = ratakanPohon(pohon, emptyMap(), mencari = false)
        // h (0) terbuka, s (1) terbuka, r (2) tertutup -> a/b tidak tampil.
        assertEquals(listOf("h", "s", "r", "c"), baris.map { it.simpul.id })
        assertFalse(semuaTerbuka(pohon, emptyMap()))
        val dibuka = ratakanPohon(pohon, mapOf("r" to true), mencari = false)
        assertEquals(listOf("h", "s", "r", "a", "b", "c"), dibuka.map { it.simpul.id })
        assertTrue(semuaTerbuka(pohon, mapOf("r" to true)))
    }

    @Test
    fun ambangKepatuhan() {
        // Ambang tunggal (KEPUTUSAN-AMBANG-KEPATUHAN.md) — sama dengan peta & grafik ringkasan grup.
        assertEquals(MkStatus.ON, statusKepatuhan(90.0))
        assertEquals(MkStatus.RISK, statusKepatuhan(89.9))
        assertEquals(MkStatus.RISK, statusKepatuhan(75.0))
        assertEquals(MkStatus.LATE, statusKepatuhan(74.9))
        assertEquals(MkStatus.RISK, statusKepatuhan(80.8))
        assertEquals("Baik", kataKepatuhan(90.0))
        assertEquals("Perlu perhatian", kataKepatuhan(80.8))
        assertEquals("Kritis", kataKepatuhan(74.9))
        assertEquals("Oktober 2026", labelPeriode("2026-10"))
        assertEquals("2026-W41", labelPeriode("2026-W41"))
    }

    // ------------------------------------------------------------ Perusahaan

    private fun akun(id: String, peran: String, aktif: Boolean = true, masuk: String? = null, sandi: Boolean = true, pt: String? = "pt1") =
        AkunBarisDto(id = id, name = "Nama $id", username = id, role = peran, isActive = aktif, lastLoginAt = masuk, hasPassword = sandi, scopeEntityId = pt)

    private val ptSatu = PerusahaanDto(
        id = "pt1",
        name = "PT Satu",
        type = "PT",
        address = "Jl. A",
        phone = "021",
        email = "a@b.id",
        logoData = null,
        users = listOf(akun("u1", "ADMIN_PT", masuk = "2026-10-01T00:00:00Z"), akun("u2", "DIREKTUR_ENTITAS", sandi = false)),
        divisions = listOf(DivisiPerusahaanDto("d1", "Keuangan", headUserId = null)),
    )

    private val meja = MejaPerusahaanResponse(
        companies = listOf(PerusahaanDto(id = "h1", name = "Holding", type = "HOLDING"), ptSatu),
        holdingUsers = listOf(akun("sa", "SUPERADMIN", pt = null, masuk = "2026-10-01T00:00:00Z")),
        me = "u1",
        scope = "ENTITY",
        manageableRoles = listOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK"),
    )

    @Test
    fun kelengkapanProfil() {
        val k = kelengkapan(ptSatu)
        // Logo kosong + divisi tanpa kepala = 2 dari 6 belum.
        assertEquals(4, k.selesai)
        assertEquals(67, k.persen)
        assertEquals(100, kelengkapan(PerusahaanDto(id = "h", name = "H", type = "HOLDING", logoData = "x", address = "a", phone = "p", email = "e")).persen)
    }

    @Test
    fun posisiDanWewenangDariServer() {
        assertEquals(listOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK"), posisiUntuk(ptSatu, meja.manageableRoles).map { it.peran })
        assertEquals(4, posisiUntuk(ptSatu, emptyList()).size)
        assertEquals(9, posisiUntuk(PerusahaanDto(id = "h", name = "H", type = "HOLDING"), emptyList()).size)
        assertEquals("SUPERADMIN", posisiUntuk(null, listOf("SUPERADMIN", "ADMIN_PT")).single().peran)
        // Akun sendiri dan posisi di luar manageableRoles tidak bisa disentuh.
        assertFalse(bisaSentuh(ptSatu.users[0], "u1", meja.manageableRoles))
        assertFalse(bisaSentuh(ptSatu.users[1], "u1", meja.manageableRoles))
        assertTrue(bisaSentuh(akun("u5", "PIC_PROYEK"), "u1", meja.manageableRoles))
    }

    @Test
    fun saringanAkun() {
        assertEquals(3, saringAkun(meja, SaringAkun.SEMUA, TEMPAT_SEMUA, null, "").size)
        assertEquals(listOf("sa"), saringAkun(meja, SaringAkun.SEMUA, TEMPAT_GRUP, null, "").map { it.akun.id })
        assertEquals(listOf("u2"), saringAkun(meja, SaringAkun.TANPA_SANDI, TEMPAT_SEMUA, null, "").map { it.akun.id })
        assertEquals(listOf("u2"), saringAkun(meja, SaringAkun.BELUM_MASUK, "pt1", null, "").map { it.akun.id })
        assertEquals(listOf("u1"), saringAkun(meja, SaringAkun.SEMUA, TEMPAT_SEMUA, "ADMIN_PT", "").map { it.akun.id })
        assertEquals(listOf("u2"), saringAkun(meja, SaringAkun.SEMUA, TEMPAT_SEMUA, null, "direktur").map { it.akun.id })
        val r = ringkasMeja(meja)
        assertFalse(r.penuh)
        assertEquals(1, r.tanpaSandi)
        assertEquals(1, r.tanpaKepala)
    }

    @Test
    fun pembantuFormulir() {
        assertEquals("ranikusuma", slugify("Rani Kusumá"))
        assertEquals("PT-MEDCREATIX", kodeTurunan("PT Medcreatix", holding = false))
        assertEquals("HOLDING-KARYA", kodeTurunan("Holding Karya", holding = true))
        assertTrue(usernameSah("rani.k"))
        assertFalse(usernameSah("Ra"))
        val s = sandiAcak()
        assertEquals(12, s.length)
        assertFalse(s.any { it in "0O1lI" })
    }
}
