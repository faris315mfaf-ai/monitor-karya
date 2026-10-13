// Kartu "Aturan pelaporan" Statistik Admin PT (BUG-02) — port
// src/components/admin/report-settings-card.tsx: status (lencana), buka/tutup
// pengisian harian, jam batas harian (24/7 + jam cepat + jam lain), hari wajib
// lapor (kosong = setiap hari), dan aturan capaian mingguan. Setiap ketukan
// langsung disimpan (PUT) seperti web; luring = kontrol nonaktif + pesan.
package id.co.monitorkarya.app.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/** Jenis jam yang sedang diisi lewat sheet "Jam lain". */
private enum class JenisJam { HARIAN, MINGGUAN }

/** Versi status murni — mudah dipratinjau tanpa ViewModel. */
@Composable
fun AturanPelaporanKartu(
    state: AturanUiState,
    menyimpan: Boolean,
    galatSimpan: String?,
    luring: Boolean,
    onSimpan: (PerubahanAturan) -> Unit,
    onUlang: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    MkCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Aturan pelaporan",
            style = MkTypography.headline,
            color = warna.ink,
            modifier = Modifier.semantics { heading() },
        )
        when (state) {
            AturanUiState.Memuat -> {
                Text(text = "Memuat…", style = MkTypography.footnote, color = warna.ink2)
                MkSkeleton(modifier = Modifier.fillMaxWidth().padTop(), tinggi = 160.dp)
            }
            is AturanUiState.Galat -> ErrorNote(
                modifier = Modifier.padTop(),
                pesan = state.pesan,
                onCobaLagi = onUlang,
            )
            is AturanUiState.Siap -> IsiAturan(
                aturan = state.aturan,
                menyimpan = menyimpan,
                galatSimpan = galatSimpan,
                luring = luring,
                onSimpan = onSimpan,
            )
        }
    }
}

