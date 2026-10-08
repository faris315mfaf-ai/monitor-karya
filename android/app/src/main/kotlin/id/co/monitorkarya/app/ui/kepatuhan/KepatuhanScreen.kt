// Layar Kepatuhan laporan Admin PT (T6-C8 Fase 2) — padanan ComplianceCard
// web (src/components/admin/compliance.tsx, 04-admin-pt.md §4).
//
// Satu kalimat jawaban ("x dari y orang lapor hari ini."), MkSegmentedControl
// Harian/Mingguan, daftar divisi (BatangDivisi persen + StatusBadge; bentang
// → daftar belum lapor dengan "Ingatkan" per orang + "Ingatkan semua" per
// divisi), dan banner kecil "Sudah lewat tenggat" dengan tombol nonaktif
// setelah laporan harian terkunci 17.00 WIB.
//
// MkDivisionBar/MkQueueItem designsystem belum tersedia saat tugas ini jalan,
// jadi BatangDivisi + SeriDivisi di bawah adalah port LOKAL paket ini (nilai
// seri --data-1..6 dibawa dari design-system/tokens.css dengan tema malam);
// saat komponen bersama hadir, pindahkan tanpa mengubah perilaku — catat di
// docs/fase2/T6-C8-LAPORAN.md.
package id.co.monitorkarya.app.ui.kepatuhan

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOfflineBanner
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// ------------------------------------------------------------------
// Titik masuk
// ------------------------------------------------------------------

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun KepatuhanScreen(
    vm: KepatuhanViewModel,
    offline: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val mode by vm.mode.collectAsStateWithLifecycle()
    val terbuka by vm.terbuka.collectAsStateWithLifecycle()
    val mengirim by vm.mengirim.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    KepatuhanScreen(
        state = state,
        mode = mode,
        terbuka = terbuka,
        mengirim = mengirim,
        notifikasi = notifikasi,
        offline = offline,
        onUlang = vm::ulang,
        onPilihMode = vm::pilihMode,
        onBukaTutupDivisi = vm::bukaTutupDivisi,
        onIngatkanOrang = vm::ingatkanOrang,
        onIngatkanDivisi = vm::ingatkanDivisi,
        onNotifikasiTampil = vm::notifikasiTampil,
        modifier = modifier,
    )
}

