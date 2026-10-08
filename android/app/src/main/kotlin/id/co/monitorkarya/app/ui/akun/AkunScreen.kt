// Layar Meja akun versi Admin PT terbatas (T6-C9 Fase 2). Padanan web:
// panel "Akun" companies-view.tsx (cari + daftar + sheet detail) dan
// activation-handoff.tsx (serah terima tautan aktivasi). Daftar memakai
// MkListRow (nama · peran · email + lencana status aktif/nonaktif/wajib
// ganti sandi); detail dibuka di MkSheet, bukan pindah halaman.
//
// Konfirmasi dialog HANYA untuk menonaktifkan (tindakan yang menghalangi
// orang masuk); mengaktifkan, setel ulang sandi, dan terbitkan aktivasi
// langsung dijalankan. Kata sandi tidak pernah ditampilkan — hasil tautan
// aktivasi ditampilkan dengan ikon salin (ClipboardManager) dan tidak
// dicatat log.
package id.co.monitorkarya.app.ui.akun

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkAvatar
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOfflineBanner
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
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
import kotlinx.coroutines.launch

/** Bundel data tampilan layar — mudah dipratinjau/diuji tanpa ViewModel. */
data class AkunTampilan(
    val state: AkunUiState = AkunUiState.Memuat,
    val baris: List<AkunBaris> = emptyList(),
    val jumlah: JumlahAkun = JumlahAkun(),
    val cari: String = "",
    val saring: SaringAkun = SaringAkun.SEMUA,
    val sheet: SheetAkun? = null,
    val notifikasi: NotifAkun? = null,
    val offline: Boolean = false,
)

/** Aksi layar ke ViewModel (dibundel supaya tanda tangan layar ringkas). */
class AksiMejaAkun(
    val ulang: () -> Unit = {},
    val pilih: (String?) -> Unit = {},
    val setCari: (String) -> Unit = {},
    val setSaring: (SaringAkun) -> Unit = {},
    val setAktif: (AkunBaris, Boolean) -> Unit = { _, _ -> },
    val setelUlangSandi: (AkunBaris) -> Unit = {},
    val terbitkanAktivasi: (AkunBaris) -> Unit = {},
    val notifikasiTampil: () -> Unit = {},
)

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun AkunScreen(
    vm: AkunViewModel = hiltViewModel(),
    offline: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val baris by vm.baris.collectAsStateWithLifecycle()
    val jumlah by vm.jumlah.collectAsStateWithLifecycle()
    val cari by vm.cari.collectAsStateWithLifecycle()
    val saring by vm.saring.collectAsStateWithLifecycle()
    val sheet by vm.sheet.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    val aksi = remember(vm) {
        AksiMejaAkun(
            ulang = vm::ulang,
            pilih = vm::pilih,
            setCari = vm::setCari,
            setSaring = vm::setSaring,
            setAktif = vm::setAktif,
            setelUlangSandi = vm::setelUlangSandi,
            terbitkanAktivasi = vm::terbitkanAktivasi,
            notifikasiTampil = vm::notifikasiTampil,
        )
    }
    AkunScreen(
        tampilan = AkunTampilan(
            state = state,
            baris = baris,
            jumlah = jumlah,
            cari = cari,
            saring = saring,
            sheet = sheet,
            notifikasi = notifikasi,
            offline = offline,
        ),
        aksi = aksi,
        modifier = modifier,
    )
}

