// Layar tab Entitas. Padanan web: entities-view.tsx — hero kepatuhan, pohon
// organisasi (HOLDING sampai PT) dengan pencarian dan buka/ciutkan, lalu
// rincian PT di MkSheet (bukan pindah halaman).
package id.co.monitorkarya.feature.entitas.entitas

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkPenandaTersimpan
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatVariant
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.SimpulEntitasDto
import id.co.monitorkarya.feature.entitas.ui.angka
import id.co.monitorkarya.feature.entitas.ui.labelPeriode
import id.co.monitorkarya.feature.entitas.ui.labelTipe
import id.co.monitorkarya.feature.entitas.ui.persen
import id.co.monitorkarya.feature.entitas.ui.statusKepatuhan
import id.co.monitorkarya.feature.entitas.ui.teksKepatuhan

/** Bundel aksi layar (dipisah dari ViewModel agar layar mudah dipratinjau). */
class AksiEntitas(
    val ulang: () -> Unit = {},
    val setCari: (String) -> Unit = {},
    val alih: (String, Int) -> Unit = { _, _ -> },
    val alihSemua: () -> Unit = {},
    val pilih: (SimpulEntitasDto?) -> Unit = {},
)

@Composable
internal fun EntitasLayar(
    peran: Peran,
    vm: EntitasViewModel,
    modifier: Modifier = Modifier,
) {
    val pohon by vm.pohon.collectAsStateWithLifecycle()
    val baris by vm.baris.collectAsStateWithLifecycle()
    val cari by vm.cari.collectAsStateWithLifecycle()
    val semuaTerbuka by vm.semuaTerbuka.collectAsStateWithLifecycle()
    val terpilih by vm.terpilih.collectAsStateWithLifecycle()
    val detail by vm.detail.collectAsStateWithLifecycle()
    val aktivitas by vm.aktivitas.collectAsStateWithLifecycle()

    val aksi = AksiEntitas(
        ulang = vm::muat,
        setCari = vm::setCari,
        alih = vm::alih,
        alihSemua = vm::alihSemua,
        pilih = vm::pilih,
    )

    Box(modifier = modifier.fillMaxSize()) {
        when (val p = pohon) {
            PohonUi.Memuat -> KerangkaEntitas()
            is PohonUi.Galat -> Column(Modifier.padding(horizontal = MkSpacing.space3)) {
                KepalaEntitas()
                ErrorNote(pesan = p.pesan, onCobaLagi = aksi.ulang)
            }
            is PohonUi.Siap -> if (p.pohon.isEmpty()) {
                Column(Modifier.padding(horizontal = MkSpacing.space3)) {
                    KepalaEntitas()
                    EmptyNote(teks = stringResource(R.string.ent_entitas_kosong), ikon = Icons.Outlined.Apartment)
                }
            } else {
                IsiPohon(
                    siap = p,
                    baris = baris,
                    cari = cari,
                    semuaTerbuka = semuaTerbuka,
                    terpilihId = terpilih?.id,
                    aksi = aksi,
                )
            }
        }
    }

    terpilih?.let { simpul ->
        SheetEntitas(
            peran = peran,
            simpul = simpul,
            detail = detail,
            aktivitas = aktivitas,
            onTutup = { vm.pilih(null) },
            onCobaLagi = vm::muatDetail,
            aksiAktivitas = AksiAktivitas(
                setKadens = vm::setKadens,
                setPrioritas = vm::setPrioritas,
                sebelumnya = vm::periodeSebelumnya,
                berikutnya = vm::periodeBerikutnya,
                hariIni = vm::kembaliKeHariIni,
                ulang = vm::muatAktivitas,
            ),
        )
    }
}

@Composable
private fun KepalaEntitas() {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier.padding(vertical = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Text(text = stringResource(R.string.ent_entitas_konteks), style = MkTypography.footnote, color = warna.ink2)
        Text(text = stringResource(R.string.ent_entitas_judul), style = MkTypography.title1, color = warna.ink)
    }
}

