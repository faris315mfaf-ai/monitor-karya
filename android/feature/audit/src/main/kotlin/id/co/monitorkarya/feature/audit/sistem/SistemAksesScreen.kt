// Layar Sistem & akses ponsel (07-ti.md: "di ponsel cukup terbaca, tanpa aksi
// massal"). Satu-satunya aksi tulis = putuskan permintaan akses satu per satu.
package id.co.monitorkarya.feature.audit.sistem

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkSnackbarHost
import id.co.monitorkarya.designsystem.components.MkStatVariant
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.audit.R
import id.co.monitorkarya.feature.audit.data.KelompokPeranDto
import id.co.monitorkarya.feature.audit.data.KunciPtDto
import id.co.monitorkarya.feature.audit.data.PengajuanAksesDto
import id.co.monitorkarya.feature.audit.data.PengingatPtDto
import id.co.monitorkarya.feature.audit.data.SistemDto
import id.co.monitorkarya.feature.audit.model.angka
import id.co.monitorkarya.feature.audit.model.hariJamWib
import id.co.monitorkarya.feature.audit.model.inisial
import id.co.monitorkarya.feature.audit.model.jadwalPengingat
import id.co.monitorkarya.feature.audit.model.judulPengingat
import id.co.monitorkarya.feature.audit.model.labelAksi
import id.co.monitorkarya.feature.audit.model.labelHariKerja
import id.co.monitorkarya.feature.audit.model.labelPeran
import id.co.monitorkarya.feature.audit.model.nadaAksi
import id.co.monitorkarya.feature.audit.model.relatif
import id.co.monitorkarya.feature.audit.model.tanggalWib
import id.co.monitorkarya.feature.audit.model.waktuWib
import id.co.monitorkarya.feature.audit.ui.BarisKv
import id.co.monitorkarya.feature.audit.ui.JudulSeksi
import id.co.monitorkarya.feature.audit.ui.KartuBagian
import id.co.monitorkarya.feature.audit.ui.KepalaHalaman
import kotlinx.coroutines.withTimeoutOrNull

