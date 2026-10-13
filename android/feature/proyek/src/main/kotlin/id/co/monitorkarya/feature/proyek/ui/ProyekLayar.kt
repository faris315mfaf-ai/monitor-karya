// Layar daftar tab Proyek (padanan ProjectsView web, dikerat untuk ponsel):
// konteks + judul + satu kalimat jawaban, chip status siklus hidup, pilih
// tahap, cari, antrean "Menunggu keputusan Anda" (setujui di tempat / tolak
// lewat detail), daftar proyek dengan lencana status (warna + ikon + kata),
// "Muat lagi", snackbar Urungkan. Detail & formulir di Sheet.
package id.co.monitorkarya.feature.proyek.ui

import kotlinx.coroutines.withTimeoutOrNull
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPenandaTersimpan
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkSnackbarHost
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.proyek.R
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.domain.LABEL_FASE
import id.co.monitorkarya.feature.proyek.domain.SIKLUS_SARINGAN
import id.co.monitorkarya.feature.proyek.domain.angka
import id.co.monitorkarya.feature.proyek.domain.inisial
import id.co.monitorkarya.feature.proyek.domain.kalimatDukungan
import id.co.monitorkarya.feature.proyek.domain.kalimatJawaban
import id.co.monitorkarya.feature.proyek.domain.statusTampil
import id.co.monitorkarya.feature.proyek.domain.tanggalPendek

@Composable
fun ProyekLayar(vm: ProyekViewModel, peran: Peran, modifier: Modifier = Modifier) {
    val daftar by vm.daftar.collectAsStateWithLifecycle()
    val detail by vm.detail.collectAsStateWithLifecycle()
    val form by vm.form.collectAsStateWithLifecycle()
    val notifikasi by vm.notifikasi.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val labelUrungkan = stringResource(R.string.proyek_urungkan)

    // Snackbar satu kali; "Urungkan" hanya bila ada aksi pembalik (tiket server).
    LaunchedEffect(notifikasi?.id) {
        val n = notifikasi ?: return@LaunchedEffect
        // N-04: snackbar ber-Urungkan bertahan pasti 12 dtk (Indefinite + batas
        // waktu sendiri) — Long bawaan bisa dipersingkat sistem sehingga
        // Urungkan persetujuan proyek terlewat.
        val hasil = if (n.urungkan != null) {
            withTimeoutOrNull(BATAS_URUNGKAN_MS) {
                snackbar.showSnackbar(message = n.pesan, actionLabel = labelUrungkan, duration = SnackbarDuration.Indefinite)
            } ?: SnackbarResult.Dismissed
        } else {
            snackbar.showSnackbar(message = n.pesan, duration = SnackbarDuration.Short)
        }
        if (hasil == SnackbarResult.ActionPerformed) vm.urungkan() else vm.notifikasiTampil()
    }

    // Sheet/Dialog adalah window terpisah di atas layar: snackbar (termasuk
    // Urungkan) dirender di permukaan paling atas yang sedang tampil agar tidak
    // tertutup Sheet modal (C2 T1). Satu host sekaligus untuk satu state.
    val lapisan = lapisanSnackbar(detail, form != null)

    Box(modifier.fillMaxSize()) {
        IsiDaftar(daftar = daftar, peran = peran, vm = vm, dipilih = detail?.proyek?.id)
        if (lapisan == LapisanSnackbar.LAYAR) {
            MkSnackbarHost(modifier = Modifier.align(Alignment.BottomCenter), snackbarHostState = snackbar)
        }
    }

    detail?.let { DetailProyekSheet(d = it, vm = vm, snackbar = snackbar.takeIf { lapisan != LapisanSnackbar.LAYAR && lapisan != LapisanSnackbar.FORM }) }
    form?.let { FormProyekSheet(f = it, vm = vm, snackbar = snackbar.takeIf { lapisan == LapisanSnackbar.FORM }) }
}

/** Permukaan tempat host snackbar dipasang. */
internal enum class LapisanSnackbar { LAYAR, DETAIL, EDITOR_TAHAP, USUL_TENGGAT, FORM }

/** Permukaan paling atas yang sedang tampil (urutan sama dengan urutan komposisi Sheet). */
internal fun lapisanSnackbar(detail: DetailUi?, adaForm: Boolean): LapisanSnackbar = when {
    adaForm -> LapisanSnackbar.FORM
    detail == null -> LapisanSnackbar.LAYAR
    detail.usulTenggat != null -> LapisanSnackbar.USUL_TENGGAT
    detail.editorTahap != null -> LapisanSnackbar.EDITOR_TAHAP
    else -> LapisanSnackbar.DETAIL
}

