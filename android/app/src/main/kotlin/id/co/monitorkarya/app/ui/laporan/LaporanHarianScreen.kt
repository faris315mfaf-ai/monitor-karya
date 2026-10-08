// Layar Laporan harian PIC (T5-B5 Fase 1) — padanan DailyInputView web
// (src/components/views/daily-input-view.tsx). Dua tingkat:
// (1) daftar "Proyek Anda hari ini" (baris: nama, kode · fase · n progress,
//     StatusBadge status laporan hari ini + indikator Terlambat), FAB "Isi
//     laporan" saat PIC hanya memegang satu proyek yang belum dikirim;
// (2) sheet FormLaporan — status (chip), capaian (3 baris, wajib), kendala
//     (wajib bila Terkendala/Menunggu keputusan), tindak lanjut (wajib bila
//     Terkendala), progres % bila hari tanpa tugas; footer "Simpan draf"
//     (SEKUNDER) + "Kirim laporan" (PRIMER). Menutup sheet dengan isian kotor
//     lewat dialog "Buang perubahan?".
//
// Komponen MkListRow/MkField/MkPilih adalah port LOKAL paket ini (komponen
// bersama belum ada di designsystem saat tugas ini jalan); saat dipromosikan,
// pindahkan tanpa mengubah perilaku — catat di docs/fase1/T5-B5-LAPORAN.md.
package id.co.monitorkarya.app.ui.laporan

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkOfflineBanner
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

