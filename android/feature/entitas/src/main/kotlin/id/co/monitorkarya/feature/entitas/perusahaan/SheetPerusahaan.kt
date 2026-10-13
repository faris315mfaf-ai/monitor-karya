// Sheet rincian perusahaan (padanan company-sheet.tsx): Ringkasan
// (angka, kelengkapan profil, perlu perhatian, identitas), Akun, Divisi,
// Proyek, dan Pengaturan (hanya bila server mengizinkan canManageCompanies).
// Konfirmasi dialog HANYA untuk hapus; aktif/nonaktif langsung + Urungkan.
package id.co.monitorkarya.feature.entitas.perusahaan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.clickable
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkChip
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.PerusahaanDto
import id.co.monitorkarya.feature.entitas.ui.BarisInfo
import id.co.monitorkarya.feature.entitas.ui.BilahProgres
import id.co.monitorkarya.feature.entitas.ui.CatatanInfo
import id.co.monitorkarya.feature.entitas.ui.JudulBagian
import id.co.monitorkarya.feature.entitas.ui.LencanaStatus
import id.co.monitorkarya.feature.entitas.ui.StatusKata
import id.co.monitorkarya.feature.entitas.ui.angka
import id.co.monitorkarya.feature.entitas.ui.labelSiklus

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SheetPerusahaan(
    meja: MejaPerusahaanResponse,
    c: PerusahaanDto,
    ui: SheetPerusahaanUi,
    urung: String?,
    vm: PerusahaanViewModel,
    info: String? = null,
) {
    val bolehKelola = meja.canManageCompanies
    val jenis = if (c.type == "HOLDING") {
        stringResource(R.string.ent_saring_holding)
    } else if (c.parentName != null) {
        stringResource(R.string.ent_perusahaan_anak_dari, c.parentName)
    } else {
        stringResource(R.string.ent_saring_anak_perusahaan)
    }
    MkSheet(
        visible = true,
        onTutup = vm::tutupPerusahaan,
        judul = c.name,
        subjudul = listOf(c.code, jenis).filter { it.isNotBlank() }.joinToString(" · "),
        backLabel = stringResource(R.string.ent_perusahaan_judul),
        // E2E-3 B7: Urungkan menempel di atas footer, terlihat dari tab mana pun
        // (dulu di puncak isi — di luar layar saat sakelar di bawah tab Pengaturan).
        // E2E-3 B14: pesan sukses (mis. "Identitas perusahaan tersimpan.") juga
        // tampil di sheet — snackbar layar utama tertutup sheet modal.
        galat = slotCatatan(urung = urung, info = info, onUrung = vm::urungkan),
        footer = {
            MkButton(label = stringResource(R.string.ent_umum_tutup), onClick = vm::tutupPerusahaan, variant = MkButtonVariant.PLAIN)
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            LencanaStatus(
                if (c.isActive) {
                    StatusKata(MkStatus.ON, stringResource(R.string.ent_umum_aktif))
                } else {
                    StatusKata(MkStatus.NEUTRAL, stringResource(R.string.ent_umum_nonaktif))
                },
            )
            // E2E-3 B11: chip yang tidak muat dibungkus ke baris berikut — "Pengaturan"
            // tidak lagi tersembunyi di luar layar tanpa petunjuk geser.
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                val tabs = buildList {
                    add(TabPerusahaan.RINGKASAN to (stringResource(R.string.ent_tab_ringkasan) to null))
                    add(TabPerusahaan.AKUN to (stringResource(R.string.ent_tab_akun) to c.users.size))
                    add(TabPerusahaan.DIVISI to (stringResource(R.string.ent_tab_divisi) to c.divisions.size))
                    add(TabPerusahaan.PROYEK to (stringResource(R.string.ent_tab_proyek) to c.projects.size))
                    if (bolehKelola) add(TabPerusahaan.PENGATURAN to (stringResource(R.string.ent_tab_pengaturan) to null))
                }
                tabs.forEach { (tab, isi) ->
                    MkChip(label = isi.first, count = isi.second, selected = ui.tab == tab, onClick = { vm.setTabPerusahaan(tab) })
                }
            }
            when (ui.tab) {
                TabPerusahaan.RINGKASAN -> TabRingkasan(c, vm)
                TabPerusahaan.AKUN -> TabAkun(meja, c, vm)
                TabPerusahaan.DIVISI -> TabDivisi(c, vm)
                TabPerusahaan.PROYEK -> TabProyek(c, vm)
                TabPerusahaan.PENGATURAN -> if (bolehKelola) {
                    TabPengaturan(c, ui, vm)
                } else {
                    TabRingkasan(c, vm)
                }
            }
        }
    }
}

