// Meja kerja Kepala divisi (B1) — paritas web src/components/work-desk/
// kadiv-desk.tsx (03-kepala-divisi.md): apakah capaian minggu ini siap
// diserahkan, dan apa yang masih menahannya? Pilih divisi → kalimat jawaban
// + tombol primer (Serahkan ke Admin PT / Setujui capaian / Buka papan) →
// empat KPI → daftar periksa penyerahan + alur → Perlu tindakan → Capaian hari
// ini → Riwayat 6 minggu. Menyunting butir terjadi di tab Capaian mingguan
// (papan yang sama dengan web ItemDialog); fitur tim (laporan harian anggota,
// beban kerja, aktivitas) ada di tab Divisi.
package id.co.monitorkarya.app.ui.mejakadiv

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.ui.mingguan.labelStatusButir
import id.co.monitorkarya.app.ui.mingguan.mkStatusButir
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.ringkasangrup.grafik.DataBatang
import id.co.monitorkarya.feature.ringkasangrup.grafik.GrafikBatang

/**
 * @param onBukaPapan membuka tab Capaian mingguan (papan butir).
 * @param onBukaTim membuka tab Divisi (ringkasan tim).
 */
@Composable
fun MejaKadivScreen(
    onBukaPapan: () -> Unit,
    onBukaTim: () -> Unit,
    vm: MejaKadivViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    MejaKadivIsi(
        ui = ui,
        aksi = AksiMejaKadiv(
            ulang = vm::ulang,
            pilihDivisi = vm::pilihDivisi,
            pilihBatang = vm::pilihBatang,
            serahkan = vm::serahkan,
            setujui = vm::setujui,
            pesanTampil = vm::pesanTampil,
            bukaPapan = onBukaPapan,
            bukaTim = onBukaTim,
        ),
        modifier = modifier,
    )
}

data class AksiMejaKadiv(
    val ulang: () -> Unit = {},
    val pilihDivisi: (String) -> Unit = {},
    val pilihBatang: (Int) -> Unit = {},
    val serahkan: () -> Unit = {},
    val setujui: () -> Unit = {},
    val pesanTampil: () -> Unit = {},
    val bukaPapan: () -> Unit = {},
    val bukaTim: () -> Unit = {},
)

@Composable
fun MejaKadivIsi(
    ui: MejaKadivUi,
    aksi: AksiMejaKadiv,
    sekarangMs: Long = System.currentTimeMillis(),
    modifier: Modifier = Modifier,
) {
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(ui.pesan?.id) {
        val p = ui.pesan ?: return@LaunchedEffect
        aksi.pesanTampil()
        snackbar.showSnackbar(p.teks)
    }
    Box(modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            when (val s = ui.state) {
                MejaKadivState.Memuat -> {
                    MkSkeleton(tinggi = 24.dp, lebar = 180.dp)
                    MkSkeleton(tinggi = 160.dp)
                    repeat(3) { MkSkeleton(tinggi = 120.dp) }
                }
                is MejaKadivState.Galat -> {
                    Judul(konteks = "Meja kerja")
                    ErrorNote(pesan = s.pesan, onCobaLagi = aksi.ulang)
                }
                is MejaKadivState.Siap -> IsiMeja(s, ui, aksi, sekarangMs)
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(MkSpacing.space3))
    }
}

@Composable
private fun Judul(konteks: String, lencana: (@Composable () -> Unit)? = null) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(konteks, style = MkTypography.footnote, color = warna.ink2)
        Text("Meja kerja", style = MkTypography.title1, color = warna.ink, modifier = Modifier.semantics { heading() })
        lencana?.invoke()
    }
}

