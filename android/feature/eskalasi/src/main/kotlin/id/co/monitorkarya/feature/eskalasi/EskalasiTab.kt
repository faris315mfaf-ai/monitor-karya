// Tab Eskalasi (Fase 3, gelombang A1) — padanan web
// src/components/views/escalations-view.tsx, dikerat untuk ponsel:
// kepala (konteks, judul, kalimat jawaban + dukungan), chip saringan status +
// "Lewat SLA" + pilihan kebutuhan, papan dikelompokkan per status (kanban web
// menjadi bagian bertumpuk), kartu eskalasi, Sheet detail (ringkasan, sumber,
// alur vertikal, keputusan) dengan aksi sesuai izin, snackbar "Urungkan".
package id.co.monitorkarya.feature.eskalasi

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.RadioButtonChecked
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
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
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPenandaTersimpan
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkSnackbarHost
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Titik masuk publik tab Eskalasi; dipasang parent di MKShell untuk
 * [id.co.monitorkarya.core.domain.roles.TabId.ESKALASI].
 */
@Composable
fun EskalasiTab(peran: Peran, modifier: Modifier = Modifier) {
    val vm: EskalasiViewModel = hiltViewModel()
    LaunchedEffect(peran) { vm.mulai(peran) }
    val state by vm.state.collectAsStateWithLifecycle()
    val saringan by vm.saringan.collectAsStateWithLifecycle()
    val detail by vm.detail.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    EskalasiLayar(
        state = state,
        saringan = saringan,
        detail = detail,
        notifikasi = notifikasi,
        aksi = EskalasiAksi(
            onUlang = vm::ulang,
            onPilihStatus = vm::pilihStatus,
            onPilihKebutuhan = vm::pilihKebutuhan,
            onAlihLewatSla = vm::alihLewatSla,
            onHapusSaringan = vm::hapusSaringan,
            onBuka = vm::buka,
            onTutupSheet = vm::tutupSheet,
            onTinjau = vm::tinjau,
            onMulaiPutuskan = vm::mulaiPutuskan,
            onBatalPutuskan = vm::batalPutuskan,
            onUbahKeputusan = vm::ubahKeputusan,
            onSimpanKeputusan = vm::simpanKeputusan,
            onTutupEskalasi = vm::tutupEskalasi,
            onNotifikasiTampil = vm::notifikasiTampil,
            onUrungkan = vm::urungkan,
        ),
        modifier = modifier,
    )
}

/** Aksi layar dikumpulkan agar parameter komposer ringkas. */
data class EskalasiAksi(
    val onUlang: () -> Unit = {},
    val onPilihStatus: (StatusEskalasi?) -> Unit = {},
    val onPilihKebutuhan: (KebutuhanEskalasi?) -> Unit = {},
    val onAlihLewatSla: () -> Unit = {},
    val onHapusSaringan: () -> Unit = {},
    val onBuka: (String) -> Unit = {},
    val onTutupSheet: () -> Unit = {},
    val onTinjau: () -> Unit = {},
    val onMulaiPutuskan: () -> Unit = {},
    val onBatalPutuskan: () -> Unit = {},
    val onUbahKeputusan: (String) -> Unit = {},
    val onSimpanKeputusan: () -> Unit = {},
    val onTutupEskalasi: () -> Unit = {},
    val onNotifikasiTampil: () -> Unit = {},
    val onUrungkan: () -> Unit = {},
)

