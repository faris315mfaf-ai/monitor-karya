// Tab Ringkasan Direktur entitas (B1) — paritas web oversight-dashboard.tsx:
// DIREKTUR_ENTITAS dengan data divisi memakai DirectorDashboard
// (director-dashboard.tsx + weekly-reports.tsx); tanpa divisi jatuh ke layar
// Manajemen (RingkasanGrupTab). Urutan: saringan divisi → kalimat jawaban +
// tiga cincin + KPI → laporan mingguan per kepala divisi (Ingatkan / Baca /
// Tandai sudah dibaca + Urungkan) → output aktif per divisi → milestone 14
// hari → proyek (saringan status) → keputusan menunggu → tren output →
// tepat waktu per divisi. Detail dibuka di Sheet; tidak ada konfirmasi
// (bukan hapus). Keputusan persetujuan/eskalasi diambil di tab masing-masing.
package id.co.monitorkarya.feature.ringkasangrup

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.domain.roles.bolehLihatTab
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkAvatar
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkDivisionBar
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkPenandaTersimpan
import id.co.monitorkarya.designsystem.components.MkRing
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.MkTrend
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.nadaDivisi
import id.co.monitorkarya.designsystem.components.nadaDivisiCerah
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.ringkasangrup.data.DivisiGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.grafik.GrafikDonat
import id.co.monitorkarya.feature.ringkasangrup.grafik.GrafikTren
import id.co.monitorkarya.feature.ringkasangrup.grafik.SegmenDonat
import id.co.monitorkarya.feature.ringkasangrup.grafik.keMk
import id.co.monitorkarya.feature.ringkasangrup.logika.FormatWib
import id.co.monitorkarya.feature.ringkasangrup.logika.KeadaanMingguan
import id.co.monitorkarya.feature.ringkasangrup.logika.StatusRingkas
import id.co.monitorkarya.feature.ringkasangrup.logika.SusunanDirektur
import id.co.monitorkarya.feature.ringkasangrup.logika.TARGET_TEPAT_WAKTU
import id.co.monitorkarya.feature.ringkasangrup.logika.alurMingguan
import id.co.monitorkarya.feature.ringkasangrup.logika.barisLaporanDivisi
import id.co.monitorkarya.feature.ringkasangrup.logika.labelDibutuhkan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelDivisiUnik
import id.co.monitorkarya.feature.ringkasangrup.logika.labelMingguLaporan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelStatusProyek
import id.co.monitorkarya.feature.ringkasangrup.logika.lencanaMingguanDivisi
import id.co.monitorkarya.feature.ringkasangrup.logika.labelPic
import id.co.monitorkarya.feature.ringkasangrup.logika.namaPic
import id.co.monitorkarya.feature.ringkasangrup.logika.persen
import id.co.monitorkarya.feature.ringkasangrup.logika.statusProyek
import id.co.monitorkarya.feature.ringkasangrup.logika.susunDirektur
import id.co.monitorkarya.feature.ringkasangrup.logika.urutanChipDivisi
import id.co.monitorkarya.feature.ringkasangrup.logika.waktuKirimRelatif
import kotlinx.coroutines.launch

/**
 * Titik masuk tab Ringkasan Direktur entitas. [onBukaTab] membuka tab lain
 * (Proyek, Eskalasi, Persetujuan, Divisi) — hanya tab yang boleh dilihat peran.
 */
@Composable
fun RingkasanDirekturTab(
    peran: Peran,
    onBukaTab: (TabId) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val vm: RingkasanDirekturViewModel = hiltViewModel()
    LaunchedEffect(Unit) { vm.mulai() }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val data = (ui.ringkasan as? Bagian.Siap)?.data
    // Respons tanpa divisi (atau lama) → layar Manajemen, sama dengan web.
    if (data != null && data.divisions.isEmpty()) {
        RingkasanGrupTab(peran = peran, modifier = modifier)
        return
    }
    val buka: (TabId) -> Unit = { tab -> if (bolehLihatTab(peran, tab)) onBukaTab(tab) }
    RingkasanDirekturIsi(
        ui = ui,
        aksi = AksiDirektur(
            muatUlang = vm::muatUlang,
            pilihDivisi = vm::pilihDivisi,
            pilihStatus = vm::pilihStatus,
            pilihTitikTren = vm::pilihTitikTren,
            bukaLaporanDivisi = vm::bukaLaporanDivisi,
            tutupLaporanDivisi = vm::tutupLaporanDivisi,
            bukaProyek = vm::bukaProyek,
            tutupProyek = vm::tutupProyek,
            ulangLaporanProyek = vm::ulangLaporanProyek,
            tandaiDibaca = vm::tandaiDibaca,
            urungkanDibaca = vm::urungkanDibaca,
            ingatkan = vm::ingatkan,
            pesanTampil = vm::pesanTampil,
            bukaTab = buka,
            bolehTab = { bolehLihatTab(peran, it) },
        ),
        modifier = modifier,
    )
}

