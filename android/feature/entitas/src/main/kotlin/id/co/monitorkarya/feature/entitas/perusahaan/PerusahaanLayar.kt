// Layar tab Perusahaan & akun. Padanan web: companies-view.tsx — jawaban
// dulu ("9 perusahaan aktif dengan 42 akun."), lalu tiga tampilan:
// Perusahaan (kartu), Akun (daftar lintas perusahaan), Struktur (pohon grup).
// Semua rincian dan perubahan terjadi di MkSheet, tidak pindah halaman.
package id.co.monitorkarya.feature.entitas.perusahaan

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkListRow
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkSnackbarHost
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.tampilkanUrungkan
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.AkunBarisDto
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.PerusahaanDto
import id.co.monitorkarya.feature.entitas.data.TotalMejaDto
import id.co.monitorkarya.feature.entitas.ui.BilahProgres
import id.co.monitorkarya.feature.entitas.ui.CatatanInfo
import id.co.monitorkarya.feature.entitas.ui.LencanaStatus
import id.co.monitorkarya.feature.entitas.ui.StatusKata
import id.co.monitorkarya.feature.entitas.ui.angka
import id.co.monitorkarya.feature.entitas.ui.inisial
import id.co.monitorkarya.feature.entitas.ui.tampil
import id.co.monitorkarya.feature.entitas.ui.tanggalWib

private const val HALAMAN_AKUN = 40

/** [peran] tidak dipakai untuk izin: wewenang meja datang dari jawaban server. */
@Suppress("UNUSED_PARAMETER")
@Composable
internal fun PerusahaanLayar(
    peran: Peran,
    vm: PerusahaanViewModel,
    modifier: Modifier = Modifier,
) {
    val meja by vm.meja.collectAsStateWithLifecycle()
    val tampilan by vm.tampilan.collectAsStateWithLifecycle()
    val cari by vm.cari.collectAsStateWithLifecycle()
    val sheetPerusahaan by vm.sheetPerusahaan.collectAsStateWithLifecycle()
    val sheetAkun by vm.sheetAkun.collectAsStateWithLifecycle()
    val wizard by vm.wizard.collectAsStateWithLifecycle()
    val notif by vm.notif.collectAsStateWithLifecycle()

    val snackbar = remember { SnackbarHostState() }
    val teksNotif = notif?.teks?.tampil()
    val labelUrung = stringResource(R.string.ent_umum_urungkan)
    LaunchedEffect(notif?.id) {
        val n = notif ?: return@LaunchedEffect
        val pesan = teksNotif ?: return@LaunchedEffect
        if (n.bisaUrung) {
            tampilkanUrungkan(snackbar, pesan, labelUrung) { vm.urungkan() }
        } else {
            snackbar.showSnackbar(pesan)
        }
        vm.notifTampil()
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (val m = meja) {
            MejaUi.Memuat -> KerangkaMeja()
            is MejaUi.Galat -> Column(Modifier.padding(horizontal = MkSpacing.space3)) {
                KepalaMeja(konteks = null, aksi = null)
                if (m.ditolak) {
                    CatatanInfo(teks = m.pesan.ifBlank { stringResource(R.string.ent_perusahaan_ditolak) }, status = MkStatus.INFO)
                } else {
                    ErrorNote(pesan = stringResource(R.string.ent_perusahaan_galat_muat, m.pesan), onCobaLagi = vm::muat)
                }
            }
            is MejaUi.Siap -> IsiMeja(meja = m.meja, tampilan = tampilan, cari = cari, vm = vm)
        }
        MkSnackbarHost(
            modifier = Modifier.align(Alignment.BottomCenter).padding(MkSpacing.space3),
            snackbarHostState = snackbar,
        )
    }

    val m = (meja as? MejaUi.Siap)?.meja ?: return
    // Sheet akun menimpa sheet perusahaan; setelah ditutup, sheet perusahaan muncul lagi.
    val sa = sheetAkun
    val sp = sheetPerusahaan
    val w = wizard
    when {
        sa != null -> SheetAkun(
            meja = m,
            ui = sa,
            urung = notif?.takeIf { it.bisaUrung }?.let { teksNotif },
            vm = vm,
        )
        w != null -> SheetWizard(meja = m, ui = w, vm = vm)
        sp != null -> m.companies.firstOrNull { it.id == sp.id }?.let { c ->
            SheetPerusahaan(
                meja = m,
                c = c,
                ui = sp,
                urung = notif?.takeIf { it.bisaUrung }?.let { teksNotif },
                vm = vm,
                info = notif?.takeIf { !it.bisaUrung }?.let { teksNotif },
            )
        }
    }
}