private fun Modifier.padTop(): Modifier = this.padding(top = MkSpacing.space3)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.IsiAturan(
    aturan: AturanPelaporan,
    menyimpan: Boolean,
    galatSimpan: String?,
    luring: Boolean,
    onSimpan: (PerubahanAturan) -> Unit,
) {
    val warna = LocalMkColors.current
    val aktif = !menyimpan && !luring
    var sheetJam by remember { mutableStateOf<JenisJam?>(null) }

    Text(
        text = ringkasanMode(aturan),
        style = MkTypography.footnote,
        color = warna.ink2,
    )
    if (aturan.bawaan) {
        Text(
            text = "PT ini belum pernah mengatur — berlaku aturan bawaan server.",
            style = MkTypography.caption,
            color = warna.ink2,
        )
    }

    Column(
        modifier = Modifier.fillMaxWidth().padTop(),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        // Status — warna + ikon + kata.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            StatusBadge(
                status = if (aturan.harianBuka) MkStatus.ON else MkStatus.LATE,
                size = MkBadgeSize.SM,
                text = if (aturan.harianBuka) "Pengisian terbuka" else "Pengisian ditutup",
            )
            StatusBadge(
                status = if (aturan.jamHarian == null) MkStatus.DONE else MkStatus.INFO,
                size = MkBadgeSize.SM,
                text = teksJamHarian(aturan),
            )
        }

        if (luring) {
            BarisPesan(teks = PESAN_LURING_ATURAN, galat = false)
        } else if (galatSimpan != null && !menyimpan) {
            BarisPesan(teks = galatSimpan, galat = true)
        } else {
            // Slot satu baris SELALU ada (kosong saat diam): munculnya
            // "Menyimpan…" tidak mendorong chip di bawahnya, sehingga ketukan
            // berikut tidak bergeser sasaran (E2E-R2 N-02).
            Text(
                text = if (menyimpan) "Menyimpan…" else "",
                style = MkTypography.footnote,
                color = warna.ink2,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }

        // Buka/tutup pengisian harian.
        Bagian(judul = "Status pengisian laporan harian") {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkButton(
                    label = "Buka pengisian",
                    variant = if (aturan.harianBuka) MkButtonVariant.PRIMARY else MkButtonVariant.SECONDARY,
                    size = MkButtonSize.S,
                    enabled = aktif && !aturan.harianBuka,
                    onClick = { onSimpan(PerubahanAturan.BukaHarian(true)) },
                )
                MkButton(
                    label = "Tutup pengisian",
                    variant = if (!aturan.harianBuka) MkButtonVariant.PRIMARY else MkButtonVariant.SECONDARY,
                    size = MkButtonSize.S,
                    enabled = aktif && aturan.harianBuka,
                    onClick = { onSimpan(PerubahanAturan.BukaHarian(false)) },
                )
            }
        }

        // Jam batas harian.
        Bagian(judul = "Jam batas pengumpulan harian (WIB)") {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                MkChip(
                    label = "24/7 (tanpa batas)",
                    selected = aturan.jamHarian == null,
                    enabled = aktif,
                    onClick = { if (aturan.jamHarian != null) onSimpan(PerubahanAturan.JamHarian(null)) },
                )
                pilihanJam(PILIHAN_JAM_HARIAN, aturan.jamHarian).forEach { h ->
                    MkChip(
                        label = labelJam(h),
                        selected = aturan.jamHarian == h,
                        enabled = aktif,
                        onClick = { if (aturan.jamHarian != h) onSimpan(PerubahanAturan.JamHarian(h)) },
                    )
                }
                MkChip(label = "Jam lain…", enabled = aktif, onClick = { sheetJam = JenisJam.HARIAN })
            }
        }

        // Hari wajib lapor.
        Bagian(judul = "Hari yang wajib lapor (kosong = setiap hari)") {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                MkChip(
                    label = "Setiap hari",
                    selected = aturan.hariKerja.isEmpty(),
                    enabled = aktif,
                    onClick = { if (aturan.hariKerja.isNotEmpty()) onSimpan(PerubahanAturan.HariKerja(emptyList())) },
                )
                (1..7).forEach { d ->
                    MkChip(
                        label = NAMA_HARI_ISO.getValue(d),
                        selected = d in aturan.hariKerja,
                        enabled = aktif,
                        onClick = { onSimpan(PerubahanAturan.HariKerja(alihHari(aturan.hariKerja, d))) },
                    )
                }
            }
            Text(
                text = "Saat ini: ${ringkasanHari(aturan.hariKerja)}.",
                style = MkTypography.caption,
                color = warna.ink2,
            )
        }

        // Capaian mingguan.
        Bagian(judul = "Aturan capaian mingguan") {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                MkChip(
                    label = "Terbuka",
                    selected = aturan.mingguanBuka,
                    status = if (aturan.mingguanBuka) MkStatus.ON else null,
                    enabled = aktif,
                    onClick = { if (!aturan.mingguanBuka) onSimpan(PerubahanAturan.BukaMingguan(true)) },
                )
                MkChip(
                    label = "Ditutup",
                    selected = !aturan.mingguanBuka,
                    status = if (!aturan.mingguanBuka) MkStatus.LATE else null,
                    enabled = aktif,
                    onClick = { if (aturan.mingguanBuka) onSimpan(PerubahanAturan.BukaMingguan(false)) },
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                MkChip(
                    label = "Tanpa batas",
                    selected = aturan.jamMingguan == null,
                    enabled = aktif,
                    onClick = { if (aturan.jamMingguan != null) onSimpan(PerubahanAturan.JamMingguan(null)) },
                )
                pilihanJam(PILIHAN_JAM_MINGGUAN, aturan.jamMingguan).forEach { h ->
                    MkChip(
                        label = labelJam(h),
                        selected = aturan.jamMingguan == h,
                        enabled = aktif,
                        onClick = { if (aturan.jamMingguan != h) onSimpan(PerubahanAturan.JamMingguan(h)) },
                    )
                }
                MkChip(label = "Jam lain…", enabled = aktif, onClick = { sheetJam = JenisJam.MINGGUAN })
            }
        }
    }

    SheetJamLain(
        jenis = sheetJam,
        awal = when (sheetJam) {
            JenisJam.HARIAN -> aturan.jamHarian
            JenisJam.MINGGUAN -> aturan.jamMingguan
            null -> null
        },
        onTutup = { sheetJam = null },
        onSimpan = { jam ->
            when (sheetJam) {
                JenisJam.HARIAN -> onSimpan(PerubahanAturan.JamHarian(jam))
                JenisJam.MINGGUAN -> onSimpan(PerubahanAturan.JamMingguan(jam))
                null -> Unit
            }
            sheetJam = null
        },
    )
}