@Composable
private fun ColumnScope.IsiMeja(s: MejaKadivState.Siap, ui: MejaKadivUi, aksi: AksiMejaKadiv, sekarangMs: Long) {
    val warna = LocalMkColors.current
    val papan: WeeklyInputResponse = s.papan
    val divisiList = papan.divisions
    val divisi = divisiList.firstOrNull { it.id == ui.divisiId } ?: divisiList.firstOrNull()
    if (divisi == null) {
        Judul(konteks = "Meja kerja")
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(teks = "Anda belum tercatat sebagai kepala divisi mana pun. Hubungi Admin PT.")
        }
        return
    }
    val m = susunMejaKadiv(papan, divisi, s.meja, sekarangMs)

    Judul(konteks = if (divisiList.size == 1) "Divisi ${divisi.name}" else "${divisiList.size} divisi") {
        StatusBadge(
            status = when {
                m.diserahkan -> MkStatus.DONE
                m.tenggatLewat -> MkStatus.LATE
                else -> MkStatus.RISK
            },
            text = m.lencanaKepala,
        )
    }

    if (divisiList.size > 1) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            divisiList.forEach { d ->
                MkChip(
                    label = d.name,
                    selected = d.id == divisi.id,
                    count = d.report?.items?.size ?: 0,
                    onClick = { aksi.pilihDivisi(d.id) },
                )
            }
        }
    }

    // Hero: jawaban + pendukung + satu tombol primer.
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Text("Meja kerja · minggu ke-${papan.week.isoWeek}", style = MkTypography.footnote, color = warna.ink2)
        Text(m.jawaban, style = MkTypography.title3, color = warna.ink, modifier = Modifier.padding(top = 4.dp))
        if (m.pendukung.isNotBlank()) {
            Text(m.pendukung, style = MkTypography.body, color = warna.ink2, modifier = Modifier.padding(top = 4.dp))
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            when (m.aksiPrimer) {
                AksiPrimerKadiv.SERAHKAN -> MkButton(
                    modifier = Modifier.fillMaxWidth(),
                    label = if (ui.sibuk == "submit") "Menyerahkan…" else "Serahkan ke Admin PT",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !m.terkunci && ui.sibuk == null,
                    onClick = aksi.serahkan,
                )
                AksiPrimerKadiv.SETUJUI -> MkButton(
                    modifier = Modifier.fillMaxWidth(),
                    label = if (ui.sibuk == "approve") "Menyetujui…" else "Setujui capaian",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !m.terkunci && ui.sibuk == null,
                    onClick = aksi.setujui,
                )
                AksiPrimerKadiv.BUKA_PAPAN -> MkButton(
                    modifier = Modifier.fillMaxWidth(),
                    label = "Buka papan mingguan",
                    variant = MkButtonVariant.PRIMARY,
                    onClick = aksi.bukaPapan,
                )
            }
            if (m.aksiPrimer != AksiPrimerKadiv.BUKA_PAPAN) {
                MkButton(
                    modifier = Modifier.fillMaxWidth(),
                    label = "Lihat papan mingguan",
                    variant = MkButtonVariant.PLAIN,
                    onClick = aksi.bukaPapan,
                )
            }
        }
    }

    // Empat KPI (ponsel 2×2).
    val riwayatSebelumnya = maxOf(0, m.riwayat.size - 1)
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Item selesai",
            value = "${m.selesai} dari ${m.dihitung}",
            delta = "${m.persen}% minggu ini",
        )
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Terkendala",
            value = m.terkendala,
            delta = if (m.tanpaTindakLanjut > 0) "${m.tanpaTindakLanjut} tanpa tindak lanjut" else "Semua punya tindak lanjut",
            tone = if (m.terkendala > 0) MkStatus.RISK else MkStatus.ON,
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Bukti kurang",
            value = m.tanpaBukti,
            delta = if (m.tanpaBukti > 0) "Menahan penyerahan" else "Semua item berbukti",
            tone = if (m.tanpaBukti > 0) MkStatus.LATE else MkStatus.ON,
        )
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Serah tepat waktu",
            value = "${m.tepatWaktuSebelumnya} dari $riwayatSebelumnya",
            delta = "minggu sebelumnya",
            tone = if (m.riwayat.size > 1 && m.tepatWaktuSebelumnya == riwayatSebelumnya) MkStatus.ON else MkStatus.NEUTRAL,
        )
    }

    KartuPeriksa(m, ui, papan.canApprove)
    KartuTindakan(m, aksi)
    KartuHariIni(m, s.meja.today, aksi)
    KartuRiwayat(m, ui, aksi)

    MkCard(modifier = Modifier.fillMaxWidth()) {
        Text("Tim divisi", style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        Text(
            "Laporan harian anggota, ingatkan yang belum lapor, beban kerja, dan ringkasan untuk Direktur ada di tab Divisi.",
            style = MkTypography.footnote,
            color = warna.ink2,
            modifier = Modifier.padding(top = 2.dp, bottom = MkSpacing.space3),
        )
        MkButton(label = "Buka tim divisi", size = MkButtonSize.S, onClick = aksi.bukaTim)
    }
}