// ------------------------------------------------------------------
// Titik masuk
// ------------------------------------------------------------------

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun LaporanHarianScreen(
    vm: LaporanViewModel,
    offline: Boolean = false,
    /** Dipanggil tombol "Ajukan buka kunci" (alur POST /api/unlock-requests dipegang layar lain). */
    onAjukanBukaKunci: (reportId: String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val terpilih by vm.terpilih.collectAsStateWithLifecycle()
    val galatForm by vm.galatForm.collectAsStateWithLifecycle()
    val mengirim by vm.mengirim.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    val versiForm by vm.versiForm.collectAsStateWithLifecycle()
    val terlambat by vm.terlambat.collectAsStateWithLifecycle()
    LaporanHarianScreen(
        state = state,
        terpilih = terpilih,
        galatForm = galatForm,
        mengirim = mengirim,
        notifikasi = notifikasi,
        versiForm = versiForm,
        terlambat = terlambat,
        offline = offline,
        onUlang = vm::ulang,
        onPilih = vm::pilih,
        onSimpan = vm::simpan,
        onNotifikasiTampil = vm::notifikasiTampil,
        onUrungkan = vm::urungkan,
        onAjukanBukaKunci = onAjukanBukaKunci,
        modifier = modifier,
    )
}

/** Versi status murni — mudah dipratinjau tanpa ViewModel. */
@Composable
fun LaporanHarianScreen(
    state: LaporanUiState,
    terpilih: String? = null,
    galatForm: GalatForm? = null,
    mengirim: Boolean = false,
    notifikasi: NotifikasiLaporan? = null,
    versiForm: Int = 0,
    terlambat: Boolean = false,
    offline: Boolean = false,
    onUlang: () -> Unit = {},
    onPilih: (String?) -> Unit = {},
    onSimpan: (AksiLaporan, IsianLaporan) -> Unit = { _, _ -> },
    onNotifikasiTampil: () -> Unit = {},
    onUrungkan: () -> Unit = {},
    onAjukanBukaKunci: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notifikasi?.id) {
        notifikasi?.let { n ->
            val hasil = snackbar.showSnackbar(
                message = n.pesan,
                actionLabel = n.undoToken?.let { "Urungkan" },
                duration = SnackbarDuration.Short,
            )
            if (hasil == SnackbarResult.ActionPerformed) onUrungkan()
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
                LaporanUiState.Memuat -> repeat(3) { MkSkeleton(modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp)) }
                is LaporanUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
                is LaporanUiState.Siap -> IsiLaporan(
                    desk = state.desk,
                    terpilih = terpilih,
                    galatForm = galatForm,
                    mengirim = mengirim,
                    versiForm = versiForm,
                    terlambat = terlambat,
                    onPilih = onPilih,
                    onSimpan = onSimpan,
                    onAjukanBukaKunci = onAjukanBukaKunci,
                )
            }
        }
        // FAB hanya saat satu-satunya proyek belum dikirim (padanan web: form
        // langsung terbuka untuk PIC satu proyek). Banyak proyek: sentuh baris.
        val siap = state as? LaporanUiState.Siap
        val tunggal = siap?.desk?.proyek?.singleOrNull()
        if (tunggal != null && tunggal.laporan?.terkirimIso == null && tunggal.bisaEdit) {
            val aksen = LocalAccent.current
            ExtendedFloatingActionButton(
                onClick = { onPilih(tunggal.id) },
                icon = { Icon(imageVector = Icons.Outlined.EditNote, contentDescription = null, tint = aksen.on) },
                text = { Text(text = "Isi laporan", color = aksen.on) },
                containerColor = aksen.fill,
                contentColor = aksen.on,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(MkSpacing.space5),
            )
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
// Tingkat 1 — daftar "Proyek Anda hari ini"
// ------------------------------------------------------------------

@Composable
private fun IsiLaporan(
    desk: DeskLaporan,
    terpilih: String?,
    galatForm: GalatForm?,
    mengirim: Boolean,
    versiForm: Int,
    terlambat: Boolean,
    onPilih: (String?) -> Unit,
    onSimpan: (AksiLaporan, IsianLaporan) -> Unit,
    onAjukanBukaKunci: (String) -> Unit,
) {
    val warna = LocalMkColors.current
    val outstanding = desk.proyek.count { it.laporan?.terkirimIso == null }

    // Satu kalimat jawaban di atas layar.
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(text = "Laporan harian", style = MkTypography.title3, color = warna.ink)
        tanggalPanjang(desk.tanggalIso)?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
        if (desk.proyek.isNotEmpty()) {
            StatusBadge(
                status = when {
                    outstanding == 0 -> MkStatus.DONE
                    desk.lewatTenggat -> MkStatus.LATE
                    else -> MkStatus.RISK
                },
                text = if (outstanding == 0) "Semua laporan terkirim" else "$outstanding laporan belum dikirim",
            )
        }
        Text(text = kalimatJawaban(desk), style = MkTypography.body, color = warna.ink)
        teksTenggat(desk)?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
    }

    if (desk.proyek.isEmpty()) {
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(teks = "Belum ada proyek yang ditugaskan kepada Anda. Hubungi Admin PT untuk penugasan proyek.")
        }
    } else {
        MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space1) {
            desk.proyek.forEach { proyek ->
                MkListRow(proyek = proyek, desk = desk, onBuka = { onPilih(proyek.id) })
            }
        }
    }

    // Tingkat 2 — sheet formulir satu proyek.
    val dibuka = desk.proyek.firstOrNull { it.id == terpilih }
    if (dibuka != null) {
        FormLaporanSheet(
            proyek = dibuka,
            desk = desk,
            versiForm = versiForm,
            galatForm = galatForm,
            mengirim = mengirim,
            terlambat = terlambat,
            onTutup = { onPilih(null) },
            onSimpan = onSimpan,
            onAjukanBukaKunci = onAjukanBukaKunci,
        )
    }
}

/** Baris satu proyek: nama + meta di kiri, badge status + indikator terlambat + chevron di kanan. */
@Composable
private fun MkListRow(proyek: ProyekLaporan, desk: DeskLaporan, onBuka: () -> Unit) {
    val warna = LocalMkColors.current
    val laporan = proyek.laporan
    val terkirimTerlambat = kirimSetelahTenggat(laporan?.terkirimIso, desk.kunciIso)
    val belumTerkirimTerkunci = laporan?.terkirimIso == null && !proyek.bisaEdit && proyek.alasanKunci == "TIME"
    val dibuka = proyek.bukaKunci?.status == "DIEKSEKUSI"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .clickable(onClick = onBuka)
            .padding(horizontal = MkSpacing.space3, vertical = 12.dp)
            .heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = proyek.nama,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subjudulBaris(proyek),
                style = MkTypography.footnote,
                color = warna.ink2,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (dibuka) {
                    StatusBadge(
                        status = MkStatus.INFO,
                        size = MkBadgeSize.SM,
                        text = "Dibuka sampai ${jamWib(proyek.bukaKunci?.sampaiIso) ?: "-"}",
                    )
                } else {
                    StatusBadge(
                        status = mkStatusDari(laporan?.status),
                        size = MkBadgeSize.SM,
                        text = labelStatusHarian(laporan?.status),
                    )
                }
                if (terkirimTerlambat || belumTerkirimTerkunci) {
                    StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = "Terlambat")
                }
            }
            Icon(
                imageVector = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = warna.ink2,
            )
        }
    }
}

