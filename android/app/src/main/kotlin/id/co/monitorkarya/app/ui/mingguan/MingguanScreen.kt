// Layar Capaian mingguan Kepala Divisi (T6-C5 Fase 2) — padanan
// WeeklyInputView → DivisionWeeklyDesk web. Papan tiga kolom status
// (Belum/Berjalan/Selesai; penuh ≥600dp, segmen bergilir di bawahnya): papan
// baca-saja memakai MkBoardColumn; papan yang boleh ditulis memakai kartu
// dalam bahasa visual yang sama (inset surface-2 + garis + radius kartu)
// tetapi bisa diketuk untuk membuka ButirSheet dan membawa tombol naik/turun
// yang hanya aktif bila ada tetangga selajur (lihat MingguanViewModel.pindah)
// — MkBoardColumn belum menyediakan slot klik/label status persis. FAB "Tambah
// butir" membuka ButirSheet (MkSheet: aspek & prioritas & status MkPilih,
// pekerjaan/target/PIC/capaian/kendala/tindak lanjut MkField, progres %).
// Footer sticky: "Simpan draf" SEKUNDER + primer kontekstual — "Serahkan" saat
// DRAFT, "Setujui laporan" saat MENUNGGU_PERSETUJUAN. Setelah DISETUJUI/
// TERKUNCI/beku: papan baca-saja tanpa FAB/footer, EmptyNote/CatatanKunci
// menjelaskan + tombol "Ajukan buka kunci" (alur unlock-requests dipegang
// layar lain).
package id.co.monitorkarya.app.ui.mingguan

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
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
import id.co.monitorkarya.designsystem.components.MkBoardColumn
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkKartuPapan
import id.co.monitorkarya.designsystem.components.MkLampiranRow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import id.co.monitorkarya.app.ui.luring.BannerLuring
import id.co.monitorkarya.app.ui.luring.DaftarAntreanOtomatis
import id.co.monitorkarya.app.ui.luring.ingatWaktuMuat
import id.co.monitorkarya.app.ui.draf.PenandaDrafPulih
import id.co.monitorkarya.app.ui.luring.rememberStatusLuring
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

// ------------------------------------------------------------------
// Titik masuk
// ------------------------------------------------------------------

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun MingguanScreen(
    vm: MingguanViewModel,
    offline: Boolean = false,
    /** Dipanggil tombol "Ajukan buka kunci" (alur POST /api/unlock-requests dipegang layar lain). */
    onAjukanBukaKunci: (reportId: String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val divisiTerpilih by vm.divisiTerpilih.collectAsStateWithLifecycle()
    val sheet by vm.sheet.collectAsStateWithLifecycle()
    val galatAksi by vm.galatAksi.collectAsStateWithLifecycle()
    val galatSheet by vm.galatSheet.collectAsStateWithLifecycle()
    val sibuk by vm.sibuk.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    val versiForm by vm.versiForm.collectAsStateWithLifecycle()
    val buktiSibuk by vm.buktiSibuk.collectAsStateWithLifecycle()
    // Penanda offline-first bersama (app/ui/luring, A1-LURING.md §5).
    val luring by rememberStatusLuring()
    val tersimpanPada = ingatWaktuMuat(state as? MingguanUiState.Sukses)
    MingguanScreen(
        state = state,
        divisiTerpilih = divisiTerpilih,
        sheet = sheet,
        galatAksi = galatAksi,
        galatSheet = galatSheet,
        sibuk = sibuk,
        notifikasi = notifikasi,
        versiForm = versiForm,
        buktiSibuk = buktiSibuk,
        offline = offline || luring.luring,
        tersimpanPadaMs = tersimpanPada ?: luring.terakhirSinkronMs,
        menungguKirim = luring.menungguKirim,
        antrean = { DaftarAntreanOtomatis(kunciAwalan = KunciOutbox.AWALAN_MINGGUAN) },
        onUlang = vm::ulang,
        onPilihDivisi = vm::pilihDivisi,
        onPilihEntitas = vm::pilihEntitas,
        onBukaTambah = vm::bukaTambah,
        onBukaUbah = vm::bukaUbah,
        onBukaBukti = vm::bukaBukti,
        onTutupSheet = vm::tutupSheet,
        onCatatIsian = vm::catatIsian,
        onBuangDraf = vm::buangDraf,
        onSimpanButir = vm::simpanButir,
        onHapusButir = vm::hapusButir,
        onPindah = vm::pindah,
        onSimpanDraf = vm::simpanDraf,
        onSerahkan = vm::serahkan,
        onSetujui = vm::setujui,
        onNotifikasiTampil = vm::notifikasiTampil,
        onGalatAksiTampil = vm::galatAksiTampil,
        onAjukanBukaKunci = onAjukanBukaKunci,
        onUnggahBukti = vm::unggahBukti,
        onHapusBukti = vm::hapusBukti,
        urlBukti = vm::urlBukti,
        modifier = modifier,
    )
}

/** Versi status murni — mudah dipratinjau tanpa ViewModel. */
@Suppress("LongParameterList")
@Composable
fun MingguanScreen(
    state: MingguanUiState,
    divisiTerpilih: String? = null,
    sheet: SheetButir? = null,
    galatAksi: GalatAksi? = null,
    galatSheet: GalatSheet? = null,
    sibuk: Boolean = false,
    notifikasi: NotifikasiMingguan? = null,
    versiForm: Int = 0,
    /** "unggah" / id bukti yang sedang dihapus; null = bebas. */
    buktiSibuk: String? = null,
    offline: Boolean = false,
    /** Kapan data papan dimuat — banner "Luring · data tersimpan HH.MM". */
    tersimpanPadaMs: Long? = null,
    menungguKirim: Int = 0,
    /** Slot daftar tulisan "Menunggu kirim"/"Gagal kirim" (outbox mingguan). */
    antrean: @Composable () -> Unit = {},
    onUlang: () -> Unit = {},
    onPilihDivisi: (String) -> Unit = {},
    onPilihEntitas: (String) -> Unit = {},
    onBukaTambah: () -> Unit = {},
    onBukaUbah: (String) -> Unit = {},
    onBukaBukti: (String) -> Unit = onBukaUbah,
    onTutupSheet: () -> Unit = {},
    onCatatIsian: (IsianButir) -> Unit = {},
    onBuangDraf: () -> Unit = {},
    onSimpanButir: (IsianButir) -> Unit = {},
    onHapusButir: (String) -> Unit = {},
    onPindah: (String, ArahPindah) -> Unit = { _, _ -> },
    onSimpanDraf: () -> Unit = {},
    onSerahkan: () -> Unit = {},
    onSetujui: () -> Unit = {},
    onNotifikasiTampil: () -> Unit = {},
    onGalatAksiTampil: () -> Unit = {},
    onAjukanBukaKunci: (String) -> Unit = {},
    onUnggahBukti: (butirId: String, uri: Uri) -> Unit = { _, _ -> },
    onHapusBukti: (String) -> Unit = {},
    urlBukti: suspend (String) -> String? = { null },
    modifier: Modifier = Modifier,
) {
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notifikasi?.id) {
        notifikasi?.let {
            snackbar.showSnackbar(message = it.pesan, duration = SnackbarDuration.Short)
            onNotifikasiTampil()
        }
    }

    val sukses = state as? MingguanUiState.Sukses
    val divisi = sukses?.papan?.divisi?.firstOrNull { it.id == divisiTerpilih }
        ?: sukses?.papan?.divisi?.firstOrNull()
    val statusHeader = divisi?.laporan?.statusHeader.orEmpty()
    // Tulisan hanya pada DRAFT yang masih terbuka — menyunting butir laporan
    // yang sudah diserahkan menariknya kembali ke draf (backToDraft route),
    // jadi menunggu/disetujui dibaca saja supaya tidak ada penarikan diam-diam.
    val bisaTulisPapan = divisi != null && divisi.bisaTulis && statusHeader in setOf("", "DRAFT")
    val tampilFooter = divisi != null && divisi.bisaTulis &&
        (statusHeader in setOf("", "DRAFT") || (statusHeader == "MENUNGGU_PERSETUJUAN" && sukses?.papan?.bisaSetujui == true))

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
                .padding(
                    start = MkSpacing.space3,
                    end = MkSpacing.space3,
                    top = MkSpacing.space4,
                    // Ruang untuk footer sticky + FAB agar isi terakhir tak tertutup.
                    bottom = if (tampilFooter) 112.dp else MkSpacing.space6,
                ),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            if (offline) {
                BannerLuring(
                    modifier = Modifier.fillMaxWidth(),
                    tersimpanPadaMs = tersimpanPadaMs,
                    menungguKirim = menungguKirim,
                    onCobaLagi = onUlang,
                )
            }
            antrean()
            when (state) {
                MingguanUiState.Memuat -> repeat(3) { MkSkeleton(modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp)) }
                is MingguanUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
                is MingguanUiState.Sukses -> IsiPapan(
                    papan = state.papan,
                    divisi = divisi,
                    galatAksi = galatAksi,
                    onPilihDivisi = onPilihDivisi,
                    onPilihEntitas = onPilihEntitas,
                    onBukaUbah = onBukaUbah,
                    onPindah = onPindah,
                    onGalatAksiTampil = onGalatAksiTampil,
                    onAjukanBukaKunci = onAjukanBukaKunci,
                    onBukaTambah = onBukaTambah,
                    onBukaBukti = onBukaBukti,
                )
            }
        }

        // Footer sticky: "Simpan draf" SEKUNDER + primer kontekstual.
        if (tampilFooter && divisi != null) {
            FooterMingguan(
                statusHeader = statusHeader,
                bisaSetujui = sukses?.papan?.bisaSetujui == true,
                adaButir = !divisi.laporan?.butir.isNullOrEmpty(),
                sibuk = sibuk,
                onSimpanDraf = onSimpanDraf,
                onSerahkan = onSerahkan,
                onSetujui = onSetujui,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }

        // E2E-R2 N8: "Tambah butir" tidak lagi FAB melayang (menutupi persen
        // progres kartu butir pertama di atas footer) — kini tombol sebaris di
        // atas papan (IsiPapan), footer tetap memegang aksi primer.

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = if (tampilFooter) 100.dp else MkSpacing.space10),
        )
    }

    // ButirSheet — di luar Box agar MkSheet mengatur sisi/lebar layarnya sendiri.
    if (sukses != null && divisi != null && sheet != null) {
        ButirSheet(
            papan = sukses.papan,
            divisi = divisi,
            buka = sheet,
            versiForm = versiForm,
            galatSheet = galatSheet,
            sibuk = sibuk,
            bolehEdit = bisaTulisPapan,
            // Bukti boleh dikelola selama baris laporan masih bisa ditulis — juga
            // saat MENUNGGU_PERSETUJUAN (Setujui ditolak 422 bila butir tanpa bukti).
            bolehBukti = divisi.bisaTulis && statusHeader != "DISETUJUI",
            buktiSibuk = buktiSibuk,
            onTutup = onTutupSheet,
            onCatatIsian = onCatatIsian,
            onBuangDraf = onBuangDraf,
            onSimpan = onSimpanButir,
            onHapus = onHapusButir,
            onAjukanBukaKunci = onAjukanBukaKunci,
            onUnggahBukti = onUnggahBukti,
            onHapusBukti = onHapusBukti,
            urlBukti = urlBukti,
        )
    }
}

