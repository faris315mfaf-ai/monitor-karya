// Layar Tim kepala divisi (T6-C6 Fase 2): daftar anggota divisi dengan
// StatusBadge laporan hari ini (padanan TeamDailyCard + ReportBadge web).
// Detail ringkas per orang dibuka di MkSheet — tidak pindah halaman.
// Kerangka saat memuat, ErrorNote saat galat, EmptyNote saat tanpa divisi/
// tanpa anggota. Teks bahasa Indonesia, tombol = kata kerja + objek.
package id.co.monitorkarya.app.ui.tim

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.hilt.navigation.compose.hiltViewModel
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.theme.MkShapes
import kotlinx.coroutines.delay
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
import id.co.monitorkarya.app.ui.luring.BannerLuring
import id.co.monitorkarya.app.ui.luring.ingatWaktuMuat
import id.co.monitorkarya.app.ui.luring.TarikSegarkan
import id.co.monitorkarya.app.ui.luring.rememberStatusLuring
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkListRow
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
    // Penanda offline-first bersama (app/ui/luring, A1-LURING.md §5).
    val luring by rememberStatusLuring()
    val tersimpanPada = ingatWaktuMuat(state as? TimUiState.Siap)
    val terpilih by vm.terpilih.collectAsStateWithLifecycle()
    val sibuk by vm.sibuk.collectAsStateWithLifecycle()
    val pesan by vm.pesan.collectAsStateWithLifecycle()
    val menyegarkan by vm.menyegarkan.collectAsStateWithLifecycle()
    // E2E-R2 N3: tab Divisi tampil lagi → muat ulang diam-diam.
    LaunchedEffect(vm) { vm.saatTampil() }
    // Ringkasan mingguan untuk Direktur (E2E-1 #1): VM baru dibuat saat Sheet
    // pertama kali dibuka, dan memuat ulang setiap kali dibuka.
    var ringkasanTerbuka by rememberSaveable { mutableStateOf(false) }
    TimScreen(
        state = state,
        terpilih = terpilih,
        offline = offline || luring.luring,
        tersimpanPadaMs = tersimpanPada ?: luring.terakhirSinkronMs,
        sibuk = sibuk,
        pesan = pesan,
        onUlang = vm::ulang,
        onPilih = vm::pilih,
        onIngatkan = vm::ingatkan,
        onTandaiDibaca = vm::tandaiDibaca,
        onAturKehadiran = vm::aturKehadiran,
        onUrungkan = vm::urungkan,
        onPesanTampil = vm::pesanTampil,
        onBukaRingkasan = { ringkasanTerbuka = true },
        menyegarkan = menyegarkan,
        onSegarkan = vm::segarkan,
        modifier = modifier,
    )
    if (ringkasanTerbuka) {
        val divisiId = (state as? TimUiState.Siap)?.tim?.divisiId
        val rvm: RingkasanDirekturViewModel = hiltViewModel()
        LaunchedEffect(Unit) { rvm.muat(divisiId) }
        RingkasanDirekturSheet(vm = rvm, terlihat = true, onTutup = { ringkasanTerbuka = false })
    }
}