// ------------------------------------------------------------------
// Tingkat 2 — FormLaporanSheet
// ------------------------------------------------------------------

@Composable
private fun FormLaporanSheet(
    proyek: ProyekLaporan,
    desk: DeskLaporan,
    versiForm: Int,
    galatForm: GalatForm?,
    mengirim: Boolean,
    terlambat: Boolean,
    onTutup: () -> Unit,
    onSimpan: (AksiLaporan, IsianLaporan) -> Unit,
    onAjukanBukaKunci: (String) -> Unit,
) {
    val laporan = proyek.laporan
    val terkunci = !proyek.bisaEdit
    val diringkas = proyek.diringkas && laporan != null

    // Isian diikat ke (versiForm, proyek) — setelah simpan berhasil versi naik
    // dan isian diambil ulang dari laporan termuat ulang, penanda kotor ikut reset.
    var status by remember(versiForm, proyek.id) { mutableStateOf(laporan?.status.orEmpty()) }
    var progresTeks by remember(versiForm, proyek.id) { mutableStateOf((laporan?.progres ?: 0).toString()) }
    var capaian by remember(versiForm, proyek.id) { mutableStateOf(laporan?.capaian.orEmpty()) }
    var kendala by remember(versiForm, proyek.id) { mutableStateOf(laporan?.kendala.orEmpty()) }
    var tindakLanjut by remember(versiForm, proyek.id) { mutableStateOf(laporan?.tindakLanjut.orEmpty()) }
    var kotor by remember(versiForm, proyek.id) { mutableStateOf(false) }
    var periksa by remember(versiForm, proyek.id) { mutableStateOf(false) }
    var konfirmasiTutup by remember { mutableStateOf(false) }

    val statusTampil = if (diringkas) laporan?.status.orEmpty() else status
    val wajibKendala = statusTampil == "TERKENDALA" || statusTampil == "MENUNGGU_KEPUTUSAN"
    val wajibTindakLanjut = statusTampil == "TERKENDALA"
    val butuhBukti = statusTampil != "" && statusTampil != "TIDAK_ADA_PERUBAHAN" && !diringkas

    /** Setiap perubahan isian menandai formulir kotor (menutup perlu konfirmasi). */
    fun ubah(nilai: String): String {
        kotor = true
        return nilai
    }

    fun kirimAksi(aksi: AksiLaporan) {
        val galat = cekIsian(aksi, statusTampil, capaian, kendala, tindakLanjut)
        if (galat.ada()) {
            periksa = true
        } else {
            onSimpan(
                aksi,
                IsianLaporan(
                    status = statusTampil,
                    progres = progresTeks.toIntOrNull()?.coerceIn(0, 100) ?: 0,
                    capaian = capaian,
                    kendala = kendala,
                    tindakLanjut = tindakLanjut,
                ),
            )
        }
    }

    MkSheet(
        visible = true,
        onTutup = { if (kotor) konfirmasiTutup = true else onTutup() },
        judul = proyek.nama,
        subjudul = subjudulSheet(proyek, desk),
        backLabel = "Laporan",
        footer = {
            if (!terkunci) {
                MkButton(
                    label = "Simpan draf",
                    variant = MkButtonVariant.SECONDARY,
                    enabled = !mengirim,
                    modifier = Modifier.weight(1f),
                    onClick = { kirimAksi(AksiLaporan.SIMPAN) },
                )
                MkButton(
                    label = if (laporan?.terkirimIso != null) "Kirim ulang laporan" else "Kirim laporan",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !mengirim,
                    modifier = Modifier.weight(1f),
                    onClick = { kirimAksi(AksiLaporan.KIRIM) },
                )
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            val keadaan = keadaanLaporan(proyek)
            StatusBadge(status = keadaan.first, text = keadaan.second)

            CatatanKunci(
                proyek = proyek,
                desk = desk,
                bolehAjukanBuka = desk.bolehAjukanBuka,
                onAjukanBukaKunci = onAjukanBukaKunci,
            )

            if (diringkas) {
                RingkasanDiringkas(proyek = proyek, statusTampil = statusTampil)
            } else {
                MkPilih(
                    label = "Status",
                    opsi = opsiStatusHarian(laporan?.status),
                    terpilih = statusTampil,
                    enabled = !terkunci,
                    kesalahan = if (periksa) cekIsian(AksiLaporan.KIRIM, statusTampil, capaian, kendala, tindakLanjut).status else null,
                    onPilih = { status = ubah(it) },
                )
                if (!diringkas) {
                    MkField(
                        label = "Progres",
                        nilai = progresTeks,
                        onUbah = { teks ->
                            val angka = teks.filter { it.isDigit() }.take(3)
                            progresTeks = ubah(if ((angka.toIntOrNull() ?: 0) > 100) "100" else angka)
                        },
                        angka = true,
                        enabled = !terkunci,
                        petunjuk = "Persentase 0–100 bila hari ini tidak ada daftar progress.",
                        modifier = Modifier.fillMaxWidth(0.5f),
                    )
                }
                if (butuhBukti && (laporan?.jumlahBukti ?: 0) < 1) {
                    Text(
                        text = "Bukti pendukung minimal 1 diperlukan untuk status ini; pelampiran bukti menyusul di pembaruan aplikasi.",
                        style = MkTypography.footnote,
                        color = LocalMkColors.current.ink2,
                    )
                }
            }

            MkField(
                label = "Capaian hari ini",
                nilai = capaian,
                onUbah = { capaian = ubah(it.take(4000)) },
                wajib = true,
                baris = 3,
                enabled = !terkunci,
                placeholder = "Apa yang selesai hari ini? Mis. modul izin dan cuti selesai diuji",
                kesalahan = if (periksa) cekIsian(AksiLaporan.KIRIM, statusTampil, capaian, kendala, tindakLanjut).capaian else null,
                modifier = Modifier.fillMaxWidth(),
            )
            MkField(
                label = "Kendala",
                nilai = kendala,
                onUbah = { kendala = ubah(it.take(2000)) },
                wajib = wajibKendala,
                baris = 2,
                enabled = !terkunci,
                placeholder = "Apa yang menghambat? Mis. perangkat uji belum tiba",
                petunjuk = if (wajibKendala) null else "Opsional · wajib bila Terkendala atau Menunggu keputusan",
                kesalahan = if (periksa) cekIsian(AksiLaporan.KIRIM, statusTampil, capaian, kendala, tindakLanjut).kendala else null,
                modifier = Modifier.fillMaxWidth(),
            )
            MkField(
                label = "Rencana besok",
                nilai = tindakLanjut,
                onUbah = { tindakLanjut = ubah(it.take(2000)) },
                wajib = wajibTindakLanjut,
                baris = 2,
                enabled = !terkunci,
                placeholder = "Langkah berikutnya, mis. uji ulang setelah perangkat tiba",
                petunjuk = if (wajibTindakLanjut) null else "Opsional · wajib bila Terkendala",
                kesalahan = if (periksa) cekIsian(AksiLaporan.KIRIM, statusTampil, capaian, kendala, tindakLanjut).tindakLanjut else null,
                modifier = Modifier.fillMaxWidth(),
            )

            if (terlambat || kirimSetelahTenggat(laporan?.terkirimIso, desk.kunciIso)) {
                BannerTerlambat(desk = desk)
            }

            KotakGalat(galatForm = galatForm, bolehAjukanBuka = desk.bolehAjukanBuka, onAjukanBukaKunci = onAjukanBukaKunci)
        }

        if (konfirmasiTutup) {
            AlertDialog(
                onDismissRequest = { konfirmasiTutup = false },
                title = { Text(text = "Buang perubahan?") },
                text = { Text(text = "Isian yang belum disimpan akan dibuang.") },
                confirmButton = {
                    TextButton(onClick = {
                        konfirmasiTutup = false
                        onTutup()
                    }) { Text(text = "Buang perubahan") }
                },
                dismissButton = {
                    TextButton(onClick = { konfirmasiTutup = false }) { Text(text = "Lanjut mengisi") }
                },
            )
        }
    }
}

/** Hari dengan task: status & progres dibaca saja (server merangkum dari task). */
@Composable
private fun RingkasanDiringkas(proyek: ProyekLaporan, statusTampil: String) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.fill1)
            .padding(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            StatusBadge(status = mkStatusDari(statusTampil), text = labelStatusHarian(statusTampil))
            Text(
                text = "${proyek.laporan?.progres ?: 0}%",
                style = MkTypography.bodyStrong.tabular,
                color = warna.ink,
            )
        }
        Text(
            text = "Diringkas dari ${proyek.jumlahTugas} progress hari ini — status dan progres dihitung dari daftar progress, jadi tidak perlu diisi ulang di sini.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
    }
}