// ------------------------------------------------------------------
// Isi papan
// ------------------------------------------------------------------

@Suppress("LongParameterList")
@Composable
private fun IsiPapan(
    papan: PapanMingguan,
    divisi: DivisiMingguan?,
    galatAksi: GalatAksi?,
    onPilihDivisi: (String) -> Unit,
    onPilihEntitas: (String) -> Unit,
    onBukaUbah: (String) -> Unit,
    onPindah: (String, ArahPindah) -> Unit,
    onGalatAksiTampil: () -> Unit,
    onAjukanBukaKunci: (String) -> Unit,
    onBukaTambah: () -> Unit = {},
    onBukaBukti: (String) -> Unit = onBukaUbah,
) {
    val warna = LocalMkColors.current
    val statusHeader = divisi?.laporan?.statusHeader.orEmpty()
    val butir = divisi?.laporan?.butir.orEmpty()
    val bisaTulisPapan = divisi != null && divisi.bisaTulis && statusHeader in setOf("", "DRAFT")

    // Kepala layar: minggu ke-n + StatusBadge statusHeader + kalimat ringkas.
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(text = "Capaian mingguan", style = MkTypography.title2, color = warna.ink)
        val rentang = rentangMingguan(papan.mulaiIso, papan.selesaiIso)
        Text(
            text = if (rentang != null) "Minggu ke-${papan.mingguKe} · $rentang" else "Minggu ke-${papan.mingguKe}",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        StatusBadge(status = mkStatusHeader(statusHeader), text = labelStatusHeader(statusHeader))
        Text(
            // E2E-1 #9: N/A tidak dihitung (sama dengan Meja kerja dan Ringkasan).
            text = teksHitungButir(butir),
            style = MkTypography.body,
            color = warna.ink,
        )
        Text(text = papan.teksSerah, style = MkTypography.footnote, color = warna.ink2)
    }

    // D1: TI/Super Admin memilih PT (web DivisionWeeklyDesk); peran berlingkup terpaku.
    if (!papan.entitasTerpaku && papan.entitas.size > 1) {
        val opsiPt = papan.entitas.map { MkOpsi(value = it.id, label = it.label) }
        MkPilih(
            pilihan = opsiPt,
            terpilih = opsiPt.firstOrNull { it.value == papan.entitasId },
            onPilih = { onPilihEntitas(it.value) },
            label = "Entitas yang dilaporkan",
        )
    }

    // Divisi yang dipimpin lebih dari satu: pilih papannya (GET membawa semuanya).
    if (papan.divisi.size > 1) {
        val opsi = papan.divisi.map { MkOpsi(value = it.id, label = it.nama) }
        MkPilih(
            pilihan = opsi,
            terpilih = opsi.firstOrNull { it.value == divisi?.id },
            onPilih = { onPilihDivisi(it.value) },
            label = "Divisi",
        )
    }

    // Galat aksi (serah/setujui/pindah/hapus) — setara role="alert" web.
    KotakGalatAksi(galat = galatAksi, onTutup = onGalatAksiTampil, onAjukanBukaKunci = onAjukanBukaKunci)

    // E2E-1 #2: butir berjalan/selesai/terkendala tanpa bukti akan ditolak 422
    // saat Serahkan/Setujui — beri tahu lebih dulu, ketuk untuk melampirkan.
    val tanpaBukti = butirTanpaBukti(butir)
    if (divisi?.bisaTulis == true && statusHeader != "DISETUJUI" && tanpaBukti.isNotEmpty()) {
        CatatanTanpaBukti(butir = tanpaBukti, onBuka = onBukaBukti)
    }

    when {
        // Laporan sudah disetujui — papan dibaca saja, tanpa tombol tulis.
        statusHeader == "DISETUJUI" -> MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(
                teks = "Laporan minggu ini sudah disetujui. Perubahan berikutnya lewat permohonan buka kunci yang disetujui.",
                done = true,
            )
        }
        // Baris dikunci / minggu lewat / sudah diteruskan — alasan + jalan keluarnya.
        divisi?.bisaTulis == false -> CatatanKunci(divisi = divisi, onAjukanBukaKunci = onAjukanBukaKunci)
        statusHeader == "TERKUNCI" -> MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(
                teks = divisi?.alasanKunci
                    ?: "Laporan minggu ini sudah dikunci. Ajukan permohonan buka kunci untuk mengubahnya.",
                ikon = Icons.Outlined.Lock,
            )
        }
    }

    // Tombol tambah butir sebaris (pengganti FAB, E2E-R2 N8).
    if (bisaTulisPapan) {
        MkButton(
            label = "Tambah butir",
            onClick = onBukaTambah,
            variant = MkButtonVariant.SECONDARY,
            size = MkButtonSize.S,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    if (butir.isEmpty()) {
        if (bisaTulisPapan) {
            MkCard(modifier = Modifier.fillMaxWidth()) {
                EmptyNote(teks = "Belum ada butir capaian minggu ini. Tambahkan butir pertama untuk menyusun laporan.")
            }
        }
    } else {
        PapanButir(semua = butir, bisaEdit = bisaTulisPapan, onBukaUbah = onBukaUbah, onPindah = onPindah)
    }
}

/** Kenapa papan tidak bisa ditulis + jalan keluarnya (buka kunci). */
@Composable
private fun CatatanKunci(divisi: DivisiMingguan, onAjukanBukaKunci: (String) -> Unit) {
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
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Icon(imageVector = Icons.Outlined.Lock, contentDescription = null, tint = warna.ink2)
            Text(text = "Terkunci", style = MkTypography.bodyStrong, color = warna.ink)
            if (divisi.bukaSampaiIso != null) {
                StatusBadge(
                    status = MkStatus.INFO,
                    size = MkBadgeSize.SM,
                    text = "Dibuka sampai ${jamWib(divisi.bukaSampaiIso) ?: "-"} WIB",
                )
            }
        }
        Text(
            text = divisi.alasanKunci ?: "Laporan minggu ini tidak bisa diubah sekarang.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        val idLaporan = divisi.laporan?.id
        if (idLaporan != null) {
            MkButton(
                label = "Ajukan buka kunci",
                variant = MkButtonVariant.SECONDARY,
                size = MkButtonSize.S,
                onClick = { onAjukanBukaKunci(idLaporan) },
            )
        } else {
            Text(
                text = "Belum ada laporan tersimpan untuk minggu ini, jadi tidak ada yang bisa dibuka.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
    }
}

/** Banner galat aksi dengan tombol tutup + "Ajukan buka kunci" (409 beku). */
@Composable
private fun KotakGalatAksi(galat: GalatAksi?, onTutup: () -> Unit, onAjukanBukaKunci: (String) -> Unit) {
    if (galat == null) return
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
            Text(
                text = pesanGalatAksi(galat),
                style = MkTypography.footnote,
                color = warna.ink,
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier
                    // C3-R3: target sentuh minimal 48dp (ikon tetap 24dp).
                    .minimumInteractiveComponentSize()
                    .size(24.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onTutup),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Outlined.Close,
                    contentDescription = "Tutup pesan galat",
                    tint = warna.ink2,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
        if (galat is GalatAksi.Beku && galat.reportId != null) {
            MkButton(
                label = "Ajukan buka kunci",
                variant = MkButtonVariant.SECONDARY,
                size = MkButtonSize.S,
                onClick = { onAjukanBukaKunci(galat.reportId) },
            )
        }
    }
}

// ------------------------------------------------------------------
// Papan tiga kolom
// ------------------------------------------------------------------

/**
 * Papan butir: tiga kolom penuh ≥600dp; di bawah itu segmen bergilir
 * (MkSegmented). Papan baca-saja memakai MkBoardColumn; papan yang bisa
 * ditulis memakai kartu yang bisa diketuk (buka ButirSheet) dengan tombol
 * naik/turun selajur.
 */
@Composable
private fun PapanButir(
    semua: List<ButirMingguan>,
    bisaEdit: Boolean,
    onBukaUbah: (String) -> Unit,
    onPindah: (String, ArahPindah) -> Unit,
) {
    val kolom = bagiKolom(semua)
    BoxWithConstraints {
        if (maxWidth >= 600.dp) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
            ) {
                kolom.forEach { (kunci, isi) ->
                    KolomPapan(labelKolom(kunci), isi, semua, bisaEdit, onBukaUbah, onPindah, Modifier.weight(1f))
                }
            }
        } else {
            var terpilih by rememberSaveable { mutableStateOf(kolomAwal(kolom)) }
            if (terpilih !in kolom) terpilih = kolomAwal(kolom)
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                MkSegmentedControl(
                    options = kolom.map { (kunci, isi) -> MkOpsi(value = kunci, label = labelKolom(kunci), count = isi.size) },
                    terpilih = terpilih,
                    onPilih = { terpilih = it },
                )
                KolomPapan(
                    judul = labelKolom(terpilih),
                    butir = kolom[terpilih].orEmpty(),
                    semua = semua,
                    bisaEdit = bisaEdit,
                    onBukaUbah = onBukaUbah,
                    onPindah = onPindah,
                )
            }
        }
    }
}

