// Layar Laporan harian PIC — daftar entri multi-item (agen A1, 13 Okt 2026).
// Padanan DailyInputView + EntryDesk + EntryCard + SendBar + LockNotice web
// (src/components/views/daily-input-view.tsx), versi ponsel: satu kolom
// bergulir, margin samping 12dp, pemisah 1px, detail di MkSheet.
//
// Susunan: kepala (tanggal + lencana) → banner tanggal lampau / hari yang
// dibuka → kalimat jawaban + tenggat (24/7 atau jam PT dari lockAt) →
// [multi-proyek] daftar proyek yang bisa dipilih → meja entri proyek terpilih
// (kunci + alur + kartu entri + footer kirim). Sheet entri & buka kunci di
// LaporanLembar.kt.
package id.co.monitorkarya.app.ui.laporan

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import id.co.monitorkarya.app.ui.luring.BannerLuring
import id.co.monitorkarya.app.ui.luring.DaftarAntreanOtomatis
import id.co.monitorkarya.app.ui.luring.LencanaKirim
import id.co.monitorkarya.app.ui.luring.ingatWaktuMuat
import id.co.monitorkarya.app.ui.luring.rememberStatusLuring
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkAvatar
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import kotlinx.coroutines.launch

// ------------------------------------------------------------------
// Titik masuk (kontrak MKShell: LaporanHarianScreen(vm = hiltViewModel()))
// ------------------------------------------------------------------

/**
 * Layar Laporan harian PIC.
 *
 * @param offline paksa banner luring (bawaan: status jaringan + potret Room dibaca sendiri, B2).
 * @param onAjukanBukaKunci tidak lagi dibutuhkan (alur ajukan buka kunci kini di
 *   layar ini); dipertahankan agar pemasang lama tetap terkompilasi.
 */
@Composable
fun LaporanHarianScreen(
    vm: LaporanViewModel,
    offline: Boolean = false,
    @Suppress("UNUSED_PARAMETER") onAjukanBukaKunci: (reportId: String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val terpilih by vm.terpilih.collectAsStateWithLifecycle()
    val entri by vm.entri.collectAsStateWithLifecycle()
    val lembar by vm.lembar.collectAsStateWithLifecycle()
    val kirim by vm.kirim.collectAsStateWithLifecycle()
    val hapusSibuk by vm.hapusSibuk.collectAsStateWithLifecycle()
    val galatAksi by vm.galatAksi.collectAsStateWithLifecycle()
    val bukaKunci by vm.bukaKunci.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    val tersimpanPada by vm.tersimpanPada.collectAsStateWithLifecycle()
    val luring by rememberStatusLuring()
    // Waktu muat data segar terakhir — dipakai banner bila jaringan putus setelah layar terbuka.
    val waktuMuat = ingatWaktuMuat((state as? LaporanUiState.Siap)?.takeIf { tersimpanPada == null })

    // C5-T4: kembali ke layar setelah lewat tengah malam → muat meja hari baru.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.segarkanBilaHariBerganti() }

    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notifikasi?.id) {
        notifikasi?.let { n ->
            val hasil = snackbar.showSnackbar(
                message = n.pesan,
                actionLabel = n.undoToken?.let { "Urungkan" },
                duration = if (n.undoToken != null) SnackbarDuration.Long else SnackbarDuration.Short,
            )
            if (hasil == SnackbarResult.ActionPerformed && n.undoToken != null) vm.urungkan(n.undoToken)
            vm.notifikasiTampil()
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            // B2: luring atau data dari potret Room → "Luring · data tersimpan HH.MM".
            if (offline || luring.luring || tersimpanPada != null) {
                BannerLuring(
                    modifier = Modifier.fillMaxWidth(),
                    tersimpanPadaMs = tersimpanPada ?: waktuMuat ?: luring.terakhirSinkronMs,
                    menungguKirim = luring.menungguKirim,
                    onCobaLagi = vm::ulang,
                )
            }
            when (val s = state) {
                LaporanUiState.Memuat -> KerangkaLaporan()
                is LaporanUiState.Galat -> ErrorNote(pesan = s.pesan, onCobaLagi = vm::ulang)
                is LaporanUiState.Siap -> IsiLaporan(
                    desk = s.desk,
                    terpilih = terpilih,
                    entri = entri,
                    kirim = kirim,
                    hapusSibuk = hapusSibuk,
                    galatAksi = galatAksi,
                    vm = vm,
                )
            }
            // Ruang agar snackbar tidak menutup tombol kirim.
            Spacer(Modifier.height(MkSpacing.space12))
        }
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        )
    }

    val desk = (state as? LaporanUiState.Siap)?.desk
    val proyek = desk?.proyek?.firstOrNull { it.id == terpilih }
    val hari = (entri as? EntriUiState.Siap)?.hari
    lembar?.let { l ->
        LembarEntriSheet(
            lembar = l,
            namaProyek = proyek?.nama.orEmpty(),
            subjudul = "Laporan harian · ${desk?.let { tanggalPanjang(it.tanggalIso) } ?: ""}",
            terkunci = (proyek?.terkunci ?: false) || (hari?.terkunci ?: false),
            bukti = l.gabungBukti(hari?.entri?.firstOrNull { it.id == l.idTersimpan }?.bukti.orEmpty()),
            urlBukti = vm::urlBukti,
            onUbah = vm::ubahIsian,
            onSimpan = vm::simpanEntri,
            onTutup = vm::tutupLembar,
            onUnggah = vm::unggahBukti,
            onHapusBukti = vm::hapusBukti,
            onBuangDraf = vm::buangDraf,
        )
    }
    bukaKunci?.let { b ->
        LembarBukaKunciSheet(
            lembar = b,
            onUbah = vm::ubahAlasan,
            onAjukan = vm::ajukanBukaKunci,
            onTutup = vm::tutupAjukan,
        )
    }
}

