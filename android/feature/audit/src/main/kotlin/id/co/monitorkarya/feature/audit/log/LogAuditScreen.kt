// Layar Log aktivitas ponsel (08-auditor.md §Ponsel: daftar aktivitas dengan
// saringan di Sheet; ketuk baris membuka rincian di Sheet, bukan pindah halaman).
package id.co.monitorkarya.feature.audit.log

import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkSnackbarHost
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.audit.R
import id.co.monitorkarya.feature.audit.data.AuditLogDto
import id.co.monitorkarya.feature.audit.model.OPSI_AKSI
import id.co.monitorkarya.feature.audit.model.OPSI_SASARAN
import id.co.monitorkarya.feature.audit.model.angka
import id.co.monitorkarya.feature.audit.model.kunciBerubah
import id.co.monitorkarya.feature.audit.model.labelAksi
import id.co.monitorkarya.feature.audit.model.labelPeran
import id.co.monitorkarya.feature.audit.model.labelSasaran
import id.co.monitorkarya.feature.audit.model.labelTanggal
import id.co.monitorkarya.feature.audit.model.nadaAksi
import id.co.monitorkarya.feature.audit.model.teksJson
import id.co.monitorkarya.feature.audit.model.waktuWib
import id.co.monitorkarya.feature.audit.ui.JudulSeksi
import id.co.monitorkarya.feature.audit.ui.KepalaHalaman
import id.co.monitorkarya.feature.audit.ui.KotakKode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
internal fun LogAuditScreen(
    vm: LogAuditViewModel,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val saringan by vm.saringan.collectAsStateWithLifecycle()
    val terbuka by vm.terbuka.collectAsStateWithLifecycle()
    val mengekspor by vm.mengekspor.collectAsStateWithLifecycle()
    val pesan by vm.pesan.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val konteks = LocalContext.current
    var saringTerbuka by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(pesan) {
        pesan?.let {
            snackbar.showSnackbar(it.teks)
            vm.pesanTampil()
        }
    }

    // Unduh CSV: pengguna memilih lokasi berkas (SAF) — tanpa FileProvider/izin penyimpanan.
    val pembuatBerkas = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("text/csv"),
    ) { uri: Uri? ->
        if (uri != null) {
            val resolver = konteks.contentResolver
            vm.ekspor(
                keluaran = { resolver.openOutputStream(uri, "wt") },
                hapus = { runCatching { DocumentsContract.deleteDocument(resolver, uri) } },
            )
        }
    }
    val namaBerkas = stringResource(R.string.audit_ekspor_nama, Wib.hariIni().toString())

    Box(modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            item(key = "kepala") {
                KepalaHalaman(
                    judul = stringResource(R.string.audit_judul),
                    konteks = stringResource(R.string.audit_konteks),
                ) {
                    val siap = state as? LogAuditUiState.Siap
                    if (siap?.bolehEkspor == true) {
                        MkButton(
                            label = stringResource(if (mengekspor) R.string.audit_mengunduh else R.string.audit_unduh_csv),
                            onClick = { pembuatBerkas.launch(namaBerkas) },
                            size = MkButtonSize.S,
                            enabled = !mengekspor,
                        )
                    }
                }
            }
            item(key = "jawaban") {
                when (val s = state) {
                    is LogAuditUiState.Siap -> Text(
                        text = LogAuditViewModel.kalimatJawaban(s, saringan.aktif),
                        style = MkTypography.title3,
                        color = LocalMkColors.current.ink,
                    )
                    LogAuditUiState.Memuat -> MkSkeleton(tinggi = 26.dp, lebar = 220.dp)
                    is LogAuditUiState.Galat -> Unit
                }
            }
            item(key = "saring") {
                BarisSaring(
                    saringan = saringan,
                    onBuka = { saringTerbuka = true },
                    onHapus = vm::hapusSaringan,
                    onHapusPelaku = vm::hapusPelaku,
                )
            }
            // Isi CSV berbeda dari daftar bila saringan di luar tanggal/aksi aktif.
            val catatanCsv = LogAuditViewModel.catatanCsv(saringan)
            if ((state as? LogAuditUiState.Siap)?.bolehEkspor == true && catatanCsv != null) {
                item(key = "catatan-csv") {
                    Text(text = catatanCsv, style = MkTypography.footnote, color = LocalMkColors.current.ink2)
                }
            }
            when (val s = state) {
                LogAuditUiState.Memuat -> items(6, key = { "kerangka-$it" }) { MkSkeleton(tinggi = 56.dp) }
                is LogAuditUiState.Galat -> item(key = "galat") {
                    ErrorNote(pesan = s.pesan, onCobaLagi = vm::muat)
                }
                is LogAuditUiState.Siap -> if (s.items.isEmpty()) {
                    item(key = "kosong") {
                        EmptyNote(
                            teks = stringResource(
                                if (saringan.aktif) R.string.audit_kosong_saring else R.string.audit_kosong,
                            ),
                            teksAksi = if (saringan.aktif) stringResource(R.string.audit_hapus_saringan) else null,
                            onAksi = if (saringan.aktif) vm::hapusSaringan else null,
                        )
                    }
                } else {
                    items(s.items, key = { it.id }) { log ->
                        Column {
                            BarisLog(log = log, onClick = { vm.buka(log) })
                            MkDivider()
                        }
                    }
                    item(key = "kaki") { KakiDaftar(s, onMuatLagi = vm::muatLagi) }
                }
            }
        }
        MkSnackbarHost(
            snackbarHostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(MkSpacing.space4),
        )
    }

    if (saringTerbuka) {
        SheetSaring(
            awal = saringan,
            onTutup = { saringTerbuka = false },
            onTerapkan = {
                vm.terapkan(it)
                saringTerbuka = false
            },
        )
    }
    SheetRincian(log = terbuka, onTutup = vm::tutup, onSaringPelaku = vm::saringPelaku)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BarisSaring(
    saringan: SaringanAudit,
    onBuka: () -> Unit,
    onHapus: () -> Unit,
    onHapusPelaku: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MkButton(
                label = if (saringan.jumlah > 0) {
                    stringResource(R.string.audit_saring_n, saringan.jumlah)
                } else {
                    stringResource(R.string.audit_saring_log)
                },
                onClick = onBuka,
                size = MkButtonSize.S,
            )
            Box(Modifier.weight(1f))
            if (saringan.aktif) {
                MkButton(
                    label = stringResource(R.string.audit_hapus_saringan),
                    onClick = onHapus,
                    variant = MkButtonVariant.PLAIN,
                    size = MkButtonSize.S,
                )
            }
        }
        val nama = saringan.actorNama
        if (saringan.actorId != null) {
            val labelHapus = stringResource(R.string.audit_hapus_pelaku, nama.orEmpty())
            FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                Row(
                    Modifier
                        .semantics { contentDescription = labelHapus }
                        // Target sentuh minimum 48dp (C1-R7); chip sendiri 36dp.
                        .heightIn(min = 48.dp)
                        .clickable(onClick = onHapusPelaku),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MkChip(label = stringResource(R.string.audit_pelaku_chip, nama ?: "—"), selected = true)
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = null,
                        tint = LocalMkColors.current.ink2,
                        modifier = Modifier.padding(start = MkSpacing.space1),
                    )
                }
            }
        }
    }
}

