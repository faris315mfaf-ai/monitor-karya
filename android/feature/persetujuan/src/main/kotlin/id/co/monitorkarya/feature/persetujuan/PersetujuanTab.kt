// Tab Persetujuan (Fase 3, gelombang A1) — padanan web
// src/components/oversight/approvals-view.tsx untuk Manajemen dan Direktur
// entitas. Ponsel: kepala (konteks, judul, kalimat jawaban), segmented
// Antrean/Riwayat, kartu per jenis (permintaan materi/anggaran/cuti, usulan
// geser tenggat, pengajuan proyek, eskalasi terbuka baca saja), baris dengan
// Tolak/Setujui sekunder, Sheet rincian + berkas + alasan penolakan, snackbar
// "Urungkan" 15 menit.
package id.co.monitorkarya.feature.persetujuan

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
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
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/**
 * Titik masuk publik tab Persetujuan; dipasang parent di MKShell untuk
 * [id.co.monitorkarya.core.domain.roles.TabId.PERSETUJUAN]. [onBukaEskalasi]
 * opsional: bila diisi, kartu "Eskalasi terbuka" menawarkan pindah ke tab Eskalasi.
 */
@Composable
fun PersetujuanTab(
    peran: Peran,
    modifier: Modifier = Modifier,
    onBukaEskalasi: (() -> Unit)? = null,
) {
    val vm: PersetujuanViewModel = hiltViewModel()
    LaunchedEffect(peran) { vm.mulai(peran) }
    val state by vm.state.collectAsStateWithLifecycle()
    val riwayat by vm.riwayat.collectAsStateWithLifecycle()
    val detail by vm.detail.collectAsStateWithLifecycle()
    val sibuk by vm.sibuk.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    val tautan by vm.tautan.collectAsStateWithLifecycle()

    val uri = LocalUriHandler.current
    LaunchedEffect(tautan?.id) {
        val t = tautan ?: return@LaunchedEffect
        // Lapis kedua C1-R1: hanya https yang diserahkan ke sistem.
        val berhasil = tautanAman(t.url) && runCatching { uri.openUri(t.url) }.isSuccess
        if (berhasil) vm.tautanTerbuka() else vm.tautanGagal()
    }

    PersetujuanLayar(
        state = state,
        riwayat = riwayat,
        detail = detail,
        sibuk = sibuk,
        notifikasi = notifikasi,
        aksi = PersetujuanAksi(
            onUlang = vm::ulang,
            onBuka = vm::buka,
            onSetujui = vm::setujui,
            onMintaTolak = vm::mintaTolak,
            onMulaiTolak = vm::mulaiTolak,
            onBatalTolak = vm::batalTolak,
            onUbahAlasan = vm::ubahAlasan,
            onTolak = vm::tolak,
            onTutupSheet = vm::tutupSheet,
            onBukaBerkas = vm::bukaBerkas,
            onUrungkan = vm::urungkan,
            onUrungkanBaris = vm::urungkanBaris,
            onNotifikasiTampil = vm::notifikasiTampil,
            onBukaEskalasi = onBukaEskalasi,
        ),
        modifier = modifier,
    )
}

data class PersetujuanAksi(
    val onUlang: () -> Unit = {},
    val onBuka: (String) -> Unit = {},
    val onSetujui: (String) -> Unit = {},
    val onMintaTolak: (String) -> Unit = {},
    val onMulaiTolak: () -> Unit = {},
    val onBatalTolak: () -> Unit = {},
    val onUbahAlasan: (String) -> Unit = {},
    val onTolak: () -> Unit = {},
    val onTutupSheet: () -> Unit = {},
    val onBukaBerkas: (String) -> Unit = {},
    val onUrungkan: () -> Unit = {},
    val onUrungkanBaris: (String) -> Unit = {},
    val onNotifikasiTampil: () -> Unit = {},
    val onBukaEskalasi: (() -> Unit)? = null,
)

private const val TAB_ANTREAN = "antrean"
private const val TAB_RIWAYAT = "riwayat"