/** Versi state murni — mudah dipratinjau dan diuji tanpa ViewModel. */
@Composable
fun AkunScreen(
    tampilan: AkunTampilan,
    aksi: AksiMejaAkun,
    modifier: Modifier = Modifier,
) {
    val snackbar = remember { SnackbarHostState() }
    val lingkup = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current

    /** Salin tautan aktivasi ke papan klip; tautan tidak dicatat log. */
    fun salinTautan(url: String) {
        clipboard.setText(AnnotatedString(url))
        lingkup.launch { snackbar.showSnackbar("Tautan aktivasi disalin.") }
    }

    LaunchedEffect(tampilan.notifikasi?.id) {
        tampilan.notifikasi?.let { pesan ->
            snackbar.showSnackbar(pesan.pesan)
            aksi.notifikasiTampil()
        }
    }

    // Konfirmasi dialog hanya untuk menonaktifkan.
    var konfirmasiNonaktif by remember { mutableStateOf<AkunBaris?>(null) }

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = MkSpacing.space5),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            if (tampilan.offline) {
                MkOfflineBanner(terlihat = true, onCobaLagi = aksi.ulang)
            }
            KepalaMeja(tampilan)
            MkField(
                nilai = tampilan.cari,
                onUbah = aksi.setCari,
                label = "Cari akun",
                placeholder = "Nama, username, email, atau jabatan",
            )
            BarisChip(tampilan, aksi.setSaring)
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (val state = tampilan.state) {
                    AkunUiState.Memuat -> KolomKerangka()
                    is AkunUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = aksi.ulang)
                    is AkunUiState.Siap -> DaftarAkun(
                        baris = tampilan.baris,
                        meja = state.meja,
                        onPilih = aksi.pilih,
                    )
                }
            }
        }
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    tampilan.sheet?.let { isi ->
        SheetAkunDetail(
            data = isi,
            terlihat = true,
            onTutup = { aksi.pilih(null) },
            onNonaktifkan = { akun -> konfirmasiNonaktif = akun },
            onAktifkan = { akun -> aksi.setAktif(akun, true) },
            onSetelUlangSandi = aksi.setelUlangSandi,
            onTerbitkanAktivasi = aksi.terbitkanAktivasi,
            onSalinTautan = ::salinTautan,
        )
    }

    konfirmasiNonaktif?.let { akun ->
        DialogNonaktifkan(
            akun = akun,
            onBatal = { konfirmasiNonaktif = null },
            onSetuju = {
                aksi.setAktif(akun, false)
                konfirmasiNonaktif = null
            },
        )
    }
}

// ------------------------------------------------------------------
// Daftar
// ------------------------------------------------------------------

/** Judul + satu kalimat jawaban di atas daftar (angka di depan). */
@Composable
private fun KepalaMeja(tampilan: AkunTampilan) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(text = "Meja akun", style = MkTypography.headline, color = warna.ink)
        val meja = (tampilan.state as? AkunUiState.Siap)?.meja
        val kalimat = if (meja == null) {
            "Kelola akun di perusahaan Anda."
        } else {
            val aktif = meja.akun.count { it.aktif }
            "${aktif} akun aktif dari ${meja.akun.size} akun di ${meja.namaPt}."
        }
        Text(text = kalimat, style = MkTypography.footnote, color = warna.ink2)
    }
}

/** Chip saringan peran — hanya posisi yang boleh dikelola Admin PT. */
@Composable
private fun BarisChip(tampilan: AkunTampilan, onSaring: (SaringAkun) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        SaringAkun.entries.forEach { saring ->
            MkChip(
                label = saring.labelChip,
                count = when (saring) {
                    SaringAkun.SEMUA -> tampilan.jumlah.semua
                    SaringAkun.ADMIN_PT -> tampilan.jumlah.adminPt
                    SaringAkun.KEPALA_DIVISI -> tampilan.jumlah.kepalaDivisi
                    SaringAkun.PIC_PROYEK -> tampilan.jumlah.picProyek
                },
                selected = tampilan.saring == saring,
                onClick = { onSaring(saring) },
            )
        }
    }
}

@Composable
private fun KolomKerangka() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        repeat(6) { MkSkeleton(modifier = Modifier.fillMaxWidth().height(56.dp)) }
    }
}

@Composable
private fun DaftarAkun(
    baris: List<AkunBaris>,
    meja: MejaAkun,
    onPilih: (String?) -> Unit,
) {
    if (baris.isEmpty()) {
        EmptyNote(teks = "Tidak ada akun yang cocok. Ubah saringan atau kata pencarian.")
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
        contentPadding = PaddingValues(bottom = MkSpacing.space16),
    ) {
        items(baris, key = { it.id }) { akun ->
            BarisAkun(akun = akun, bisaKelola = meja.bisaKelola(akun), onClick = { onPilih(akun.id) })
        }
    }
}

/** Satu baris akun: nama · peran · email + lencana status; gembok = baca-saja. */
@Composable
private fun BarisAkun(akun: AkunBaris, bisaKelola: Boolean, onClick: () -> Unit) {
    val warna = LocalMkColors.current
    MkListRow(
        judul = akun.nama,
        sub = listOfNotNull(labelPeran(akun.peran), akun.email).joinToString(separator = " · "),
        inisial = inisialNama(akun.nama),
        trailing = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                if (!bisaKelola) {
                    Icon(
                        imageVector = Icons.Outlined.Lock,
                        contentDescription = "Baca-saja",
                        tint = warna.ink2,
                        modifier = Modifier.size(16.dp),
                    )
                }
                LencanaAkun(akun = akun)
            }
        },
        onClick = onClick,
    )
}

