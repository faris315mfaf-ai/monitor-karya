// Sheet Ringkasan mingguan untuk Direktur (T6-C6 Fase 2) — permukaan
// RingkasanDirekturViewModel. Padanan web weekly-summary-card.tsx: angka
// minggu (Output diterima, Proyek sesuai jadwal, Kendala terbuka), daftar
// poin 1–3 baris MkField (tambah/hapus, maks 280 huruf), status Draf/
// Terkirim/Terkunci beserta waktu, konfirmasi saat kirim terhalang output
// menunggu review (409 PENDING_REVIEW), dan kirim/tarik kembali.
// Detail dibuka di Sheet, tidak pindah halaman (docs/design/05).
package id.co.monitorkarya.app.ui.tim

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkField
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
import id.co.monitorkarya.designsystem.theme.tabular
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

/** Versi ber-ViewModel; [terlihat] dikendalikan layar pemanggil (mis. tab Meja kerja). */
@Composable
fun RingkasanDirekturSheet(
    vm: RingkasanDirekturViewModel,
    terlihat: Boolean,
    onTutup: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val poin by vm.poin.collectAsStateWithLifecycle()
    val konfirmasiPending by vm.konfirmasiPending.collectAsStateWithLifecycle()
    val konfirmasiJumlah by vm.konfirmasiJumlah.collectAsStateWithLifecycle()
    val pesan by vm.pesan.collectAsStateWithLifecycle()
    val sibuk by vm.sibuk.collectAsStateWithLifecycle()
    RingkasanDirekturSheet(
        state = state,
        poin = poin,
        konfirmasiPending = konfirmasiPending,
        konfirmasiJumlah = konfirmasiJumlah,
        pesan = pesan,
        sibuk = sibuk,
        terlihat = terlihat,
        onTutup = onTutup,
        onUlang = vm::ulang,
        onUbahPoin = vm::ubahPoin,
        onTambahPoin = vm::tambahPoin,
        onHapusPoin = vm::hapusPoin,
        onPakaiOtomatis = vm::pakaiOtomatis,
        onSimpanDraf = vm::simpanDraf,
        onKirim = vm::kirim,
        onTarik = vm::tarik,
        onPesanTampil = vm::pesanTampil,
        modifier = modifier,
    )
}