/** Versi status murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Composable
fun KepatuhanScreen(
    state: KepatuhanUiState,
    mode: ModeKepatuhan = ModeKepatuhan.HARIAN,
    terbuka: String? = null,
    mengirim: String? = null,
    notifikasi: NotifikasiKepatuhan? = null,
    offline: Boolean = false,
    onUlang: () -> Unit = {},
    onPilihMode: (ModeKepatuhan) -> Unit = {},
    onBukaTutupDivisi: (String?) -> Unit = {},
    onIngatkanOrang: (String) -> Unit = {},
    onIngatkanDivisi: (String) -> Unit = {},
    onNotifikasiTampil: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notifikasi?.id) {
        notifikasi?.let { n ->
            snackbar.showSnackbar(message = n.pesan, duration = SnackbarDuration.Short)
            onNotifikasiTampil()
        }
    }
    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MkSpacing.space5, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            if (offline) {
                MkOfflineBanner(modifier = Modifier.fillMaxWidth(), terlihat = true, onCobaLagi = onUlang)
            }
            when (state) {
                KepatuhanUiState.Memuat -> repeat(4) { MkSkeleton(modifier = Modifier.fillMaxWidth().height(72.dp)) }
                is KepatuhanUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
                is KepatuhanUiState.Siap -> IsiKepatuhan(
                    meja = state.meja,
                    mode = mode,
                    terbuka = terbuka,
                    mengirim = mengirim,
                    onPilihMode = onPilihMode,
                    onBukaTutupDivisi = onBukaTutupDivisi,
                    onIngatkanOrang = onIngatkanOrang,
                    onIngatkanDivisi = onIngatkanDivisi,
                )
            }
        }
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = MkSpacing.space10),
        )
    }
}

// ------------------------------------------------------------------
// Isi layar
// ------------------------------------------------------------------

@Composable
private fun IsiKepatuhan(
    meja: MejaKepatuhan,
    mode: ModeKepatuhan,
    terbuka: String?,
    mengirim: String?,
    onPilihMode: (ModeKepatuhan) -> Unit,
    onBukaTutupDivisi: (String?) -> Unit,
    onIngatkanOrang: (String) -> Unit,
    onIngatkanDivisi: (String) -> Unit,
) {
    val warna = LocalMkColors.current

    // Kepala layar: judul, satu kalimat jawaban, dan pilihan jenis laporan.
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Text(text = "Kepatuhan laporan", style = MkTypography.title3, color = warna.ink)
        Text(text = kalimatJawaban(meja, mode), style = MkTypography.body, color = warna.ink)
        teksPenunjang(meja, mode)?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
    }
    MkSegmentedControl(
        options = listOf(
            MkOpsi(value = ModeKepatuhan.HARIAN.name, label = "Harian"),
            MkOpsi(value = ModeKepatuhan.MINGGUAN.name, label = "Mingguan"),
        ),
        terpilih = mode.name,
        onPilih = { nilai -> onPilihMode(nilai.dariNama()) },
    )

    // Lewat tenggat harian 17.00 WIB: banner kecil + tombol Ingatkan nonaktif.
    if (meja.terkunci) BannerTenggat()

    val divisiTampil = if (mode == ModeKepatuhan.MINGGUAN) {
        meja.divisi
    } else {
        meja.divisi.filter { it.wajib > 0 || it.cuti > 0 }
    }

    if (divisiTampil.isEmpty()) {
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(
                teks = if (meja.divisi.isEmpty()) {
                    "Belum ada divisi aktif."
                } else {
                    "Belum ada PIC proyek aktif di divisi mana pun."
                },
            )
        }
    } else {
        MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space1) {
            divisiTampil.forEach { d ->
                BarisDivisi(
                    divisi = d,
                    meja = meja,
                    mode = mode,
                    terbuka = terbuka == d.id,
                    onBukaTutup = { onBukaTutupDivisi(d.id) },
                )
                AnimatedVisibility(
                    visible = terbuka == d.id,
                    enter = expandVertically() + fadeIn(),
                    exit = shrinkVertically() + fadeOut(),
                ) {
                    DetailDivisi(
                        divisi = d,
                        meja = meja,
                        mode = mode,
                        mengirim = mengirim,
                        onIngatkanOrang = onIngatkanOrang,
                        onIngatkanDivisi = onIngatkanDivisi,
                    )
                }
            }
        }
    }
}

/** Banner kecil "Sudah lewat tenggat" saat laporan harian terkunci 17.00 WIB. */
@Composable
private fun BannerTenggat() {
    val warna = LocalMkColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.statusLateSoft)
            .padding(MkSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Icon(imageVector = Icons.Outlined.Schedule, contentDescription = null, tint = warna.statusLate)
        Text(
            text = "Sudah lewat tenggat 17.00 WIB — tombol pengingat aktif lagi besok.",
            style = MkTypography.footnote,
            color = warna.statusLate,
        )
    }
}

