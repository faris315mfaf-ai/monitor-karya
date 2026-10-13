// Sheet "Atur tahapan" dan "Usulkan tenggat baru" (padanan StagesSheet &
// ProposalSheet di src/components/pic/stages.tsx). Hanya terbuka bila server
// menyatakan canEdit (PIC proyek, Admin PT-nya, master).
package id.co.monitorkarya.feature.proyek.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.proyek.R
import id.co.monitorkarya.feature.proyek.domain.Nada
import id.co.monitorkarya.feature.proyek.domain.STATUS_TAHAP
import id.co.monitorkarya.feature.proyek.domain.ZONA_WIB
import id.co.monitorkarya.feature.proyek.domain.tanggalPendek
import java.time.LocalDate

@Composable
fun EditorTahapSheet(d: DetailUi, e: EditorTahapUi, vm: ProyekViewModel, snackbar: SnackbarHostState? = null) {
    val c = LocalMkColors.current
    val items = d.tahapan.dataAtauNull()?.items.orEmpty()
    val f = e.draf
    MkSheet(
        visible = true,
        onTutup = vm::tutupEditorTahap,
        judul = stringResource(R.string.proyek_atur_tahapan),
        subjudul = "${items.size} tahap · urutkan, ubah tanggal, atau tandai tertahan",
        backLabel = stringResource(R.string.proyek_tahapan),
        footer = {
            KakiDenganSnackbar(snackbar) {
                MkButton(
                    label = when {
                        e.sibuk -> stringResource(R.string.proyek_menyimpan)
                        f.id != null -> stringResource(R.string.proyek_tahap_simpan)
                        else -> stringResource(R.string.proyek_tahap_tambah)
                    },
                    onClick = vm::simpanTahap,
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !e.sibuk,
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
            if (items.isEmpty()) {
                EmptyNote(teks = "Belum ada tahap. Mulai dari perencanaan sampai rilis.")
            } else {
                Column {
                    items.forEachIndexed { i, s ->
                        val (label, nada) = STATUS_TAHAP[s.status] ?: (s.status to Nada.NEUTRAL)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = MkSpacing.space1),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("${i + 1}. ${s.name}", style = MkTypography.bodyStrong, color = c.ink, maxLines = 1)
                                Text(rentangTahap(s.startDate, s.dueDate) ?: "Tanpa tanggal", style = MkTypography.caption, color = c.ink2)
                                Lencana(nada, label, modifier = Modifier.padding(top = MkSpacing.space1))
                            }
                            MkIconBtn(icon = Icons.Outlined.KeyboardArrowUp, label = "Naikkan ${s.name}", enabled = !d.sibukUrut && i > 0, onClick = { vm.pindahTahap(i, -1) })
                            MkIconBtn(icon = Icons.Outlined.KeyboardArrowDown, label = "Turunkan ${s.name}", enabled = !d.sibukUrut && i < items.lastIndex, onClick = { vm.pindahTahap(i, 1) })
                            MkIconBtn(icon = Icons.Outlined.Edit, label = "Ubah ${s.name}", onClick = { vm.pilihTahapUntukDiubah(s) })
                            MkIconBtn(icon = Icons.Outlined.Delete, label = "Hapus ${s.name}", onClick = { vm.mintaHapusTahap(s) })
                        }
                        if (i < items.lastIndex) MkDivider()
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    JudulBagian(
                        stringResource(if (f.id != null) R.string.proyek_tahap_ubah else R.string.proyek_tahap_baru),
                        modifier = Modifier.weight(1f),
                    )
                    if (f.id != null) {
                        MkButton(
                            label = stringResource(R.string.proyek_tahap_batal_ubah),
                            onClick = vm::batalUbahTahap,
                            variant = MkButtonVariant.PLAIN,
                            size = MkButtonSize.S,
                        )
                    }
                }
                MkField(
                    nilai = f.nama,
                    onUbah = { v -> vm.ubahDrafTahap { it.copy(nama = v.take(120)) } },
                    label = stringResource(R.string.proyek_tahap_nama),
                    placeholder = stringResource(R.string.proyek_tahap_nama_ph),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    KolomTanggal(
                        label = stringResource(R.string.proyek_tahap_mulai),
                        kunci = f.mulai,
                        onUbah = { v -> vm.ubahDrafTahap { it.copy(mulai = v) } },
                        modifier = Modifier.weight(1f),
                    )
                    KolomTanggal(
                        label = stringResource(R.string.proyek_tahap_selesai),
                        kunci = f.selesai,
                        onUbah = { v -> vm.ubahDrafTahap { it.copy(selesai = v) } },
                        modifier = Modifier.weight(1f),
                    )
                }
                val pilihanStatus = STATUS_TAHAP.map { (v, p) -> MkOpsi(v, p.first) }
                MkPilih(
                    pilihan = pilihanStatus,
                    terpilih = pilihanStatus.firstOrNull { it.value == f.status },
                    onPilih = { o -> vm.ubahDrafTahap { it.copy(status = o.value) } },
                    label = stringResource(R.string.proyek_tahap_status),
                    modifier = Modifier.fillMaxWidth(),
                )
                val tertahan = f.status == "TERTAHAN"
                MkField(
                    nilai = f.catatan,
                    onUbah = { v -> vm.ubahDrafTahap { it.copy(catatan = v.take(500)) } },
                    label = stringResource(if (tertahan) R.string.proyek_tahap_alasan else R.string.proyek_tahap_catatan),
                    supportingText = if (tertahan) "Tampil di diagram, mis. \"Perangkat terlambat\"" else null,
                )
                e.galat?.let { KotakCatatan(it, Nada.LATE) }
            }
        }
    }
}

@Composable
fun UsulTenggatSheet(d: DetailUi, u: UsulTenggatUi, vm: ProyekViewModel, snackbar: SnackbarHostState? = null) {
    val target = d.tahapan.dataAtauNull()?.targetEndDate
    val besok = LocalDate.now(ZONA_WIB).plusDays(1)
    MkSheet(
        visible = true,
        onTutup = vm::tutupUsulTenggat,
        judul = stringResource(R.string.proyek_usulkan_tenggat),
        subjudul = tanggalPendek(target)?.let { "Tenggat sekarang $it · diputuskan Direktur entitas" } ?: "Diputuskan Direktur entitas",
        backLabel = stringResource(R.string.proyek_tahapan),
        footer = {
            KakiDenganSnackbar(snackbar) {
                MkButton(
                    label = stringResource(if (u.sibuk) R.string.proyek_mengirim else R.string.proyek_usul_kirim),
                    onClick = { vm.kirimUsulTenggat() },
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !u.sibuk,
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            KolomTanggal(
                label = stringResource(R.string.proyek_usul_tanggal),
                kunci = u.tanggal,
                onUbah = { v -> vm.ubahUsulTenggat { it.copy(tanggal = v, galatTanggal = null) } },
                minimal = besok,
                galat = u.galatTanggal,
                bolehKosong = false,
            )
            MkField(
                nilai = u.alasan,
                onUbah = { v -> vm.ubahUsulTenggat { it.copy(alasan = v.take(1000), galatAlasan = null) } },
                label = stringResource(R.string.proyek_usul_alasan),
                placeholder = "Mis. perangkat uji gelombang 2 terlambat 4 hari dari vendor",
                baris = 4,
                isError = u.galatAlasan != null,
                supportingText = u.galatAlasan ?: stringResource(R.string.proyek_usul_alasan_hint),
            )
            u.galatForm?.let { KotakCatatan(it, Nada.LATE) }
        }
    }
}
