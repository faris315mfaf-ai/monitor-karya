// Layar Meja kerja PIC (agen A1, 13 Okt 2026) — padanan PicDeskView web
// (src/components/work-desk/pic-desk.tsx), versi ponsel satu kolom:
// eyebrow tanggal + lencana → kalimat jawaban + dukungan (tenggat PT / 24/7,
// task, pengingat) → tombol "Isi/Ubah laporan harian" + "Lihat proyek" → 4 KPI
// → antrean laporan hari ini (pilih proyek) → agenda task proyek terpilih
// (centang langsung) → riwayat 10 hari kerja.
//
// Kontrak MKShell: MejaKerjaScreen(vm, onBukaLaporan, onBukaTugas).
package id.co.monitorkarya.app.ui.mejakerja

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.ui.luring.BannerLuring
import id.co.monitorkarya.app.ui.luring.DaftarAntreanOtomatis
import id.co.monitorkarya.app.ui.luring.LencanaKirim
import id.co.monitorkarya.app.ui.luring.ingatWaktuMuat
import id.co.monitorkarya.app.ui.luring.rememberStatusLuring
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular

// ------------------------------------------------------------------
// Titik masuk
// ------------------------------------------------------------------

/**
 * @param onBukaLaporan tombol "Isi/Ubah laporan harian" dan "Tambah entri" (tab Laporan harian).
 * @param onBukaTugas ketuk baris agenda (detail task; entri diubah di tab Laporan harian).
 * @param onBukaProyek tombol "Lihat proyek" (tab Proyek); bawaan no-op.
 */
@Composable
fun MejaKerjaScreen(
    vm: MejaKerjaViewModel,
    onBukaLaporan: () -> Unit,
    onBukaTugas: () -> Unit,
    modifier: Modifier = Modifier,
    onBukaProyek: () -> Unit = {},
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val terpilih by vm.terpilih.collectAsStateWithLifecycle()
    val agenda by vm.agenda.collectAsStateWithLifecycle()
    val sibuk by vm.sibuk.collectAsStateWithLifecycle()
    val pesan by vm.pesan.collectAsStateWithLifecycle()
    val tersimpanPada by vm.tersimpanPada.collectAsStateWithLifecycle()
    val luring by rememberStatusLuring()
    val waktuMuat = ingatWaktuMuat((state as? MejaKerjaUiState.Sukses)?.takeIf { tersimpanPada == null })
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(pesan) {
        pesan?.let {
            snackbar.showSnackbar(it)
            vm.pesanTampil()
        }
    }
    Box(modifier = modifier.fillMaxSize()) {
        when (val s = state) {
            MejaKerjaUiState.Memuat -> KerangkaMejaKerja()
            is MejaKerjaUiState.Galat -> Box(Modifier.fillMaxSize().padding(MkSpacing.space3)) {
                ErrorNote(pesan = s.pesan, onCobaLagi = vm::ulang)
            }
            is MejaKerjaUiState.Sukses -> IsiMejaKerja(
                data = s.data,
                banner = if (luring.luring || tersimpanPada != null) {
                    {
                        // B2: "Luring · data tersimpan HH.MM" (+ jumlah menunggu kirim).
                        BannerLuring(
                            modifier = Modifier.fillMaxWidth(),
                            tersimpanPadaMs = tersimpanPada ?: waktuMuat ?: luring.terakhirSinkronMs,
                            menungguKirim = luring.menungguKirim,
                            onCobaLagi = vm::ulang,
                        )
                    }
                } else {
                    null
                },
                terpilih = terpilih,
                agenda = agenda,
                sibuk = sibuk,
                onPilih = vm::pilih,
                onCentang = vm::centang,
                onUlangAgenda = vm::ulangAgenda,
                onBukaLaporan = onBukaLaporan,
                onBukaTugas = onBukaTugas,
                onBukaProyek = onBukaProyek,
            )
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(MkSpacing.space3))
    }
}

@Composable
private fun KerangkaMejaKerja() {
    Column(
        Modifier
            .fillMaxSize()
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        MkSkeleton(tinggi = 14.dp, lebar = 200.dp)
        MkSkeleton(tinggi = 24.dp)
        MkSkeleton(tinggi = 16.dp, lebar = 260.dp)
        MkSkeleton(tinggi = 168.dp)
        repeat(3) { MkSkeleton(tinggi = 56.dp) }
    }
}

