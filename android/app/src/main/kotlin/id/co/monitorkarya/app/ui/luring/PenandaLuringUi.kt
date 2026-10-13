// Penanda UI offline-first bersama (A1-LURING.md §5). Dua lapis:
//   - versi MURNI (BannerLuring, LencanaKirim, DaftarAntrean) — tanpa ViewModel,
//     aman untuk @Preview dan layar yang sudah punya datanya sendiri;
//   - versi OTOMATIS (BannerLuringOtomatis, DaftarAntreanOtomatis,
//     rememberStatusLuring) — mengambil LuringViewModel lewat hiltViewModel().
// Cara pakai singkat (layar berbasis VM):
//   val luring by rememberStatusLuring()
//   val tersimpan = ingatWaktuMuat(state is XUiState.Sukses)
//   if (luring.luring) BannerLuring(tersimpanPadaMs = tersimpan ?: luring.terakhirSinkronMs, onCobaLagi = vm::ulang)
//   DaftarAntreanOtomatis(kunciAwalan = KunciOutbox.AWALAN_MINGGUAN)
// Status selalu warna + ikon + kata; tanpa seru/emoji; sapaan "Anda".
package id.co.monitorkarya.app.ui.luring

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.data.outbox.PesanOutbox
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.data.sync.StatusLuring
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val FORMAT_JAM = DateTimeFormatter.ofPattern("HH.mm").withZone(ZONA_WIB)
private val FORMAT_TGL_JAM = DateTimeFormatter.ofPattern("d MMM HH.mm", Locale.forLanguageTag("id-ID")).withZone(ZONA_WIB)

/** "14.05" bila hari ini (WIB), "12 Okt 14.05" bila hari lain. */
fun waktuTersimpan(ms: Long, sekarangMs: Long = System.currentTimeMillis()): String {
    val t = Instant.ofEpochMilli(ms)
    val hariSama = t.atZone(ZONA_WIB).toLocalDate() == Instant.ofEpochMilli(sekarangMs).atZone(ZONA_WIB).toLocalDate()
    return if (hariSama) FORMAT_JAM.format(t) else FORMAT_TGL_JAM.format(t)
}

/** Kalimat banner: "Luring · data tersimpan 14.05" (+ " · 2 menunggu kirim"). */
fun teksBannerLuring(tersimpanPadaMs: Long?, menungguKirim: Int = 0, sekarangMs: Long = System.currentTimeMillis()): String =
    buildString {
        append("Luring")
        if (tersimpanPadaMs != null && tersimpanPadaMs > 0) {
            append(" · data tersimpan ")
            append(waktuTersimpan(tersimpanPadaMs, sekarangMs))
        } else {
            append(" · data terakhir masih terbaca")
        }
        if (menungguKirim > 0) append(" · $menungguKirim menunggu kirim")
    }

/**
 * Kalimat banner untuk layar pemantau tanpa cache Room (E2E-3 B6): data yang
 * tampil berasal dari pemuatan terakhir selama aplikasi terbuka dan tidak
 * diperbarui sampai tersambung lagi.
 */
const val TEKS_LURING_PEMANTAU =
    "Luring · data di layar ini dari pemuatan terakhir dan tidak diperbarui sampai tersambung lagi"

// ------------------------------------------------------------------
// Versi murni
// ------------------------------------------------------------------

/**
 * Banner luring satu baris: ikon wifi_off + "Luring · data tersimpan HH.MM".
 * [onCobaLagi] null menyembunyikan tombol.
 */
