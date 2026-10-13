// Tab Ringkasan PIC ("Hari ini") dan Kepala divisi (B1) — paritas web
// role-dashboards.tsx: PicDashboard (pilih proyek → "<proyek> n% selesai." +
// tenggat laporan + KPI + laporan terakhir + riwayat laporan) dan
// KadivDashboard mode capaian (jawaban + KPI + capaian minggu ini bersaring
// + alur penyerahan + riwayat 8 minggu). Isian laporan, papan mingguan dan
// fitur tim dibuka di tab masing-masing (Laporan harian, Capaian mingguan,
// Divisi) lewat tombol — satu tombol primer per layar.
package id.co.monitorkarya.app.ui.ringkasan

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.ui.luring.TarikSegarkan
import id.co.monitorkarya.app.ui.mingguan.labelStatusButir
import id.co.monitorkarya.app.ui.mingguan.labelStatusHeader
import id.co.monitorkarya.app.ui.mingguan.mkStatusButir
import id.co.monitorkarya.app.ui.mingguan.mkStatusHeader
import id.co.monitorkarya.app.ui.vm.DasborPelaksanaState
import id.co.monitorkarya.app.ui.vm.RingkasanPelaksanaUi
import id.co.monitorkarya.app.ui.vm.RingkasanPelaksanaViewModel
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkRing
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.MkTrend
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.ringkasangrup.grafik.DataBatang
import id.co.monitorkarya.feature.ringkasangrup.grafik.GrafikBatang

/** [bukaTab] membuka tab lain peran ini. */
@Composable
fun RingkasanPelaksanaScreen(
    bukaTab: (TabId) -> Unit,
    vm: RingkasanPelaksanaViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val menyegarkan by vm.menyegarkan.collectAsStateWithLifecycle()
    // E2E-R2 N3: tab Ringkasan tampil lagi → muat ulang diam-diam.
    LaunchedEffect(vm) { vm.saatTampil() }
    val dasbor = (ui.state as? DasborPelaksanaState.Siap)?.dasbor
    // Respons bukan PIC/KADIV (mis. peran berganti) → ringkasan umum Fase 0.
    if (dasbor is DasborPeran.Lain) {
        RingkasanScreen(vm = hiltViewModel(), modifier = modifier)
        return
    }
    RingkasanPelaksanaIsi(
        ui = ui,
        onUlang = vm::ulang,
        onPilihProyek = vm::pilihProyek,
        onSaringButir = vm::saringButir,
        bukaTab = bukaTab,
        menyegarkan = menyegarkan,
        onSegarkan = vm::segarkan,
        modifier = modifier,
    )
}

@Composable
fun RingkasanPelaksanaIsi(
    ui: RingkasanPelaksanaUi,
    onUlang: () -> Unit,
    onPilihProyek: (Int) -> Unit,
    onSaringButir: (String?) -> Unit,
    bukaTab: (TabId) -> Unit,
    sekarangMs: Long = System.currentTimeMillis(),
    menyegarkan: Boolean = false,
    onSegarkan: () -> Unit = onUlang,
    modifier: Modifier = Modifier,
) {
    TarikSegarkan(menyegarkan = menyegarkan, onSegarkan = onSegarkan, modifier = modifier) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        when (val s = ui.state) {
            DasborPelaksanaState.Memuat -> {
                MkSkeleton(tinggi = 24.dp, lebar = 180.dp)
                MkSkeleton(tinggi = 180.dp)
                repeat(2) { MkSkeleton(tinggi = 120.dp) }
            }
            is DasborPelaksanaState.Galat -> ErrorNote(pesan = "Data belum termuat. " + s.pesan, onCobaLagi = onUlang)
            is DasborPelaksanaState.Siap -> when (val d = s.dasbor) {
                is DasborPeran.Pic -> IsiPic(d.data, ui.proyek, onPilihProyek, bukaTab, sekarangMs)
                is DasborPeran.Kadiv -> IsiKadiv(d.data, ui.saringButir, onSaringButir, bukaTab)
                DasborPeran.Lain -> Unit
            }
        }
    }
    }
}