// ------------------------------------------------------------------
// Isi
// ------------------------------------------------------------------

@Composable
private fun IsiMejaKerja(
    data: MejaKerjaData,
    banner: (@Composable () -> Unit)?,
    terpilih: String?,
    agenda: AgendaUi,
    sibuk: String?,
    onPilih: (String) -> Unit,
    onCentang: (String) -> Unit,
    onUlangAgenda: () -> Unit,
    onBukaLaporan: () -> Unit,
    onBukaTugas: () -> Unit,
    onBukaProyek: () -> Unit,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        banner?.invoke()
        if (data.proyekKosong) {
            MkCard(Modifier.fillMaxWidth()) {
                EmptyNote(teks = "Belum ada proyek aktif yang Anda pegang. Hubungi Admin PT bila ini keliru.")
            }
            return@Column
        }

        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Text(data.eyebrow, style = MkTypography.footnote, color = warna.ink2)
            StatusBadge(
                status = when {
                    data.belumTerkirim == 0 -> MkStatus.DONE
                    data.terkunci -> MkStatus.LATE
                    else -> MkStatus.RISK
                },
                text = if (data.belumTerkirim == 0) "Laporan hari ini · Terkirim" else "Laporan hari ini · Belum dikirim",
            )
            Text(data.jawaban, style = MkTypography.title3, color = warna.ink, modifier = Modifier.semantics { heading() })
            Text(data.dukungan, style = MkTypography.body, color = warna.ink2)
        }

        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalAlignment = Alignment.CenterVertically) {
            MkButton(
                label = if (data.belumTerkirim > 0) "Isi laporan harian" else "Ubah laporan harian",
                onClick = onBukaLaporan,
                variant = MkButtonVariant.PRIMARY,
                enabled = !(data.terkunci && data.belumTerkirim > 0),
                modifier = Modifier.weight(1f),
            )
            MkButton(label = "Lihat proyek", onClick = onBukaProyek, variant = MkButtonVariant.PLAIN)
        }

        // Maks 4 KPI (aturan desain), 2 x 2 di ponsel.
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = "Laporan terkirim",
                    value = "${data.laporanTerkirim} dari ${data.laporanTotal}",
                    delta = if (data.belumTerkirim > 0) "${data.belumTerkirim} menunggu Anda" else "Semua beres hari ini",
                    tone = if (data.belumTerkirim > 0) MkStatus.RISK else MkStatus.ON,
                )
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = "Task selesai",
                    value = "${data.tugasSelesai} dari ${data.tugasTotal}",
                    delta = if (data.tugasTotal > 0) "${data.tugasSelesai * 100 / data.tugasTotal}% hari ini" else "Tambahkan task hari ini",
                    tone = if (data.tugasTotal > 0 && data.tugasSelesai == data.tugasTotal) MkStatus.ON else MkStatus.NEUTRAL,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = "Tepat waktu 10 hari",
                    value = "${data.tepatWaktuPct}%",
                    delta = if (data.tepatWaktuPct >= 85) "Di atas target 85%" else "Target 85%",
                    tone = if (data.tepatWaktuPct >= 85) MkStatus.ON else MkStatus.RISK,
                )
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = "Task terkendala",
                    value = data.tugasTerkendala,
                    delta = if (data.tugasTerkendala > 0) "Tulis kendalanya di laporan" else "Tidak ada kendala",
                    tone = if (data.tugasTerkendala > 0) MkStatus.RISK else MkStatus.ON,
                )
            }
        }

        Antrean(data = data, terpilih = terpilih, onPilih = onPilih)

        data.proyek.firstOrNull { it.id == terpilih }?.let { p ->
            KartuAgenda(
                proyek = p,
                agenda = agenda,
                sibuk = sibuk,
                onCentang = onCentang,
                onUlang = onUlangAgenda,
                onTambah = onBukaLaporan,
                onBuka = onBukaTugas,
            )
            // B2: tulisan laporan proyek ini yang masih di antrean.
            DaftarAntreanOtomatis(kunciAwalan = KunciOutbox.laporanHarian(p.id, ""))
        }

        Riwayat(data = data)
        Spacer(Modifier.height(MkSpacing.space8))
    }
}

