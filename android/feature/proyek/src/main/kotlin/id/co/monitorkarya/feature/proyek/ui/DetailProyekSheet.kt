// Sheet detail proyek (padanan ProjectDetailSheet web) + bagian pemantauan:
// progres & tenggat, identitas (PT, PIC, divisi, tanggal, PT terkait, tag),
// penjelasan/tujuan, rantai persetujuan, keputusan, tahapan + usulan tenggat,
// riwayat laporan harian, output, eskalasi terkait, dan zona hapus. Tombol
// kaki mengikuti izin server (approve/resubmit/manage) — maks satu primer.
package id.co.monitorkarya.feature.proyek.ui

import id.co.monitorkarya.core.domain.teks.labelPic
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkRing
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.proyek.R
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.domain.KEBUTUHAN_ESKALASI
import id.co.monitorkarya.feature.proyek.domain.LABEL_FASE
import id.co.monitorkarya.feature.proyek.domain.LABEL_SIKLUS
import id.co.monitorkarya.feature.proyek.domain.LangkahPersetujuan
import id.co.monitorkarya.feature.proyek.domain.Nada
import id.co.monitorkarya.feature.proyek.domain.STATUS_ESKALASI
import id.co.monitorkarya.feature.proyek.domain.STATUS_LAPORAN
import id.co.monitorkarya.feature.proyek.domain.STATUS_OUTPUT
import id.co.monitorkarya.feature.proyek.domain.STATUS_TAHAP
import id.co.monitorkarya.feature.proyek.domain.catatanPenolakan
import id.co.monitorkarya.feature.proyek.domain.langkahPersetujuan
import id.co.monitorkarya.feature.proyek.domain.sisaHari
import id.co.monitorkarya.feature.proyek.domain.statusTampil
import id.co.monitorkarya.feature.proyek.domain.tanggal
import id.co.monitorkarya.feature.proyek.domain.tanggalJam
import id.co.monitorkarya.feature.proyek.domain.tanggalPendek

/** Laporan yang ditampilkan di riwayat (sama dengan LAPORAN_DIAMBIL). */
private const val RIWAYAT_TAMPIL = 10

/**
 * [snackbar] bukan null = host snackbar layar dipindah ke Sheet paling atas yang
 * tampil (detail, editor tahapan, atau usul tenggat) agar umpan balik dan
 * Urungkan tidak tertutup Sheet modal (C2 T1).
 */