/**
 * Slot `galat` MkSheet (menempel di atas footer): catatan Urungkan bila ada,
 * selain itu pesan sukses; null = tanpa catatan (E2E-3 B7/B14).
 */
internal fun slotCatatan(urung: String?, info: String?, onUrung: () -> Unit): (@Composable () -> Unit)? {
    if (urung != null) {
        val slot: @Composable () -> Unit = { CatatanUrung(teks = urung, onUrung = onUrung) }
        return slot
    }
    if (info != null) {
        val slot: @Composable () -> Unit = { CatatanInfo(teks = info, status = MkStatus.ON) }
        return slot
    }
    return null
}

/** Catatan "Urungkan" di dalam sheet (snackbar layar utama tertutup sheet modal). */
@Composable
internal fun CatatanUrung(teks: String, onUrung: () -> Unit) {
    id.co.monitorkarya.feature.entitas.ui.Kotak {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = teks,
                style = MkTypography.footnote,
                color = LocalMkColors.current.ink,
                modifier = Modifier.weight(1f),
            )
            MkButton(
                label = stringResource(R.string.ent_umum_urungkan),
                onClick = onUrung,
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
            )
        }
    }
}

@Composable
private fun TabRingkasan(c: PerusahaanDto, vm: PerusahaanViewModel) {
    val warna = LocalMkColors.current
    val k = kelengkapan(c)
    val aktif = c.users.count { it.isActive }
    val tanpaKepala = c.divisions.filter { it.headUserId == null }
    val tanpaManager = c.projects.filter { it.picUserId == null }
    val tanpaSandi = c.users.filter { !it.hasPassword }
    val belumMasuk = c.users.filter { it.isActive && it.lastLoginAt == null }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space6)) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.ent_ringkasan_akun_aktif),
                    value = aktif,
                    delta = stringResource(R.string.ent_ringkasan_dari_akun, c.users.size),
                    tone = if (aktif == c.users.size) MkStatus.ON else MkStatus.NEUTRAL,
                )
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.ent_perusahaan_kpi_divisi),
                    value = c.divisions.size,
                    delta = if (tanpaKepala.isNotEmpty()) {
                        stringResource(R.string.ent_perusahaan_kpi_tanpa_kepala, tanpaKepala.size)
                    } else {
                        stringResource(R.string.ent_perusahaan_kpi_semua_berkepala)
                    },
                    tone = if (tanpaKepala.isNotEmpty()) MkStatus.RISK else MkStatus.ON,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.ent_perusahaan_kpi_proyek),
                    value = c.projects.size,
                    delta = if (tanpaManager.isNotEmpty()) {
                        stringResource(R.string.ent_perusahaan_kpi_tanpa_manager, tanpaManager.size)
                    } else {
                        stringResource(R.string.ent_perusahaan_kpi_semua_bermanager)
                    },
                    tone = if (tanpaManager.isNotEmpty()) MkStatus.RISK else MkStatus.ON,
                )
                StatTile(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.ent_ringkasan_laporan),
                    value = angka(c.counts.dailyReports + c.counts.weeklyReports),
                    delta = stringResource(
                        R.string.ent_ringkasan_laporan_rinci,
                        angka(c.counts.dailyReports),
                        angka(c.counts.weeklyReports),
                    ),
                )
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            JudulBagian(stringResource(R.string.ent_ringkasan_kelengkapan), Icons.Outlined.Badge) {
                Text(
                    text = stringResource(R.string.ent_ringkasan_n_dari_n, k.selesai, k.total),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
            BilahProgres(nilai = k.persen, labelAksesibel = stringResource(R.string.ent_ringkasan_kelengkapan))
            k.butir.forEach { b ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(
                            if (!b.selesai) {
                                Modifier.clickable(role = Role.Button) { vm.setTabPerusahaan(b.tab) }
                            } else {
                                Modifier
                            },
                        )
                        .padding(vertical = MkSpacing.space2),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                ) {
                    Icon(
                        imageVector = if (b.selesai) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                        contentDescription = stringResource(if (b.selesai) R.string.ent_ringkasan_selesai else R.string.ent_ringkasan_belum),
                        tint = if (b.selesai) warna.statusDone else warna.ink3,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(text = b.label, style = MkTypography.body, color = if (b.selesai) warna.ink2 else warna.ink, modifier = Modifier.weight(1f))
                    if (!b.selesai) Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = warna.ink3, modifier = Modifier.size(16.dp))
                }
            }
        }

        if (tanpaSandi.isNotEmpty() || belumMasuk.isNotEmpty() || tanpaKepala.isNotEmpty() || tanpaManager.isNotEmpty()) {
            Column {
                JudulBagian(stringResource(R.string.ent_ringkasan_perlu_perhatian), Icons.Outlined.WarningAmber)
                tanpaSandi.take(3).forEach { u ->
                    BarisInfo(
                        judul = u.name,
                        meta = stringResource(R.string.ent_ringkasan_alasan_tanpa_sandi),
                        onClick = { vm.bukaAkun(u.id, c.id) },
                    ) { LencanaStatus(StatusKata(MkStatus.LATE, labelPeran(u.role))) }
                }
                belumMasuk.take(3).forEach { u ->
                    BarisInfo(
                        judul = u.name,
                        meta = stringResource(R.string.ent_ringkasan_alasan_belum_masuk),
                        onClick = { vm.bukaAkun(u.id, c.id) },
                    ) { LencanaStatus(StatusKata(MkStatus.RISK, labelPeran(u.role))) }
                }
                tanpaKepala.take(3).forEach { d ->
                    BarisInfo(
                        judul = stringResource(R.string.ent_struktur_divisi, d.name),
                        meta = stringResource(R.string.ent_ringkasan_alasan_tanpa_kepala),
                        onClick = { vm.setTabPerusahaan(TabPerusahaan.DIVISI) },
                    )
                }
                tanpaManager.take(3).forEach { p ->
                    BarisInfo(
                        judul = p.name,
                        meta = stringResource(R.string.ent_ringkasan_alasan_tanpa_manager),
                        onClick = { vm.setTabPerusahaan(TabPerusahaan.PROYEK) },
                    )
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            JudulBagian(stringResource(R.string.ent_ringkasan_identitas), Icons.Outlined.Business)
            BarisIdentitas(c.address, stringResource(R.string.ent_perusahaan_alamat_kosong))
            BarisIdentitas(c.phone, stringResource(R.string.ent_ringkasan_telepon_kosong))
            BarisIdentitas(c.email, stringResource(R.string.ent_ringkasan_email_kosong))
            BarisIdentitas(c.website?.removePrefix("https://")?.removePrefix("http://"), stringResource(R.string.ent_ringkasan_situs_kosong))
        }
    }
}