/** Versi status murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Composable
fun RingkasanDirekturSheet(
    state: RingkasanUiState,
    poin: List<String>,
    konfirmasiPending: Boolean = false,
    konfirmasiJumlah: Int = 0,
    pesan: String? = null,
    sibuk: Boolean = false,
    terlihat: Boolean,
    onTutup: () -> Unit,
    onUlang: () -> Unit = {},
    onUbahPoin: (Int, String) -> Unit = { _, _ -> },
    onTambahPoin: () -> Unit = {},
    onHapusPoin: (Int) -> Unit = {},
    onPakaiOtomatis: () -> Unit = {},
    onSimpanDraf: () -> Unit = {},
    onKirim: (konfirmasi: Boolean) -> Unit = {},
    onTarik: () -> Unit = {},
    onPesanTampil: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val siap = state as? RingkasanUiState.Siap
    val data = siap?.data
    MkSheet(
        modifier = modifier,
        visible = terlihat,
        onTutup = onTutup,
        judul = if (data != null) "Laporan mingguan M${data.isoMinggu} untuk Direktur" else "Laporan mingguan untuk Direktur",
        subjudul = data?.let {
            "Disusun otomatis dari laporan harian dan output · serah paling lambat ${waktuWib(it.batasSerahIso) ?: "-"} WIB"
        },
        backLabel = "Kembali",
        footer = {
            when {
                data == null -> Unit
                data.terkirim -> MkButton(
                    label = if (sibuk) "Menarik…" else "Tarik untuk disunting",
                    enabled = !sibuk,
                    onClick = onTarik,
                )
                data.terblokirPesan != null -> MkButton(label = "Tutup", variant = MkButtonVariant.PLAIN, onClick = onTutup)
                else -> {
                    MkButton(
                        label = "Simpan draf",
                        enabled = !sibuk,
                        onClick = onSimpanDraf,
                    )
                    MkButton(
                        label = when {
                            sibuk -> "Mengirim…"
                            konfirmasiPending -> "Kirim tetap ke Direktur"
                            else -> "Kirim ke Direktur"
                        },
                        variant = MkButtonVariant.PRIMARY,
                        enabled = !sibuk,
                        onClick = { onKirim(konfirmasiPending) },
                    )
                }
            }
        },
    ) {
        when (state) {
            RingkasanUiState.Memuat -> repeat(3) {
                MkSkeleton(modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp))
            }
            is RingkasanUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
            is RingkasanUiState.Siap -> IsiRingkasan(
                data = state.data,
                poin = poin,
                konfirmasiPending = konfirmasiPending,
                konfirmasiJumlah = konfirmasiJumlah,
                pesan = pesan,
                onUbahPoin = onUbahPoin,
                onTambahPoin = onTambahPoin,
                onHapusPoin = onHapusPoin,
                onPakaiOtomatis = onPakaiOtomatis,
                onPesanTampil = onPesanTampil,
            )
        }
    }
}

// ------------------------------------------------------------------
// Isi sheet
// ------------------------------------------------------------------

@Composable
private fun IsiRingkasan(
    data: RingkasanDirekturUi,
    poin: List<String>,
    konfirmasiPending: Boolean,
    konfirmasiJumlah: Int,
    pesan: String?,
    onUbahPoin: (Int, String) -> Unit,
    onTambahPoin: () -> Unit,
    onHapusPoin: (Int) -> Unit,
    onPakaiOtomatis: () -> Unit,
    onPesanTampil: () -> Unit,
) {
    val bolehSunting = !data.terkirim && data.terblokirPesan == null
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
        BarisStatus(data)
        AngkaMinggu(data)

        if (!data.terkirim && data.menungguReview > 0 && data.terblokirPesan == null) {
            CatatanWarna(
                judul = "${data.menungguReview} output masih menunggu review",
                isi = "Output baru dihitung selesai setelah Anda terima. Review dulu supaya angka untuk Direktur final, atau kirim tetap.",
                warnaJudul = LocalMkColors.current.statusRisk,
                latar = LocalMkColors.current.statusRiskSoft,
            )
        }

        KolomPoin(
            poin = poin,
            bolehSunting = bolehSunting,
            onUbahPoin = onUbahPoin,
            onTambahPoin = onTambahPoin,
            onHapusPoin = onHapusPoin,
            onPakaiOtomatis = onPakaiOtomatis,
        )

        if (konfirmasiPending && !data.terkirim) {
            CatatanWarna(
                judul = "Kirim sebelum review selesai?",
                isi = "$konfirmasiJumlah output masih menunggu review dan tenggat serah belum lewat. " +
                    "Direktur akan melihat angka output yang belum final.",
                warnaJudul = LocalMkColors.current.statusLate,
                latar = LocalMkColors.current.statusLateSoft,
            )
        }

        if (data.terblokirPesan != null) {
            CatatanBlokir(data.terblokirPesan)
        }

        // Pesan hasil aksi (sukses/409) — hilang sendiri seperti toast web.
        if (pesan != null) {
            Text(
                text = pesan,
                style = MkTypography.footnote,
                color = LocalMkColors.current.ink2,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
            LaunchedEffect(pesan) {
                delay(4_000)
                onPesanTampil()
            }
        }
    }
}

/** Status pengiriman: Terkirim + waktu/penerima, Terkunci, atau Draf (+ lewat tenggat). */
@Composable
private fun BarisStatus(data: RingkasanDirekturUi) {
    val penerima = data.direktur.joinToString(", ")
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        when {
            data.terkirim -> {
                StatusBadge(
                    status = MkStatus.DONE,
                    text = if (penerima.isNotEmpty()) "Terkirim ke $penerima" else "Terkirim ke Direktur",
                )
                data.terkirimIso?.let { iso ->
                    TeksMeta("Dikirim ${waktuWib(iso) ?: "-"} WIB · dapat ditarik kembali ${data.undoMenit} menit setelah dikirim.")
                }
            }
            data.terblokirPesan != null -> StatusBadge(status = MkStatus.NEUTRAL, text = "Terkunci")
            else -> {
                val lewatTenggat = lewat(data.batasSerahIso)
                StatusBadge(
                    status = if (lewatTenggat) MkStatus.LATE else MkStatus.NEUTRAL,
                    text = "Draf",
                )
                data.diperbaruiIso?.let { iso -> TeksMeta("Draf diperbarui ${waktuWib(iso) ?: "-"} WIB.") }
            }
        }
    }
}

/** Tiga angka minggu ini (padanan mk-kv web). */
@Composable
private fun AngkaMinggu(data: RingkasanDirekturUi) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatBaris(
            label = "Output diterima",
            nilai = "${data.outputDiterima}",
            meta = if (data.targetOutput > 0) "dari ${data.targetOutput} target" else "belum ada target",
        )
        StatBaris(
            label = "Proyek sesuai jadwal",
            nilai = "${data.proyekSesuai}/${data.totalProyek}",
            meta = if (data.totalProyek > 0) "proyek aktif" else "tanpa proyek aktif",
        )
        StatBaris(
            label = "Kendala terbuka",
            nilai = "${data.kendalaTerbuka}",
            meta = if (data.kendalaTerbuka > 0) "perlu tindak lanjut" else "tidak ada",
        )
    }
}

/** Satu baris angka: label kiri, nilai besar kanan, meta di bawah label. */
@Composable
private fun StatBaris(label: String, nilai: String, meta: String) {
    val warna = LocalMkColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(warna.fill1)
            .padding(MkSpacing.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            Text(text = label, style = MkTypography.footnote, color = warna.ink2)
            Text(text = meta, style = MkTypography.caption, color = warna.ink2)
        }
        Text(
            text = nilai,
            style = MkTypography.title2.tabular,
            color = warna.ink,
        )
    }
}