@Composable
internal fun SistemAksesScreen(vm: SistemAksesViewModel, modifier: Modifier = Modifier) {
    val sistem by vm.sistem.collectAsStateWithLifecycle()
    val kesiapan by vm.kesiapan.collectAsStateWithLifecycle()
    val akses by vm.akses.collectAsStateWithLifecycle()
    val lokal by vm.lokal.collectAsStateWithLifecycle()
    val sibuk by vm.sibuk.collectAsStateWithLifecycle()
    val pesan by vm.pesan.collectAsStateWithLifecycle()
    val pengajuanTerbuka by vm.pengajuanTerbuka.collectAsStateWithLifecycle()
    val ptTerbuka by vm.ptTerbuka.collectAsStateWithLifecycle()
    val peranTerbuka by vm.peranTerbuka.collectAsStateWithLifecycle()
    val direktori by vm.direktori.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val labelUrungkan = stringResource(R.string.sistem_urungkan)

    // Kunci = id pesan. Pesan baru dibersihkan SETELAH snackbar selesai; bila
    // dibersihkan lebih dulu, kunci berubah dan efek (berikut snackbar-nya)
    // langsung dibatalkan sehingga umpan balik tidak pernah terlihat (C1-T3).
    LaunchedEffect(pesan?.id) {
        val p = pesan ?: return@LaunchedEffect
        try {
            if (p.urungkanId != null) {
                // Aksi Urungkan hanya bermakna selama putusan masih ditahan (5 detik).
                val hasil = withTimeoutOrNull(SistemAksesViewModel.TAHAN_MS) {
                    snackbar.showSnackbar(p.teks, actionLabel = labelUrungkan, duration = SnackbarDuration.Indefinite)
                }
                if (hasil == SnackbarResult.ActionPerformed) vm.urungkan(p.urungkanId)
            } else {
                snackbar.showSnackbar(p.teks, duration = SnackbarDuration.Long)
            }
        } finally {
            vm.pesanTampil(p.id)
        }
    }

    // Meninggalkan layar (bukan sekadar rotasi) = kirim putusan tertahan saat
    // sesi masih hidup, agar tidak tertunda sampai ViewModel dibersihkan —
    // misalnya setelah keluar akun, saat cookie sesi sudah hilang (C1-R3).
    val aktivitas = LocalContext.current.cariActivity()
    DisposableEffect(vm) {
        onDispose {
            if (aktivitas?.isChangingConfigurations != true) vm.kirimTertahanSekarang()
        }
    }

    Box(modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            item(key = "kepala") {
                KepalaHalaman(
                    judul = stringResource(R.string.sistem_judul),
                    konteks = stringResource(R.string.sistem_konteks),
                )
            }
            when (val s = sistem) {
                Muatan.Memuat -> item(key = "memuat") {
                    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                        MkSkeleton(tinggi = 120.dp)
                        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                            MkSkeleton(tinggi = 72.dp, modifier = Modifier.weight(1f))
                            MkSkeleton(tinggi = 72.dp, modifier = Modifier.weight(1f))
                        }
                        MkSkeleton(tinggi = 160.dp)
                    }
                }
                is Muatan.Galat -> item(key = "galat") {
                    MkCard(Modifier.fillMaxWidth()) { ErrorNote(pesan = s.pesan, onCobaLagi = vm::muatSemua) }
                }
                is Muatan.Siap -> {
                    val d = s.data
                    item(key = "kesehatan") { KartuKesehatan(d, kesiapan) }
                    item(key = "akses") {
                        KartuAkses(
                            akses = akses,
                            lokal = lokal,
                            sibuk = sibuk,
                            onPutuskan = vm::putuskan,
                            onUrungkan = vm::urungkan,
                            onBuka = vm::bukaPengajuan,
                            onUlang = vm::muatAkses,
                        )
                    }
                    item(key = "cron") { KartuProses(d) }
                    item(key = "kunci") { KartuPenguncian(d, onBukaPt = vm::bukaPt) }
                    item(key = "pengingat") { KartuPengingat(d.reminders) }
                    item(key = "akun-sehat") { KartuKesehatanAkun(d) }
                    item(key = "peran") { KartuPeran(d, onBukaPeran = vm::bukaPeran) }
                    item(key = "volume") { KartuVolume(d) }
                    item(key = "aktivitas") { KartuAktivitas(d) }
                    item(key = "akun") { KartuAkun(d) }
                }
            }
        }
        MkSnackbarHost(
            snackbarHostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(MkSpacing.space4),
        )
    }

    SheetPengajuan(
        item = pengajuanTerbuka,
        terkunci = lokal.isNotEmpty() || sibuk != null,
        onTutup = vm::tutupPengajuan,
        onPutuskan = vm::putuskan,
    )
    val siap = sistem as? Muatan.Siap
    SheetPt(
        pt = ptTerbuka,
        pengingat = siap?.data?.reminders?.firstOrNull { it.entityId == ptTerbuka?.entityId },
        onTutup = vm::tutupPt,
    )
    SheetPeran(
        role = peranTerbuka,
        direktori = direktori,
        onTutup = vm::tutupPeran,
        onUlang = vm::muatDirektori,
    )
}

// ------------------------------------------------------------------
// Kartu
// ------------------------------------------------------------------