/** Satu baris log: lencana aksi (warna+ikon+kata) + waktu, pelaku, target. */
@Composable
private fun BarisLog(log: AuditLogDto, onClick: () -> Unit) {
    val warna = LocalMkColors.current
    val pelaku = log.actor?.name ?: stringResource(R.string.audit_sistem)
    val waktu = waktuWib(log.at)
    val a11y = stringResource(R.string.audit_buka_rincian, labelAksi(log.action), pelaku, waktu)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clickable(onClick = onClick)
            .semantics { contentDescription = a11y }
            .padding(vertical = MkSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            StatusBadge(status = nadaAksi(log.action), size = MkBadgeSize.SM, text = labelAksi(log.action))
            Text(
                text = pelaku,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${labelSasaran(log.targetType)} · $waktu",
                style = MkTypography.footnote.tabular,
                color = warna.ink2,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
            contentDescription = null,
            tint = warna.ink3,
        )
    }
}

@Composable
private fun KakiDaftar(s: LogAuditUiState.Siap, onMuatLagi: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = MkSpacing.space3),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Text(
            text = stringResource(R.string.audit_menampilkan, angka(s.items.size), angka(s.total)),
            style = MkTypography.footnote.tabular,
            color = LocalMkColors.current.ink2,
        )
        if (s.galatLagi != null) {
            ErrorNote(pesan = s.galatLagi, onCobaLagi = onMuatLagi)
        } else if (s.adaLagi) {
            MkButton(
                label = stringResource(R.string.audit_muat_lagi),
                onClick = onMuatLagi,
                enabled = !s.memuatLagi,
                size = MkButtonSize.S,
            )
        }
    }
}

