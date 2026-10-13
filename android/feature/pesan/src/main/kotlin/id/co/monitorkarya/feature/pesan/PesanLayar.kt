// Layar Kotak masuk terpadu semua peran (keputusan pemilik 10 Okt 2026) —
// paritas pesan-view.tsx: kepala + kalimat jawaban "n pesan belum dibaca.",
// saringan Semua/Belum dibaca, daftar (ikon jenis + judul tebal bila belum
// dibaca + titik aksen + isi 2 baris + "Jenis · relatif"), detail di Sheet
// (Pesan · Waktu WIB · Status). Web tidak menyediakan balas/kirim, jadi layar
// ini juga baca-saja. Tab tindak lanjut ditulis sebagai teks karena titik
// masuk tidak membawa callback navigasi tab (lihat laporan A2).
package id.co.monitorkarya.feature.pesan

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.pesan.data.PesanDto
import id.co.monitorkarya.feature.pesan.logika.JenisPesan
import id.co.monitorkarya.feature.pesan.logika.Saring
import id.co.monitorkarya.feature.pesan.logika.WaktuPesan
import id.co.monitorkarya.feature.pesan.logika.jenisPesan
import id.co.monitorkarya.feature.pesan.logika.kalimatJawaban
import id.co.monitorkarya.feature.pesan.logika.labelTemplate
import id.co.monitorkarya.feature.pesan.logika.tabTerkait

/** Titik masuk layar Kotak masuk. */
@Composable
fun PesanLayar(peran: Peran, onTutup: () -> Unit, modifier: Modifier = Modifier) {
    val vm: PesanViewModel = hiltViewModel()
    val ui by vm.ui.collectAsStateWithLifecycle()
    // Segarkan setiap kali layar dibuka (bukan saat rotasi): ViewModel hidup sepanjang sesi.
    var sudahDisegarkan by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!sudahDisegarkan) {
            sudahDisegarkan = true
            vm.dibuka()
        }
    }
    PesanLayarIsi(
        ui = ui,
        peran = peran,
        onTutup = onTutup,
        onMuat = vm::muat,
        onSaring = vm::saring,
        onBuka = vm::buka,
        onTutupDetail = vm::tutup,
        onTandaiSemua = vm::tandaiSemua,
        onNotifikasiTampil = vm::notifikasiTampil,
        modifier = modifier,
    )
}

/** Versi state-murni (pratinjau/uji). */
@Composable
fun PesanLayarIsi(
    ui: PesanUi,
    peran: Peran,
    onTutup: () -> Unit,
    modifier: Modifier = Modifier,
    onMuat: () -> Unit = {},
    onSaring: (Saring) -> Unit = {},
    onBuka: (PesanDto) -> Unit = {},
    onTutupDetail: () -> Unit = {},
    onTandaiSemua: () -> Unit = {},
    onNotifikasiTampil: () -> Unit = {},
) {
    val warna = LocalMkColors.current
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(ui.notifikasi?.id) {
        val n = ui.notifikasi ?: return@LaunchedEffect
        snackbar.showSnackbar(n.pesan)
        onNotifikasiTampil()
    }

    Box(modifier = modifier.fillMaxSize().background(warna.bg)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            Kepala(ui, onTutup, onMuat, onTandaiSemua)
            when {
                ui.memuat && ui.data == null -> Kerangka()
                ui.data == null -> ErrorNote(
                    pesan = ui.galat ?: stringResource(R.string.pesan_galat),
                    onCobaLagi = onMuat,
                )
                else -> {
                    Text(
                        text = kalimatJawaban(ui.belumDibaca),
                        style = MkTypography.title3,
                        color = warna.ink,
                    )
                    MkSegmentedControl(
                        options = listOf(
                            MkOpsi(value = Saring.SEMUA.name, label = stringResource(R.string.pesan_saring_semua)),
                            MkOpsi(
                                value = Saring.BELUM.name,
                                label = stringResource(R.string.pesan_saring_belum),
                                count = ui.belumDibaca,
                            ),
                        ),
                        terpilih = ui.saring.name,
                        onPilih = { v -> onSaring(Saring.valueOf(v)) },
                    )
                    DaftarPesan(
                        ui = ui,
                        onBuka = onBuka,
                        modifier = Modifier
                            .weight(1f)
                            .alpha(if (ui.menyegarkan) 0.6f else 1f),
                    )
                }
            }
        }
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    DetailPesan(pesan = ui.terbuka, peran = peran, onTutup = onTutupDetail)
}