/**
 * Lencana status akun: nonaktif > wajib ganti sandi > aktif (padanan eyebrow
 * account-sheet.tsx: Nonaktif/Belum punya sandi/Aktif).
 */
@Composable
private fun LencanaAkun(akun: AkunBaris) {
    when {
        !akun.aktif -> StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = "Nonaktif")
        !akun.punyaSandi -> StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = "Wajib ganti sandi")
        else -> StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM, text = "Aktif")
    }
}

// ------------------------------------------------------------------
// Sheet detail
// ------------------------------------------------------------------

/** Identitas + aksi satu akun (Aktifkan/Nonaktifkan, setel ulang sandi, aktivasi). */
@Composable
private fun SheetAkunDetail(
    data: SheetAkun,
    terlihat: Boolean,
    onTutup: () -> Unit,
    onNonaktifkan: (AkunBaris) -> Unit,
    onAktifkan: (AkunBaris) -> Unit,
    onSetelUlangSandi: (AkunBaris) -> Unit,
    onTerbitkanAktivasi: (AkunBaris) -> Unit,
    onSalinTautan: (String) -> Unit,
) {
    val warna = LocalMkColors.current
    val akun = data.akun
    MkSheet(
        visible = terlihat,
        onTutup = onTutup,
        judul = akun.nama,
        subjudul = "${labelPeran(akun.peran)} · ${data.namaPt}",
        backLabel = "Akun",
        footer = {
            MkButton(label = "Tutup", onClick = onTutup, variant = MkButtonVariant.PLAIN)
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4),
            ) {
                MkAvatar(inisial = inisialNama(akun.nama), ukuran = 56.dp)
                Column {
                    Text(
                        text = akun.username ?: "—",
                        style = MkTypography.bodyStrong,
                        color = warna.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    akun.email?.let {
                        Text(
                            text = it,
                            style = MkTypography.footnote,
                            color = warna.ink2,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = teksTerakhirMasuk(akun) + if (data.adalahSaya) " · akun Anda" else "",
                        style = MkTypography.footnote,
                        color = warna.ink2,
                    )
                }
            }
            LencanaAkun(akun = akun)
            when {
                data.adalahSaya -> CatatanInfo(teks = "Akun Anda sendiri tidak bisa dinonaktifkan atau dihapus dari meja ini.")
                !data.bisaKelola -> CatatanInfo(
                    teks = "Posisi ${labelPosisiLuarJangkauan(akun.peran)} hanya dapat dikelola Super Admin.",
                )
                else -> BagianAksi(
                    data = data,
                    onNonaktifkan = onNonaktifkan,
                    onAktifkan = onAktifkan,
                    onSetelUlangSandi = onSetelUlangSandi,
                    onTerbitkanAktivasi = onTerbitkanAktivasi,
                )
            }
            data.galat?.let {
                Text(text = it, style = MkTypography.body, color = warna.statusLate)
            }
            data.tautan?.let { SerahTerimaTautan(tautan = it, onSalin = onSalinTautan) }
        }
    }
}

