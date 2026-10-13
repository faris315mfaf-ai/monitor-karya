// Grafik Canvas Compose (Rancangan Android §2 "Grafik Fase 3"; docs/design/11):
// BarChart, DonutChart, AreaChart (tren) dan Heatmap. Aturan yang dijaga:
// angka selalu tertulis (di atas batang/titik, di legenda donat, di sel peta),
// satu sorotan aksen (lainnya token --chart-idle, >=3:1 di surface), sumbu
// tenang (garis bantu putus-putus --chart-grid), dan seluruh isi terbaca
// pembaca layar lewat contentDescription.
//
// Tata letak teks (C4 P2-3): tepi atas/bawah bidang diturunkan dari tinggi teks
// TERUKUR (mengikuti fontScale), bukan konstanta dp; teks tidak dipotong "…" —
// bila slot lebih sempit dari teks, label/angka ditulis selang-seling
// (SkalaGrafik.langkahLabel/indeksTampil), yang terpilih dan yang terakhir selalu.
package id.co.monitorkarya.feature.ringkasangrup.grafik

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.core.domain.status.PitaKepatuhan
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.ringkasangrup.logika.FormatWib
import id.co.monitorkarya.feature.ringkasangrup.logika.SelPeta
import id.co.monitorkarya.feature.ringkasangrup.logika.StatusRingkas
import id.co.monitorkarya.feature.ringkasangrup.logika.pitaKepatuhan
import id.co.monitorkarya.feature.ringkasangrup.logika.statusRingkas

/** StatusRingkas (logika murni) → MkStatus design system. */
fun StatusRingkas.keMk(): MkStatus = when (this) {
    StatusRingkas.ON -> MkStatus.ON
    StatusRingkas.RISK -> MkStatus.RISK
    StatusRingkas.LATE -> MkStatus.LATE
    StatusRingkas.DONE -> MkStatus.DONE
    StatusRingkas.NEUTRAL -> MkStatus.NEUTRAL
    StatusRingkas.INFO -> MkStatus.INFO
}

/** Jarak teks ke batang/sumbu. */
private val JARAK_TEKS = 4.dp

private fun DrawScope.garisBantu(warna: Color, yAtas: Float, yBawah: Float) {
    val putus = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))
    listOf(yAtas, (yAtas + yBawah) / 2f, yBawah).forEach { y ->
        drawLine(warna, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f, pathEffect = putus)
    }
}

/** Ukur satu baris teks utuh (tanpa elipsis — angka tidak boleh terpotong). */
private fun TextMeasurer.ukurBaris(teks: String, gaya: TextStyle): TextLayoutResult =
    measure(text = teks, style = gaya, maxLines = 1, softWrap = false)

/** Gambar teks terukur berpusat di [cx], dijepit di dalam lebar kanvas. */
private fun DrawScope.gambarTengah(hasil: TextLayoutResult, cx: Float, yAtas: Float) {
    val x = (cx - hasil.size.width / 2f).coerceIn(0f, (size.width - hasil.size.width).coerceAtLeast(0f))
    drawText(hasil, topLeft = Offset(x, yAtas))
}

/** Satu batang: label sumbu, nilai numerik, dan teks nilai yang ditulis di atasnya. */
data class DataBatang(val label: String, val nilai: Double, val teksNilai: String)

/**
 * BarChart Canvas. Batang [terpilih] memakai aksen penuh (satu sorotan),
 * lainnya --chart-idle. Sentuh batang → [onPilih]. Nilai tertulis di atas tiap batang.
 */