@Composable
private fun KartuKesehatan(d: SistemDto, kesiapan: KesiapanServer) {
    val warna = LocalMkColors.current
    val r = remember(d) { SistemAksesViewModel.ringkas(d) }
    val t = d.technical
    val aktif = d.access.byRole.sumOf { it.count }
    val menunggu = SistemAksesViewModel.bukaKunciMenunggu(d)
    val terlambat = t?.cron?.count { it.health == "late" } ?: 0
    val jalan = t?.cron?.count { it.health == "on" } ?: 0
    val gagal = t?.notifications?.failed7d ?: d.notifications.failed
    MkCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.sistem_kesehatan),
                style = MkTypography.footnote,
                color = warna.ink2,
                modifier = Modifier.weight(1f),
            )
            if (r.sehat) {
                StatusBadge(status = MkStatus.ON, text = stringResource(R.string.sistem_sehat))
            } else {
                StatusBadge(status = MkStatus.RISK, text = stringResource(R.string.sistem_perlu_perhatian))
            }
        }
        Text(
            r.kalimat,
            style = MkTypography.title3,
            color = warna.ink,
            modifier = Modifier.padding(top = MkSpacing.space2),
        )
        Text(
            r.dukungan,
            style = MkTypography.footnote,
            color = warna.ink2,
            modifier = Modifier.padding(top = MkSpacing.space1),
        )
        Column(
            Modifier.padding(top = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                StatTile(
                    label = stringResource(R.string.sistem_akun_aktif),
                    value = angka(aktif),
                    delta = "${angka(d.access.inactiveUsers)} nonaktif",
                    modifier = Modifier.weight(1f),
                )
                StatTile(
                    label = stringResource(R.string.sistem_buka_kunci_menunggu),
                    value = angka(menunggu),
                    delta = t?.let { "${angka(it.unlocks.activeNow)} laporan sedang terbuka" }
                        ?: "Diajukan atau disetujui",
                    tone = when {
                        (t?.unlocks?.waitingExecution ?: 0) > 0 -> MkStatus.RISK
                        menunggu > 0 -> MkStatus.INFO
                        else -> MkStatus.ON
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                StatTile(
                    label = stringResource(R.string.sistem_proses_otomatis),
                    value = if (t != null) "$jalan dari ${t.cron.size}" else "—",
                    delta = if (terlambat > 0) "$terlambat terlambat" else "Sesuai jadwal",
                    tone = if (terlambat > 0) MkStatus.LATE else MkStatus.ON,
                    modifier = Modifier.weight(1f),
                )
                StatTile(
                    label = stringResource(R.string.sistem_notif_gagal),
                    value = angka(gagal),
                    delta = if (t != null) "7 hari terakhir" else "dari ${angka(d.notifications.sent)} terkirim",
                    tone = if (gagal > 0) MkStatus.LATE else MkStatus.ON,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Box(Modifier.padding(top = MkSpacing.space3)) {
            BarisKv(stringResource(R.string.sistem_server)) {
                when (kesiapan) {
                    KesiapanServer.SIAP ->
                        StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_server_siap))
                    KesiapanServer.TERDEGRADASI ->
                        StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_server_terdegradasi))
                    KesiapanServer.MATI ->
                        StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_server_mati))
                    KesiapanServer.TAK_TERBACA ->
                        StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_server_tak_terbaca))
                }
            }
        }
    }
}