/** Versi state murni — dipratinjau tanpa ViewModel. */
@Composable
fun PersetujuanLayar(
    state: PersetujuanUiState,
    modifier: Modifier = Modifier,
    riwayat: RiwayatPersetujuan = RiwayatPersetujuan(),
    detail: DetailPersetujuan? = null,
    sibuk: String? = null,
    notifikasi: NotifikasiPersetujuan? = null,
    aksi: PersetujuanAksi = PersetujuanAksi(),
) {
    val c = LocalMkColors.current
    var tab by rememberSaveable { mutableStateOf(TAB_ANTREAN) }
    val snackbar = remember { SnackbarHostState() }
    val labelUrungkan = stringResource(R.string.persetujuan_urungkan)

    LaunchedEffect(notifikasi?.id) {
        val n = notifikasi ?: return@LaunchedEffect
        val hasil = snackbar.showSnackbar(
            message = n.pesan,
            actionLabel = n.urungkan?.let { labelUrungkan },
            duration = SnackbarDuration.Long,
        )
        if (hasil == SnackbarResult.ActionPerformed) aksi.onUrungkan() else aksi.onNotifikasiTampil()
    }

    Box(modifier = modifier.fillMaxSize().background(c.bg)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            when (state) {
                PersetujuanUiState.Memuat -> KerangkaPersetujuan()
                is PersetujuanUiState.Galat -> {
                    Text(stringResource(R.string.persetujuan_judul), style = MkTypography.largeTitle, color = c.ink)
                    ErrorNote(pesan = state.pesan, onCobaLagi = aksi.onUlang)
                }
                is PersetujuanUiState.Siap -> {
                    val meja = state.meja
                    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                        Text(meja.konteks, style = MkTypography.footnote, color = c.ink2)
                        Text(stringResource(R.string.persetujuan_judul), style = MkTypography.largeTitle, color = c.ink)
                        Text(meja.jawaban, style = MkTypography.title3, color = c.ink)
                    }
                    MkSegmentedControl(
                        options = listOf(
                            MkOpsi(TAB_ANTREAN, stringResource(R.string.persetujuan_tab_antrean), meja.menunggu),
                            MkOpsi(TAB_RIWAYAT, stringResource(R.string.persetujuan_tab_riwayat), riwayat.items.size),
                        ),
                        terpilih = tab,
                        onPilih = { tab = it },
                    )
                    if (tab == TAB_ANTREAN) IsiAntrean(meja, sibuk, aksi) else IsiRiwayat(riwayat, aksi)
                }
            }
        }
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    val meja = (state as? PersetujuanUiState.Siap)?.meja
    val item = detail?.let { d -> meja?.semua?.firstOrNull { it.kunci == d.kunci } }
    SheetPersetujuan(item = item, detail = detail, sibuk = sibuk, aksi = aksi)
}

@Composable
private fun IsiAntrean(meja: MejaPersetujuan, sibuk: String?, aksi: PersetujuanAksi) {
    if (meja.kosong) {
        EmptyNote(teks = stringResource(R.string.persetujuan_kosong), done = true)
        return
    }
    if (meja.permintaan.isNotEmpty()) {
        KartuBagian(
            judul = stringResource(R.string.persetujuan_bagian_permintaan),
            sub = stringResource(R.string.persetujuan_bagian_permintaan_sub),
        ) { DaftarItem(meja.permintaan, sibuk, aksi) }
    }
    if (meja.tenggat.isNotEmpty()) {
        KartuBagian(
            judul = stringResource(R.string.persetujuan_bagian_tenggat),
            sub = stringResource(R.string.persetujuan_bagian_tenggat_sub),
        ) { DaftarItem(meja.tenggat, sibuk, aksi) }
    }
    if (meja.proyek.isNotEmpty()) {
        KartuBagian(
            judul = stringResource(R.string.persetujuan_bagian_proyek),
            sub = stringResource(R.string.persetujuan_bagian_proyek_sub),
        ) { DaftarItem(meja.proyek, sibuk, aksi) }
    }
    if (meja.eskalasi.isNotEmpty()) {
        val c = LocalMkColors.current
        KartuBagian(
            judul = stringResource(R.string.persetujuan_bagian_eskalasi),
            sub = stringResource(R.string.persetujuan_bagian_eskalasi_sub),
            aksiKanan = aksi.onBukaEskalasi?.let { buka ->
                {
                    MkButton(
                        label = stringResource(R.string.persetujuan_buka_eskalasi),
                        onClick = buka,
                        size = MkButtonSize.S,
                    )
                }
            },
        ) {
            val tampil = meja.eskalasi.take(8)
            tampil.forEachIndexed { i, e ->
                MkListRow(
                    judul = e.ringkasan,
                    sub = e.alasan,
                    onClick = aksi.onBukaEskalasi,
                    trailing = {
                        StatusBadge(
                            status = if (e.lewatSla) MkStatus.LATE else MkStatus.RISK,
                            size = MkBadgeSize.SM,
                            text = e.meta,
                        )
                    },
                )
                if (i < tampil.lastIndex) MkDivider()
            }
            if (meja.eskalasi.size > tampil.size) {
                Text("+${meja.eskalasi.size - tampil.size}", style = MkTypography.footnote, color = c.ink2)
            }
        }
    }
}

