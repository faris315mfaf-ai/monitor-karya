// Draf otomatis Sheet butir capaian mingguan (G1, keputusan pemilik 13 Okt
// 2026): suntingan butir yang ditinggalkan disimpan per (uid, butir / butir
// baru divisi, kunci minggu) dan dipulihkan saat Sheet dibuka lagi, tanpa
// dialog. Fungsi murni — diuji di app/src/test (DrafButirTest).
package id.co.monitorkarya.app.ui.mingguan

import id.co.monitorkarya.core.data.repo.Draf
import id.co.monitorkarya.core.data.repo.KunciDraf
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/** Papan divisi boleh disunting (DRAFT terbuka) — sama dengan aturan layar. */
internal fun bolehSuntingButir(divisi: DivisiMingguan): Boolean =
    divisi.bisaTulis && divisi.laporan?.statusHeader.orEmpty() in setOf("", "DRAFT")

/** Isian Sheet saat dibuka tanpa draf (butir tersimpan atau butir baru kosong). */
internal fun isianAwalButir(butir: ButirMingguan?): IsianButir = IsianButir(
    aspekId = butir?.aspekId.orEmpty(),
    prioritasId = butir?.prioritasId.orEmpty(),
    pekerjaan = butir?.pekerjaan.orEmpty(),
    target = butir?.target.orEmpty(),
    picNama = butir?.picNama.orEmpty(),
    status = butir?.status ?: "BELUM_MULAI",
    progres = butir?.progres ?: 0,
    capaian = butir?.capaian.orEmpty(),
    kendala = butir?.kendala.orEmpty(),
    tindakLanjut = butir?.tindakLanjut.orEmpty(),
)

/** Alamat draf: butir tersimpan memakai id-nya, butir baru "baru:<divisi>"; per minggu. */
internal fun kunciDrafButir(divisiId: String, butir: ButirMingguan?, kunciMinggu: String): KunciDraf =
    KunciDraf(KunciDraf.MINGGUAN_BUTIR, butir?.id ?: KunciDraf.baru(divisiId), kunciMinggu)

/** JSON draf bila [isian] berbeda dari versi tersimpan dan papan masih bisa ditulis; null = buang. */
internal fun isiDrafButir(isian: IsianButir, butir: ButirMingguan?, bolehSunting: Boolean): String? =
    if (bolehSunting && isian != isianAwalButir(butir)) isianButirKeJson(isian) else null

/** Draf yang dipulihkan ke Sheet; null bila rusak atau sama dengan versi tersimpan. */
internal fun drafButirUntuk(draf: Draf?, butir: ButirMingguan?): IsianButir? =
    isianButirDariJson(draf?.json)?.takeIf { it != isianAwalButir(butir) }

internal fun isianButirKeJson(i: IsianButir): String = buildJsonObject {
    put("v", 1)
    put("aspekId", i.aspekId)
    put("prioritasId", i.prioritasId)
    put("pekerjaan", i.pekerjaan)
    put("target", i.target)
    put("picNama", i.picNama)
    put("status", i.status)
    put("progres", i.progres)
    put("capaian", i.capaian)
    put("kendala", i.kendala)
    put("tindakLanjut", i.tindakLanjut)
}.toString()

internal fun isianButirDariJson(json: String?): IsianButir? {
    if (json.isNullOrBlank()) return null
    val o = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull() ?: return null
    fun teks(k: String): String = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull.orEmpty()
    return IsianButir(
        aspekId = teks("aspekId"),
        prioritasId = teks("prioritasId"),
        pekerjaan = teks("pekerjaan"),
        target = teks("target"),
        picNama = teks("picNama"),
        status = teks("status").ifEmpty { "BELUM_MULAI" },
        progres = ((o["progres"] as? JsonPrimitive)?.intOrNull ?: 0).coerceIn(0, 100),
        capaian = teks("capaian"),
        kendala = teks("kendala"),
        tindakLanjut = teks("tindakLanjut"),
    )
}
