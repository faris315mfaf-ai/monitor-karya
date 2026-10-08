// Layar Penerimaan Admin PT (T6-C7 Fase 2) — antrean laporan harian PIC dan
// capaian mingguan kepala divisi yang menunggu diteruskan ke holding.
// Padanan web src/components/views/inbox-view.tsx, dikerat untuk ponsel:
// satu kalimat jawaban di atas, MkSegmentedControl Harian/Mingguan, baris
// MkListRow (judul proyek/divisi · sub pengirim·waktu) dengan StatusBadge
// BARU/SIAP/DITERUSKAN/BEKU dan tombol "Teruskan" per baris (swipe tidak),
// satu tombol primer "Teruskan semua (n)" bila ada yang siap, snackbar aksi
// "Urungkan" untuk penerusan yang membawa undoToken, plus kerangka/galat/
// kosong. Detail tetap di sheet pada tugas lanjutan — di sini daftar saja.
package id.co.monitorkarya.app.ui.penerimaan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOfflineBanner
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/** Aksi layar yang disatukan agar parameter komposer tetap ringkas. */
data class PenerimaanAksi(
    val onUlang: () -> Unit = {},
    val onTeruskanSatu: (idLaporan: String, jenis: JenisLaporan) -> Unit = { _, _ -> },
    val onTeruskanSemua: () -> Unit = {},
    val onNotifikasiTampil: () -> Unit = {},
    val onUrungkan: () -> Unit = {},
)

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun PenerimaanScreen(
    vm: PenerimaanViewModel,
    offline: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val aktivitas by vm.aktivitas.collectAsStateWithLifecycle()
    PenerimaanScreen(
        state = state,
        aktivitas = aktivitas,
        aksi = PenerimaanAksi(
            onUlang = vm::ulang,
            onTeruskanSatu = vm::teruskanSatu,
            onTeruskanSemua = vm::teruskanSemua,
            onNotifikasiTampil = vm::notifikasiTampil,
            onUrungkan = vm::urungkan,
        ),
        offline = offline,
        modifier = modifier,
    )
}

/** Versi state murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Composable
fun PenerimaanScreen(
    state: PenerimaanUiState,
    aktivitas: AktivitasPenerimaan = AktivitasPenerimaan(),
    aksi: PenerimaanAksi = PenerimaanAksi(),
    offline: Boolean = false,
    modifier: Modifier = Modifier,
) {
    var tab by rememberSaveable { mutableStateOf(JenisLaporan.HARIAN.name) }
    val jenisTab = JenisLaporan.valueOf(tab)
    val snackbar = remember { SnackbarHostState() }

    // Snackbar satu-kali dari ViewModel. "Urungkan" hanya ditawarkan bila ada
    // tiket; durasi Long (10 detik) mengikuti UNDO_TOAST_MS web — server masih
    // menerima urungkan sampai 15 menit, jadi sentuhan lambat tetap berhasil.
    LaunchedEffect(aktivitas.notifikasi?.id) {
        val n = aktivitas.notifikasi ?: return@LaunchedEffect
        val labelAksi = n.undoToken.takeIf { it.isNotEmpty() }?.let { "Urungkan" }
        val hasil = snackbar.showSnackbar(
            message = n.pesan,
            actionLabel = labelAksi,
            duration = SnackbarDuration.Long,
        )
        if (hasil == SnackbarResult.ActionPerformed) aksi.onUrungkan() else aksi.onNotifikasiTampil()
    }

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (offline) {
                MkOfflineBanner(modifier = Modifier.fillMaxWidth(), terlihat = true, onCobaLagi = aksi.onUlang)
            }
            when (state) {
                PenerimaanUiState.Memuat -> KerangkaPenerimaan()
                is PenerimaanUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = aksi.onUlang)
                is PenerimaanUiState.Siap -> IsiPenerimaan(
                    meja = state.meja,
                    jenisTab = jenisTab,
                    onPilihTab = { jenis -> tab = jenis.name },
                    aktivitas = aktivitas,
                    aksi = aksi,
                )
            }
        }
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

/** Kepala layar + segmented + tombol primer + daftar antrean tab aktif. */
@Composable
private fun IsiPenerimaan(
    meja: MejaPenerimaan,
    jenisTab: JenisLaporan,
    onPilihTab: (JenisLaporan) -> Unit,
    aktivitas: AktivitasPenerimaan,
    aksi: PenerimaanAksi,
) {
    val c = LocalMkColors.current

    // Kepala: konteks tanggal, judul, kalimat jawaban, kalimat dukungan.
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(meja.konteks, style = MkTypography.footnote, color = c.ink2)
        Text("Penerimaan", style = MaterialTheme.typography.displaySmall, color = c.ink)
        Text(meja.jawaban, style = MkTypography.bodyLg, color = c.ink)
        meja.dukungan?.let {
            Text(it, style = MkTypography.footnote, color = c.ink2)
        }
    }

    MkSegmentedControl(
        options = listOf(
            MkOpsi(value = JenisLaporan.HARIAN.name, label = "Harian", count = meja.harian.size),
            MkOpsi(value = JenisLaporan.MINGGUAN.name, label = "Mingguan", count = meja.mingguan.size),
        ),
        terpilih = jenisTab.name,
        onPilih = { nilai -> onPilihTab(JenisLaporan.valueOf(nilai)) },
    )

    // Satu-satunya tombol primer di layar; hanya tampil bila ada yang siap.
    if (meja.siapTotal > 0) {
        val label = if (aktivitas.sedangTerusSemua) {
            if (aktivitas.progresTotal > 0) {
                "Meneruskan (${aktivitas.progresSelesai}/${aktivitas.progresTotal})…"
            } else {
                "Meneruskan…"
            }
        } else {
            "Teruskan semua (${meja.siapTotal})"
        }
        MkButton(
            label = label,
            variant = MkButtonVariant.PRIMARY,
            enabled = !aktivitas.sedangTerusSemua && aktivitas.sedangTerusSatu == null,
            onClick = aksi.onTeruskanSemua,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    val antrean = if (jenisTab == JenisLaporan.HARIAN) meja.harian else meja.mingguan
    if (antrean.isEmpty()) {
        EmptyNote(
            teks = if (jenisTab == JenisLaporan.HARIAN) "Tidak ada proyek aktif." else "Tidak ada divisi.",
        )
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            antrean.forEach { item ->
                BarisAntrean(
                    item = item,
                    sedang = aktivitas.sedangTerusSemua || aktivitas.sedangTerusSatu == item.idLaporan,
                    aksi = aksi,
                )
            }
        }
    }
}