/** Tautan "Lampirkan bukti" paling banyak di catatan (sisanya lewat papan). */
private const val MAKS_TAUTAN_BUKTI = 3

/** Daftar butir yang belum berbukti — ketuk untuk membuka dan melampirkan bukti. */
@Composable
private fun CatatanTanpaBukti(butir: List<ButirMingguan>, onBuka: (String) -> Unit) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.statusRiskSoft)
            .padding(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Text(
            text = "${butir.size} butir belum berbukti",
            style = MkTypography.bodyStrong,
            color = warna.ink,
        )
        Text(
            text = "Butir berjalan, terkendala, atau selesai wajib punya minimal 1 bukti sebelum laporan diserahkan atau disetujui.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        butir.take(MAKS_TAUTAN_BUKTI).forEach { b ->
            MkButton(
                label = "Lampirkan bukti · ${b.pekerjaan.take(40)}",
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
                onClick = { onBuka(b.id) },
            )
        }
        if (butir.size > MAKS_TAUTAN_BUKTI) {
            Text(
                text = "${butir.size - MAKS_TAUTAN_BUKTI} butir lain: buka dari papan di bawah.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
    }
}

/** Satu kolom: MkBoardColumn saat baca-saja; kartu sunting saat bisa ditulis. */
@Suppress("LongParameterList")
@Composable
private fun KolomPapan(
    judul: String,
    butir: List<ButirMingguan>,
    semua: List<ButirMingguan>,
    bisaEdit: Boolean,
    onBukaUbah: (String) -> Unit,
    onPindah: (String, ArahPindah) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!bisaEdit) {
        MkBoardColumn(
            modifier = modifier,
            judul = judul,
            kartu = butir.map {
                MkKartuPapan(
                    id = it.id,
                    judul = it.pekerjaan,
                    status = mkStatusButir(it.status),
                    progres = it.progres,
                    label = labelStatusButir(it.status),
                )
            },
            // Papan baca-saja tetap bisa dibuka (detail + bukti) — tanpa menyunting isian.
            onBuka = onBukaUbah,
        )
        return
    }
    val warna = LocalMkColors.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            modifier = Modifier.padding(horizontal = MkSpacing.space1),
        ) {
            Text(text = judul, style = MkTypography.caption, color = warna.ink2, modifier = Modifier.weight(1f))
            Text(text = butir.size.toString(), style = MkTypography.caption.tabular, color = warna.ink2)
        }
        if (butir.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MkShapes.kartu)
                    .background(color = warna.surface2)
                    .border(1.dp, warna.line, MkShapes.kartu)
                    .padding(vertical = MkSpacing.space4),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = "Belum ada kartu.", style = MkTypography.footnote, color = warna.ink2)
            }
        } else {
            butir.forEach { b ->
                KartuButir(
                    butir = b,
                    semua = semua,
                    onBuka = { onBukaUbah(b.id) },
                    onPindah = onPindah,
                )
            }
        }
    }
}

