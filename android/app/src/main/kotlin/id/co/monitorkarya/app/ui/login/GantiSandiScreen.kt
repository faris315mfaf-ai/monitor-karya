// Layar wajib ganti kata sandi Fase 0 — port
// src/app/login/ganti-sandi/forced-password-form.tsx ke Compose, plus port
// minimal kebijakan sandi dari src/lib/password-policy.ts (lihat KebijakanSandi).
// Layar murni state + callback: pemanggil (Activity/navigasi) yang memanggil
// /api/profile/password dan menangani keluar akun.
package id.co.monitorkarya.app.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
 * Formulir ganti kata sandi wajib (akun buatan/reset admin).
 *  - [memuat] true → kontrol nonaktif, tombol "Menyimpan…".
 *  - [pesan] galat dari server (mis. sandi lama salah), tampil tanpa tombol.
 *  - [onGanti] hanya terpanggil bila validasi ramah lolos.
 */
@Composable
fun GantiSandiScreen(
    memuat: Boolean,
    pesan: String?,
    onGanti: (kini: String, baru: String, ulang: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var kini by rememberSaveable { mutableStateOf("") }
    var baru by rememberSaveable { mutableStateOf("") }
    var ulang by rememberSaveable { mutableStateOf("") }
    // Satu tombol mata untuk ketiga kolom — sama dengan web.
    var sandiTampak by rememberSaveable { mutableStateOf(false) }
    val c = LocalMkColors.current
    val fokusKini = remember { FocusRequester() }

    val galatBaru = if (baru.isEmpty()) null else KebijakanSandi.masalah(baru)
    val galatUlang = if (ulang.isNotEmpty() && ulang != baru) "Kata sandi baru tidak cocok" else null
    val siap = !memuat && kini.isNotBlank() && galatBaru == null && ulang == baru && ulang.isNotEmpty()

    fun kirim() {
        if (siap) onGanti(kini, baru, ulang)
    }

    val ubahSandi = if (sandiTampak) VisualTransformation.None else PasswordVisualTransformation()
    val tombolMata: @Composable () -> Unit = {
        IconButton(onClick = { sandiTampak = !sandiTampak }, enabled = !memuat) {
            Icon(
                imageVector = if (sandiTampak) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                contentDescription = if (sandiTampak) "Sembunyikan kata sandi" else "Tampilkan kata sandi",
                tint = c.ink2,
            )
        }
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
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("Ganti kata sandi", style = MaterialTheme.typography.displaySmall, color = c.ink)
            Text(
                "Buat kata sandi baru minimal ${KebijakanSandi.PANJANG_MIN} karakter yang hanya Anda ketahui.",
                style = MaterialTheme.typography.bodyLarge,
                color = c.ink2,
            )
        }
        MkCard {
            Text("Kata sandi dari admin perlu diganti", style = MaterialTheme.typography.titleLarge)
            Text(
                "Kata sandi ini dibuat atau disetel ulang oleh admin.",
                style = MaterialTheme.typography.bodySmall,
                color = c.ink2,
            )
            Spacer(Modifier.height(16.dp))
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                MkInputTeks(
                    value = kini,
                    onValueChange = { kini = it },
                    label = "Kata sandi saat ini",
                    modifier = Modifier.focusRequester(fokusKini),
                    enabled = !memuat,
                    visualTransformation = ubahSandi,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    trailingIcon = tombolMata,
                )
                MkInputTeks(
                    value = baru,
                    onValueChange = { baru = it },
                    label = "Kata sandi baru",
                    enabled = !memuat,
                    isError = galatBaru != null,
                    supportingText = galatBaru ?: "Minimal ${KebijakanSandi.PANJANG_MIN} karakter",
                    visualTransformation = ubahSandi,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    trailingIcon = tombolMata,
                )
                MkInputTeks(
                    value = ulang,
                    onValueChange = { ulang = it },
                    label = "Ulangi kata sandi baru",
                    enabled = !memuat,
                    isError = galatUlang != null,
                    supportingText = galatUlang,
                    visualTransformation = ubahSandi,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { kirim() }),
                    trailingIcon = tombolMata,
                )
                pesan?.let { ErrorNote(pesan = it) }
                MkButton(
                    modifier = Modifier.fillMaxWidth(),
                    label = if (memuat) "Menyimpan…" else "Simpan kata sandi baru",
                    onClick = { kirim() },
                    variant = MkButtonVariant.PRIMARY,
                    size = MkButtonSize.M,
                    enabled = !memuat && siap,
                )
            }
        }
    }

    LaunchedEffect(Unit) { fokusKini.requestFocus() }
}

/**
 * Port minimal src/lib/password-policy.ts (F1-C): panjang 8–256 di semua jalur
 * set/ganti sandi dan larang sandi spasi saja. Pesan singkat untuk teks bantu
 * kolom; keputusan akhir tetap di server (invarian domain dipegang server).
 */
internal object KebijakanSandi {
    const val PANJANG_MIN = 8
    const val PANJANG_MAX = 256

    /** Pesan masalah sandi baru, atau null bila diterima. */
    fun masalah(sandi: String): String? = when {
        sandi.length < PANJANG_MIN -> "Minimal $PANJANG_MIN karakter"
        sandi.length > PANJANG_MAX -> "Maksimal $PANJANG_MAX karakter"
        sandi.isBlank() -> "Kata sandi tidak boleh hanya spasi"
        else -> null
    }
}