@Composable
fun BannerLuring(
    modifier: Modifier = Modifier,
    tersimpanPadaMs: Long?,
    menungguKirim: Int = 0,
    onCobaLagi: (() -> Unit)? = null,
    teks: String? = null,
) {
    val warna = LocalMkColors.current
    Row(
        modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(warna.fill1)
            .padding(start = MkSpacing.space4, top = 10.dp, bottom = 10.dp, end = MkSpacing.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Icon(Icons.Outlined.WifiOff, contentDescription = null, tint = warna.ink2, modifier = Modifier.size(18.dp))
        Text(
            text = teks ?: teksBannerLuring(tersimpanPadaMs, menungguKirim),
            style = MkTypography.body,
            color = warna.ink,
            modifier = Modifier.weight(1f),
        )
        if (onCobaLagi != null) {
            MkButton(label = "Coba lagi", onClick = onCobaLagi, variant = MkButtonVariant.PLAIN, size = MkButtonSize.S)
        }
    }
}

/** Lencana kecil "Menunggu kirim" (info + jam) / "Gagal kirim" (terlambat + galat). */
@Composable
fun LencanaKirim(status: StatusKirim, modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    val (ikon, kata, nada, latar) = when (status) {
        StatusKirim.MENUNGGU -> Empat(Icons.Outlined.Schedule, "Menunggu kirim", warna.statusInfo, warna.statusInfoSoft)
        StatusKirim.GAGAL -> Empat(Icons.Outlined.ErrorOutline, "Gagal kirim", warna.statusLate, warna.statusLateSoft)
    }
    Row(
        modifier
            .clip(MkShapes.xs)
            .background(latar)
            .padding(horizontal = MkSpacing.space2, vertical = 2.dp)
            .semantics { contentDescription = kata },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Icon(ikon, contentDescription = null, tint = nada, modifier = Modifier.size(14.dp))
        Text(kata, style = MkTypography.caption, color = nada, maxLines = 1)
    }
}

private data class Empat<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

/**
 * Daftar tulisan tertunda: label + lencana; GAGAL menampilkan pesan server
 * dan aksi "Kirim ulang"/"Buang". Kosong = tidak menggambar apa pun.
 */
@Composable
fun DaftarAntrean(
    pesan: List<PesanOutbox>,
    modifier: Modifier = Modifier,
    onUlangi: (Long) -> Unit = {},
    onBuang: (Long) -> Unit = {},
) {
    if (pesan.isEmpty()) return
    val warna = LocalMkColors.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(warna.surface),
    ) {
        pesan.forEachIndexed { i, p ->
            if (i > 0) MkDivider()
            Column(
                Modifier.padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                    Text(
                        p.label,
                        style = MkTypography.bodyStrong,
                        color = warna.ink,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    LencanaKirim(p.status)
                }
                val keterangan = when (p.status) {
                    StatusKirim.GAGAL -> p.pesanGalat ?: "Server menolak perubahan ini."
                    StatusKirim.MENUNGGU -> "Dibuat ${waktuTersimpan(p.dibuatPada)} · dikirim otomatis saat daring"
                }
                Text(keterangan, style = MkTypography.footnote, color = warna.ink2)
                if (p.status == StatusKirim.GAGAL) {
                    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                        MkButton(label = "Kirim ulang", onClick = { onUlangi(p.id) }, size = MkButtonSize.S)
                        MkButton(label = "Buang", onClick = { onBuang(p.id) }, variant = MkButtonVariant.PLAIN, size = MkButtonSize.S)
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// Versi otomatis (ber-ViewModel)
// ------------------------------------------------------------------

/** Status luring bersama untuk composable mana pun di bawah NavHost. */
@Composable
fun rememberStatusLuring(vm: LuringViewModel = hiltViewModel()): State<StatusLuring> =
    vm.status.collectAsStateWithLifecycle()

/**
 * Banner luring yang muncul sendiri saat perangkat luring. [tersimpanPadaMs]
 * = kapan data layar ini dimuat (lihat [ingatWaktuMuat]); null → waktu sinkron
 * Room terakhir.
 */
@Composable
fun BannerLuringOtomatis(
    modifier: Modifier = Modifier,
    tersimpanPadaMs: Long? = null,
    onCobaLagi: (() -> Unit)? = null,
    vm: LuringViewModel = hiltViewModel(),
) {
    val status by vm.status.collectAsStateWithLifecycle()
    if (status.luring) {
        BannerLuring(
            modifier = modifier,
            tersimpanPadaMs = tersimpanPadaMs ?: status.terakhirSinkronMs,
            menungguKirim = status.menungguKirim,
            onCobaLagi = onCobaLagi,
        )
    }
}

/** Daftar antrean untuk kunci berawalan [kunciAwalan] (null = semua). */
@Composable
fun DaftarAntreanOtomatis(
    kunciAwalan: String?,
    modifier: Modifier = Modifier,
    vm: LuringViewModel = hiltViewModel(),
) {
    val alur = remember(kunciAwalan) { vm.pesan(kunciAwalan) }
    val pesan by alur.collectAsStateWithLifecycle(initialValue = emptyList())
    DaftarAntrean(pesan = pesan, modifier = modifier, onUlangi = vm::ulangi, onBuang = vm::buang)
}

/**
 * Ingat kapan data layar terakhir berhasil dimuat: setiap kali [kunciSukses]
 * berganti ke nilai non-null (mis. objek state Sukses yang baru), waktu kini
 * dicatat. Bertahan rotasi layar.
 */
@Composable
fun ingatWaktuMuat(kunciSukses: Any?): Long? {
    var waktu by rememberSaveable { mutableStateOf<Long?>(null) }
    LaunchedEffect(kunciSukses) {
        if (kunciSukses != null) waktu = System.currentTimeMillis()
    }
    return waktu
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

@PreviewGanda
@Composable
private fun PenandaLuringPreview() {
    MKTheme {
        Column(Modifier.padding(MkSpacing.space3), verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            BannerLuring(tersimpanPadaMs = System.currentTimeMillis() - 3_600_000, menungguKirim = 2, onCobaLagi = {})
            DaftarAntrean(
                pesan = listOf(
                    PesanOutbox(1, "SIMPAN_BUTIR_MINGGUAN", "mingguan:d:2026-W41", "Simpan butir \"Pemasangan panel\"", StatusKirim.MENUNGGU, null, System.currentTimeMillis(), 1),
                    PesanOutbox(2, "AKSI_MINGGUAN", "mingguan:d:2026-W41", "Serahkan capaian minggu 41", StatusKirim.GAGAL, "Laporan minggu ini sudah dikunci.", System.currentTimeMillis(), 1),
                ),
            )
        }
    }
}