/**
 * Kartu butir sunting: bahasa visual KartuPapan MkBoardColumn (inset surface-2,
 * garis 1dp, radius kartu) + meta aspek/prioritas/hari, lencana status dengan
 * kata persis, trek progres, dan tombol naik/turun selajur. Mengetuk kartu
 * membuka ButirSheet.
 */
@Composable
private fun KartuButir(
    butir: ButirMingguan,
    semua: List<ButirMingguan>,
    onBuka: () -> Unit,
    onPindah: (String, ArahPindah) -> Unit,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.kartu)
            .background(color = warna.surface2)
            .border(1.dp, warna.line, MkShapes.kartu)
            .clickable(onClick = onBuka)
            .padding(all = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Text(
                text = butir.pekerjaan,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            TombolArah(
                ikon = Icons.Outlined.KeyboardArrowUp,
                label = "Naikkan urutan",
                enabled = bisaPindah(semua, butir.id, ArahPindah.NAIK),
                onClick = { onPindah(butir.id, ArahPindah.NAIK) },
            )
            TombolArah(
                ikon = Icons.Outlined.KeyboardArrowDown,
                label = "Turunkan urutan",
                enabled = bisaPindah(semua, butir.id, ArahPindah.TURUN),
                onClick = { onPindah(butir.id, ArahPindah.TURUN) },
            )
        }
        Text(
            text = metaButir(butir),
            style = MkTypography.footnote,
            color = warna.ink2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            StatusBadge(
                status = mkStatusButir(butir.status),
                size = MkBadgeSize.SM,
                text = labelStatusButir(butir.status),
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(4.dp)
                    .clip(MkShapes.penuh)
                    .background(color = warna.fill2),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(fraction = butir.progres.coerceIn(0, 100) / 100f)
                        .height(4.dp)
                        .clip(MkShapes.penuh)
                        .background(color = warnaStatus(status = mkStatusButir(butir.status))),
                )
            }
            Text(
                text = "${butir.progres.coerceIn(0, 100)}%",
                style = MkTypography.caption.tabular,
                color = warna.ink2,
                maxLines = 1,
            )
        }
    }
}

/** Tombol naik/turun kecil 32dp (setelan TombolUrut MkBoardColumn). */
@Composable
private fun TombolArah(ikon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    val warna = LocalMkColors.current
    Box(
        modifier = Modifier
            // C3-R3: target sentuh minimal 48dp (lingkaran tetap 32dp).
            .minimumInteractiveComponentSize()
            .size(32.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = ikon,
            contentDescription = label,
            tint = warna.ink2.copy(alpha = if (enabled) 1f else 0.3f),
            modifier = Modifier.size(18.dp),
        )
    }
}

// ------------------------------------------------------------------
// Footer sticky
// ------------------------------------------------------------------