@Composable
private fun KartuJudul(judul: String, sub: String?, isi: @Composable ColumnScope.() -> Unit) {
    val warna = LocalMkColors.current
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Text(judul, style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        if (sub != null) Text(sub, style = MkTypography.footnote, color = warna.ink2, modifier = Modifier.padding(top = 2.dp))
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) { isi() }
    }
}

@Composable
private fun KartuPeriksa(m: SusunanMejaKadiv, ui: MejaKadivUi, bolehSetujui: Boolean) {
    val warna = LocalMkColors.current
    KartuJudul(
        judul = "Daftar periksa penyerahan",
        sub = "${m.terpenuhi} dari ${m.syarat.size} terpenuhi · disusun dari papan mingguan",
    ) {
        // Alur capaian mingguan (FlowDiagram vertikal di ponsel).
        val alur = listOf(
            Triple("Isi capaian", "${m.butir.size} item", if (m.butir.isNotEmpty()) MkStatus.DONE else MkStatus.INFO),
            Triple(
                "Serahkan",
                if (!m.diserahkan && m.tanpaBukti > 0) "${m.tanpaBukti} tanpa bukti" else "ke Admin PT",
                when {
                    m.diserahkan -> MkStatus.DONE
                    m.tanpaBukti > 0 || m.tanpaTindakLanjut > 0 -> MkStatus.LATE
                    m.butir.isNotEmpty() -> MkStatus.INFO
                    else -> MkStatus.NEUTRAL
                },
            ),
            Triple(
                "Setujui",
                if (bolehSetujui) "oleh Anda" else "kepala divisi",
                when {
                    m.disetujui -> MkStatus.DONE
                    m.diserahkan -> MkStatus.INFO
                    else -> MkStatus.NEUTRAL
                },
            ),
            Triple(
                "Diteruskan",
                "Admin PT ke holding",
                when {
                    m.diteruskan -> MkStatus.DONE
                    m.disetujui -> MkStatus.INFO
                    else -> MkStatus.NEUTRAL
                },
            ),
        )
        alur.forEachIndexed { i, (judul, sub, st) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                Text("${i + 1}", style = MkTypography.footnote.tabular, color = warna.ink3)
                Text(judul, style = MkTypography.bodyStrong, color = warna.ink)
                Text(sub, style = MkTypography.footnote, color = warna.ink2, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                StatusBadge(status = st, size = MkBadgeSize.SM)
            }
        }
        MkDivider()
        m.syarat.forEach { c ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                modifier = Modifier.semantics { contentDescription = "${c.teks}, ${if (c.ok) "terpenuhi" else "belum terpenuhi"}" },
            ) {
                Icon(
                    imageVector = if (c.ok) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                    contentDescription = null,
                    tint = if (c.ok) warnaStatus(MkStatus.ON) else warna.ink3,
                    modifier = Modifier.size(22.dp),
                )
                Column(Modifier.weight(1f)) {
                    Text(c.teks, style = MkTypography.bodyStrong, color = warna.ink)
                    Text(c.petunjuk, style = MkTypography.footnote, color = warna.ink2)
                }
            }
        }
        if (ui.masalah.isNotEmpty()) {
            MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
                Text("Perbaiki dulu sebelum menyerahkan", style = MkTypography.bodyStrong, color = warnaStatus(MkStatus.LATE))
                ui.masalah.take(6).forEach { Text("• $it", style = MkTypography.footnote, color = warna.ink) }
            }
        }
    }
}

