// Layar Meja kerja PIC (T5-B4 Fase 1) — padanan PicDeskView web
// (src/components/work-desk/pic-desk.tsx) versi ponsel Fase 1:
// satu kalimat jawaban "Ada n tugas hari ini, m selesai." + ringkasan tenggat/
// laporan/pengingat, kartu ringkas StatTile "Tugas selesai x dari y" dengan dua
// tombol cepat ("Isi laporan harian" primer → onBukaLaporan, "Kelola tugas"
// sekunder → onBukaTugas), lalu daftar tugas hari ini (MkListRow + StatusBadge).
// Detail tugas/laporan dibuka layar tujuannya — baris tugas hanya membawa ke
// kelola tugas, tidak berpindah halaman sendiri.
//
// Kontrak T5-B8 (MKShell.kt): MejaKerjaScreen(vm, onBukaLaporan, onBukaTugas).
package id.co.monitorkarya.app.ui.mejakerja

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.R
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import kotlin.math.roundToInt

// ------------------------------------------------------------------
// Titik masuk
// ------------------------------------------------------------------

/**
 * Versi ber-ViewModel untuk MKShell.
 *
 * @param vm ViewModel meja kerja (Hilt).
 * @param onBukaLaporan dipanggil tombol cepat "Isi laporan harian" (tab laporan harian).
 * @param onBukaTugas dipanggil tombol cepat "Kelola tugas" dan baris tugas.
 */
@Composable
fun MejaKerjaScreen(
    vm: MejaKerjaViewModel,
    onBukaLaporan: () -> Unit,
    onBukaTugas: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    MejaKerjaScreen(
        state = state,
        onUlang = vm::ulang,
        onBukaLaporan = onBukaLaporan,
        onBukaTugas = onBukaTugas,
        modifier = modifier,
    )
}

/** Versi status murni — mudah dipratinjau tanpa ViewModel. */
@Composable
fun MejaKerjaScreen(
    state: MejaKerjaUiState,
    onUlang: () -> Unit = {},
    onBukaLaporan: () -> Unit = {},
    onBukaTugas: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    when (state) {
        MejaKerjaUiState.Memuat -> KerangkaMejaKerja(modifier = modifier)
        is MejaKerjaUiState.Galat -> Box(modifier = modifier.fillMaxSize()) {
            ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
        }
        is MejaKerjaUiState.Sukses -> IsiMejaKerja(
            data = state.data,
            onBukaLaporan = onBukaLaporan,
            onBukaTugas = onBukaTugas,
            modifier = modifier,
        )
    }
}

// ------------------------------------------------------------------
// Kerangka pemuatan
// ------------------------------------------------------------------

/** Skeleton layar: kepala + kartu ringkas + empat baris tugas. */
@Composable
private fun KerangkaMejaKerja(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = MkSpacing.space5, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkSkeleton(tinggi = 24.dp, lebar = 160.dp)
                MkSkeleton(tinggi = 16.dp)
                MkSkeleton(tinggi = 14.dp, lebar = 260.dp)
            }
        }
        item { MkSkeleton(tinggi = 168.dp) }
        repeat(4) {
            item { MkSkeleton(tinggi = 56.dp) }
        }
    }
}

// ------------------------------------------------------------------
// Isi utama
// ------------------------------------------------------------------