@Composable
private fun KerangkaLaporan() {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        MkSkeleton(tinggi = 24.dp, lebar = 180.dp)
        MkSkeleton(tinggi = 16.dp)
        MkSkeleton(tinggi = 120.dp)
        MkSkeleton(tinggi = 132.dp)
        MkSkeleton(tinggi = 132.dp)
    }
}

// ------------------------------------------------------------------
// Isi meja
// ------------------------------------------------------------------

@Composable
private fun IsiLaporan(
    desk: DeskLaporan,
    terpilih: String?,
    entri: EntriUiState,
    kirim: KirimUi,
    hapusSibuk: String?,
    galatAksi: String?,
    vm: LaporanViewModel,
) {
    val warna = LocalMkColors.current
    val tunggal = desk.proyek.singleOrNull()
    val terkirim = desk.proyek.count { it.laporan?.terkirimIso != null }
    val sisa = desk.proyek.size - terkirim

    // Kepala: judul + tanggal + lencana keadaan.
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(
            text = tunggal?.nama ?: "Laporan harian",
            style = MkTypography.title3,
            color = warna.ink,
            modifier = Modifier.semantics { heading() },
        )
        tanggalPanjang(desk.tanggalIso)?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
        when {
            tunggal != null -> {
                val (st, label) = keadaanLaporan(tunggal, tunggal.terkunci)
                StatusBadge(status = st, text = "Laporan ${if (desk.hariIni) "hari ini" else "hari itu"} · $label")
            }
            desk.proyek.size > 1 -> StatusBadge(
                status = when {
                    sisa == 0 -> MkStatus.DONE
                    desk.lewatTenggat -> MkStatus.LATE
                    else -> MkStatus.RISK
                },
                text = if (sisa == 0) "Semua laporan terkirim" else "$sisa laporan belum dikirim",
            )
        }
    }

    if (!desk.hariIni) {
        Catatan(
            ikon = Icons.Outlined.CalendarMonth,
            nada = MkStatus.INFO,
            teks = "Anda membuka laporan ${tanggalPanjang(desk.tanggalIso) ?: desk.tanggalKunci}.",
            aksi = "Kembali ke hari ini",
            onAksi = { vm.pilihTanggal(null) },
        )
    }
    desk.hariDibuka.forEach { o ->
        Catatan(
            ikon = Icons.Outlined.Lock,
            nada = MkStatus.INFO,
            teks = "Laporan ${o.namaProyek} · ${tanggalKunciPendek(o.tanggal)} dibuka sampai ${tanggalJamWib(o.sampaiIso) ?: "-"} WIB.",
            aksi = "Ubah laporan ${tanggalKunciPendek(o.tanggal)}",
            onAksi = { vm.pilihTanggal(o.tanggal) },
        )
    }

    if (desk.proyek.isEmpty()) {
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(teks = "Belum ada proyek yang ditugaskan kepada Anda. Hubungi Admin PT untuk penugasan proyek.")
        }
        return
    }

    // Satu kalimat jawaban + tenggat.
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(text = kalimatJawaban(desk), style = MkTypography.bodyStrong, color = warna.ink)
        Text(text = teksTenggat(desk), style = MkTypography.footnote, color = warna.ink2)
    }

    if (desk.proyek.size > 1) {
        DaftarProyek(desk = desk, terpilih = terpilih, onPilih = vm::pilih)
    }

    val proyek = desk.proyek.firstOrNull { it.id == terpilih } ?: return
    MejaEntri(
        desk = desk,
        proyek = proyek,
        entri = entri,
        kirim = kirim,
        hapusSibuk = hapusSibuk,
        galatAksi = galatAksi,
        vm = vm,
    )
}

