// Layar Tim kepala divisi (T6-C6 Fase 2): daftar anggota divisi dengan
// StatusBadge laporan hari ini (padanan TeamDailyCard + ReportBadge web).
// Detail ringkas per orang dibuka di MkSheet — tidak pindah halaman.
// Kerangka saat memuat, ErrorNote saat galat, EmptyNote saat tanpa divisi/
// tanpa anggota. Teks bahasa Indonesia, tombol = kata kerja + objek.
package id.co.monitorkarya.app.ui.tim

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOfflineBanner
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun TimScreen(
    vm: TimViewModel,
    offline: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val terpilih by vm.terpilih.collectAsStateWithLifecycle()
    TimScreen(
        state = state,
        terpilih = terpilih,
        offline = offline,
        onUlang = vm::ulang,
        onPilih = vm::pilih,
        modifier = modifier,
    )
}

/** Versi status murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Composable
fun TimScreen(
    state: TimUiState,
    terpilih: String? = null,
    offline: Boolean = false,
    onUlang: () -> Unit = {},
    onPilih: (String?) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MkSpacing.space5, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        if (offline) MkOfflineBanner(modifier = Modifier.fillMaxWidth(), terlihat = true, onCobaLagi = onUlang)
        when (state) {
            TimUiState.Memuat -> repeat(4) { MkSkeleton(modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)) }
            is TimUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
            is TimUiState.Siap -> IsiTim(tim = state.tim, terpilih = terpilih, onPilih = onPilih)
        }
    }
}

// ------------------------------------------------------------------
// Tingkat 1 — kartu "Laporan harian tim"
// ------------------------------------------------------------------

@Composable
private fun IsiTim(
    tim: TimUi,
    terpilih: String?,
    onPilih: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (tim.divisiId == null) {
        // buildTeam null → akun bukan kepala divisi (padanan Guard web).
        EmptyNote(teks = "Anda belum tercatat sebagai kepala divisi mana pun.")
        return
    }
    MkCard(modifier = modifier.fillMaxWidth()) {
        KolomKepalaKartu(tim)
        if (tim.anggota.isEmpty()) {
            EmptyNote(
                teks = "Belum ada anggota di divisi ${tim.divisiNama.orEmpty()}. " +
                    "Tambahkan anggota atau tautkan proyek ke divisi ini.",
            )
        } else {
            val urut = tim.anggota.sortedWith(
                compareBy({ URUT_LAPORAN[it.laporan] ?: 0 }, { it.nama }),
            )
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                urut.forEach { anggota ->
                    BarisAnggota(
                        anggota = anggota,
                        terkunci = tim.terkunci,
                        onBuka = { onPilih(anggota.id) },
                    )
                }
            }
        }
    }
    SheetAnggota(tim = tim, terpilih = terpilih, onTutup = { onPilih(null) })
}

/** Judul + subjudul kartu: "x dari y masuk · tenggat 17.00". */
@Composable
private fun KolomKepalaKartu(tim: TimUi) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(
            text = "Laporan harian tim",
            style = MkTypography.title3,
            color = LocalMkColors.current.ink,
        )
        val masuk = if (tim.wajibLapor > 0) {
            "${tim.sudahMasuk} dari ${tim.wajibLapor} masuk · "
        } else {
            ""
        }
        Text(
            text = "${masuk}tenggat ${tim.tenggatLabel ?: "17.00"} WIB",
            style = MkTypography.footnote,
            color = LocalMkColors.current.ink2,
        )
    }
}

/** Satu baris anggota: nama · peran/jabatan + proyek, lencana lapor hari ini. */
@Composable
private fun BarisAnggota(
    anggota: AnggotaUi,
    terkunci: Boolean,
    onBuka: () -> Unit,
) {
    val sub = bangunSubAnggota(anggota)
    MkListRow(
        judul = anggota.nama,
        sub = sub.takeIf { it.isNotEmpty() },
        inisial = anggota.inisial,
        trailing = {
            val (status, teks) = lencanaLaporan(anggota, terkunci)
            StatusBadge(status = status, text = teks, size = MkBadgeSize.SM)
        },
        onClick = onBuka,
    )
}

/** "PIC proyek · SIM RS Bhakti Rahayu, MEDPAY" — padanan baris web. */
private fun bangunSubAnggota(anggota: AnggotaUi): String {
    val peran = anggota.jabatan ?: anggota.peran ?: ""
    return listOf(peran, anggota.proyek.joinToString(", ")).filter { it.isNotEmpty() }.joinToString(" · ")
}

