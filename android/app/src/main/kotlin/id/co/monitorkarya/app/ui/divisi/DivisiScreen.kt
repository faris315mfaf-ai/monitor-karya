// Tab Divisi (B1) — paritas web src/components/views/divisions-view.tsx untuk
// Admin PT, TI, Super Admin, Direktur entitas, Direksi holding, Manajemen dan
// Auditor. Peran dengan weekly:input (Admin PT/TI/Super Admin) mendapat meja
// isian capaian mingguan divisi (MingguanScreen, padanan DivisionWeeklyDesk)
// di atas arsip — di ponsel dipisah segmented "Isi capaian" | "Arsip laporan".
// Peran lain langsung membaca arsip: kalimat jawaban, saringan status, cari,
// daftar terpaginasi, dan Sheet detail butir (baca-saja).
package id.co.monitorkarya.app.ui.divisi

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.ui.mingguan.MingguanScreen
import id.co.monitorkarya.app.ui.mingguan.labelStatusButir
import id.co.monitorkarya.app.ui.mingguan.labelStatusHeader
import id.co.monitorkarya.app.ui.mingguan.mkStatusButir
import id.co.monitorkarya.app.ui.mingguan.mkStatusHeader
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.dto.WeeklyItemDto
import id.co.monitorkarya.core.network.dto.WeeklyReportRowDto
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular

/**
 * Tab Divisi untuk peran [peran]. Kepala divisi tidak memakai layar ini (tab
 * Divisinya = ringkasan tim, ui/tim).
 */
@Composable
fun DivisiScreen(peran: Peran, modifier: Modifier = Modifier) {
    if (!bolehIsiMingguan(peran)) {
        ArsipDivisiScreen(konteks = "Siklus pelaporan mingguan divisi", modifier = modifier)
        return
    }
    var mode by rememberSaveable { mutableStateOf("isi") }
    Column(modifier = modifier.fillMaxSize()) {
        MkSegmentedControl(
            modifier = Modifier.padding(horizontal = MkSpacing.space3).padding(top = MkSpacing.space3),
            options = listOf(MkOpsi("isi", "Isi capaian"), MkOpsi("arsip", "Arsip laporan")),
            terpilih = mode,
            onPilih = { mode = it },
        )
        Box(Modifier.weight(1f)) {
            if (mode == "arsip") {
                ArsipDivisiScreen(konteks = "Arsip laporan mingguan")
            } else {
                // Meja isian (8 Sep 2026): pilih divisi lalu isi capaian per hari.
                MingguanScreen(vm = hiltViewModel())
            }
        }
    }
}

@Composable
fun ArsipDivisiScreen(
    konteks: String,
    vm: DivisiViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    ArsipDivisiIsi(
        ui = ui,
        konteks = konteks,
        aksi = AksiArsip(
            ulang = vm::ulang,
            pilihStatus = vm::pilihStatus,
            ubahCari = vm::ubahCari,
            hapusSaringan = vm::hapusSaringan,
            sebelumnya = vm::halamanSebelumnya,
            berikutnya = vm::halamanBerikutnya,
            buka = vm::buka,
            tutup = vm::tutup,
        ),
        modifier = modifier,
    )
}

/** Aksi layar arsip (versi state-murni mudah dipratinjau). */
data class AksiArsip(
    val ulang: () -> Unit = {},
    val pilihStatus: (String?) -> Unit = {},
    val ubahCari: (String) -> Unit = {},
    val hapusSaringan: () -> Unit = {},
    val sebelumnya: () -> Unit = {},
    val berikutnya: () -> Unit = {},
    val buka: (String) -> Unit = {},
    val tutup: () -> Unit = {},
)