/** Kenapa laporan tidak bisa diubah + jalan keluarnya (buka kunci). */
@Composable
private fun CatatanKunci(
    proyek: ProyekLaporan,
    desk: DeskLaporan,
    bolehAjukanBuka: Boolean,
    onAjukanBukaKunci: (String) -> Unit,
) {
    val warna = LocalMkColors.current
    val laporan = proyek.laporan
    val buka = proyek.bukaKunci

    if (buka?.status == "DIEKSEKUSI") {
        BarisInfo(latar = warna.statusInfoSoft, warnaIkon = warna.statusInfo, ikon = Icons.Outlined.Lock) {
            Text(
                text = "Dibuka sampai ${jamWib(buka.sampaiIso) ?: "-"} WIB. Perbaiki laporan lalu kirim ulang; setelah itu laporan dikunci kembali.",
                style = MkTypography.footnote,
                color = warna.ink,
            )
        }
        return
    }
    if (proyek.bisaEdit) return

    val jam = jamWib(desk.kunciIso) ?: "17.00"
    val pesan = when (proyek.alasanKunci) {
        "FORWARDED" -> "Laporan ini sudah diteruskan ke holding dan dibekukan. Perubahan hanya lewat buka kunci yang disetujui."
        "LOCKED" -> "Laporan ini dikunci. Perubahan hanya lewat buka kunci yang disetujui."
        else -> "Laporan hari ini sudah melewati pukul $jam WIB dan terkunci."
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.fill1)
            .padding(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Icon(imageVector = Icons.Outlined.Lock, contentDescription = null, tint = warna.ink2)
            Text(text = "Terkunci", style = MkTypography.bodyStrong, color = warna.ink)
            if (buka?.status == "DIAJUKAN") {
                StatusBadge(status = MkStatus.INFO, size = MkBadgeSize.SM, text = "Buka kunci diajukan · menunggu persetujuan")
            }
            if (buka?.status == "DISETUJUI") {
                StatusBadge(status = MkStatus.INFO, size = MkBadgeSize.SM, text = "Buka kunci disetujui · menunggu dijalankan Tim TI")
            }
        }
        Text(text = pesan, style = MkTypography.footnote, color = warna.ink2)
        when {
            laporan == null -> Text(
                text = "Belum ada laporan tersimpan untuk hari ini, jadi tidak ada yang bisa dibuka.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            bolehAjukanBuka -> MkButton(
                label = "Ajukan buka kunci",
                variant = MkButtonVariant.SECONDARY,
                size = MkButtonSize.S,
                onClick = { onAjukanBukaKunci(laporan.id) },
            )
            else -> Text(
                text = "Minta Admin PT mengajukan buka kunci bila laporan ini perlu diubah.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
    }
}

/** Banner kecil pengiriman setelah tenggat. */
@Composable
private fun BannerTerlambat(desk: DeskLaporan) {
    val warna = LocalMkColors.current
    BarisInfo(latar = warna.statusLateSoft, warnaIkon = warna.statusLate, ikon = Icons.Outlined.Schedule) {
        Text(
            text = "Terkirim setelah tenggat ${jamWib(desk.kunciIso) ?: "17.00"} — tercatat terlambat",
            style = MkTypography.footnote,
            color = warna.statusLate,
        )
    }
}

/** Galat PUT terakhir (409/422/lainnya) — setara role="alert" web. */
@Composable
private fun KotakGalat(
    galatForm: GalatForm?,
    bolehAjukanBuka: Boolean,
    onAjukanBukaKunci: (String) -> Unit,
) {
    val galat = galatForm ?: return
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.statusLateSoft)
            .padding(MkSpacing.space3)
            .semantics { liveRegion = LiveRegionMode.Assertive },
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Icon(imageVector = Icons.Outlined.Error, contentDescription = null, tint = warna.statusLate)
            Text(text = pesanGalat(galat), style = MkTypography.footnote, color = warna.ink)
        }
        val galatBeku = galat as? GalatForm.Beku
        val reportIdBeku = galatBeku?.reportId
        if (reportIdBeku != null && bolehAjukanBuka) {
            MkButton(
                label = "Ajukan buka kunci",
                variant = MkButtonVariant.SECONDARY,
                size = MkButtonSize.S,
                onClick = { onAjukanBukaKunci(reportIdBeku) },
            )
        }
    }
}