@Composable
private fun KepalaMeja(konteks: String?, aksi: (@Composable () -> Unit)?) {
    val warna = LocalMkColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = MkSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            konteks?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
            Text(text = stringResource(R.string.ent_perusahaan_judul), style = MkTypography.title1, color = warna.ink)
        }
        aksi?.invoke()
    }
}

@Composable
private fun KerangkaMeja() {
    Column(
        modifier = Modifier.padding(horizontal = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        KepalaMeja(konteks = null, aksi = null)
        MkSkeleton(modifier = Modifier.fillMaxWidth(), tinggi = 140.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            MkSkeleton(modifier = Modifier.weight(1f), tinggi = 88.dp)
            MkSkeleton(modifier = Modifier.weight(1f), tinggi = 88.dp)
        }
        repeat(4) { MkSkeleton(modifier = Modifier.fillMaxWidth(), tinggi = 120.dp) }
    }
}

@Composable
private fun IsiMeja(meja: MejaPerusahaanResponse, tampilan: Tampilan, cari: String, vm: PerusahaanViewModel) {
    val r = ringkasMeja(meja)
    val bolehKelola = meja.canManageCompanies
    val namaPtSendiri = meja.companies.firstOrNull()?.name ?: stringResource(R.string.ent_perusahaan_pt_anda)
    val saringP by vm.saringPerusahaan.collectAsStateWithLifecycle()
    val urut by vm.urut.collectAsStateWithLifecycle()
    val saringA by vm.saringAkun.collectAsStateWithLifecycle()
    val tempat by vm.tempat.collectAsStateWithLifecycle()
    val peranSaring by vm.peranSaring.collectAsStateWithLifecycle()
    var batasAkun by rememberSaveable { mutableIntStateOf(HALAMAN_AKUN) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = MkSpacing.space3, end = MkSpacing.space3, bottom = MkSpacing.space16),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        item(key = "kepala") {
            KepalaMeja(
                konteks = if (r.penuh) {
                    stringResource(R.string.ent_perusahaan_konteks_penuh)
                } else {
                    stringResource(R.string.ent_perusahaan_konteks_terbatas, namaPtSendiri)
                },
                aksi = {
                    if (bolehKelola) {
                        MkButton(
                            label = stringResource(R.string.ent_perusahaan_tambah),
                            onClick = vm::bukaWizard,
                            size = MkButtonSize.S,
                        )
                    } else {
                        MkButton(
                            label = stringResource(R.string.ent_akun_tambah),
                            onClick = { vm.bukaAkun(null, meja.companies.firstOrNull()?.id) },
                            size = MkButtonSize.S,
                        )
                    }
                },
            )
        }
        item(key = "hero") { HeroMeja(r = r, totals = meja.totals, namaPt = namaPtSendiri, bolehKelola = bolehKelola, vm = vm) }
        item(key = "kontrol") {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                MkSegmentedControl(
                    options = listOf(
                        MkOpsi(Tampilan.PERUSAHAAN.name, stringResource(R.string.ent_perusahaan_tampilan_perusahaan)),
                        MkOpsi(Tampilan.AKUN.name, stringResource(R.string.ent_perusahaan_tampilan_akun)),
                        MkOpsi(Tampilan.STRUKTUR.name, stringResource(R.string.ent_perusahaan_tampilan_struktur)),
                    ),
                    terpilih = tampilan.name,
                    onPilih = { v -> Tampilan.entries.firstOrNull { it.name == v }?.let(vm::setTampilan) },
                )
                MkField(
                    nilai = cari,
                    onUbah = vm::setCari,
                    label = stringResource(R.string.ent_umum_cari),
                    placeholder = stringResource(
                        if (tampilan == Tampilan.AKUN) R.string.ent_perusahaan_cari_akun else R.string.ent_perusahaan_cari_perusahaan,
                    ),
                )
            }
        }
        when (tampilan) {
            Tampilan.PERUSAHAAN -> daftarPerusahaan(meja, saringP, urut, cari, bolehKelola, vm)
            Tampilan.AKUN -> daftarAkun(meja, saringA, tempat, peranSaring, cari, batasAkun, { batasAkun += HALAMAN_AKUN }, vm)
            Tampilan.STRUKTUR -> item(key = "struktur") { StrukturGrup(meja = meja, cari = cari, vm = vm) }
        }
    }
}