@Composable
private fun KartuAkses(
    akses: Muatan<AntreanAkses>,
    lokal: Map<String, Putusan>,
    sibuk: String?,
    onPutuskan: (PengajuanAksesDto, Putusan) -> Unit,
    onUrungkan: (String) -> Unit,
    onBuka: (PengajuanAksesDto) -> Unit,
    onUlang: () -> Unit,
) {
    val siap = akses as? Muatan.Siap
    val menunggu = siap?.data?.items?.count { it.status == "DIAJUKAN" && it.id !in lokal } ?: 0
    KartuBagian(
        judul = stringResource(R.string.sistem_pengajuan_akses),
        sub = if (menunggu > 0) {
            stringResource(R.string.sistem_pengajuan_sub_menunggu, menunggu)
        } else {
            stringResource(R.string.sistem_pengajuan_sub)
        },
    ) {
        when (akses) {
            Muatan.Memuat -> {
                MkSkeleton(tinggi = 52.dp)
                MkSkeleton(tinggi = 52.dp)
            }
            is Muatan.Galat -> ErrorNote(pesan = akses.pesan, onCobaLagi = onUlang)
            is Muatan.Siap -> {
                // E2E-3 B2: urutan baris tetap (disusun VM), baris diikat ke id
                // permintaan, dan selama satu putusan ditahan/dikirim tombol
                // baris lain nonaktif — Urungkan tidak bisa "jatuh" ke Setujui
                // milik baris berikutnya.
                val tampil = akses.data.tampil
                val adaAksi = lokal.isNotEmpty() || sibuk != null
                if (tampil.isEmpty()) {
                    EmptyNote(teks = stringResource(R.string.sistem_pengajuan_kosong), done = true)
                } else {
                    tampil.forEachIndexed { i, item ->
                        key(item.id) {
                            if (i > 0) MkDivider()
                            BarisPengajuan(
                                item = item,
                                putusanLokal = lokal[item.id],
                                sibuk = sibuk == item.id,
                                terkunci = adaAksi,
                                onPutuskan = onPutuskan,
                                onUrungkan = onUrungkan,
                                onBuka = onBuka,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BarisPengajuan(
    item: PengajuanAksesDto,
    putusanLokal: Putusan?,
    sibuk: Boolean,
    terkunci: Boolean,
    onPutuskan: (PengajuanAksesDto, Putusan) -> Unit,
    onUrungkan: (String) -> Unit,
    onBuka: (PengajuanAksesDto) -> Unit,
) {
    val warna = LocalMkColors.current
    val meta = listOfNotNull(
        item.requester?.name,
        item.detail.ifBlank { null },
        item.reason?.ifBlank { null },
        relatif(item.createdAt),
    ).joinToString(" · ")
    Column(
        Modifier
            .fillMaxWidth()
            .clickable { onBuka(item) }
            .padding(vertical = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(item.title, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(meta, style = MkTypography.footnote, color = warna.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        val bisa = item.status == "DIAJUKAN" && item.canDecide
        when {
            putusanLokal != null -> Row(verticalAlignment = Alignment.CenterVertically) {
                if (putusanLokal == Putusan.SETUJUI) {
                    StatusBadge(status = MkStatus.DONE, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_status_disetujui))
                } else {
                    StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_status_ditolak))
                }
                Box(Modifier.weight(1f))
                if (!sibuk) {
                    MkButton(
                        label = stringResource(R.string.sistem_urungkan),
                        onClick = { onUrungkan(item.id) },
                        variant = MkButtonVariant.PLAIN,
                        modifier = Modifier.minimumInteractiveComponentSize(),
                    )
                }
            }
            // Target sentuh ≥48dp dan jarak 12dp antara Tolak/Setujui (selaras C1-S4).
            bisa -> Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                MkButton(
                    label = stringResource(R.string.sistem_tolak),
                    onClick = { onPutuskan(item, Putusan.TOLAK) },
                    enabled = !sibuk && !terkunci,
                    modifier = Modifier.weight(1f).minimumInteractiveComponentSize(),
                )
                MkButton(
                    label = stringResource(R.string.sistem_setujui),
                    onClick = { onPutuskan(item, Putusan.SETUJUI) },
                    enabled = !sibuk && !terkunci,
                    modifier = Modifier.weight(1f).minimumInteractiveComponentSize(),
                )
            }
            else -> LabelStatusPengajuan(item)
        }
    }
}

/** StatusLabel access-requests-card.tsx. */
@Composable
private fun LabelStatusPengajuan(item: PengajuanAksesDto) {
    when {
        item.status == "DIAJUKAN" ->
            StatusBadge(status = MkStatus.INFO, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_status_menunggu))
        item.status == "DITOLAK" ->
            StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_status_ditolak))
        item.type == "AKSES_SEMENTARA" && item.expiresAt != null ->
            if (item.revertedAt != null) {
                StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_status_berakhir))
            } else {
                StatusBadge(
                    status = MkStatus.ON,
                    size = MkBadgeSize.SM,
                    text = stringResource(R.string.sistem_status_aktif_sd, tanggalWib(item.expiresAt)),
                )
            }
        else -> StatusBadge(status = MkStatus.DONE, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_status_disetujui))
    }
}

@Composable
private fun KartuProses(d: SistemDto) {
    val t = d.technical
    KartuBagian(judul = stringResource(R.string.sistem_proses_otomatis), sub = stringResource(R.string.sistem_proses_sub)) {
        if (t == null) {
            EmptyNote(teks = stringResource(R.string.sistem_proses_kosong))
            return@KartuBagian
        }
        val warna = LocalMkColors.current
        t.cron.forEachIndexed { i, c ->
            if (i > 0) MkDivider()
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = MkSpacing.space2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(c.label, style = MkTypography.bodyStrong, color = warna.ink)
                    Text(
                        if (c.lastAt != null) {
                            stringResource(R.string.sistem_cron_terakhir, c.schedule, relatif(c.lastAt))
                        } else {
                            stringResource(R.string.sistem_cron_belum_pernah, c.schedule)
                        },
                        style = MkTypography.footnote,
                        color = warna.ink2,
                    )
                }
                when (c.health) {
                    "on" -> StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_cron_berjalan))
                    "late" -> StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_cron_terlambat))
                    else -> StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_cron_belum))
                }
            }
        }
        Text(
            stringResource(R.string.sistem_proses_catatan),
            style = MkTypography.footnote,
            color = warna.ink2,
            modifier = Modifier.padding(top = MkSpacing.space2),
        )
    }
}