@Composable
private fun KartuBagian(
    judul: String,
    sub: String?,
    aksiKanan: (@Composable () -> Unit)? = null,
    isi: @Composable () -> Unit,
) {
    val c = LocalMkColors.current
    MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space4) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(judul, style = MkTypography.headline, color = c.ink)
                sub?.let { Text(it, style = MkTypography.footnote, color = c.ink2) }
            }
            aksiKanan?.invoke()
        }
        Column(modifier = Modifier.padding(top = MkSpacing.space2)) { isi() }
    }
}

@Composable
private fun DaftarItem(items: List<ItemPersetujuan>, sibuk: String?, aksi: PersetujuanAksi) {
    items.forEachIndexed { i, it ->
        BarisItem(it, sibuk, aksi)
        if (i < items.lastIndex) MkDivider()
    }
}

/**
 * Satu baris ApprovalItem: avatar, judul, pengaju·waktu·meta, lalu keputusan.
 * Tolak/Setujui berdampingan di bawah baris (bukan bertumpuk di trailing):
 * tinggi 44dp + area sentuh minimum 48dp, jarak 12dp (C1-S4) — mengetuk
 * "Tolak" tidak lagi bisa mengenai "Setujui".
 */
@Composable
private fun BarisItem(item: ItemPersetujuan, sibuk: String?, aksi: PersetujuanAksi) {
    val sedang = sibuk == item.kunci
    Column {
        MkListRow(
            modifier = Modifier.alpha(if (item.keputusan != null) 0.6f else 1f),
            judul = item.judul,
            sub = listOf(item.pengaju, waktuRelatif(item.waktu), item.meta).filter { it.isNotBlank() }.joinToString(" · "),
            inisial = item.inisial,
            onClick = { aksi.onBuka(item.kunci) },
            trailing = {
                when {
                    item.keputusan != null ->
                        StatusBadge(status = item.keputusan.lencana, size = MkBadgeSize.SM, text = item.keputusan.label)
                    !item.bisaPutuskan ->
                        StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = stringResource(R.string.persetujuan_menunggu))
                    else -> Unit
                }
            },
        )
        when {
            item.keputusan != null && item.bisaUrungkan -> Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MkSpacing.space4),
                horizontalArrangement = Arrangement.End,
            ) {
                MkButton(
                    label = stringResource(R.string.persetujuan_urungkan),
                    onClick = { aksi.onUrungkanBaris(item.kunci) },
                    variant = MkButtonVariant.PLAIN,
                    modifier = Modifier.minimumInteractiveComponentSize(),
                )
            }
            item.keputusan == null && item.bisaPutuskan -> Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = MkSpacing.space4, end = MkSpacing.space4, bottom = MkSpacing.space2),
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
            ) {
                MkButton(
                    label = stringResource(R.string.persetujuan_tolak),
                    onClick = { aksi.onMintaTolak(item.kunci) },
                    variant = MkButtonVariant.PLAIN,
                    enabled = sibuk == null,
                    modifier = Modifier.weight(1f).minimumInteractiveComponentSize(),
                )
                // Setujui sekunder: maksimal satu tombol primer per kartu (02-direktur.md).
                MkButton(
                    label = if (sedang) stringResource(R.string.persetujuan_menyimpan) else stringResource(R.string.persetujuan_setujui),
                    onClick = { aksi.onSetujui(item.kunci) },
                    enabled = sibuk == null,
                    modifier = Modifier.weight(1f).minimumInteractiveComponentSize(),
                )
            }
        }
    }
}

