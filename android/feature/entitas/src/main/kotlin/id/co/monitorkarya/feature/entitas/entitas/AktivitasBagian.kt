// Aktivitas satu PT per periode (padanan entity-activity-board.tsx, dipersempit
// ke PT yang dibuka di sheet): kadens Harian/Mingguan/Bulanan, geser periode
// memakai prev/next dari server, saringan skala prioritas, lalu blok proyek
// (task, laporan harian, laporan kemajuan) dan blok divisi (butir mingguan).
package id.co.monitorkarya.feature.entitas.entitas

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.automirrored.outlined.EventNote
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.AktivitasDivisiDto
import id.co.monitorkarya.feature.entitas.data.AktivitasEntitasResponse
import id.co.monitorkarya.feature.entitas.data.AktivitasProyekDto
import id.co.monitorkarya.feature.entitas.data.AktivitasPtDto
import id.co.monitorkarya.feature.entitas.data.ButirDivisiDto
import id.co.monitorkarya.feature.entitas.data.TugasAktivitasDto
import id.co.monitorkarya.feature.entitas.ui.BilahProgres
import id.co.monitorkarya.feature.entitas.ui.CatatanInfo
import id.co.monitorkarya.feature.entitas.ui.JudulBagian
import id.co.monitorkarya.feature.entitas.ui.KerangkaDaftar
import id.co.monitorkarya.feature.entitas.ui.Kotak
import id.co.monitorkarya.feature.entitas.ui.LencanaStatus
import id.co.monitorkarya.feature.entitas.ui.StatusKata
import id.co.monitorkarya.feature.entitas.ui.hariPendekWib
import id.co.monitorkarya.feature.entitas.ui.labelFase
import id.co.monitorkarya.feature.entitas.ui.statusButir
import id.co.monitorkarya.feature.entitas.ui.statusHarian
import id.co.monitorkarya.feature.entitas.ui.statusMingguan
import id.co.monitorkarya.feature.entitas.ui.statusPrioritas
import id.co.monitorkarya.feature.entitas.ui.statusTugas
import id.co.monitorkarya.feature.entitas.ui.statusUrgensi
import id.co.monitorkarya.feature.entitas.ui.tanggalPanjangWib
import id.co.monitorkarya.feature.entitas.ui.tanggalWib
import java.time.Instant
import java.time.format.DateTimeFormatter

/** Aksi papan aktivitas. */
class AksiAktivitas(
    val setKadens: (Kadens) -> Unit = {},
    val setPrioritas: (SkalaPrioritas) -> Unit = {},
    val sebelumnya: () -> Unit = {},
    val berikutnya: () -> Unit = {},
    val hariIni: () -> Unit = {},
    val ulang: () -> Unit = {},
)

private val fmtBulanWib = DateTimeFormatter.ofPattern("MMMM yyyy", id.co.monitorkarya.feature.entitas.ui.LOKAL_ID)
    .withZone(id.co.monitorkarya.feature.entitas.ui.ZONA_WIB)

/** Judul periode (periodTitle web). */
@Composable
private fun judulPeriode(j: AktivitasEntitasResponse): String = when (j.cadence) {
    "MINGGUAN" -> stringResource(
        R.string.ent_aktivitas_periode_minggu,
        j.period.isoWeek,
        tanggalWib(j.period.start) ?: "",
        tanggalWib(j.period.end) ?: "",
    )
    "BULANAN" -> runCatching { fmtBulanWib.format(Instant.parse(j.period.start)) }
        .getOrDefault(j.period.key)
        .replaceFirstChar { it.uppercase() }
    else -> tanggalPanjangWib(j.period.start) ?: j.date
}

