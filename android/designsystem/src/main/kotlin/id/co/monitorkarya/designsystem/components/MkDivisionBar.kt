package id.co.monitorkarya.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/* ---------- Nada seri data divisi ---------- */

/** Seri data 1–6 tema terang — port `--data-1..6` dari tokens.css. */
private val DataTerang = listOf(
    Color(0xFF0A66D6), // --data-1 (Divisi Teknologi)
    Color(0xFF1A7340), // --data-2 (Divisi Keuangan)
    Color(0xFFC2255C), // --data-3 (Divisi Media)
    Color(0xFF6E3FD8), // --data-4 (Divisi SDM)
    Color(0xFFB84A00), // --data-5 (Divisi Operasional)
    Color(0xFF0B7A7A), // --data-6 (Divisi Hukum)
)

/** Seri data 1–6 tema malam — blok `[data-theme="dark"]` tokens.css. */
private val DataGelap = listOf(
    Color(0xFF4DA3FF), // --data-1 (malam)
    Color(0xFF3DD47A), // --data-2 (malam)
    Color(0xFFFF6B9A), // --data-3 (malam)
    Color(0xFFB79BFF), // --data-4 (malam)
    Color(0xFFFF9F43), // --data-5 (malam)
    Color(0xFF3CC9C9), // --data-6 (malam)
)

/**
 * Titik awal gradien tiap seri — padanan pasangan `--*-cerah` di web
 * (data-1→biru-cerah, data-2→hijau-cerah, data-4→ungu-cerah, data-5→oranye-cerah);
 * data-3 dan data-6 tidak punya pasangan cerah → gradien datar (kedua ujung sama).
 */
private val CerahTerang = listOf(
    Color(0xFF40C8FF), // --biru-cerah
    Color(0xFF34C759), // --hijau-cerah
    DataTerang[2], // datar
    Color(0xFFC969F5), // --ungu-cerah
    Color(0xFFFF9F0A), // --oranye-cerah
    DataTerang[5], // datar
)

/** Padanan [CerahTerang] untuk tema malam. */
private val CerahGelap = listOf(
    Color(0xFF64D2FF), // --biru-cerah (malam)
    Color(0xFF30D158), // --hijau-cerah (malam)
    DataGelap[2], // datar
    Color(0xFFBF5AF2), // --ungu-cerah (malam)
    Color(0xFFFFB340), // --oranye-cerah (malam)
    DataGelap[5], // datar
)

/** Titik awal gradien keadaan "lebih" (nada late: merah-cerah → bahaya). */
private val MerahCerahTerang = Color(0xFFFF4D57) // --merah-cerah

/** Padanan [MerahCerahTerang] untuk tema malam. */
private val MerahCerahGelap = Color(0xFFFF6B6B) // --merah-cerah (malam)

/** Deteksi tema aktif dari palet (ink terang hanya di tema malam) — tanpa CompositionLocal baru. */
@Composable
private fun temaMalam(): Boolean = LocalMkColors.current.ink.luminance() > 0.5f

/**
 * Warna seri data divisi menurut indeks: siklus 6 token `--data-1..6` (indeks 0..5,
 * nilai lain dibungkus modulo) mengikuti tema aktif. Untuk gradien batang,
 * pasangkan dengan [nadaDivisiCerah] berindeks sama.
 */
@Composable
fun nadaDivisi(indeks: Int): Color {
    val i = ((indeks % 6) + 6) % 6
    return if (temaMalam()) DataGelap[i] else DataTerang[i]
}

/**
 * Titik awal gradien batang divisi (setara `--*-cerah` web). Seri 3 dan 6 tidak
 * punya pasangan cerah: nilainya sama dengan [nadaDivisi] (gradien datar).
 */
@Composable
fun nadaDivisiCerah(indeks: Int): Color {
    val i = ((indeks % 6) + 6) % 6
    return if (temaMalam()) CerahGelap[i] else CerahTerang[i]
}

/* ---------- Komponen ---------- */

/**
 * Batang kinerja divisi (port DivisionBar web): nama + titik nada data di kiri,
 * persen tabular di kanan; trek tipis berisi gradien nada; penanda target opsional
 * menjulur 3dp di luar trek. Nilai di atas 100% tidak dipotong — batang penuh
 * bernada late, angka sebenarnya tetap ditulis, dan muncul ikon peringatan +
 * kata "Lebih x%" (warna + ikon + kata).
 *
 * @param nada warna seri divisi; [Color.Unspecified] → [nadaDivisi] indeks 0 (data-1).
 * @param nadaAwal titik awal gradien; [Color.Unspecified] → pasangan cerah bawaan
 *   (datar bila [nada] diisi manual tanpa pasangan cerah).
 */