/** Daftar "Proyek Anda hari ini" — pilih satu untuk mengisi atau membaca laporannya. */
@Composable
private fun DaftarProyek(desk: DeskLaporan, terpilih: String?, onPilih: (String) -> Unit) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Text(
            text = "Proyek Anda ${if (desk.hariIni) "hari ini" else "hari itu"}",
            style = MkTypography.headline,
            color = warna.ink,
            modifier = Modifier.semantics { heading() },
        )
        MkCard(modifier = Modifier.fillMaxWidth(), padding = MkSpacing.space1) {
            desk.proyek.forEachIndexed { i, p ->
                // E2E-3 B10: identitas baris = id proyek (bukan posisi), supaya
                // keadaan sentuh/klik tidak berpindah ke proyek lain saat daftar berubah.
                key(p.id) {
                    val dipilih = p.id == terpilih
                    val (st, label) = keadaanLaporan(p, p.terkunci)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(MkShapes.md)
                            .background(if (dipilih) aksen.soft else warna.surface)
                            .clickable(role = Role.Tab, onClick = { onPilih(p.id) })
                            .semantics { selected = dipilih }
                            .heightIn(min = 56.dp)
                            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(p.nama, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                text = listOfNotNull(
                                    p.kode,
                                    labelFase(p.fase),
                                    p.jumlahEntri.takeIf { it > 0 }?.let { "$it entri" },
                                ).joinToString(" · "),
                                style = MkTypography.footnote,
                                color = warna.ink2,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        StatusBadge(status = st, size = MkBadgeSize.SM, text = label)
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                            contentDescription = null,
                            tint = warna.ink3,
                        )
                    }
                    if (i < desk.proyek.lastIndex) MkDivider()
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// Meja entri satu proyek (EntryDesk)
// ------------------------------------------------------------------

@Composable
private fun MejaEntri(
    desk: DeskLaporan,
    proyek: ProyekLaporan,
    entri: EntriUiState,
    kirim: KirimUi,
    hapusSibuk: String?,
    galatAksi: String?,
    vm: LaporanViewModel,
) {
    val warna = LocalMkColors.current
    val hari = (entri as? EntriUiState.Siap)?.hari
    val terkunci = proyek.terkunci || (hari?.terkunci ?: false)
    val daftar = hari?.entri.orEmpty()
    val n = daftar.size
    val selesai = daftar.count { it.status == "SELESAI" }
    val r = proyek.laporan
    val kataHari = if (desk.hariIni) "hari ini" else "hari itu"

    var konfirmHapusEntri by remember { mutableStateOf<Entri?>(null) }
    var konfirmKirim by remember { mutableStateOf(false) }
    var konfirmHapusLaporan by remember { mutableStateOf(false) }

    MkCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                if (desk.proyek.size > 1) {
                    Text(
                        text = "${proyek.kode} · ${labelFase(proyek.fase)}",
                        style = MkTypography.caption,
                        color = warna.ink2,
                    )
                    Text(proyek.nama, style = MkTypography.headline, color = warna.ink)
                }
                Text(
                    text = when {
                        r?.diteruskanIso != null -> "Diteruskan ke holding pukul ${jamWib(r.diteruskanIso) ?: "-"}"
                        r?.terkirimIso != null -> "Terkirim ke Admin PT pukul ${jamWib(r.terkirimIso) ?: "-"}"
                        terkunci -> "${labelTenggat(desk)} · terkunci"
                        else -> "${labelTenggat(desk)} · catat entri lalu kirim"
                    },
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }

            infoKunci(proyek, terkunci, desk, hari?.reportId)?.let { info ->
                KotakKunci(info = info, onAjukan = vm::bukaAjukan)
            }

            // Alur tampil setelah terkirim (perilaku ponsel web).
            if (r?.terkirimIso != null) AlurLaporan(proyek = proyek)

            // Kepala daftar entri.
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = if (desk.hariIni) "Entri hari ini" else "Entri hari itu",
                        style = MkTypography.headline,
                        color = warna.ink,
                        modifier = Modifier.semantics { heading() },
                    )
                    if (n > 0) Text("$selesai dari $n selesai", style = MkTypography.footnote.tabular, color = warna.ink2)
                }
                if (!terkunci && n > 0) {
                    MkButton(label = "Tambah entri", onClick = vm::bukaTambah, size = MkButtonSize.S)
                }
            }

            when (entri) {
                EntriUiState.Memuat -> Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    MkSkeleton(tinggi = 132.dp)
                    MkSkeleton(tinggi = 132.dp)
                }
                is EntriUiState.Galat -> ErrorNote(pesan = entri.pesan, onCobaLagi = vm::ulangEntri)
                is EntriUiState.Siap -> if (n == 0) {
                    if (terkunci) {
                        EmptyNote(teks = "Tidak ada entri tercatat $kataHari.")
                    } else {
                        EmptyNote(
                            teks = "Belum ada entri $kataHari. Tambahkan apa yang dikerjakan — judul, hasil, status, dan bukti — lalu kirim sebagai satu laporan ke Admin PT.",
                        )
                        MkButton(
                            label = "Tambah entri",
                            onClick = vm::bukaTambah,
                            variant = MkButtonVariant.PRIMARY,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                        daftar.forEach { e ->
                            KartuEntri(
                                entri = e,
                                terkunci = terkunci,
                                sibuk = hapusSibuk == e.id,
                                urlBukti = vm::urlBukti,
                                onUbah = { vm.bukaUbah(e.id) },
                                onHapus = { konfirmHapusEntri = e },
                            )
                        }
                    }
                }
            }

            galatAksi?.let { KotakGalat(listOf(it)) }

            // B2: tulisan laporan ini yang masih di antrean (kirim ulang / buang).
            DaftarAntreanOtomatis(kunciAwalan = KunciOutbox.laporanHarian(proyek.id, desk.tanggalKunci))

            if (!terkunci && entri is EntriUiState.Siap) {
                MkDivider()
                BilahKirim(
                    ringkasan = ringkasEntri(daftar),
                    petunjuk = petunjukKirim(daftar, r),
                    kirim = kirim,
                    sudahTerkirim = r?.terkirimIso != null,
                    bolehSimpan = n > 0,
                    bolehKirim = n > 0 && !buktiKurang(daftar, r),
                    bolehHapus = r != null && r.diteruskanIso == null,
                    onSimpan = { vm.kirimLaporan(AksiLaporan.SIMPAN) },
                    onKirim = { konfirmKirim = true },
                    onHapus = { konfirmHapusLaporan = true },
                )
            }
        }
    }

    konfirmHapusEntri?.let { e ->
        Konfirmasi(
            judul = "Hapus entri ini?",
            isi = "${e.judul} beserta buktinya dihapus dari laporan $kataHari dan tidak bisa dikembalikan.",
            label = "Hapus entri",
            onYa = {
                konfirmHapusEntri = null
                vm.hapusEntri(e.id)
            },
            onTidak = { konfirmHapusEntri = null },
        )
    }
    if (konfirmKirim) {
        val kendala = daftar.count { it.status == "TERKENDALA" || it.status == "MENUNGGU_KEPUTUSAN" }
        Konfirmasi(
            judul = "Kirim $n entri sebagai laporan harian?",
            isi = "Laporan ${proyek.nama} $kataHari memuat $n entri — $selesai selesai, $kendala terkendala. Laporan dikirim ke Admin PT, lalu diteruskan ke holding.",
            label = "Kirim laporan",
            onYa = {
                konfirmKirim = false
                vm.kirimLaporan(AksiLaporan.KIRIM)
            },
            onTidak = { konfirmKirim = false },
        )
    }
    if (konfirmHapusLaporan) {
        Konfirmasi(
            judul = "Hapus laporan $kataHari?",
            isi = "Laporan beserta lampiran di tingkat laporan dihapus dan tidak bisa dikembalikan. Entri tidak ikut terhapus.",
            label = "Hapus laporan",
            onYa = {
                konfirmHapusLaporan = false
                vm.hapusLaporan()
            },
            onTidak = { konfirmHapusLaporan = false },
        )
    }
}