@Composable
internal fun BagianAktivitas(ui: AktivitasUi, idPt: String, aksi: AksiAktivitas) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        JudulBagian(stringResource(R.string.ent_aktivitas_judul), Icons.AutoMirrored.Outlined.EventNote)
        MkSegmentedControl(
            options = listOf(
                MkOpsi(Kadens.HARIAN.kode, stringResource(R.string.ent_aktivitas_harian)),
                MkOpsi(Kadens.MINGGUAN.kode, stringResource(R.string.ent_aktivitas_mingguan)),
                MkOpsi(Kadens.BULANAN.kode, stringResource(R.string.ent_aktivitas_bulanan)),
            ),
            terpilih = ui.kadens.kode,
            onPilih = { kode -> Kadens.entries.firstOrNull { it.kode == kode }?.let(aksi.setKadens) },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            MkIconBtn(
                icon = Icons.Outlined.ChevronLeft,
                label = stringResource(R.string.ent_aktivitas_sebelumnya),
                enabled = ui.jawaban != null && !ui.memuat,
                onClick = aksi.sebelumnya,
            )
            Text(
                text = ui.jawaban?.let { judulPeriode(it) } ?: stringResource(R.string.ent_aktivitas_memuat_periode),
                style = MkTypography.bodyStrong,
                color = warna.ink,
                modifier = Modifier.weight(1f).padding(horizontal = MkSpacing.space2),
                maxLines = 2,
            )
            MkIconBtn(
                icon = Icons.Outlined.ChevronRight,
                label = stringResource(R.string.ent_aktivitas_berikutnya),
                enabled = ui.jawaban != null && !ui.memuat,
                onClick = aksi.berikutnya,
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            val opsi = SkalaPrioritas.entries.map { MkOpsi(it.kode, it.label) }
            MkPilih(
                modifier = Modifier.weight(1f),
                pilihan = opsi,
                terpilih = opsi.firstOrNull { it.value == ui.prioritas.kode },
                onPilih = { o -> SkalaPrioritas.entries.firstOrNull { it.kode == o.value }?.let(aksi.setPrioritas) },
                label = stringResource(R.string.ent_aktivitas_prioritas),
            )
            MkButton(
                label = stringResource(R.string.ent_aktivitas_hari_ini),
                onClick = aksi.hariIni,
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
                enabled = ui.tanggal != null,
            )
        }
        if (ui.prioritas != SkalaPrioritas.SEMUA) {
            CatatanInfo(teks = stringResource(R.string.ent_aktivitas_catatan_prioritas), status = MkStatus.INFO)
        }

        val j = ui.jawaban
        when {
            ui.memuat && j == null -> KerangkaDaftar(jumlah = 3, tinggi = 72.dp)
            ui.ditolak -> CatatanInfo(teks = ui.galat ?: stringResource(R.string.ent_entitas_ditolak_umum), status = MkStatus.INFO)
            ui.galat != null -> ErrorNote(pesan = ui.galat, onCobaLagi = aksi.ulang)
            j == null -> KerangkaDaftar(jumlah = 3, tinggi = 72.dp)
            else -> {
                val pt = aktivitasPt(j, idPt)
                if (pt == null) {
                    EmptyNote(teks = stringResource(R.string.ent_aktivitas_pt_tidak_ada))
                } else {
                    IsiAktivitasPt(pt = pt, kadens = j.cadence)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IsiAktivitasPt(pt: AktivitasPtDto, kadens: String) {
    val warna = LocalMkColors.current
    val s = pt.stats
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Tag(stringResource(R.string.ent_aktivitas_tag_proyek, s.projects))
            Tag(stringResource(R.string.ent_aktivitas_tag_divisi, s.divisions))
            if (s.tasks > 0) Tag(stringResource(R.string.ent_aktivitas_tag_task, s.tasks, s.tasksDone))
            if (kadens != "BULANAN") {
                if (s.dailyReports > 0) Tag(stringResource(R.string.ent_aktivitas_tag_harian, s.dailyReports))
            } else {
                Tag(stringResource(R.string.ent_aktivitas_tag_bulanan, s.dailyReports, s.weeklyReports))
            }
            if (s.weeklyItems > 0) Tag(stringResource(R.string.ent_aktivitas_tag_butir, s.weeklyItems))
            if (s.tasksBlocked > 0) {
                LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_aktivitas_task_terhambat, s.tasksBlocked)))
            }
            if (kadens != "BULANAN" && s.dailyLate > 0) {
                LencanaStatus(StatusKata(MkStatus.LATE, stringResource(R.string.ent_aktivitas_laporan_terlambat, s.dailyLate)))
            }
            if (s.weeklyItemsBlocked > 0) {
                LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_aktivitas_butir_terkendala, s.weeklyItemsBlocked)))
            }
        }
        if (ptSepi(pt)) {
            EmptyNote(teks = stringResource(R.string.ent_aktivitas_sepi))
            return@Column
        }
        Text(
            text = stringResource(R.string.ent_aktivitas_proyek),
            style = MkTypography.bodyStrong,
            color = warna.ink2,
        )
        if (pt.projects.isEmpty()) {
            Text(text = stringResource(R.string.ent_aktivitas_proyek_kosong), style = MkTypography.footnote, color = warna.ink2)
        }
        pt.projects.forEach { p -> BlokProyek(p, kadens) }
        MkDivider()
        Text(
            text = stringResource(R.string.ent_aktivitas_divisi),
            style = MkTypography.bodyStrong,
            color = warna.ink2,
        )
        if (pt.divisions.isEmpty()) {
            Text(text = stringResource(R.string.ent_aktivitas_divisi_kosong), style = MkTypography.footnote, color = warna.ink2)
        }
        pt.divisions.forEach { d -> BlokDivisi(d, kadens) }
    }
}

