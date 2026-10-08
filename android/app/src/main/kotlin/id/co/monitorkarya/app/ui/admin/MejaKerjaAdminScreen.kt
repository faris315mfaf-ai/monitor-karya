// Meja kerja Admin PT (T8-A1) — tab MEJA_KERJA ADMIN_PT. Dua seksi akordeon
// "Laporan proyek" dan "Laporan divisi" terbuka otomatis; tiap seksi memuat
// daftar pelapor (MkListRow + StatusBadge + waktu, pemisah MkDivider 1px).
// Mengetuk satu pelapor membuka MkSheet rincian BACA-SAJA: proyek menampilkan
// identitas + progres + capaian + kendala dan grid bukti (AsyncImage untuk
// gambar, baris berkas untuk tautan non-gambar); divisi menampilkan status
// header + ringkas butir capaian. Tanpa aksi tulis apa pun di layar ini.
package id.co.monitorkarya.app.ui.admin

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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import id.co.monitorkarya.app.ui.penerimaan.JenisLaporan
import id.co.monitorkarya.app.ui.penerimaan.StatusAntrean
import id.co.monitorkarya.app.ui.penerimaan.jamWib
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkLampiranRow
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOfflineBanner
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun MejaKerjaAdminScreen(
    offline: Boolean = false,
    vm: MejaKerjaAdminViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val terpilih by vm.terpilih.collectAsStateWithLifecycle()
    val rincian by vm.rincian.collectAsStateWithLifecycle()
    MejaKerjaAdminScreen(
        state = state,
        terpilih = terpilih,
        rincian = rincian,
        onUlang = vm::ulang,
        onBukaRincian = vm::bukaRincian,
        onTutupRincian = vm::tutupRincian,
        offline = offline,
        modifier = modifier,
    )
}

/** Versi state murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Composable
fun MejaKerjaAdminScreen(
    state: MejaKerjaAdminUiState,
    terpilih: BarisPelapor? = null,
    rincian: RincianAdminUiState? = null,
    onUlang: () -> Unit = {},
    onBukaRincian: (BarisPelapor) -> Unit = {},
    onTutupRincian: () -> Unit = {},
    offline: Boolean = false,
    modifier: Modifier = Modifier,
) {
    // Kedua akordeon TERBUKA OTOMATIS saat layar pertama tampil.
    var bukaHarian by rememberSaveable { mutableStateOf(true) }
    var bukaMingguan by rememberSaveable { mutableStateOf(true) }

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (offline) {
                MkOfflineBanner(modifier = Modifier.fillMaxWidth(), terlihat = true, onCobaLagi = onUlang)
            }
            when (state) {
                MejaKerjaAdminUiState.Memuat -> KerangkaMeja()
                is MejaKerjaAdminUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
                is MejaKerjaAdminUiState.Siap -> {
                    KepalaMeja(meja = state.meja)
                    SeksiPelaporan(
                        judul = "Laporan proyek",
                        kosong = "Tidak ada proyek aktif.",
                        baris = state.meja.harian,
                        terbuka = bukaHarian,
                        onBukaTutup = { bukaHarian = !bukaHarian },
                        onKlik = onBukaRincian,
                    )
                    MkDivider()
                    SeksiPelaporan(
                        judul = "Laporan divisi",
                        kosong = "Tidak ada divisi.",
                        baris = state.meja.mingguan,
                        terbuka = bukaMingguan,
                        onBukaTutup = { bukaMingguan = !bukaMingguan },
                        onKlik = onBukaRincian,
                    )
                }
            }
        }

        // Detail dibuka di sheet, tidak pindah halaman (docs/design/05).
        MkSheet(
            visible = terpilih != null,
            onTutup = onTutupRincian,
            judul = terpilih?.judul ?: "",
            subjudul = terpilih?.sub?.ifBlank { null },
            konten = {
                IsiRincian(
                    rincian = rincian,
                    onUlang = { terpilih?.let(onBukaRincian) },
                )
            },
        )
    }
}

// ------------------------------------------------------------------
// Daftar pelapor
// ------------------------------------------------------------------

/** Kepala layar: konteks hari/pekan + judul + satu kalimat jawaban. */
@Composable
private fun KepalaMeja(meja: MejaAdminKerja) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(meja.konteks, style = MkTypography.footnote, color = warna.ink2)
        Text("Meja kerja", style = MaterialTheme.typography.displaySmall, color = warna.ink)
        Text(meja.jawaban, style = MkTypography.bodyLg, color = warna.ink)
    }
}

