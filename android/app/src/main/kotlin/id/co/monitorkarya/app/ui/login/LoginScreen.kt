// Layar masuk Fase 0 — port src/app/login/page.tsx + src/components/login-form.tsx
// ke Compose. Satu-satunya jalur masuk: identifier (username atau email) + kata
// sandi; tanpa jalan pintas demo (keputusan 10 Sep 2026). Layar murni state +
// callback sehingga mudah diuji/dipratinjau tanpa ViewModel.
package id.co.monitorkarya.app.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.ErrorNote

/**
 * Formulir masuk. Pemanggil memegang status jaringan:
 *  - [memuat] true → semua kontrol nonaktif dan tombol berubah "Memeriksa…".
 *  - [pesanGalat] tampil sebagai catatan galat tanpa tombol coba lagi.
 *  - [onMasuk] dipanggil dengan identifier apa adanya (tanpa spasi tepi) + sandi.
 */
@Composable
fun LoginScreen(
    memuat: Boolean,
    pesanGalat: String?,
    onMasuk: (identifier: String, sandi: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var identifier by rememberSaveable { mutableStateOf("") }
    var sandi by rememberSaveable { mutableStateOf("") }
    var sandiTerlihat by rememberSaveable { mutableStateOf(false) }
    val c = LocalMkColors.current
    val fokusIdentifier = remember { FocusRequester() }

    fun kirim() {
        // Persis seperti web: tombol selalu bisa ditekan (kecuali saat memuat);
        // validasi kosong dilakukan server agar pesannya satu sumber.
        if (!memuat) onMasuk(identifier.trim(), sandi)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 32.dp)
            .widthIn(max = 480.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterVertically),
    ) {
        MerekHeader()
        MkCard {
            Text("Masuk ke akun Anda", style = MaterialTheme.typography.titleLarge)
            Text(
                "Gunakan username dan kata sandi dari Super Admin.",
                style = MaterialTheme.typography.bodySmall,
                color = c.ink2,
            )
            Spacer(Modifier.height(16.dp))
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                MkInputTeks(
                    value = identifier,
                    onValueChange = { identifier = it },
                    label = "Nama pengguna atau email",
                    modifier = Modifier.focusRequester(fokusIdentifier),
                    enabled = !memuat,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrect = false,
                        imeAction = ImeAction.Next,
                    ),
                )
                MkInputTeks(
                    value = sandi,
                    onValueChange = { sandi = it },
                    label = "Kata sandi",
                    enabled = !memuat,
                    visualTransformation = if (sandiTerlihat) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { kirim() }),
                    trailingIcon = {
                        IconButton(
                            onClick = { sandiTerlihat = !sandiTerlihat },
                            enabled = !memuat,
                        ) {
                            Icon(
                                imageVector = if (sandiTerlihat) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = if (sandiTerlihat) "Sembunyikan kata sandi" else "Tampilkan kata sandi",
                                tint = c.ink2,
                            )
                        }
                    },
                )
                pesanGalat?.let { ErrorNote(pesan = it) }
                MkButton(
                    modifier = Modifier.fillMaxWidth(),
                    label = if (memuat) "Memeriksa…" else "Masuk",
                    onClick = { kirim() },
                    variant = MkButtonVariant.PRIMARY,
                    size = MkButtonSize.M,
                    enabled = !memuat,
                )
            }
        }
        Text(
            "Lupa kata sandi? Minta Super Admin menyetel ulang.",
            style = MaterialTheme.typography.bodySmall,
            color = c.ink2,
        )
    }

    // Fokus awal ke kolom identifier — padanan autoFocus di web.
    LaunchedEffect(Unit) { fokusIdentifier.requestFocus() }
}

/** Logo sederhana Fase 0: ikon + judul besar (padanan LogoMark + t-title-1 web). */
@Composable
private fun MerekHeader(modifier: Modifier = Modifier) {
    val c = LocalMkColors.current
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(shape = RoundedCornerShape(20.dp), color = c.accentSoft) {
            Icon(
                imageVector = Icons.Rounded.Work,
                contentDescription = null,
                tint = c.accent,
                modifier = Modifier
                    .padding(14.dp)
                    .size(28.dp),
            )
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("Monitor Karya", style = MaterialTheme.typography.displaySmall, color = c.ink)
            Text(
                "Pemantauan kerja berbasis output",
                style = MaterialTheme.typography.bodyLarge,
                color = c.ink2,
            )
        }
    }
}

/**
 * OutlinedTextField M3 bergaya mk: radius 14 (--radius-md), batas kontrol dari
 * token garis (--line-strong untuk keadaan normal, --line saat nonaktif), aksen
 * saat fokus. Dipakai bersama GantiSandiScreen (satu paket, tanpa impor).
 */
@Composable
internal fun MkInputTeks(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isError: Boolean = false,
    supportingText: String? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = true,
    trailingIcon: @Composable (() -> Unit)? = null,
) {
    val c = LocalMkColors.current
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        textStyle = MaterialTheme.typography.bodyLarge,
        label = { Text(label) },
        trailingIcon = trailingIcon,
        isError = isError,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = singleLine,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = c.accent,
            unfocusedBorderColor = c.lineStrong,
            disabledBorderColor = c.line,
            errorBorderColor = c.statusLate,
            focusedContainerColor = c.surface,
            unfocusedContainerColor = c.surface,
            focusedLabelColor = c.accent,
            unfocusedLabelColor = c.ink2,
            disabledLabelColor = c.ink3,
            cursorColor = c.accent,
        ),
        supportingText = if (supportingText == null) {
            null
        } else {
            { Text(supportingText) }
        },
    )
}