@Composable
private fun FooterMingguan(
    statusHeader: String,
    bisaSetujui: Boolean,
    adaButir: Boolean,
    sibuk: Boolean,
    onSimpanDraf: () -> Unit,
    onSerahkan: () -> Unit,
    onSetujui: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    Surface(modifier = modifier.fillMaxWidth(), color = warna.surface) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                // Sejajar dengan margin samping layar 12dp.
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            when {
                statusHeader == "MENUNGGU_PERSETUJUAN" && bisaSetujui -> MkButton(
                    label = "Setujui laporan",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !sibuk,
                    modifier = Modifier.weight(1f),
                    onClick = onSetujui,
                )
                else -> {
                    MkButton(
                        label = "Simpan draf",
                        variant = MkButtonVariant.SECONDARY,
                        enabled = !sibuk,
                        modifier = Modifier.weight(1f),
                        onClick = onSimpanDraf,
                    )
                    MkButton(
                        label = "Serahkan",
                        variant = MkButtonVariant.PRIMARY,
                        // Server menolak serah tanpa butir (422) — matikan lebih dulu.
                        enabled = !sibuk && adaButir,
                        modifier = Modifier.weight(1f),
                        onClick = onSerahkan,
                    )
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// ButirSheet — tambah/ubah/baca satu butir
// ------------------------------------------------------------------

@Suppress("LongParameterList")
@Composable
private fun ButirSheet(
    papan: PapanMingguan,
    divisi: DivisiMingguan,
    buka: SheetButir,
    versiForm: Int,
    galatSheet: GalatSheet?,
    sibuk: Boolean,
    bolehEdit: Boolean,
    onTutup: () -> Unit,
    onSimpan: (IsianButir) -> Unit,
    onHapus: (String) -> Unit,
    onAjukanBukaKunci: (String) -> Unit,
    bolehBukti: Boolean = false,
    buktiSibuk: String? = null,
    onUnggahBukti: (String, Uri) -> Unit = { _, _ -> },
    onHapusBukti: (String) -> Unit = {},
    urlBukti: suspend (String) -> String? = { null },
    onCatatIsian: (IsianButir) -> Unit = {},
    onBuangDraf: () -> Unit = {},
) {
    val butir = buka.butir
    // Bukti dibaca dari papan TERBARU (unggah/hapus memuat ulang papan tanpa
    // mengikat ulang isian), bukan dari potret butir saat Sheet dibuka.
    val buktiKini = butir?.let { b -> divisi.laporan?.butir?.firstOrNull { it.id == b.id }?.bukti ?: b.bukti }.orEmpty()

    // Isian diikat ke (versiForm, id butir, draf) — setelah 409 beku + muat
    // ulang, isian diambil ulang dari butir termuat. G1: Sheet yang dibuka dengan draf otomatis memakai isian draf;
    // "Buang draf" menghapus draf sehingga isian kembali ke butir tersimpan.
    val kunci = "${versiForm}:${butir?.id ?: "baru"}:${buka.drafPada ?: 0}"
    val awal = buka.draf ?: isianAwalButir(butir)
    var aspekId by remember(kunci) { mutableStateOf(awal.aspekId) }
    var prioritasId by remember(kunci) { mutableStateOf(awal.prioritasId) }
    var pekerjaan by remember(kunci) { mutableStateOf(awal.pekerjaan) }
    var target by remember(kunci) { mutableStateOf(awal.target) }
    var picNama by remember(kunci) { mutableStateOf(awal.picNama) }
    var status by remember(kunci) { mutableStateOf(awal.status) }
    var progresTeks by remember(kunci) { mutableStateOf(awal.progres.toString()) }
    var capaian by remember(kunci) { mutableStateOf(awal.capaian) }
    var kendala by remember(kunci) { mutableStateOf(awal.kendala) }
    var tindakLanjut by remember(kunci) { mutableStateOf(awal.tindakLanjut) }
    var periksa by remember(kunci) { mutableStateOf(false) }
    var konfirmasiHapus by remember { mutableStateOf(false) }
    var konfirmasiHapusBukti by remember { mutableStateOf<BuktiButir?>(null) }
    val pilihFoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null && butir != null) onUnggahBukti(butir.id, uri)
    }
    val pilihBerkas = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && butir != null) onUnggahBukti(butir.id, uri)
    }
    val cakupan = rememberCoroutineScope()
    val pembuka = LocalUriHandler.current

    val wajibKendala = status == "TERKENDALA"

    // Perubahan dideteksi dengan membandingkan isian (draf otomatis G1), bukan penanda kotor.
    fun ubah(nilai: String): String = nilai

    fun cekSekarang() = cekIsian(aspekId, prioritasId, pekerjaan, target, picNama, status, capaian, kendala)

    fun isianSekarang() = IsianButir(
        aspekId = aspekId,
        prioritasId = prioritasId,
        pekerjaan = pekerjaan,
        target = target,
        picNama = picNama,
        status = status,
        progres = progresTeks.toIntOrNull()?.coerceIn(0, 100) ?: 0,
        capaian = capaian,
        kendala = kendala,
        tindakLanjut = tindakLanjut,
    )

    fun kirim() {
        if (cekSekarang().ada()) {
            periksa = true
        } else {
            onSimpan(isianSekarang())
        }
    }

    // G1: setiap perubahan isian dilaporkan ke ViewModel (draf otomatis).
    if (bolehEdit) {
        LaunchedEffect(kunci) {
            snapshotFlow { isianSekarang() }.collect { onCatatIsian(it) }
        }
    }

    MkSheet(
        visible = true,
        onTutup = onTutup,
        // G1 (menggantikan E2E-1 #5): geser/scrim/Kembali boleh menutup walau
        // isian berubah — perubahan disimpan sebagai draf otomatis dan dipulihkan
        // saat Sheet dibuka lagi. Konfirmasi dialog hanya untuk hapus.
        bolehTutupGeser = !sibuk,
        // Galat PUT/unggah menempel di atas tombol Simpan (E2E-1 #10).
        galat = slotGalatSheet(galatSheet, onAjukanBukaKunci),
        judul = butir?.pekerjaan?.takeIf { it.isNotBlank() } ?: "Butir capaian baru",
        subjudul = buildString {
            append(divisi.nama)
            append(" · Minggu ke-").append(papan.mingguKe)
        },
        backLabel = "Papan",
        footer = {
            if (bolehEdit) {
                if (butir != null) {
                    MkButton(
                        label = "Hapus butir",
                        variant = MkButtonVariant.SECONDARY,
                        size = MkButtonSize.S,
                        enabled = !sibuk,
                        onClick = { konfirmasiHapus = true },
                    )
                }
                MkButton(
                    label = "Simpan butir",
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !sibuk,
                    modifier = Modifier.weight(1f),
                    onClick = ::kirim,
                )
            } else {
                MkButton(label = "Tutup", modifier = Modifier.weight(1f), onClick = onTutup)
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            buka.drafPada?.takeIf { buka.draf != null && bolehEdit }?.let { pada ->
                PenandaDrafPulih(disimpanPadaMs = pada, onBuang = onBuangDraf, enabled = !sibuk)
            }
            PilihOpsi(
                label = "Aspek",
                opsi = papan.aspek.map { MkOpsi(value = it.id, label = it.label) },
                nilai = aspekId,
                enabled = bolehEdit,
                kesalahan = if (periksa) cekSekarang().aspek else null,
                wajib = true,
                onPilih = { aspekId = ubah(it.value) },
            )
            PilihOpsi(
                label = "Prioritas",
                opsi = papan.prioritas.map { MkOpsi(value = it.id, label = it.label) },
                nilai = prioritasId,
                enabled = bolehEdit,
                kesalahan = if (periksa) cekSekarang().prioritas else null,
                wajib = true,
                onPilih = { prioritasId = ubah(it.value) },
            )
            MkField(
                nilai = pekerjaan,
                onUbah = { pekerjaan = ubah(it.take(4000)) },
                label = "Pekerjaan",
                placeholder = "Mis. migrasi data gudang tahap 2",
                baris = 2,
                enabled = bolehEdit,
                isError = periksa && cekSekarang().pekerjaan != null,
                supportingText = if (periksa) cekSekarang().pekerjaan else "Uraian pekerjaan yang dikerjakan minggu ini.",
            )
            MkField(
                nilai = target,
                onUbah = { target = ubah(it.take(4000)) },
                label = "Target output",
                placeholder = "Mis. data 2 gudang termigrasi tanpa galat",
                baris = 2,
                enabled = bolehEdit,
                isError = periksa && cekSekarang().target != null,
                supportingText = if (periksa) cekSekarang().target else null,
            )
            MkField(
                nilai = picNama,
                onUbah = { picNama = ubah(it.take(500)) },
                label = "PIC",
                placeholder = "Nama penanggung jawab butir ini",
                enabled = bolehEdit,
                isError = periksa && cekSekarang().pic != null,
                supportingText = if (periksa) cekSekarang().pic else null,
            )
            PilihOpsi(
                label = "Status",
                opsi = STATUS_BUTIR.map { MkOpsi(value = it, label = labelStatusButir(it)) },
                nilai = status,
                enabled = bolehEdit,
                wajib = true,
                onPilih = { status = ubah(it.value) },
            )
            MedanProgres(
                nilai = progresTeks,
                enabled = bolehEdit,
                onUbah = { teks ->
                    val angka = teks.filter { it.isDigit() }.take(3)
                    progresTeks = ubah(if ((angka.toIntOrNull() ?: 0) > 100) "100" else angka)
                },
            )
            MkField(
                nilai = capaian,
                onUbah = { capaian = ubah(it.take(4000)) },
                label = "Capaian minggu ini",
                placeholder = "Apa yang selesai minggu ini untuk pekerjaan ini?",
                baris = 3,
                enabled = bolehEdit,
                isError = periksa && cekSekarang().capaian != null,
                supportingText = if (periksa) cekSekarang().capaian else null,
            )
            MkField(
                nilai = kendala,
                onUbah = { kendala = ubah(it.take(2000)) },
                label = "Kendala",
                placeholder = "Apa yang menghambat? Diisi bila perlu",
                baris = 2,
                enabled = bolehEdit,
                isError = periksa && cekSekarang().kendala != null,
                supportingText = when {
                    periksa && cekSekarang().kendala != null -> cekSekarang().kendala
                    wajibKendala -> "Wajib untuk status Terkendala."
                    else -> "Opsional · wajib bila Terkendala"
                },
            )
            MkField(
                nilai = tindakLanjut,
                onUbah = { tindakLanjut = ubah(it.take(2000)) },
                label = "Tindak lanjut",
                placeholder = "Langkah berikutnya menghadapi kendala",
                baris = 2,
                enabled = bolehEdit,
            )
            // E2E-R2 N6: dibuka dari tautan "Lampirkan bukti" → gulir ke sini.
            val keBukti = remember { BringIntoViewRequester() }
            LaunchedEffect(butir?.id, buka.keBukti) {
                if (buka.keBukti) {
                    delay(350) // tunggu Sheet selesai tata letak/animasi masuk
                    keBukti.bringIntoView()
                }
            }
            BagianBukti(
                modifier = Modifier.bringIntoViewRequester(keBukti),
                butirTersimpan = butir != null,
                wajib = butirWajibBukti(status),
                bukti = buktiKini,
                boleh = bolehBukti,
                buktiSibuk = buktiSibuk,
                onFoto = { pilihFoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onBerkas = { pilihBerkas.launch(MIME_BUKTI) },
                onBuka = { b -> cakupan.launch { urlBukti(b.id)?.let { runCatching { pembuka.openUri(it) } } } },
                onHapus = { konfirmasiHapusBukti = it },
            )
        }

        konfirmasiHapusBukti?.let { b ->
            AlertDialog(
                onDismissRequest = { konfirmasiHapusBukti = null },
                title = { Text(text = "Hapus bukti ini?") },
                text = { Text(text = "${b.nama} dihapus dari butir dan tidak bisa dikembalikan.") },
                confirmButton = {
                    TextButton(onClick = {
                        konfirmasiHapusBukti = null
                        onHapusBukti(b.id)
                    }) { Text(text = "Hapus bukti") }
                },
                dismissButton = {
                    TextButton(onClick = { konfirmasiHapusBukti = null }) { Text(text = "Batal") }
                },
            )
        }
        if (konfirmasiHapus && butir != null) {
            AlertDialog(
                onDismissRequest = { konfirmasiHapus = false },
                title = { Text(text = "Hapus butir?") },
                text = { Text(text = "Butir \"${butir.pekerjaan}\" dan lampirannya dihapus dari laporan minggu ini.") },
                confirmButton = {
                    TextButton(onClick = {
                        konfirmasiHapus = false
                        onHapus(butir.id)
                    }) { Text(text = "Hapus butir") }
                },
                dismissButton = {
                    TextButton(onClick = { konfirmasiHapus = false }) { Text(text = "Batal") }
                },
            )
        }
    }
}

/** Jenis berkas yang ditawarkan pemilih dokumen (MIME_DIIZINKAN server). */
private val MIME_BUKTI = arrayOf(
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
    "image/*",
)

/**
 * Bagian "Bukti" butir (EvidencePanel WEEKLY_ITEM web): daftar lampiran
 * (ketuk = buka, ikon = hapus), unggah foto/berkas. Butir baru: bukti setelah
 * butir tersimpan. [wajib] = status selain Belum mulai/N/A.
 */
@Suppress("LongParameterList")
@Composable
private fun BagianBukti(
    butirTersimpan: Boolean,
    wajib: Boolean,
    bukti: List<BuktiButir>,
    boleh: Boolean,
    buktiSibuk: String?,
    onFoto: () -> Unit,
    onBerkas: () -> Unit,
    onBuka: (BuktiButir) -> Unit,
    onHapus: (BuktiButir) -> Unit,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Text(text = "Bukti", style = MkTypography.callout, color = warna.ink)
            if (wajib) Text(text = "Wajib minimal 1", style = MkTypography.caption, color = warna.statusLate)
        }
        when {
            !butirTersimpan -> Text(
                text = "Foto dan dokumen dapat dilampirkan setelah butir disimpan.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            bukti.isEmpty() -> Text(
                text = if (wajib) {
                    "Belum ada bukti. Status ini butuh minimal 1 bukti sebelum laporan diserahkan."
                } else {
                    "Belum ada bukti."
                },
                style = MkTypography.footnote,
                color = if (wajib) warna.statusLate else warna.ink2,
            )
        }
        bukti.forEach { b ->
            MkLampiranRow(
                modifier = Modifier.clickable { onBuka(b) },
                namaBerkas = b.nama,
                ukuranLabel = ukuranBukti(b.ukuran),
                sedangUnggah = buktiSibuk == b.id,
                onHapus = if (boleh && buktiSibuk == null) ({ onHapus(b) }) else null,
            )
        }
        if (buktiSibuk == UNGGAH) MkLampiranRow(namaBerkas = "Bukti baru", ukuranLabel = "", sedangUnggah = true)
        if (butirTersimpan && boleh) {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkButton(
                    label = if (buktiSibuk == UNGGAH) "Mengunggah…" else "Lampirkan foto",
                    size = MkButtonSize.S,
                    enabled = buktiSibuk == null,
                    onClick = onFoto,
                )
                MkButton(
                    label = "Lampirkan berkas",
                    variant = MkButtonVariant.PLAIN,
                    size = MkButtonSize.S,
                    enabled = buktiSibuk == null,
                    onClick = onBerkas,
                )
            }
            Text(
                text = "Foto dikompres otomatis (sisi terpanjang 2048 px). Berkas maksimal 20 MB.",
                style = MkTypography.caption,
                color = warna.ink2,
            )
        }
    }
}