/** Satu seksi akordeon: kepala bisa diklik + daftar pelapor di bawahnya. */
@Composable
private fun SeksiPelaporan(
    judul: String,
    kosong: String,
    baris: List<BarisPelapor>,
    terbuka: Boolean,
    onBukaTutup: () -> Unit,
    onKlik: (BarisPelapor) -> Unit,
) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(MkShapes.md)
                .clickable(role = Role.Button, onClickLabel = "Buka tutup $judul", onClick = onBukaTutup)
                .padding(vertical = MkSpacing.space2),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            Text(
                text = judul,
                style = MkTypography.headline,
                color = warna.ink,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${baris.size}",
                style = MkTypography.footnote.tabular,
                color = warna.ink2,
            )
            ChevronSeksi(terbuka = terbuka)
        }
        AnimatedVisibility(
            visible = terbuka,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut(),
        ) {
            if (baris.isEmpty()) {
                EmptyNote(teks = kosong)
            } else {
                // Antar baris cukup garis 1px, tanpa jarak tambahan
                // (keputusan pemilik 9 Okt 2026).
                Column {
                    baris.forEachIndexed { index, b ->
                        MkListRow(
                            judul = b.judul,
                            sub = b.sub.ifBlank { null },
                            trailing = {
                                StatusBadge(
                                    status = b.status.lencana,
                                    size = MkBadgeSize.SM,
                                    text = b.status.label,
                                )
                            },
                            onClick = { onKlik(b) },
                        )
                        if (index < baris.lastIndex) MkDivider()
                    }
                }
            }
        }
    }
}