/** Kumpulan aksi layar (versi state-murni mudah dipratinjau). */
data class AksiDirektur(
    val muatUlang: () -> Unit = {},
    val pilihDivisi: (String?) -> Unit = {},
    val pilihStatus: (StatusRingkas?) -> Unit = {},
    val pilihTitikTren: (Int) -> Unit = {},
    val bukaLaporanDivisi: (String) -> Unit = {},
    val tutupLaporanDivisi: () -> Unit = {},
    val bukaProyek: (String) -> Unit = {},
    val tutupProyek: () -> Unit = {},
    val ulangLaporanProyek: () -> Unit = {},
    val tandaiDibaca: (String) -> Unit = {},
    val urungkanDibaca: (String) -> Unit = {},
    val ingatkan: (String) -> Unit = {},
    val pesanTampil: () -> Unit = {},
    val bukaTab: (TabId) -> Unit = {},
    val bolehTab: (TabId) -> Boolean = { false },
)

private val LEBAR_DUA_KOLOM = 600.dp

private val SARING_STATUS = listOf(
    null to "Semua",
    StatusRingkas.ON to "Sesuai jadwal",
    StatusRingkas.RISK to "Perlu perhatian",
    StatusRingkas.LATE to "Terlambat",
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun RingkasanDirekturIsi(
    ui: RingkasanDirekturUi,
    aksi: AksiDirektur,
    modifier: Modifier = Modifier,
) {
    val snackbar = remember { SnackbarHostState() }
    // E2E-2 BUG-04: snackbar diluncurkan di lingkup layar yang bertahan. Dulu
    // showSnackbar berjalan di dalam LaunchedEffect(ui.pesan?.id) yang sekaligus
    // mengosongkan pesan — kunci berubah ke null, efek (dan snackbar-nya)
    // dibatalkan sebelum tampil, sehingga Urungkan tidak pernah terlihat.
    val lingkupPesan = rememberCoroutineScope()
    val aksiTerkini by rememberUpdatedState(aksi)
    LaunchedEffect(ui.pesan?.id) {
        val p = ui.pesan ?: return@LaunchedEffect
        lingkupPesan.launch {
            // Pesan baru menggantikan yang sedang tampil (tidak antre 10 dtk).
            snackbar.currentSnackbarData?.dismiss()
            val hasil = snackbar.showSnackbar(
                message = p.teks,
                actionLabel = p.urungkanDivisi?.let { "Urungkan" },
                duration = if (p.urungkanDivisi != null) SnackbarDuration.Long else SnackbarDuration.Short,
            )
            if (hasil == SnackbarResult.ActionPerformed && p.urungkanDivisi != null) {
                aksiTerkini.urungkanDibaca(p.urungkanDivisi)
            }
        }
        // Tandai sudah ditampilkan SETELAH snackbar diluncurkan di lingkup layar.
        aksi.pesanTampil()
    }
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val duaKolom = maxWidth >= LEBAR_DUA_KOLOM
        val gulir = rememberScrollState()
        val keEskalasi = remember { BringIntoViewRequester() }
        val keMingguan = remember { BringIntoViewRequester() }
        val lingkup = rememberCoroutineScope()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(gulir)
                // Margin samping layar 12dp (aturan desain Android).
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            // B6: isi dari potret Room (server tak terjangkau) selalu ditandai.
            ui.tersimpanPada?.let { MkPenandaTersimpan(tersimpanPadaMs = it) }
            when (val r = ui.ringkasan) {
                Bagian.Memuat -> Kerangka()
                is Bagian.Galat -> ErrorNote(pesan = "Ringkasan belum termuat. " + r.pesan, onCobaLagi = aksi.muatUlang)
                is Bagian.Ditolak -> EmptyNote(teks = r.pesan)
                is Bagian.Siap -> {
                    val d = r.data
                    val s = susunDirektur(d, ui.divisiId, ui::keadaan)
                    IsiDirektur(
                        d = d,
                        s = s,
                        ui = ui,
                        aksi = aksi,
                        duaKolom = duaKolom,
                        keEskalasi = keEskalasi,
                        keMingguan = keMingguan,
                        gulirKe = { req -> lingkup.launch { req.bringIntoView() } },
                    )
                }
            }
        }
        SnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter).padding(MkSpacing.space3))

        val data = (ui.ringkasan as? Bagian.Siap)?.data
        if (data != null) {
            SheetLaporanDivisi(data, ui, aksi)
            SheetProyekDirektur(data, ui, aksi)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ColumnScope.IsiDirektur(
    d: RingkasanGrupDto,
    s: SusunanDirektur,
    ui: RingkasanDirekturUi,
    aksi: AksiDirektur,
    duaKolom: Boolean,
    keEskalasi: BringIntoViewRequester,
    keMingguan: BringIntoViewRequester,
    gulirKe: (BringIntoViewRequester) -> Unit,
) {
    val warna = LocalMkColors.current
    val labelMinggu = labelMingguLaporan(d)

    // Kepala: konteks + judul + muat ulang.
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            Text(
                text = s.satu?.let { "Divisi ${s.label(it)}" } ?: "${d.divisions.size} divisi",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            Text("Ringkasan", style = MkTypography.title1, color = warna.ink, modifier = Modifier.semantics { heading() })
        }
        MkIconBtn(icon = Icons.Outlined.Refresh, label = "Muat ulang ringkasan", onClick = aksi.muatUlang)
    }

    // Saringan divisi — semua isi halaman ikut tersaring.
    if (d.divisions.size > 1) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            MkChip(label = "Semua", selected = ui.divisiId == null, onClick = { aksi.pilihDivisi(null) })
            // E2E-2 BUG-09: nama ganda lintas PT diberi nama PT, chip dikelompokkan per PT.
            urutanChipDivisi(d.divisions).forEach { dv ->
                MkChip(label = s.label(dv), selected = ui.divisiId == dv.id, onClick = { aksi.pilihDivisi(dv.id) })
            }
        }
    }

    // Hero: eyebrow + jawaban + pendukung + tombol + tiga cincin.
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Text(s.eyebrow, style = MkTypography.footnote, color = warna.ink2)
        Text(s.jawaban, style = MkTypography.title3, color = warna.ink, modifier = Modifier.padding(top = 4.dp))
        Text(s.pendukung, style = MkTypography.body, color = warna.ink2, modifier = Modifier.padding(top = 4.dp))
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            if (s.menunggu > 0) {
                MkButton(
                    label = "Tinjau ${FormatWib.angka(s.menunggu)} ${s.kataMenunggu}",
                    variant = MkButtonVariant.PRIMARY,
                    onClick = { gulirKe(keEskalasi) },
                )
                MkButton(label = "Baca laporan mingguan", variant = MkButtonVariant.PLAIN, onClick = { gulirKe(keMingguan) })
            } else {
                MkButton(label = "Baca laporan mingguan", variant = MkButtonVariant.PRIMARY, onClick = { gulirKe(keMingguan) })
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            Cincin(
                nilai = persen(s.outputSelesai, s.outputTotal),
                judul = "Output",
                angka = "${s.outputSelesai} dari ${s.outputTotal}",
                sub = "output selesai",
                warnaCincin = null,
            )
            Cincin(
                nilai = persen(s.diterima, s.divisi.size),
                judul = "Laporan mingguan",
                angka = "${s.diterima} dari ${s.divisi.size}",
                sub = "masuk · $labelMinggu",
                warnaCincin = MkStatus.ON,
            )
            Cincin(
                nilai = s.tepatWaktuPct,
                judul = "Tepat waktu",
                angka = "${s.tepatWaktuPct}%",
                sub = if (s.tepatWaktuBasisOutput) "output sesuai tenggat" else "laporan harian 30 hari",
                warnaCincin = MkStatus.INFO,
            )
        }
    }

    // KPI: ponsel 2 (output & laporan mingguan), tablet 4.
    val lewatSla = s.eskalasi.count { it.overdue }
    val ubinOutput: @Composable (Modifier) -> Unit = { m ->
        StatTile(
            modifier = m,
            label = "Output selesai minggu ini",
            value = s.mingguIni,
            delta = "${if (s.selisih >= 0) "+" else ""}${s.selisih} dari minggu lalu",
            trend = when {
                s.selisih > 0 -> MkTrend.UP
                s.selisih < 0 -> MkTrend.DOWN
                else -> MkTrend.FLAT
            },
        )
    }
    val ubinMingguan: @Composable (Modifier) -> Unit = { m ->
        StatTile(
            modifier = m,
            label = "Laporan mingguan $labelMinggu",
            value = "${s.diterima} dari ${s.divisi.size}",
            delta = if (s.belumMasuk.isNotEmpty()) "${s.belumMasuk.size} belum masuk" else "Semua sudah masuk",
            tone = if (s.belumMasuk.isNotEmpty()) MkStatus.LATE else MkStatus.ON,
        )
    }
    val ubinMenunggu: @Composable (Modifier) -> Unit = { m ->
        StatTile(
            modifier = m,
            label = "Menunggu keputusan",
            value = s.menunggu,
            delta = when {
                lewatSla > 0 -> "$lewatSla lewat SLA"
                s.menunggu > 0 -> "Semua dalam SLA"
                else -> "Tidak ada"
            },
            tone = when {
                lewatSla > 0 -> MkStatus.LATE
                s.menunggu > 0 -> MkStatus.RISK
                else -> MkStatus.ON
            },
        )
    }
    val ubinMilestone: @Composable (Modifier) -> Unit = { m ->
        StatTile(
            modifier = m,
            label = "Milestone 14 hari",
            value = s.milestone.size,
            delta = s.milestone.firstOrNull()?.let { "Terdekat ${FormatWib.tanggal(it.targetEndDate)}" } ?: "Tidak ada tenggat dekat",
            tone = if (s.milestone.any { statusProyek(it.status) in setOf(StatusRingkas.LATE, StatusRingkas.RISK) }) MkStatus.RISK else MkStatus.NEUTRAL,
        )
    }
    val ubin = if (duaKolom) listOf(ubinOutput, ubinMingguan, ubinMenunggu, ubinMilestone) else listOf(ubinOutput, ubinMingguan)
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        ubin.forEach { it(Modifier.weight(1f)) }
    }

    // Laporan mingguan per kepala divisi + alur.
    Box(Modifier.bringIntoViewRequester(keMingguan)) {
        KartuLaporanMingguan(d, s, ui, aksi, labelMinggu)
    }

    KartuOutputAktif(d, s, ui, aksi)
    KartuMilestone(s, aksi)
    KartuProyek(d, s, ui, aksi)

    Box(Modifier.bringIntoViewRequester(keEskalasi)) {
        KartuKeputusan(s, aksi)
    }

    KartuTrenOutput(s, ui, aksi)
    KartuTepatWaktu(s)
}