@Composable
private fun BarisIdentitas(nilai: String?, kosong: String) {
    val warna = LocalMkColors.current
    Text(
        text = nilai?.takeIf { it.isNotBlank() } ?: kosong,
        style = MkTypography.body,
        color = if (nilai.isNullOrBlank()) warna.ink2 else warna.ink,
    )
}

@Composable
private fun TabAkun(meja: MejaPerusahaanResponse, c: PerusahaanDto, vm: PerusahaanViewModel) {
    var cari by rememberSaveable(c.id) { mutableStateOf("") }
    val j = cari.trim().lowercase()
    val akun = c.users.filter { u ->
        j.isEmpty() || listOf(u.name, u.username, u.email, u.title, labelPeran(u.role)).any { it.orEmpty().lowercase().contains(j) }
    }
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        MkField(
            nilai = cari,
            onUbah = { cari = it },
            label = stringResource(R.string.ent_akun_cari),
            placeholder = stringResource(R.string.ent_akun_cari_placeholder),
        )
        MkButton(
            label = stringResource(R.string.ent_akun_tambah),
            onClick = { vm.bukaAkun(null, c.id) },
            variant = MkButtonVariant.PRIMARY,
            size = MkButtonSize.S,
        )
        if (akun.isEmpty()) {
            EmptyNote(teks = stringResource(if (c.users.isEmpty()) R.string.ent_akun_kosong_perusahaan else R.string.ent_akun_kosong_cocok))
        }
        akun.groupBy { it.role }.forEach { (peran, daftar) ->
            Text(text = labelPeran(peran), style = MkTypography.caption, color = warna.ink2)
            daftar.forEachIndexed { i, u ->
                BarisAkunUi(
                    akun = u,
                    me = meja.me,
                    bolehSentuh = bisaSentuh(u, meja.me, meja.manageableRoles),
                    sub = listOfNotNull(u.title?.takeIf { it.isNotBlank() } ?: labelPeran(u.role), u.divisionName, u.projectName)
                        .joinToString(" · "),
                    onClick = { vm.bukaAkun(u.id, c.id) },
                )
                if (i < daftar.lastIndex) MkDivider()
            }
        }
    }
}