/** Versi state murni — dipratinjau tanpa ViewModel. */
@Composable
fun EskalasiLayar(
    state: EskalasiUiState,
    saringan: SaringanEskalasi,
    modifier: Modifier = Modifier,
    detail: DetailEskalasi? = null,
    notifikasi: NotifikasiEskalasi? = null,
    aksi: EskalasiAksi = EskalasiAksi(),
) {
    val c = LocalMkColors.current
    val snackbar = remember { SnackbarHostState() }
    val labelUrungkan = stringResource(R.string.eskalasi_urungkan)

    LaunchedEffect(notifikasi?.id) {
        val n = notifikasi ?: return@LaunchedEffect
        val hasil = snackbar.showSnackbar(
            message = n.pesan,
            actionLabel = n.undoToken?.let { labelUrungkan },
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
            KepalaEskalasi(state)
            // B6: papan dari potret Room (server tak terjangkau) selalu ditandai.
            (state as? EskalasiUiState.Siap)?.tersimpanPada?.let { MkPenandaTersimpan(tersimpanPadaMs = it) }
            BarisSaringan(saringan, aksi)
            when (state) {
                EskalasiUiState.Memuat -> KerangkaPapan()
                is EskalasiUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = aksi.onUlang)
                is EskalasiUiState.Siap -> IsiPapan(state, saringan, aksi)
            }
        }
        // Satu host sekaligus: saat Sheet modal terbuka, snackbar dirender di
        // kaki Sheet agar tidak tertutup window Sheet (C2 T1/S5).
        if (detail == null) MkSnackbarHost(modifier = Modifier.align(Alignment.BottomCenter), snackbarHostState = snackbar)
    }

    SheetEskalasi(detail = detail, aksi = aksi, snackbar = snackbar)
}

@Composable
private fun KepalaEskalasi(state: EskalasiUiState) {
    val c = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(stringResource(R.string.eskalasi_konteks), style = MkTypography.footnote, color = c.ink2)
        Text(stringResource(R.string.eskalasi_judul), style = MkTypography.largeTitle, color = c.ink)
        when (state) {
            EskalasiUiState.Memuat -> {
                MkSkeleton(tinggi = 22.dp, lebar = 260.dp)
                MkSkeleton(tinggi = 16.dp, lebar = 200.dp)
            }
            is EskalasiUiState.Siap -> {
                Text(state.papan.eyebrow, style = MkTypography.caption, color = c.ink2)
                Text(state.papan.jawaban, style = MkTypography.title3, color = c.ink)
                state.papan.dukungan?.let { Text(it, style = MkTypography.footnote, color = c.ink2) }
            }
            is EskalasiUiState.Galat -> Unit
        }
    }
}

@Composable
private fun BarisSaringan(saringan: SaringanEskalasi, aksi: EskalasiAksi) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            MkChip(
                label = stringResource(R.string.eskalasi_saring_semua_status),
                selected = saringan.status == null,
                onClick = { aksi.onPilihStatus(null) },
            )
            StatusEskalasi.entries.forEach { s ->
                MkChip(label = s.label, selected = saringan.status == s, onClick = { aksi.onPilihStatus(s) })
            }
            MkChip(
                label = stringResource(R.string.eskalasi_saring_lewat_sla),
                selected = saringan.lewatSla,
                status = MkStatus.LATE,
                onClick = aksi.onAlihLewatSla,
            )
        }
        val semua = MkOpsi(value = "", label = stringResource(R.string.eskalasi_saring_semua_kebutuhan))
        val opsi = listOf(semua) + KebutuhanEskalasi.entries.map { MkOpsi(value = it.nilai, label = it.label) }
        MkPilih(
            modifier = Modifier.fillMaxWidth(),
            pilihan = opsi,
            terpilih = opsi.firstOrNull { it.value == (saringan.kebutuhan?.nilai ?: "") },
            onPilih = { o -> aksi.onPilihKebutuhan(KebutuhanEskalasi.entries.firstOrNull { it.nilai == o.value }) },
            label = stringResource(R.string.eskalasi_saring_kebutuhan),
        )
    }
}

@Composable
private fun IsiPapan(state: EskalasiUiState.Siap, saringan: SaringanEskalasi, aksi: EskalasiAksi) {
    val c = LocalMkColors.current
    val papan = state.papan
    if (papan.items.isEmpty()) {
        if (saringan.aktif) {
            EmptyNote(
                teks = stringResource(R.string.eskalasi_kosong_saringan),
                ikon = Icons.Outlined.Warning,
                teksAksi = stringResource(R.string.eskalasi_hapus_saringan),
                onAksi = aksi.onHapusSaringan,
            )
        } else {
            EmptyNote(teks = stringResource(R.string.eskalasi_kosong), done = true)
        }
        return
    }
    Column(
        modifier = Modifier.alpha(if (state.memuatUlang) 0.6f else 1f),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space5),
    ) {
        papan.catatanHalaman?.let { Text(it, style = MkTypography.footnote, color = c.ink2) }
        papan.kelompok.forEach { (status, isi) -> KelompokStatus(status, isi, aksi) }
    }
}