/** Rentang cepat; tanggal mengikuti kalender WIB. */
private enum class Rentang { SEMUA, HARI_INI, TUJUH, TIGA_PULUH }

private fun rentangKe(r: Rentang, hariIni: LocalDate): Pair<LocalDate?, LocalDate?> = when (r) {
    Rentang.SEMUA -> null to null
    Rentang.HARI_INI -> hariIni to hariIni
    Rentang.TUJUH -> hariIni.minusDays(6) to hariIni
    Rentang.TIGA_PULUH -> hariIni.minusDays(29) to hariIni
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun SheetSaring(
    awal: SaringanAudit,
    onTutup: () -> Unit,
    onTerapkan: (SaringanAudit) -> Unit,
) {
    var draf by remember { mutableStateOf(awal) }
    var pilihRentang by remember { mutableStateOf(false) }
    val hariIni = remember { Wib.hariIni() }
    val warna = LocalMkColors.current

    MkSheet(
        visible = true,
        onTutup = onTutup,
        judul = stringResource(R.string.audit_saring_log),
        subjudul = stringResource(R.string.audit_saring_sub),
        backLabel = stringResource(R.string.audit_kembali),
        footer = {
            MkButton(
                label = stringResource(R.string.audit_hapus_saringan),
                onClick = { draf = SaringanAudit() },
                modifier = Modifier.weight(1f),
            )
            MkButton(
                label = stringResource(R.string.audit_tampilkan_hasil),
                onClick = { onTerapkan(draf) },
                variant = MkButtonVariant.PRIMARY,
                modifier = Modifier.weight(1f),
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            Text(stringResource(R.string.audit_label_target), style = MkTypography.footnote, color = warna.ink2)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                OPSI_SASARAN.forEach { (nilai, label) ->
                    MkChip(
                        label = label,
                        selected = draf.targetType == nilai,
                        onClick = { draf = draf.copy(targetType = nilai) },
                    )
                }
            }
            val semuaAksi = MkOpsi("ALL", stringResource(R.string.audit_semua_aksi))
            val opsiAksi = remember(semuaAksi) { listOf(semuaAksi) + OPSI_AKSI.map { MkOpsi(it.first, it.second) } }
            MkPilih(
                pilihan = opsiAksi,
                terpilih = opsiAksi.firstOrNull { it.value == (draf.action ?: "ALL") },
                onPilih = { draf = draf.copy(action = it.value.takeUnless { v -> v == "ALL" }) },
                label = stringResource(R.string.audit_label_aksi),
            )
            val semuaPeran = MkOpsi("ALL", stringResource(R.string.audit_semua_peran))
            val opsiPeran = remember(semuaPeran) {
                listOf(semuaPeran) + Peran.entries.map { MkOpsi(it.name, it.labelIndonesia) }
            }
            MkPilih(
                pilihan = opsiPeran,
                terpilih = opsiPeran.firstOrNull { it.value == (draf.role ?: "ALL") },
                onPilih = { draf = draf.copy(role = it.value.takeUnless { v -> v == "ALL" }) },
                label = stringResource(R.string.audit_label_peran),
            )
            Text(stringResource(R.string.audit_label_tanggal), style = MkTypography.footnote, color = warna.ink2)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                listOf(
                    Rentang.SEMUA to R.string.audit_semua_waktu,
                    Rentang.HARI_INI to R.string.audit_hari_ini,
                    Rentang.TUJUH to R.string.audit_7_hari,
                    Rentang.TIGA_PULUH to R.string.audit_30_hari,
                ).forEach { (r, label) ->
                    val (d, s) = rentangKe(r, hariIni)
                    MkChip(
                        label = stringResource(label),
                        selected = draf.dari == d && draf.sampai == s,
                        onClick = { draf = draf.copy(dari = d, sampai = s) },
                    )
                }
                MkChip(
                    label = if (draf.dari != null && draf.sampai != null &&
                        rentangKe(Rentang.HARI_INI, hariIni) != (draf.dari to draf.sampai) &&
                        rentangKe(Rentang.TUJUH, hariIni) != (draf.dari to draf.sampai) &&
                        rentangKe(Rentang.TIGA_PULUH, hariIni) != (draf.dari to draf.sampai)
                    ) {
                        "${labelTanggal(draf.dari!!)} – ${labelTanggal(draf.sampai!!)}"
                    } else {
                        stringResource(R.string.audit_pilih_rentang)
                    },
                    onClick = { pilihRentang = true },
                )
            }
        }
    }

    if (pilihRentang) {
        val keUtc = { t: LocalDate? -> t?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli() }
        val keadaan = rememberDateRangePickerState(
            initialSelectedStartDateMillis = keUtc(draf.dari),
            initialSelectedEndDateMillis = keUtc(draf.sampai),
        )
        DatePickerDialog(
            onDismissRequest = { pilihRentang = false },
            confirmButton = {
                TextButton(
                    enabled = keadaan.selectedStartDateMillis != null,
                    onClick = {
                        // DatePicker memberi tengah malam UTC tanggal terpilih → tanggal kalender (WIB).
                        val dari = keadaan.selectedStartDateMillis?.let {
                            Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                        }
                        val sampai = keadaan.selectedEndDateMillis?.let {
                            Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                        } ?: dari
                        draf = draf.copy(dari = dari, sampai = sampai)
                        pilihRentang = false
                    },
                ) { Text(stringResource(R.string.audit_terapkan)) }
            },
            dismissButton = {
                TextButton(onClick = { pilihRentang = false }) { Text(stringResource(R.string.audit_batal)) }
            },
        ) {
            DateRangePicker(
                state = keadaan,
                title = {
                    Text(
                        stringResource(R.string.audit_rentang_judul),
                        modifier = Modifier.padding(start = MkSpacing.space6, top = MkSpacing.space4),
                    )
                },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/** Sheet rincian log (AuditSheet web): pelaku, target, perubahan, perangkat. */
@Composable
private fun SheetRincian(
    log: AuditLogDto?,
    onTutup: () -> Unit,
    onSaringPelaku: (AuditLogDto) -> Unit,
) {
    val warna = LocalMkColors.current
    MkSheet(
        visible = log != null,
        onTutup = onTutup,
        judul = log?.let { labelAksi(it.action) }.orEmpty(),
        subjudul = log?.let { "${labelSasaran(it.targetType)} · ${waktuWib(it.at)}" },
        backLabel = stringResource(R.string.audit_kembali),
    ) {
        val l = log ?: return@MkSheet
        StatusBadge(status = nadaAksi(l.action), text = labelAksi(l.action))

        JudulSeksi(stringResource(R.string.audit_pelaku))
        val aktor = l.actor
        if (aktor == null) {
            Text(stringResource(R.string.audit_sistem), style = MkTypography.body, color = warna.ink2)
        } else {
            Text(aktor.name, style = MkTypography.bodyStrong, color = warna.ink)
            Text(
                text = listOfNotNull(labelPeran(aktor.role), aktor.email.ifBlank { null }).joinToString(" · "),
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            MkButton(
                label = stringResource(R.string.audit_lihat_pelaku),
                onClick = { onSaringPelaku(l) },
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
                modifier = Modifier.padding(top = MkSpacing.space1),
            )
        }

        JudulSeksi(stringResource(R.string.audit_sasaran))
        Text(labelSasaran(l.targetType), style = MkTypography.bodyStrong, color = warna.ink)
        KotakKode(label = null, teks = l.targetId)

        JudulSeksi(stringResource(R.string.audit_perubahan))
        val sebelum = remember(l.id) { teksJson(l.beforeData) }
        val sesudah = remember(l.id) { teksJson(l.afterData) }
        if (sebelum.isEmpty() && sesudah.isEmpty()) {
            Text(stringResource(R.string.audit_tanpa_perubahan), style = MkTypography.footnote, color = warna.ink2)
        } else {
            val berubah = remember(l.id) { kunciBerubah(l.beforeData, l.afterData) }
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                if (berubah.isNotEmpty()) {
                    Text(
                        text = stringResource(R.string.audit_kolom_berubah, berubah.joinToString(", ")),
                        style = MkTypography.footnote,
                        color = warna.ink2,
                    )
                }
                if (sebelum.isNotEmpty()) KotakKode(stringResource(R.string.audit_sebelum), sebelum)
                if (sesudah.isNotEmpty()) KotakKode(stringResource(R.string.audit_sesudah), sesudah)
            }
        }

        if (l.ip != null || l.userAgent != null) {
            JudulSeksi(stringResource(R.string.audit_perangkat))
            l.ip?.let {
                Text(stringResource(R.string.audit_alamat_ip, it), style = MkTypography.footnote, color = warna.ink)
            }
            l.userAgent?.let { Text(it, style = MkTypography.footnote, color = warna.ink2) }
        }
    }
}
