// Komponen kecil lokal tab Proyek yang belum ada di :designsystem (catatan
// "butuh parent" di laporan A1): kotak catatan bernada, baris info berikon,
// judul bagian, tombol bahaya, kolom tanggal, dialog konfirmasi hapus.
package id.co.monitorkarya.feature.proyek.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkSnackbarHost
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.proyek.R
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.domain.Nada
import id.co.monitorkarya.feature.proyek.domain.dariKunci
import id.co.monitorkarya.feature.proyek.domain.tampilKunci
import java.time.LocalDate
import java.time.ZoneOffset

fun Nada.keMkStatus(): MkStatus = when (this) {
    Nada.ON -> MkStatus.ON
    Nada.RISK -> MkStatus.RISK
    Nada.LATE -> MkStatus.LATE
    Nada.DONE -> MkStatus.DONE
    Nada.NEUTRAL -> MkStatus.NEUTRAL
    Nada.INFO -> MkStatus.INFO
}

/** Lencana status: warna + ikon + kata (label null = kata bawaan status). */
@Composable
fun Lencana(nada: Nada, label: String?, modifier: Modifier = Modifier, kecil: Boolean = true) {
    StatusBadge(
        modifier = modifier,
        status = nada.keMkStatus(),
        size = if (kecil) MkBadgeSize.SM else MkBadgeSize.MD,
        text = label,
    )
}

/** Judul bagian dalam Sheet (headline, semantik heading). */
@Composable
fun JudulBagian(teks: String, modifier: Modifier = Modifier) {
    Text(
        text = teks,
        style = MkTypography.headline,
        color = LocalMkColors.current.ink,
        modifier = modifier.semantics { heading() },
    )
}

/** Baris info berikon (padanan InfoLine web). */
@Composable
fun BarisInfo(ikon: ImageVector, teks: String, modifier: Modifier = Modifier) {
    val c = LocalMkColors.current
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalAlignment = Alignment.Top) {
        Icon(ikon, contentDescription = null, tint = c.ink2, modifier = Modifier.size(18.dp).padding(top = 1.dp))
        Text(teks, style = MkTypography.body, color = c.ink)
    }
}

/** Kotak catatan lembut bernada (mk-note-box mk-soft--*). */
@Composable
fun KotakCatatan(teks: String, nada: Nada, modifier: Modifier = Modifier) {
    val c = LocalMkColors.current
    val (latar, tinta) = when (nada) {
        Nada.LATE -> c.statusLateSoft to c.ink
        Nada.RISK -> c.statusRiskSoft to c.ink
        Nada.INFO -> c.statusInfoSoft to c.ink
        Nada.ON, Nada.DONE -> c.statusOnSoft to c.ink
        Nada.NEUTRAL -> c.fill1 to c.ink2
    }
    Text(
        text = teks,
        style = MkTypography.footnote,
        color = tinta,
        modifier = modifier
            .fillMaxWidth()
            .background(latar, MkShapes.sm)
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space2 + 2.dp),
    )
}

/** Tag kecil netral (mk-tag). */
@Composable
fun Tag(teks: String) {
    val c = LocalMkColors.current
    Text(
        text = teks,
        style = MkTypography.caption,
        color = c.ink2,
        modifier = Modifier
            .background(c.fill1, MkShapes.penuh)
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space1),
    )
}

/** Tombol teks merah untuk aksi merusak (designsystem belum punya varian destructive). */
@Composable
fun TombolBahaya(label: String, onClick: () -> Unit, enabled: Boolean = true, modifier: Modifier = Modifier) {
    TextButton(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 44.dp)) {
        Text(label, style = MkTypography.bodyStrong, color = if (enabled) LocalMkColors.current.statusLate else LocalMkColors.current.ink3)
    }
}