/** Satu "kolom kanban" web: lencana status + jumlah, lalu kartu bergaris pemisah. */
@Composable
private fun KelompokStatus(status: StatusEskalasi, isi: List<EskalasiItem>, aksi: EskalasiAksi) {
    val c = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            StatusBadge(status = status.lencana, size = MkBadgeSize.SM, text = status.label)
            Text(angka(isi.size), style = MkTypography.footnote, color = c.ink2)
        }
        if (isi.isEmpty()) {
            Text(stringResource(R.string.eskalasi_kolom_kosong), style = MkTypography.footnote, color = c.ink3)
        } else {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(c.surface, MkShapes.md),
            ) {
                isi.forEachIndexed { i, e ->
                    KartuEskalasi(e, onBuka = { aksi.onBuka(e.id) })
                    if (i < isi.lastIndex) MkDivider()
                }
            }
        }
    }
}

@Composable
private fun KartuEskalasi(e: EskalasiItem, onBuka: () -> Unit) {
    val c = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onBuka)
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(e.namaEntitas, style = MkTypography.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(e.kodeEntitas, style = MkTypography.caption, color = c.ink2, maxLines = 1)
            }
            if (e.lewatSla) {
                StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = stringResource(R.string.eskalasi_saring_lewat_sla))
            }
        }
        Text(e.ringkasan, style = MkTypography.body, color = c.ink, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Text(
            text = stringResource(R.string.eskalasi_butuh, e.kebutuhan.lowercase(LOKAL)) + " · " + e.teksUmur(),
            style = MkTypography.footnote,
            color = c.ink2,
        )
        val baris = listOfNotNull(
            e.pengaju?.let { "$it · ${waktuRelatif(e.diajukanPada)}" },
            e.pemutus?.let { stringResource(R.string.eskalasi_diputuskan_oleh, it) },
        )
        if (baris.isNotEmpty()) {
            Text(baris.joinToString(" · "), style = MkTypography.footnote, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ------------------------------------------------------------------ Sheet

@Composable
private fun SheetEskalasi(detail: DetailEskalasi?, aksi: EskalasiAksi, snackbar: SnackbarHostState) {
    val e = detail?.item
    MkSheet(
        visible = detail != null,
        onTutup = aksi.onTutupSheet,
        judul = e?.namaEntitas.orEmpty(),
        subjudul = e?.subjudul,
        backLabel = stringResource(R.string.eskalasi_kembali),
        footer = {
            Column(Modifier.weight(1f)) {
                if (snackbar.currentSnackbarData != null) {
                    MkSnackbarHost(
                        modifier = Modifier.fillMaxWidth().padding(bottom = MkSpacing.space3),
                        snackbarHostState = snackbar,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    if (detail != null) KakiSheet(detail, aksi)
                }
            }
        },
    ) {
        if (detail != null) IsiSheet(detail, aksi)
    }
}

@Composable
private fun RowScope.KakiSheet(d: DetailEskalasi, aksi: EskalasiAksi) {
    val sibuk = d.sibuk != null
    val menyimpan = stringResource(R.string.eskalasi_aksi_menyimpan)
    // Mode Putuskan hanya selama izin putuskan masih diberikan server (C2 S6).
    if (d.memutuskan && d.item.izin.putuskan) {
        MkButton(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.eskalasi_aksi_batal),
            onClick = aksi.onBatalPutuskan,
            enabled = !sibuk,
        )
        MkButton(
            modifier = Modifier.weight(1f),
            label = if (d.sibuk == AksiEskalasi.PUTUSKAN) menyimpan else stringResource(R.string.eskalasi_aksi_simpan),
            onClick = aksi.onSimpanKeputusan,
            variant = MkButtonVariant.PRIMARY,
            enabled = !sibuk && d.keputusanSah,
        )
        return
    }
    val izin = d.item.izin
    if (!izin.ada) {
        MkButton(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.eskalasi_aksi_kembali),
            onClick = aksi.onTutupSheet,
            variant = MkButtonVariant.PLAIN,
        )
        return
    }
    if (izin.tinjau) {
        MkButton(
            modifier = Modifier.weight(1f),
            label = if (d.sibuk == AksiEskalasi.TINJAU) menyimpan else stringResource(R.string.eskalasi_aksi_tinjau),
            onClick = aksi.onTinjau,
            // Maksimal satu tombol primer: bila bisa memutuskan, tinjau jadi sekunder.
            variant = if (izin.putuskan) MkButtonVariant.SECONDARY else MkButtonVariant.PRIMARY,
            enabled = !sibuk,
        )
    }
    if (izin.putuskan) {
        MkButton(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.eskalasi_aksi_putuskan),
            onClick = aksi.onMulaiPutuskan,
            variant = MkButtonVariant.PRIMARY,
            enabled = !sibuk,
        )
    }
    if (izin.tutup) {
        MkButton(
            modifier = Modifier.weight(1f),
            label = if (d.sibuk == AksiEskalasi.TUTUP) {
                stringResource(R.string.eskalasi_aksi_menutup)
            } else {
                stringResource(R.string.eskalasi_aksi_tutup)
            },
            onClick = aksi.onTutupEskalasi,
            variant = MkButtonVariant.PRIMARY,
            enabled = !sibuk,
        )
    }
}

@Composable
private fun ColumnScope.IsiSheet(d: DetailEskalasi, aksi: EskalasiAksi) {
    val c = LocalMkColors.current
    val e = d.item
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            StatusBadge(status = e.status.lencana, size = MkBadgeSize.SM, text = e.status.label)
            if (e.lewatSla) {
                StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = stringResource(R.string.eskalasi_saring_lewat_sla))
            }
        }

        Bagian(stringResource(R.string.eskalasi_bagian_ringkasan)) {
            Text(e.ringkasan, style = MkTypography.body, color = c.ink)
        }

        Bagian(stringResource(R.string.eskalasi_bagian_sumber)) {
            // N-07: potongan id internal ("Kode sumber vnazzh5w") tidak bermakna
            // bagi pengguna — tidak ditampilkan lagi.
            BarisInfo(Icons.Outlined.Description, e.sumber)
            BarisInfo(Icons.Outlined.Business, "${e.namaEntitas} · ${e.kodeEntitas}")
            BarisInfo(
                Icons.Outlined.Person,
                e.pengaju?.let { stringResource(R.string.eskalasi_diajukan_oleh, it, waktuRelatif(e.diajukanPada)) }
                    ?: stringResource(R.string.eskalasi_diajukan, waktuRelatif(e.diajukanPada)),
            )
        }

        Bagian(stringResource(R.string.eskalasi_bagian_alur)) {
            tahapAlur(e).forEach { BarisTahap(it) }
        }

        if (e.pemutus != null || e.keputusan != null) {
            Bagian(stringResource(R.string.eskalasi_bagian_keputusan)) {
                e.pemutus?.let {
                    Text(
                        stringResource(R.string.eskalasi_keputusan_oleh, it) +
                            (e.diputuskanPada?.let { t -> " · ${waktuRelatif(t)}" } ?: ""),
                        style = MkTypography.footnote,
                        color = c.ink2,
                    )
                }
                e.keputusan?.let {
                    Text(
                        it,
                        style = MkTypography.body,
                        color = c.ink,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(c.fill1, MkShapes.sm)
                            .padding(MkSpacing.space3),
                    )
                }
            }
        }

        if (d.memutuskan && e.izin.putuskan) {
            MkField(
                nilai = d.teksKeputusan,
                onUbah = aksi.onUbahKeputusan,
                label = stringResource(R.string.eskalasi_isian_keputusan),
                placeholder = stringResource(R.string.eskalasi_isian_keputusan_contoh),
                baris = 4,
                supportingText = stringResource(R.string.eskalasi_isian_keputusan_bantuan),
                enabled = d.sibuk == null,
                modifier = Modifier.fillMaxWidth(),
            )
        } else if (!e.izin.ada) {
            Text(stringResource(R.string.eskalasi_tanpa_aksi), style = MkTypography.footnote, color = c.ink2)
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
private fun Bagian(judul: String, isi: @Composable ColumnScope.() -> Unit) {
    val c = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Text(judul, style = MkTypography.headline, color = c.ink)
        isi()
    }
}