@Composable
private fun Kepala(ui: PesanUi, onTutup: () -> Unit, onMuat: () -> Unit, onTandaiSemua: () -> Unit) {
    val warna = LocalMkColors.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        MkIconBtn(
            icon = Icons.AutoMirrored.Outlined.ArrowBack,
            label = stringResource(R.string.pesan_tutup),
            onClick = onTutup,
        )
        Column(Modifier.weight(1f).padding(start = MkSpacing.space2)) {
            Text(stringResource(R.string.pesan_konteks), style = MkTypography.footnote, color = warna.ink2)
            Text(
                stringResource(R.string.pesan_judul),
                style = MkTypography.title1,
                color = warna.ink,
                modifier = Modifier.semantics { heading() },
            )
        }
        MkIconBtn(
            icon = Icons.Outlined.Refresh,
            label = stringResource(R.string.pesan_muat_ulang),
            enabled = !ui.memuat && !ui.menyegarkan,
            onClick = onMuat,
        )
    }
    if (ui.belumDibaca > 0) {
        MkButton(
            label = if (ui.menandaiSemua) stringResource(R.string.pesan_menandai) else stringResource(R.string.pesan_tandai_semua),
            size = MkButtonSize.S,
            enabled = !ui.menandaiSemua,
            onClick = onTandaiSemua,
        )
    }
}

@Composable
private fun DaftarPesan(ui: PesanUi, onBuka: (PesanDto) -> Unit, modifier: Modifier = Modifier) {
    val daftar = ui.tampil
    MkCard(modifier = modifier.fillMaxWidth(), padding = MkSpacing.space2) {
        if (daftar.isEmpty()) {
            val belum = ui.saring == Saring.BELUM
            EmptyNote(
                teks = stringResource(if (belum) R.string.pesan_kosong_belum else R.string.pesan_kosong),
                done = belum,
                ikon = Icons.Outlined.Notifications,
            )
            return@MkCard
        }
        LazyColumn {
            itemsIndexed(daftar, key = { _, p -> p.id }) { i, p ->
                if (i > 0) MkDivider()
                BarisPesan(p, onKlik = { onBuka(p) })
            }
        }
    }
}

@Composable
private fun BarisPesan(p: PesanDto, onKlik: () -> Unit) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val jenis = jenisPesan(p)
    val waktu = WaktuPesan.relatif(p.createdAt)
    val label = stringResource(
        if (p.dibaca) R.string.pesan_baris_label else R.string.pesan_baris_label_belum,
        jenis.label,
        p.title,
        waktu,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(MkShapes.md)
            .clickable(role = Role.Button, onClick = onKlik)
            .clearAndSetSemantics { contentDescription = label }
            .padding(horizontal = MkSpacing.space2, vertical = MkSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        IkonJenis(jenis)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = p.title,
                    style = MkTypography.body,
                    fontWeight = if (p.dibaca) FontWeight.Normal else FontWeight.SemiBold,
                    color = warna.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (!p.dibaca) {
                    Spacer(Modifier.size(MkSpacing.space2))
                    Box(Modifier.size(8.dp).clip(CircleShape).background(aksen.fill))
                }
            }
            if (p.body.isNotBlank()) {
                Text(p.body, style = MkTypography.footnote, color = warna.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text("${jenis.label} · $waktu", style = MkTypography.caption, color = warna.ink2)
        }
        Icon(
            Icons.AutoMirrored.Outlined.KeyboardArrowRight,
            contentDescription = null,
            tint = warna.ink3,
            modifier = Modifier.size(18.dp),
        )
    }
}