/** Jam cepat + jam kustom yang sedang berlaku (agar pilihan aktif selalu terlihat). */
internal fun pilihanJam(cepat: List<Int>, kini: Int?): List<Int> =
    if (kini == null || kini in cepat) cepat else (cepat + kini).sorted()

@Composable
private fun Bagian(judul: String, isi: @Composable ColumnScope.() -> Unit) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Text(text = judul, style = MkTypography.footnote, color = warna.ink2)
        isi()
    }
}

/** Pesan di kartu: galat simpan (late) atau luring (netral) — selalu ikon + kata. */
@Composable
private fun BarisPesan(teks: String, galat: Boolean) {
    val warna = LocalMkColors.current
    val nada = if (galat) warna.statusLate else warna.ink2
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (galat) Icons.Outlined.ErrorOutline else Icons.Outlined.CloudOff,
            contentDescription = null,
            tint = nada,
        )
        Text(text = teks, style = MkTypography.footnote, color = nada)
    }
}

/** Sheet "Jam lain": isian jam bulat 0–23 atau 24/7, divalidasi bacaJam(). */
@Composable
private fun SheetJamLain(
    jenis: JenisJam?,
    awal: Int?,
    onTutup: () -> Unit,
    onSimpan: (Int?) -> Unit,
) {
    var teks by remember(jenis) { mutableStateOf(awal?.let(::labelJam) ?: "") }
    var galat by remember(jenis) { mutableStateOf<String?>(null) }
    MkSheet(
        visible = jenis != null,
        onTutup = onTutup,
        judul = if (jenis == JenisJam.MINGGUAN) "Jam batas mingguan" else "Jam batas harian",
        subjudul = "Jam bulat WIB, 0 sampai 23. Tulis 24/7 untuk tanpa jam batas.",
        footer = {
            MkButton(label = "Batal", variant = MkButtonVariant.SECONDARY, onClick = onTutup)
            MkButton(
                label = "Simpan",
                variant = MkButtonVariant.PRIMARY,
                onClick = {
                    when (val h = bacaJam(teks)) {
                        is HasilJam.Sah -> onSimpan(h.jam)
                        is HasilJam.Galat -> galat = h.pesan
                    }
                },
            )
        },
    ) {
        MkField(
            nilai = teks,
            onUbah = {
                teks = it
                galat = null
            },
            label = "Jam (WIB)",
            placeholder = "17.00",
            isError = galat != null,
            supportingText = galat,
        )
    }
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

@PreviewGanda
@Composable
private fun AturanPelaporanKartuPreview() {
    MKTheme {
        AturanPelaporanKartu(
            state = AturanUiState.Siap(
                aturan = AturanPelaporan(
                    jamHarian = null,
                    hariKerja = emptyList(),
                    harianBuka = true,
                    jamMingguan = 17,
                    mingguanBuka = true,
                ),
                entityId = "pt-1",
            ),
            menyimpan = false,
            galatSimpan = null,
            luring = false,
            onSimpan = {},
            onUlang = {},
        )
    }
}