/** Kotak kunci (LockNotice): lencana alasan, status buka kunci, tombol ajukan. */
@Composable
private fun KotakKunci(info: InfoKunci, onAjukan: () -> Unit) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(color = warna.fill1, shape = MkShapes.md)
            .padding(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            StatusBadge(status = info.status, text = info.label)
            when (info.prosesBuka) {
                "DIAJUKAN" -> StatusBadge(status = MkStatus.INFO, text = "Buka kunci diajukan · menunggu persetujuan")
                "DISETUJUI" -> StatusBadge(status = MkStatus.INFO, text = "Buka kunci disetujui · menunggu dijalankan Tim TI")
            }
        }
        Text(info.pesan, style = MkTypography.body, color = warna.ink)
        if (info.bolehAjukan) {
            MkButton(label = "Ajukan buka kunci", onClick = onAjukan, size = MkButtonSize.S)
        }
        info.catatan?.let { Text(it, style = MkTypography.footnote, color = warna.ink2) }
    }
}

/** Alur laporan harian (FlowDiagram vertikal web): entri → Admin PT → holding → mingguan. */
@Composable
private fun AlurLaporan(proyek: ProyekLaporan) {
    val r = proyek.laporan ?: return
    val langkah = listOf(
        Triple("Catat entri", "${proyek.jumlahEntri} entri tercatat", MkStatus.DONE),
        Triple("Terkirim ke Admin PT", "Pukul ${jamWib(r.terkirimIso) ?: "-"}", MkStatus.DONE),
        Triple(
            "Diteruskan ke holding",
            if (r.diteruskanIso != null) {
                "Pukul ${jamWib(r.diteruskanIso) ?: "-"} · ${if (proyek.dibuka) "dibuka" else "dibekukan"}"
            } else {
                "Menunggu Admin PT"
            },
            if (r.diteruskanIso != null) MkStatus.DONE else MkStatus.INFO,
        ),
        Triple("Laporan mingguan", "Bahan rekap minggu ini", MkStatus.NEUTRAL),
    )
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier.semantics { contentDescription = "Alur laporan harian" },
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        langkah.forEach { (judul, sub, st) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                Icon(imageVector = st.ikon, contentDescription = st.label, tint = warnaStatus(st), modifier = Modifier.size(20.dp))
                Column(Modifier.weight(1f)) {
                    Text(judul, style = MkTypography.bodyStrong, color = warna.ink)
                    Text(sub, style = MkTypography.footnote, color = warna.ink2)
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// Kartu entri (EntryCard)
// ------------------------------------------------------------------

@Composable
private fun KartuEntri(
    entri: Entri,
    terkunci: Boolean,
    sibuk: Boolean,
    urlBukti: suspend (Bukti) -> String?,
    onUbah: () -> Unit,
    onHapus: () -> Unit,
) {
    val warna = LocalMkColors.current
    val nada = nadaStatusEntri(entri.status)
    val pelaksana = entri.pelaksana?.trim()?.takeIf { it.isNotEmpty() }
    val hasil = entri.hasil?.trim()?.takeIf { it.isNotEmpty() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .border(width = 1.dp, color = warna.line, shape = MkShapes.md)
            .height(IntrinsicSize.Min),
    ) {
        // Garis status kiri (rail) — warna status, bukan satu-satunya penanda (ada lencana).
        Box(
            Modifier
                .width(4.dp)
                .fillMaxHeight()
                .background(if (nada == MkStatus.ON || nada == MkStatus.NEUTRAL) LocalAccent.current.fill else warnaStatus(nada)),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(MkSpacing.space3),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Text(entri.judul, style = MkTypography.bodyStrong, color = warna.ink)
            @OptIn(ExperimentalLayoutApi::class)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                StatusBadge(status = nada, size = MkBadgeSize.SM, text = labelStatusEntri(entri.status))
                if (entri.eskalasi) StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = "Butuh eskalasi")
                entri.statusKirim?.let { LencanaKirim(it) }
            }
            if (entri.statusKirim == StatusKirim.GAGAL) {
                Text(
                    entri.galatKirim ?: "Server menolak perubahan entri ini.",
                    style = MkTypography.footnote,
                    color = warna.statusLate,
                )
            }
            if (pelaksana != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                    MkAvatar(inisial = inisialDari(pelaksana), ukuran = 28.dp)
                    Text(pelaksana, style = MkTypography.footnote, color = warna.ink2)
                }
            }
            if (hasil != null) Text(hasil, style = MkTypography.body, color = warna.ink)
            entri.deskripsi?.takeIf { it.isNotBlank() }?.let { Text(it, style = MkTypography.footnote, color = warna.ink2) }
            BatangProgres(nilai = entri.progres, status = nada, label = "Progres ${entri.judul}")
            entri.kendala?.takeIf { it.isNotBlank() }?.let {
                Text("Kendala: $it", style = MkTypography.footnote, color = warna.ink2)
            }
            entri.rencana?.takeIf { it.isNotBlank() }?.let {
                Text("Rencana besok: $it", style = MkTypography.footnote, color = warna.ink)
            }
            if (entri.bukti.isNotEmpty()) BuktiRingkas(bukti = entri.bukti, urlBukti = urlBukti)
            if (!terkunci) {
                Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                    MkButton(label = "Ubah entri", onClick = onUbah, size = MkButtonSize.S)
                    MkButton(
                        label = if (sibuk) "Memproses…" else "Hapus entri",
                        onClick = onHapus,
                        variant = MkButtonVariant.PLAIN,
                        size = MkButtonSize.S,
                        enabled = !sibuk && entri.escalationId == null,
                    )
                }
            }
        }
    }
}

