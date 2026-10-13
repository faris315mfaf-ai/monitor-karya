// Isian Sheet entri yang bertahan saat proses dimatikan (C5-S5). Murni —
// diuji di app/src/test (LembarTersimpanTest).
//
// Membuka pemilih foto/berkas memindahkan aplikasi ke latar; HP RAM kecil
// bisa membunuh prosesnya. Tanpa ini Sheet tertutup, teks panjang "Hasil hari
// ini" hilang, dan kunciTambah (idempotensi entri baru) berganti sehingga
// simpan ulang bisa menggandakan entri. Yang disimpan hanya isian kerja +
// id/kunci (tidak ada sandi/token di Sheet ini); status sementara (sibuk,
// unggah, galat) sengaja tidak dipulihkan.
package id.co.monitorkarya.app.ui.laporan

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/** Kunci SavedStateHandle LaporanViewModel. */
internal const val SIMPAN_LEMBAR = "laporan.lembar"
internal const val SIMPAN_TERPILIH = "laporan.terpilih"
internal const val SIMPAN_TANGGAL = "laporan.tanggal"

internal fun lembarKeJson(l: LembarEntri): String = buildJsonObject {
    put("v", 1)
    l.entriId?.let { put("entriId", it) }
    l.idTersimpan?.let { put("idTersimpan", it) }
    l.kunciTambah?.let { put("kunciTambah", it) }
    tulisIsian(l.isian)
}.toString()

/** Kebalikan [lembarKeJson]; null bila kosong/rusak (Sheet tidak dipulihkan). */
internal fun lembarDariJson(json: String?): LembarEntri? {
    val o = bacaObjek(json) ?: return null
    fun teks(k: String): String? = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
    return LembarEntri(
        entriId = teks("entriId"),
        idTersimpan = teks("idTersimpan"),
        kunciTambah = teks("kunciTambah"),
        isian = bacaIsian(o),
    )
}

/** Isian saja (draf otomatis G1, Room `draf_sunting`) — tanpa id/kunci idempotensi. */
internal fun isianKeJson(i: IsianEntri): String = buildJsonObject {
    put("v", 1)
    tulisIsian(i)
}.toString()

/** Kebalikan [isianKeJson]; null bila kosong/rusak (draf diabaikan). */
internal fun isianDariJson(json: String?): IsianEntri? = bacaObjek(json)?.let(::bacaIsian)

private fun bacaObjek(json: String?): JsonObject? {
    if (json.isNullOrBlank()) return null
    return runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull()
}

private fun JsonObjectBuilder.tulisIsian(i: IsianEntri) {
    put("judul", i.judul)
    put("deskripsi", i.deskripsi)
    put("pelaksana", i.pelaksana)
    put("status", i.status)
    put("progres", i.progres)
    put("hasil", i.hasil)
    put("kendala", i.kendala)
    put("eskalasi", i.eskalasi)
    put("keputusan", i.keputusan)
    put("rencana", i.rencana)
}

private fun bacaIsian(o: JsonObject): IsianEntri {
    fun teks(k: String): String? = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
    val bawaan = IsianEntri()
    return IsianEntri(
        judul = teks("judul") ?: bawaan.judul,
        deskripsi = teks("deskripsi") ?: bawaan.deskripsi,
        pelaksana = teks("pelaksana") ?: bawaan.pelaksana,
        status = teks("status") ?: bawaan.status,
        progres = (o["progres"] as? JsonPrimitive)?.intOrNull ?: bawaan.progres,
        hasil = teks("hasil") ?: bawaan.hasil,
        kendala = teks("kendala") ?: bawaan.kendala,
        eskalasi = (o["eskalasi"] as? JsonPrimitive)?.booleanOrNull ?: bawaan.eskalasi,
        keputusan = teks("keputusan") ?: bawaan.keputusan,
        rencana = teks("rencana") ?: bawaan.rencana,
    )
}