@Composable
fun ArsipDivisiIsi(
    ui: DivisiUi,
    konteks: String,
    aksi: AksiArsip,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            Text(konteks, style = MkTypography.footnote, color = warna.ink2)
            Text("Divisi", style = MkTypography.title1, color = warna.ink, modifier = Modifier.semantics { heading() })
        }

        val isi = (ui.data as? ArsipData.Siap)?.isi
        when {
            isi != null -> MkCard(modifier = Modifier.fillMaxWidth()) {
                Text("Laporan mingguan divisi", style = MkTypography.footnote, color = warna.ink2)
                Text(
                    jawabanArsip(isi.total, ui.tersaring),
                    style = MkTypography.title3,
                    color = warna.ink,
                    modifier = Modifier.padding(top = 4.dp),
                )
                pendukungArsip(isi.summary.waiting, isi.summary.late, isi.items.isNotEmpty())?.let {
                    Text(it, style = MkTypography.body, color = warna.ink2, modifier = Modifier.padding(top = 4.dp))
                }
            }
            ui.data is ArsipData.Memuat -> MkSkeleton(tinggi = 96.dp)
        }

        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            SARINGAN_STATUS_HEADER.forEach { (nilai, label) ->
                MkChip(label = label, selected = ui.statusHeader == nilai, onClick = { aksi.pilihStatus(nilai) })
            }
        }
        MkField(
            nilai = ui.cari,
            onUbah = aksi.ubahCari,
            label = "Cari laporan",
            placeholder = "Cari divisi, entitas, atau wilayah",
        )

        when (val d = ui.data) {
            ArsipData.Memuat -> Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                repeat(5) { MkSkeleton(tinggi = 56.dp) }
            }
            is ArsipData.Galat -> ErrorNote(pesan = "Laporan mingguan belum termuat. " + d.pesan, onCobaLagi = aksi.ulang)
            is ArsipData.Siap -> DaftarArsip(d, ui, aksi)
        }
    }

    val detail = (ui.data as? ArsipData.Siap)?.isi?.items?.firstOrNull { it.id == ui.detailId }
    SheetLaporanMingguan(laporan = detail, onTutup = aksi.tutup)
}

@Composable
private fun DaftarArsip(d: ArsipData.Siap, ui: DivisiUi, aksi: AksiArsip) {
    val warna = LocalMkColors.current
    val laporan = d.isi.items
    if (laporan.isEmpty()) {
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(
                teks = if (ui.tersaring) "Tidak ada laporan mingguan dengan saringan ini." else "Belum ada laporan mingguan divisi.",
                teksAksi = if (ui.tersaring) "Hapus saringan" else null,
                onAksi = if (ui.tersaring) aksi.hapusSaringan else null,
            )
        }
        return
    }
    MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
        Text("Laporan mingguan", style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        Text(
            "Menampilkan ${laporan.size} dari ${angkaId(d.isi.total)} laporan. Ketuk baris untuk membuka detail.",
            style = MkTypography.footnote,
            color = warna.ink2,
            modifier = Modifier.padding(top = 2.dp, bottom = MkSpacing.space2),
        )
        Column(Modifier.alpha(if (ui.menyegarkan) 0.6f else 1f)) {
            laporan.forEachIndexed { i, r ->
                if (i > 0) MkDivider()
                BarisLaporan(r, onBuka = { aksi.buka(r.id) })
            }
        }
    }
    if (d.isi.total > d.isi.pageSize) {
        val halaman = jumlahHalaman(d.isi.total, d.isi.pageSize)
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            MkButton(label = "Sebelumnya", size = MkButtonSize.S, enabled = ui.halaman > 1, onClick = aksi.sebelumnya)
            Text("Halaman ${ui.halaman} dari $halaman", style = MkTypography.footnote.tabular, color = warna.ink2)
            MkButton(
                label = "Berikutnya",
                size = MkButtonSize.S,
                enabled = ui.halaman * d.isi.pageSize < d.isi.total,
                onClick = aksi.berikutnya,
            )
        }
    }
}

@Composable
private fun BarisLaporan(r: WeeklyReportRowDto, onBuka: () -> Unit) {
    val warna = LocalMkColors.current
    MkCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Buka laporan ${r.division.name} minggu ${r.isoWeek}" },
        padding = MkSpacing.space2,
        onClick = onBuka,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(r.division.name, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${r.entity.name} · M${r.isoWeek} ${r.isoYear} · ${tanggalPendek(r.periodStart)}–${tanggalPendek(r.periodEnd)}",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${r.items.size} butir" + (r.approvedBy?.let { " · disetujui ${it.name}" } ?: ""),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                StatusBadge(status = mkStatusHeader(r.statusHeader), size = MkBadgeSize.SM, text = labelStatusHeader(r.statusHeader))
                if (r.isLate) StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = "Terlambat")
                if (r.isLocked && r.statusHeader != "TERKUNCI") {
                    StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = "Terkunci")
                }
            }
        }
    }
}