@Composable
private fun Kepala(konteks: String, lencana: Pair<MkStatus, String>?) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(konteks, style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("Ringkasan", style = MkTypography.title1, color = warna.ink, modifier = Modifier.semantics { heading() })
        lencana?.let { StatusBadge(status = it.first, text = it.second) }
    }
}

@Composable
private fun Kartu(judul: String, sub: String?, isi: @Composable ColumnScope.() -> Unit) {
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

// ------------------------------------------------------------------
// PIC — apa yang harus saya laporkan hari ini?
// ------------------------------------------------------------------

@Composable
private fun ColumnScope.IsiPic(d: DasborPic, terpilih: Int, onPilih: (Int) -> Unit, bukaTab: (TabId) -> Unit, sekarangMs: Long) {
    val warna = LocalMkColors.current
    val p = d.proyek.getOrNull(terpilih.coerceIn(0, maxOf(0, d.proyek.lastIndex)))
    if (p == null) {
        Kepala(konteks = "Hari ini", lencana = null)
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(teks = "Belum ada proyek yang ditugaskan kepada Anda. Hubungi Admin PT.")
        }
        return
    }
    Kepala(konteks = if (d.proyek.size == 1) p.nama else "${d.jumlahProyek} proyek", lencana = lencanaHariIni(d, p))

    if (d.proyek.size > 1) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            d.proyek.forEachIndexed { i, x ->
                MkChip(label = x.nama, selected = x.id == p.id, status = mkStatusTurunan(x.statusTurunan), onClick = { onPilih(i) })
            }
        }
    }

    val (jawaban, pendukung) = kalimatPic(d, p, sekarangMs)
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                StatusBadge(status = mkStatusTurunan(p.statusTurunan), size = MkBadgeSize.SM)
                Text(jawaban, style = MkTypography.title3, color = warna.ink)
                Text(pendukung, style = MkTypography.body, color = warna.ink2)
            }
            MkRing(nilai = p.progres, diameter = 96.dp)
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            MkButton(
                modifier = Modifier.fillMaxWidth(),
                label = if (p.terkirim) "Lihat laporan harian" else "Isi laporan harian",
                variant = MkButtonVariant.PRIMARY,
                onClick = { bukaTab(TabId.LAPORAN_HARIAN) },
            )
            MkButton(
                modifier = Modifier.fillMaxWidth(),
                label = "Buka meja kerja",
                variant = MkButtonVariant.PLAIN,
                onClick = { bukaTab(TabId.MEJA_KERJA) },
            )
        }
    }

    // KPI (ponsel 2×2): progres, tepat waktu 7 hari, menuju tenggat, bukti hari ini.
    val awal = p.riwayat.firstOrNull()?.progres
    val sisa = sisaHari(p.tenggat, sekarangMs)
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Progres proyek",
            value = "${p.progres}%",
            delta = if (p.riwayat.size > 1 && awal != null) {
                "+${maxOf(0, p.progres - awal)} poin dalam ${p.riwayat.size} laporan"
            } else {
                "Laporan pertama"
            },
            trend = if (p.riwayat.size > 1 && awal != null && p.progres > awal) MkTrend.UP else MkTrend.FLAT,
        )
        val tepat = d.tepatWaktuPct.toInt()
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Tepat waktu 7 hari",
            value = "$tepat%",
            delta = if (d.tepatWaktuPct >= 85) "Di atas target 85%" else "Target 85%",
            tone = if (d.tepatWaktuPct >= 85) MkStatus.ON else MkStatus.RISK,
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Menuju tenggat",
            value = when {
                sisa == null -> "—"
                sisa < 0 -> "${-sisa} hari"
                else -> "$sisa hari"
            },
            delta = when {
                p.tenggat == null -> "Belum ditetapkan"
                sisa != null && sisa < 0 -> "Lewat sejak ${tglPendek(p.tenggat)}"
                else -> tglPendek(p.tenggat)
            },
            tone = if (sisa != null && sisa < 0) MkStatus.LATE else MkStatus.NEUTRAL,
        )
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Bukti hari ini",
            value = p.buktiHariIni,
            delta = if (p.buktiHariIni > 0) "Terlampir di laporan" else "Belum ada bukti",
            tone = if (p.buktiHariIni > 0) MkStatus.ON else MkStatus.RISK,
        )
    }

    Kartu(judul = "Laporan terakhir", sub = p.terakhir?.let { tglPendek(it.tanggal) } ?: "Belum ada laporan") {
        val t = p.terakhir
        if (t == null) {
            EmptyNote(teks = "Belum ada laporan harian untuk proyek ini.")
        } else {
            Text(t.capaian.ifBlank { "Tanpa catatan capaian" }, style = MkTypography.body, color = warna.ink)
            t.kendala?.takeIf { it.isNotBlank() }?.let {
                Text("Kendala: $it", style = MkTypography.footnote, color = warnaStatus(MkStatus.RISK))
            }
            t.tindakLanjut?.takeIf { it.isNotBlank() }?.let {
                Text("Rencana besok: $it", style = MkTypography.footnote, color = warna.ink2)
            }
        }
    }

    Kartu(judul = "Riwayat laporan", sub = "${p.riwayat.size} laporan terakhir") {
        if (p.riwayat.isEmpty()) {
            EmptyNote(teks = "Belum ada riwayat laporan.")
        } else {
            p.riwayat.asReversed().forEachIndexed { i, h ->
                if (i > 0) MkDivider()
                val (st, label) = lencanaHarian(h.status)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    Text(tglPendek(h.tanggal), style = MkTypography.footnote.tabular, color = warna.ink2)
                    Text("${h.progres}%", style = MkTypography.bodyStrong.tabular, color = warna.ink, modifier = Modifier.weight(1f))
                    StatusBadge(status = st, size = MkBadgeSize.SM, text = label)
                    when {
                        h.diteruskan -> StatusBadge(status = MkStatus.DONE, size = MkBadgeSize.SM, text = "Diteruskan")
                        !h.terkirim -> StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = "Draf")
                        h.terlambat -> StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = "Terlambat")
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// Kepala divisi — apakah capaian minggu ini siap diserahkan?
// ------------------------------------------------------------------

@Composable
private fun ColumnScope.IsiKadiv(d: DasborKadiv, saring: String?, onSaring: (String?) -> Unit, bukaTab: (TabId) -> Unit) {
    val warna = LocalMkColors.current
    Kepala(konteks = namaDivisiKadiv(d), lencana = null)
    val (jawaban, pendukung) = kalimatKadiv(d)
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Text("Minggu ke-${d.isoWeek} · ${d.jumlahButir} item pekerjaan", style = MkTypography.footnote, color = warna.ink2)
        Text(jawaban, style = MkTypography.title3, color = warna.ink, modifier = Modifier.padding(top = 4.dp))
        Text(pendukung, style = MkTypography.body, color = warna.ink2, modifier = Modifier.padding(top = 4.dp))
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            MkButton(
                modifier = Modifier.fillMaxWidth(),
                label = "Isi capaian mingguan",
                variant = MkButtonVariant.PRIMARY,
                onClick = { bukaTab(TabId.CAPAIAN_MINGGUAN) },
            )
            MkButton(
                modifier = Modifier.fillMaxWidth(),
                label = "Buka modul divisi",
                variant = MkButtonVariant.PLAIN,
                onClick = { bukaTab(TabId.PEMBAGIAN_DIVISI) },
            )
        }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Item selesai",
            value = d.selesai,
            delta = "${persenSelesai(d)}% dari ${d.jumlahButir} item",
        )
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Terkendala",
            value = d.terkendala,
            delta = if (d.perluEskalasi > 0) "${d.perluEskalasi} perlu eskalasi" else "Tidak ada eskalasi",
            tone = if (d.terkendala > 0) MkStatus.RISK else MkStatus.ON,
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Bukti kurang",
            value = d.tanpaBukti,
            delta = if (d.tanpaBukti > 0) "Menahan penyerahan" else "Semua item berbukti",
            tone = if (d.tanpaBukti > 0) MkStatus.LATE else MkStatus.ON,
        )
        StatTile(
            modifier = Modifier.weight(1f),
            label = "Sisa waktu serah",
            value = if (d.tenggatLewat) "Lewat" else "${d.sisaJam} jam",
            delta = labelSerah(d),
            tone = when {
                d.tenggatLewat -> MkStatus.LATE
                d.sisaJam < 24 -> MkStatus.RISK
                else -> MkStatus.NEUTRAL
            },
        )
    }

    Kartu(judul = "Capaian minggu ini", sub = "Item baru dihitung selesai setelah berstatus Selesai dan berbukti") {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            SARINGAN_BUTIR_KADIV.forEach { (nilai, label) ->
                MkChip(
                    label = label,
                    selected = saring == nilai,
                    status = nilai?.let { mkStatusButir(it) },
                    count = nilai?.let { d.perStatus[it] ?: 0 } ?: d.butir.size,
                    onClick = { onSaring(nilai) },
                )
            }
        }
        val tampil = if (saring == null) d.butir else d.butir.filter { it.status == saring }
        if (tampil.isEmpty()) {
            EmptyNote(teks = if (d.butir.isEmpty()) "Belum ada item pekerjaan minggu ini." else "Tidak ada item dengan status ini.")
        } else {
            tampil.take(8).forEachIndexed { i, b ->
                if (i > 0) MkDivider()
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    Column(Modifier.weight(1f)) {
                        Text(b.uraian, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            b.pic + (b.target?.let { " · target ${tglPendek(it)}" } ?: "") +
                                if (b.bukti == 0 && b.status !in setOf("BELUM_MULAI", "NA")) " · belum ada bukti" else "",
                            style = MkTypography.footnote,
                            color = warna.ink2,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text("${b.progres}%", style = MkTypography.caption.tabular, color = warna.ink2)
                    StatusBadge(status = mkStatusButir(b.status), size = MkBadgeSize.SM, text = labelStatusButir(b.status))
                }
            }
        }
        MkButton(label = "Buka isian", size = MkButtonSize.S, onClick = { bukaTab(TabId.CAPAIAN_MINGGUAN) })
    }

    Kartu(
        judul = "Penyerahan minggu ini",
        sub = if (d.tenggatLewat) "Tenggat penyerahan sudah lewat" else "Tenggat ${labelSerah(d)}",
    ) {
        alurPenyerahan(d).forEachIndexed { i, (judul, sub, st) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                Text("${i + 1}", style = MkTypography.footnote.tabular, color = warna.ink3)
                Column(Modifier.weight(1f)) {
                    Text(judul, style = MkTypography.bodyStrong, color = warna.ink)
                    Text(sub, style = MkTypography.footnote, color = warna.ink2)
                }
                StatusBadge(status = st, size = MkBadgeSize.SM)
            }
        }
        if (d.divisi.size > 1) {
            MkDivider()
            d.divisi.forEach { dv ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(dv.nama, style = MkTypography.body, color = warna.ink, modifier = Modifier.weight(1f))
                    StatusBadge(status = mkStatusHeader(dv.statusHeader), size = MkBadgeSize.SM, text = labelStatusHeader(dv.statusHeader))
                }
            }
        }
    }

    Kartu(judul = "Riwayat 8 minggu", sub = "Item selesai per minggu") {
        if (d.riwayat.isEmpty() || d.riwayat.all { it.third == 0 }) {
            EmptyNote(teks = "Belum ada riwayat.")
        } else {
            GrafikBatang(
                data = d.riwayat.map { (label, selesai, total) -> DataBatang(label, selesai.toDouble(), "$selesai/$total") },
                judulAksesibel = "Item selesai per minggu",
            )
        }
    }
}