/** Ikon jenis dalam lingkaran lembut (mk-empty__icon + mk-soft--*). */
@Composable
private fun IkonJenis(jenis: JenisPesan) {
    val warna = LocalMkColors.current
    val (ikon: ImageVector, latar: Color, isi: Color) = when (jenis) {
        JenisPesan.KOMENTAR -> Triple(Icons.Outlined.ChatBubbleOutline, warna.fill1, warna.ink2)
        JenisPesan.PERSETUJUAN -> Triple(Icons.Outlined.TaskAlt, warna.statusOnSoft, warna.statusDone)
        JenisPesan.PENGINGAT -> Triple(Icons.Outlined.Notifications, warna.statusInfoSoft, warna.statusInfo)
        JenisPesan.PEMBERITAHUAN -> Triple(Icons.Outlined.Info, warna.fill1, warna.ink2)
    }
    Box(
        modifier = Modifier.size(36.dp).clip(CircleShape).background(latar),
        contentAlignment = Alignment.Center,
    ) {
        Icon(ikon, contentDescription = null, tint = isi, modifier = Modifier.size(18.dp))
    }
}

/** Sheet detail: Pesan · Waktu (WIB) · Status · Tindak lanjut (bila tab terlihat untuk peran). */
@Composable
private fun DetailPesan(pesan: PesanDto?, peran: Peran, onTutup: () -> Unit) {
    val warna = LocalMkColors.current
    val jenis = pesan?.let { jenisPesan(it) }
    val eyebrow = pesan?.let { labelTemplate(it.template) } ?: jenis?.label
    MkSheet(
        visible = pesan != null,
        onTutup = onTutup,
        judul = pesan?.title.orEmpty(),
        subjudul = listOfNotNull(eyebrow, pesan?.let { WaktuPesan.tanggalJam(it.createdAt) }).joinToString(" · "),
        backLabel = stringResource(R.string.pesan_judul),
    ) {
        val p = pesan ?: return@MkSheet
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
            Bagian(stringResource(R.string.pesan_bagian_pesan)) {
                if (p.body.isNotBlank()) {
                    Text(p.body, style = MkTypography.body, color = warna.ink)
                } else {
                    Text(stringResource(R.string.pesan_tanpa_isi), style = MkTypography.footnote, color = warna.ink2)
                }
            }
            Bagian(stringResource(R.string.pesan_bagian_waktu)) {
                Text("${WaktuPesan.tanggalJam(p.createdAt)} WIB", style = MkTypography.footnote, color = warna.ink)
                Text(
                    "Diterima ${WaktuPesan.relatif(p.createdAt).lowercase()}",
                    style = MkTypography.caption,
                    color = warna.ink2,
                )
            }
            Bagian(stringResource(R.string.pesan_bagian_status)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(8.dp).clip(CircleShape)
                            .background(if (p.dibaca) warna.ink3 else LocalAccent.current.fill),
                    )
                    Text(
                        stringResource(if (p.dibaca) R.string.pesan_sudah_dibaca else R.string.pesan_belum_dibaca),
                        style = MkTypography.footnote,
                        color = warna.ink,
                        modifier = Modifier.padding(start = MkSpacing.space2),
                    )
                }
            }
            tabTerkait(p, peran)?.let { tab ->
                Bagian(stringResource(R.string.pesan_bagian_tindak)) {
                    Text(
                        stringResource(R.string.pesan_tindak_tab, tab.label),
                        style = MkTypography.footnote,
                        color = warna.ink,
                    )
                }
            }
        }
    }
}

@Composable
private fun Bagian(judul: String, isi: @Composable () -> Unit) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Text(judul, style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(MkShapes.md)
                .background(warna.fill1)
                .padding(MkSpacing.space3),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
        ) { isi() }
    }
}

/** Kerangka seukuran isi: jawaban, saringan, enam baris. */
@Composable
private fun Kerangka() {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        MkSkeleton(tinggi = 26.dp, lebar = 220.dp)
        MkSkeleton(tinggi = 40.dp, lebar = 260.dp)
        repeat(6) { MkSkeleton(tinggi = 64.dp) }
    }
}