/** Aksi akun yang boleh dikelola: status, kata sandi, dan (bila layak) aktivasi. */
@Composable
private fun BagianAksi(
    data: SheetAkun,
    onNonaktifkan: (AkunBaris) -> Unit,
    onAktifkan: (AkunBaris) -> Unit,
    onSetelUlangSandi: (AkunBaris) -> Unit,
    onTerbitkanAktivasi: (AkunBaris) -> Unit,
) {
    val warna = LocalMkColors.current
    val akun = data.akun
    val sibuk = data.aksi != null
    val menungguStatus = data.aksi.pada(AksiMeja.NONAKTIFKAN, akun.id) || data.aksi.pada(AksiMeja.AKTIFKAN, akun.id)
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
        Text(text = "Aksi", style = MkTypography.title3, color = warna.ink)
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            MkButton(
                label = when {
                    menungguStatus -> "Memproses…"
                    akun.aktif -> "Nonaktifkan akun"
                    else -> "Aktifkan akun"
                },
                onClick = { if (akun.aktif) onNonaktifkan(akun) else onAktifkan(akun) },
                variant = MkButtonVariant.SECONDARY,
                enabled = !sibuk,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = if (akun.aktif) {
                    "Akun nonaktif tidak bisa masuk, tetapi riwayatnya tetap utuh."
                } else {
                    "Akun bisa masuk kembali."
                },
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            MkButton(
                label = if (data.aksi.pada(AksiMeja.SETEL_ULANG_SANDI, akun.id)) {
                    "Menyetel ulang…"
                } else {
                    "Setel ulang kata sandi"
                },
                onClick = { onSetelUlangSandi(akun) },
                variant = MkButtonVariant.SECONDARY,
                enabled = !sibuk,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = "Kata sandi acak baru dibuat dan tidak ditampilkan. Pemegang akun wajib menggantinya saat masuk berikutnya.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
        if (data.aktivasiTersedia == true) {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                Text(text = "Aktivasi akun", style = MkTypography.title3, color = warna.ink)
                Text(
                    text = "Akun baru sudah disetujui. Terbitkan tautan supaya pemilik akun membuat kata sandinya sendiri. " +
                        "Tautan sebelumnya berhenti berlaku.",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
                MkButton(
                    label = if (data.aksi.pada(AksiMeja.TERBITKAN_AKTIVASI, akun.id)) {
                        "Menerbitkan…"
                    } else {
                        "Terbitkan tautan aktivasi"
                    },
                    onClick = { onTerbitkanAktivasi(akun) },
                    variant = MkButtonVariant.SECONDARY,
                    enabled = !sibuk,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/**
 * Serah terima tautan aktivasi (padanan ActivationHandoff web): tautan
 * sekali pakai ditampilkan dengan ikon salin; hanya hidup di UI, tidak
 * dicatat log.
 */
@Composable
private fun SerahTerimaTautan(tautan: TautanAktivasi, onSalin: (String) -> Unit) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        Text(text = "Kirim tautan ke pengguna", style = MkTypography.title3, color = warna.ink)
        StatusBadge(status = MkStatus.INFO, text = "Menunggu aktivasi")
        Text(
            text = "Sampaikan tautan ini kepada pemilik akun ${tautan.username}.",
            style = MkTypography.body,
            color = warna.ink,
        )
        Text(
            text = "Berlaku sekali hingga ${waktuWib(tautan.kedaluwarsaIso) ?: "24 jam ke depan"} WIB. " +
                "Tautan sebelumnya tidak berlaku lagi.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(MkShapes.md)
                    .background(color = warna.fill1)
                    .padding(MkSpacing.space3),
            ) {
                SelectionContainer {
                    Text(
                        text = tautan.url,
                        style = MkTypography.code,
                        color = warna.ink,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            MkIconBtn(
                icon = Icons.Outlined.ContentCopy,
                label = "Salin tautan aktivasi",
                onClick = { onSalin(tautan.url) },
            )
        }
    }
}

/** Catatan kecil di dalam kotak lembut (fill1) untuk penanda baca-saja/akun sendiri. */
@Composable
private fun CatatanInfo(teks: String) {
    val warna = LocalMkColors.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.fill1)
            .padding(MkSpacing.space4),
    ) {
        Text(text = teks, style = MkTypography.footnote, color = warna.ink2)
    }
}

/** Konfirmasi menonaktifkan — satu-satunya aksi dengan dialog. */
@Composable
private fun DialogNonaktifkan(akun: AkunBaris, onBatal: () -> Unit, onSetuju: () -> Unit) {
    AlertDialog(
        onDismissRequest = onBatal,
        title = { Text(text = "Nonaktifkan akun ${akun.nama}?") },
        text = {
            Text(text = "Akun nonaktif tidak bisa masuk, tetapi riwayatnya tetap utuh. Anda bisa mengaktifkannya kembali nanti.")
        },
        confirmButton = {
            TextButton(onClick = onSetuju) {
                Text(text = "Nonaktifkan", color = LocalMkColors.current.statusLate)
            }
        },
        dismissButton = {
            TextButton(onClick = onBatal) { Text(text = "Batal") }
        },
    )
}

// ------------------------------------------------------------------
// Pembantu kecil
// ------------------------------------------------------------------

private fun AksiBerjalan?.pada(aksi: AksiMeja, idAkun: String): Boolean =
    this != null && this.aksi == aksi && this.idAkun == idAkun

/** Dua huruf pertama kata-kata nama, untuk avatar inisial. */
private fun inisialNama(nama: String): String = nama
    .split(' ')
    .filter { it.isNotBlank() }
    .take(2)
    .joinToString(separator = "") { it.first().uppercaseChar().toString() }
    .ifEmpty { "?" }

private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val formatWaktuWib: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMMM yyyy, HH.mm", Locale.forLanguageTag("id-ID")).withZone(ZONA_WIB)

private val formatTanggalWib: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM yyyy", Locale.forLanguageTag("id-ID")).withZone(ZONA_WIB)

/** ISO -> "9 Oktober 2026, 19.00"; null bila ISO rusak. */
private fun waktuWib(iso: String?): String? =
    iso?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { formatWaktuWib.format(it) }

/** "Belum pernah masuk" / "Terakhir masuk 7 Okt 2026". */
private fun teksTerakhirMasuk(akun: AkunBaris): String {
    val masuk = akun.pernahMasukIso?.let { runCatching { Instant.parse(it) }.getOrNull() }
    return if (masuk == null) "Belum pernah masuk" else "Terakhir masuk ${formatTanggalWib.format(masuk)}"
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

private val mejaContoh = MejaAkun(
    namaPt = "PT Medcreatix Karya",
    idSaya = "u1",
    peranKelola = setOf("ADMIN_PT", "KEPALA_DIVISI", "PIC_PROYEK"),
    akun = listOf(
        AkunBaris(
            id = "u1",
            nama = "Rani Kusuma",
            username = "rani.kusuma",
            email = "rani@medcreatix.co.id",
            peran = "ADMIN_PT",
            jabatan = "Manager Operasional",
            pernahMasukIso = "2026-10-08T01:15:00.000Z",
        ),
        AkunBaris(
            id = "u2",
            nama = "Budi Santoso",
            username = "budi",
            email = "budi@medcreatix.co.id",
            peran = "KEPALA_DIVISI",
        ),
        AkunBaris(
            id = "u3",
            nama = "Citra Lestari",
            username = "citra",
            email = "citra@medcreatix.co.id",
            peran = "PIC_PROYEK",
            punyaSandi = false,
        ),
        AkunBaris(
            id = "u4",
            nama = "Dewi Anggraeni",
            username = "dewi",
            email = "dewi@medcreatix.co.id",
            peran = "PIC_PROYEK",
            aktif = false,
        ),
        AkunBaris(
            id = "u5",
            nama = "Eka Wijaya",
            username = "eka",
            email = "eka@medcreatix.co.id",
            peran = "DIREKTUR_ENTITAS",
        ),
    ),
)

@PreviewGanda
@Composable
private fun AkunScreenPreview() {
    MKTheme {
        Box(modifier = Modifier.background(color = LocalMkColors.current.bg)) {
            AkunScreen(
                tampilan = AkunTampilan(
                    state = AkunUiState.Siap(mejaContoh),
                    baris = mejaContoh.akun,
                    jumlah = JumlahAkun(semua = 5, adminPt = 1, kepalaDivisi = 1, picProyek = 2),
                ),
                aksi = AksiMejaAkun(),
            )
        }
    }
}

@PreviewGanda
@Composable
private fun AkunScreenKosongPreview() {
    MKTheme {
        Box(modifier = Modifier.background(color = LocalMkColors.current.bg)) {
            AkunScreen(
                tampilan = AkunTampilan(
                    state = AkunUiState.Siap(mejaContoh),
                    baris = emptyList(),
                    jumlah = JumlahAkun(semua = 5, adminPt = 1, kepalaDivisi = 1, picProyek = 2),
                    cari = "rani",
                ),
                aksi = AksiMejaAkun(),
            )
        }
    }
}

@PreviewGanda
@Composable
private fun SheetAkunPreview() {
    MKTheme {
        Box(modifier = Modifier.background(color = LocalMkColors.current.bg)) {
            SheetAkunDetail(
                data = SheetAkun(
                    akun = mejaContoh.akun[2],
                    bisaKelola = true,
                    adalahSaya = false,
                    namaPt = mejaContoh.namaPt,
                    aktivasiTersedia = true,
                    tautan = TautanAktivasi(
                        username = "citra",
                        url = "https://monitorkarya.tech/login/aktivasi#token=contoh-tautan-aktivasi",
                        kedaluwarsaIso = "2026-10-09T12:00:00.000Z",
                    ),
                ),
                terlihat = true,
                onTutup = {},
                onNonaktifkan = {},
                onAktifkan = {},
                onSetelUlangSandi = {},
                onTerbitkanAktivasi = {},
                onSalinTautan = {},
            )
        }
    }
}