/**
 * Lencana laporan hari ini (port ReportBadge parts.tsx): Terkirim HH.mm /
 * Diingatkan HH.mm / "x dari y masuk" / Belum masuk / label kehadiran /
 * Tidak wajib lapor. Warna+ikon+kata selalu bersama via StatusBadge.
 */
internal fun lencanaLaporan(anggota: AnggotaUi, terkunci: Boolean): Pair<MkStatus, String> = when (anggota.laporan) {
    LaporanAnggota.ABSEN -> MkStatus.NEUTRAL to labelKehadiran(anggota.kehadiran)
    LaporanAnggota.TIDAK_WAJIB -> MkStatus.NEUTRAL to "Tidak wajib lapor"
    LaporanAnggota.TERKIRIM -> MkStatus.DONE to "Terkirim ${jamWib(anggota.dikirimIso) ?: "hari ini"}"
    else -> {
        // BELUM: sudah diingatkan → Diingatkan; sebagian → "x dari y masuk".
        jamWib(anggota.diingatkanIso)?.let { jam ->
            (if (terkunci) MkStatus.LATE else MkStatus.RISK) to "Diingatkan $jam"
        } ?: run {
            val status = if (terkunci) MkStatus.LATE else MkStatus.RISK
            val teks = if (anggota.wajibLapor > 1 && anggota.sudahMasuk > 0) {
                "${anggota.sudahMasuk} dari ${anggota.wajibLapor} masuk"
            } else {
                "Belum masuk"
            }
            status to teks
        }
    }
}

// ------------------------------------------------------------------
// Tingkat 2 — sheet ringkas per orang (opsional, baca-saja)
// ------------------------------------------------------------------

/** Sheet ringkas satu anggota: laporan hari ini, capaian, kendala, beban kerja. */
@Composable
private fun SheetAnggota(
    tim: TimUi,
    terpilih: String?,
    onTutup: () -> Unit,
) {
    val anggota = tim.anggota.firstOrNull { it.id == terpilih }
    MkSheet(
        visible = anggota != null,
        onTutup = onTutup,
        judul = anggota?.nama ?: "",
        subjudul = anggota?.let { bangunSubAnggota(it).ifEmpty { null } },
        backLabel = "Tim",
        footer = {
            MkButton(label = "Tutup", onClick = onTutup)
        },
    ) {
        val isi = anggota ?: return@MkSheet
        IsiSheetAnggota(anggota = isi, terkunci = tim.terkunci)
    }
}

@Composable
private fun IsiSheetAnggota(anggota: AnggotaUi, terkunci: Boolean) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
        // Laporan harian hari ini.
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(
                text = "Laporan harian hari ini",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            val (status, teks) = lencanaLaporan(anggota, terkunci)
            StatusBadge(status = status, text = teks)
        }

        // Beban kerja minggu ini.
        KolomJudul("Beban kerja minggu ini") {
            Text(
                text = if (anggota.bebanPersen == null) {
                    "Tidak ada sisa hari kerja minggu ini."
                } else {
                    "${anggota.bebanPersen}% · ${anggota.tugasTerbuka} task terbuka"
                },
                style = MkTypography.body,
                color = warna.ink,
            )
        }

        // Capaian hari ini (dari laporan yang sudah masuk).
        KolomJudul("Capaian hari ini") {
            if (anggota.capaian.isEmpty()) {
                TeksKosong("Belum ada capaian yang tercatat hari ini.")
            } else {
                anggota.capaian.forEach { capaian ->
                    Text(
                        text = "• $capaian",
                        style = MkTypography.body,
                        color = warna.ink,
                    )
                }
            }
        }

        // Kendala hari ini.
        KolomJudul("Kendala") {
            if (anggota.kendala.isEmpty()) {
                TeksKosong("Tidak ada kendala yang dicatat hari ini.")
            } else {
                anggota.kendala.forEach { kendala ->
                    Text(
                        text = "• $kendala",
                        style = MkTypography.body,
                        color = warna.ink,
                    )
                }
            }
        }
    }
}

/** Bagian sheet: judul headline + isi. */
@Composable
private fun KolomJudul(
    judul: String,
    isi: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Text(
            text = judul,
            style = MkTypography.headline,
            color = LocalMkColors.current.ink,
        )
        isi()
    }
}