/** Chevron yang berputar mengikuti keadaan akordeon (hormati reduced motion). */
@Composable
private fun ChevronSeksi(terbuka: Boolean) {
    val warna = LocalMkColors.current
    val putar = if (LocalReducedMotion.current) {
        if (terbuka) 180f else 0f
    } else {
        val nilai by animateFloatAsState(
            targetValue = if (terbuka) 180f else 0f,
            animationSpec = tween(durationMillis = MkMotion.Fast, easing = MkEasing.Standard),
            label = "chevron-seksi",
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

// ------------------------------------------------------------------
// Sheet rincian
// ------------------------------------------------------------------

/** Isi sheet menurut status rincian yang sedang dimuat. */
@Composable
private fun IsiRincian(rincian: RincianAdminUiState?, onUlang: () -> Unit) {
    when (rincian) {
        null, RincianAdminUiState.Memuat -> KerangkaRincian()
        is RincianAdminUiState.Galat -> ErrorNote(pesan = rincian.pesan, onCobaLagi = onUlang)
        is RincianAdminUiState.Proyek -> IsiRincianProyek(rincian = rincian.rincian, bukti = rincian.bukti)
        is RincianAdminUiState.Divisi -> IsiRincianDivisi(rincian = rincian.rincian)
    }
}

/** Rincian proyek: status + identitas, progres, capaian, kendala, lalu bukti. */
@Composable
private fun IsiRincianProyek(rincian: RincianProyek, bukti: BuktiUiState) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
        StatusBadge(status = rincian.status, text = rincian.statusLabel)
        if (!rincian.adaLaporan) {
            EmptyNote(teks = "PIC belum mengirim laporan hari ini.")
        } else {
            BarisInfo(label = "Tanggal laporan", nilai = rincian.tanggal.orEmpty())
            rincian.diserahkanIso?.let { BarisInfo(label = "Dikirim", nilai = "${jamWib(it) ?: "-"} WIB") }
            rincian.diteruskanIso?.let { BarisInfo(label = "Diteruskan", nilai = "${jamWib(it) ?: "-"} WIB") }

            KolomBerjudul(judul = "Progres") {
                ProgresBar(progres = rincian.progres, warnaIsi = warnaStatus(status = rincian.status))
            }
            KolomBerjudul(judul = "Capaian hari ini") {
                Text(
                    text = rincian.capaian ?: "Tidak ada catatan capaian.",
                    style = MkTypography.body,
                    color = warna.ink,
                )
            }
            KolomBerjudul(judul = "Kendala") {
                Text(
                    text = rincian.kendala ?: "Tidak ada kendala dilaporkan.",
                    style = MkTypography.body,
                    color = if (rincian.kendala == null) warna.ink2 else warna.ink,
                )
            }
            KolomBukti(bukti = bukti)
        }
    }
}

/** Rincian divisi: status header + waktu serah/setuju/terus + ringkas butir. */
@Composable
private fun IsiRincianDivisi(rincian: RincianDivisi) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
        StatusBadge(status = rincian.status, text = rincian.statusLabel)
        rincian.diserahkanIso?.let { BarisInfo(label = "Diserahkan", nilai = "${jamWib(it) ?: "-"} WIB") }
        rincian.disetujuiIso?.let { BarisInfo(label = "Disetujui", nilai = "${jamWib(it) ?: "-"} WIB") }
        rincian.diteruskanIso?.let { BarisInfo(label = "Diteruskan", nilai = "${jamWib(it) ?: "-"} WIB") }

        KolomBerjudul(judul = "Butir capaian (${rincian.butir.size})") {
            if (rincian.butir.isEmpty()) {
                EmptyNote(
                    teks = if (rincian.diserahkanIso == null) {
                        "Laporan mingguan pekan ini belum diserahkan."
                    } else {
                        "Belum ada butir pada laporan ini."
                    },
                )
            } else {
                Column {
                    rincian.butir.forEachIndexed { index, butir ->
                        MkListRow(
                            judul = butir.uraian,
                            sub = listOfNotNull(
                                butir.capaian,
                                "progres ${butir.progres}%",
                            ).joinToString(" · "),
                            trailing = {
                                StatusBadge(
                                    status = butir.status,
                                    size = MkBadgeSize.SM,
                                    text = butir.statusLabel,
                                )
                            },
                        )
                        if (index < rincian.butir.lastIndex) MkDivider()
                    }
                }
            }
            Text(
                text = "Butir lengkap tersimpan di laporan mingguan divisi.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
    }
}

// ------------------------------------------------------------------
// Bagian kecil bersama
// ------------------------------------------------------------------

/** Judul seksi kecil di dalam sheet + isinya. */
@Composable
private fun KolomBerjudul(judul: String, isi: @Composable () -> Unit) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Text(text = judul, style = MkTypography.headline, color = warna.ink)
        isi()
    }
}

/** Baris label kiri (footnote ink-2) + nilai kanan (body ink). */
@Composable
private fun BarisInfo(label: String, nilai: String) {
    val warna = LocalMkColors.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Text(
            text = label,
            style = MkTypography.footnote,
            color = warna.ink2,
            modifier = Modifier.weight(1f),
        )
        Text(text = nilai, style = MkTypography.body, color = warna.ink, maxLines = 1)
    }
}

/** Progres bar tipis: trek fill-2, isian warna status, persen tabular. */
@Composable
private fun ProgresBar(progres: Int, warnaIsi: Color) {
    val warna = LocalMkColors.current
    val nilai = progres.coerceIn(0, 100)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(8.dp)
                .clip(MkShapes.penuh)
                .background(color = warna.fill2),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction = nilai / 100f)
                    .fillMaxHeight()
                    .clip(MkShapes.penuh)
                    .background(color = warnaIsi),
            )
        }
        Text(
            text = "$nilai%",
            style = MkTypography.bodyStrong.tabular,
            color = warna.ink,
        )
    }
}