@Composable
fun GrafikBatang(
    data: List<DataBatang>,
    judulAksesibel: String,
    modifier: Modifier = Modifier,
    terpilih: Int = data.lastIndex,
    onPilih: ((Int) -> Unit)? = null,
    tinggi: Dp = 180.dp,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val pengukur = rememberTextMeasurer()
    val gayaNilai = MkTypography.caption.tabular.copy(color = warna.ink2)
    val gayaNilaiPilih = gayaNilai.copy(color = warna.ink, fontWeight = FontWeight.SemiBold)
    val gayaLabel = MkTypography.caption.copy(color = warna.ink2)
    val batas = SkalaGrafik.batasRapi(data.maxOfOrNull { it.nilai } ?: 0.0)
    val deskripsi = "$judulAksesibel. " + data.joinToString("; ") { "${it.label}: ${it.teksNilai}" }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(tinggi)
            .semantics { contentDescription = deskripsi }
            .then(
                if (onPilih != null && data.isNotEmpty()) {
                    Modifier.pointerInput(data.size) {
                        detectTapGestures { pos ->
                            val i = SkalaGrafik.indeksDariX(pos.x, size.width.toFloat(), data.size)
                            if (i >= 0) onPilih(i)
                        }
                    }
                } else {
                    Modifier
                },
            ),
    ) {
        if (data.isEmpty()) return@Canvas
        val jarak = JARAK_TEKS.toPx()
        val ukurNilai = data.mapIndexed { i, d ->
            pengukur.ukurBaris(d.teksNilai, if (i == terpilih) gayaNilaiPilih else gayaNilai)
        }
        val ukurLabel = data.map { pengukur.ukurBaris(it.label, gayaLabel) }
        val atas = ukurNilai.maxOf { it.size.height } + jarak
        val bawah = size.height - ukurLabel.maxOf { it.size.height } - jarak
        val bidang = (bawah - atas).coerceAtLeast(1f)
        garisBantu(warna.chartGrid, atas, bawah)
        val slot = size.width / data.size
        val lebarBatang = (slot * 0.56f).coerceAtMost(48.dp.toPx())
        val celah = jarak * 2
        val tampilNilai = SkalaGrafik.indeksTampil(
            data.size,
            SkalaGrafik.langkahLabel(ukurNilai.maxOf { it.size.width }.toFloat(), slot, celah),
            terpilih,
        )
        val tampilLabel = SkalaGrafik.indeksTampil(
            data.size,
            SkalaGrafik.langkahLabel(ukurLabel.maxOf { it.size.width }.toFloat(), slot, celah),
            terpilih,
        )
        data.forEachIndexed { i, d ->
            val cx = slot * i + slot / 2f
            val h = bidang * SkalaGrafik.porsi(d.nilai, batas)
            val pilih = i == terpilih
            val isi = if (pilih) aksen.fill else warna.chartIdle
            if (h > 0f) {
                drawRoundRect(
                    color = isi,
                    topLeft = Offset(cx - lebarBatang / 2f, bawah - h),
                    size = Size(lebarBatang, h),
                    cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx()),
                )
            }
            if (i in tampilNilai) {
                val nilai = ukurNilai[i]
                gambarTengah(nilai, cx, (bawah - h - jarak - nilai.size.height).coerceAtLeast(0f))
            }
            if (i in tampilLabel) gambarTengah(ukurLabel[i], cx, bawah + jarak)
        }
    }
}

/** Satu potong donat beserta warnanya. */
data class SegmenDonat(val label: String, val nilai: Int, val warna: Color)

/**
 * DonutChart Canvas + legenda teks. Angka total tertulis di tengah; tiap
 * segmen tertulis "n · p%" di legenda (warna hanya membantu).
 */
@Composable
fun GrafikDonat(
    segmen: List<SegmenDonat>,
    judulAksesibel: String,
    subTengah: String,
    modifier: Modifier = Modifier,
    ukuran: Dp = 150.dp,
) {
    val warna = LocalMkColors.current
    val pengukur = rememberTextMeasurer()
    val total = segmen.sumOf { it.nilai }
    val busur = SkalaGrafik.busurDonat(segmen.map { it.nilai.toDouble() }, celah = 2f)
    val gayaTotal = MkTypography.title2.tabular.copy(color = warna.ink)
    val gayaSub = MkTypography.caption.copy(color = warna.ink2)
    val deskripsi = "$judulAksesibel. Total ${FormatWib.angka(total)} $subTengah. " +
        segmen.joinToString("; ") {
            "${it.label}: ${FormatWib.angka(it.nilai)}, ${SkalaGrafik.persenBagian(it.nilai, total)} persen"
        }

    Row(
        modifier = modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = deskripsi },
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space5),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(modifier = Modifier.size(ukuran)) {
            val tebal = size.minDimension * 0.14f
            val sisi = size.minDimension - tebal
            val kiriAtas = Offset((size.width - sisi) / 2f, (size.height - sisi) / 2f)
            drawArc(
                color = warna.fill1,
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = kiriAtas,
                size = Size(sisi, sisi),
                style = Stroke(width = tebal),
            )
            busur.forEachIndexed { i, b ->
                if (b.sapuan > 0f) {
                    drawArc(
                        color = segmen[i].warna,
                        startAngle = b.mulai,
                        sweepAngle = b.sapuan,
                        useCenter = false,
                        topLeft = kiriAtas,
                        size = Size(sisi, sisi),
                        style = Stroke(width = tebal, cap = StrokeCap.Butt),
                    )
                }
            }
            val ukurTotal = pengukur.measure(FormatWib.angka(total), gayaTotal)
            val ukurSub = pengukur.measure(subTengah, gayaSub)
            val tinggiBlok = ukurTotal.size.height + ukurSub.size.height
            val y0 = size.height / 2f - tinggiBlok / 2f
            drawText(ukurTotal, topLeft = Offset(size.width / 2f - ukurTotal.size.width / 2f, y0))
            drawText(
                ukurSub,
                topLeft = Offset(size.width / 2f - ukurSub.size.width / 2f, y0 + ukurTotal.size.height),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            segmen.forEach { s ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(s.warna))
                    Text(
                        text = s.label,
                        style = MkTypography.footnote,
                        color = warna.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = MkSpacing.space2).weight(1f),
                    )
                    Text(
                        text = "${FormatWib.angka(s.nilai)} · ${SkalaGrafik.persenBagian(s.nilai, total)}%",
                        style = MkTypography.footnote.tabular,
                        color = warna.ink2,
                    )
                }
            }
        }
    }
}