@Composable
private fun KartuPenguncian(d: SistemDto, onBukaPt: (KunciPtDto) -> Unit) {
    val k = d.locking
    val t = d.technical
    KartuBagian(judul = stringResource(R.string.sistem_penguncian), sub = stringResource(R.string.sistem_penguncian_sub)) {
        BarisKv(
            stringResource(R.string.sistem_kunci_harian),
            "${k.dailyCutoff} · " + if (k.dailyLocked) {
                "sudah terkunci"
            } else {
                "${k.dailyCountdown.hours} j ${k.dailyCountdown.minutes} m lagi"
            },
        )
        BarisKv(stringResource(R.string.sistem_serah_mingguan), hariJamWib(k.weeklyHandoverBy))
        BarisKv(stringResource(R.string.sistem_kunci_mingguan), hariJamWib(k.weeklyLockAt))
        BarisKv(stringResource(R.string.sistem_laporan_dibuka)) {
            val aktif = t?.unlocks?.activeNow ?: 0
            if (aktif > 0) {
                StatusBadge(status = MkStatus.INFO, size = MkBadgeSize.SM, text = "${angka(aktif)} terbuka")
            } else {
                StatusBadge(status = MkStatus.DONE, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_tidak_ada))
            }
        }
        JudulSeksi(stringResource(R.string.sistem_per_pt))
        if (k.perEntity.isEmpty()) {
            Text(
                stringResource(R.string.sistem_per_pt_kosong),
                style = MkTypography.footnote,
                color = LocalMkColors.current.ink2,
            )
        } else {
            k.perEntity.forEachIndexed { i, pt ->
                if (i > 0) MkDivider()
                MkListRow(
                    judul = pt.name.ifBlank { pt.code },
                    sub = "${pt.dailyCutoff} · ${labelHariKerja(pt.workingDays)}",
                    inisial = pt.code.take(3).ifBlank { inisial(pt.name) },
                    trailing = { LencanaKunciPt(pt) },
                    onClick = { onBukaPt(pt) },
                )
            }
        }
    }
}

@Composable
private fun LencanaKunciPt(pt: KunciPtDto) {
    when {
        !pt.dailyOpen -> StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_ditutup))
        pt.dailyLocked -> StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_terkunci))
        else -> StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_terbuka))
    }
}

@Composable
private fun KartuPengingat(rows: List<PengingatPtDto>?) {
    KartuBagian(judul = stringResource(R.string.sistem_pengingat), sub = stringResource(R.string.sistem_pengingat_sub)) {
        if (rows == null) {
            EmptyNote(teks = stringResource(R.string.sistem_pengingat_belum))
            return@KartuBagian
        }
        val warna = LocalMkColors.current
        val totalAktif = rows.sumOf { r -> r.rules.count { it.enabled } }
        val total = rows.sumOf { it.rules.size }
        Text(
            "${angka(totalAktif)} dari ${angka(total)} sakelar aktif di ${angka(rows.size)} perusahaan.",
            style = MkTypography.body,
            color = warna.ink,
        )
        rows.forEachIndexed { i, r ->
            if (i > 0) MkDivider()
            val aktif = r.rules.count { it.enabled }
            BarisKv(r.entityName.ifBlank { r.entityCode }) {
                val status = when {
                    aktif == 0 -> MkStatus.NEUTRAL
                    aktif == r.rules.size -> MkStatus.ON
                    else -> MkStatus.INFO
                }
                StatusBadge(status = status, size = MkBadgeSize.SM, text = "$aktif dari ${r.rules.size} aktif")
            }
        }
    }
}