/** "Antrean laporan hari ini" — pilih proyek untuk melihat agendanya. */
@Composable
private fun Antrean(data: MejaKerjaData, terpilih: String?, onPilih: (String) -> Unit) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    MkCard(Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
        Text("Antrean laporan hari ini", style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        Text(data.subAntrean, style = MkTypography.footnote, color = warna.ink2)
        Spacer(Modifier.height(MkSpacing.space2))
        data.proyek.forEachIndexed { i, p ->
            val dipilih = p.id == terpilih
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MkShapes.md)
                    .background(if (dipilih) aksen.soft else warna.surface)
                    .clickable(role = Role.Tab) { onPilih(p.id) }
                    .semantics { selected = dipilih }
                    .padding(MkSpacing.space3),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                    Column(Modifier.weight(1f)) {
                        Text(p.nama, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(p.meta, style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    StatusBadge(status = p.status, size = MkBadgeSize.SM, text = p.statusLabel)
                }
                BatangTugas(
                    nilai = if (p.tugasTotal > 0) p.tugasSelesai * 100 / p.tugasTotal else 0,
                    risiko = p.tugasTerkendala > 0,
                    teks = if (p.tugasTotal > 0) "${p.tugasSelesai} dari ${p.tugasTotal} task" else "Belum ada task",
                )
                p.pengingat?.let {
                    Text(
                        it,
                        style = MkTypography.footnote,
                        color = warna.ink,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(warna.statusRiskSoft, MkShapes.sm)
                            .padding(horizontal = MkSpacing.space2, vertical = MkSpacing.space1),
                    )
                }
            }
            if (i < data.proyek.lastIndex) MkDivider()
        }
    }
}

/** "Agenda hari ini" proyek terpilih — centang task langsung. */
@Composable
private fun KartuAgenda(
    proyek: ProyekMeja,
    agenda: AgendaUi,
    sibuk: String?,
    onCentang: (String) -> Unit,
    onUlang: () -> Unit,
    onTambah: () -> Unit,
    onBuka: () -> Unit,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    MkCard(Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
        val siap = agenda as? AgendaUi.Siap
        val selesai = siap?.tugas?.count { it.selesai } ?: 0
        val total = siap?.tugas?.size ?: 0
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Agenda hari ini", style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
                Text(
                    if (total > 0) "$selesai dari $total task selesai · ${proyek.nama}" else proyek.nama,
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            MkButton(label = "Tambah entri", onClick = onTambah, size = MkButtonSize.S, enabled = siap?.terkunci != true)
        }
        Spacer(Modifier.height(MkSpacing.space3))
        when (agenda) {
            AgendaUi.Memuat -> Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                repeat(3) { MkSkeleton(tinggi = 44.dp) }
            }
            is AgendaUi.Galat -> ErrorNote(pesan = agenda.pesan, onCobaLagi = onUlang)
            is AgendaUi.Siap -> if (agenda.tugas.isEmpty()) {
                EmptyNote(teks = "Belum ada task untuk hari ini.")
            } else {
                BatangTugas(nilai = selesai * 100 / total, risiko = false, teks = "$selesai dari $total")
                Spacer(Modifier.height(MkSpacing.space2))
                agenda.tugas.forEachIndexed { i, t ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(MkShapes.md)
                            .clickable(role = Role.Button, onClick = onBuka)
                            .heightIn(min = 48.dp)
                            .padding(vertical = MkSpacing.space1),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                    ) {
                        Checkbox(
                            checked = t.selesai,
                            onCheckedChange = { onCentang(t.id) },
                            enabled = !agenda.terkunci && sibuk == null && !t.lokal,
                            colors = CheckboxDefaults.colors(checkedColor = aksen.fill, checkmarkColor = aksen.on),
                            modifier = Modifier.semantics {
                                contentDescription = if (t.selesai) "Tandai ${t.judul} belum selesai" else "Tandai ${t.judul} selesai"
                            },
                        )
                        Column(Modifier.weight(1f)) {
                            Text(
                                t.judul,
                                style = MkTypography.body,
                                color = if (t.selesai) warna.ink2 else warna.ink,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            val sub = listOfNotNull(t.jam?.let { "$it WIB" }, t.meta).joinToString(" · ")
                            if (sub.isNotEmpty()) Text(sub, style = MkTypography.footnote, color = warna.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        if (t.terkendala && !t.selesai) StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = t.statusLabel)
                        t.statusKirim?.let { LencanaKirim(it) }
                    }
                    if (t.statusKirim == StatusKirim.GAGAL) {
                        Text(
                            t.galatKirim ?: "Server menolak perubahan ini.",
                            style = MkTypography.footnote,
                            color = warna.statusLate,
                            modifier = Modifier.padding(start = 48.dp, bottom = MkSpacing.space1),
                        )
                    }
                    if (i < agenda.tugas.lastIndex) MkDivider()
                }
                if (agenda.terkunci) {
                    Spacer(Modifier.height(MkSpacing.space2))
                    Text("Laporan hari ini sudah terkunci; centang tidak bisa diubah.", style = MkTypography.footnote, color = warna.ink2)
                }
            }
        }
    }
}