@Composable
private fun Tag(teks: String) {
    val warna = LocalMkColors.current
    Text(
        text = teks,
        style = MkTypography.caption,
        color = warna.ink2,
        modifier = Modifier
            .clip(MkShapes.xs)
            .background(warna.fill2)
            .padding(horizontal = MkSpacing.space2, vertical = MkSpacing.space1),
    )
}

@Composable
private fun Catatan(kendala: String?, tindakLanjut: String?) {
    val warna = LocalMkColors.current
    if (!kendala.isNullOrBlank()) {
        Text(
            text = stringResource(R.string.ent_aktivitas_kendala, kendala),
            style = MkTypography.footnote,
            color = warnaStatus(MkStatus.RISK),
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
    if (!tindakLanjut.isNullOrBlank()) {
        Text(
            text = stringResource(R.string.ent_aktivitas_tindak_lanjut, tindakLanjut),
            style = MkTypography.footnote,
            color = warna.ink2,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BlokProyek(p: AktivitasProyekDto, kadens: String) {
    val warna = LocalMkColors.current
    var tampilTask by rememberSaveable(p.id, kadens) { mutableStateOf(kadens == "HARIAN") }
    val pr = p.progressReport
    val hariIni = if (kadens == "HARIAN") p.dailyReports.firstOrNull() else null
    Kotak {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = p.name, style = MkTypography.bodyStrong, color = warna.ink)
                val meta = listOfNotNull(
                    p.code.ifBlank { null },
                    labelFase(p.phase).ifBlank { null },
                    p.picName?.let { stringResource(R.string.ent_aktivitas_pic, it) },
                ).joinToString(" · ")
                Text(text = meta, style = MkTypography.footnote, color = warna.ink2)
            }
            when {
                hariIni != null -> LencanaStatus(statusHarian(hariIni.status))
                pr != null -> LencanaStatus(statusHarian(pr.status))
            }
        }
        if (pr != null) {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                    Text(
                        text = stringResource(
                            if (kadens == "MINGGUAN") R.string.ent_aktivitas_laporan_mingguan else R.string.ent_aktivitas_laporan_bulanan,
                        ),
                        style = MkTypography.bodyStrong,
                        color = warna.ink,
                    )
                    LencanaStatus(
                        if (pr.submitted) {
                            StatusKata(MkStatus.DONE, stringResource(R.string.ent_aktivitas_terkirim))
                        } else {
                            StatusKata(MkStatus.NEUTRAL, stringResource(R.string.ent_aktivitas_draf))
                        },
                    )
                    if (pr.evidenceCount > 0) {
                        Text(
                            text = stringResource(R.string.ent_aktivitas_bukti, pr.evidenceCount),
                            style = MkTypography.caption,
                            color = warna.ink2,
                        )
                    }
                }
                BilahProgres(nilai = pr.progressPct, labelAksesibel = stringResource(R.string.ent_entitas_progres_dari, p.name))
                pr.summary?.takeIf { it.isNotBlank() }?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink) }
                Catatan(pr.obstacle, pr.followUp)
            }
        }
        when (kadens) {
            "HARIAN" -> if (hariIni != null) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                    verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                ) {
                    if (hariIni.late) LencanaStatus(StatusKata(MkStatus.LATE, stringResource(R.string.ent_aktivitas_terlambat)))
                    if (!hariIni.submitted) LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_aktivitas_belum_dikirim)))
                }
                BilahProgres(nilai = hariIni.progressPct, labelAksesibel = stringResource(R.string.ent_entitas_progres_dari, p.name))
                hariIni.achievement?.takeIf { it.isNotBlank() }?.let {
                    Text(text = it, style = MkTypography.footnote, color = warna.ink)
                }
                Catatan(hariIni.obstacle, hariIni.followUp)
            } else if (p.tasks.isEmpty()) {
                Text(text = stringResource(R.string.ent_aktivitas_belum_harian), style = MkTypography.footnote, color = warna.ink2)
            }
            "MINGGUAN" -> if (p.dailyReports.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                    verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                ) {
                    p.dailyReports.forEach { r ->
                        val st = statusHarian(r.status)
                        LencanaStatus(StatusKata(st.status, "${hariPendekWib(r.date) ?: ""} ${st.kata}".trim()))
                    }
                }
            }
            else -> FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                Tag(stringResource(R.string.ent_aktivitas_tag_harian, p.dailyStats.submitted))
                if (p.dailyStats.late > 0) {
                    LencanaStatus(StatusKata(MkStatus.LATE, stringResource(R.string.ent_aktivitas_n_terlambat, p.dailyStats.late)))
                }
                if (p.dailyStats.blocked > 0) {
                    LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_aktivitas_n_terkendala, p.dailyStats.blocked)))
                }
                if (p.taskStats.total > 0) Tag(stringResource(R.string.ent_aktivitas_tag_task, p.taskStats.total, p.taskStats.done))
            }
        }
        if (p.tasks.isNotEmpty()) {
            if (kadens != "HARIAN") {
                val label = stringResource(
                    if (tampilTask) R.string.ent_aktivitas_sembunyikan_task else R.string.ent_aktivitas_tampilkan_task,
                    p.tasks.size,
                ) + if (kadens == "BULANAN") stringResource(R.string.ent_aktivitas_task_terhambat_akhiran) else ""
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button) { tampilTask = !tampilTask }
                        .padding(vertical = MkSpacing.space1),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = label, style = MkTypography.footnote, color = warna.ink, modifier = Modifier.weight(1f))
                    Icon(
                        imageVector = if (tampilTask) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                        contentDescription = null,
                        tint = warna.ink2,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            if (tampilTask) {
                val kelompok = p.tasks.groupBy { t -> if (t.scope == "MINGGUAN") "MINGGUAN" else hariPendekWib(t.workDate) ?: "" }
                kelompok.forEach { (label, tugas) ->
                    if (kadens != "HARIAN") {
                        Text(
                            text = if (label == "MINGGUAN") stringResource(R.string.ent_aktivitas_capaian_mingguan) else label,
                            style = MkTypography.caption,
                            color = warna.ink2,
                        )
                    }
                    tugas.forEach { t -> BarisTugas(t) }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BarisTugas(t: TugasAktivitasDto) {
    val warna = LocalMkColors.current
    val urg = statusUrgensi(t.urgency)
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MkSpacing.space1),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(text = t.title, style = MkTypography.footnote, color = warna.ink, modifier = Modifier.weight(1f))
            LencanaStatus(statusTugas(t.status))
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            LencanaStatus(StatusKata(urg.status, stringResource(R.string.ent_aktivitas_urgensi, urg.kata.lowercase())))
            t.picName?.let { Text(text = stringResource(R.string.ent_aktivitas_pic, it), style = MkTypography.caption, color = warna.ink2) }
            if (t.subtaskTotal > 0) {
                Text(
                    text = stringResource(R.string.ent_aktivitas_langkah, t.subtaskDone, t.subtaskTotal),
                    style = MkTypography.caption,
                    color = warna.ink2,
                )
            }
            Text(text = "${t.progressPct}%", style = MkTypography.caption, color = warna.ink2)
        }
        t.note?.takeIf { it.isNotBlank() }?.let {
            Text(text = it, style = MkTypography.footnote, color = warnaStatus(MkStatus.RISK), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BlokDivisi(d: AktivitasDivisiDto, kadens: String) {
    val warna = LocalMkColors.current
    val laporan = d.reports.firstOrNull()
    Kotak {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = d.name, style = MkTypography.bodyStrong, color = warna.ink)
                d.headName?.let {
                    Text(text = stringResource(R.string.ent_aktivitas_kepala, it), style = MkTypography.footnote, color = warna.ink2)
                }
            }
            if (kadens != "BULANAN") {
                if (laporan != null) {
                    LencanaStatus(statusMingguan(laporan.statusHeader))
                } else {
                    LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_aktivitas_belum_masuk)))
                }
            }
        }
        if (kadens == "BULANAN") {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                d.reports.forEach { r ->
                    val st = statusMingguan(r.statusHeader)
                    LencanaStatus(StatusKata(st.status, "M${r.isoWeek} ${st.kata}"))
                }
                if (d.reports.isEmpty()) LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_aktivitas_belum_masuk)))
                Tag(stringResource(R.string.ent_aktivitas_tag_butir_selesai, d.itemStats.total, d.itemStats.done))
                if (d.itemStats.blocked > 0) {
                    LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_aktivitas_n_terkendala, d.itemStats.blocked)))
                }
            }
        }
        if (d.items.isEmpty()) {
            if (kadens != "BULANAN") {
                Text(text = stringResource(R.string.ent_aktivitas_butir_kosong), style = MkTypography.footnote, color = warna.ink2)
            }
        } else {
            d.items.forEach { b -> BarisButir(b, kadens) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BarisButir(b: ButirDivisiDto, kadens: String) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MkSpacing.space1),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(text = b.workItem, style = MkTypography.footnote, color = warna.ink, modifier = Modifier.weight(1f))
            LencanaStatus(statusButir(b.status))
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            LencanaStatus(statusPrioritas(b.priority))
            if (b.workDate != null && kadens != "HARIAN") {
                Text(text = hariPendekWib(b.workDate) ?: "", style = MkTypography.caption, color = warna.ink2)
            }
            if (b.aspect.isNotBlank()) Text(text = b.aspect, style = MkTypography.caption, color = warna.ink2)
            b.picName?.let { Text(text = stringResource(R.string.ent_aktivitas_pic, it), style = MkTypography.caption, color = warna.ink2) }
            Text(text = "${b.progressPct}%", style = MkTypography.caption, color = warna.ink2)
        }
        b.achievement?.takeIf { it.isNotBlank() }?.let {
            Text(text = it, style = MkTypography.footnote, color = warna.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Catatan(b.obstacle, b.followUp)
    }
}