@Composable
private fun BarisInfo(ikon: ImageVector, teks: String) {
    val c = LocalMkColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Icon(ikon, contentDescription = null, tint = c.ink2, modifier = Modifier.size(18.dp))
        Text(teks, style = MkTypography.body, color = c.ink)
    }
}

@Composable
private fun BarisTahap(t: TahapAlur) {
    val c = LocalMkColors.current
    val (ikon, warna) = when (t.keadaan) {
        KeadaanTahap.SELESAI -> Icons.Outlined.CheckCircle to warnaStatus(MkStatus.DONE)
        KeadaanTahap.SEKARANG -> Icons.Outlined.RadioButtonChecked to warnaStatus(MkStatus.INFO)
        KeadaanTahap.TERHAMBAT -> Icons.Outlined.Warning to warnaStatus(MkStatus.LATE)
        KeadaanTahap.BELUM -> Icons.Outlined.Circle to c.ink3
    }
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3), verticalAlignment = Alignment.Top) {
        Icon(ikon, contentDescription = null, tint = warna, modifier = Modifier.size(20.dp))
        Column {
            Text(
                t.judul,
                style = if (t.keadaan == KeadaanTahap.BELUM) MkTypography.body else MkTypography.bodyStrong,
                color = if (t.keadaan == KeadaanTahap.BELUM) c.ink2 else c.ink,
            )
            t.sub?.let { Text(it, style = MkTypography.footnote, color = c.ink2) }
            t.meta?.let { Text(it, style = MkTypography.footnote, color = warnaStatus(MkStatus.LATE)) }
        }
    }
}