@Composable
private fun TabDivisi(c: PerusahaanDto, vm: PerusahaanViewModel) {
    val kepala = c.users.associateBy { it.id }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        CatatanInfo(teks = stringResource(R.string.ent_divisi_catatan))
        if (c.divisions.isEmpty()) {
            EmptyNote(
                teks = stringResource(R.string.ent_entitas_divisi_kosong),
                teksAksi = stringResource(R.string.ent_divisi_tambah_kepala),
                onAksi = { vm.bukaAkun(null, c.id) },
            )
        }
        c.divisions.forEachIndexed { i, d ->
            val k = d.headUserId?.let { kepala[it] }
            BarisInfo(
                judul = stringResource(R.string.ent_struktur_divisi, d.name),
                meta = d.headName?.let { stringResource(R.string.ent_divisi_kepala, it) } ?: stringResource(R.string.ent_divisi_belum_kepala),
            ) {
                if (k != null) {
                    MkButton(
                        label = stringResource(R.string.ent_divisi_lihat_kepala),
                        onClick = { vm.bukaAkun(k.id, c.id) },
                        variant = MkButtonVariant.PLAIN,
                        size = MkButtonSize.S,
                    )
                } else {
                    MkButton(
                        label = stringResource(R.string.ent_divisi_tetapkan_kepala),
                        onClick = { vm.bukaAkun(null, c.id) },
                        size = MkButtonSize.S,
                    )
                }
            }
            if (i < c.divisions.lastIndex) MkDivider()
        }
    }
}

@Composable
private fun TabProyek(c: PerusahaanDto, vm: PerusahaanViewModel) {
    val orang = c.users.associateBy { it.id }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        CatatanInfo(teks = stringResource(R.string.ent_proyek_catatan))
        if (c.projects.isEmpty()) EmptyNote(teks = stringResource(R.string.ent_entitas_proyek_kosong))
        c.projects.forEachIndexed { i, p ->
            val pic = p.picUserId?.let { orang[it] }
            BarisInfo(
                judul = p.name,
                meta = listOf(
                    p.code,
                    p.picName?.let { stringResource(R.string.ent_proyek_manager, it) } ?: stringResource(R.string.ent_proyek_belum_manager),
                ).filter { it.isNotBlank() }.joinToString(" · "),
            ) {
                LencanaStatus(StatusKata(if (p.lifecycle == "AKTIF") MkStatus.ON else MkStatus.INFO, labelSiklus(p.lifecycle)))
            }
            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                if (pic != null) {
                    MkButton(
                        label = stringResource(R.string.ent_proyek_lihat_manager),
                        onClick = { vm.bukaAkun(pic.id, c.id) },
                        variant = MkButtonVariant.PLAIN,
                        size = MkButtonSize.S,
                    )
                } else {
                    MkButton(
                        label = stringResource(R.string.ent_proyek_tetapkan_manager),
                        onClick = { vm.bukaAkun(null, c.id) },
                        size = MkButtonSize.S,
                    )
                }
            }
            if (i < c.projects.lastIndex) MkDivider()
        }
    }
}