@Composable
private fun KartuKesehatanAkun(d: SistemDto) {
    val t = d.technical
    KartuBagian(judul = stringResource(R.string.sistem_kesehatan_akun)) {
        BarisKv(stringResource(R.string.sistem_akun_aktif), angka(d.access.byRole.sumOf { it.count }))
        BarisKv(stringResource(R.string.sistem_nonaktif), angka(d.access.inactiveUsers))
        BarisKv(stringResource(R.string.sistem_belum_masuk), t?.let { angka(it.accounts.neverLoggedIn) } ?: "—")
        BarisKv(
            stringResource(R.string.sistem_wajib_ganti),
            t?.accounts?.mustChange?.let { angka(it) } ?: stringResource(R.string.sistem_belum_tersedia),
        )
        BarisKv(stringResource(R.string.sistem_tanpa_sandi)) {
            if (d.access.noPassword > 0) {
                StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = "${angka(d.access.noPassword)} akun")
            } else {
                StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_tidak_ada))
            }
        }
    }
}

@Composable
private fun KartuPeran(d: SistemDto, onBukaPeran: (String) -> Unit) {
    KartuBagian(judul = stringResource(R.string.sistem_hak_akses), sub = stringResource(R.string.sistem_hak_akses_sub)) {
        if (d.access.byRole.isEmpty()) {
            EmptyNote(teks = stringResource(R.string.sistem_hak_kosong))
            return@KartuBagian
        }
        val warna = LocalMkColors.current
        d.access.byRole.forEachIndexed { i, r ->
            if (i > 0) MkDivider()
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .clickable { onBukaPeran(r.role) }
                    .padding(vertical = MkSpacing.space2),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(labelPeran(r.role).orEmpty(), style = MkTypography.body, color = warna.ink)
                    Text(
                        stringResource(R.string.sistem_kewenangan, r.capabilities),
                        style = MkTypography.footnote.tabular,
                        color = warna.ink2,
                    )
                }
                Text(angka(r.count), style = MkTypography.bodyStrong.tabular, color = warna.ink)
            }
        }
    }
}