/** Bukti di kartu: foto sebagai thumbnail, berkas & tautan sebagai baris teks. */
@Composable
internal fun BuktiRingkas(bukti: List<Bukti>, urlBukti: suspend (Bukti) -> String?) {
    val warna = LocalMkColors.current
    val buka = LocalUriHandler.current
    val cakupan = rememberCoroutineScope()
    val foto = bukti.filter { it.foto }
    val lain = bukti.filterNot { it.foto }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        if (foto.isNotEmpty()) {
            @OptIn(ExperimentalLayoutApi::class)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                foto.forEach { b -> ThumbBukti(bukti = b, urlBukti = urlBukti) }
            }
        }
        lain.forEach { b ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MkShapes.sm)
                    .clickable(role = Role.Button) {
                        cakupan.launch { urlBukti(b)?.let { runCatching { buka.openUri(it) } } }
                    }
                    .heightIn(min = 44.dp)
                    .padding(horizontal = MkSpacing.space1),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                Icon(
                    imageVector = if (b.tautan != null) Icons.Outlined.Link else Icons.Outlined.Description,
                    contentDescription = null,
                    tint = warna.ink3,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = b.nama,
                    style = MkTypography.footnote,
                    color = LocalAccent.current.fill,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Thumbnail foto: URL bertanda diminta saat tampil; ketuk membuka di peramban. */
@Composable
private fun ThumbBukti(bukti: Bukti, urlBukti: suspend (Bukti) -> String?) {
    val warna = LocalMkColors.current
    val buka = LocalUriHandler.current
    val url by produceState<String?>(initialValue = null, bukti.id) { value = urlBukti(bukti) }
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(MkShapes.sm)
            .background(warna.fill1)
            .clickable(role = Role.Button, enabled = url != null) { url?.let { runCatching { buka.openUri(it) } } }
            .semantics { contentDescription = "Buka bukti ${bukti.nama}" },
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = bukti.nama,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Icon(imageVector = Icons.Outlined.Description, contentDescription = null, tint = warna.ink3)
        }
    }
}