@Composable
private fun IsiRiwayat(riwayat: RiwayatPersetujuan, aksi: PersetujuanAksi) {
    val c = LocalMkColors.current
    when {
        riwayat.galat != null -> ErrorNote(pesan = riwayat.galat, onCobaLagi = aksi.onUlang)
        riwayat.items.isEmpty() -> EmptyNote(teks = stringResource(R.string.persetujuan_riwayat_kosong))
        else -> KartuBagian(
            judul = stringResource(R.string.persetujuan_riwayat_judul),
            sub = stringResource(R.string.persetujuan_riwayat_sub),
        ) {
            riwayat.items.forEachIndexed { i, r ->
                Column(modifier = Modifier.padding(vertical = MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                        Text(r.judul, style = MkTypography.bodyStrong, color = c.ink, modifier = Modifier.weight(1f), maxLines = 2)
                        StatusBadge(status = r.keputusan.lencana, size = MkBadgeSize.SM, text = r.keputusan.label)
                    }
                    Text(r.sub, style = MkTypography.footnote, color = c.ink2)
                    r.catatan?.let { Text(stringResource(R.string.persetujuan_catatan, it), style = MkTypography.footnote, color = c.ink2) }
                }
                if (i < riwayat.items.lastIndex) MkDivider()
            }
        }
    }
}

// ------------------------------------------------------------------ Sheet

@Composable
private fun SheetPersetujuan(item: ItemPersetujuan?, detail: DetailPersetujuan?, sibuk: String?, aksi: PersetujuanAksi) {
    MkSheet(
        visible = item != null && detail != null,
        onTutup = aksi.onTutupSheet,
        judul = item?.judul.orEmpty(),
        subjudul = item?.let { "${it.pengaju} · ${waktuRelatif(it.waktu)}" },
        backLabel = stringResource(R.string.persetujuan_kembali),
        footer = { if (item != null && detail != null) KakiSheet(item, detail, sibuk, aksi) },
    ) {
        if (item != null && detail != null) IsiSheet(item, detail, sibuk, aksi)
    }
}

@Composable
private fun RowScope.KakiSheet(item: ItemPersetujuan, d: DetailPersetujuan, sibuk: String?, aksi: PersetujuanAksi) {
    val sedang = sibuk == item.kunci
    when {
        d.menolak -> {
            MkButton(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.persetujuan_batal),
                onClick = aksi.onBatalTolak,
                enabled = !sedang,
            )
            MkButton(
                modifier = Modifier.weight(1f),
                label = if (sedang) stringResource(R.string.persetujuan_menyimpan) else item.labelTolak,
                onClick = aksi.onTolak,
                variant = MkButtonVariant.PRIMARY,
                enabled = !sedang && sibuk == null && d.alasanSah,
            )
        }
        item.bisaPutuskan && item.keputusan == null -> {
            MkButton(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.persetujuan_tolak),
                onClick = aksi.onMulaiTolak,
                enabled = sibuk == null,
            )
            MkButton(
                modifier = Modifier.weight(1f),
                label = if (sedang) stringResource(R.string.persetujuan_menyimpan) else stringResource(R.string.persetujuan_setujui),
                onClick = { aksi.onSetujui(item.kunci) },
                variant = MkButtonVariant.PRIMARY,
                enabled = sibuk == null,
            )
        }
        else -> MkButton(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.persetujuan_tutup),
            onClick = aksi.onTutupSheet,
            variant = MkButtonVariant.PLAIN,
        )
    }
}