/** "1,2 MB" / "340 KB" — ukuran lampiran. */
internal fun ukuranBukti(bait: Int): String = when {
    bait >= 1024 * 1024 -> String.format(java.util.Locale.forLanguageTag("id-ID"), "%.1f MB", bait / 1048576.0)
    bait >= 1024 -> "${bait / 1024} KB"
    bait > 0 -> "$bait B"
    else -> "Berkas"
}

/** MkPilih + label "Wajib" + baris kesalahan (padanan pola MkPilih LaporanHarian). */
@Composable
private fun PilihOpsi(
    label: String,
    opsi: List<MkOpsi>,
    nilai: String,
    onPilih: (MkOpsi) -> Unit,
    wajib: Boolean = false,
    enabled: Boolean = true,
    kesalahan: String? = null,
) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Text(text = label, style = MkTypography.callout, color = warna.ink)
            if (wajib) Text(text = "Wajib", style = MkTypography.caption, color = warna.statusLate)
        }
        MkPilih(
            pilihan = opsi,
            terpilih = opsi.firstOrNull { it.value == nilai },
            onPilih = onPilih,
            label = label,
            enabled = enabled,
        )
        kesalahan?.let { Text(text = it, style = MkTypography.footnote, color = warna.statusLate) }
    }
}

/** Kolom progres 0–100 dengan papan angka dan akhiran "%" (token warna MkField). */
@Composable
private fun MedanProgres(nilai: String, enabled: Boolean, onUbah: (String) -> Unit) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    OutlinedTextField(
        value = nilai,
        onValueChange = onUbah,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(0.5f),
        textStyle = MkTypography.body,
        label = { Text(text = "Progres") },
        singleLine = true,
        suffix = { Text(text = "%", style = MkTypography.body, color = warna.ink2) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        shape = MkShapes.md,
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = warna.ink,
            unfocusedTextColor = warna.ink,
            disabledTextColor = warna.ink3,
            cursorColor = aksen.text,
            focusedBorderColor = aksen.text,
            unfocusedBorderColor = warna.lineStrong,
            disabledBorderColor = warna.line,
            focusedLabelColor = aksen.text,
            unfocusedLabelColor = warna.ink2,
            disabledLabelColor = warna.ink3,
        ),
    )
}