@Composable
fun DetailProyekSheet(d: DetailUi, vm: ProyekViewModel, snackbar: SnackbarHostState? = null) {
    val p = d.proyek
    val st = statusTampil(p)
    val lapisan = lapisanSnackbar(d, adaForm = false)
    // Editor tahapan & usul tenggat tampil sebagai Sheet tersendiri menggantikan detail.
    MkSheet(
        visible = d.editorTahap == null && d.usulTenggat == null,
        onTutup = vm::tutupDetail,
        judul = p.name,
        subjudul = "${p.code} · ${p.entity.name}",
        backLabel = stringResource(R.string.proyek_detail_kembali),
        footer = { KakiDenganSnackbar(snackbar.takeIf { lapisan == LapisanSnackbar.DETAIL }) { KakiDetail(d, vm) } },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space5)) {
            Lencana(st.nada, st.label, kecil = false)
            if (d.berjalan) BagianProgres(p, st.nada, st.progres)
            if (st.alasan != null && p.lifecycle != "DITOLAK") {
                KotakCatatan(st.alasan, if (st.nada == Nada.LATE) Nada.LATE else Nada.RISK)
            }
            BagianIdentitas(p)
            BagianPenjelasan(p)
            BagianPersetujuan(p)
            if (p.permissions.approve && d.keputusan != null) {
                val tolak = d.keputusan == "DITOLAK"
                MkField(
                    nilai = d.catatan,
                    onUbah = vm::ubahCatatan,
                    label = stringResource(if (tolak) R.string.proyek_alasan_penolakan else R.string.proyek_catatan_pengaju),
                    placeholder = if (tolak) "Tulis alasan penolakan" else "Tulis catatan bila perlu",
                    baris = 3,
                    supportingText = stringResource(if (tolak) R.string.proyek_alasan_hint else R.string.proyek_catatan_hint),
                )
            }
            d.galat?.let { KotakCatatan(it, Nada.LATE) }
            if (d.berjalan) {
                BagianTahapan(d, vm)
                BagianRiwayat(d)
                BagianOutput(d)
                BagianEskalasi(d)
            }
            if (p.permissions.manage && d.keputusan == null) ZonaHapus(d, vm)
        }
    }
    d.editorTahap?.let { EditorTahapSheet(d, it, vm, snackbar.takeIf { lapisan == LapisanSnackbar.EDITOR_TAHAP }) }
    d.usulTenggat?.let { UsulTenggatSheet(d, it, vm, snackbar.takeIf { lapisan == LapisanSnackbar.USUL_TENGGAT }) }
    d.konfirmasi?.let { KonfirmasiDetail(it, p, vm) }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.KakiDetail(d: DetailUi, vm: ProyekViewModel) {
    val perm = d.proyek.permissions
    val bekerja = d.sibuk != null
    if (perm.approve && d.keputusan != null) {
        val tolak = d.keputusan == "DITOLAK"
        MkButton(label = stringResource(R.string.proyek_batal), onClick = vm::batalKeputusan, enabled = !bekerja, modifier = Modifier.weight(1f))
        MkButton(
            label = when {
                d.sibuk == "decide" -> stringResource(R.string.proyek_menyimpan)
                tolak -> stringResource(R.string.proyek_tolak_pengajuan)
                else -> stringResource(R.string.proyek_setujui_pengajuan)
            },
            onClick = vm::kirimKeputusan,
            variant = MkButtonVariant.PRIMARY,
            enabled = !bekerja && (!tolak || d.catatan.trim().length >= 5),
            modifier = Modifier.weight(1f),
        )
        return
    }
    val adaPrimer = perm.approve || perm.resubmit
    if (perm.manage) {
        MkButton(
            label = stringResource(R.string.proyek_ubah),
            onClick = { vm.bukaFormUbah(d.proyek) },
            variant = if (adaPrimer) MkButtonVariant.SECONDARY else MkButtonVariant.PRIMARY,
            enabled = !bekerja,
            modifier = Modifier.weight(1f),
        )
    }
    if (perm.resubmit) {
        MkButton(
            label = stringResource(if (d.sibuk == "resubmit") R.string.proyek_mengirim else R.string.proyek_ajukan_ulang),
            onClick = vm::ajukanUlang,
            variant = MkButtonVariant.PRIMARY,
            enabled = !bekerja,
            modifier = Modifier.weight(1f),
        )
    }
    if (perm.approve) {
        MkButton(label = stringResource(R.string.proyek_tolak), onClick = { vm.mulaiKeputusan("DITOLAK") }, enabled = !bekerja, modifier = Modifier.weight(1f))
        MkButton(
            label = stringResource(R.string.proyek_setujui),
            onClick = { vm.mulaiKeputusan("DISETUJUI") },
            variant = MkButtonVariant.PRIMARY,
            enabled = !bekerja,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun BagianProgres(p: ProyekDto, nada: Nada, progres: Int) {
    val c = LocalMkColors.current
    val r = p.latestReport
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space5), verticalAlignment = Alignment.CenterVertically) {
        MkRing(
            nilai = progres,
            diameter = 88.dp,
            warna = if (nada == Nada.NEUTRAL || nada == Nada.INFO) androidx.compose.ui.graphics.Color.Unspecified else warnaStatus(nada.keMkStatus()),
        )
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            Text("$progres% selesai", style = MkTypography.headline, color = c.ink)
            Text(
                tanggal(p.targetEndDate)?.let { "Tenggat $it" } ?: "Tenggat belum ditetapkan",
                style = MkTypography.footnote,
                color = c.ink2,
            )
            Text(
                tanggal(r?.reportDate)?.let { "Laporan terakhir $it" } ?: "Belum ada laporan harian",
                style = MkTypography.footnote,
                color = c.ink2,
            )
            if (r?.isLate == true) Lencana(Nada.LATE, stringResource(R.string.proyek_laporan_terlambat))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BagianIdentitas(p: ProyekDto) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        BarisInfo(Icons.Outlined.Business, p.entity.name + (p.entity.region?.let { " · $it" } ?: ""))
        BarisInfo(Icons.Outlined.Person, labelPic(p.picName))
        BarisInfo(Icons.Outlined.Groups, p.division?.name?.let { "Divisi $it" } ?: "Divisi mengikuti divisi PIC")
        if (p.startDate != null || p.targetEndDate != null) {
            BarisInfo(
                Icons.Outlined.CalendarMonth,
                "${tanggal(p.startDate) ?: "-"} sampai ${tanggal(p.targetEndDate) ?: "target belum ada"}",
            )
        }
        if (p.relatedEntities.isNotEmpty()) {
            BarisInfo(Icons.Outlined.AccountTree, "Terkait " + p.relatedEntities.joinToString(", ") { it.name })
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Tag(LABEL_FASE[p.phase] ?: p.phase)
            Tag(LABEL_SIKLUS[p.lifecycle] ?: p.lifecycle)
            if (p.noApproval) Tag(stringResource(R.string.proyek_tanpa_persetujuan))
        }
    }
}

@Composable
private fun BagianPenjelasan(p: ProyekDto) {
    val c = LocalMkColors.current
    if (p.description.isNullOrBlank() && p.purpose.isNullOrBlank()) return
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        p.description?.takeIf { it.isNotBlank() }?.let {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                JudulBagian(stringResource(R.string.proyek_penjelasan))
                Text(it, style = MkTypography.body, color = c.ink)
            }
        }
        p.purpose?.takeIf { it.isNotBlank() }?.let {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                JudulBagian(stringResource(R.string.proyek_tujuan))
                Text(it, style = MkTypography.body, color = c.ink2)
            }
        }
    }
}