/**
 * AreaChart Canvas (tren): garis aksen + isian lembut, titik [terpilih]
 * disorot, pembanding putus-putus opsional (maks 2 seri). Nilai tertulis
 * di atas tiap titik; sentuh → [onPilih].
 */
@Composable
fun GrafikTren(
    label: List<String>,
    nilai: List<Double>,
    judulAksesibel: String,
    teksNilai: (Double) -> String,
    modifier: Modifier = Modifier,
    pembanding: List<Double>? = null,
    labelPembanding: String? = null,
    terpilih: Int = nilai.lastIndex,
    onPilih: ((Int) -> Unit)? = null,
    tinggi: Dp = 160.dp,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val pengukur = rememberTextMeasurer()
    val gayaNilai = MkTypography.caption.tabular.copy(color = warna.ink2)
    val gayaNilaiPilih = gayaNilai.copy(color = warna.ink, fontWeight = FontWeight.SemiBold)
    val gayaLabel = MkTypography.caption.copy(color = warna.ink2)
    val maks = (nilai + (pembanding ?: emptyList())).maxOrNull() ?: 0.0
    val batas = SkalaGrafik.batasRapi(maks)
    val deskripsi = buildString {
        append(judulAksesibel).append(". ")
        append(label.zip(nilai).joinToString("; ") { (l, v) -> "$l: ${teksNilai(v)}" })
        if (pembanding != null && labelPembanding != null) {
            append(". Pembanding $labelPembanding: ")
            append(label.zip(pembanding).joinToString("; ") { (l, v) -> "$l: ${teksNilai(v)}" })
        }
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(tinggi)
                .semantics { contentDescription = deskripsi }
                .then(
                    if (onPilih != null && nilai.isNotEmpty()) {
                        Modifier.pointerInput(nilai.size) {
                            detectTapGestures { pos ->
                                val i = SkalaGrafik.indeksDariX(pos.x, size.width.toFloat(), nilai.size)
                                if (i >= 0) onPilih(i)
                            }
                        }
                    } else {
                        Modifier
                    },
                ),
        ) {
            if (nilai.isEmpty()) return@Canvas
            val jarak = JARAK_TEKS.toPx()
            val ukurNilai = nilai.mapIndexed { i, v ->
                pengukur.ukurBaris(teksNilai(v), if (i == terpilih) gayaNilaiPilih else gayaNilai)
            }
            val ukurLabel = nilai.indices.map { pengukur.ukurBaris(label.getOrElse(it) { "" }, gayaLabel) }
            // Ruang di atas titik: teks nilai + lingkar sorotan (9dp) + jarak.
            val ruangTitik = 9.dp.toPx() + jarak
            val atas = ukurNilai.maxOf { it.size.height } + ruangTitik
            val bawah = size.height - ukurLabel.maxOf { it.size.height } - ruangTitik
            val slot = size.width / nilai.size
            val tepiX = slot / 2f
            garisBantu(warna.chartGrid, atas, bawah)
            val titik = SkalaGrafik.titikTren(nilai, size.width, bawah, batas, tepiX = tepiX, tepiAtas = atas)
            val celah = jarak * 2
            val tampilNilai = SkalaGrafik.indeksTampil(
                nilai.size,
                SkalaGrafik.langkahLabel(ukurNilai.maxOf { it.size.width }.toFloat(), slot, celah),
                terpilih,
            )
            val tampilLabel = SkalaGrafik.indeksTampil(
                nilai.size,
                SkalaGrafik.langkahLabel(ukurLabel.maxOf { it.size.width }.toFloat(), slot, celah),
                terpilih,
            )

            if (pembanding != null && pembanding.size == nilai.size) {
                val tp = SkalaGrafik.titikTren(pembanding, size.width, bawah, batas, tepiX = tepiX, tepiAtas = atas)
                val jalur = Path().apply {
                    tp.forEachIndexed { i, t -> if (i == 0) moveTo(t.x, t.y) else lineTo(t.x, t.y) }
                }
                drawPath(
                    jalur,
                    color = warna.ink3,
                    style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))),
                )
            }

            val garis = Path().apply {
                titik.forEachIndexed { i, t -> if (i == 0) moveTo(t.x, t.y) else lineTo(t.x, t.y) }
            }
            val area = Path().apply {
                addPath(garis)
                lineTo(titik.last().x, bawah)
                lineTo(titik.first().x, bawah)
                close()
            }
            drawPath(area, color = aksen.fill.copy(alpha = 0.14f))
            drawPath(garis, color = aksen.fill, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))

            titik.forEachIndexed { i, t ->
                val pilih = i == terpilih
                if (pilih) {
                    drawCircle(color = aksen.fill.copy(alpha = 0.25f), radius = 9.dp.toPx(), center = Offset(t.x, t.y))
                }
                drawCircle(color = aksen.fill, radius = if (pilih) 5.dp.toPx() else 3.dp.toPx(), center = Offset(t.x, t.y))
                if (i in tampilNilai) {
                    val u = ukurNilai[i]
                    gambarTengah(u, t.x, (t.y - ruangTitik - u.size.height).coerceAtLeast(0f))
                }
                if (i in tampilLabel) gambarTengah(ukurLabel[i], t.x, bawah + ruangTitik)
            }
        }
        // Legenda pembanding visual (C4 P3-4) — dulu hanya disebut di contentDescription.
        if (pembanding != null && labelPembanding != null && pembanding.size == nilai.size && nilai.isNotEmpty()) {
            LegendaPembanding(labelPembanding)
        }
    }
}