@Composable
private fun HeroMeja(
    r: RingkasanMeja,
    totals: TotalMejaDto,
    namaPt: String,
    bolehKelola: Boolean,
    vm: PerusahaanViewModel,
) {
    val warna = LocalMkColors.current
    val eyebrow = if (r.penuh) {
        stringResource(R.string.ent_perusahaan_hero_eyebrow_penuh, r.jumlahHolding, r.jumlahPerusahaan - r.jumlahHolding)
    } else {
        stringResource(R.string.ent_perusahaan_hero_eyebrow_terbatas)
    }
    val jawaban = if (r.penuh) {
        stringResource(R.string.ent_perusahaan_hero_jawaban_penuh, angka(r.perusahaanAktif), angka(r.akunAktif))
    } else {
        stringResource(R.string.ent_perusahaan_hero_jawaban_terbatas, angka(r.akunAktif), namaPt)
    }
    val dukung = listOfNotNull(
        when {
            r.belumMasuk > 0 -> stringResource(R.string.ent_perusahaan_dukung_belum_masuk, r.belumMasuk)
            r.tanpaSandi > 0 -> null
            else -> stringResource(R.string.ent_perusahaan_dukung_semua_masuk)
        },
        r.tanpaSandi.takeIf { it > 0 }?.let { stringResource(R.string.ent_perusahaan_dukung_tanpa_sandi, it) },
        r.tanpaKepala.takeIf { it > 0 }?.let { stringResource(R.string.ent_perusahaan_dukung_tanpa_kepala, it) },
        r.tanpaManager.takeIf { it > 0 }?.let { stringResource(R.string.ent_perusahaan_dukung_tanpa_manager, it) },
        r.belumLengkap.takeIf { it > 0 }?.let { stringResource(R.string.ent_perusahaan_dukung_belum_lengkap, it) },
    ).joinToString(" ")
    MkCard {
        Text(text = eyebrow, style = MkTypography.footnote, color = warna.ink2)
        Spacer(Modifier.size(MkSpacing.space1))
        Text(text = jawaban, style = MkTypography.title2, color = warna.ink)
        if (dukung.isNotBlank()) {
            Spacer(Modifier.size(MkSpacing.space2))
            Text(text = dukung, style = MkTypography.body, color = warna.ink2)
        }
        Spacer(Modifier.size(MkSpacing.space4))
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            if (r.hal > 0) {
                MkButton(
                    label = stringResource(R.string.ent_perusahaan_tinjau_hal, angka(r.hal)),
                    onClick = {
                        vm.setTampilan(if (r.belumLengkap > 0 && r.penuh) Tampilan.PERUSAHAAN else Tampilan.AKUN)
                    },
                    variant = MkButtonVariant.PRIMARY,
                    size = MkButtonSize.S,
                )
            } else if (bolehKelola) {
                MkButton(
                    label = stringResource(R.string.ent_perusahaan_tambah),
                    onClick = vm::bukaWizard,
                    variant = MkButtonVariant.PRIMARY,
                    size = MkButtonSize.S,
                )
            }
            MkButton(
                label = stringResource(R.string.ent_perusahaan_lihat_struktur),
                onClick = { vm.setTampilan(Tampilan.STRUKTUR) },
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
            )
        }
        Spacer(Modifier.size(MkSpacing.space4))
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            StatTile(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.ent_perusahaan_kpi_perusahaan),
                value = r.jumlahPerusahaan,
                delta = stringResource(R.string.ent_perusahaan_kpi_perusahaan_delta, r.perusahaanAktif, r.jumlahPerusahaan - r.perusahaanAktif),
            )
            StatTile(
                modifier = Modifier.weight(1f).clickable(role = Role.Button) { vm.setTampilan(Tampilan.AKUN) },
                label = stringResource(R.string.ent_perusahaan_kpi_akun),
                value = r.semuaAkun,
                delta = if (r.tanpaSandi > 0) {
                    stringResource(R.string.ent_perusahaan_kpi_akun_tanpa_sandi, r.tanpaSandi)
                } else {
                    stringResource(R.string.ent_perusahaan_kpi_akun_grup, r.akunGrup)
                },
                tone = if (r.tanpaSandi > 0) MkStatus.LATE else MkStatus.NEUTRAL,
            )
        }
        Spacer(Modifier.size(MkSpacing.space3))
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            StatTile(
                modifier = Modifier.weight(1f).clickable(role = Role.Button) { vm.setTampilan(Tampilan.STRUKTUR) },
                label = stringResource(R.string.ent_perusahaan_kpi_divisi),
                value = totals.divisions,
                delta = if (r.tanpaKepala > 0) {
                    stringResource(R.string.ent_perusahaan_kpi_tanpa_kepala, r.tanpaKepala)
                } else {
                    stringResource(R.string.ent_perusahaan_kpi_semua_berkepala)
                },
                tone = if (r.tanpaKepala > 0) MkStatus.RISK else MkStatus.ON,
            )
            StatTile(
                modifier = Modifier.weight(1f).clickable(role = Role.Button) { vm.setTampilan(Tampilan.STRUKTUR) },
                label = stringResource(R.string.ent_perusahaan_kpi_proyek),
                value = totals.projects,
                delta = if (r.tanpaManager > 0) {
                    stringResource(R.string.ent_perusahaan_kpi_tanpa_manager, r.tanpaManager)
                } else {
                    stringResource(R.string.ent_perusahaan_kpi_semua_bermanager)
                },
                tone = if (r.tanpaManager > 0) MkStatus.RISK else MkStatus.ON,
            )
        }
    }
}