@Composable
private fun BagianPersetujuan(p: ProyekDto) {
    val c = LocalMkColors.current
    val diajukan = p.lifecycle == "DIUSULKAN"
    val ditolak = p.lifecycle == "DITOLAK"
    if (!diajukan && !ditolak && !p.noApproval) return
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        JudulBagian(stringResource(R.string.proyek_persetujuan))
        Text(
            "Diajukan ${p.proposedBy?.name ?: "-"}" + (tanggalJam(p.proposedAt)?.let { " · $it" } ?: ""),
            style = MkTypography.footnote,
            color = c.ink2,
        )
        when {
            p.noApproval -> KotakCatatan(
                "Tahap awal tanpa persetujuan. Didaftarkan ${p.proposedBy?.name ?: "pengaju"} dan langsung aktif. " +
                    "Persetujuan menyusul saat proyek naik tahap.",
                Nada.INFO,
            )
            p.approvalChain.isEmpty() -> KotakCatatan(
                "Langsung aktif. Diajukan ${p.proposedBy?.name ?: "pengaju di puncak rantai"} tanpa perlu persetujuan.",
                Nada.DONE,
            )
            else -> Column {
                val langkah = langkahPersetujuan(p)
                langkah.forEachIndexed { i, l ->
                    BarisLangkah(l)
                    if (i < langkah.lastIndex) MkDivider()
                }
            }
        }
        if (ditolak) catatanPenolakan(p)?.let { KotakCatatan("Alasan penolakan: $it", Nada.LATE) }
    }
}

/** Satu slot rantai: ikon + kata keadaan (bukan warna saja). */
@Composable
private fun BarisLangkah(l: LangkahPersetujuan) {
    val c = LocalMkColors.current
    val (ikon, warna) = when (l.keadaan) {
        LangkahPersetujuan.Keadaan.SELESAI -> Icons.Outlined.CheckCircle to c.statusOn
        LangkahPersetujuan.Keadaan.DITOLAK -> Icons.Outlined.Block to c.statusLate
        LangkahPersetujuan.Keadaan.GILIRAN -> Icons.Outlined.Schedule to c.statusInfo
        LangkahPersetujuan.Keadaan.MENUNGGU -> Icons.Outlined.Circle to c.ink3
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = MkSpacing.space2),
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(ikon, contentDescription = null, tint = warna, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f)) {
            Text(l.judul, style = MkTypography.bodyStrong, color = c.ink)
            l.sub?.let { Text(it, style = MkTypography.caption, color = c.ink2) }
        }
        Text(l.meta, style = MkTypography.footnote, color = warna)
    }
}