/** Versi status murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Suppress("LongParameterList")
@Composable
fun TimScreen(
    state: TimUiState,
    terpilih: String? = null,
    offline: Boolean = false,
    /** Kapan data layar dimuat — banner "Luring · data tersimpan HH.MM". */
    tersimpanPadaMs: Long? = null,
    sibuk: String? = null,
    pesan: PesanTim? = null,
    onUlang: () -> Unit = {},
    onPilih: (String?) -> Unit = {},
    onIngatkan: (String) -> Unit = {},
    onTandaiDibaca: (String) -> Unit = {},
    onAturKehadiran: (String, String) -> Unit = { _, _ -> },
    onUrungkan: (UrungkanTim) -> Unit = {},
    onPesanTampil: () -> Unit = {},
    onBukaRingkasan: () -> Unit = {},
    menyegarkan: Boolean = false,
    onSegarkan: () -> Unit = onUlang,
    modifier: Modifier = Modifier,
) {
    val snackbar = remember { SnackbarHostState() }
    val sheetTerbuka = (state as? TimUiState.Siap)?.tim?.anggota?.any { it.id == terpilih } == true
    // Pesan tampil sebagai snackbar saat Sheet tertutup; saat Sheet terbuka pesan
    // ditampilkan di dalam Sheet (snackbar layar tertutup jendela Sheet).
    LaunchedEffect(pesan?.id, sheetTerbuka) {
        val p = pesan ?: return@LaunchedEffect
        if (sheetTerbuka) return@LaunchedEffect
        val hasil = snackbar.showSnackbar(
            message = p.teks,
            actionLabel = if (p.urungkan != null) "Urungkan" else null,
            duration = if (p.urungkan != null) SnackbarDuration.Long else SnackbarDuration.Short,
        )
        if (hasil == SnackbarResult.ActionPerformed) p.urungkan?.let(onUrungkan)
        onPesanTampil()
    }
    Box(modifier = modifier.fillMaxSize()) {
        // E2E-R2 N3: tarik ke bawah memuat ulang meja tim.
        TarikSegarkan(menyegarkan = menyegarkan, onSegarkan = onSegarkan) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            if (offline) BannerLuring(modifier = Modifier.fillMaxWidth(), tersimpanPadaMs = tersimpanPadaMs, onCobaLagi = onUlang)
            when (state) {
                TimUiState.Memuat -> repeat(4) { MkSkeleton(modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)) }
                is TimUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
                is TimUiState.Siap -> IsiTim(
                    tim = state.tim,
                    terpilih = terpilih,
                    sibuk = sibuk,
                    pesan = pesan.takeIf { sheetTerbuka },
                    onPilih = onPilih,
                    onIngatkan = onIngatkan,
                    onTandaiDibaca = onTandaiDibaca,
                    onAturKehadiran = onAturKehadiran,
                    onUrungkan = onUrungkan,
                    onPesanTampil = onPesanTampil,
                    onBukaRingkasan = onBukaRingkasan,
                )
            }
        }
        }
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

// ------------------------------------------------------------------
// Tingkat 1 — kartu "Laporan harian tim" + kartu ringkasan Direktur
// ------------------------------------------------------------------

@Suppress("LongParameterList")
@Composable
private fun IsiTim(
    tim: TimUi,
    terpilih: String?,
    sibuk: String?,
    pesan: PesanTim?,
    onPilih: (String?) -> Unit,
    onIngatkan: (String) -> Unit,
    onTandaiDibaca: (String) -> Unit,
    onAturKehadiran: (String, String) -> Unit,
    onUrungkan: (UrungkanTim) -> Unit,
    onPesanTampil: () -> Unit,
    onBukaRingkasan: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (tim.divisiId == null) {
        // buildTeam null → akun bukan kepala divisi (padanan Guard web).
        EmptyNote(teks = "Anda belum tercatat sebagai kepala divisi mana pun.")
        return
    }
    // Satu wadah penuh lebar: kepala kartu dan baris anggota dipisah garis 1px
    // (keputusan pemilik 9 Okt 2026), bukan kartu berjarak.
    MkCard(modifier = modifier.fillMaxWidth(), padding = MkSpacing.space1) {
        KolomKepalaKartu(
            tim = tim,
            modifier = Modifier.padding(horizontal = MkSpacing.space4, vertical = MkSpacing.space3),
        )
        MkDivider()
        if (tim.anggota.isEmpty()) {
            EmptyNote(
                teks = "Belum ada anggota di divisi ${tim.divisiNama.orEmpty()}. " +
                    "Tambahkan anggota atau tautkan proyek ke divisi ini.",
            )
        } else {
            val urut = tim.anggota.sortedWith(
                compareBy({ URUT_LAPORAN[it.laporan] ?: 0 }, { it.nama }),
            )
            Column {
                urut.forEachIndexed { index, anggota ->
                    BarisAnggota(
                        anggota = anggota,
                        terkunci = tim.terkunci,
                        onBuka = { onPilih(anggota.id) },
                    )
                    if (index < urut.lastIndex) MkDivider()
                }
            }
        }
    }
    KartuRingkasanDirektur(onBuka = onBukaRingkasan)
    SheetAnggota(
        tim = tim,
        terpilih = terpilih,
        sibuk = sibuk,
        pesan = pesan,
        onTutup = { onPilih(null) },
        onIngatkan = onIngatkan,
        onTandaiDibaca = onTandaiDibaca,
        onAturKehadiran = onAturKehadiran,
        onUrungkan = onUrungkan,
        onPesanTampil = onPesanTampil,
    )
}

