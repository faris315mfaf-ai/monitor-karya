// Sheet laporan harian PIC (agen A1, 13 Okt 2026): "Tambah/Ubah entri"
// (EntrySheet web) dan "Ajukan buka kunci" (UnlockRequestSheet web).
package id.co.monitorkarya.app.ui.laporan

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.app.ui.draf.PenandaDrafPulih
import id.co.monitorkarya.core.data.outbox.IdLokal
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkLampiranRow
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular

/** Jenis berkas dokumen yang ditawarkan pemilih (selain foto). */
private val MIME_DOKUMEN = arrayOf(
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
 * Sheet satu entri: apa (judul + deskripsi), siapa (pelaksana), bagaimana
 * (hasil, status, progres, kendala), eskalasi (tanda + keputusan), rencana
 * besok, dan bukti. Entri baru: setelah disimpan Sheet tetap terbuka dan
 * bagian bukti aktif.
 */
@Composable
internal fun LembarEntriSheet(
    lembar: LembarEntri,
    namaProyek: String,
    subjudul: String,
    terkunci: Boolean,
    bukti: List<Bukti>,
    urlBukti: suspend (Bukti) -> String?,
    onUbah: (IsianEntri) -> Unit,
    onSimpan: () -> Unit,
    onTutup: () -> Unit,
    onUnggah: (Uri) -> Unit,
    onHapusBukti: (String) -> Unit,
    onBuangDraf: () -> Unit = {},
) {
    val warna = LocalMkColors.current
    val isian = lembar.isian
    val baruTersimpan = lembar.entriId == null && lembar.idTersimpan != null
    val bisaTulis = !terkunci && !lembar.sibuk
    var konfirmHapusBukti by remember { mutableStateOf<Bukti?>(null) }

    val pilihFoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let(onUnggah)
    }
    val pilihBerkas = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(onUnggah)
    }

    MkSheet(
        visible = true,
        onTutup = onTutup,
        // G1 (keputusan pemilik 13 Okt 2026, menggantikan E2E-1 #5): geser/
        // scrim/Kembali boleh menutup walau isian berubah — perubahan disimpan
        // sebagai draf otomatis dan dipulihkan saat dibuka lagi (tanpa dialog).
        bolehTutupGeser = !lembar.sibuk,
        // E2E-1 #10: galat validasi/server menempel di atas tombol Simpan.
        galat = slotGalat(lembar.galat),
        judul = when {
            lembar.entriId != null -> "Ubah entri"
            baruTersimpan -> "Entri tersimpan"
            else -> "Tambah entri"
        },
        subjudul = listOf(namaProyek, subjudul).filter { it.isNotBlank() }.joinToString(" · "),
        backLabel = "Laporan",
        footer = {
            MkButton(
                label = if (baruTersimpan) "Selesai" else "Batal",
                onClick = onTutup,
                enabled = !lembar.sibuk,
                modifier = Modifier.weight(1f),
            )
            MkButton(
                label = when {
                    lembar.sibuk -> "Menyimpan…"
                    lembar.idTersimpan != null -> "Simpan perubahan"
                    else -> "Simpan entri"
                },
                onClick = onSimpan,
                variant = MkButtonVariant.PRIMARY,
                enabled = bisaTulis && isian.judul.isNotBlank(),
                modifier = Modifier.weight(1f),
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
            lembar.drafPulih?.let { pada ->
                PenandaDrafPulih(disimpanPadaMs = pada, onBuang = onBuangDraf, enabled = bisaTulis)
            }
            if (terkunci) {
                Text(
                    "Laporan ini sudah terkunci, jadi entri ini hanya bisa dibaca.",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
            if (baruTersimpan) {
                Text(
                    if (IdLokal.adalah(lembar.idTersimpan)) {
                        "Entri tersimpan di perangkat dan menunggu kirim. Bukti yang dilampirkan ikut terkirim otomatis saat daring."
                    } else {
                        "Entri tersimpan. Lampirkan bukti di bawah, ubah isinya bila perlu, lalu tekan Selesai."
                    },
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }

            Bagian("Apa yang dikerjakan") {
                MkField(
                    nilai = isian.judul,
                    onUbah = { onUbah(isian.copy(judul = it.take(200))) },
                    label = "Judul entri (wajib)",
                    placeholder = "Mis. Pemasangan struktur tower segmen 3",
                    enabled = bisaTulis,
                    modifier = Modifier.fillMaxWidth(),
                )
                MkField(
                    nilai = isian.deskripsi,
                    onUbah = { onUbah(isian.copy(deskripsi = it.take(4000))) },
                    label = "Deskripsi",
                    placeholder = "Rincian pekerjaan, lokasi, atau catatan penting",
                    baris = 2,
                    supportingText = "Opsional",
                    enabled = bisaTulis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Bagian("Siapa") {
                MkField(
                    nilai = isian.pelaksana,
                    onUbah = { onUbah(isian.copy(pelaksana = it.take(120))) },
                    label = "Nama pelaksana",
                    placeholder = "Siapa yang mengerjakan",
                    supportingText = "Terisi otomatis dengan nama Anda; ubah bila dikerjakan orang lain.",
                    enabled = bisaTulis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Bagian("Bagaimana") {
                MkField(
                    nilai = isian.hasil,
                    onUbah = { onUbah(isian.copy(hasil = it.take(4000))) },
                    label = "Hasil hari ini",
                    placeholder = "Apa yang selesai atau sedang berjalan?",
                    baris = 2,
                    supportingText = "Digabung menjadi capaian laporan harian.",
                    enabled = bisaTulis,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Status (wajib)", style = MkTypography.footnote, color = warna.ink2)
                @OptIn(ExperimentalLayoutApi::class)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                    pilihanStatusUntuk(isian.status).forEach { (nilai, label) ->
                        MkChip(
                            label = label,
                            selected = isian.status == nilai,
                            status = nadaStatusEntri(nilai),
                            enabled = bisaTulis,
                            onClick = { onUbah(isian.denganStatus(nilai)) },
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    Text("Progres", style = MkTypography.footnote, color = warna.ink2)
                    Slider(
                        value = isian.progres.toFloat(),
                        onValueChange = { onUbah(isian.copy(progres = ((it / 5).toInt() * 5).coerceIn(0, 100))) },
                        valueRange = 0f..100f,
                        steps = 19,
                        enabled = bisaTulis,
                        colors = SliderDefaults.colors(
                            thumbColor = LocalAccent.current.fill,
                            activeTrackColor = LocalAccent.current.fill,
                            inactiveTrackColor = warna.fill2,
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .semantics { contentDescription = "Progres dalam persen" },
                    )
                    Text("${isian.progres}%", style = MkTypography.bodyStrong.tabular, color = warna.ink, modifier = Modifier.width(48.dp))
                }
                if (isian.wajibKendala) {
                    MkField(
                        nilai = isian.kendala,
                        onUbah = { onUbah(isian.copy(kendala = it.take(2000))) },
                        label = "Kendala (wajib)",
                        placeholder = "Apa yang menghambat, sejak kapan, dan dampaknya",
                        baris = 2,
                        enabled = bisaTulis,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            Bagian("Eskalasi") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Butuh eskalasi atau keputusan", style = MkTypography.bodyStrong, color = warna.ink)
                        Text(
                            "Tandai bila entri ini menunggu keputusan atau bantuan tingkat atas.",
                            style = MkTypography.footnote,
                            color = warna.ink2,
                        )
                    }
                    Switch(
                        checked = isian.eskalasi,
                        onCheckedChange = { onUbah(isian.copy(eskalasi = it)) },
                        enabled = bisaTulis,
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = LocalAccent.current.fill,
                            checkedThumbColor = LocalAccent.current.on,
                        ),
                    )
                }
                if (isian.wajibKeputusan) {
                    MkField(
                        nilai = isian.keputusan,
                        onUbah = { onUbah(isian.copy(keputusan = it.take(2000))) },
                        label = "Keputusan yang dibutuhkan (wajib)",
                        placeholder = "Keputusan apa, dari siapa, dan batas waktunya",
                        baris = 2,
                        enabled = bisaTulis,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            Bagian("Rencana besok") {
                MkField(
                    nilai = isian.rencana,
                    onUbah = { onUbah(isian.copy(rencana = it.take(2000))) },
                    label = if (isian.wajibRencana) "Rencana besok (wajib)" else "Rencana besok",
                    placeholder = "Langkah berikutnya",
                    baris = 2,
                    supportingText = if (isian.wajibRencana) null else "Opsional · wajib bila Terkendala",
                    enabled = bisaTulis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Bagian("Bukti") {
                if (lembar.idTersimpan == null) {
                    Text(
                        "Dokumen dan foto dapat dilampirkan setelah entri disimpan.",
                        style = MkTypography.footnote,
                        color = warna.ink2,
                    )
                } else {
                    if (bukti.isEmpty()) {
                        Text("Belum ada bukti. Laporan butuh minimal 1 bukti sebelum dikirim.", style = MkTypography.footnote, color = warna.ink2)
                    } else {
                        BuktiRingkas(bukti = bukti.filter { it.foto }, urlBukti = urlBukti)
                        bukti.forEach { b ->
                            MkLampiranRow(
                                namaBerkas = b.nama,
                                ukuranLabel = when {
                                    b.statusKirim == StatusKirim.GAGAL -> "Gagal kirim · ${b.galatKirim ?: ukuranLabel(b.ukuran)}"
                                    b.statusKirim == StatusKirim.MENUNGGU -> "Menunggu kirim · ${ukuranLabel(b.ukuran)}"
                                    b.tautan != null -> "Tautan"
                                    else -> ukuranLabel(b.ukuran)
                                },
                                sedangUnggah = lembar.hapusBuktiId == b.id,
                                onHapus = if (terkunci || lembar.hapusBuktiId != null) null else ({ konfirmHapusBukti = b }),
                            )
                        }
                    }
                    if (lembar.unggah) MkLampiranRow(namaBerkas = "Bukti baru", ukuranLabel = "", sedangUnggah = true)
                    if (!terkunci) {
                        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                            MkButton(
                                label = if (lembar.unggah) "Mengunggah…" else "Lampirkan foto",
                                onClick = {
                                    pilihFoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                },
                                size = MkButtonSize.S,
                                enabled = !lembar.unggah,
                            )
                            MkButton(
                                label = "Lampirkan berkas",
                                onClick = { pilihBerkas.launch(MIME_DOKUMEN) },
                                variant = MkButtonVariant.PLAIN,
                                size = MkButtonSize.S,
                                enabled = !lembar.unggah,
                            )
                        }
                        Text(
                            "Foto dikompres otomatis (sisi terpanjang 2048 px). Berkas maksimal 20 MB.",
                            style = MkTypography.caption,
                            color = warna.ink2,
                        )
                    }
                }
            }

        }
    }

    konfirmHapusBukti?.let { b ->
        Konfirmasi(
            judul = "Hapus bukti ini?",
            isi = "${b.nama} dihapus dari entri dan tidak bisa dikembalikan.",
            label = "Hapus bukti",
            onYa = {
                konfirmHapusBukti = null
                onHapusBukti(b.id)
            },
            onTidak = { konfirmHapusBukti = null },
        )
    }
}

/** Sheet "Ajukan buka kunci" — POST /api/unlock-requests (alasan ≥10 karakter). */
@Composable
internal fun LembarBukaKunciSheet(
    lembar: LembarBukaKunci,
    onUbah: (String) -> Unit,
    onAjukan: () -> Unit,
    onTutup: () -> Unit,
) {
    val warna = LocalMkColors.current
    MkSheet(
        visible = true,
        onTutup = onTutup,
        judul = "Ajukan buka kunci",
        subjudul = "Laporan ${lembar.namaProyek} · ${lembar.kataHari}",
        galat = slotGalat(listOfNotNull(lembar.galat)),
        backLabel = "Laporan",
        footer = {
            MkButton(label = "Batal", onClick = onTutup, enabled = !lembar.sibuk, modifier = Modifier.weight(1f))
            MkButton(
                label = if (lembar.sibuk) "Mengajukan…" else "Ajukan buka kunci",
                onClick = onAjukan,
                variant = MkButtonVariant.PRIMARY,
                enabled = !lembar.sibuk && lembar.alasanCukup,
                modifier = Modifier.weight(1f),
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            Text(
                "Direksi holding atau Tim TI memutuskan. Bila disetujui, laporan dibuka paling lama 24 jam lalu dikunci kembali otomatis.",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            MkField(
                nilai = lembar.alasan,
                onUbah = onUbah,
                label = "Alasan (wajib)",
                placeholder = "Mis. progres uji coba salah ketik, seharusnya 64%",
                baris = 4,
                supportingText = "Minimal 10 karakter. Sebutkan apa yang perlu diperbaiki.",
                enabled = !lembar.sibuk,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** Slot galat MkSheet (menempel di atas footer); null bila tidak ada galat. */
internal fun slotGalat(pesan: List<String>): (@Composable () -> Unit)? =
    if (pesan.isEmpty()) null else ({ KotakGalat(pesan) })

@Composable
private fun Bagian(judul: String, isi: @Composable () -> Unit) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        Text(
            judul,
            style = MkTypography.headline,
            color = warna.ink,
            modifier = Modifier
                .padding(top = MkSpacing.space1)
                .semantics { heading() },
        )
        isi()
    }
}