@Composable
private fun BagianTahapan(d: DetailUi, vm: ProyekViewModel) {
    val c = LocalMkColors.current
    val data = d.tahapan.dataAtauNull()
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                JudulBagian(stringResource(R.string.proyek_tahapan))
                data?.let {
                    Text(
                        if (it.total > 0) "${it.done} dari ${it.total} tahap selesai" else stringResource(R.string.proyek_tahapan_kosong),
                        style = MkTypography.footnote,
                        color = c.ink2,
                    )
                }
            }
            if (data?.canEdit == true) {
                MkButton(
                    label = stringResource(if (data.total > 0) R.string.proyek_atur_tahapan else R.string.proyek_susun_tahapan),
                    onClick = vm::bukaEditorTahap,
                    variant = MkButtonVariant.PLAIN,
                    size = MkButtonSize.S,
                )
            }
        }
        when (val t = d.tahapan) {
            Bagian.Memuat -> repeat(3) { MkSkeleton(tinggi = 40.dp) }
            is Bagian.Galat -> KotakCatatan(t.pesan, Nada.LATE)
            is Bagian.Siap -> {
                Column {
                    t.data.items.forEachIndexed { i, s ->
                        val (label, nada) = STATUS_TAHAP[s.status] ?: (s.status to Nada.NEUTRAL)
                        val rentang = rentangTahap(s.startDate, s.dueDate)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = MkSpacing.space2),
                            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("${i + 1}. ${s.name}", style = MkTypography.bodyStrong, color = c.ink)
                                val meta = listOfNotNull(rentang, s.note?.takeIf { s.status == "TERTAHAN" || s.status == "BERJALAN" })
                                if (meta.isNotEmpty()) Text(meta.joinToString(" · "), style = MkTypography.caption, color = c.ink2)
                            }
                            Lencana(nada, label)
                        }
                        if (i < t.data.items.lastIndex) MkDivider()
                    }
                }
                BlokTenggat(d, vm)
            }
        }
    }
}

/** Tenggat proyek + usulan geser (ajukan, tarik, putuskan) — pola DeadlineBlock web. */
@Composable
private fun BlokTenggat(d: DetailUi, vm: ProyekViewModel) {
    val c = LocalMkColors.current
    val data = d.tahapan.dataAtauNull() ?: return
    val bolehUsul = data.canEdit
    val terbuka = d.usulanTerbuka
    val terakhir = d.usulanTerakhir
    val sisa = sisaHari(data.targetEndDate)
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    tanggalPendek(data.targetEndDate)?.let { "Tenggat $it" } ?: "Tenggat belum ditetapkan",
                    style = MkTypography.bodyStrong,
                    color = c.ink,
                )
                Text(
                    when {
                        sisa == null -> "Hubungi Admin PT untuk menetapkan tenggat"
                        sisa < 0 -> "Lewat ${-sisa} hari"
                        sisa == 0L -> "Hari ini"
                        else -> "$sisa hari lagi"
                    },
                    style = MkTypography.footnote,
                    color = c.ink2,
                )
            }
            if (bolehUsul && terbuka == null && d.usulan is Bagian.Siap) {
                MkButton(label = stringResource(R.string.proyek_usulkan_tenggat), onClick = vm::bukaUsulTenggat, size = MkButtonSize.S)
            }
        }
        when {
            terbuka != null -> {
                Lencana(Nada.NEUTRAL, "Usul ${tanggalPendek(terbuka.proposedDate)} · sedang ditinjau")
                Text(
                    "${terbuka.reason} — diajukan ${terbuka.proposedByName ?: "-"}",
                    style = MkTypography.footnote,
                    color = c.ink2,
                )
                val pu = d.putusUsulan
                if (pu != null) {
                    val tolak = pu.aksi == "reject"
                    MkField(
                        nilai = pu.catatan,
                        onUbah = vm::ubahCatatanUsulan,
                        label = if (tolak) "Alasan penolakan" else "Catatan (opsional)",
                        baris = 2,
                        isError = pu.galat != null,
                        supportingText = pu.galat,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                        MkButton(label = stringResource(R.string.proyek_batal), onClick = vm::batalPutusUsulan, enabled = !pu.sibuk, size = MkButtonSize.S, modifier = Modifier.weight(1f))
                        MkButton(
                            label = if (pu.sibuk) stringResource(R.string.proyek_menyimpan) else stringResource(if (tolak) R.string.proyek_usul_tolak else R.string.proyek_usul_setujui),
                            onClick = vm::kirimPutusUsulan,
                            enabled = !pu.sibuk,
                            size = MkButtonSize.S,
                            modifier = Modifier.weight(1f),
                        )
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                        if (bolehUsul) {
                            MkButton(
                                label = stringResource(R.string.proyek_tarik_usulan),
                                onClick = { vm.tarikUsulan(terbuka) },
                                variant = MkButtonVariant.PLAIN,
                                enabled = !d.sibukUsulan,
                                size = MkButtonSize.S,
                            )
                        }
                        // Usulan milik sendiri diputuskan pihak lain (server 403) — C2 R1.
                        if (d.bolehPutus(terbuka)) {
                            MkButton(label = stringResource(R.string.proyek_tolak), onClick = { vm.mulaiPutusUsulan(terbuka, "reject") }, size = MkButtonSize.S)
                            MkButton(label = stringResource(R.string.proyek_setujui), onClick = { vm.mulaiPutusUsulan(terbuka, "approve") }, size = MkButtonSize.S)
                        }
                    }
                }
            }
            terakhir != null -> Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalAlignment = Alignment.CenterVertically) {
                val setuju = terakhir.status == "DISETUJUI"
                Lencana(if (setuju) Nada.DONE else Nada.LATE, if (setuju) "Usulan disetujui" else "Usulan ditolak")
                Text(
                    (tanggalPendek(terakhir.proposedDate) ?: "-") +
                        (terakhir.decidedByName?.let { " · $it" } ?: "") +
                        (terakhir.decisionNote?.let { ": $it" } ?: ""),
                    style = MkTypography.caption,
                    color = c.ink2,
                )
            }
        }
        (d.usulan as? Bagian.Galat)?.let { KotakCatatan(it.pesan, Nada.LATE) }
    }
}