@Composable
private fun KerangkaEntitas() {
    Column(
        modifier = Modifier.padding(horizontal = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        KepalaEntitas()
        MkSkeleton(modifier = Modifier.fillMaxWidth(), tinggi = 120.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            MkSkeleton(modifier = Modifier.weight(1f), tinggi = 88.dp)
            MkSkeleton(modifier = Modifier.weight(1f), tinggi = 88.dp)
        }
        repeat(5) { MkSkeleton(modifier = Modifier.fillMaxWidth(), tinggi = 44.dp) }
    }
}

@Composable
private fun IsiPohon(
    siap: PohonUi.Siap,
    baris: List<BarisPohon>,
    cari: String,
    semuaTerbuka: Boolean,
    terpilihId: String?,
    aksi: AksiEntitas,
) {
    val ringkas = ringkasPohon(siap.pohon)
    val adaCabang = cabang(siap.pohon).isNotEmpty()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = MkSpacing.space3, end = MkSpacing.space3, bottom = MkSpacing.space16),
    ) {
        item(key = "kepala") { KepalaEntitas() }
        // B6: pohon dari potret Room (server tak terjangkau) selalu ditandai.
        siap.tersimpanPada?.let { t ->
            item(key = "tersimpan") { MkPenandaTersimpan(tersimpanPadaMs = t, modifier = Modifier.padding(bottom = MkSpacing.space3)) }
        }
        item(key = "hero") { HeroEntitas(ringkas = ringkas, periodKey = siap.periodKey) }
        item(key = "kontrol") {
            Column(
                modifier = Modifier.padding(top = MkSpacing.space6, bottom = MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
            ) {
                JudulPohon(adaCabang = adaCabang, semuaTerbuka = semuaTerbuka, onAlihSemua = aksi.alihSemua)
                MkField(
                    nilai = cari,
                    onUbah = aksi.setCari,
                    label = stringResource(R.string.ent_entitas_cari_label),
                    placeholder = stringResource(R.string.ent_entitas_cari_placeholder),
                )
            }
        }
        if (baris.isEmpty()) {
            item(key = "kosong-cari") {
                EmptyNote(
                    teks = stringResource(R.string.ent_entitas_cari_kosong, cari.trim()),
                    ikon = Icons.Outlined.SearchOff,
                    teksAksi = stringResource(R.string.ent_entitas_hapus_pencarian),
                    onAksi = { aksi.setCari("") },
                )
            }
        } else {
            items(baris, key = { it.simpul.id }) { b ->
                BarisSimpul(
                    baris = b,
                    dipilih = b.simpul.id == terpilihId,
                    onAlih = { aksi.alih(b.simpul.id, b.kedalaman) },
                    onPilih = { aksi.pilih(b.simpul) },
                )
                MkDivider()
            }
        }
    }
}

@Composable
private fun JudulPohon(adaCabang: Boolean, semuaTerbuka: Boolean, onAlihSemua: () -> Unit) {
    val warna = LocalMkColors.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = stringResource(R.string.ent_entitas_pohon_judul), style = MkTypography.title3, color = warna.ink)
            Text(text = stringResource(R.string.ent_entitas_pohon_sub), style = MkTypography.footnote, color = warna.ink2)
        }
        if (adaCabang) {
            MkButton(
                label = stringResource(if (semuaTerbuka) R.string.ent_umum_ciutkan_semua else R.string.ent_umum_buka_semua),
                onClick = onAlihSemua,
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
            )
        }
    }
}