@Composable
private fun KerangkaPapan() {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3), modifier = Modifier.fillMaxWidth()) {
        repeat(2) {
            MkSkeleton(tinggi = 24.dp, lebar = 120.dp)
            MkSkeleton(tinggi = 112.dp)
            MkSkeleton(tinggi = 112.dp)
        }
    }
}

// ------------------------------------------------------------------ Pratinjau

private val contohItem = EskalasiItem(
    id = "esc-1",
    status = StatusEskalasi.DIAJUKAN,
    namaEntitas = "PT Bhakti Rahayu",
    kodeEntitas = "BRH · Jawa Barat",
    ringkasan = "Server SIM RS butuh penambahan memori sebelum integrasi BPJS tanggal 20.",
    kebutuhan = "Anggaran",
    sumber = labelSumber("DAILY_REPORT"),
    sourceId = "rpt-abc12345",
    umurHari = 9,
    slaHari = 7,
    lewatSla = true,
    pengaju = "Rani Kusuma",
    diajukanPada = "2026-10-04T02:00:00Z",
    pemutus = null,
    diputuskanPada = null,
    keputusan = null,
    izin = IzinAksi(tinjau = true, putuskan = true),
)

@PreviewGanda
@Composable
private fun EskalasiSiapPreview() {
    MKTheme {
        EskalasiLayar(
            state = EskalasiUiState.Siap(susunPapan(listOf(contohItem), 1, SaringanEskalasi())),
            saringan = SaringanEskalasi(),
        )
    }
}

@PreviewGanda
@Composable
private fun EskalasiMemuatPreview() {
    MKTheme { EskalasiLayar(state = EskalasiUiState.Memuat, saringan = SaringanEskalasi()) }
}