// ------------------------------------------------------------------
// Tampilan Perusahaan
// ------------------------------------------------------------------

private fun LazyListScope.daftarPerusahaan(
    meja: MejaPerusahaanResponse,
    saring: SaringPerusahaan,
    urut: UrutPerusahaan,
    cari: String,
    bolehKelola: Boolean,
    vm: PerusahaanViewModel,
) {
    val daftar = saringPerusahaan(meja.companies, saring, urut, cari)
    item(key = "saring-perusahaan") {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                SaringPerusahaan.entries.forEach { s ->
                    MkChip(
                        label = stringResource(labelSaringPerusahaan(s)),
                        selected = saring == s,
                        count = meja.companies.count { cocokSaringPerusahaan(it, s) },
                        status = when (s) {
                            SaringPerusahaan.BELUM_LENGKAP -> MkStatus.RISK
                            SaringPerusahaan.NONAKTIF -> MkStatus.NEUTRAL
                            else -> null
                        },
                        onClick = { vm.setSaringPerusahaan(s) },
                    )
                }
            }
            val opsi = UrutPerusahaan.entries.map { MkOpsi(it.name, stringResource(labelUrut(it))) }
            MkPilih(
                pilihan = opsi,
                terpilih = opsi.firstOrNull { it.value == urut.name },
                onPilih = { o -> UrutPerusahaan.entries.firstOrNull { it.name == o.value }?.let(vm::setUrut) },
                label = stringResource(R.string.ent_perusahaan_urutkan),
            )
        }
    }
    if (daftar.isEmpty()) {
        item(key = "kosong-perusahaan") {
            EmptyNote(
                teks = stringResource(
                    if (meja.companies.isEmpty()) R.string.ent_perusahaan_kosong_awal else R.string.ent_perusahaan_kosong_cocok,
                ),
                ikon = Icons.Outlined.Business,
                teksAksi = if (bolehKelola && meja.companies.isEmpty()) stringResource(R.string.ent_perusahaan_tambah_holding) else null,
                onAksi = if (bolehKelola && meja.companies.isEmpty()) vm::bukaWizard else null,
            )
        }
    } else {
        items(daftar, key = { "p-" + it.id }) { c ->
            KartuPerusahaan(
                c = c,
                onBuka = { tab -> vm.bukaPerusahaan(c.id, tab) },
                onTambahAkun = { vm.bukaAkun(null, c.id) },
            )
        }
    }
}