/** Hero: jawaban satu kalimat + empat angka (padanan EntitiesHero). */
@Composable
private fun HeroEntitas(ringkas: RingkasanPohon, periodKey: String) {
    val warna = LocalMkColors.current
    val jawaban = when {
        ringkas.jumlahPt == 0 -> stringResource(R.string.ent_entitas_hero_tanpa_pt)
        ringkas.perluPerhatian.isEmpty() -> stringResource(R.string.ent_entitas_hero_semua_patuh, angka(ringkas.jumlahPt))
        else -> stringResource(
            R.string.ent_entitas_hero_perlu_perhatian,
            angka(ringkas.perluPerhatian.size),
            angka(ringkas.jumlahPt),
        )
    }
    val dukung = if (ringkas.perluPerhatian.isNotEmpty()) {
        val nama = ringkas.perluPerhatian.take(3).joinToString(", ")
        val sisa = ringkas.perluPerhatian.size - 3
        val daftar = if (sisa > 0) stringResource(R.string.ent_entitas_hero_dan_lainnya, nama, sisa) else nama
        stringResource(R.string.ent_entitas_hero_dukung_perhatian, daftar)
    } else {
        stringResource(R.string.ent_entitas_hero_dukung_bawaan)
    }
    MkCard {
        Text(
            text = stringResource(R.string.ent_entitas_hero_eyebrow, labelPeriode(periodKey)),
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        Spacer(Modifier.size(MkSpacing.space1))
        Text(text = jawaban, style = MkTypography.title2, color = warna.ink)
        Spacer(Modifier.size(MkSpacing.space2))
        Text(text = dukung, style = MkTypography.body, color = warna.ink2)
        Spacer(Modifier.size(MkSpacing.space4))
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_pt),
                value = ringkas.jumlahPt,
                variant = MkStatVariant.INSET,
            )
            val rata = ringkas.rataRata
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_rata),
                value = if (rata == null) "–" else persen(rata),
                tone = if (rata == null) MkStatus.NEUTRAL else statusKepatuhan(rata),
                delta = if (rata == null) stringResource(R.string.ent_entitas_kpi_belum_skor) else null,
            )
        }
        Spacer(Modifier.size(MkSpacing.space3))
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_tertunda),
                value = ringkas.tertunda,
                tone = if (ringkas.tertunda > 0) MkStatus.RISK else MkStatus.ON,
                delta = stringResource(
                    if (ringkas.tertunda > 0) R.string.ent_entitas_kpi_tertunda_ada else R.string.ent_entitas_kpi_tertunda_nol,
                ),
            )
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_terlambat),
                value = ringkas.terlambatHariIni,
                tone = if (ringkas.terlambatHariIni > 0) MkStatus.LATE else MkStatus.ON,
                delta = stringResource(
                    if (ringkas.terlambatHariIni > 0) R.string.ent_entitas_kpi_terlambat_ada else R.string.ent_entitas_kpi_terlambat_nol,
                ),
            )
        }
    }
}

/**
 * Satu baris pohon: twisty (bila punya anak), ikon tipe, nama + tipe/wilayah,
 * lencana kepatuhan. PT membuka sheet; simpul lain membuka/menutup cabangnya.
 */
@Composable
private fun BarisSimpul(
    baris: BarisPohon,
    dipilih: Boolean,
    onAlih: () -> Unit,
    onPilih: () -> Unit,
) {
    val warna = LocalMkColors.current
    val s = baris.simpul
    val adalahPt = s.type == "PT"
    val labelKeadaan = stringResource(if (baris.terbuka) R.string.ent_umum_terbuka else R.string.ent_umum_tertutup)
    val klik: (() -> Unit)? = when {
        adalahPt -> onPilih
        baris.punyaAnak -> onAlih
        else -> null
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (klik != null) {
                    Modifier.clickable(role = Role.Button, onClick = klik)
                } else {
                    Modifier
                },
            )
            .semantics { if (baris.punyaAnak) stateDescription = labelKeadaan }
            .padding(start = (baris.kedalaman * INDENT_DP).dp, top = MkSpacing.space1, bottom = MkSpacing.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        if (baris.punyaAnak) {
            Icon(
                imageVector = if (baris.terbuka) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight,
                contentDescription = stringResource(
                    if (baris.terbuka) R.string.ent_entitas_ciutkan_simpul else R.string.ent_entitas_buka_simpul,
                    s.name,
                ),
                tint = warna.ink2,
                // Target sentuh 48dp (aturan aksesibilitas), ikon tetap 24dp.
                modifier = Modifier
                    .size(TARGET_SENTUH_DP.dp)
                    .clickable(role = Role.Button, onClick = onAlih)
                    .padding(PADDING_CHEVRON_DP.dp),
            )
        } else {
            Spacer(Modifier.size(TARGET_SENTUH_DP.dp))
        }
        Icon(
            imageVector = if (adalahPt) Icons.Outlined.Apartment else Icons.Outlined.AccountTree,
            contentDescription = null,
            tint = if (dipilih) warna.ink else warna.ink2,
            modifier = Modifier.size(18.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = s.name,
                style = if (dipilih) MkTypography.bodyStrong else MkTypography.body,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val ptBerskor = stringResource(R.string.ent_entitas_pt_berskor, baris.jumlahPtBerskor)
            val sub = buildString {
                append(labelTipe(s.type))
                s.region?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
                if (!adalahPt && baris.jumlahPtBerskor > 0) append(" · ").append(ptBerskor)
            }
            Text(text = sub, style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        baris.skor?.let { skor ->
            StatusBadge(status = statusKepatuhan(skor), size = MkBadgeSize.SM, text = teksKepatuhan(skor))
        }
    }
}

private const val INDENT_DP = 16

/** Target sentuh minimum Android (48dp) untuk chevron buka/ciutkan. */
private const val TARGET_SENTUH_DP = 48
private const val PADDING_CHEVRON_DP = 12
