// Sheet drill-down Laporan per perusahaan (company-reports.tsx): satu MkSheet
// yang isinya berganti perusahaan → proyek, supaya tidak menumpuk dua
// ModalBottomSheet. Tingkat proyek: lencana status, StatTile "Lapor 14 hari",
// laporan harian terbaru (dimuat malas) dan "Perlu perhatian dan eskalasi".
// Baca-saja untuk grup: tanpa tombol tulis.
package id.co.monitorkarya.feature.ringkasangrup

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatVariant
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.ringkasangrup.data.LaporanHarianGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.ProyekGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.grafik.keMk
import id.co.monitorkarya.feature.ringkasangrup.logika.FormatWib
import id.co.monitorkarya.feature.ringkasangrup.logika.KelompokPerusahaan
import id.co.monitorkarya.feature.ringkasangrup.logika.kelompokPerusahaan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelDibutuhkan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelStatusProyek
import id.co.monitorkarya.feature.ringkasangrup.logika.lencanaEskalasi
import id.co.monitorkarya.feature.ringkasangrup.logika.lencanaLaporan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelPic
import id.co.monitorkarya.feature.ringkasangrup.logika.satuBaris
import id.co.monitorkarya.feature.ringkasangrup.logika.statusProyek

@Composable
internal fun SheetDrillDown(
    ringkasan: RingkasanGrupDto,
    sheet: SheetDrill?,
    laporan: Bagian<List<LaporanHarianGrupDto>>,
    aksi: AksiRingkasan,
) {
    val perusahaan: KelompokPerusahaan? = sheet?.let { s ->
        kelompokPerusahaan(ringkasan.projects).firstOrNull { it.entityId == s.entityId }
    }
    val proyek: ProyekGrupDto? = sheet?.proyekId?.let { id -> perusahaan?.proyek?.firstOrNull { it.id == id } }

    val judul = proyek?.name ?: perusahaan?.nama ?: ""
    val subjudul = when {
        proyek != null -> listOfNotNull(proyek.code.ifBlank { null }, labelPic(proyek), proyek.divisionName)
            .joinToString(" · ")
        perusahaan != null ->
            "${perusahaan.kode} · ${FormatWib.angka(perusahaan.lapor)} dari ${FormatWib.angka(perusahaan.total)} proyek lapor hari ini"
        else -> null
    }

    MkSheet(
        visible = perusahaan != null,
        onTutup = aksi.tutupSheet,
        judul = judul,
        subjudul = subjudul,
    ) {
        if (perusahaan == null) return@MkSheet
        if (proyek == null) {
            IsiPerusahaan(perusahaan, aksi.bukaProyek)
        } else {
            // Kembali sistem di tingkat proyek = kembali ke daftar perusahaan,
            // bukan menutup seluruh sheet (sama dengan tombol di bawah).
            BackHandler(onBack = aksi.kembali)
            TextButton(onClick = aksi.kembali) {
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, contentDescription = null)
                Text(stringResource(R.string.rg_kembali_perusahaan) + " " + perusahaan.nama)
            }
            IsiProyek(proyek, laporan, aksi.ulangLaporan)
        }
    }
}

@Composable
private fun IsiPerusahaan(perusahaan: KelompokPerusahaan, onBukaProyek: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        // E2E-2 BUG-08: dulu ProjectRow (rancangan layar lebar) dengan teks status
        // di slot PIC — kolom nama tergencet ke 0, lencana hilang, avatar "LH".
        perusahaan.proyek.forEachIndexed { i, p ->
            if (i > 0) MkDivider()
            BarisProyekRingkas(
                nama = p.name,
                sub = listOf(p.divisionName?.ifBlank { null } ?: perusahaan.kode, labelPic(p)).joinToString(" · "),
                meta = if (p.reportedToday) "Lapor hari ini" else "Belum lapor hari ini",
                metaStatus = if (p.reportedToday) MkStatus.ON else MkStatus.LATE,
                progres = p.progress,
                status = statusProyek(p.status).keMk(),
                onClick = { onBukaProyek(p.id) },
            )
        }
    }
}

/**
 * Baris proyek ramah ponsel: nama (2 baris) + "divisi · PIC" + meta opsional di
 * kiri (lebar fleksibel), lencana status + persen progres di kanan (lebar isi).
 * Pengganti ProjectRow designsystem di layar ringkasan grup/direktur.
 */