private fun labelSaringPerusahaan(s: SaringPerusahaan): Int = when (s) {
    SaringPerusahaan.SEMUA -> R.string.ent_saring_semua
    SaringPerusahaan.HOLDING -> R.string.ent_saring_holding
    SaringPerusahaan.PT -> R.string.ent_saring_anak_perusahaan
    SaringPerusahaan.BELUM_LENGKAP -> R.string.ent_saring_perlu_dilengkapi
    SaringPerusahaan.NONAKTIF -> R.string.ent_saring_nonaktif
}

private fun labelUrut(u: UrutPerusahaan): Int = when (u) {
    UrutPerusahaan.NAMA -> R.string.ent_urut_nama
    UrutPerusahaan.AKUN_TERBANYAK -> R.string.ent_urut_akun
    UrutPerusahaan.PALING_BELUM_LENGKAP -> R.string.ent_urut_lengkap
}

@Composable
private fun KartuPerusahaan(c: PerusahaanDto, onBuka: (TabPerusahaan) -> Unit, onTambahAkun: () -> Unit) {
    val warna = LocalMkColors.current
    val k = kelengkapan(c)
    MkCard(onClick = { onBuka(TabPerusahaan.RINGKASAN) }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            id.co.monitorkarya.designsystem.components.MkAvatar(inisial = inisial(c.name), ukuran = 44.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = c.name, style = MkTypography.headline, color = warna.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    text = listOf(
                        stringResource(if (c.type == "HOLDING") R.string.ent_saring_holding else R.string.ent_saring_anak_perusahaan),
                        c.code,
                    ).filter { it.isNotBlank() }.joinToString(" · "),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
            if (!c.isActive) LencanaStatus(StatusKata(MkStatus.NEUTRAL, stringResource(R.string.ent_umum_nonaktif)))
        }
        Spacer(Modifier.size(MkSpacing.space3))
        Text(
            text = c.address?.takeIf { it.isNotBlank() } ?: stringResource(R.string.ent_perusahaan_alamat_kosong),
            style = MkTypography.footnote,
            color = warna.ink2,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = (c.email ?: c.phone)?.takeIf { it.isNotBlank() } ?: stringResource(R.string.ent_perusahaan_kontak_kosong),
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        Spacer(Modifier.size(MkSpacing.space3))
        val tanpaKepala = c.divisions.count { it.headUserId == null }
        Text(
            text = stringResource(
                R.string.ent_perusahaan_kartu_hitungan,
                c.counts.users,
                c.counts.divisions,
                c.counts.projects,
                angka(c.counts.dailyReports + c.counts.weeklyReports),
            ),
            style = MkTypography.callout,
            color = warna.ink,
        )
        if (tanpaKepala > 0) {
            Spacer(Modifier.size(MkSpacing.space1))
            LencanaStatus(StatusKata(MkStatus.RISK, stringResource(R.string.ent_perusahaan_kpi_tanpa_kepala, tanpaKepala)))
        }
        Spacer(Modifier.size(MkSpacing.space3))
        Text(
            text = stringResource(R.string.ent_perusahaan_kelengkapan_persen, k.persen),
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        BilahProgres(
            nilai = k.persen,
            labelAksesibel = stringResource(R.string.ent_perusahaan_kelengkapan_dari, c.name),
            warnaIsi = when {
                k.persen == 100 -> warna.statusDone
                k.persen >= 60 -> androidx.compose.ui.graphics.Color.Unspecified
                else -> warna.statusRisk
            },
            tampilkanAngka = false,
        )
        Spacer(Modifier.size(MkSpacing.space3))
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            MkButton(
                label = stringResource(R.string.ent_akun_tambah),
                onClick = onTambahAkun,
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
            )
            Spacer(Modifier.weight(1f))
            MkButton(
                label = stringResource(R.string.ent_perusahaan_kelola),
                onClick = { onBuka(TabPerusahaan.RINGKASAN) },
                size = MkButtonSize.S,
            )
        }
    }
}

// ------------------------------------------------------------------
// Tampilan Akun
// ------------------------------------------------------------------

private fun LazyListScope.daftarAkun(
    meja: MejaPerusahaanResponse,
    status: SaringAkun,
    tempat: String,
    peranSaring: String?,
    cari: String,
    batas: Int,
    tambahBatas: () -> Unit,
    vm: PerusahaanViewModel,
) {
    val baris = saringAkun(meja, status, tempat, peranSaring, cari)
    val jumlah = jumlahSaringAkun(meja)
    val semua = semuaAkun(meja)
    val penuh = meja.scope != "ENTITY"
    item(key = "saring-akun") {
        val warna = LocalMkColors.current
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.ent_akun_hitungan_tampil, angka(baris.size), angka(semua.size)),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    modifier = Modifier.weight(1f),
                )
                MkButton(
                    label = stringResource(R.string.ent_akun_tambah),
                    onClick = { vm.bukaAkun(null, if (penuh) null else meja.companies.firstOrNull()?.id) },
                    variant = MkButtonVariant.PRIMARY,
                    size = MkButtonSize.S,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                SaringAkun.entries.forEach { s ->
                    MkChip(
                        label = stringResource(labelSaringAkun(s)),
                        selected = status == s,
                        count = jumlah[s] ?: 0,
                        status = when (s) {
                            SaringAkun.AKTIF -> MkStatus.ON
                            SaringAkun.BELUM_MASUK -> MkStatus.RISK
                            SaringAkun.TANPA_SANDI -> MkStatus.LATE
                            SaringAkun.NONAKTIF -> MkStatus.NEUTRAL
                            SaringAkun.SEMUA -> null
                        },
                        onClick = { vm.setSaringAkun(s) },
                    )
                }
            }
            if (penuh) {
                val opsiTempat = listOf(
                    MkOpsi(TEMPAT_SEMUA, stringResource(R.string.ent_akun_tempat_semua)),
                    MkOpsi(TEMPAT_GRUP, stringResource(R.string.ent_akun_tempat_grup)),
                ) + meja.companies.map { MkOpsi(it.id, it.name) }
                MkPilih(
                    pilihan = opsiTempat,
                    terpilih = opsiTempat.firstOrNull { it.value == tempat },
                    onPilih = { vm.setTempat(it.value) },
                    label = stringResource(R.string.ent_akun_penempatan),
                )
            }
            val hadir = SEMUA_PERAN.filter { p -> semua.any { it.role == p } }
            val opsiPeran = listOf(MkOpsi("", stringResource(R.string.ent_akun_posisi_semua))) + hadir.map { MkOpsi(it, labelPeran(it)) }
            MkPilih(
                pilihan = opsiPeran,
                terpilih = opsiPeran.firstOrNull { it.value == (peranSaring ?: "") },
                onPilih = { vm.setPeranSaring(it.value.ifBlank { null }) },
                label = stringResource(R.string.ent_akun_posisi),
            )
        }
    }
    if (baris.isEmpty()) {
        item(key = "kosong-akun") {
            EmptyNote(teks = stringResource(R.string.ent_akun_kosong_saring), ikon = Icons.Outlined.PersonOutline)
        }
    } else {
        items(baris.take(batas), key = { "a-" + it.akun.id }) { b ->
            Column {
                BarisAkunUi(
                    akun = b.akun,
                    me = meja.me,
                    bolehSentuh = bisaSentuh(b.akun, meja.me, meja.manageableRoles),
                    sub = listOf(
                        b.akun.title?.takeIf { it.isNotBlank() } ?: labelPeran(b.akun.role),
                        b.perusahaan?.name ?: stringResource(R.string.ent_akun_tingkat_grup),
                    ).joinToString(" · "),
                    onClick = { vm.bukaAkun(b.akun.id, b.perusahaan?.id) },
                )
                MkDivider()
            }
        }
        if (baris.size > batas) {
            item(key = "lagi-akun") {
                MkButton(
                    label = stringResource(R.string.ent_akun_tampilkan_lagi, minOf(HALAMAN_AKUN, baris.size - batas)),
                    onClick = tambahBatas,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private fun labelSaringAkun(s: SaringAkun): Int = when (s) {
    SaringAkun.SEMUA -> R.string.ent_saring_semua
    SaringAkun.AKTIF -> R.string.ent_saring_aktif
    SaringAkun.BELUM_MASUK -> R.string.ent_saring_belum_masuk
    SaringAkun.TANPA_SANDI -> R.string.ent_saring_tanpa_sandi
    SaringAkun.NONAKTIF -> R.string.ent_saring_nonaktif
}

/**
 * Satu baris akun (UserRowButton web): nama · username · sub, lencana status
 * (Nonaktif / Tanpa sandi / tanggal masuk / Belum masuk), gembok = baca-saja.
 */
@Composable
internal fun BarisAkunUi(akun: AkunBarisDto, me: String, bolehSentuh: Boolean, sub: String, onClick: () -> Unit) {
    val warna = LocalMkColors.current
    val anda = if (akun.id == me) " · " + stringResource(R.string.ent_akun_anda) else ""
    MkListRow(
        judul = akun.name + anda,
        sub = listOfNotNull(akun.username, sub).joinToString(" · "),
        inisial = inisial(akun.name),
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                if (!bolehSentuh && akun.id != me) {
                    Icon(
                        imageVector = Icons.Outlined.Lock,
                        contentDescription = stringResource(R.string.ent_akun_baca_saja),
                        tint = warna.ink2,
                        modifier = Modifier.size(16.dp),
                    )
                }
                LencanaAkun(akun)
            }
        },
        onClick = onClick,
    )
}

@Composable
internal fun LencanaAkun(akun: AkunBarisDto) {
    when {
        !akun.isActive -> StatusBadge(status = MkStatus.NEUTRAL, size = MkBadgeSize.SM, text = stringResource(R.string.ent_umum_nonaktif))
        !akun.hasPassword -> StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM, text = stringResource(R.string.ent_akun_tanpa_sandi))
        akun.lastLoginAt != null -> {
            val warna = LocalMkColors.current
            Text(text = tanggalWib(akun.lastLoginAt) ?: "", style = MkTypography.footnote, color = warna.ink2)
        }
        else -> StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM, text = stringResource(R.string.ent_akun_belum_masuk))
    }
}