/** Detail laporan mingguan di Sheet: status, 3 angka, butir pekerjaan, kendala. */
@Composable
private fun SheetLaporanMingguan(laporan: WeeklyReportRowDto?, onTutup: () -> Unit) {
    val warna = LocalMkColors.current
    MkSheet(
        visible = laporan != null,
        onTutup = onTutup,
        judul = laporan?.division?.name.orEmpty(),
        subjudul = laporan?.let { "${it.entity.name} · M${it.isoWeek} ${it.isoYear}" },
        backLabel = "Divisi",
    ) {
        val r = laporan ?: return@MkSheet
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            StatusBadge(status = mkStatusHeader(r.statusHeader), size = MkBadgeSize.SM, text = labelStatusHeader(r.statusHeader))
            if (r.isLate) StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = "Terlambat")
            if (r.isLocked && r.statusHeader != "TERKUNCI") StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = "Terkunci")
        }
        Text("${tanggalSedang(r.periodStart)} sampai ${tanggalSedang(r.periodEnd)}", style = MkTypography.footnote, color = warna.ink2)
        Text("${r.entity.name} · ${r.entity.region?.ifBlank { null } ?: r.entity.code}", style = MkTypography.footnote, color = warna.ink2)
        if (r.isLocked && r.lockedAt != null) Text("Dikunci ${tanggalSedang(r.lockedAt)}", style = MkTypography.footnote, color = warna.ink2)
        if (r.approvedBy != null && r.approvedAt != null) {
            MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
                Text(
                    "Disetujui oleh ${r.approvedBy!!.name} · ${tanggalSedang(r.approvedAt)}",
                    style = MkTypography.footnote,
                    color = warnaStatus(MkStatus.DONE),
                )
            }
        }
        val hitung = hitungButir(r.items)
        val kendala = hitung["TERKENDALA"] ?: 0
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            StatTile(modifier = Modifier.weight(1f), label = "Butir", value = r.items.size, delta = rincianButir(r.items).ifEmpty { null })
            StatTile(modifier = Modifier.weight(1f), label = "Selesai", value = hitung["SELESAI"] ?: 0, tone = MkStatus.DONE)
            StatTile(
                modifier = Modifier.weight(1f),
                label = "Terkendala",
                value = kendala,
                tone = if (kendala > 0) MkStatus.RISK else MkStatus.NEUTRAL,
            )
        }
        Text("Butir pekerjaan", style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        if (r.items.isEmpty()) {
            EmptyNote(teks = "Belum ada butir di laporan ini.")
        } else {
            r.items.forEach { BlokButir(it) }
        }
    }
}

@Composable
private fun BlokButir(it: WeeklyItemDto) {
    val warna = LocalMkColors.current
    MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                Text(it.workItem, style = MkTypography.bodyStrong, color = warna.ink)
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
                ) {
                    StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = labelAspek(it.aspectCategory.code, it.aspectCategory.name))
                    val (stPrioritas, labelPrioritas) = lencanaPrioritas(it.priority.code, it.priority.name)
                    StatusBadge(status = stPrioritas, size = MkBadgeSize.SM, text = labelPrioritas)
                    if (it.needsEscalation) StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = "Perlu eskalasi")
                }
            }
            StatusBadge(status = mkStatusButir(it.status), size = MkBadgeSize.SM, text = labelStatusButir(it.status))
        }
        BatangProgres(nilai = it.progressPct, status = mkStatusButir(it.status), label = "Progres ${it.workItem}")
        Text(
            it.picName + (it.picTitle.takeIf { t -> t.isNotBlank() }?.let { t -> ", $t" } ?: ""),
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        if (it.targetOutput.isNotBlank() || it.targetDate != null) {
            Text(
                it.targetOutput.ifBlank { "Target" } + (it.targetDate?.let { t -> " · ${tanggalSedang(t)}" } ?: ""),
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
        if (it.evidenceCount > 0) Text("${it.evidenceCount} bukti terlampir", style = MkTypography.footnote, color = warna.ink2)
        if (it.achievementThisWeek.isNotBlank()) {
            Text("Capaian: ${it.achievementThisWeek}", style = MkTypography.footnote, color = warna.ink)
        }
        it.obstacleFollowUp?.takeIf { o -> o.isNotBlank() }?.let { o ->
            Text("Kendala dan tindak lanjut: $o", style = MkTypography.footnote, color = warnaStatus(MkStatus.RISK))
        }
    }
}

/** Batang progres tipis + persen tabular (ProgressBar web). */
@Composable
private fun BatangProgres(nilai: Int, status: MkStatus, label: String) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val isi = if (status == MkStatus.NEUTRAL || status == MkStatus.ON) aksen.fill else warnaStatus(status)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        modifier = Modifier.semantics { contentDescription = "$label $nilai persen" },
    ) {
        Box(
            Modifier
                .weight(1f)
                .height(6.dp)
                .clip(MkShapes.penuh)
                .background(warna.fill1),
        ) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(nilai.coerceIn(0, 100) / 100f)
                    .clip(MkShapes.penuh)
                    .background(isi),
            )
        }
        Text("$nilai%", style = MkTypography.caption.tabular, color = warna.ink2)
    }
}