/** Slot galat MkSheet (menempel di atas footer); null bila tidak ada galat. */
private fun slotGalatSheet(galat: GalatSheet?, onAjukanBukaKunci: (String) -> Unit): (@Composable () -> Unit)? =
    if (galat == null) null else ({ KotakGalatSheet(galat = galat, onAjukanBukaKunci = onAjukanBukaKunci) })

/** Galat PUT terakhir di dalam sheet (409/422/lainnya). */
@Composable
private fun KotakGalatSheet(galat: GalatSheet?, onAjukanBukaKunci: (String) -> Unit) {
    if (galat == null) return
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
            Text(
                text = pesanGalatSheet(galat),
                style = MkTypography.footnote,
                color = warna.ink,
                modifier = Modifier.weight(1f),
            )
        }
        if (galat is GalatSheet.Beku && galat.reportId != null) {
            MkButton(
                label = "Ajukan buka kunci",
                variant = MkButtonVariant.SECONDARY,
                size = MkButtonSize.S,
                onClick = { onAjukanBukaKunci(galat.reportId) },
            )
        }
    }
}

// ------------------------------------------------------------------
// Logika pembantu murni (mudah diuji)
// ------------------------------------------------------------------

/** Status butir yang bisa dipilih di sheet (WEEKLY_ITEM_STATUSES lock.ts). */
private val STATUS_BUTIR = listOf("BELUM_MULAI", "ON_PROGRESS", "SELESAI", "TERKENDALA", "NA")

/** Label kolom papan dari kuncinya. */
internal fun labelKolom(key: String): String = when (key) {
    "berjalan" -> "Berjalan"
    "selesai" -> "Selesai"
    "na" -> "N/A"
    else -> "Belum"
}

/** Kolom segmen mula-mula: yang isinya paling relevan (berjalan → belum → selesai). */
internal fun kolomAwal(kolom: Map<String, List<ButirMingguan>>): String =
    listOf("berjalan", "belum", "selesai", "na").firstOrNull { !kolom[it].isNullOrEmpty() } ?: "berjalan"

/** "Aspek · Prioritas · Kam" — meta baris kartu; hari hanya bila butir berhari. */
internal fun metaButir(b: ButirMingguan): String = buildString {
    if (b.aspekNama.isNotBlank()) append(b.aspekNama)
    if (b.prioritasNama.isNotBlank()) {
        if (isNotEmpty()) append(" · ")
        append(b.prioritasNama)
    }
    singkatanHari(b.hariKerjaIso)?.let {
        if (isNotEmpty()) append(" · ")
        append(it)
    }
    if (isEmpty()) append("Tanpa aspek")
}

/** Pra-validasi ramah sebelum PUT — padanan 422 rute (bukan penggantinya). */
data class CekIsianButir(
    val aspek: String?,
    val prioritas: String?,
    val pekerjaan: String?,
    val target: String?,
    val pic: String?,
    val capaian: String?,
    val kendala: String?,
) {
    fun ada(): Boolean = aspek != null || prioritas != null || pekerjaan != null ||
        target != null || pic != null || capaian != null || kendala != null
}