@Composable
private fun KartuTindakan(m: SusunanMejaKadiv, aksi: AksiMejaKadiv) {
    val warna = LocalMkColors.current
    KartuJudul(
        judul = "Perlu tindakan",
        sub = if (m.tindakan.isNotEmpty()) "${m.tindakan.size} item · ketuk untuk memperbaiki di papan" else "Tidak ada yang tertahan",
    ) {
        if (m.tindakan.isEmpty()) {
            EmptyNote(teks = if (m.butir.isNotEmpty()) "Semua item siap diserahkan." else "Belum ada item minggu ini.", done = true)
            return@KartuJudul
        }
        m.tindakan.take(7).forEachIndexed { i, t ->
            if (i > 0) MkDivider()
            MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space2, onClick = if (m.terkunci) null else aksi.bukaPapan) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    Column(Modifier.weight(1f)) {
                        Text(t.butir.workItem, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${t.butir.picName} · ${t.alasan}", style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    StatusBadge(status = mkStatusButir(t.butir.status), size = MkBadgeSize.SM, text = labelStatusButir(t.butir.status))
                }
            }
        }
    }
}

@Composable
private fun KartuHariIni(m: SusunanMejaKadiv, hariIniIso: String, aksi: AksiMejaKadiv) {
    val warna = LocalMkColors.current
    KartuJudul(
        judul = "Capaian hari ini",
        sub = if (m.hariIni.isNotEmpty()) {
            "${m.hariIni.count { it.status == "SELESAI" }} dari ${m.hariIni.size} selesai"
        } else {
            tanggalHariIni(hariIniIso)
        },
    ) {
        if (m.hariIni.isEmpty()) {
            EmptyNote(teks = "Belum ada capaian yang dicatat untuk hari ini.")
        } else {
            m.hariIni.forEachIndexed { i, b ->
                if (i > 0) MkDivider()
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    Icon(
                        imageVector = if (b.status == "SELESAI") Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                        contentDescription = null,
                        tint = if (b.status == "SELESAI") warnaStatus(MkStatus.DONE) else warna.ink3,
                        modifier = Modifier.size(20.dp),
                    )
                    Column(Modifier.weight(1f)) {
                        Text(b.workItem, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${b.picName} · ${b.targetOutput}", style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text("${b.progressPct}%", style = MkTypography.caption.tabular, color = warna.ink2)
                }
            }
        }
        MkButton(
            label = "Tambah capaian",
            size = MkButtonSize.S,
            enabled = !m.terkunci,
            onClick = aksi.bukaPapan,
        )
    }
}

@Composable
private fun KartuRiwayat(m: SusunanMejaKadiv, ui: MejaKadivUi, aksi: AksiMejaKadiv) {
    val warna = LocalMkColors.current
    KartuJudul(judul = "Riwayat 6 minggu", sub = "Item selesai per minggu") {
        if (m.riwayat.isEmpty()) {
            EmptyNote(teks = "Belum ada riwayat.")
            return@KartuJudul
        }
        val idx = (ui.batang ?: m.riwayat.lastIndex).coerceIn(0, m.riwayat.lastIndex)
        val h = m.riwayat[idx]
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.fillMaxWidth()) {
            Text("${h.done} dari ${h.total}", style = MkTypography.title2.tabular, color = warna.ink)
            if (h.status != null) {
                StatusBadge(
                    status = if (h.onTime) MkStatus.DONE else MkStatus.RISK,
                    size = MkBadgeSize.SM,
                    text = when {
                        h.onTime -> "Diserahkan tepat waktu"
                        idx == m.riwayat.lastIndex && !m.diserahkan -> "Belum diserahkan"
                        else -> "Terlambat diserahkan"
                    },
                )
            } else {
                Text("${h.label} · tidak ada laporan", style = MkTypography.footnote, color = warna.ink2)
            }
        }
        GrafikBatang(
            data = m.riwayat.map { DataBatang(it.label, it.done.toDouble(), "${it.done}") },
            judulAksesibel = "Item selesai per minggu",
            terpilih = idx,
            onPilih = aksi.pilihBatang,
        )
    }
}