/** Kolom bukti: grid gambar (AsyncImage) + baris berkas non-gambar. */
@Composable
private fun KolomBukti(bukti: BuktiUiState) {
    val warna = LocalMkColors.current
    KolomBerjudul(judul = "Bukti") {
        when (bukti) {
            BuktiUiState.Memuat -> Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                repeat(3) { MkSkeleton(tinggi = 96.dp, lebar = 96.dp) }
            }
            is BuktiUiState.Galat -> ErrorNote(pesan = bukti.pesan)
            is BuktiUiState.Siap -> {
                if (bukti.gambar.isEmpty() && bukti.berkas.isEmpty()) {
                    Text(
                        text = "Tidak ada bukti pada laporan ini.",
                        style = MkTypography.footnote,
                        color = warna.ink2,
                    )
                } else {
                    if (bukti.gambar.isNotEmpty()) {
                        // Grid tiga kolom persegi; baris terakhir diratakan dengan spacer.
                        bukti.gambar.chunked(3).forEach { barisGambar ->
                            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                                barisGambar.forEach { g ->
                                    AsyncImage(
                                        model = g.url,
                                        contentDescription = g.nama,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .weight(1f)
                                            .aspectRatio(1f)
                                            .clip(MkShapes.md)
                                            .background(color = warna.fill1),
                                    )
                                }
                                repeat(3 - barisGambar.size) { Spacer(modifier = Modifier.weight(1f)) }
                            }
                        }
                    }
                    bukti.berkas.forEach { b ->
                        MkLampiranRow(namaBerkas = b.nama, ukuranLabel = b.ukuran)
                    }
                }
            }
        }
    }
}

/** Kerangka memuat seukuran isi: kepala + dua seksi lima baris. */
@Composable
private fun KerangkaMeja() {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MkSkeleton(tinggi = 14.dp, lebar = 220.dp)
            MkSkeleton(tinggi = 34.dp)
            MkSkeleton(tinggi = 18.dp, lebar = 240.dp)
        }
        repeat(2) {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkSkeleton(tinggi = 22.dp, lebar = 160.dp)
                repeat(3) { MkSkeleton(tinggi = 56.dp) }
            }
        }
    }
}

/** Kerangka rincian di sheet: lencana + baris info + progres + grid bukti. */
@Composable
private fun KerangkaRincian() {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
        MkSkeleton(tinggi = 24.dp, lebar = 120.dp)
        repeat(3) { MkSkeleton(tinggi = 16.dp) }
        MkSkeleton(tinggi = 22.dp, lebar = 100.dp)
        MkSkeleton(tinggi = 8.dp)
        MkSkeleton(tinggi = 22.dp, lebar = 140.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            repeat(3) { MkSkeleton(tinggi = 96.dp, lebar = 96.dp) }
        }
    }
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

@PreviewGanda
@Composable
private fun MejaKerjaAdminSiapPreview() {
    val meja = MejaAdminKerja(
        konteks = "Kamis, 8 Oktober 2026 · M41 2026",
        jawaban = "3 dari 4 pelapor sudah melapor.",
        harian = listOf(
            BarisPelapor(
                jenis = JenisLaporan.HARIAN,
                idProyek = "p1",
                idDivisi = "",
                idLaporan = "rpt-1",
                judul = "SIM RS Bhakti Rahayu",
                sub = "BRH-01 · PIC Rani Kusuma · dikirim 08.15 WIB · 2 bukti",
                status = StatusAntrean.BARU,
            ),
            BarisPelapor(
                jenis = JenisLaporan.HARIAN,
                idProyek = "p2",
                idDivisi = "",
                idLaporan = "rpt-2",
                judul = "Klaim Payer",
                sub = "KLP-03 · PIC Dewi Lestari · dikirim 09.02 WIB · 4 bukti",
                status = StatusAntrean.DITERUSKAN,
            ),
        ),
        mingguan = listOf(
            BarisPelapor(
                jenis = JenisLaporan.MINGGUAN,
                idProyek = "",
                idDivisi = "d1",
                idLaporan = "wk-1",
                judul = "Operasional",
                sub = "Kadiv Budi Santoso · diserahkan 09.12 WIB · 12 item",
                status = StatusAntrean.BARU,
                statusHeader = "DISETUJUI",
            ),
        ),
    )
    MKTheme {
        MejaKerjaAdminScreen(state = MejaKerjaAdminUiState.Siap(meja))
    }
}

@PreviewGanda
@Composable
private fun MejaKerjaAdminMemuatPreview() {
    MKTheme {
        MejaKerjaAdminScreen(state = MejaKerjaAdminUiState.Memuat)
    }
}
