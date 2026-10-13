// Sheet rincian entitas (padanan EntitySheet + EntityDetailBody web):
// jalur induk, anak entitas, KPI bulan ini, progres 7 laporan terakhir,
// divisi, proyek, laporan harian/mingguan terbaru, penunjukan admin, lalu
// aktivitas PT per periode (entity-activity-board dipersempit ke PT ini).
// 403 dari server (PIC/kepala divisi, atau di luar cakupan) tampil sebagai
// catatan ramah, bukan galat merah.
package id.co.monitorkarya.feature.entitas.entitas

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.DetailEntitasResponse
import id.co.monitorkarya.feature.entitas.data.KpiLengkapDto
import id.co.monitorkarya.feature.entitas.data.LaporanHarianTerbaruDto
import id.co.monitorkarya.feature.entitas.data.SimpulEntitasDto
import id.co.monitorkarya.feature.entitas.ui.BarisInfo
import id.co.monitorkarya.feature.entitas.ui.BilahProgres
import id.co.monitorkarya.feature.entitas.ui.CatatanInfo
import id.co.monitorkarya.feature.entitas.ui.JudulBagian
import id.co.monitorkarya.feature.entitas.ui.KerangkaDaftar
import id.co.monitorkarya.feature.entitas.ui.LencanaStatus
import id.co.monitorkarya.feature.entitas.ui.StatusKata
import id.co.monitorkarya.feature.entitas.ui.angka
import id.co.monitorkarya.feature.entitas.ui.labelFase
import id.co.monitorkarya.feature.entitas.ui.labelSiklus
import id.co.monitorkarya.feature.entitas.ui.labelTipe
import id.co.monitorkarya.feature.entitas.ui.persen
import id.co.monitorkarya.feature.entitas.ui.porsi
import id.co.monitorkarya.feature.entitas.ui.statusHarian
import id.co.monitorkarya.feature.entitas.ui.statusKepatuhan
import id.co.monitorkarya.feature.entitas.ui.statusMingguan
import id.co.monitorkarya.feature.entitas.ui.tanggalWib
import id.co.monitorkarya.feature.entitas.ui.teksKepatuhan

@Composable
internal fun SheetEntitas(
    peran: Peran,
    simpul: SimpulEntitasDto,
    detail: DetailUi,
    aktivitas: AktivitasUi,
    onTutup: () -> Unit,
    onCobaLagi: () -> Unit,
    aksiAktivitas: AksiAktivitas,
) {
    val subjudul = listOfNotNull(labelTipe(simpul.type), simpul.code.ifBlank { null }, simpul.region)
        .joinToString(" · ")
    MkSheet(
        visible = true,
        onTutup = onTutup,
        judul = simpul.name,
        subjudul = subjudul,
        backLabel = stringResource(R.string.ent_entitas_judul),
        footer = {
            MkButton(label = stringResource(R.string.ent_umum_tutup), onClick = onTutup, variant = MkButtonVariant.PLAIN)
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space6)) {
            simpul.kpi?.let { kpi ->
                LencanaStatus(StatusKata(statusKepatuhan(kpi.complianceScore), teksKepatuhan(kpi.complianceScore)))
            }
            when (detail) {
                DetailUi.Memuat -> KerangkaDaftar(jumlah = 6)
                is DetailUi.Ditolak -> CatatanInfo(teks = pesanDitolak(peran, detail.pesanServer), status = MkStatus.INFO)
                is DetailUi.Galat -> ErrorNote(pesan = detail.pesan, onCobaLagi = onCobaLagi)
                is DetailUi.Siap -> IsiRincian(detail.data)
            }
            if (simpul.type == "PT") {
                MkDivider()
                BagianAktivitas(ui = aktivitas, idPt = simpul.id, aksi = aksiAktivitas)
            }
        }
    }
}

/**
 * Pesan 403 rincian. Server menolak PIC proyek dan kepala divisi karena
 * rincian memuat laporan seluruh proyek/divisi PT; peran lain mendapat 403
 * hanya bila entitas di luar cakupannya — pakai pesan server apa adanya.
 */
@Composable
private fun pesanDitolak(peran: Peran, pesanServer: String): String = when (peran) {
    Peran.PIC_PROYEK, Peran.KEPALA_DIVISI -> stringResource(R.string.ent_entitas_ditolak_pelaksana)
    else -> pesanServer.ifBlank { stringResource(R.string.ent_entitas_ditolak_umum) }
}