@Composable
private fun TabPengaturan(c: PerusahaanDto, ui: SheetPerusahaanUi, vm: PerusahaanViewModel) {
    val warna = LocalMkColors.current
    var nama by rememberSaveable(c.id) { mutableStateOf(c.name) }
    var alamat by rememberSaveable(c.id) { mutableStateOf(c.address.orEmpty()) }
    var telepon by rememberSaveable(c.id) { mutableStateOf(c.phone.orEmpty()) }
    var email by rememberSaveable(c.id) { mutableStateOf(c.email.orEmpty()) }
    var situs by rememberSaveable(c.id) { mutableStateOf(c.website.orEmpty()) }
    var konfirmasiHapus by remember { mutableStateOf(false) }

    val berubah = nama != c.name || alamat != c.address.orEmpty() || telepon != c.phone.orEmpty() ||
        email != c.email.orEmpty() || situs != c.website.orEmpty()
    val namaSalah = nama.trim().length < 2
    val emailSalah = email.isNotBlank() && !emailSah(email.trim())
    val sibuk = ui.sibuk != null
    val penghalang = laporanPenghalangHapus(c)

    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space6)) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            JudulBagian(stringResource(R.string.ent_pengaturan_identitas), Icons.Outlined.Business)
            CatatanInfo(teks = stringResource(R.string.ent_pengaturan_logo_web))
            MkField(
                nilai = nama,
                onUbah = { nama = it },
                label = stringResource(R.string.ent_pengaturan_nama),
                isError = namaSalah,
                supportingText = if (namaSalah) stringResource(R.string.ent_pengaturan_nama_salah) else null,
            )
            MkField(nilai = alamat, onUbah = { alamat = it }, label = stringResource(R.string.ent_pengaturan_alamat), baris = 2)
            MkField(nilai = telepon, onUbah = { telepon = it }, label = stringResource(R.string.ent_pengaturan_telepon), placeholder = "+62…")
            MkField(
                nilai = email,
                onUbah = { email = it },
                label = stringResource(R.string.ent_pengaturan_email),
                isError = emailSalah,
                supportingText = if (emailSalah) stringResource(R.string.ent_form_email_salah) else null,
            )
            MkField(nilai = situs, onUbah = { situs = it }, label = stringResource(R.string.ent_pengaturan_situs), placeholder = "https://")
            ui.galat?.let { CatatanInfo(teks = it, status = MkStatus.LATE) }
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                Spacer(Modifier.weight(1f))
                MkButton(
                    label = stringResource(R.string.ent_pengaturan_kembalikan),
                    onClick = {
                        nama = c.name
                        alamat = c.address.orEmpty()
                        telepon = c.phone.orEmpty()
                        email = c.email.orEmpty()
                        situs = c.website.orEmpty()
                    },
                    enabled = berubah && !sibuk,
                    size = MkButtonSize.S,
                )
                MkButton(
                    label = stringResource(
                        if (ui.sibuk == AksiPerusahaan.SIMPAN) R.string.ent_umum_menyimpan else R.string.ent_pengaturan_simpan,
                    ),
                    onClick = { vm.simpanPerusahaan(c.id, nama, alamat, telepon, email, situs) },
                    variant = MkButtonVariant.PRIMARY,
                    enabled = berubah && !sibuk && !namaSalah && !emailSalah,
                    size = MkButtonSize.S,
                )
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            JudulBagian(stringResource(R.string.ent_pengaturan_status), Icons.Outlined.Settings)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = stringResource(R.string.ent_pengaturan_perusahaan_aktif), style = MkTypography.bodyStrong, color = warna.ink)
                    Text(text = stringResource(R.string.ent_pengaturan_aktif_catatan), style = MkTypography.footnote, color = warna.ink2)
                }
                Switch(
                    checked = c.isActive,
                    onCheckedChange = { vm.setAktifPerusahaan(c, it) },
                    enabled = !sibuk,
                )
            }
            MkDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = stringResource(R.string.ent_pengaturan_hapus_judul), style = MkTypography.bodyStrong, color = warna.ink)
                    Text(text = stringResource(R.string.ent_pengaturan_hapus_catatan), style = MkTypography.footnote, color = warna.ink2)
                }
                MkButton(
                    label = stringResource(if (ui.sibuk == AksiPerusahaan.HAPUS) R.string.ent_umum_menghapus else R.string.ent_pengaturan_hapus),
                    onClick = { konfirmasiHapus = true },
                    enabled = !sibuk && penghalang == 0,
                    size = MkButtonSize.S,
                )
            }
            // E2E-3 B16: PT berriwayat tidak ditawari hapus (server menolak 409).
            if (penghalang > 0) {
                Text(
                    text = stringResource(R.string.ent_pengaturan_hapus_terkunci, penghalang),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
        }
    }

    if (konfirmasiHapus) {
        AlertDialog(
            onDismissRequest = { konfirmasiHapus = false },
            title = { Text(text = stringResource(R.string.ent_pengaturan_hapus_konfirmasi_judul, c.name)) },
            text = {
                Text(
                    text = stringResource(
                        R.string.ent_pengaturan_hapus_konfirmasi_isi,
                        c.counts.users,
                        c.counts.divisions,
                        c.counts.projects,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    konfirmasiHapus = false
                    vm.hapusPerusahaan(c)
                }) {
                    Text(text = stringResource(R.string.ent_pengaturan_hapus), color = warna.statusLate)
                }
            },
            dismissButton = {
                TextButton(onClick = { konfirmasiHapus = false }) { Text(text = stringResource(R.string.ent_umum_batal)) }
            },
        )
    }
}