@Composable
private fun IsiDaftar(daftar: DaftarUi, peran: Peran, vm: ProyekViewModel, dipilih: String?) {
    val c = LocalMkColors.current
    val s = daftar.saringan
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
        contentPadding = PaddingValues(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        item(key = "kepala") {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                Text(stringResource(R.string.proyek_konteks), style = MkTypography.footnote, color = c.ink2)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.proyek_judul),
                        style = MkTypography.largeTitle,
                        color = c.ink,
                        modifier = Modifier.weight(1f),
                    )
                    if (daftar.bolehAjukan) {
                        MkButton(
                            label = stringResource(R.string.proyek_ajukan),
                            onClick = vm::bukaFormBaru,
                            variant = MkButtonVariant.PRIMARY,
                            size = MkButtonSize.S,
                        )
                    }
                }
                when (daftar.muat) {
                    Muat.MEMUAT -> {
                        MkSkeleton(tinggi = 22.dp, lebar = 260.dp)
                        MkSkeleton(tinggi = 16.dp, lebar = 200.dp)
                    }
                    Muat.SIAP -> {
                        Text(kalimatJawaban(s.siklus, daftar.total, s.aktif), style = MkTypography.bodyLg, color = c.ink)
                        kalimatDukungan(daftar.ringkasan)?.let {
                            Text(it, style = MkTypography.footnote, color = c.ink2)
                        }
                    }
                    Muat.GALAT -> Unit
                }
            }
        }

        // B6: daftar dari potret Room (server tak terjangkau) selalu ditandai.
        daftar.tersimpanPada?.let { t -> item(key = "tersimpan") { MkPenandaTersimpan(tersimpanPadaMs = t) } }

        item(key = "saringan") { Saringan(daftar, vm) }

        when (daftar.muat) {
            Muat.MEMUAT -> item(key = "kerangka") {
                Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    repeat(5) { MkSkeleton(tinggi = 56.dp) }
                }
            }
            Muat.GALAT -> item(key = "galat") {
                ErrorNote(pesan = "${stringResource(R.string.proyek_galat_daftar)} ${daftar.galat.orEmpty()}", onCobaLagi = vm::muatDaftar)
            }
            Muat.SIAP -> if (daftar.items.isEmpty()) {
                item(key = "kosong") { Kosong(daftar, peran, vm) }
            } else {
                val antrean = daftar.antrean
                val lainnya = daftar.lainnya
                if (antrean.isNotEmpty()) {
                    item(key = "antrean") { KartuAntrean(antrean, daftar.setujuiCepat, vm) }
                }
                if (lainnya.isNotEmpty()) {
                    item(key = "judul-daftar") {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                stringResource(if (antrean.isNotEmpty()) R.string.proyek_lainnya_judul else R.string.proyek_daftar_judul),
                                style = MkTypography.headline,
                                color = c.ink,
                            )
                            Text(
                                "Menampilkan ${angka(daftar.items.size)} dari ${angka(daftar.total)} proyek. Ketuk baris untuk membuka detail.",
                                style = MkTypography.footnote,
                                color = c.ink2,
                            )
                        }
                    }
                    item(key = "daftar") {
                        // Satu wadah; antar baris garis 1px tanpa jarak tambahan.
                        Column(Modifier.graphicsLayer { alpha = if (daftar.menyegarkan) 0.6f else 1f }) {
                            lainnya.forEachIndexed { i, p ->
                                BarisProyek(p = p, dipilih = dipilih == p.id, onClick = { vm.bukaDetail(p) })
                                if (i < lainnya.lastIndex) MkDivider()
                            }
                        }
                    }
                }
                if (daftar.adaLagi) {
                    item(key = "muat-lagi") {
                        MkButton(
                            label = stringResource(if (daftar.memuatLagi) R.string.proyek_memuat else R.string.proyek_muat_lagi),
                            onClick = vm::muatLagi,
                            enabled = !daftar.memuatLagi,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Saringan(daftar: DaftarUi, vm: ProyekViewModel) {
    val s = daftar.saringan
    val semuaTahap = stringResource(R.string.proyek_semua_tahap)
    val opsiFase = remember(semuaTahap) {
        listOf(MkOpsi("", semuaTahap)) + LABEL_FASE.map { (v, l) -> MkOpsi(v, l) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            items(SIKLUS_SARINGAN, key = { it.first }) { (nilai, label) ->
                MkChip(label = label, selected = s.siklus == nilai, onClick = { vm.pilihSiklus(nilai) })
            }
        }
        MkPilih(
            pilihan = opsiFase,
            terpilih = opsiFase.firstOrNull { it.value == (s.fase ?: "") },
            onPilih = { vm.pilihFase(it.value.ifEmpty { null }) },
            label = stringResource(R.string.proyek_tahap_label),
            modifier = Modifier.fillMaxWidth(),
        )
        MkField(
            nilai = s.cari,
            onUbah = vm::ubahCari,
            label = stringResource(R.string.proyek_cari_label),
            placeholder = stringResource(R.string.proyek_cari_placeholder),
        )
    }
}

@Composable
private fun Kosong(daftar: DaftarUi, peran: Peran, vm: ProyekViewModel) {
    val s = daftar.saringan
    val teks = when {
        s.aktif -> stringResource(R.string.proyek_kosong_saringan)
        s.siklus == "DIUSULKAN" -> stringResource(R.string.proyek_kosong_pengajuan)
        peran == Peran.PIC_PROYEK && s.siklus == "AKTIF" -> "Belum ada proyek aktif yang Anda pegang."
        else -> stringResource(R.string.proyek_kosong_status)
    }
    when {
        s.aktif -> EmptyNote(teks = teks, ikon = Icons.Outlined.FolderOpen, teksAksi = stringResource(R.string.proyek_hapus_saringan), onAksi = vm::hapusSaringan)
        daftar.bolehAjukan && s.siklus == "AKTIF" ->
            EmptyNote(teks = teks, ikon = Icons.Outlined.FolderOpen, teksAksi = stringResource(R.string.proyek_ajukan), onAksi = vm::bukaFormBaru)
        else -> EmptyNote(teks = teks, ikon = Icons.Outlined.FolderOpen)
    }
}

/** Antrean pengajuan yang menunggu tanda tangan akun ini. */
@Composable
private fun KartuAntrean(antrean: List<ProyekDto>, sibukId: String?, vm: ProyekViewModel) {
    val c = LocalMkColors.current
    MkCard(padding = MkSpacing.space4) {
        Text(stringResource(R.string.proyek_antrean_judul), style = MkTypography.headline, color = c.ink)
        Text(stringResource(R.string.proyek_antrean_sub), style = MkTypography.footnote, color = c.ink2)
        antrean.forEachIndexed { i, p ->
            val sibuk = sibukId == p.id
            Column(Modifier.padding(top = MkSpacing.space3), verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkListRow(
                    judul = p.name,
                    sub = listOfNotNull(
                        p.proposedBy?.name ?: "Pengaju",
                        p.entity.name,
                        tanggalPendek(p.proposedAt),
                    ).joinToString(" · "),
                    inisial = inisial(p.proposedBy?.name ?: p.name),
                    trailing = {
                        MkIconBtn(icon = Icons.Outlined.Info, label = "Lihat detail ${p.name}", onClick = { vm.bukaDetail(p) })
                    },
                    onClick = { vm.bukaDetail(p) },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                    // Maks 1 tombol primer per kartu: keduanya sekunder di antrean (approveVariant web).
                    MkButton(
                        label = stringResource(R.string.proyek_tolak),
                        onClick = { vm.bukaDetail(p, "DITOLAK") },
                        enabled = sibukId == null,
                        size = MkButtonSize.S,
                        modifier = Modifier.weight(1f),
                    )
                    MkButton(
                        label = if (sibuk) stringResource(R.string.proyek_menyimpan) else stringResource(R.string.proyek_setujui),
                        onClick = { vm.setujuiCepat(p) },
                        enabled = sibukId == null,
                        size = MkButtonSize.S,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            if (i < antrean.lastIndex) MkDivider(Modifier.padding(top = MkSpacing.space3))
        }
    }
}

/** Baris proyek: nama, PT · PIC · tenggat, progres, lencana status (warna + ikon + kata). */
@Composable
private fun BarisProyek(p: ProyekDto, dipilih: Boolean, onClick: () -> Unit) {
    val st = statusTampil(p)
    val berjalan = p.lifecycle != "DIUSULKAN" && p.lifecycle != "DITOLAK"
    val sub = listOfNotNull(
        p.entity.name,
        p.picName ?: "PIC belum ditentukan",
        tanggalPendek(p.targetEndDate)?.let { "Tenggat $it" } ?: "Tanpa tenggat",
    ).joinToString(" · ")
    MkListRow(
        judul = p.name,
        sub = sub,
        // BUG-14d: proyek tanpa PIC (mis. usulan baru disetujui) tidak lagi ber-avatar "-";
        // pakai inisial nama proyek, sama dengan baris usulan (pengaju ?: nama proyek).
        inisial = inisial(p.picName?.takeIf { it.isNotBlank() } ?: p.name),
        trailing = {
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Lencana(st.nada, st.label)
                if (berjalan) {
                    Text("${st.progres}%", style = MkTypography.caption, color = LocalMkColors.current.ink2, maxLines = 1, overflow = TextOverflow.Clip)
                }
            }
        },
        onClick = onClick,
        modifier = if (dipilih) Modifier.semantics { selected = true } else Modifier,
    )
}

/** Lama snackbar ber-Urungkan (N-04). */
private const val BATAS_URUNGKAN_MS = 12_000L