// ------------------------------------------------------------------
// Tampilan Struktur
// ------------------------------------------------------------------

@Composable
private fun StrukturGrup(meja: MejaPerusahaanResponse, cari: String, vm: PerusahaanViewModel) {
    val holding = meja.companies.filter { it.type == "HOLDING" }
    val yatim = meja.companies.filter { c -> c.type != "HOLDING" && holding.none { it.id == c.parentId } }
    val j = cari.trim().lowercase()
    fun cocok(c: PerusahaanDto): Boolean = j.isEmpty() ||
        listOf(c.name, c.code).any { it.lowercase().contains(j) } ||
        c.users.any { it.name.lowercase().contains(j) } ||
        c.divisions.any { it.name.lowercase().contains(j) } ||
        c.projects.any { it.name.lowercase().contains(j) }
    var terbuka by rememberSaveable { mutableStateOf(setOf("grup") + holding.map { it.id }) }
    val semuaId = listOf("grup") + meja.companies.map { it.id }
    val semuaTerbuka = terbuka.size >= semuaId.size
    fun alih(id: String) {
        terbuka = if (id in terbuka) terbuka - id else terbuka + id
    }
    fun buka(id: String) = j.isNotEmpty() || id in terbuka

    MkCard {
        val warna = LocalMkColors.current
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = stringResource(R.string.ent_struktur_judul), style = MkTypography.title3, color = warna.ink)
                Text(text = stringResource(R.string.ent_struktur_sub), style = MkTypography.footnote, color = warna.ink2)
            }
            MkButton(
                label = stringResource(if (semuaTerbuka) R.string.ent_umum_ciutkan_semua else R.string.ent_umum_buka_semua),
                onClick = { terbuka = if (semuaTerbuka) emptySet() else semuaId.toSet() },
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
            )
        }
        Spacer(Modifier.size(MkSpacing.space3))
        if (meja.holdingUsers.isNotEmpty()) {
            SimpulStruktur(
                judul = stringResource(R.string.ent_struktur_akun_grup),
                meta = stringResource(R.string.ent_struktur_n_akun, meja.holdingUsers.size),
                terbuka = buka("grup"),
                kedalaman = 0,
                onAlih = { alih("grup") },
                onBuka = null,
                redup = false,
            ) {
                meja.holdingUsers.filter { j.isEmpty() || it.name.lowercase().contains(j) }.forEach { u ->
                    DaunStruktur(
                        ikon = Icons.Outlined.PersonOutline,
                        judul = u.name,
                        meta = labelPeran(u.role),
                        peringatan = false,
                        kedalaman = 1,
                        onClick = { vm.bukaAkun(u.id, null) },
                    )
                }
            }
        }
        (holding + yatim).forEach { h ->
            val anak = meja.companies.filter { it.parentId == h.id && it.type != "HOLDING" }
            if (!cocok(h) && anak.none { cocok(it) }) return@forEach
            SimpulPerusahaan(c = h, kedalaman = 0, buka = ::buka, alih = ::alih, vm = vm) {
                anak.filter { cocok(it) }.forEach { k ->
                    SimpulPerusahaan(c = k, kedalaman = 1, buka = ::buka, alih = ::alih, vm = vm) {}
                }
            }
        }
    }
}