// ------------------------------------------------------------------
// Port lokal: MkField, MkPilih, BarisInfo
// ------------------------------------------------------------------

/** Kolom isian bertoken: label (+ tanda wajib), OutlinedTextField, petunjuk/kesalahan. */
@Composable
private fun MkField(
    label: String,
    nilai: String,
    onUbah: (String) -> Unit,
    modifier: Modifier = Modifier,
    wajib: Boolean = false,
    petunjuk: String? = null,
    kesalahan: String? = null,
    baris: Int = 1,
    angka: Boolean = false,
    placeholder: String? = null,
    enabled: Boolean = true,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(text = label, style = MkTypography.callout, color = warna.ink)
            if (wajib) Text(text = "Wajib", style = MkTypography.caption, color = warna.statusLate)
        }
        OutlinedTextField(
            value = nilai,
            onValueChange = onUbah,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
            textStyle = MkTypography.body,
            minLines = baris,
            singleLine = baris <= 1,
            placeholder = placeholder?.let { teks ->
                { Text(text = teks, style = MkTypography.body, color = warna.ink3) }
            },
            suffix = if (angka) {
                { Text(text = "%", style = MkTypography.body, color = warna.ink2) }
            } else {
                null
            },
            isError = kesalahan != null,
            shape = MkShapes.sm,
            keyboardOptions = if (angka) {
                KeyboardOptions(keyboardType = KeyboardType.Number)
            } else {
                KeyboardOptions.Default
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = warna.ink,
                unfocusedTextColor = warna.ink,
                disabledTextColor = warna.ink2,
                cursorColor = aksen.focus,
                focusedBorderColor = aksen.focus,
                unfocusedBorderColor = warna.lineStrong,
                disabledBorderColor = warna.line,
                errorBorderColor = warna.statusLate,
                focusedPlaceholderColor = warna.ink3,
                unfocusedPlaceholderColor = warna.ink3,
            ),
        )
        petunjuk?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
        kesalahan?.let { Text(text = it, style = MkTypography.footnote, color = warna.statusLate) }
    }
}

