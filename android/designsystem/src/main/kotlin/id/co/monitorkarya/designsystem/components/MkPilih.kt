@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package id.co.monitorkarya.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Dropdown pilihan tunggal (padanan select web): ExposedDropdownMenuBox M3
 * distyle token — kolom read-only radius 14, batas kontrol --line-strong,
 * aksen saat fokus, menu berlatar surface, opsi terpilih bertanda centang aksen.
 * Panah berputar 180 derajat saat terbuka (tanpa gerak bila reduced motion).
 */
@Composable
fun MkPilih(
    modifier: Modifier = Modifier,
    pilihan: List<MkOpsi>,
    terpilih: MkOpsi?,
    onPilih: (MkOpsi) -> Unit,
    label: String,
    placeholder: String = "Pilih satu",
    enabled: Boolean = true,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val redamGerak = LocalReducedMotion.current
    var terbuka by remember { mutableStateOf(false) }
    val sudutAnimasi by animateFloatAsState(
        targetValue = if (terbuka) 180f else 0f,
        animationSpec = tween(durationMillis = MkMotion.Fast, easing = MkEasing.Standard),
        label = "mk-pilih-panah",
    )
    val sudutPanah = if (redamGerak) {
        if (terbuka) 180f else 0f
    } else {
        sudutAnimasi
    }
    ExposedDropdownMenuBox(
        modifier = modifier,
        expanded = terbuka,
        onExpandedChange = { terbuka = it },
    ) {
        OutlinedTextField(
            value = terpilih?.label ?: placeholder,
            onValueChange = {},
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
            enabled = enabled,
            readOnly = true,
            textStyle = MkTypography.body,
            label = { Text(label) },
            trailingIcon = {
                Icon(
                    imageVector = Icons.Outlined.KeyboardArrowDown,
                    contentDescription = if (terbuka) "Tutup pilihan" else "Buka pilihan",
                    tint = warna.ink2,
                    modifier = Modifier
                        .size(20.dp)
                        .graphicsLayer { rotationZ = sudutPanah },
                )
            },
            shape = MkShapes.md,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = warna.ink,
                unfocusedTextColor = if (terpilih == null) warna.ink3 else warna.ink,
                disabledTextColor = warna.ink3,
                focusedBorderColor = aksen.text,
                unfocusedBorderColor = warna.lineStrong,
                disabledBorderColor = warna.line,
                focusedLabelColor = aksen.text,
                unfocusedLabelColor = warna.ink2,
                disabledLabelColor = warna.ink3,
                disabledTrailingIconColor = warna.ink3,
            ),
        )
        ExposedDropdownMenu(
            expanded = terbuka,
            onDismissRequest = { terbuka = false },
            containerColor = warna.surface,
        ) {
            pilihan.forEach { opsi ->
                DropdownMenuItem(
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                        ) {
                            Text(
                                text = opsi.label,
                                style = MkTypography.body,
                                color = warna.ink,
                            )
                            if (opsi.count != null) {
                                Text(
                                    text = opsi.count.toString(),
                                    style = MkTypography.caption,
                                    color = warna.ink2,
                                )
                            }
                        }
                    },
                    trailingIcon = if (opsi.value == terpilih?.value) {
                        {
                            Icon(
                                imageVector = Icons.Outlined.Check,
                                contentDescription = null,
                                tint = aksen.text,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    } else {
                        null
                    },
                    onClick = {
                        terbuka = false
                        onPilih(opsi)
                    },
                )
            }
        }
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkPilihPreview() {
    MKTheme {
        Column(
            modifier = Modifier.padding(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            val pilihan = listOf(
                MkOpsi(value = "teknologi", label = "Divisi Teknologi", count = 8),
                MkOpsi(value = "operasional", label = "Divisi Operasional", count = 5),
                MkOpsi(value = "data", label = "Divisi Data", count = 3),
            )
            MkPilih(
                pilihan = pilihan,
                terpilih = pilihan.first(),
                onPilih = {},
                label = "Divisi",
            )
            MkPilih(
                pilihan = pilihan,
                terpilih = null,
                onPilih = {},
                label = "Belum dipilih",
            )
            MkPilih(
                pilihan = pilihan,
                terpilih = pilihan.last(),
                onPilih = {},
                label = "Nonaktif",
                enabled = false,
            )
        }
    }
}