/** "Riwayat 10 hari kerja" — strip per proyek + legenda (warna + kata). */
@Composable
private fun Riwayat(data: MejaKerjaData) {
    val warna = LocalMkColors.current
    MkCard(Modifier.fillMaxWidth(), padding = MkSpacing.space3) {
        Text("Riwayat 10 hari kerja", style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        Text(
            "${data.tepatWaktuJumlah} dari ${data.riwayatTotal} laporan sebelumnya tepat waktu",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        Spacer(Modifier.height(MkSpacing.space3))
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            data.proyek.forEach { p ->
                Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                    Row {
                        Text(p.nama, style = MkTypography.bodyStrong, color = warna.ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${p.tepatWaktu} tepat waktu", style = MkTypography.footnote.tabular, color = warna.ink2)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        p.riwayat.forEach { h -> SelHari(h, Modifier.weight(1f)) }
                    }
                }
            }
        }
        Spacer(Modifier.height(MkSpacing.space3))
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            listOf(KeadaanHari.TEPAT, KeadaanHari.TERLAMBAT, KeadaanHari.TIDAK_DIKIRIM, KeadaanHari.MENUNGGU).forEach { k ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                    SelHari(HariRiwayat("", k, null), Modifier.size(12.dp), legenda = true)
                    Text(if (k == KeadaanHari.MENUNGGU) "Hari ini" else k.label, style = MkTypography.caption, color = warna.ink2)
                }
            }
        }
    }
}

@Composable
private fun SelHari(h: HariRiwayat, modifier: Modifier = Modifier, legenda: Boolean = false) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val isi = when (h.keadaan) {
        KeadaanHari.TEPAT -> warna.statusOn
        KeadaanHari.TERLAMBAT -> warna.statusRisk
        KeadaanHari.TIDAK_DIKIRIM -> warna.statusLate
        KeadaanHari.HARI_INI -> aksen.fill
        KeadaanHari.MENUNGGU -> warna.fill2
    }
    Box(
        modifier = modifier
            .then(if (legenda) Modifier else Modifier.height(20.dp))
            .clip(MkShapes.xs)
            .background(isi)
            .then(if (h.keadaan == KeadaanHari.MENUNGGU) Modifier.border(1.dp, aksen.fill, MkShapes.xs) else Modifier)
            .then(
                if (legenda) {
                    Modifier
                } else {
                    Modifier.semantics {
                        contentDescription = "${h.tanggal}: ${h.keterangan ?: h.keadaan.label}"
                    }
                },
            ),
    )
}

/** Batang progres tipis + teks tabular. */
@Composable
private fun BatangTugas(nilai: Int, risiko: Boolean, teks: String) {
    val warna = LocalMkColors.current
    val isi = if (risiko) warna.statusRisk else LocalAccent.current.fill
    val persen = nilai.coerceIn(0, 100)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
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
        Text(teks, style = MkTypography.caption.tabular, color = warna.ink2)
    }
}