/** Bagian "Poin untuk Direktur": baris MkField + tambah/hapus/pakai otomatis. */
@Composable
private fun KolomPoin(
    poin: List<String>,
    bolehSunting: Boolean,
    onUbahPoin: (Int, String) -> Unit,
    onTambahPoin: () -> Unit,
    onHapusPoin: (Int) -> Unit,
    onPakaiOtomatis: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        Text(
            text = "Poin untuk Direktur",
            style = MkTypography.headline,
            color = LocalMkColors.current.ink,
        )
        poin.forEachIndexed { indeks, isi ->
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkField(
                    modifier = Modifier.weight(1f),
                    nilai = isi,
                    onUbah = { onUbahPoin(indeks, it) },
                    label = "Poin ${indeks + 1}",
                    placeholder = "Satu kalimat capaian utama minggu ini",
                    baris = 2,
                    enabled = bolehSunting,
                    supportingText = "${isi.length}/$POIN_MAKS_HURUF",
                )
                MkButton(
                    label = "Hapus",
                    variant = MkButtonVariant.PLAIN,
                    size = MkButtonSize.S,
                    enabled = bolehSunting && poin.size > POIN_MIN,
                    onClick = { onHapusPoin(indeks) },
                )
            }
        }
        if (bolehSunting) {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                if (poin.size < POIN_MAKS) {
                    MkButton(label = "Tambah poin", size = MkButtonSize.S, onClick = onTambahPoin)
                }
                MkButton(label = "Pakai draf otomatis", variant = MkButtonVariant.PLAIN, size = MkButtonSize.S, onClick = onPakaiOtomatis)
            }
        }
    }
}

/** Kotak catatan berlatar token *-soft (padanan mk-note-box web). */
@Composable
private fun CatatanWarna(
    judul: String,
    isi: String,
    warnaJudul: androidx.compose.ui.graphics.Color,
    latar: androidx.compose.ui.graphics.Color,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(latar)
            .padding(MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Text(text = judul, style = MkTypography.bodyStrong, color = warnaJudul)
        Text(text = isi, style = MkTypography.footnote, color = warna.ink)
    }
}

/** Alasan ringkasan terkunci (blocked.message dari server). */
@Composable
private fun CatatanBlokir(pesan: String) {
    Text(
        text = pesan,
        style = MkTypography.footnote,
        color = LocalMkColors.current.ink2,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun TeksMeta(teks: String) {
    Text(
        text = teks,
        style = MkTypography.caption,
        color = LocalMkColors.current.ink2,
    )
}

// ------------------------------------------------------------------
// Waktu WIB ("Kamis, 8 Okt 16.20" — padanan dayTime web)
// ------------------------------------------------------------------

private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val formatWaktu = DateTimeFormatter.ofPattern("EEEE, d MMM HH.mm", Locale.forLanguageTag("id-ID")).withZone(WIB)

/** ISO → "Kamis, 8 Okt 16.20"; null bila ISO kosong/rusak. */
private fun waktuWib(iso: String?): String? =
    iso?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { formatWaktu.format(it) }

/** Apakah sekarang sudah lewat tenggat tersebut. */
private fun lewat(iso: String?): Boolean {
    val batas = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return false
    return Instant.now().isAfter(batas)
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun RingkasanDrafPreview() {
    MKTheme {
        RingkasanDirekturSheet(
            state = RingkasanUiState.Siap(contohData(terkirim = false)),
            poin = contohData(terkirim = false).poinOtomatis,
            konfirmasiPending = false,
            terlihat = true,
            onTutup = {},
        )
    }
}

@PreviewGanda
@Composable
private fun RingkasanTerkirimPreview() {
    MKTheme {
        RingkasanDirekturSheet(
            state = RingkasanUiState.Siap(contohData(terkirim = true)),
            poin = contohData(terkirim = true).poinTersimpan.orEmpty(),
            terlihat = true,
            onTutup = {},
        )
    }
}

private fun contohData(terkirim: Boolean): RingkasanDirekturUi = RingkasanDirekturUi(
    divisiId = "div-1",
    divisiNama = "Teknologi",
    mingguKunci = "2026-W41",
    isoMinggu = 41,
    batasSerahIso = "2026-10-08T10:00:00.000Z",
    kunciIso = "2026-10-09T10:00:00.000Z",
    outputDiterima = 12,
    targetOutput = 14,
    proyekSesuai = 5,
    totalProyek = 6,
    kendalaTerbuka = 2,
    menungguReview = if (terkirim) 0 else 3,
    terkirim = terkirim,
    poinTersimpan = if (terkirim) {
        listOf("Migrasi data gudang selesai 80%, sisa validasi berjalan.", "5 dari 6 proyek sesuai jadwal.")
    } else {
        null
    },
    poinOtomatis = listOf(
        "Migrasi data gudang selesai 80%, sisa validasi berjalan.",
        "5 dari 6 proyek sesuai jadwal.",
        "2 kendala terbuka menunggu keputusan perizinan.",
    ),
    terkirimIso = if (terkirim) "2026-10-08T06:30:00.000Z" else null,
    diperbaruiIso = "2026-10-08T06:00:00.000Z",
    direktur = listOf("dr. Bramantyo"),
    terblokirPesan = null,
    undoMenit = 15,
)