@Composable
private fun Cincin(nilai: Int, judul: String, angka: String, sub: String, warnaCincin: MkStatus?) {
    val warna = LocalMkColors.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (warnaCincin == null) {
            MkRing(nilai = nilai, diameter = 72.dp)
        } else {
            MkRing(nilai = nilai, diameter = 72.dp, warna = warnaStatus(warnaCincin))
        }
        Text(judul, style = MkTypography.caption, color = warna.ink2)
        Text(angka, style = MkTypography.footnote.tabular, color = warna.ink)
        Text(sub, style = MkTypography.caption, color = warna.ink3, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun Kartu(judul: String, subjudul: String?, aksiKanan: (@Composable () -> Unit)? = null, isi: @Composable ColumnScope.() -> Unit) {
    val warna = LocalMkColors.current
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(judul, style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
                if (subjudul != null) Text(subjudul, style = MkTypography.footnote, color = warna.ink2, modifier = Modifier.padding(top = 2.dp))
            }
            aksiKanan?.invoke()
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) { isi() }
    }
}

private fun inisial(nama: String): String =
    nama.split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }

@Composable
private fun KartuLaporanMingguan(d: RingkasanGrupDto, s: SusunanDirektur, ui: RingkasanDirekturUi, aksi: AksiDirektur, labelMinggu: String) {
    val warna = LocalMkColors.current
    val belum = s.belumMasuk.size
    Kartu(
        judul = "Laporan mingguan divisi · $labelMinggu",
        subjudul = when {
            s.divisi.isEmpty() -> "Belum ada divisi aktif"
            belum > 0 -> "${s.divisi.size - belum} dari ${s.divisi.size} masuk · $belum belum masuk"
            else -> "Semua ${s.divisi.size} laporan sudah masuk"
        },
    ) {
        if (s.divisi.isEmpty()) {
            EmptyNote(teks = "Belum ada divisi aktif di cakupan Anda.")
            return@Kartu
        }
        s.divisi.forEachIndexed { i, dv ->
            if (i > 0) MkDivider()
            val st = ui.keadaan(dv)
            val lencana = lencanaMingguanDivisi(st)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                MkAvatar(inisial = inisial(dv.head?.name ?: dv.name), ukuran = 36.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Divisi ${s.label(dv)}", style = MkTypography.bodyStrong, color = warna.ink)
                    StatusBadge(status = lencana.status.keMk(), size = MkBadgeSize.SM, text = lencana.label)
                    Text(
                        barisLaporanDivisi(dv, st, labelMinggu),
                        style = MkTypography.footnote,
                        color = warna.ink2,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (st == KeadaanMingguan.BELUM) {
                    if (d.viewer.canRemind) {
                        val sudah = dv.id in ui.diingatkan
                        MkButton(
                            label = if (sudah) "Pengingat terkirim" else "Ingatkan",
                            size = MkButtonSize.S,
                            enabled = !sudah && dv.id !in ui.sibuk,
                            onClick = { aksi.ingatkan(dv.id) },
                        )
                    }
                } else {
                    MkButton(label = "Baca laporan", size = MkButtonSize.S, onClick = { aksi.bukaLaporanDivisi(dv.id) })
                }
            }
        }
        Text("Alur laporan minggu ini", style = MkTypography.callout, color = warna.ink2, modifier = Modifier.padding(top = MkSpacing.space2))
        alurMingguan(s.divisi, ui::keadaan).forEach { l ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                StatusBadge(status = l.status.keMk(), size = MkBadgeSize.SM)
                Text(l.judul, style = MkTypography.bodyStrong, color = warna.ink)
                Text(l.sub, style = MkTypography.footnote, color = warna.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KartuOutputAktif(d: RingkasanGrupDto, s: SusunanDirektur, ui: RingkasanDirekturUi, aksi: AksiDirektur) {
    Kartu(judul = "Output yang sedang dikerjakan", subjudul = "Per divisi · ketuk divisi untuk menyaring") {
        val ada = d.divisions.any { it.outputs.active + it.outputs.review > 0 }
        if (!ada) {
            EmptyNote(teks = "Belum ada output aktif. Output muncul setelah PIC menambahkannya.")
            return@Kartu
        }
        GrafikDonat(
            segmen = d.divisions.mapIndexed { i, dv -> SegmenDonat(s.label(dv), dv.outputs.active + dv.outputs.review, nadaDivisi(i)) },
            judulAksesibel = "Output aktif per divisi",
            subTengah = "output aktif",
        )
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            urutanChipDivisi(d.divisions).forEach { dv ->
                MkChip(
                    label = s.label(dv),
                    count = dv.outputs.active + dv.outputs.review,
                    selected = ui.divisiId == dv.id,
                    onClick = { aksi.pilihDivisi(if (ui.divisiId == dv.id) null else dv.id) },
                )
            }
        }
    }
}

@Composable
private fun KartuMilestone(s: SusunanDirektur, aksi: AksiDirektur) {
    val warna = LocalMkColors.current
    Kartu(judul = "Milestone 14 hari", subjudul = "Tenggat proyek terdekat") {
        if (s.milestone.isEmpty()) {
            EmptyNote(teks = "Tidak ada tenggat dalam 14 hari.", done = true)
            return@Kartu
        }
        s.milestone.forEachIndexed { i, p ->
            if (i > 0) MkDivider()
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(FormatWib.tanggal(p.targetEndDate), style = MkTypography.footnote.tabular, color = warna.ink2)
                Column(Modifier.weight(1f)) {
                    Text(p.name, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(namaPic(p), style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                MkButton(label = "Buka", size = MkButtonSize.S, variant = MkButtonVariant.PLAIN, onClick = { aksi.bukaProyek(p.id) })
                StatusBadge(status = statusProyek(p.status).keMk(), size = MkBadgeSize.SM)
            }
        }
    }
}

@Composable
private fun KartuProyek(d: RingkasanGrupDto, s: SusunanDirektur, ui: RingkasanDirekturUi, aksi: AksiDirektur) {
    val tersaring = ui.saringStatus?.let { st -> s.proyek.filter { statusProyek(it.status) == st } } ?: s.proyek
    Kartu(
        judul = "Proyek di bawah Anda",
        subjudul = "${FormatWib.angka(tersaring.size)} dari ${FormatWib.angka(s.total)} proyek",
        aksiKanan = if (aksi.bolehTab(TabId.PROYEK)) {
            { MkButton(label = "Lihat semua", size = MkButtonSize.S, onClick = { aksi.bukaTab(TabId.PROYEK) }) }
        } else {
            null
        },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            SARING_STATUS.forEach { (st, label) ->
                MkChip(
                    label = label,
                    selected = ui.saringStatus == st,
                    status = st?.keMk(),
                    count = st?.let { s.hitung[it] ?: 0 } ?: s.total,
                    onClick = { aksi.pilihStatus(st) },
                )
            }
        }
        if (tersaring.isEmpty()) {
            EmptyNote(teks = "Tidak ada proyek dengan status ini.")
            return@Kartu
        }
        tersaring.take(10).forEach { p ->
            // E2E-2 BUG-08: ProjectRow (tata letak layar lebar) menggencet nama di ponsel.
            BarisProyekRingkas(
                nama = p.name,
                sub = listOf(p.divisionName?.ifBlank { null } ?: p.entityName, labelPic(p)).joinToString(" · "),
                progres = p.progress,
                status = statusProyek(p.status).keMk(),
                dipilih = ui.sheetProyek == p.id,
                onClick = { aksi.bukaProyek(p.id) },
            )
        }
        if (d.projects.isEmpty()) EmptyNote(teks = "Belum ada proyek aktif.")
    }
}

@Composable
private fun KartuKeputusan(s: SusunanDirektur, aksi: AksiDirektur) {
    val warna = LocalMkColors.current
    val bukaKeputusan: () -> Unit = {
        if (aksi.bolehTab(TabId.PERSETUJUAN)) aksi.bukaTab(TabId.PERSETUJUAN)
    }
    Kartu(
        judul = "Eskalasi dari kepala divisi",
        subjudul = if (s.menunggu > 0) "${s.menunggu} menunggu keputusan Anda" else "Keputusan yang dinaikkan ke Anda",
        aksiKanan = if (s.eskalasi.isNotEmpty() && aksi.bolehTab(TabId.ESKALASI)) {
            { MkButton(label = "Buka eskalasi", size = MkButtonSize.S, onClick = { aksi.bukaTab(TabId.ESKALASI) }) }
        } else {
            null
        },
    ) {
        if (s.menunggu == 0) {
            EmptyNote(
                teks = if (s.satu != null) "Tidak ada eskalasi untuk divisi ini." else "Tidak ada eskalasi yang menunggu.",
                done = true,
            )
            return@Kartu
        }
        (s.persetujuan + s.tenggat).forEach { b ->
            BarisPerhatian(
                judul = b.judul,
                alasan = b.keterangan,
                status = MkStatus.RISK,
                meta = if (b.jenis == "tenggat") "Usulan tenggat" else "Persetujuan",
                onClick = bukaKeputusan,
            )
        }
        s.eskalasi.take(5).forEach { e ->
            BarisPerhatian(
                judul = e.summary,
                alasan = "${e.raisedBy ?: e.entityName} · butuh ${labelDibutuhkan(e.needed).lowercase()}",
                status = if (e.overdue) MkStatus.LATE else MkStatus.RISK,
                meta = if (e.overdue) "lewat SLA, ${e.ageDays} hari" else "${e.ageDays} hari",
                onClick = { if (aksi.bolehTab(TabId.ESKALASI)) aksi.bukaTab(TabId.ESKALASI) },
            )
        }
        if (s.persetujuan.isNotEmpty() || s.tenggat.isNotEmpty()) {
            Text(
                "Setujui atau tolak permintaan di tab Persetujuan.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
    }
}

@Composable
private fun BarisPerhatian(judul: String, alasan: String, status: MkStatus, meta: String, onClick: () -> Unit) {
    val warna = LocalMkColors.current
    MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space3, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            Column(Modifier.weight(1f)) {
                Text(judul, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (alasan.isNotBlank()) Text(alasan, style = MkTypography.footnote, color = warna.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End) {
                StatusBadge(status = status, size = MkBadgeSize.SM)
                Text(meta, style = MkTypography.caption, color = warna.ink2)
            }
        }
    }
}

@Composable
private fun KartuTrenOutput(s: SusunanDirektur, ui: RingkasanDirekturUi, aksi: AksiDirektur) {
    val warna = LocalMkColors.current
    Kartu(judul = "Tren output", subjudul = "Output diterima per minggu · 8 minggu terakhir") {
        if (s.trenOutput.isEmpty() || s.trenOutput.all { it == 0 }) {
            EmptyNote(teks = "Belum ada output yang diterima dalam 8 minggu terakhir.")
            return@Kartu
        }
        val idx = (ui.titikTren ?: s.trenOutput.lastIndex).coerceIn(0, s.trenOutput.lastIndex)
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.fillMaxWidth()) {
            Text(FormatWib.angka(s.trenOutput[idx]), style = MkTypography.title2.tabular, color = warna.ink)
            Text("output · ${s.labelMinggu.getOrElse(idx) { "" }}", style = MkTypography.footnote, color = warna.ink2)
        }
        GrafikTren(
            label = s.labelMinggu,
            nilai = s.trenOutput.map { it.toDouble() },
            judulAksesibel = "Output diterima per minggu",
            teksNilai = { FormatWib.angka(it) },
            terpilih = idx,
            onPilih = aksi.pilihTitikTren,
        )
    }
}

@Composable
private fun KartuTepatWaktu(s: SusunanDirektur) {
    Kartu(judul = "Tepat waktu per divisi", subjudul = "Target $TARGET_TEPAT_WAKTU%") {
        if (s.divisi.all { it.onTime == null }) {
            EmptyNote(teks = "Belum ada output bertenggat yang selesai.")
            return@Kartu
        }
        s.divisi.forEachIndexed { i, dv ->
            val ot = dv.onTime
            MkDivisionBar(
                nama = s.label(dv),
                nilai = ot?.pct ?: 0,
                nada = nadaDivisi(i),
                nadaAwal = nadaDivisiCerah(i),
                target = TARGET_TEPAT_WAKTU,
                meta = when {
                    ot == null -> "Belum ada data"
                    ot.basis == "output" -> "${FormatWib.angka(ot.ok)} dari ${FormatWib.angka(ot.total)} output tepat waktu"
                    else -> "${FormatWib.angka(ot.ok)} dari ${FormatWib.angka(ot.total)} proyek lapor hari ini"
                },
            )
        }
    }
}

// ------------------------------------------------------------------
// Sheet
// ------------------------------------------------------------------

@Composable
private fun SheetLaporanDivisi(d: RingkasanGrupDto, ui: RingkasanDirekturUi, aksi: AksiDirektur) {
    val warna = LocalMkColors.current
    val uri = LocalUriHandler.current
    val dv: DivisiGrupDto? = d.divisions.firstOrNull { it.id == ui.sheetDivisi }
    val st = dv?.let { ui.keadaan(it) } ?: KeadaanMingguan.BELUM
    val belum = st == KeadaanMingguan.BELUM
    val labelMinggu = labelMingguLaporan(d)
    val namaDivisi = dv?.let { labelDivisiUnik(d.divisions)[it.id] ?: it.name }
    MkSheet(
        visible = dv != null,
        onTutup = aksi.tutupLaporanDivisi,
        judul = namaDivisi?.let { "Divisi $it" } ?: "",
        subjudul = dv?.let { "${it.head?.name ?: "Kepala divisi belum ditetapkan"} · ${it.entityName}" },
        backLabel = "Ringkasan",
        footer = {
            if (dv == null) {
                // Sheet tertutup: tanpa tombol.
            } else if (belum) {
                if (d.viewer.canRemind) {
                    val sudah = dv.id in ui.diingatkan
                    MkButton(
                        label = if (sudah) "Pengingat terkirim" else "Ingatkan kepala divisi",
                        variant = MkButtonVariant.PRIMARY,
                        enabled = !sudah && dv.id !in ui.sibuk,
                        onClick = { aksi.ingatkan(dv.id) },
                    )
                }
            } else if (d.viewer.canMarkRead && st != KeadaanMingguan.DIBACA) {
                MkButton(
                    label = "Tandai sudah dibaca",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = dv.id !in ui.sibuk,
                    onClick = { aksi.tandaiDibaca(dv.id) },
                )
            }
        },
    ) {
        if (dv == null) return@MkSheet
        val lencana = lencanaMingguanDivisi(st)
        StatusBadge(status = lencana.status.keMk(), text = lencana.label)
        if (belum) {
            Text(
                "Laporan mingguan $labelMinggu Divisi $namaDivisi belum dikirim." +
                    (d.reportWeek?.handoverBy?.let { " Tenggat serahnya ${FormatWib.tanggal(it)} pukul ${FormatWib.jam(it)}." } ?: ""),
                style = MkTypography.body,
                color = warna.ink,
            )
            Text(
                when {
                    dv.id in ui.diingatkan -> "Pengingat terkirim ke ${dv.head?.name ?: "kepala divisi"}."
                    d.viewer.canRemind -> "Belum ada pengingat dari Anda hari ini."
                    else -> "Admin PT atau direktur PT yang mengirim pengingat ke kepala divisi."
                },
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            val kepala = dv.head
            if (kepala != null) {
                kepala.phone?.takeIf { it.isNotBlank() }?.let { tel ->
                    MkButton(
                        label = "Telepon ${kepala.name} · $tel",
                        variant = MkButtonVariant.SECONDARY,
                        onClick = { runCatching { uri.openUri("tel:" + tel.filter { it.isDigit() || it == '+' }) } },
                    )
                }
                kepala.email?.takeIf { it.isNotBlank() }?.let { email ->
                    MkButton(
                        label = "Email ${kepala.name}",
                        variant = MkButtonVariant.SECONDARY,
                        onClick = { runCatching { uri.openUri("mailto:$email") } },
                    )
                }
                if (kepala.phone.isNullOrBlank() && kepala.email.isNullOrBlank()) {
                    Text("Kontak ${kepala.name} belum diisi di data akun.", style = MkTypography.footnote, color = warna.ink2)
                }
            }
            return@MkSheet
        }
        val ringkas = dv.weekly.headSummary
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            // E2E-2 BUG-14c: "3 dari 5" terpotong di ubin sepertiga lebar — penyebut ke baris delta.
            StatTile(
                modifier = Modifier.weight(1f),
                label = "Output",
                value = FormatWib.angka(dv.outputs.done),
                delta = "dari ${FormatWib.angka(dv.outputs.total)}",
            )
            StatTile(modifier = Modifier.weight(1f), label = "Tepat waktu", value = dv.onTime?.let { "${it.pct}%" } ?: "—")
            StatTile(
                modifier = Modifier.weight(1f),
                label = "Kendala",
                value = ringkas?.openObstacles ?: dv.weekly.obstacles.size,
            )
        }
        // E2E-2 BUG-14b: segmen pengirim/waktu disembunyikan bila kosong (dulu "Dikirim - ·").
        val dikirim = listOfNotNull(
            dv.weekly.submittedBy?.takeIf { it.isNotBlank() }?.let { "oleh $it" },
            waktuKirimRelatif(dv.weekly.submittedAt)?.lowercase(),
        )
        Text(
            (if (dikirim.isNotEmpty()) "Dikirim ${dikirim.joinToString(" ")} · " else "") +
                "${dv.weekly.itemsDone} dari ${dv.weekly.itemsTotal} pekerjaan selesai (${persen(dv.weekly.itemsDone, dv.weekly.itemsTotal)}%)",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        Text("Poin utama", style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        if (ringkas != null) {
            Text(
                "Ringkasan dari kepala divisi" + (ringkas.sentAt?.let { " · ${FormatWib.relatif(it).lowercase()}" } ?: ""),
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
        val poin = ringkas?.points?.takeIf { it.isNotEmpty() } ?: dv.weekly.points
        if (poin.isEmpty()) {
            Text("Laporan ini belum memuat capaian tertulis.", style = MkTypography.body, color = warna.ink2)
        } else {
            poin.forEach { Text("• $it", style = MkTypography.body, color = warna.ink) }
        }
        if (dv.weekly.obstacles.isNotEmpty()) {
            MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
                Text("Kendala", style = MkTypography.bodyStrong, color = warnaStatus(MkStatus.RISK))
                dv.weekly.obstacles.forEach { Text("• $it", style = MkTypography.footnote, color = warna.ink) }
            }
        }
        if (aksi.bolehTab(TabId.PEMBAGIAN_DIVISI)) {
            MkButton(
                label = "Buka laporan lengkap",
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
                onClick = {
                    aksi.tutupLaporanDivisi()
                    aksi.bukaTab(TabId.PEMBAGIAN_DIVISI)
                },
            )
        }
    }
}

@Composable
private fun SheetProyekDirektur(d: RingkasanGrupDto, ui: RingkasanDirekturUi, aksi: AksiDirektur) {
    val p = d.projects.firstOrNull { it.id == ui.sheetProyek }
    MkSheet(
        visible = p != null,
        onTutup = aksi.tutupProyek,
        judul = p?.name ?: "",
        subjudul = p?.let {
            listOfNotNull(it.code.ifBlank { null }, labelPic(it), it.divisionName ?: it.entityName).joinToString(" · ")
        },
        backLabel = "Ringkasan",
    ) {
        if (p == null) return@MkSheet
        val st = statusProyek(p.status)
        Text(
            "${labelStatusProyek(st)} · tenggat ${FormatWib.tanggal(p.targetEndDate)}",
            style = MkTypography.footnote,
            color = LocalMkColors.current.ink2,
        )
        IsiProyek(p, ui.laporanProyek, aksi.ulangLaporanProyek)
    }
}

@Composable
private fun Kerangka() {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3), modifier = Modifier.fillMaxWidth()) {
        MkSkeleton(tinggi = 14.dp, lebar = 160.dp)
        MkSkeleton(tinggi = 34.dp, lebar = 180.dp)
        MkSkeleton(tinggi = 180.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            repeat(2) { MkSkeleton(tinggi = 88.dp, modifier = Modifier.weight(1f)) }
        }
        repeat(3) { MkSkeleton(tinggi = 120.dp) }
    }
}