internal fun cekIsian(
    aspekId: String,
    prioritasId: String,
    pekerjaan: String,
    target: String,
    picNama: String,
    status: String,
    capaian: String,
    kendala: String,
): CekIsianButir = CekIsianButir(
    aspek = aspekId.takeIf { it.isBlank() }?.let { "Pilih aspek dulu." },
    prioritas = prioritasId.takeIf { it.isBlank() }?.let { "Pilih prioritas dulu." },
    pekerjaan = pekerjaan.takeIf { it.isBlank() }?.let { "Uraian pekerjaan wajib diisi." },
    target = target.takeIf { it.isBlank() }?.let { "Target output wajib diisi." },
    pic = picNama.takeIf { it.isBlank() }?.let { "PIC wajib diisi." },
    capaian = capaian.takeIf { it.isBlank() }?.let { "Capaian minggu ini wajib diisi." },
    kendala = if (status == "TERKENDALA" && kendala.isBlank()) {
        "Kendala wajib diisi untuk status Terkendala."
    } else {
        null
    },
)

/** Pesan utama galat aksi; galat validasi menambah daftar masalahnya. */
internal fun pesanGalatAksi(galat: GalatAksi): String = when (galat) {
    is GalatAksi.Beku -> galat.pesan
    is GalatAksi.Validasi ->
        if (galat.medan.isEmpty()) galat.pesan
        else ((listOf(galat.pesan) + galat.medan).distinct()).joinToString(" ")
    is GalatAksi.Umum -> galat.pesan
}

/** Pesan utama galat sheet; galat validasi menambah daftar masalahnya. */
internal fun pesanGalatSheet(galat: GalatSheet): String = when (galat) {
    is GalatSheet.Beku -> galat.pesan
    is GalatSheet.Validasi ->
        if (galat.medan.isEmpty()) galat.pesan
        else ((listOf(galat.pesan) + galat.medan).distinct()).joinToString(" ")
    is GalatSheet.Umum -> galat.pesan
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

private fun papanContoh(statusHeader: String = "DRAFT"): PapanMingguan {
    val butir = listOf(
        ButirMingguan(
            id = "b1", pekerjaan = "Migrasi data gudang tahap 2", target = "2 gudang termigrasi",
            picNama = "Rani Kusuma", picJabatan = "Rani Kusuma", aspekId = "a1", aspekNama = "Teknologi",
            prioritasId = "p1", prioritasNama = "Tinggi", status = "ON_PROGRESS", progres = 64,
            capaian = "Gudang pertama selesai", kendala = null, tindakLanjut = null,
            hariKerjaIso = "2026-10-05T17:00:00Z", hariKerjaKunci = "2026-10-06", posisi = 0,
            jumlahBukti = 2, dibuatIso = "2026-10-05T02:00:00Z",
        ),
        ButirMingguan(
            id = "b2", pekerjaan = "Uji ulang modul izin", target = "Tanpa galat blokir",
            picNama = "Dimas Arya", picJabatan = "Dimas Arya", aspekId = "a1", aspekNama = "Teknologi",
            prioritasId = "p2", prioritasNama = "Sedang", status = "TERKENDALA", progres = 30,
            capaian = "Menunggu perangkat uji", kendala = "Perangkat uji belum tiba",
            tindakLanjut = "Pinjam perangkat divisi lain", hariKerjaIso = null, hariKerjaKunci = null,
            posisi = 1, jumlahBukti = 0, dibuatIso = "2026-10-06T02:00:00Z",
        ),
        ButirMingguan(
            id = "b3", pekerjaan = "Rapat koordinasi mingguan", target = "Notula terkirim",
            picNama = "Andi Wirawan", picJabatan = "Andi Wirawan", aspekId = "a2", aspekNama = "Umum",
            prioritasId = "p3", prioritasNama = "Rendah", status = "SELESAI", progres = 100,
            capaian = "Notula terkirim Senin", kendala = null, tindakLanjut = null,
            hariKerjaIso = null, hariKerjaKunci = null, posisi = 2, jumlahBukti = 1,
            dibuatIso = "2026-10-05T06:00:00Z",
        ),
        ButirMingguan(
            id = "b4", pekerjaan = "Penyusunan SOP backup", target = "Draft SOP",
            picNama = "Rani Kusuma", picJabatan = "Rani Kusuma", aspekId = "a1", aspekNama = "Teknologi",
            prioritasId = "p2", prioritasNama = "Sedang", status = "BELUM_MULAI", progres = 0,
            capaian = "Belum dimulai", kendala = null, tindakLanjut = null,
            hariKerjaIso = null, hariKerjaKunci = null, posisi = 3, jumlahBukti = 0,
            dibuatIso = "2026-10-07T02:00:00Z",
        ),
    )
    return PapanMingguan(
        mingguKe = 41,
        kunciMinggu = "2026-W41",
        mulaiIso = "2026-10-05T17:00:00Z",
        selesaiIso = "2026-10-11T17:00:00Z",
        serahIso = "2026-10-08T10:00:00Z",
        kunciIso = "2026-10-09T10:00:00Z",
        teksSerah = "Serah paling lambat Kamis 17.00 WIB · sisa 1 hari 3 jam",
        bisaSetujui = true,
        divisi = listOf(
            DivisiMingguan(
                id = "d1", nama = "Divisi Teknologi", tipe = "Teknologi", kepalaNama = "Andi Wirawan",
                bisaTulis = true, alasanKunci = null, beku = false, bukaSampaiIso = null,
                laporan = LaporanMingguan(
                    id = "r1", statusHeader = statusHeader,
                    diserahkanIso = null, disetujuiIso = null, butir = butir,
                ),
            ),
        ),
        aspek = listOf(OpsiPilihan("a1", "Teknologi"), OpsiPilihan("a2", "Umum")),
        prioritas = listOf(OpsiPilihan("p1", "Tinggi"), OpsiPilihan("p2", "Sedang"), OpsiPilihan("p3", "Rendah")),
    )
}

@PreviewGanda
@Composable
private fun MingguanScreenPreview() {
    MKTheme {
        MingguanScreen(state = MingguanUiState.Sukses(papanContoh()))
    }
}

@PreviewGanda
@Composable
private fun MingguanScreenMenungguPreview() {
    MKTheme {
        MingguanScreen(state = MingguanUiState.Sukses(papanContoh("MENUNGGU_PERSETUJUAN")))
    }
}

@PreviewGanda
@Composable
private fun MingguanSheetPreview() {
    val papan = papanContoh()
    val divisi = papan.divisi.first()
    val butir = divisi.laporan?.butir?.first() ?: return
    MKTheme {
        ButirSheet(
            papan = papan,
            divisi = divisi,
            buka = SheetButir(divisiId = divisi.id, butir = butir),
            versiForm = 0,
            galatSheet = null,
            sibuk = false,
            bolehEdit = true,
            onTutup = {},
            onSimpan = {},
            onHapus = {},
            onAjukanBukaKunci = {},
        )
    }
}