@Composable
private fun TeksKosong(teks: String) {
    Text(
        text = teks,
        style = MkTypography.footnote,
        color = LocalMkColors.current.ink2,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

// ------------------------------------------------------------------
// Waktu WIB (padanan formatTime web — "HH.mm", pemisah titik)
// ------------------------------------------------------------------

private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val formatJam = DateTimeFormatter.ofPattern("HH.mm").withZone(WIB)

/** ISO → "HH.mm" WIB; null bila ISO kosong/rusak. */
internal fun jamWib(iso: String?): String? =
    iso?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { formatJam.format(it) }

/** Urutan tampil baris: belum dulu (perlu tindakan), lalu terkirim, absen, tidak wajib. */
private val URUT_LAPORAN: Map<LaporanAnggota, Int> = mapOf(
    LaporanAnggota.BELUM to 0,
    LaporanAnggota.TERKIRIM to 1,
    LaporanAnggota.ABSEN to 2,
    LaporanAnggota.TIDAK_WAJIB to 3,
)

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun TimScreenSiapPreview() {
    MKTheme {
        TimScreen(
            state = TimUiState.Siap(
                tim = TimUi(
                    divisiId = "div-1",
                    divisiNama = "Teknologi",
                    tenggatLabel = "17.00",
                    terkunci = false,
                    sudahMasuk = 2,
                    wajibLapor = 3,
                    anggota = listOf(
                        AnggotaUi(
                            id = "u1",
                            nama = "Rani Kusuma",
                            jabatan = null,
                            peran = "Manager / PIC proyek",
                            inisial = "RK",
                            kehadiran = "HADIR",
                            proyek = listOf("SIM RS Bhakti Rahayu"),
                            laporan = LaporanAnggota.TERKIRIM,
                            wajibLapor = 1,
                            sudahMasuk = 1,
                            dikirimIso = "2026-10-08T03:41:00.000Z",
                            diingatkanIso = null,
                            bebanPersen = 74,
                            tugasTerbuka = 5,
                            capaian = listOf("Migrasi data gudang selesai 80%"),
                            kendala = emptyList(),
                        ),
                        AnggotaUi(
                            id = "u2",
                            nama = "Bimo Prakoso",
                            jabatan = "Staf pelaksana",
                            peran = null,
                            inisial = "BP",
                            kehadiran = "HADIR",
                            proyek = listOf("MEDPAY", "Klinik Sehat"),
                            laporan = LaporanAnggota.BELUM,
                            wajibLapor = 2,
                            sudahMasuk = 1,
                            dikirimIso = null,
                            diingatkanIso = null,
                            bebanPersen = 112,
                            tugasTerbuka = 9,
                            capaian = emptyList(),
                            kendala = listOf("Menunggu keputusan perizinan"),
                        ),
                        AnggotaUi(
                            id = "u3",
                            nama = "Citra Larasati",
                            jabatan = null,
                            peran = "Manager / PIC proyek",
                            inisial = "CL",
                            kehadiran = "CUTI",
                            proyek = emptyList(),
                            laporan = LaporanAnggota.ABSEN,
                            wajibLapor = 0,
                            sudahMasuk = 0,
                            dikirimIso = null,
                            diingatkanIso = null,
                            bebanPersen = null,
                            tugasTerbuka = 0,
                            capaian = emptyList(),
                            kendala = emptyList(),
                        ),
                    ),
                ),
            ),
        )
    }
}

@PreviewGanda
@Composable
private fun TimScreenMemuatPreview() {
    MKTheme { TimScreen(state = TimUiState.Memuat) }
}

@PreviewGanda
@Composable
private fun TimScreenGalatPreview() {
    MKTheme { TimScreen(state = TimUiState.Galat("Data tim belum termuat. Periksa koneksi Anda lalu coba lagi.")) }
}

@PreviewGanda
@Composable
private fun TimScreenKosongPreview() {
    MKTheme {
        TimScreen(
            state = TimUiState.Siap(
                tim = TimUi(
                    divisiId = null,
                    divisiNama = null,
                    tenggatLabel = null,
                    terkunci = false,
                    sudahMasuk = 0,
                    wajibLapor = 0,
                    anggota = emptyList(),
                ),
            ),
        )
    }
}