@Composable
internal fun BarisProyekRingkas(
    nama: String,
    sub: String,
    progres: Int,
    status: MkStatus,
    meta: String? = null,
    metaStatus: MkStatus? = null,
    dipilih: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(if (dipilih) aksen.soft else Color.Transparent)
            .clickable(enabled = onClick != null, onClick = { onClick?.invoke() })
            .heightIn(min = 48.dp)
            .padding(horizontal = MkSpacing.space2, vertical = MkSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(nama, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (meta != null) {
                Text(
                    meta,
                    style = MkTypography.caption,
                    color = metaStatus?.let { warnaStatus(it) } ?: warna.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            StatusBadge(status = status, size = MkBadgeSize.SM)
            Text("${progres.coerceIn(0, 100)}%", style = MkTypography.footnote.tabular, color = warna.ink)
        }
    }
}

@Composable
internal fun IsiProyek(
    proyek: ProyekGrupDto,
    laporan: Bagian<List<LaporanHarianGrupDto>>,
    onUlang: () -> Unit,
) {
    val warna = LocalMkColors.current
    val status = statusProyek(proyek.status)
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            StatusBadge(status = status.keMk(), text = labelStatusProyek(status))
            Text("${proyek.progress}% selesai", style = MkTypography.footnote, color = warna.ink2)
        }
        proyek.reason?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MkTypography.footnote, color = warna.ink2)
        }

        when (laporan) {
            Bagian.Memuat -> Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                MkSkeleton(tinggi = 92.dp)
                repeat(4) { MkSkeleton(tinggi = 48.dp) }
            }
            is Bagian.Galat -> ErrorNote(pesan = laporan.pesan, onCobaLagi = onUlang)
            is Bagian.Ditolak -> EmptyNote(teks = laporan.pesan)
            is Bagian.Siap -> DaftarLaporan(laporan.data)
        }

        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Judul(stringResource(R.string.rg_eskalasi_proyek))
            if (proyek.escalations.isEmpty()) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_eskalasi), done = true)
            } else {
                proyek.escalations.forEachIndexed { i, e ->
                    if (i > 0) MkDivider()
                    val lencana = lencanaEskalasi(e.status)
                    val umur = e.ageDays ?: 0
                    Row(Modifier.padding(vertical = MkSpacing.space2), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(e.summary, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(
                                "Dibutuhkan: ${labelDibutuhkan(e.needed)} · ${FormatWib.angka(umur)} hari" +
                                    (e.raisedBy?.let { " · diajukan $it" } ?: ""),
                                style = MkTypography.footnote,
                                color = warna.ink2,
                            )
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                            StatusBadge(status = lencana.status.keMk(), size = MkBadgeSize.SM, text = lencana.label)
                            if (e.overdue) StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = "Lewat SLA")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DaftarLaporan(daftar: List<LaporanHarianGrupDto>) {
    val warna = LocalMkColors.current
    val terlambat = daftar.count { it.isLate }
    StatTile(
        modifier = Modifier.fillMaxWidth(),
        variant = MkStatVariant.SURFACE,
        label = stringResource(R.string.rg_lapor_14),
        value = daftar.size,
        delta = when {
            terlambat > 0 -> "${FormatWib.angka(terlambat)} laporan terlambat"
            daftar.isNotEmpty() -> "semua tepat waktu"
            else -> "belum ada laporan"
        },
        tone = when {
            terlambat > 0 -> MkStatus.LATE
            daftar.isNotEmpty() -> MkStatus.ON
            else -> MkStatus.NEUTRAL
        },
    )
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Judul(stringResource(R.string.rg_laporan_terbaru))
        if (daftar.isEmpty()) {
            EmptyNote(teks = stringResource(R.string.rg_kosong_laporan))
            return@Column
        }
        daftar.forEachIndexed { i, r ->
            if (i > 0) MkDivider()
            val lencana = lencanaLaporan(r.status)
            Row(Modifier.padding(vertical = MkSpacing.space2), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        FormatWib.tanggal(r.reportDate) + (r.submittedAt?.let { " · ${FormatWib.jam(it)}" } ?: ""),
                        style = MkTypography.bodyStrong,
                        color = warna.ink,
                    )
                    Text(
                        satuBaris(r.achievementToday).ifEmpty { "Tanpa catatan capaian" },
                        style = MkTypography.footnote,
                        color = warna.ink2,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                    StatusBadge(status = lencana.status.keMk(), size = MkBadgeSize.SM, text = lencana.label)
                    if (r.isLate) StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = "Terlambat")
                }
            }
        }
    }
}

@Composable
private fun Judul(teks: String) {
    Text(
        teks,
        style = MkTypography.headline,
        color = LocalMkColors.current.ink,
        modifier = Modifier.fillMaxWidth().semantics { heading() },
    )
}