/** Baris legenda "– – {label} (pembanding)" di bawah grafik tren; sudah dibacakan lewat deskripsi grafik. */
@Composable
private fun LegendaPembanding(label: String) {
    val warna = LocalMkColors.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        modifier = Modifier.clearAndSetSemantics {},
    ) {
        Canvas(modifier = Modifier.size(width = 20.dp, height = 8.dp)) {
            drawLine(
                color = warna.ink3,
                start = Offset(0f, size.height / 2f),
                end = Offset(size.width, size.height / 2f),
                strokeWidth = 1.5.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)),
            )
        }
        Text(text = "$label (pembanding)", style = MkTypography.caption, color = warna.ink2)
    }
}

/**
 * Heatmap kepatuhan: satu sel per PT, skor tertulis, warna latar lembut dari
 * pita skor tunggal (KEPUTUSAN-AMBANG-KEPATUHAN.md): ≥90 Baik, 75–89 Perlu
 * perhatian, <75 Kritis; tanpa skor = netral.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PetaPanas(
    sel: List<SelPeta>,
    modifier: Modifier = Modifier,
    lebarSel: Dp = 76.dp,
) {
    val warna = LocalMkColors.current
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        sel.forEach { s ->
            val pita = pitaKepatuhan(s.skor)
            val status = pita.status.keMk()
            val teksSkor = s.skor?.let { FormatWib.desimal(it) } ?: "—"
            Column(
                modifier = Modifier
                    .widthIn(min = lebarSel)
                    .clip(MkShapes.sm)
                    .background(latarSel(status))
                    .padding(horizontal = MkSpacing.space2, vertical = 6.dp)
                    .semantics(mergeDescendants = true) {
                        contentDescription = "${s.nama}: skor $teksSkor, ${pita.label}"
                    },
            ) {
                Text(
                    text = s.kode.ifBlank { s.nama },
                    style = MkTypography.caption,
                    color = warna.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = teksSkor, style = MkTypography.bodyStrong.tabular, color = warnaStatus(status))
            }
        }
    }
}

/** Legenda ambang skor kepatuhan (urutan tetap): Baik ≥ 90 · Perlu perhatian 75–89 · Kritis < 75. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LegendaPetaPanas(modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    val butir = PitaKepatuhan.LEGENDA.map { p -> p.statusRingkas().keMk() to "${p.label} ${p.rentang}" }
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        butir.forEach { (s, l) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(MkShapes.xs).background(warnaStatus(s)))
                Text(
                    text = l,
                    style = MkTypography.caption,
                    color = warna.ink2,
                    modifier = Modifier.padding(start = MkSpacing.space1),
                )
            }
        }
    }
}

@Composable
private fun latarSel(s: MkStatus): Color {
    val warna = LocalMkColors.current
    return when (s) {
        MkStatus.ON, MkStatus.DONE -> warna.statusOnSoft
        MkStatus.RISK -> warna.statusRiskSoft
        MkStatus.LATE -> warna.statusLateSoft
        MkStatus.INFO -> warna.statusInfoSoft
        MkStatus.NEUTRAL -> warna.fill1
    }
}