@Composable
private fun SimpulPerusahaan(
    c: PerusahaanDto,
    kedalaman: Int,
    buka: (String) -> Boolean,
    alih: (String) -> Unit,
    vm: PerusahaanViewModel,
    anak: @Composable () -> Unit,
) {
    SimpulStruktur(
        judul = c.name,
        meta = stringResource(R.string.ent_struktur_meta_perusahaan, c.users.size, c.divisions.size, c.projects.size),
        terbuka = buka(c.id),
        kedalaman = kedalaman,
        onAlih = { alih(c.id) },
        onBuka = { vm.bukaPerusahaan(c.id) },
        redup = !c.isActive,
    ) {
        c.divisions.forEach { d ->
            DaunStruktur(
                ikon = Icons.Outlined.Groups,
                judul = stringResource(R.string.ent_struktur_divisi, d.name),
                meta = d.headName ?: stringResource(R.string.ent_struktur_belum_kepala),
                peringatan = d.headName == null,
                kedalaman = kedalaman + 1,
                onClick = { vm.bukaPerusahaan(c.id, TabPerusahaan.DIVISI) },
            )
        }
        c.projects.forEach { p ->
            DaunStruktur(
                ikon = Icons.Outlined.Work,
                judul = p.name,
                meta = p.picName ?: stringResource(R.string.ent_struktur_belum_manager),
                peringatan = p.picName == null,
                kedalaman = kedalaman + 1,
                onClick = { vm.bukaPerusahaan(c.id, TabPerusahaan.PROYEK) },
            )
        }
        anak()
    }
}