@Composable
private fun KartuVolume(d: SistemDto) {
    val v = d.data
    val sel = listOf(
        "Entitas" to v.entities,
        "Divisi" to v.divisions,
        "Proyek" to v.projects,
        "Laporan harian" to v.dailyReports,
        "Laporan mingguan" to v.weeklyReports,
        "Bukti" to v.evidence,
        "Jejak audit" to v.auditLogs,
    )
    KartuBagian(judul = stringResource(R.string.sistem_volume)) {
        sel.chunked(2).forEach { pasangan ->
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3), modifier = Modifier.padding(bottom = MkSpacing.space2)) {
                pasangan.forEach { (label, nilai) ->
                    StatTile(label = label, value = angka(nilai), variant = MkStatVariant.INSET, modifier = Modifier.weight(1f))
                }
                if (pasangan.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KartuAktivitas(d: SistemDto) {
    KartuBagian(judul = stringResource(R.string.sistem_aktivitas_terakhir), sub = "10 entri log terbaru") {
        if (d.recentAudit.isEmpty()) {
            EmptyNote(teks = stringResource(R.string.sistem_aktivitas_kosong))
            return@KartuBagian
        }
        val warna = LocalMkColors.current
        d.recentAudit.forEachIndexed { i, a ->
            if (i > 0) MkDivider()
            Column(Modifier.padding(vertical = MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                StatusBadge(status = nadaAksi(a.action), size = MkBadgeSize.SM, text = labelAksi(a.action))
                Text(a.actorName, style = MkTypography.bodyStrong, color = warna.ink)
                Text(
                    listOfNotNull(labelPeran(a.actorRole), waktuWib(a.at)).joinToString(" · "),
                    style = MkTypography.footnote.tabular,
                    color = warna.ink2,
                )
            }
        }
    }
}

@Composable
private fun KartuAkun(d: SistemDto) {
    KartuBagian(judul = stringResource(R.string.sistem_akun), sub = stringResource(R.string.sistem_akun_sub)) {
        if (d.access.users.isEmpty()) {
            EmptyNote(teks = stringResource(R.string.sistem_akun_kosong))
            return@KartuBagian
        }
        val warna = LocalMkColors.current
        d.access.users.forEachIndexed { i, u ->
            if (i > 0) MkDivider()
            Column(Modifier.padding(vertical = MkSpacing.space2), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
                Text(u.name, style = MkTypography.bodyStrong, color = warna.ink)
                Text(
                    listOfNotNull(labelPeran(u.role), u.email.ifBlank { null }).joinToString(" · "),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    if (u.lastLoginAt != null) "Masuk terakhir ${waktuWib(u.lastLoginAt)}" else "Belum pernah masuk",
                    style = MkTypography.footnote.tabular,
                    color = warna.ink2,
                )
                if (u.hasPassword) {
                    StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_sandi_aktif))
                } else {
                    StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_belum_sandi))
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// Sheet
// ------------------------------------------------------------------

@Composable
private fun SheetPengajuan(
    item: PengajuanAksesDto?,
    terkunci: Boolean,
    onTutup: () -> Unit,
    onPutuskan: (PengajuanAksesDto, Putusan) -> Unit,
) {
    val bisa = item != null && item.status == "DIAJUKAN" && item.canDecide
    MkSheet(
        visible = item != null,
        onTutup = onTutup,
        judul = item?.title ?: stringResource(R.string.sistem_rincian_pengajuan),
        subjudul = item?.detail?.ifBlank { null },
        backLabel = stringResource(R.string.sistem_kembali),
        footer = {
            if (item != null && bisa) {
                MkButton(
                    label = stringResource(R.string.sistem_tolak),
                    onClick = { onPutuskan(item, Putusan.TOLAK) },
                    enabled = !terkunci,
                    modifier = Modifier.weight(1f),
                )
                MkButton(
                    label = stringResource(R.string.sistem_setujui),
                    onClick = { onPutuskan(item, Putusan.SETUJUI) },
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !terkunci,
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        val p = item ?: return@MkSheet
        LabelStatusPengajuan(p)
        Column(Modifier.padding(top = MkSpacing.space3)) {
            BarisKv("Jenis", jenisPengajuan(p.type))
            p.entityName?.let { BarisKv("Perusahaan", it) }
            p.requester?.let { BarisKv("Diajukan oleh", it.name) }
            p.target?.let { BarisKv("Akun sasaran", it.name) }
            BarisKv("Diajukan", waktuWib(p.createdAt))
            p.expiresAt?.let { BarisKv("Berlaku sampai", waktuWib(it)) }
            p.decidedBy?.let { BarisKv("Diputuskan oleh", it.name) }
            p.decidedAt?.let { BarisKv("Diputuskan", waktuWib(it)) }
        }
        val warna = LocalMkColors.current
        p.reason?.takeIf { it.isNotBlank() }?.let {
            JudulSeksi("Alasan")
            Text(it, style = MkTypography.body, color = warna.ink)
        }
        p.decisionNote?.takeIf { it.isNotBlank() }?.let {
            JudulSeksi("Catatan keputusan")
            Text(it, style = MkTypography.body, color = warna.ink)
        }
        if (p.type == "AKUN_BARU") {
            Text(
                "Tautan aktivasi akun baru diserahkan lewat web.",
                style = MkTypography.footnote,
                color = warna.ink2,
                modifier = Modifier.padding(top = MkSpacing.space3),
            )
        }
    }
}

private fun jenisPengajuan(kode: String): String = when (kode) {
    "AKUN_BARU" -> "Akun baru"
    "AKSES_SEMENTARA" -> "Akses sementara"
    "PINDAH_PERAN" -> "Pindah peran"
    else -> kode
}

@Composable
private fun SheetPt(pt: KunciPtDto?, pengingat: PengingatPtDto?, onTutup: () -> Unit) {
    MkSheet(
        visible = pt != null,
        onTutup = onTutup,
        judul = pt?.name?.ifBlank { pt.code }.orEmpty(),
        subjudul = pt?.code,
        backLabel = stringResource(R.string.sistem_kembali),
    ) {
        val p = pt ?: return@MkSheet
        LencanaKunciPt(p)
        Column(Modifier.padding(top = MkSpacing.space3)) {
            BarisKv(stringResource(R.string.sistem_kunci_harian), p.dailyCutoff)
            BarisKv("Batas hari ini", hariJamWib(p.dailyLockAt))
            BarisKv(stringResource(R.string.sistem_hari_kerja), labelHariKerja(p.workingDays))
            BarisKv(
                stringResource(R.string.sistem_pengisian_harian),
                stringResource(if (p.dailyOpen) R.string.sistem_dibuka else R.string.sistem_ditutup),
            )
            BarisKv(
                stringResource(R.string.sistem_pengisian_mingguan),
                stringResource(if (p.weeklyOpen) R.string.sistem_dibuka else R.string.sistem_ditutup),
            )
            BarisKv(stringResource(R.string.sistem_serah_mingguan), hariJamWib(p.weeklyHandoverBy))
            BarisKv(stringResource(R.string.sistem_kunci_mingguan), hariJamWib(p.weeklyLockAt))
        }
        if (pengingat != null && pengingat.rules.isNotEmpty()) {
            val warna = LocalMkColors.current
            JudulSeksi(stringResource(R.string.sistem_pengingat))
            pengingat.rules.forEachIndexed { i, r ->
                if (i > 0) MkDivider()
                Row(Modifier.padding(vertical = MkSpacing.space2), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(judulPengingat(r.kind), style = MkTypography.bodyStrong, color = warna.ink)
                        Text(
                            jadwalPengingat(r.kind, r.time, r.weekday, r.days) +
                                (r.lastRunAt?.let { " · terakhir ${relatif(it)}" } ?: ""),
                            style = MkTypography.footnote,
                            color = warna.ink2,
                        )
                    }
                    if (r.enabled) {
                        StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_aktif))
                    } else {
                        StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = stringResource(R.string.sistem_mati))
                    }
                }
            }
        }
    }
}

@Composable
private fun SheetPeran(
    role: String?,
    direktori: Muatan<List<KelompokPeranDto>>?,
    onTutup: () -> Unit,
    onUlang: () -> Unit,
) {
    MkSheet(
        visible = role != null,
        onTutup = onTutup,
        judul = labelPeran(role).orEmpty(),
        backLabel = stringResource(R.string.sistem_kembali),
    ) {
        when (direktori) {
            null, Muatan.Memuat -> {
                MkSkeleton(tinggi = 48.dp)
                MkSkeleton(tinggi = 48.dp, modifier = Modifier.padding(top = MkSpacing.space2))
            }
            is Muatan.Galat -> ErrorNote(pesan = direktori.pesan, onCobaLagi = onUlang)
            is Muatan.Siap -> {
                val anggota = direktori.data.firstOrNull { it.role == role }?.users.orEmpty()
                if (anggota.isEmpty()) {
                    EmptyNote(teks = stringResource(R.string.sistem_anggota_peran_kosong))
                } else {
                    anggota.forEachIndexed { i, u ->
                        if (i > 0) MkDivider()
                        MkListRow(
                            judul = u.name,
                            sub = listOfNotNull(
                                u.email.ifBlank { null },
                                u.lastLoginAt?.let { "masuk ${relatif(it)}" } ?: "belum pernah masuk",
                            ).joinToString(" · "),
                            inisial = inisial(u.name),
                        )
                    }
                }
            }
        }
    }
}

/** Activity pemilik konteks (membuka lapisan ContextWrapper). */
private fun Context.cariActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}