/** Satu baris antrean: lencana status di kanan, tombol "Teruskan" bila siap. */
@Composable
private fun BarisAntrean(item: AntreanItem, sedang: Boolean, aksi: PenerimaanAksi) {
    MkListRow(
        judul = item.judul,
        sub = item.sub.ifBlank { null },
        trailing = {
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusBadge(status = item.status.lencana, size = MkBadgeSize.SM, text = item.status.label)
                if (item.siap) {
                    MkButton(
                        label = if (sedang) "Meneruskan…" else "Teruskan",
                        variant = MkButtonVariant.SECONDARY,
                        size = MkButtonSize.S,
                        enabled = !sedang,
                        onClick = { aksi.onTeruskanSatu(item.idLaporan, item.jenis) },
                    )
                }
            }
        },
    )
}

/** Kerangka memuat seukuran isi: kepala, segmented, lima baris antrean. */
@Composable
private fun KerangkaPenerimaan() {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MkSkeleton(tinggi = 14.dp, lebar = 220.dp)
            MkSkeleton(tinggi = 34.dp)
            MkSkeleton(tinggi = 18.dp, lebar = 260.dp)
        }
        MkSkeleton(tinggi = 36.dp, lebar = 240.dp)
        repeat(5) { MkSkeleton(tinggi = 56.dp) }
    }
}

/* ---------- Pratinjau ---------- */

private val mejaPratinjau = MejaPenerimaan(
    konteks = "Kamis, 8 Oktober 2026 · M41 2026",
    jawaban = "3 laporan siap diteruskan ke holding.",
    dukungan = "1 laporan harian belum masuk. Kunci harian 2 jam 15 menit lagi (17.00 WIB).",
    harian = listOf(
        AntreanItem(
            jenis = JenisLaporan.HARIAN,
            idLaporan = "rpt-1",
            judul = "SIM RS Bhakti Rahayu",
            sub = "BRH-01 · PIC Rani Kusuma · dikirim 08.15 WIB · 2 bukti",
            status = StatusAntrean.SIAP,
            siap = true,
        ),
        AntreanItem(
            jenis = JenisLaporan.HARIAN,
            idLaporan = "rpt-2",
            judul = "Medcare Mobile",
            sub = "MCM-02 · PIC Aldi Pratama",
            status = StatusAntrean.BELUM_MASUK,
            siap = false,
        ),
        AntreanItem(
            jenis = JenisLaporan.HARIAN,
            idLaporan = "rpt-3",
            judul = "Klaim Payer",
            sub = "KLP-03 · PIC Dewi Lestari · 4 bukti · perlu buka kunci",
            status = StatusAntrean.BEKU,
            siap = false,
        ),
    ),
    mingguan = listOf(
        AntreanItem(
            jenis = JenisLaporan.MINGGUAN,
            idLaporan = "wk-1",
            judul = "Divisi Operasional",
            sub = "Kadiv Budi Santoso · 12 item",
            status = StatusAntrean.SIAP,
            siap = true,
        ),
    ),
)

@PreviewGanda
@Composable
private fun PenerimaanSiapPreview() {
    MKTheme {
        PenerimaanScreen(
            state = PenerimaanUiState.Siap(mejaPratinjau),
            aktivitas = AktivitasPenerimaan(sedangTerusSatu = "rpt-1"),
        )
    }
}

@PreviewGanda
@Composable
private fun PenerimaanMemuatPreview() {
    MKTheme {
        PenerimaanScreen(state = PenerimaanUiState.Memuat)
    }
}
