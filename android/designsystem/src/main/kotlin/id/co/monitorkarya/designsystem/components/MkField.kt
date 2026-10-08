package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Satu kolom isian untuk input dan textarea formulir Fase 1 (padanan Input/Textarea
 * web): OutlinedTextField M3 bergaya token — radius 14 (--radius-md), batas kontrol
 * token garis (--line-strong; token --line hanya untuk keadaan nonaktif karena
 * dilarang menjadi satu-satunya batas kontrol), aksen saat fokus, galat berwarna
 * bahaya. `baris > 1` menghasilkan textarea multiline (minLines = baris) dengan
 * kapitalisasi kalimat; `baris = 1` input satu baris.
 */
@Composable
fun MkField(
    modifier: Modifier = Modifier,
    nilai: String,
    onUbah: (String) -> Unit,
    label: String,
    placeholder: String? = null,
    baris: Int = 1,
    isError: Boolean = false,
    supportingText: String? = null,
    enabled: Boolean = true,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val multiline = baris > 1
    OutlinedTextField(
        value = nilai,
        onValueChange = onUbah,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        textStyle = MkTypography.body,
        label = { Text(label) },
        placeholder = if (placeholder == null) {
            null
        } else {
            { Text(placeholder) }
        },
        isError = isError,
        keyboardOptions = if (multiline) {
            KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)
        } else {
            KeyboardOptions.Default
        },
        singleLine = !multiline,
        minLines = if (multiline) baris.coerceAtLeast(2) else 1,
        shape = MkShapes.md,
        supportingText = if (supportingText == null) {
            null
        } else {
            { Text(supportingText) }
        },
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = warna.ink,
            unfocusedTextColor = warna.ink,
            disabledTextColor = warna.ink3,
            focusedBorderColor = aksen.text,
            unfocusedBorderColor = warna.lineStrong,
            disabledBorderColor = warna.line,
            errorBorderColor = warna.statusLate,
            focusedLabelColor = aksen.text,
            unfocusedLabelColor = warna.ink2,
            disabledLabelColor = warna.ink3,
            errorLabelColor = warna.statusLate,
            focusedPlaceholderColor = warna.ink3,
            unfocusedPlaceholderColor = warna.ink3,
            cursorColor = aksen.text,
            errorCursorColor = warna.statusLate,
            focusedSupportingTextColor = warna.ink2,
            unfocusedSupportingTextColor = warna.ink2,
            disabledSupportingTextColor = warna.ink3,
            errorSupportingTextColor = warna.statusLate,
        ),
    )
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkFieldPreview() {
    MKTheme {
        Column(
            modifier = Modifier.padding(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            MkField(
                nilai = "Rani Kusuma",
                onUbah = {},
                label = "Nama PIC",
                placeholder = "Nama penanggung jawab",
            )
            MkField(
                nilai = "",
                onUbah = {},
                label = "Email",
                placeholder = "nama@perusahaan.co.id",
                supportingText = "Wajib alamat email kantor.",
            )
            MkField(
                nilai = "proyek-mdpay-2026",
                onUbah = {},
                label = "Kode proyek",
                isError = true,
                supportingText = "Kode sudah dipakai proyek lain.",
            )
            MkField(
                nilai = "",
                onUbah = {},
                label = "Catatan (nonaktif)",
                placeholder = "Tidak bisa diisi",
                enabled = false,
            )
            MkField(
                nilai = "Percepatan migrasi data gudang dilaporkan selesai pada pekan ke-3.",
                onUbah = {},
                label = "Catatan progres",
                placeholder = "Tuliskan capaian dan kendala hari ini",
                baris = 3,
            )
        }
    }
}
