// Formulir ajukan / ubah proyek di Sheet (padanan ProjectFormSheet web).
// Pilihan PT, kandidat PIC, divisi, dan rantai persetujuan datang dari
// GET /api/projects?options=1; validasi ramah di klien, keputusan di server (422).
package id.co.monitorkarya.feature.proyek.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.proyek.R
import id.co.monitorkarya.feature.proyek.domain.LABEL_FASE
import id.co.monitorkarya.feature.proyek.domain.Nada
import id.co.monitorkarya.feature.proyek.domain.labelPenyetuju

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FormProyekSheet(f: FormUi, vm: ProyekViewModel, snackbar: SnackbarHostState? = null) {
    val c = LocalMkColors.current
    val opsi = f.opsiData
    val rantaiTeks = f.rantai.joinToString(" → ") { labelPenyetuju(it) }
    val p = f.proyek
    MkSheet(
        visible = true,
        onTutup = vm::tutupForm,
        judul = if (p != null) stringResource(R.string.proyek_ubah) else stringResource(R.string.proyek_ajukan),
        subjudul = when {
            p != null -> "${p.code} · ${p.entity.name}"
            f.melewati -> "Tahap awal tanpa persetujuan. Proyek langsung aktif."
            f.rantai.isNotEmpty() -> "Perlu persetujuan berurutan: $rantaiTeks."
            opsi != null -> "Peran Anda tidak memerlukan persetujuan. Proyek langsung aktif."
            else -> null
        },
        backLabel = stringResource(R.string.proyek_detail_kembali),
        footer = {
            KakiDenganSnackbar(snackbar) {
                MkButton(label = stringResource(R.string.proyek_batal), onClick = vm::tutupForm, enabled = !f.sibuk, modifier = Modifier.weight(1f))
                MkButton(
                    label = when {
                        f.sibuk -> stringResource(R.string.proyek_menyimpan)
                        p != null -> stringResource(R.string.proyek_form_simpan)
                        f.rantai.isNotEmpty() && !f.melewati -> stringResource(R.string.proyek_ajukan)
                        else -> stringResource(R.string.proyek_form_buat)
                    },
                    onClick = vm::simpanForm,
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !f.sibuk && f.sah,
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            (f.opsi as? Bagian.Galat)?.let {
                KotakCatatan("${stringResource(R.string.proyek_form_galat_opsi)} ${it.pesan}", Nada.LATE)
            }

            if (p == null && opsi != null && !opsi.entityPinned) {
                val pilihanPt = opsi.entities.map { MkOpsi(it.id, "${it.name} · ${it.code}") }
                MkPilih(
                    pilihan = pilihanPt,
                    terpilih = pilihanPt.firstOrNull { it.value == f.entitasId },
                    onPilih = { vm.pilihEntitas(it.value) },
                    label = stringResource(R.string.proyek_form_pt),
                    placeholder = stringResource(R.string.proyek_form_pilih_pt),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            MkField(
                nilai = f.nama,
                onUbah = { v -> vm.ubahForm { it.copy(nama = v.take(BATAS_NAMA)) } },
                label = stringResource(R.string.proyek_form_nama),
                placeholder = stringResource(R.string.proyek_form_nama_ph),
                supportingText = stringResource(R.string.proyek_form_nama_hint),
            )
            MkField(
                nilai = f.penjelasan,
                onUbah = { v -> vm.ubahForm { it.copy(penjelasan = v.take(BATAS_PENJELASAN)) } },
                label = stringResource(R.string.proyek_penjelasan),
                placeholder = stringResource(R.string.proyek_form_penjelasan_ph),
                baris = 3,
                supportingText = stringResource(R.string.proyek_form_penjelasan_hint),
            )
            MkField(
                nilai = f.tujuan,
                onUbah = { v -> vm.ubahForm { it.copy(tujuan = v.take(BATAS_TUJUAN)) } },
                label = stringResource(R.string.proyek_form_tujuan),
                placeholder = stringResource(R.string.proyek_form_tujuan_ph),
                baris = 2,
            )

            val faseKosong = stringResource(R.string.proyek_form_fase_kosong)
            val pilihanFase = listOf(MkOpsi("", faseKosong)) + LABEL_FASE.map { (v, l) -> MkOpsi(v, l) }
            MkPilih(
                pilihan = pilihanFase,
                terpilih = pilihanFase.firstOrNull { it.value == f.fase },
                onPilih = { vm.ubahFase(it.value) },
                label = stringResource(R.string.proyek_form_fase),
                modifier = Modifier.fillMaxWidth(),
            )

            val picKosong = stringResource(R.string.proyek_form_pic_kosong)
            val kandidat = opsi?.candidates.orEmpty()
            val pilihanPic = buildList {
                add(MkOpsi("", picKosong))
                kandidat.forEach { k ->
                    val beban = if (k.activeProjects > 0) " · memegang ${k.activeProjects} proyek" else " · belum memegang proyek"
                    add(MkOpsi(k.id, k.name + beban))
                }
                // PIC lama yang tidak lagi menjadi kandidat tetap bisa dipertahankan.
                if (p?.picUserId != null && kandidat.none { it.id == p.picUserId }) add(MkOpsi(p.picUserId, p.picName ?: "PIC saat ini"))
            }
            MkPilih(
                pilihan = pilihanPic,
                terpilih = pilihanPic.firstOrNull { it.value == f.picId },
                onPilih = { o -> vm.ubahForm { it.copy(picId = o.value) } },
                label = stringResource(R.string.proyek_form_pic),
                enabled = f.opsi !is Bagian.Memuat,
                modifier = Modifier.fillMaxWidth(),
            )
            if (opsi != null && f.pemilikId.isNotEmpty() && kandidat.isEmpty()) {
                Text(stringResource(R.string.proyek_form_tanpa_kandidat), style = MkTypography.caption, color = c.ink2)
            }

            val divisiKosong = stringResource(R.string.proyek_form_divisi_kosong)
            val divisi = opsi?.divisions.orEmpty()
            val pilihanDivisi = buildList {
                add(MkOpsi("", divisiKosong))
                divisi.forEach { add(MkOpsi(it.id, it.name)) }
                if (p?.divisionId != null && p.division != null && divisi.none { it.id == p.divisionId }) {
                    add(MkOpsi(p.divisionId, p.division.name))
                }
            }
            MkPilih(
                pilihan = pilihanDivisi,
                terpilih = pilihanDivisi.firstOrNull { it.value == f.divisiId },
                onPilih = { o -> vm.ubahForm { it.copy(divisiId = o.value) } },
                label = stringResource(R.string.proyek_form_divisi),
                enabled = f.opsi !is Bagian.Memuat,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                KolomTanggal(
                    label = stringResource(R.string.proyek_form_mulai),
                    kunci = f.mulai,
                    onUbah = { v -> vm.ubahForm { it.copy(mulai = v) } },
                    modifier = Modifier.weight(1f),
                )
                KolomTanggal(
                    label = stringResource(R.string.proyek_form_selesai),
                    kunci = f.selesai,
                    onUbah = { v -> vm.ubahForm { it.copy(selesai = v) } },
                    modifier = Modifier.weight(1f),
                    galat = if (!f.urutanTanggalSah) "Harus setelah rencana mulai" else null,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                JudulBagian(stringResource(R.string.proyek_form_terkait))
                val pilihanTerkait = opsi?.entities.orEmpty().filter { it.id != f.pemilikId }
                when {
                    f.opsi is Bagian.Memuat && opsi == null -> MkSkeleton(tinggi = 36.dp)
                    pilihanTerkait.isEmpty() -> Text(
                        stringResource(if (f.pemilikId.isNotEmpty()) R.string.proyek_form_tanpa_pt_lain else R.string.proyek_form_pilih_pt_dulu),
                        style = MkTypography.footnote,
                        color = c.ink2,
                    )
                    else -> FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                    ) {
                        pilihanTerkait.forEach { e ->
                            MkChip(label = e.name, selected = e.id in f.terkait, onClick = { vm.alihkanTerkait(e.id) })
                        }
                    }
                }
                Text(
                    if (f.terkait.isNotEmpty()) {
                        stringResource(R.string.proyek_form_terkait_jumlah, f.terkait.size)
                    } else {
                        stringResource(R.string.proyek_form_terkait_hint)
                    },
                    style = MkTypography.footnote,
                    color = c.ink2,
                )
            }

            if (p != null && p.permissions.setLifecycle) {
                val pilihanSiklus = buildList {
                    if (p.lifecycle == "DIUSULKAN") add(MkOpsi("DIUSULKAN", "Diusulkan (menunggu persetujuan)"))
                    if (p.lifecycle == "DITOLAK") add(MkOpsi("DITOLAK", "Ditolak"))
                    // Proyek yang ditolak penyetuju tidak bisa diaktifkan lewat ganti status
                    // (server 422, T12) — jalurnya Ajukan ulang (C2 R2).
                    if (p.lifecycle == "AKTIF" || !pernahDitolak(p)) add(MkOpsi("AKTIF", "Aktif"))
                    add(MkOpsi("DITUTUP", "Ditutup"))
                    add(MkOpsi("DIARSIPKAN", "Diarsipkan"))
                }
                MkPilih(
                    pilihan = pilihanSiklus,
                    terpilih = pilihanSiklus.firstOrNull { it.value == f.siklus },
                    onPilih = { o -> vm.ubahForm { it.copy(siklus = o.value) } },
                    label = stringResource(R.string.proyek_form_status),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (p == null && f.rantai.isNotEmpty()) {
                BarisSakelar(
                    judul = stringResource(R.string.proyek_form_lewati),
                    deskripsi = if (f.faseAwal) {
                        "Proyek langsung aktif tanpa menunggu $rantaiTeks. Tercatat di detail proyek dan jejak audit."
                    } else {
                        "Hanya untuk tahap awal (Inisiasi). Ubah tahapnya bila ingin memakai jalur ini."
                    },
                    aktif = f.melewati,
                    enabled = f.bisaLewati,
                    onUbah = { v -> vm.ubahForm { it.copy(lewatiPersetujuan = v) } },
                )
            }

            if (f.galat.isNotEmpty()) KotakCatatan(f.galat.joinToString("\n"), Nada.LATE)
        }
    }
}

@Composable
private fun BarisSakelar(judul: String, deskripsi: String, aktif: Boolean, enabled: Boolean, onUbah: (Boolean) -> Unit) {
    val c = LocalMkColors.current
    val aksen = LocalAccent.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        Column(Modifier.weight(1f)) {
            Text(judul, style = MkTypography.bodyStrong, color = if (enabled) c.ink else c.ink3)
            Text(deskripsi, style = MkTypography.footnote, color = c.ink2)
        }
        Switch(
            checked = aktif,
            onCheckedChange = onUbah,
            enabled = enabled,
            modifier = Modifier.semantics { contentDescription = judul },
            colors = SwitchDefaults.colors(checkedTrackColor = aksen.fill, checkedThumbColor = c.putih),
        )
    }
}