/** Pilihan status laporan sebagai baris chip (padanan Chip status web). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MkPilih(
    label: String,
    opsi: List<PilihanStatus>,
    terpilih: String,
    onPilih: (String) -> Unit,
    enabled: Boolean = true,
    kesalahan: String? = null,
) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(text = label, style = MkTypography.callout, color = warna.ink)
            Text(text = "Wajib", style = MkTypography.caption, color = warna.statusLate)
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            opsi.forEach { pilihan ->
                MkChip(
                    label = pilihan.label,
                    selected = terpilih == pilihan.status,
                    status = pilihan.mkStatus,
                    enabled = enabled,
                    onClick = { onPilih(pilihan.status) },
                )
            }
        }
        kesalahan?.let { Text(text = it, style = MkTypography.footnote, color = warna.statusLate) }
    }
}

/** Baris catatan kecil: ikon + isi di atas latar lembut. */
@Composable
private fun BarisInfo(
    latar: Color,
    warnaIkon: Color,
    ikon: ImageVector,
    isi: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = latar)
            .padding(MkSpacing.space3),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Icon(imageVector = ikon, contentDescription = null, tint = warnaIkon)
        isi()
    }
}

// ------------------------------------------------------------------
// Logika pembantu murni (mudah diuji)
// ------------------------------------------------------------------

/** Pilihan status untuk chip. */
data class PilihanStatus(val status: String, val label: String, val mkStatus: MkStatus)