/**
 * Kolom tanggal: ketuk membuka DatePicker M3. Nilai "YYYY-MM-DD" (WIB) atau "".
 * [minimal] membatasi tanggal paling awal; "Kosongkan" menghapus nilai.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KolomTanggal(
    label: String,
    kunci: String,
    onUbah: (String) -> Unit,
    modifier: Modifier = Modifier,
    minimal: LocalDate? = null,
    galat: String? = null,
    bolehKosong: Boolean = true,
) {
    val c = LocalMkColors.current
    var buka by remember { mutableStateOf(false) }
    val tampil = tampilKunci(kunci)
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(label, style = MkTypography.footnote, color = if (galat != null) c.statusLate else c.ink2)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .background(c.fill1, MkShapes.md)
                .clickable(role = Role.Button) { buka = true }
                .padding(horizontal = MkSpacing.space3)
                .semantics { contentDescription = "$label: ${tampil ?: "belum dipilih"}" },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Icon(Icons.Outlined.CalendarMonth, contentDescription = null, tint = c.ink2, modifier = Modifier.size(18.dp))
            Text(tampil ?: "Pilih tanggal", style = MkTypography.body, color = if (tampil != null) c.ink else c.ink3)
        }
        if (galat != null) Text(galat, style = MkTypography.caption, color = c.statusLate)
    }
    if (buka) {
        val awal = dariKunci(kunci)?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()
        val batas = minimal?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = awal,
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean = batas == null || utcTimeMillis >= batas
            },
        )
        DatePickerDialog(
            onDismissRequest = { buka = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        onUbah(java.time.Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString())
                    }
                    buka = false
                }) { Text(stringResource(R.string.proyek_tanggal_pilih)) }
            },
            dismissButton = {
                Row {
                    if (bolehKosong && kunci.isNotEmpty()) {
                        TextButton(onClick = {
                            onUbah("")
                            buka = false
                        }) { Text(stringResource(R.string.proyek_tanggal_kosongkan)) }
                    }
                    TextButton(onClick = { buka = false }) { Text(stringResource(R.string.proyek_batal)) }
                }
            },
        ) {
            DatePicker(state = state)
        }
    }
}

/** Dialog konfirmasi — dipakai hanya untuk hapus (dan arsip setelah hapus ditolak). */
@Composable
fun DialogKonfirmasi(
    judul: String,
    deskripsi: String,
    labelYa: String,
    merusak: Boolean,
    onYa: () -> Unit,
    onBatal: () -> Unit,
) {
    val c = LocalMkColors.current
    AlertDialog(
        onDismissRequest = onBatal,
        title = { Text(judul, style = MkTypography.title3, color = c.ink) },
        text = { Text(deskripsi, style = MkTypography.body, color = c.ink2) },
        confirmButton = {
            TextButton(onClick = onYa) {
                Text(labelYa, style = MkTypography.bodyStrong, color = if (merusak) c.statusLate else c.ink)
            }
        },
        dismissButton = { TextButton(onClick = onBatal) { Text(stringResource(R.string.proyek_batal), color = c.ink2) } },
        containerColor = c.surface,
    )
}

/**
 * Kaki Sheet dengan host snackbar di atas tombol (C2 T1): Sheet modal adalah
 * window terpisah, jadi snackbar layar akan tertutup. Host hanya disusun
 * selama ada snackbar agar kaki tidak berjarak kosong; [snackbar] null = kaki biasa.
 */
@Composable
fun RowScope.KakiDenganSnackbar(snackbar: SnackbarHostState?, tombol: @Composable RowScope.() -> Unit) {
    Column(Modifier.weight(1f)) {
        if (snackbar?.currentSnackbarData != null) {
            MkSnackbarHost(modifier = Modifier.fillMaxWidth().padding(bottom = MkSpacing.space3), snackbarHostState = snackbar)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3), content = tombol)
    }
}

/** Pernah ditolak penyetuju (siklus Ditolak atau ada slot DITOLAK) — server T12. */
internal fun pernahDitolak(p: ProyekDto): Boolean =
    p.lifecycle == "DITOLAK" || p.approvals.any { it.decision == "DITOLAK" }