@Composable
private fun IsiMejaKerja(
    data: MejaKerjaData,
    onBukaLaporan: () -> Unit,
    onBukaTugas: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = MkSpacing.space5, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        // Kepala: judul layar (t-title-3) + satu kalimat jawaban + ringkasan.
        item {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                Text(
                    text = stringResource(R.string.layar_meja_kerja),
                    style = MkTypography.title3,
                    color = warna.ink,
                )
                Text(text = kalimatJawaban(data), style = MkTypography.body, color = warna.ink)
                teksRingkasan(data)?.let {
                    Text(text = it, style = MkTypography.footnote, color = warna.ink2)
                }
            }
        }
        // Tanpa proyek aktif hanya ada catatan kosong (padanan PicDeskView) —
        // KPI dan tombol cepat tidak bermakna tanpa proyek.
        if (!data.proyekKosong) {
            item {
                KartuRingkas(data = data, onBukaLaporan = onBukaLaporan, onBukaTugas = onBukaTugas)
            }
        }
        when {
            data.proyekKosong -> item {
                MkCard(modifier = Modifier.fillMaxWidth()) {
                    EmptyNote(
                        teks = "Belum ada proyek aktif yang Anda pegang. Hubungi Admin PT bila ini keliru.",
                    )
                }
            }
            data.tugas.isEmpty() -> item {
                MkCard(modifier = Modifier.fillMaxWidth()) {
                    EmptyNote(teks = "Belum ada tugas untuk hari ini. Tambahkan dari kelola tugas bila ada pekerjaan yang dikerjakan.")
                }
            }
            else -> {
                item {
                    Text(
                        text = "Tugas hari ini",
                        style = MkTypography.callout,
                        color = warna.ink2,
                    )
                }
                item {
                    MkCard(
                        modifier = Modifier.fillMaxWidth(),
                        padding = MkSpacing.space1,
                    ) {
                        Column {
                            data.tugas.forEach { tugas ->
                                BarisTugas(tugas = tugas, onBuka = onBukaTugas)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Kartu ringkas: StatTile "Tugas selesai x dari y" + dua tombol cepat. */
@Composable
private fun KartuRingkas(
    data: MejaKerjaData,
    onBukaLaporan: () -> Unit,
    onBukaTugas: () -> Unit,
) {
    val semuaSelesai = data.tugasTotal > 0 && data.tugasSelesai == data.tugasTotal
    val persen = if (data.tugasTotal > 0) {
        (data.tugasSelesai * 100.0 / data.tugasTotal).roundToInt()
    } else {
        0
    }
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            StatTile(
                modifier = Modifier.fillMaxWidth(),
                label = "Tugas selesai",
                value = "${data.tugasSelesai} dari ${data.tugasTotal}",
                delta = if (data.tugasTotal > 0) {
                    "$persen% hari ini"
                } else {
                    "Tambahkan tugas hari ini"
                },
                tone = if (semuaSelesai) MkStatus.ON else null,
            )
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                // Terkunci lewat 17.00 WIB dan masih ada yang belum dikirim:
                // laporan hari itu tidak bisa diisi lagi (padanan PicDeskView).
                MkButton(
                    label = "Isi laporan harian",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !(data.terkunci && data.laporanBelumTerkirim > 0),
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onBukaLaporan,
                )
                MkButton(
                    label = "Kelola tugas",
                    variant = MkButtonVariant.SECONDARY,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onBukaTugas,
                )
            }
        }
    }
}

/** Baris satu tugas: judul, sub proyek · jam, lencana status (warna + ikon + kata). */
@Composable
private fun BarisTugas(tugas: TugasMeja, onBuka: () -> Unit) {
    MkListRow(
        judul = tugas.judul,
        sub = tugas.sub,
        trailing = {
            StatusBadge(
                status = mkStatusTugas(tugas.status),
                size = MkBadgeSize.SM,
                text = labelStatusTugas(tugas.status),
            )
        },
        onClick = onBuka,
    )
}

// ------------------------------------------------------------------
// Kosakata status & kalimat (murni — mudah diuji)
// ------------------------------------------------------------------

/**
 * Pemetaan status task → kosakata status desain (brief T5-B4):
 * BELUM_MULAI=NEUTRAL, BERJALAN=ON, SELESAI=DONE, TERKENDALA=RISK,
 * MENUNGGU_KEPUTUSAN=RISK (web memakai INFO; brief Fase 1 menetapkan RISK).
 */
internal fun mkStatusTugas(status: String): MkStatus = when (status) {
    "BELUM_MULAI" -> MkStatus.NEUTRAL
    "BERJALAN" -> MkStatus.ON
    "SELESAI" -> MkStatus.DONE
    "TERKENDALA", "MENUNGGU_KEPUTUSAN" -> MkStatus.RISK
    else -> MkStatus.NEUTRAL
}

/** Label Indonesia status task (padanan TASK_STATUS_META web). */
internal fun labelStatusTugas(status: String): String = when (status) {
    "BELUM_MULAI" -> "Belum mulai"
    "BERJALAN" -> "Berjalan"
    "SELESAI" -> "Selesai"
    "TERKENDALA" -> "Terkendala"
    "MENUNGGU_KEPUTUSAN" -> "Menunggu keputusan"
    else -> status
}

/** Satu kalimat jawaban di atas layar. */
internal fun kalimatJawaban(data: MejaKerjaData): String = when {
    data.proyekKosong -> "Belum ada proyek aktif yang Anda pegang."
    data.tugasTotal == 0 -> "Belum ada tugas untuk hari ini."
    else -> "Ada ${data.tugasTotal} tugas hari ini, ${data.tugasSelesai} selesai."
}

/** Ringkasan pendukung: tenggat, keadaan laporan, pengingat terakhir. */
internal fun teksRingkasan(data: MejaKerjaData): String? {
    if (data.proyekKosong) return null
    val tenggat = if (data.terkunci) {
        "Tenggat ${data.cutoffLabel} sudah lewat; laporan hari ini terkunci."
    } else {
        data.sisaTeks?.let { "Tenggat ${data.cutoffLabel}, $it lagi." } ?: "Tenggat ${data.cutoffLabel}."
    }
    val laporan = if (data.laporanBelumTerkirim > 0) {
        "${data.laporanBelumTerkirim} dari ${data.laporanTotal} laporan belum terkirim."
    } else {
        "Semua laporan hari ini sudah terkirim."
    }
    return (listOf(tenggat, laporan) + listOfNotNull(data.pengingatTeks?.let { "$it." }))
        .joinToString(separator = " ")
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

@PreviewGanda
@Composable
private fun MejaKerjaScreenSuksesPreview() {
    val data = MejaKerjaData(
        proyekKosong = false,
        tugasTotal = 4,
        tugasSelesai = 2,
        tugasTerkendala = 1,
        laporanTotal = 2,
        laporanBelumTerkirim = 1,
        terkunci = false,
        cutoffLabel = "17.00 WIB",
        sisaTeks = "2 jam 15 menit",
        pengingatTeks = "Admin PT mengingatkan pukul 09.12",
        tugas = listOf(
            TugasMeja(
                id = "t1",
                judul = "Uji modul izin cuti",
                sub = "SIM RS Bhakti Rahayu · 08.00–10.00 WIB",
                status = "SELESAI",
            ),
            TugasMeja(
                id = "t2",
                judul = "Revisi tampilan klaim",
                sub = "Aplikasi Klaim Medpay · 10.00–12.00 WIB",
                status = "BERJALAN",
            ),
            TugasMeja(
                id = "t3",
                judul = "Menunggu keputusan server staging",
                sub = "SIM RS Bhakti Rahayu",
                status = "MENUNGGU_KEPUTUSAN",
            ),
            TugasMeja(
                id = "t4",
                judul = "Menyiapkan data uji",
                sub = "Aplikasi Klaim Medpay · 13.00 WIB",
                status = "TERKENDALA",
            ),
        ),
    )
    MKTheme {
        MejaKerjaScreen(state = MejaKerjaUiState.Sukses(data))
    }
}

@PreviewGanda
@Composable
private fun MejaKerjaScreenMemuatPreview() {
    MKTheme {
        MejaKerjaScreen(state = MejaKerjaUiState.Memuat)
    }
}