@Composable
private fun SimpulStruktur(
    judul: String,
    meta: String,
    terbuka: Boolean,
    kedalaman: Int,
    onAlih: () -> Unit,
    onBuka: (() -> Unit)?,
    redup: Boolean,
    isi: @Composable () -> Unit,
) {
    val warna = LocalMkColors.current
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = (kedalaman * 16).dp)
                .clickable(role = Role.Button, onClick = onBuka ?: onAlih)
                .padding(vertical = MkSpacing.space2),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Icon(
                imageVector = if (terbuka) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight,
                contentDescription = stringResource(if (terbuka) R.string.ent_entitas_ciutkan_simpul else R.string.ent_entitas_buka_simpul, judul),
                tint = warna.ink2,
                // Target sentuh 48dp terpisah dari baris (baris membuka Sheet), ikon 24dp.
                modifier = Modifier.size(48.dp).clickable(role = Role.Button, onClick = onAlih).padding(12.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = judul,
                    style = MkTypography.bodyStrong,
                    color = if (redup) warna.ink3 else warna.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = meta, style = MkTypography.footnote, color = warna.ink2, maxLines = 1)
            }
        }
        if (terbuka) isi()
    }
}

@Composable
private fun DaunStruktur(
    ikon: androidx.compose.ui.graphics.vector.ImageVector,
    judul: String,
    meta: String,
    peringatan: Boolean,
    kedalaman: Int,
    onClick: () -> Unit,
) {
    val warna = LocalMkColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = (kedalaman * 16 + 8).dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = MkSpacing.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Icon(imageVector = ikon, contentDescription = null, tint = warna.ink3, modifier = Modifier.size(16.dp))
        Text(
            text = judul,
            style = MkTypography.body,
            color = warna.ink,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = meta,
            style = MkTypography.footnote,
            color = if (peringatan) warna.statusRisk else warna.ink2,
            maxLines = 1,
        )
    }
}