@Composable
private fun IsiSheet(item: ItemPersetujuan, d: DetailPersetujuan, sibuk: String?, aksi: PersetujuanAksi) {
    val c = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
        // Rincian (ApprovalDetail web) dalam kotak inset.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(c.fill1, MkShapes.md)
                .padding(MkSpacing.space3),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Text(item.barisJenis, style = MkTypography.footnote, color = c.ink2)
            item.nominalPenuh?.let { Text(it, style = MkTypography.headline.tabular, color = c.ink) }
            item.rentang?.let { Text(it, style = MkTypography.bodyStrong, color = c.ink) }
            item.deskripsi?.let { Text(it, style = MkTypography.body, color = c.ink) }
            item.berkas?.let { b ->
                MkButton(
                    label = stringResource(R.string.persetujuan_buka_berkas, b.nama) + (b.ukuran?.let { " · $it" } ?: ""),
                    onClick = { aksi.onBukaBerkas(item.id) },
                    size = MkButtonSize.S,
                )
            }
        }

        item.keputusan?.let { StatusBadge(status = it.lencana, size = MkBadgeSize.SM, text = it.label) }
        if (!item.bisaPutuskan && item.keputusan == null) {
            Text(stringResource(R.string.persetujuan_baca_saja), style = MkTypography.footnote, color = c.ink2)
        }

        if (d.menolak) {
            MkField(
                modifier = Modifier.fillMaxWidth(),
                nilai = d.alasan,
                onUbah = aksi.onUbahAlasan,
                label = stringResource(R.string.persetujuan_alasan_label, item.pengaju.split(" ").first()),
                placeholder = item.contohAlasan,
                baris = 4,
                supportingText = stringResource(R.string.persetujuan_alasan_bantuan),
                enabled = sibuk != item.kunci,
            )
        }

        d.galat?.let {
            Text(
                it,
                style = MkTypography.body,
                color = c.statusLate,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(c.statusLateSoft, MkShapes.sm)
                    .padding(MkSpacing.space3),
            )
        }
    }
}

@Composable
private fun KerangkaPersetujuan() {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3), modifier = Modifier.fillMaxWidth()) {
        MkSkeleton(tinggi = 14.dp, lebar = 140.dp)
        MkSkeleton(tinggi = 34.dp, lebar = 200.dp)
        MkSkeleton(tinggi = 22.dp, lebar = 280.dp)
        MkSkeleton(tinggi = 36.dp)
        repeat(4) { MkSkeleton(tinggi = 64.dp) }
    }
}

// ------------------------------------------------------------------ Pratinjau

private val contohMeja = susunMeja(
    RingkasanPersetujuanResponse(
        scope = CakupanDto(entities = 3, global = false),
        approvalRequests = listOf(
            PermintaanDto(
                id = "a1",
                type = "ANGGARAN",
                title = "Revisi anggaran Renovasi Ruang IT",
                amount = 48_500_000,
                entityName = "PT Bhakti Rahayu",
                requester = "Budi Santoso",
                status = "DIAJUKAN",
                createdAt = "2026-10-13T01:00:00Z",
                file = BerkasDto(name = "rincian.pdf", size = 245_000),
            ),
        ),
        deadlineProposals = listOf(
            UsulanTenggatDto(
                id = "d1",
                projectName = "Aplikasi Absensi",
                proposer = "Rani Kusuma",
                proposedAt = "2026-10-12T03:00:00Z",
                previousDate = "2026-10-23T17:00:00Z",
                proposedDate = "2026-10-30T17:00:00Z",
                reason = "Integrasi mesin absensi tertunda vendor.",
            ),
        ),
    ),
    emptyMap(),
)

@PreviewGanda
@Composable
private fun PersetujuanSiapPreview() {
    MKTheme { PersetujuanLayar(state = PersetujuanUiState.Siap(contohMeja)) }
}

@PreviewGanda
@Composable
private fun PersetujuanMemuatPreview() {
    MKTheme { PersetujuanLayar(state = PersetujuanUiState.Memuat) }
}