/** Baris kepala satu divisi: batang persen (harian) / nama + kadiv (mingguan), lencana, chevron. */
@Composable
private fun BarisDivisi(
    divisi: DivisiKepatuhan,
    meja: MejaKepatuhan,
    mode: ModeKepatuhan,
    terbuka: Boolean,
    onBukaTutup: () -> Unit,
) {
    val warna = LocalMkColors.current
    val seri = seriDivisi(divisi.nama)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .clickable(
                role = Role.Button,
                onClickLabel = "Bentangkan Divisi ${divisi.nama}",
                onClick = onBukaTutup,
            )
            .padding(horizontal = MkSpacing.space3, vertical = 12.dp)
            .heightIn(min = 56.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            if (mode == ModeKepatuhan.HARIAN) {
                val kepala = divisi.kepalaNama ?: "kepala divisi belum ditetapkan"
                BatangDivisi(
                    nama = "Divisi ${divisi.nama}",
                    persen = divisi.persen,
                    meta = "${divisi.sudah} dari ${divisi.wajib} orang · $kepala",
                    seri = seri,
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                ) {
                    TitikSeri(seri = seri)
                    Text(
                        text = "Divisi ${divisi.nama}",
                        style = MkTypography.bodyStrong,
                        color = warna.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = (divisi.kepalaNama ?: "Kepala divisi belum ditetapkan") +
                        (divisi.diserahkanIso?.let { " · diserahkan ${relatifKecil(it)}" } ?: ""),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        val lencana = if (mode == ModeKepatuhan.HARIAN) {
            lencanaHarian(divisi, meja.terkunci)
        } else {
            lencanaMingguan(divisi, meja.serahLewat)
        }
        StatusBadge(status = lencana.status, size = MkBadgeSize.SM, text = lencana.teks)
        ChevronBentang(terbuka = terbuka)
    }
}

/** Chevron yang berputar mengikuti keadaan bentang (hormati reduced motion). */
@Composable
private fun ChevronBentang(terbuka: Boolean) {
    val warna = LocalMkColors.current
    val putar = if (LocalReducedMotion.current) {
        if (terbuka) 180f else 0f
    } else {
        val nilai by animateFloatAsState(
            targetValue = if (terbuka) 180f else 0f,
            animationSpec = tween(durationMillis = MkMotion.Fast, easing = MkEasing.Standard),
            label = "chevron-divisi",
        )
        nilai
    }
    Icon(
        imageVector = Icons.Outlined.KeyboardArrowDown,
        contentDescription = null,
        tint = warna.ink2,
        modifier = Modifier.graphicsLayer { rotationZ = putar },
    )
}

/** Isi bentangan satu divisi: status mingguan (mode Mingguan) + belum lapor + Ingatkan. */
@Composable
private fun DetailDivisi(
    divisi: DivisiKepatuhan,
    meja: MejaKepatuhan,
    mode: ModeKepatuhan,
    mengirim: String?,
    onIngatkanOrang: (String) -> Unit,
    onIngatkanDivisi: (String) -> Unit,
) {
    val warna = LocalMkColors.current
    val bolehKirim = meja.bolehIngatkan && !meja.terkunci

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MkSpacing.space4, vertical = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        if (mode == ModeKepatuhan.MINGGUAN) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MkShapes.md)
                    .background(color = warna.fill1)
                    .padding(MkSpacing.space3),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                Text(
                    text = "Laporan mingguan M${meja.isoMinggu}",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
                val lencana = lencanaMingguan(divisi, meja.serahLewat)
                StatusBadge(status = lencana.status, size = MkBadgeSize.SM, text = lencana.teks)
                Text(
                    text = divisi.diserahkanIso
                        ?.let { "Diserahkan ${relatifKecil(it)}" }
                        ?: "Tenggat serah terima Kamis 17.00 WIB.",
                    style = MkTypography.caption,
                    color = warna.ink2,
                )
            }
        }

        // Belum lapor hari ini — "Ingatkan" per orang bila belum dan belum terkunci.
        Text(text = "Belum lapor hari ini", style = MkTypography.headline, color = warna.ink)
        if (divisi.belumLapor.isEmpty()) {
            Text(
                text = if (divisi.wajib > 0) {
                    "Semua anggota sudah lapor hari ini."
                } else {
                    "Tidak ada anggota yang wajib lapor hari ini."
                },
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        } else {
            divisi.belumLapor.forEach { orang ->
                MkListRow(
                    judul = orang.nama,
                    sub = subjudulOrang(orang),
                    inisial = inisialDari(orang.nama),
                    trailing = {
                        if (orang.sudahDiingatkan) {
                            StatusBadge(
                                status = MkStatus.INFO,
                                size = MkBadgeSize.SM,
                                text = "Diingatkan ${jamWib(orang.diingatkanIso) ?: "-"}",
                            )
                        } else if (bolehKirim) {
                            MkButton(
                                label = if (mengirim == "user:${orang.id}") "Mengirim…" else "Ingatkan",
                                variant = MkButtonVariant.SECONDARY,
                                size = MkButtonSize.S,
                                enabled = mengirim == null,
                                onClick = { onIngatkanOrang(orang.id) },
                            )
                        } else {
                            StatusBadge(
                                status = if (meja.terkunci) MkStatus.LATE else MkStatus.RISK,
                                size = MkBadgeSize.SM,
                                text = "Belum lapor",
                            )
                        }
                    },
                )
            }
            if (mode == ModeKepatuhan.HARIAN && divisi.belumDiingatkan > 0) {
                MkButton(
                    label = if (mengirim == "divisi:${divisi.id}") {
                        "Mengirim…"
                    } else {
                        "Ingatkan semua (${divisi.belumDiingatkan})"
                    },
                    variant = MkButtonVariant.SECONDARY,
                    size = MkButtonSize.S,
                    enabled = bolehKirim && mengirim == null,
                    onClick = { onIngatkanDivisi(divisi.id) },
                )
            }
        }
    }
}

// ------------------------------------------------------------------
// Port lokal: BatangDivisi + seri warna divisi (MkDivisionBar belum ada)
// ------------------------------------------------------------------

/**
 * Seri warna divisi — port --data-1..6 tokens.css (docs/design/02 "Seri data"):
 * satu divisi satu warna di semua layar. Nilai malam dari blok
 * [data-theme="dark"]; promosikan ke designsystem/theme saat MkDivisionBar hadir.
 */
internal enum class SeriDivisi(val terang: Color, val malam: Color) {
    DATA1(Color(0xFF0A66D6), Color(0xFF4DA3FF)), // --data-1 Teknologi
    DATA2(Color(0xFF1A7340), Color(0xFF3DD47A)), // --data-2 Keuangan
    DATA3(Color(0xFFC2255C), Color(0xFFFF6B9A)), // --data-3 Media
    DATA4(Color(0xFF6E3FD8), Color(0xFFB79BFF)), // --data-4 SDM
    DATA5(Color(0xFFB84A00), Color(0xFFFF9F43)), // --data-5 Operasional
    DATA6(Color(0xFF0B7A7A), Color(0xFF3CC9C9)), // --data-6 Hukum
}

@Composable
private fun warnaSeri(seri: SeriDivisi): Color {
    val gelap = LocalMkColors.current.ink.luminance() > 0.5f
    return if (gelap) seri.malam else seri.terang
}

/** Titik warna 8dp (.mk-dot web) — kanal warna seri divisi. */
@Composable
private fun TitikSeri(seri: SeriDivisi) {
    Box(
        modifier = Modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(color = warnaSeri(seri)),
    )
}

/**
 * Batang kepatuhan satu divisi (port DivisionBar web, .mk-divbar): nama + titik
 * seri + persen, trek 10dp fill-1 dengan isian seri, dan meta ink-2.
 */
@Composable
private fun BatangDivisi(
    nama: String,
    persen: Int,
    meta: String,
    seri: SeriDivisi,
) {
    val warna = LocalMkColors.current
    val gerakDikurangi = LocalReducedMotion.current
    val fraksi = if (gerakDikurangi) {
        persen / 100f
    } else {
        val nilai by animateFloatAsState(
            targetValue = persen / 100f,
            animationSpec = tween(durationMillis = MkMotion.Data, easing = MkEasing.Standard),
            label = "batang-divisi",
        )
        nilai
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            Row(
                Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                TitikSeri(seri = seri)
                Text(
                    text = nama,
                    style = MkTypography.callout,
                    color = warna.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = "${persen}%",
                style = MkTypography.bodyStrong.tabular,
                color = warna.ink,
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(10.dp)
                .clip(MkShapes.penuh)
                .background(color = warna.fill1),
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraksi.coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .clip(MkShapes.penuh)
                    .background(color = warnaSeri(seri)),
            )
        }
        Text(text = meta, style = MkTypography.caption, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * Seri warna dari NAMA divisi (port division-tone.ts): dipetakan dari nama,
 * bukan urutan tampil, supaya Divisi Keuangan tetap hijau walau daftar
 * disaring/diurutkan ulang.
 */
internal fun seriDivisi(nama: String?): SeriDivisi {
    val n = nama?.trim().orEmpty()
    if (n.isEmpty()) return SeriDivisi.DATA1
    val aturan = listOf(
        Regex("teknolog|\\bti\\b|\\bit\\b|digital|sistem informasi", RegexOption.IGNORE_CASE) to SeriDivisi.DATA1,
        Regex("keuangan|finans|finance|akuntansi|anggaran|perbendaharaan", RegexOption.IGNORE_CASE) to SeriDivisi.DATA2,
        Regex("media|komunikasi|humas|pemasaran|marketing|kreatif|publikasi", RegexOption.IGNORE_CASE) to SeriDivisi.DATA3,
        Regex("\\bsdm\\b|sumber daya manusia|\\bhr\\b|personalia|\\bga\\b|umum", RegexOption.IGNORE_CASE) to SeriDivisi.DATA4,
        Regex("operasi|produksi|gudang|logistik", RegexOption.IGNORE_CASE) to SeriDivisi.DATA5,
        Regex("hukum|legal|kepatuhan", RegexOption.IGNORE_CASE) to SeriDivisi.DATA6,
    )
    aturan.firstOrNull { it.first.containsMatchIn(n) }?.let { return it.second }
    var h = 0
    for (c in n.lowercase()) h = h * 31 + c.code
    val jumlah = SeriDivisi.entries.size
    return SeriDivisi.entries[((h % jumlah) + jumlah) % jumlah]
}

// ------------------------------------------------------------------
// Logika pembantu murni
// ------------------------------------------------------------------

/** Nilai segmented (string) kembali menjadi mode. */
internal fun String.dariNama(): ModeKepatuhan =
    ModeKepatuhan.entries.firstOrNull { it.name == this } ?: ModeKepatuhan.HARIAN

/** Satu kalimat jawaban di atas layar — berganti mengikuti jenis laporan. */
internal fun kalimatJawaban(meja: MejaKepatuhan, mode: ModeKepatuhan): String = when (mode) {
    ModeKepatuhan.HARIAN -> "${meja.sudah} dari ${meja.wajib} orang lapor hari ini."
    ModeKepatuhan.MINGGUAN -> {
        val masuk = meja.divisi.count { it.mingguan != StatusMingguan.BELUM }
        "M${meja.isoMinggu}: $masuk dari ${meja.divisi.size} divisi sudah menyerahkan laporan mingguan."
    }
}

/** Footnote penunjang di bawah kalimat jawaban. */
internal fun teksPenunjang(meja: MejaKepatuhan, mode: ModeKepatuhan): String? = when (mode) {
    ModeKepatuhan.HARIAN -> when {
        meja.cuti > 0 && meja.tanpaDivisi > 0 ->
            "${meja.cuti} orang cuti/izin tidak dihitung · ${meja.tanpaDivisi} PIC belum masuk divisi mana pun."
        meja.cuti > 0 -> "${meja.cuti} orang cuti/izin tidak dihitung."
        meja.tanpaDivisi > 0 -> "${meja.tanpaDivisi} PIC belum masuk divisi mana pun."
        else -> null
    }
    ModeKepatuhan.MINGGUAN -> "Tenggat serah terima Kamis 17.00 WIB."
}

/** Subjudul baris orang: "Manager · 2 jam lalu · SIM RS Bhakti Rahayu". */
internal fun subjudulOrang(orang: OrangBelumLapor): String {
    val terakhir = orang.terakhirLaporIso
        ?.let { "terakhir lapor ${relatifKecil(it)}" }
        ?: "belum pernah lapor"
    return buildString {
        append(orang.peran)
        append(" · ")
        append(terakhir)
        if (orang.proyek.isNotEmpty()) append(" · ").append(orang.proyek.joinToString(", "))
    }
}

/** Inisial dua huruf (port initials format.ts; gelar Bpk./Ibu dibuang). */
internal fun inisialDari(nama: String): String {
    val bersih = nama.replace(Regex("^(Bpk\\.?|Bapak|Ibu|Sdr\\.?|Sdri\\.?)\\s+", RegexOption.IGNORE_CASE), "")
    return bersih.split(Regex("\\s+"))
        .filter { it.isNotEmpty() }
        .take(2)
        .joinToString("") { it.first().uppercaseChar().toString() }
}

/** Zona waktu tampilan — laporan hidup di WIB. */
private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val formatJamWib: DateTimeFormatter = DateTimeFormatter.ofPattern("HH.mm").withZone(WIB)

private val formatTanggalPendek: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("id-ID")).withZone(WIB)
/** ISO → Instant; null bila rusak. */
internal fun cobaIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "HH.mm" WIB dari ISO; null bila ISO rusak. */
internal fun jamWib(iso: String?): String? = cobaIso(iso)?.let { formatJamWib.format(it) }

/**
 * Waktu relatif huruf kecil (port formatRelative web + toLowerCase):
 * "baru saja", "x menit lalu", "x jam lalu", "kemarin", "x hari lalu";
 * lebih dari 7 hari menjadi tanggal "8 Okt".
 */
internal fun relatifKecil(iso: String): String {
    val t = cobaIso(iso) ?: return "-"
    val detik = Duration.between(t, Instant.now()).seconds
    val hari = detik / 86_400
    return when {
        hari > 7 -> formatTanggalPendek.format(t)
        hari == 1L -> "kemarin"
        hari > 0 -> "$hari hari lalu"
        detik / 3_600 > 0 -> "${detik / 3_600} jam lalu"
        detik / 60 > 0 -> "${detik / 60} menit lalu"
        else -> "baru saja"
    }
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

@PreviewGanda
@Composable
private fun KepatuhanScreenPreview() {
    val meja = MejaKepatuhan(
        terkunci = false,
        bolehIngatkan = true,
        wajib = 24,
        sudah = 20,
        cuti = 1,
        diingatkan = 2,
        tanpaDivisi = 1,
        isoMinggu = 41,
        serahLewat = false,
        divisi = listOf(
            DivisiKepatuhan(
                id = "d1",
                nama = "Teknologi",
                kepalaNama = "Rina Kusuma",
                kepalaEmail = "rina@karya.co.id",
                kepalaTelepon = null,
                wajib = 8,
                sudah = 6,
                cuti = 0,
                belumLapor = listOf(
                    OrangBelumLapor(
                        id = "u1",
                        nama = "Budi Santoso",
                        peran = "Manager / PIC proyek",
                        terakhirLaporIso = "2026-10-07T09:30:00Z",
                        diingatkanIso = null,
                        proyek = listOf("SIM RS Bhakti Rahayu"),
                    ),
                    OrangBelumLapor(
                        id = "u2",
                        nama = "Sari Melati",
                        peran = "Staf / PIC proyek",
                        terakhirLaporIso = "2026-10-08T02:15:00Z",
                        diingatkanIso = "2026-10-08T04:00:00Z",
                        proyek = listOf("Aplikasi Klaim Medpay"),
                    ),
                ),
                mingguan = StatusMingguan.MASUK,
                diserahkanIso = "2026-10-07T06:00:00Z",
                disetujuiIso = null,
                diteruskanIso = null,
            ),
            DivisiKepatuhan(
                id = "d2",
                nama = "Keuangan",
                kepalaNama = null,
                kepalaEmail = null,
                kepalaTelepon = null,
                wajib = 4,
                sudah = 4,
                cuti = 0,
                belumLapor = emptyList(),
                mingguan = StatusMingguan.BELUM,
                diserahkanIso = null,
                disetujuiIso = null,
                diteruskanIso = null,
            ),
        ),
    )
    MKTheme {
        KepatuhanScreen(
            state = KepatuhanUiState.Siap(meja),
            mode = ModeKepatuhan.HARIAN,
            terbuka = "d1",
        )
    }
}