@Composable
private fun IsiRincian(data: DetailEntitasResponse) {
    val e = data.entity
    val adalahPt = e.type == "PT"
    val warna = LocalMkColors.current

    if (data.parentChain.isNotEmpty() || !e.isActive) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            if (data.parentChain.isNotEmpty()) {
                val jalur = (data.parentChain.map { it.name } + e.name).joinToString("  ›  ")
                val jalurAksesibel = stringResource(R.string.ent_entitas_jalur_aksesibel, jalur)
                Text(
                    text = jalur,
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    modifier = Modifier.semantics { contentDescription = jalurAksesibel },
                )
            }
            if (!e.isActive) LencanaStatus(StatusKata(MkStatus.NEUTRAL, stringResource(R.string.ent_umum_nonaktif)))
        }
    }

    if (data.children.isNotEmpty()) {
        Column {
            JudulBagian(stringResource(R.string.ent_entitas_anak, data.children.size), Icons.Outlined.AccountTree)
            data.children.forEachIndexed { i, c ->
                BarisInfo(
                    judul = c.name,
                    meta = listOfNotNull(c.code.ifBlank { null }, c.region, labelTipe(c.type)).joinToString(" · "),
                ) {
                    if (!c.isActive) LencanaStatus(StatusKata(MkStatus.NEUTRAL, stringResource(R.string.ent_umum_nonaktif)))
                }
                if (i < data.children.lastIndex) MkDivider()
            }
        }
    }

    if (adalahPt) {
        val kpi = data.currentKpi
        if (kpi != null) {
            KpiRincian(kpi)
            TrenHarian(data.recentDailyReports.orEmpty())
        }
        BagianDivisi(data)
        BagianProyek(data)
        BagianLaporanTerbaru(data)
        BagianPenunjukan(data)
        if (kpi == null) CatatanInfo(teks = stringResource(R.string.ent_entitas_kpi_belum_dihitung))
    } else if (data.children.isEmpty()) {
        CatatanInfo(teks = stringResource(R.string.ent_entitas_non_pt_catatan), status = MkStatus.INFO)
    }
}

@Composable
private fun KpiRincian(kpi: KpiLengkapDto) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_skor),
                value = persen(kpi.complianceScore),
                tone = statusKepatuhan(kpi.complianceScore),
                delta = stringResource(R.string.ent_entitas_kpi_bulan_ini),
            )
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_harian_tepat),
                value = persen(kpi.onTimeDailyPct),
                delta = stringResource(R.string.ent_entitas_kpi_laporan_harian),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_mingguan_lengkap),
                value = persen(kpi.weeklyCompletenessPct),
                delta = stringResource(R.string.ent_entitas_kpi_laporan_divisi),
            )
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_entitas_kpi_tertunda),
                value = kpi.pendingReports,
                tone = if (kpi.pendingReports > 0) MkStatus.RISK else MkStatus.ON,
                delta = stringResource(R.string.ent_entitas_kpi_terlambat_hari_ini, angka(kpi.lateToday)),
            )
        }
    }
}

/** Progres 7 laporan harian terakhir (lama ke baru) sebagai batang sederhana. */
@Composable
private fun TrenHarian(laporan: List<LaporanHarianTerbaruDto>) {
    val tren = laporan.take(7).reversed()
    if (tren.isEmpty()) return
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val terlambat = tren.count { it.isLate }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        JudulBagian(stringResource(R.string.ent_entitas_tren_judul), Icons.Outlined.Insights)
        Row(
            modifier = Modifier.fillMaxWidth().height(120.dp),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            verticalAlignment = Alignment.Bottom,
        ) {
            tren.forEach { r ->
                val label = tanggalWib(r.reportDate)?.split(' ')?.take(2)?.joinToString(" ").orEmpty()
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .semantics(mergeDescendants = true) {
                            contentDescription = "$label ${r.progressPct} persen"
                        },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    Text(text = "${r.progressPct}%", style = MkTypography.caption, color = warna.ink2)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                            .fillMaxHeight(porsi(r.progressPct).coerceAtLeast(0.02f))
                            .clip(MkShapes.xs)
                            .background(if (r.isLate) warna.statusLate else aksen.fill),
                    )
                    Text(text = label, style = MkTypography.caption, color = warna.ink2, maxLines = 1)
                }
            }
        }
        Text(
            text = if (terlambat == 0) {
                stringResource(R.string.ent_entitas_tren_tepat)
            } else {
                stringResource(R.string.ent_entitas_tren_terlambat, angka(terlambat), angka(tren.size))
            },
            style = MkTypography.footnote,
            color = warna.ink2,
        )
    }
}

