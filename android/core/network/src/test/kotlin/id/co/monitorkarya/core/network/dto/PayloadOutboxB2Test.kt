package id.co.monitorkarya.core.network.dto

import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * B2 — payload outbox laporan harian PIC bolak-balik (encode → simpan Room →
 * decode → encode ulang oleh pekerja) TANPA kehilangan medan dan dengan byte
 * yang sama dengan permintaan daring. Temuan A1: mendekode entri sebagai
 * TaskSaveRequest membuang achievementToday/followUp/needsEscalation.
 */
class PayloadOutboxB2Test {

    private fun <T> bolakBalik(serializer: KSerializer<T>, nilai: T): T {
        val json = mkJson.encodeToString(serializer, nilai)
        val balik = mkJson.decodeFromString(serializer, json)
        // Pekerja mengirim ulang badan terdekode: byte harus sama dengan aslinya.
        assertEquals(json, mkJson.encodeToString(serializer, balik))
        return balik
    }

    private val entriPenuh = EntriSimpanRequest(
        context = "HARIAN",
        title = "Pasang panel",
        description = "Segmen 3",
        picName = "Rani",
        status = "TERKENDALA",
        progressPct = 40,
        obstacle = "Hujan",
        decisionNeeded = "Tambah tenda",
        achievementToday = "Panel 1-4 terpasang",
        followUp = "Lanjut panel 5",
        needsEscalation = true,
        projectId = "p-1",
        id = "t-1",
        workDate = "2026-10-13",
        picUserId = "u-9",
        tags = listOf("listrik", "k3"),
        urgency = "TINGGI",
        startTime = "08:00",
        endTime = "11:30",
        subtasks = listOf(SubtaskInputDto("Kabel", true), SubtaskInputDto("Uji", false)),
    )

    @Test
    fun entriPenuhUtuhSetelahBolakBalik() {
        assertEquals(entriPenuh, bolakBalik(EntriSimpanRequest.serializer(), entriPenuh))
    }

    @Test
    fun medanNarasiKosongTetapTerkirimEksplisitAgarServerMembersihkan() {
        val kosong = entriPenuh.copy(achievementToday = null, followUp = null, needsEscalation = false, obstacle = null, decisionNeeded = null)
        val balik = bolakBalik(EntriSimpanRequest.serializer(), kosong)
        assertEquals(kosong, balik)
        val obj = mkJson.parseToJsonElement(mkJson.encodeToString(EntriSimpanRequest.serializer(), balik)).jsonObject
        // PUT server mempertahankan nilai lama bila kunci ABSEN — null/false wajib ada.
        assertEquals(JsonNull, obj["achievementToday"])
        assertEquals(JsonNull, obj["followUp"])
        assertEquals(JsonPrimitive(false), obj["needsEscalation"])
        assertEquals(JsonNull, obj["decisionNeeded"])
    }

    @Test
    fun entriBaruTanpaIdTidakMengirimId() {
        val baru = entriPenuh.copy(id = null)
        val obj = mkJson.parseToJsonElement(mkJson.encodeToString(EntriSimpanRequest.serializer(), baru)).jsonObject
        assertEquals(false, obj.containsKey("id"))
        assertEquals(baru, bolakBalik(EntriSimpanRequest.serializer(), baru))
    }

    @Test
    fun payloadBuktiDanHapusUtuh() {
        val bukti = PayloadUnggahBukti("lokal:3", "a1b2.jpg", "IMG_1.jpg", "image/jpeg", 123_456L, "TASK")
        assertEquals(bukti, bolakBalik(PayloadUnggahBukti.serializer(), bukti))
        val hapus = PayloadHapusEntri("t-1")
        assertEquals(hapus, bolakBalik(PayloadHapusEntri.serializer(), hapus))
    }

    @Test
    fun kirimLaporanDanCentangTugasUtuh() {
        val laporan = DailyInputRequest(
            projectId = "p-1",
            action = "submit",
            status = "",
            achievementToday = "A | B",
            obstacle = "X: hujan",
            followUp = "Lanjut",
            progressPct = 0,
            reportDate = "2026-10-13",
        )
        assertEquals(laporan, bolakBalik(DailyInputRequest.serializer(), laporan))
        val centang = TaskSaveRequest(
            title = "Pasang panel",
            id = "t-1",
            context = "HARIAN",
            description = "Segmen 3",
            picName = "Rani",
            picUserId = "u-9",
            tags = listOf("listrik"),
            status = "SELESAI",
            progressPct = 100,
            urgency = "TINGGI",
            obstacle = null,
            decisionNeeded = null,
            startTime = "08:00",
            endTime = null,
            subtasks = listOf(SubtaskInputDto("Kabel", true)),
        )
        assertEquals(centang, bolakBalik(TaskSaveRequest.serializer(), centang))
    }
}
