// Model tampil Kotak masuk — bentuk JSON persis src/app/api/notifications/route.ts:
//  GET   ?inbox=1 → {unread, items:[{id, template, title, body, tab, createdAt, readAt}]}
//         (30 terbaru milik akun sendiri, kanal APLIKASI)
//  PATCH {ids?: string[], all?: true} → {ok, marked}; 422 bila keduanya kosong.
// D1 (S2): data datang dari KotakMasukRepo (:core:data) yang juga dibaca
// lonceng; modul ini tidak lagi punya API/repo sendiri.
package id.co.monitorkarya.feature.pesan.data

import id.co.monitorkarya.core.data.repo.KotakMasuk
import id.co.monitorkarya.core.network.dto.InboxItemDto
import kotlinx.serialization.Serializable

@Serializable
data class KotakMasukDto(
    val unread: Int = 0,
    val items: List<PesanDto> = emptyList(),
)

@Serializable
data class PesanDto(
    val id: String,
    val template: String = "",
    val title: String = "",
    val body: String = "",
    /** NavTabId web ("daily-input", "approvals", …) atau null. */
    val tab: String? = null,
    val createdAt: String? = null,
    val readAt: String? = null,
) {
    val dibaca: Boolean get() = readAt != null
}

/** DTO bersama :core:network → model tampil Pesan. */
fun InboxItemDto.kePesan(): PesanDto = PesanDto(
    id = id,
    template = template,
    title = title,
    body = body,
    tab = tab,
    createdAt = createdAt.ifBlank { null },
    readAt = readAt,
)

/** Potret repo bersama → model tampil Pesan. */
fun KotakMasuk.keKotak(): KotakMasukDto = KotakMasukDto(unread = belumDibaca, items = items.map { it.kePesan() })