/** Empat status rutin + Menunggu keputusan hanya bila laporan sudah memakainya. */
internal fun opsiStatusHarian(statusTersimpan: String?): List<PilihanStatus> {
    val dasar = listOf("SELESAI", "ON_PROGRESS", "TERKENDALA", "TIDAK_ADA_PERUBAHAN").map {
        PilihanStatus(status = it, label = labelStatusHarian(it), mkStatus = mkStatusDari(it))
    }
    return if (statusTersimpan == "MENUNGGU_KEPUTUSAN") {
        dasar + PilihanStatus("MENUNGGU_KEPUTUSAN", labelStatusHarian("MENUNGGU_KEPUTUSAN"), mkStatusDari("MENUNGGU_KEPUTUSAN"))
    } else {
        dasar
    }
}

/** Kosakata status desain dari status laporan harian. */
internal fun mkStatusDari(status: String?): MkStatus = when (status) {
    "SELESAI" -> MkStatus.DONE
    "ON_PROGRESS" -> MkStatus.ON
    "TERKENDALA" -> MkStatus.RISK
    "MENUNGGU_KEPUTUSAN" -> MkStatus.INFO
    "TIDAK_ADA_PERUBAHAN" -> MkStatus.NEUTRAL
    else -> MkStatus.NEUTRAL
}

/** Pra-validasi ramah sebelum PUT — padanan aturan draf/kirim di rute (bukan pengganti 422). */
data class CekIsian(val status: String?, val capaian: String?, val kendala: String?, val tindakLanjut: String?) {
    fun ada(): Boolean = status != null || capaian != null || kendala != null || tindakLanjut != null
}

internal fun cekIsian(aksi: AksiLaporan, status: String, capaian: String, kendala: String, tindakLanjut: String): CekIsian {
    val galatStatus = if (status.isBlank()) "Pilih status laporan dulu." else null
    val galatCapaian = if (capaian.isBlank()) "Capaian hari ini wajib diisi." else null
    if (aksi == AksiLaporan.SIMPAN) return CekIsian(galatStatus, galatCapaian, null, null)
    val wajibKendala = status == "TERKENDALA" || status == "MENUNGGU_KEPUTUSAN"
    val wajibTindak = status == "TERKENDALA"
    return CekIsian(
        status = galatStatus,
        capaian = galatCapaian,
        kendala = if (wajibKendala && kendala.isBlank()) "Kendala wajib dijelaskan untuk status ${labelStatusHarian(status)}." else null,
        tindakLanjut = if (wajibTindak && tindakLanjut.isBlank()) "Rencana tindak lanjut wajib diisi untuk status Terkendala." else null,
    )
}

/** Keadaan laporan satu proyek (padanan reportState web) — untuk badge atas sheet. */
internal fun keadaanLaporan(proyek: ProyekLaporan): Pair<MkStatus, String> {
    val r = proyek.laporan
    val buka = proyek.bukaKunci
    val terkunci = !proyek.bisaEdit
    return when {
        buka?.status == "DIEKSEKUSI" -> MkStatus.INFO to "Dibuka sampai ${jamWib(buka.sampaiIso) ?: "-"}"
        r?.diteruskanIso != null -> MkStatus.DONE to "Diteruskan ke holding"
        r?.terkirimIso != null -> MkStatus.DONE to "Terkirim ${jamWib(r.terkirimIso) ?: ""}".trim()
        r != null -> if (terkunci) MkStatus.LATE to "Draf terkunci" else MkStatus.RISK to "Draf belum dikirim"
        else -> if (terkunci) MkStatus.LATE to "Tidak dikirim" else MkStatus.NEUTRAL to "Belum diisi"
    }
}

/** Satu kalimat jawaban di atas layar. */
internal fun kalimatJawaban(desk: DeskLaporan): String {
    val proyek = desk.proyek
    if (proyek.isEmpty()) return "Belum ada proyek yang ditugaskan kepada Anda."
    if (proyek.size == 1) {
        val p = proyek.first()
        val r = p.laporan
        return when {
            p.bukaKunci?.status == "DIEKSEKUSI" -> "Laporan ${p.nama} sedang dibuka untuk diperbaiki."
            r?.diteruskanIso != null -> "Laporan ${p.nama} sudah diteruskan ke holding."
            r?.terkirimIso != null -> "Laporan ${p.nama} sudah terkirim ke Admin PT."
            !p.bisaEdit -> "Laporan ${p.nama} tidak terkirim sebelum tenggat."
            else -> "Laporan ${p.nama} belum dikirim."
        }
    }
    val outstanding = proyek.count { it.laporan?.terkirimIso == null }
    return if (outstanding == 0) {
        "Semua ${proyek.size} laporan hari ini sudah terkirim."
    } else {
        "$outstanding dari ${proyek.size} laporan hari ini belum dikirim."
    }
}