@Composable
fun MkDivisionBar(
    modifier: Modifier = Modifier,
    nama: String,
    nilai: Int,
    nada: Color = Color.Unspecified,
    nadaAwal: Color = Color.Unspecified,
    target: Int? = null,
    meta: String? = null,
) {
    val warna = LocalMkColors.current
    val mentah = nilai.coerceAtLeast(0)
    val lebih = mentah > 100
    val isi = mentah.coerceIn(0, 100)

    // Warna batang & titik: keadaan "lebih" memakai nada late, selain itu nada divisi.
    val nadaAkhir = if (lebih) warna.statusLate else if (nada == Color.Unspecified) nadaDivisi(0) else nada
    val awal = when {
        lebih -> if (temaMalam()) MerahCerahGelap else MerahCerahTerang
        nadaAwal != Color.Unspecified -> nadaAwal
        nada == Color.Unspecified -> nadaDivisiCerah(0)
        else -> nadaAkhir // nada manual tanpa pasangan cerah → gradien datar
    }

    val gerakDikurangi = LocalReducedMotion.current
    val porsi by animateFloatAsState(
        targetValue = isi / 100f,
        animationSpec = if (gerakDikurangi) snap() else tween(MkMotion.Data, easing = MkEasing.Standard),
        label = "mkDivbarIsi",
    )

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp), // gap 6px mk-divbar web
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(nadaAkhir),
                )
                Text(
                    text = nama,
                    style = MkTypography.callout,
                    color = warna.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                if (lebih) {
                    Icon(
                        imageVector = Icons.Outlined.Warning,
                        contentDescription = null,
                        tint = warna.statusLate,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = "Lebih ${mentah - 100}%",
                        style = MkTypography.callout.copy(fontWeight = FontWeight.SemiBold).tabular,
                        color = warna.statusLate,
                        maxLines = 1,
                    )
                }
                Text(
                    text = "$mentah%",
                    style = MkTypography.callout.copy(fontWeight = FontWeight.SemiBold).tabular,
                    color = warna.ink,
                    maxLines = 1,
                )
            }
        }
        TrekDivisionBar(
            porsi = porsi,
            awal = awal,
            akhir = nadaAkhir,
            target = target,
            deskripsi = deskripsiA11y(nama = nama, mentah = mentah, target = target),
            nilaiMaks = maxOf(100, mentah) / 100f,
        )
        if (meta != null) {
            Text(
                text = meta,
                style = MkTypography.caption.copy(fontWeight = FontWeight.Normal),
                color = warna.ink2,
            )
        }
    }
}

/** Trek 10dp fill-1 + isi gradien + penanda target 2dp ink (menjulur 3dp atas-bawah). */
@Composable
private fun TrekDivisionBar(
    porsi: Float,
    awal: Color,
    akhir: Color,
    target: Int?,
    deskripsi: String,
    nilaiMaks: Float,
) {
    val warna = LocalMkColors.current
    val ketebalan = 10.dp
    val julur = 3.dp
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(ketebalan + julur * 2)
            .semantics {
                progressBarRangeInfo = ProgressBarRangeInfo(porsi, 0f..nilaiMaks)
                contentDescription = deskripsi
            },
    ) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val ketebalanPx = ketebalan.toPx()
            val julurPx = julur.toPx()
            val tinggiTotal = ketebalanPx + julurPx * 2
            val radiusTrek = ketebalanPx / 2f
            // Trek sisa (fill-1).
            drawRoundRect(
                color = warna.fill1,
                topLeft = Offset(0f, julurPx),
                size = Size(size.width, ketebalanPx),
                cornerRadius = CornerRadius(radiusTrek, radiusTrek),
            )
            // Isi gradien nada (penuh saat "lebih" karena isi dikunci 100).
            val lebarIsi = size.width * porsi
            if (lebarIsi > 0f) {
                val radiusIsi = minOf(radiusTrek, lebarIsi / 2f)
                drawRoundRect(
                    brush = Brush.horizontalGradient(listOf(awal, akhir)),
                    topLeft = Offset(0f, julurPx),
                    size = Size(lebarIsi, ketebalanPx),
                    cornerRadius = CornerRadius(radiusIsi, radiusIsi),
                )
            }
            // Penanda target: garis 2dp ink di posisi target%.
            if (target != null) {
                val lebarGaris = 2.dp.toPx()
                val cx = (size.width * target.coerceIn(0, 100) / 100f)
                    .coerceIn(lebarGaris / 2f, size.width - lebarGaris / 2f)
                drawRoundRect(
                    color = warna.ink,
                    topLeft = Offset(cx - lebarGaris / 2f, 0f),
                    size = Size(lebarGaris, tinggiTotal),
                    cornerRadius = CornerRadius(lebarGaris / 2f),
                )
            }
        }
    }
}

/** Teks pembaca layar: "nama, x%" + kata "lebih" + target (padanan aria-valuetext web). */
private fun deskripsiA11y(nama: String, mentah: Int, target: Int?): String = buildString {
    append(nama)
    append(", ")
    append(mentah)
    append('%')
    if (mentah > 100) {
        append(", lebih ")
        append(mentah - 100)
        append("% dari batas")
    }
    if (target != null) {
        append(", target ")
        append(target)
        append('%')
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkDivisionBarPreview() {
    MKTheme {
        Column(
            modifier = Modifier
                .background(color = LocalMkColors.current.bg)
                .padding(all = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            MkDivisionBar(
                nama = "Teknologi",
                nilai = 72,
                nada = nadaDivisi(0),
                target = 85,
                meta = "12 dari 16 laporan tepat waktu",
            )
            MkDivisionBar(nama = "Keuangan", nilai = 85, nada = nadaDivisi(1), target = 85)
            MkDivisionBar(
                nama = "Media",
                nilai = 54,
                nada = nadaDivisi(2),
                target = 80,
                meta = "2 laporan belum masuk",
            )
            MkDivisionBar(nama = "SDM", nilai = 112, nada = nadaDivisi(3), meta = "Beban 3 orang")
            MkDivisionBar(nama = "Operasional", nilai = 100, nada = nadaDivisi(4))
            MkDivisionBar(nama = "Hukum", nilai = 0, nada = nadaDivisi(5))
        }
    }
}