@Composable
private fun BagianRiwayat(d: DetailUi) {
    val c = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        JudulBagian(stringResource(R.string.proyek_riwayat))
        when (val l = d.laporan) {
            Bagian.Memuat -> repeat(3) { MkSkeleton(tinggi = 44.dp) }
            is Bagian.Galat -> KotakCatatan(l.pesan, Nada.LATE)
            is Bagian.Siap -> if (l.data.isEmpty()) {
                Text(stringResource(R.string.proyek_riwayat_kosong), style = MkTypography.footnote, color = c.ink2)
            } else {
                val tampil = l.data.take(RIWAYAT_TAMPIL)
                Column {
                    tampil.forEachIndexed { i, r ->
                        val (label, nada) = STATUS_LAPORAN[r.status] ?: (r.status to Nada.NEUTRAL)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = MkSpacing.space2),
                            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${tanggalPendek(r.reportDate) ?: "-"} · ${r.progressPct}%",
                                    style = MkTypography.bodyStrong,
                                    color = c.ink,
                                )
                                val isi = listOfNotNull(
                                    r.achievementToday?.takeIf { it.isNotBlank() },
                                    r.obstacle?.takeIf { it.isNotBlank() }?.let { "Kendala: $it" },
                                    r.submittedBy?.name?.takeIf { it.isNotBlank() }?.let { "oleh $it" },
                                    if (r.isLate) "terlambat" else null,
                                ).joinToString(" · ")
                                if (isi.isNotEmpty()) Text(isi, style = MkTypography.caption, color = c.ink2, maxLines = 2)
                            }
                            Lencana(nada, label)
                        }
                        if (i < tampil.lastIndex) MkDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun BagianOutput(d: DetailUi) {
    val c = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        JudulBagian(stringResource(R.string.proyek_output))
        when (val o = d.output) {
            Bagian.Memuat -> repeat(2) { MkSkeleton(tinggi = 44.dp) }
            is Bagian.Galat -> KotakCatatan(o.pesan, Nada.LATE)
            is Bagian.Siap -> if (o.data.items.isEmpty()) {
                Text(stringResource(R.string.proyek_output_kosong), style = MkTypography.footnote, color = c.ink2)
            } else {
                Column {
                    o.data.items.forEachIndexed { i, x ->
                        val (label, nada) = STATUS_OUTPUT[x.status] ?: (x.status to Nada.NEUTRAL)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = MkSpacing.space2),
                            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(x.title, style = MkTypography.bodyStrong, color = c.ink)
                                val meta = listOfNotNull(
                                    tanggalPendek(x.dueDate)?.let { "Target $it" },
                                    "${x.evidenceCount} bukti",
                                    x.ownerName,
                                    x.revisionNote?.takeIf { x.status == "PERLU_REVISI" }?.let { "Revisi: $it" },
                                ).joinToString(" · ")
                                Text(meta, style = MkTypography.caption, color = c.ink2, maxLines = 2)
                            }
                            Lencana(nada, label)
                        }
                        if (i < o.data.items.lastIndex) MkDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun BagianEskalasi(d: DetailUi) {
    val c = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        JudulBagian(stringResource(R.string.proyek_eskalasi))
        when (val e = d.eskalasi) {
            Bagian.Memuat -> MkSkeleton(tinggi = 44.dp)
            is Bagian.Galat -> KotakCatatan(e.pesan, Nada.LATE)
            is Bagian.Siap -> if (e.data.isEmpty()) {
                Text(stringResource(R.string.proyek_eskalasi_kosong), style = MkTypography.footnote, color = c.ink2)
            } else {
                Column {
                    e.data.forEachIndexed { i, x ->
                        val (label, nada) = if (x.isOverdue && x.status != "DIPUTUSKAN" && x.status != "DITUTUP") {
                            "Lewat SLA" to Nada.LATE
                        } else {
                            STATUS_ESKALASI[x.status] ?: (x.status to Nada.NEUTRAL)
                        }
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = MkSpacing.space2),
                            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(x.summary, style = MkTypography.bodyStrong, color = c.ink, maxLines = 3)
                                val meta = listOfNotNull(
                                    KEBUTUHAN_ESKALASI[x.needed] ?: x.needed.takeIf { it.isNotBlank() },
                                    tanggalPendek(x.raisedAt),
                                    "${x.ageDays} hari",
                                    x.decisionText?.takeIf { it.isNotBlank() }?.let { "Keputusan: $it" },
                                ).joinToString(" · ")
                                Text(meta, style = MkTypography.caption, color = c.ink2, maxLines = 2)
                            }
                            Lencana(nada, label)
                        }
                        if (i < e.data.lastIndex) MkDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun ZonaHapus(d: DetailUi, vm: ProyekViewModel) {
    val c = LocalMkColors.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.proyek_hapus), style = MkTypography.bodyStrong, color = c.ink)
            Text(stringResource(R.string.proyek_hapus_ket), style = MkTypography.footnote, color = c.ink2)
        }
        TombolBahaya(
            label = stringResource(if (d.sibuk == "delete") R.string.proyek_menghapus else R.string.proyek_hapus),
            onClick = vm::mintaHapus,
            enabled = d.sibuk == null,
        )
    }
}

@Composable
private fun KonfirmasiDetail(k: Konfirmasi, p: ProyekDto, vm: ProyekViewModel) {
    when (k) {
        Konfirmasi.HapusProyek -> DialogKonfirmasi(
            judul = "Hapus ${p.name}?",
            deskripsi = "Proyek ${p.code} akan dihapus. Proyek yang sudah punya data tidak bisa dihapus, hanya diarsipkan. " +
                "Tindakan ini tidak bisa dibatalkan.",
            labelYa = stringResource(R.string.proyek_hapus),
            merusak = true,
            onYa = vm::setujuKonfirmasi,
            onBatal = vm::batalKonfirmasi,
        )
        is Konfirmasi.ArsipkanProyek -> DialogKonfirmasi(
            judul = stringResource(R.string.proyek_arsipkan_judul),
            deskripsi = k.pesan,
            labelYa = stringResource(R.string.proyek_arsipkan),
            merusak = false,
            onYa = vm::setujuKonfirmasi,
            onBatal = vm::batalKonfirmasi,
        )
        is Konfirmasi.HapusTahap -> DialogKonfirmasi(
            judul = stringResource(R.string.proyek_tahap_hapus_judul),
            deskripsi = "${k.tahap.name} akan dihapus permanen dari tahapan proyek.",
            labelYa = stringResource(R.string.proyek_tahap_hapus),
            merusak = true,
            onYa = vm::setujuKonfirmasi,
            onBatal = vm::batalKonfirmasi,
        )
    }
}

/** "5 Okt 2026–12 Okt 2026" / "Selesai …" / "Mulai …" / null. */
internal fun rentangTahap(mulai: String?, selesai: String?): String? {
    val a = tanggalPendek(mulai)
    val b = tanggalPendek(selesai)
    return when {
        a != null && b != null -> "$a–$b"
        b != null -> "Selesai $b"
        a != null -> "Mulai $a"
        else -> null
    }
}