/** Baris teks tenggat/countdown di bawah kalimat jawaban. */
internal fun teksTenggat(desk: DeskLaporan): String? {
    val jam = jamWib(desk.kunciIso) ?: "17.00"
    return if (desk.lewatTenggat) {
        "Tenggat $jam WIB sudah lewat — laporan terkunci."
    } else {
        desk.hitungMundur?.let { "Tenggat $jam WIB · $it" }
    }
}

/** "BRK-001 · PERSIAPAN · 3 progress · draf" — meta baris daftar. */
internal fun subjudulBaris(proyek: ProyekLaporan): String {
    val laporan = proyek.laporan
    val keadaan = when {
        laporan?.diteruskanIso != null -> "diteruskan ke holding"
        laporan?.terkirimIso != null -> "terkirim ${jamWib(laporan.terkirimIso) ?: ""}".trim()
        laporan != null -> "draf"
        else -> "belum diisi"
    }
    return buildString {
        if (proyek.kode.isNotBlank()) append(proyek.kode)
        if (proyek.fase.isNotBlank()) {
            if (isNotEmpty()) append(" · ")
            append(proyek.fase)
        }
        if (proyek.jumlahTugas > 0) {
            if (isNotEmpty()) append(" · ")
            append(proyek.jumlahTugas).append(" progress")
        }
        if (isNotEmpty()) append(" · ")
        append(keadaan)
    }.toString()
}

private fun subjudulSheet(proyek: ProyekLaporan, desk: DeskLaporan): String {
    val tanggal = tanggalPanjang(desk.tanggalIso) ?: desk.tanggalKunci
    val kepala = buildString {
        append(proyek.kode)
        if (proyek.fase.isNotBlank()) append(" · ").append(proyek.fase)
    }
    return "$kepala — Laporan harian, $tanggal"
}

/** Pesan utama galat; galat validasi menambah field lain setelah pesan pertama. */
internal fun pesanGalat(galat: GalatForm): String = when (galat) {
    is GalatForm.Beku -> galat.pesan
    is GalatForm.Validasi ->
        if (galat.medan.isEmpty()) galat.pesan
        else ((listOf(galat.pesan) + galat.medan).distinct()).joinToString(" ")
    is GalatForm.Umum -> galat.pesan
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

@PreviewGanda
@Composable
private fun LaporanHarianScreenPreview() {
    val desk = DeskLaporan(
        tanggalKunci = "2026-10-08",
        tanggalIso = "2026-10-08T00:00:00Z",
        hariIni = true,
        kunciIso = "2026-10-08T10:00:00Z",
        lewatTenggat = false,
        hitungMundur = "2 jam 15 menit lagi",
        bolehAjukanBuka = true,
        proyek = listOf(
            ProyekLaporan(
                id = "p1",
                kode = "BRK-001",
                nama = "SIM RS Bhakti Rahayu",
                fase = "PENGEMBANGAN",
                jumlahTugas = 3,
                diringkas = true,
                bisaEdit = true,
                alasanKunci = null,
                bukaKunci = null,
                laporan = LaporanTersimpan(
                    id = "r1",
                    status = "ON_PROGRESS",
                    progres = 64,
                    capaian = "Modul izin selesai diuji",
                    kendala = null,
                    tindakLanjut = null,
                    jumlahBukti = 2,
                    terkirimIso = null,
                    diteruskanIso = null,
                    terkunci = false,
                ),
            ),
            ProyekLaporan(
                id = "p2",
                kode = "MDP-004",
                nama = "Aplikasi Klaim Medpay",
                fase = "PERSIAPAN",
                jumlahTugas = 0,
                diringkas = false,
                bisaEdit = true,
                alasanKunci = null,
                bukaKunci = null,
                laporan = null,
            ),
        ),
    )
    MKTheme {
        LaporanHarianScreen(state = LaporanUiState.Siap(desk))
    }
}