/** Jalur ke ringkasan mingguan untuk Direktur (WeeklySummaryCard web). */
@Composable
private fun KartuRingkasanDirektur(onBuka: () -> Unit) {
    val warna = LocalMkColors.current
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(text = "Laporan mingguan untuk Direktur", style = MkTypography.title3, color = warna.ink)
            Text(
                text = "Disusun otomatis dari laporan harian dan output. Periksa 1–3 poin capaian, lalu kirim ke Direktur.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            MkButton(
                label = "Buka ringkasan untuk Direktur",
                variant = MkButtonVariant.PRIMARY,
                onClick = onBuka,
            )
        }
    }
}

/** Judul + subjudul kartu: "x dari y masuk · tenggat 17.00 WIB" (label dari server). */
@Composable
private fun KolomKepalaKartu(tim: TimUi, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(
            text = "Laporan harian tim",
            style = MkTypography.title3,
            color = LocalMkColors.current.ink,
        )
        Text(
            text = teksTenggatTim(tim),
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
// Tingkat 2 — sheet per orang (aksi: ingatkan, tandai dibaca, kehadiran)
// ------------------------------------------------------------------

/** Sheet satu anggota (member-sheet.tsx): laporan, kehadiran, beban, isi hari ini + aksi. */
@Suppress("LongParameterList")
@Composable
private fun SheetAnggota(
    tim: TimUi,
    terpilih: String?,
    sibuk: String?,
    pesan: PesanTim?,
    onTutup: () -> Unit,
    onIngatkan: (String) -> Unit,
    onTandaiDibaca: (String) -> Unit,
    onAturKehadiran: (String, String) -> Unit,
    onUrungkan: (UrungkanTim) -> Unit,
    onPesanTampil: () -> Unit,
) {
    val anggota = tim.anggota.firstOrNull { it.id == terpilih }
    val slotPesan: (@Composable () -> Unit)? = if (pesan == null) {
        null
    } else {
        {
            PesanDalamSheet(
                pesan = pesan,
                onUrungkan = {
                    onPesanTampil()
                    pesan.urungkan?.let(onUrungkan)
                },
                onSelesai = onPesanTampil,
            )
        }
    }
    MkSheet(
        visible = anggota != null,
        onTutup = onTutup,
        judul = anggota?.nama ?: "",
        subjudul = anggota?.let { subjudulSheet(it, tim) },
        backLabel = "Tim",
        galat = slotPesan,
        footer = {
            val isi = anggota
            if (isi != null) when (val aksi = aksiUtamaAnggota(isi, tim.terkunci)) {
                AksiAnggota.TandaiDibaca -> MkButton(
                    label = if (sibuk == "baca") "Menandai…" else "Tandai sudah dibaca",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = sibuk == null,
                    modifier = Modifier.weight(1f),
                    onClick = { onTandaiDibaca(isi.id) },
                )
                is AksiAnggota.Ingatkan -> MkButton(
                    label = if (sibuk == "ingatkan") "Mengingatkan…" else aksi.label,
                    variant = MkButtonVariant.PRIMARY,
                    enabled = aksi.aktif && sibuk == null,
                    modifier = Modifier.weight(1f),
                    onClick = { onIngatkan(isi.id) },
                )
                AksiAnggota.Tutup -> MkButton(label = "Tutup", modifier = Modifier.weight(1f), onClick = onTutup)
            }
        },
    ) {
        val isi = anggota ?: return@MkSheet
        IsiSheetAnggota(
            anggota = isi,
            terkunci = tim.terkunci,
            sibuk = sibuk,
            onAturKehadiran = { onAturKehadiran(isi.id, it) },
        )
    }
}

/** "Manager / PIC proyek · 2 proyek" — padanan subtitle member-sheet.tsx. */
private fun subjudulSheet(anggota: AnggotaUi, tim: TimUi): String {
    val peran = anggota.jabatan ?: anggota.peran
    val proyek = if (anggota.proyek.isNotEmpty()) "${anggota.proyek.size} proyek" else "Tanpa proyek"
    val divisi = tim.divisiNama?.let { "Divisi $it" }
    return listOfNotNull(divisi, peran, proyek).joinToString(" · ")
}

/** Pesan hasil aksi di dalam Sheet (+ Urungkan), hilang sendiri setelah 8 detik. */
@Composable
private fun PesanDalamSheet(pesan: PesanTim, onUrungkan: () -> Unit, onSelesai: () -> Unit) {
    val warna = LocalMkColors.current
    LaunchedEffect(pesan.id) {
        delay(8_000)
        onSelesai()
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(color = warna.fill1, shape = MkShapes.md)
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space2)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Text(text = pesan.teks, style = MkTypography.footnote, color = warna.ink, modifier = Modifier.weight(1f))
        if (pesan.urungkan != null) {
            MkButton(label = "Urungkan", variant = MkButtonVariant.PLAIN, size = MkButtonSize.S, onClick = onUrungkan)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IsiSheetAnggota(
    anggota: AnggotaUi,
    terkunci: Boolean,
    sibuk: String?,
    onAturKehadiran: (String) -> Unit,
) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
        // Laporan harian hari ini + status baca kepala divisi.
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(
                text = "Laporan harian hari ini",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            val (status, teks) = lencanaLaporan(anggota, terkunci)
            StatusBadge(status = status, text = teks)
            if (anggota.laporan == LaporanAnggota.TERKIRIM) {
                val baca = jamWib(anggota.dibacaIso)?.let { "Sudah Anda baca $it" } ?: "Belum Anda baca"
                Text(text = "$baca · dikirim ke Admin PT", style = MkTypography.caption, color = warna.ink2)
            }
        }

        // Kehadiran hari ini (POST /api/attendance; Urungkan lewat pesan).
        KolomJudul("Kehadiran hari ini") {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                STATUS_KEHADIRAN.forEach { kode ->
                    MkChip(
                        label = labelKehadiran(kode),
                        selected = (anggota.kehadiran ?: "HADIR") == kode,
                        enabled = sibuk == null,
                        onClick = { onAturKehadiran(kode) },
                    )
                }
            }
            Text(
                text = "Orang yang cuti, sakit, atau izin tidak dihitung di laporan harian tim.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }

        // Beban kerja minggu ini.
        KolomJudul("Beban kerja minggu ini") {
            Text(
                text = if (anggota.bebanPersen == null) {
                    "Tidak ada sisa hari kerja minggu ini."
                } else {
                    "${anggota.bebanPersen}% · ${anggota.tugasTerbuka} task terbuka · sisa ${Math.round(anggota.sisaMenit / 60f)} jam"
                },
                style = MkTypography.body,
                color = warna.ink,
            )
        }

        // Dikerjakan hari ini (capaian laporan + task hari ini).
        KolomJudul("Dikerjakan hari ini") {
            if (anggota.capaian.isEmpty() && anggota.tugas.isEmpty()) {
                TeksKosong("Belum ada task untuk hari ini.")
            }
            anggota.capaian.forEach { capaian ->
                Text(text = "• $capaian", style = MkTypography.body, color = warna.ink)
            }
            anggota.tugas.forEach { t ->
                MkListRow(
                    judul = t.judul,
                    sub = "${t.proyek} · ${t.progres}%",
                    trailing = {
                        StatusBadge(status = statusTugas(t.status), text = labelStatusTugas(t.status), size = MkBadgeSize.SM)
                    },
                )
            }
        }

        // Kendala hari ini.
        KolomJudul("Kendala") {
            if (anggota.kendala.isEmpty()) {
                TeksKosong("Tidak ada kendala yang dicatat hari ini.")
            } else {
                anggota.kendala.forEach { kendala ->
                    Text(text = "• $kendala", style = MkTypography.body, color = warna.ink)
                }
            }
        }

        // Rencana besok.
        KolomJudul("Rencana besok") {
            if (anggota.rencana.isEmpty()) {
                TeksKosong("Belum ada rencana yang dicatat.")
            } else {
                anggota.rencana.forEach { r ->
                    Text(text = "• $r", style = MkTypography.body, color = warna.ink)
                }
            }
        }
    }
}

/** TASK_STATUS_LABEL web. */
internal fun labelStatusTugas(status: String): String = when (status) {
    "BELUM_MULAI" -> "Belum mulai"
    "BERJALAN" -> "Berjalan"
    "SELESAI" -> "Selesai"
    "TERKENDALA" -> "Terkendala"
    "MENUNGGU_KEPUTUSAN" -> "Menunggu keputusan"
    else -> status
}

/** Warna status task (member-sheet.tsx). */
internal fun statusTugas(status: String): MkStatus = when (status) {
    "SELESAI" -> MkStatus.DONE
    "TERKENDALA" -> MkStatus.LATE
    "BELUM_MULAI" -> MkStatus.NEUTRAL
    else -> MkStatus.ON
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
