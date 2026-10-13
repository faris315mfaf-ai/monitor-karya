// Draf otomatis poin Ringkasan untuk Direktur (G1, keputusan pemilik 13 Okt
// 2026). Fungsi murni — diuji di app/src/test (DrafRingkasanTest).
package id.co.monitorkarya.app.ui.tim

import id.co.monitorkarya.core.data.repo.KunciDraf
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** Ringkasan masih bisa disunting (belum terkirim, tidak terkunci). */
internal fun bolehSuntingRingkasan(data: RingkasanDirekturUi): Boolean =
    !data.terkirim && data.terblokirPesan == null

/** Alamat draf: satu per divisi per minggu. */
internal fun kunciDrafRingkasan(data: RingkasanDirekturUi): KunciDraf =
    KunciDraf(KunciDraf.RINGKASAN_DIREKTUR, data.divisiId, data.mingguKunci)

/** JSON draf bila poin berbeda dari versi server dan masih bisa disunting; null = buang. */
internal fun isiDrafRingkasan(poin: List<String>, poinAwal: List<String>, bolehSunting: Boolean): String? =
    if (bolehSunting && poin != poinAwal) poinKeJson(poin) else null

internal fun poinKeJson(poin: List<String>): String = buildJsonObject {
    put("v", 1)
    putJsonArray("poin") { poin.take(POIN_MAKS).forEach { add(JsonPrimitive(it.take(POIN_MAKS_HURUF))) } }
}.toString()

/** Kebalikan [poinKeJson]; null bila rusak/kosong. */
internal fun poinDariJson(json: String?): List<String>? {
    if (json.isNullOrBlank()) return null
    val o = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull() ?: return null
    val daftar = (o["poin"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.contentOrNull }
    return daftar?.take(POIN_MAKS)?.takeIf { it.isNotEmpty() }
}