@Composable
private fun BagianDivisi(data: DetailEntitasResponse) {
    val divisi = data.divisions.orEmpty()
    Column {
        JudulBagian(stringResource(R.string.ent_entitas_divisi, divisi.size), Icons.Outlined.Groups)
        if (divisi.isEmpty()) {
            CatatanInfo(teks = stringResource(R.string.ent_entitas_divisi_kosong), modifier = Modifier.padding(top = MkSpacing.space2))
        }
        divisi.forEachIndexed { i, d ->
            val jenis = d.divisionType?.name?.takeIf { it.isNotBlank() && it != d.name }
            BarisInfo(judul = d.name, meta = jenis) {
                if (!d.isActive) LencanaStatus(StatusKata(MkStatus.NEUTRAL, stringResource(R.string.ent_umum_nonaktif)))
            }
            if (i < divisi.lastIndex) MkDivider()
        }
    }
}

@Composable
private fun BagianProyek(data: DetailEntitasResponse) {
    val proyek = data.projects.orEmpty()
    Column {
        JudulBagian(stringResource(R.string.ent_entitas_proyek, proyek.size), Icons.Outlined.Work)
        if (proyek.isEmpty()) {
            CatatanInfo(teks = stringResource(R.string.ent_entitas_proyek_kosong), modifier = Modifier.padding(top = MkSpacing.space2))
        }
        proyek.forEachIndexed { i, p ->
            BarisInfo(
                judul = p.name,
                meta = listOfNotNull(p.code.ifBlank { null }, labelFase(p.phase).ifBlank { null }, p.picName).joinToString(" · "),
            ) {
                val st = when (p.lifecycle) {
                    "AKTIF" -> MkStatus.ON
                    "DIUSULKAN" -> MkStatus.INFO
                    "DITOLAK" -> MkStatus.LATE
                    else -> MkStatus.NEUTRAL
                }
                LencanaStatus(StatusKata(st, labelSiklus(p.lifecycle)))
            }
            if (i < proyek.lastIndex) MkDivider()
        }
    }
}

@Composable
private fun BagianLaporanTerbaru(data: DetailEntitasResponse) {
    val harian = data.recentDailyReports.orEmpty().take(5)
    val mingguan = data.recentWeeklyReports.orEmpty().take(4)
    val terlambat = stringResource(R.string.ent_entitas_terlambat_kecil)
    if (harian.isNotEmpty()) {
        Column {
            JudulBagian(stringResource(R.string.ent_entitas_harian_terbaru), Icons.Outlined.CalendarMonth)
            harian.forEachIndexed { i, r ->
                Column(modifier = Modifier.padding(vertical = MkSpacing.space2)) {
                    BarisInfo(
                        judul = r.project.name,
                        meta = listOfNotNull(tanggalWib(r.reportDate), if (r.isLate) terlambat else null).joinToString(" · "),
                    ) {
                        LencanaStatus(statusHarian(r.status))
                    }
                    BilahProgres(nilai = r.progressPct, labelAksesibel = stringResource(R.string.ent_entitas_progres_dari, r.project.name))
                }
                if (i < harian.lastIndex) MkDivider()
            }
        }
    }
    if (mingguan.isNotEmpty()) {
        Column {
            JudulBagian(stringResource(R.string.ent_entitas_mingguan_terbaru), Icons.AutoMirrored.Outlined.Assignment)
            mingguan.forEachIndexed { i, w ->
                BarisInfo(
                    judul = w.division.name,
                    meta = stringResource(R.string.ent_entitas_minggu_ke, w.isoWeek, w.isoYear),
                ) {
                    LencanaStatus(statusMingguan(w.statusHeader))
                }
                if (i < mingguan.lastIndex) MkDivider()
            }
        }
    }
}

@Composable
private fun BagianPenunjukan(data: DetailEntitasResponse) {
    val daftar = data.adminAppointments.orEmpty().take(5)
    if (daftar.isEmpty()) return
    Column {
        JudulBagian(stringResource(R.string.ent_entitas_penunjukan), Icons.Outlined.PersonOutline)
        daftar.forEachIndexed { i, a ->
            val sampai = stringResource(
                R.string.ent_entitas_penunjukan_meta,
                a.kind,
                a.skNumber.ifBlank { "–" },
                tanggalWib(a.validFrom) ?: "–",
                tanggalWib(a.validUntil) ?: "–",
            )
            BarisInfo(judul = a.userName, meta = sampai) {
                val aktif = a.status == "AKTIF"
                val kata = if (aktif) {
                    stringResource(R.string.ent_umum_aktif)
                } else {
                    a.status.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }
                }
                LencanaStatus(StatusKata(if (aktif) MkStatus.ON else MkStatus.NEUTRAL, kata))
            }
            if (i < daftar.lastIndex) MkDivider()
        }
    }
}