// ------------------------------------------------------------------
// Footer kirim (SendBar)
// ------------------------------------------------------------------

@Composable
private fun BilahKirim(
    ringkasan: String,
    petunjuk: String?,
    kirim: KirimUi,
    sudahTerkirim: Boolean,
    bolehSimpan: Boolean,
    bolehKirim: Boolean,
    bolehHapus: Boolean,
    onSimpan: () -> Unit,
    onKirim: () -> Unit,
    onHapus: () -> Unit,
) {
    val warna = LocalMkColors.current
    val sibuk = kirim.sibuk != null
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        if (kirim.galat.isNotEmpty()) KotakGalat(kirim.galat)
        petunjuk?.let { Text(it, style = MkTypography.footnote, color = warna.ink2) }
        Text(ringkasan, style = MkTypography.bodyStrong.tabular, color = warna.ink)
        MkButton(
            label = when {
                kirim.sibuk == SibukKirim.KIRIM -> "Mengirim…"
                sudahTerkirim -> "Kirim ulang laporan"
                else -> "Kirim laporan ke Admin PT"
            },
            onClick = onKirim,
            variant = MkButtonVariant.PRIMARY,
            enabled = !sibuk && bolehKirim,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            MkButton(
                label = if (kirim.sibuk == SibukKirim.SIMPAN) "Menyimpan…" else "Simpan draf",
                onClick = onSimpan,
                enabled = !sibuk && bolehSimpan,
                modifier = Modifier.weight(1f),
            )
            if (bolehHapus) {
                MkButton(
                    label = if (kirim.sibuk == SibukKirim.HAPUS) "Menghapus…" else "Hapus laporan",
                    onClick = onHapus,
                    variant = MkButtonVariant.PLAIN,
                    enabled = !sibuk,
                )
            }
        }
    }
}

// ------------------------------------------------------------------
// Bagian kecil bersama
// ------------------------------------------------------------------

/** Kotak catatan berikon dengan satu tombol (banner tanggal lampau / hari dibuka). */
@Composable
private fun Catatan(
    ikon: androidx.compose.ui.graphics.vector.ImageVector,
    nada: MkStatus,
    teks: String,
    aksi: String,
    onAksi: () -> Unit,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(color = if (nada == MkStatus.INFO) warna.statusInfoSoft else warna.fill1, shape = MkShapes.md)
            .padding(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Icon(imageVector = ikon, contentDescription = null, tint = warnaStatus(nada), modifier = Modifier.size(18.dp))
            Text(teks, style = MkTypography.body, color = warna.ink, modifier = Modifier.weight(1f))
        }
        MkButton(label = aksi, onClick = onAksi, size = MkButtonSize.S)
    }
}

/** Kotak galat (peran alert): satu baris per pesan. */
@Composable
internal fun KotakGalat(pesan: List<String>) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(color = warna.statusLateSoft, shape = MkShapes.md)
            .padding(MkSpacing.space3)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        pesan.forEach { p ->
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalAlignment = Alignment.Top) {
                Icon(imageVector = Icons.Outlined.Warning, contentDescription = null, tint = warna.statusLate, modifier = Modifier.size(18.dp))
                Text(p, style = MkTypography.body, color = warna.ink, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** Batang progres tipis + angka tabular. */
@Composable
internal fun BatangProgres(nilai: Int, status: MkStatus, label: String) {
    val warna = LocalMkColors.current
    val isi = if (status == MkStatus.ON || status == MkStatus.NEUTRAL) LocalAccent.current.fill else warnaStatus(status)
    val persen = nilai.coerceIn(0, 100)
    Row(
        modifier = Modifier.semantics { contentDescription = "$label $persen persen" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Box(
            Modifier
                .weight(1f)
                .height(6.dp)
                .clip(MkShapes.penuh)
                .background(warna.fill2),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(persen / 100f)
                    .fillMaxHeight()
                    .clip(MkShapes.penuh)
                    .background(isi),
            )
        }
        Text("$persen%", style = MkTypography.caption.tabular, color = warna.ink2)
    }
}

/** Dialog konfirmasi (hanya untuk hapus dan kirim — aturan desain). */
@Composable
internal fun Konfirmasi(judul: String, isi: String, label: String, onYa: () -> Unit, onTidak: () -> Unit) {
    val warna = LocalMkColors.current
    AlertDialog(
        onDismissRequest = onTidak,
        containerColor = warna.surface,
        title = { Text(judul, style = MkTypography.headline, color = warna.ink) },
        text = { Text(isi, style = MkTypography.body, color = warna.ink2) },
        confirmButton = { TextButton(onClick = onYa) { Text(label, color = LocalAccent.current.fill) } },
        dismissButton = { TextButton(onClick = onTidak) { Text("Batal", color = warna.ink2) } },
    )
}

/** Inisial dua huruf dari nama. */
internal fun inisialDari(nama: String): String =
    nama.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
