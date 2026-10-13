// Sheet satu akun (padanan account-sheet.tsx + activation-handoff.tsx):
// penempatan & posisi (dibatasi manageableRoles server), divisi/proyek yang
// dipimpin, keanggotaan divisi, identitas, kata sandi, aktivasi, status, hapus.
//
// Isian formulir (termasuk kata sandi) dipegang di MEMORI ViewModel
// (vm.formAkun) agar stabil saat rotasi, bukan rememberSaveable — tidak ikut
// bundel status — dan dibuang saat sheet ditutup. Serah terima membaca sandi
// yang benar-benar terkirim (ui.dibuat.sandiAwal). Kata sandi dan tautan
// aktivasi disalin dengan tanda sensitif; tidak pernah dicatat log.
package id.co.monitorkarya.feature.entitas.perusahaan

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.MkAvatar
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.AkunBarisDto
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.PerusahaanDto
import id.co.monitorkarya.feature.entitas.ui.CatatanInfo
import id.co.monitorkarya.feature.entitas.ui.JudulBagian
import id.co.monitorkarya.feature.entitas.ui.Kotak
import id.co.monitorkarya.feature.entitas.ui.inisial
import id.co.monitorkarya.feature.entitas.ui.rememberSalinRahasia
import id.co.monitorkarya.feature.entitas.ui.tanggalWib
import id.co.monitorkarya.feature.entitas.ui.waktuWib

@Composable
internal fun SheetAkun(
    meja: MejaPerusahaanResponse,
    ui: SheetAkunUi,
    urung: String?,
    vm: PerusahaanViewModel,
) {
    val akun = ui.idAkun?.let { id -> semuaAkun(meja).firstOrNull { it.id == id } }
    val perusahaan = (akun?.scopeEntityId ?: ui.idPerusahaan)?.let { id -> meja.companies.firstOrNull { it.id == id } }
    val judul = akun?.name ?: stringResource(R.string.ent_akun_baru)

    // Formulir: kunci = akun/perusahaan target, supaya isian tidak bocor antar akun.
    val kunci = "${ui.idAkun ?: "baru"}:${ui.idPerusahaan ?: "grup"}"
    var konfirmasiHapus by remember(kunci) { mutableStateOf(false) }
    // Dipegang ViewModel: sandi usulan tidak diacak ulang saat Activity dibuat ulang.
    val form = remember(kunci) { vm.formAkun(kunci) { StatusFormAkun.dari(akun, perusahaan?.id, meja) } }
    // E2E-3 B13: subjudul mengikuti PT yang dipilih di formulir, bukan PT
    // saat sheet dibuka ("Tingkat grup" tetap tampil setelah memilih PT).
    val ptTampil = form.perusahaan(meja) ?: perusahaan
    val sub = ptTampil?.name ?: stringResource(R.string.ent_akun_tingkat_grup)

    MkSheet(
        visible = true,
        onTutup = vm::tutupAkun,
        // E2E-3 B18: isian akun baru dan layar serah terima sandi tidak hilang
        // karena geser/Kembali; Batal/Selesai tetap menutup.
        bolehTutupGeser = ui.dibuat == null && !form.adaIsian(),
        judul = judul,
        subjudul = sub,
        backLabel = stringResource(R.string.ent_tab_akun),
        // E2E-3 B7: catatan Urungkan menempel tepat di atas footer (selalu
        // terlihat), bukan di puncak isi yang sudah tergulir ke luar layar.
        galat = slotCatatan(urung = urung, info = null, onUrung = vm::urungkan),
        footer = {
            when {
                ui.dibuat != null -> MkButton(
                    label = stringResource(R.string.ent_umum_selesai),
                    onClick = vm::tutupAkun,
                    variant = MkButtonVariant.PRIMARY,
                )
                ui.idAkun != null && akun == null -> MkButton(label = stringResource(R.string.ent_umum_tutup), onClick = vm::tutupAkun)
                akun != null && !bisaSentuh(akun, meja.me, meja.manageableRoles) && akun.id != meja.me ->
                    MkButton(label = stringResource(R.string.ent_umum_tutup), onClick = vm::tutupAkun, variant = MkButtonVariant.PLAIN)
                else -> {
                    MkButton(
                        label = stringResource(R.string.ent_umum_batal),
                        onClick = vm::tutupAkun,
                        enabled = ui.sibuk == null,
                        variant = MkButtonVariant.SECONDARY,
                    )
                    Spacer(Modifier.size(MkSpacing.space2))
                    MkButton(
                        label = stringResource(
                            when {
                                ui.sibuk == AksiAkun.SIMPAN -> R.string.ent_umum_menyimpan
                                akun != null -> R.string.ent_akun_simpan
                                else -> R.string.ent_akun_buat
                            },
                        ),
                        onClick = {
                            form.dicoba = true
                            if (form.valid(meja)) {
                                vm.simpanAkun(form.keForm(), form.sandi, kunciPerusahaan = meja.scope == "ENTITY")
                            }
                        },
                        enabled = ui.sibuk == null && !(form.dicoba && !form.valid(meja)),
                        variant = MkButtonVariant.PRIMARY,
                    )
                }
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space6)) {
            when {
                ui.dibuat != null -> SerahTerimaAkunBaru(ui.dibuat)
                ui.idAkun != null && akun == null -> EmptyNote(teks = stringResource(R.string.ent_akun_tidak_ada))
                akun != null && akun.id != meja.me && !bisaSentuh(akun, meja.me, meja.manageableRoles) ->
                    AkunBacaSaja(akun, perusahaan)
                else -> FormAkunUi(
                    meja = meja,
                    akun = akun,
                    form = form,
                    ui = ui,
                    onNonaktif = { akun?.let { vm.setAktifAkun(it, false) } },
                    onAktif = { akun?.let { vm.setAktifAkun(it, true) } },
                    onHapus = { konfirmasiHapus = true },
                    onAktivasi = { akun?.let(vm::terbitkanAktivasi) },
                )
            }
        }
    }

    if (konfirmasiHapus && akun != null) {
        val warna = LocalMkColors.current
        AlertDialog(
            onDismissRequest = { konfirmasiHapus = false },
            title = { Text(text = stringResource(R.string.ent_akun_hapus_konfirmasi_judul, akun.name)) },
            text = { Text(text = stringResource(R.string.ent_akun_hapus_konfirmasi_isi, akun.username ?: akun.email.orEmpty())) },
            confirmButton = {
                TextButton(onClick = {
                    konfirmasiHapus = false
                    vm.hapusAkun(akun)
                }) { Text(text = stringResource(R.string.ent_akun_hapus), color = warna.statusLate) }
            },
            dismissButton = { TextButton(onClick = { konfirmasiHapus = false }) { Text(stringResource(R.string.ent_umum_batal)) } },
        )
    }
}

/** Status isian formulir akun (state Compose; sandi tidak masuk bundel tersimpan). */
internal class StatusFormAkun(
    idPerusahaan: String?,
    peran: String,
    nama: String,
    username: String,
    email: String,
    jabatan: String,
    telepon: String,
    val baru: Boolean,
    usernameDisentuh: Boolean,
    sandi: String,
) {
    var idPerusahaan by mutableStateOf(idPerusahaan)
    var peran by mutableStateOf(peran)
    var nama by mutableStateOf(nama)
    var username by mutableStateOf(username)
    var usernameDisentuh by mutableStateOf(usernameDisentuh)
    var email by mutableStateOf(email)
    var jabatan by mutableStateOf(jabatan)
    var telepon by mutableStateOf(telepon)
    var sandi by mutableStateOf(sandi)
    var divisiDipimpin by mutableStateOf("")
    var divisiBaru by mutableStateOf("")
    var proyekDipegang by mutableStateOf("")
    var proyekBaru by mutableStateOf("")
    var anggotaDivisi by mutableStateOf("")
    var anggotaDisentuh by mutableStateOf(false)
    var dicoba by mutableStateOf(false)

    fun ubahNama(v: String) {
        nama = v
        if (!usernameDisentuh) username = slugify(v)
    }

    /** E2E-3 B18: formulir akun BARU sudah berisi (geser/Kembali tidak boleh membuangnya). */
    fun adaIsian(): Boolean = baru && (usernameDisentuh || listOf(nama, email, jabatan, telepon).any { it.isNotBlank() })

    fun perusahaan(m: MejaPerusahaanResponse): PerusahaanDto? = idPerusahaan?.let { id -> m.companies.firstOrNull { it.id == id } }

    fun galatNama(): Int? = if (nama.isBlank()) R.string.ent_form_nama_wajib else null
    fun galatUsername(): Int? = if (!usernameSah(username)) R.string.ent_form_username_salah else null
    fun galatEmail(): Int? = if (email.isNotBlank() && !emailSah(email.trim())) R.string.ent_form_email_salah else null
    fun galatSandi(): Int? = if (sandi.isNotEmpty() && sandi.length < SANDI_MINIMAL) R.string.ent_form_sandi_pendek else null
    fun galatTelepon(): Int? = if (!teleponSah(telepon.trim())) R.string.ent_form_telepon_salah else null
    fun galatPenempatan(m: MejaPerusahaanResponse): Int? =
        if (adalahPeranEntitas(peran) && perusahaan(m) == null) R.string.ent_form_penempatan_wajib else null

    fun valid(m: MejaPerusahaanResponse): Boolean = listOf(
        galatNama(), galatUsername(), galatEmail(), galatSandi(), galatTelepon(), galatPenempatan(m),
    ).all { it == null }

    fun keForm(): FormAkun = FormAkun(
        idPerusahaan = idPerusahaan,
        peran = peran,
        nama = nama,
        username = username,
        email = email,
        jabatan = jabatan,
        telepon = telepon,
        divisiDipimpin = divisiDipimpin,
        divisiBaru = divisiBaru,
        proyekDipegang = proyekDipegang,
        proyekBaru = proyekBaru,
        anggotaDivisi = anggotaDivisi,
    )

    companion object {
        fun dari(akun: AkunBarisDto?, idPerusahaan: String?, m: MejaPerusahaanResponse): StatusFormAkun {
            val perusahaan = idPerusahaan?.let { id -> m.companies.firstOrNull { it.id == id } }
            val opsi = posisiUntuk(perusahaan, m.manageableRoles)
            return StatusFormAkun(
                idPerusahaan = idPerusahaan,
                peran = akun?.role ?: opsi.firstOrNull()?.peran ?: "ADMIN_PT",
                nama = akun?.name.orEmpty(),
                username = akun?.username.orEmpty(),
                email = akun?.email.orEmpty(),
                jabatan = akun?.title.orEmpty(),
                telepon = akun?.phone.orEmpty(),
                baru = akun == null,
                usernameDisentuh = akun != null,
                // Akun baru: kata sandi awal acak diusulkan (pemilik wajib menggantinya).
                sandi = if (akun == null) sandiAcak() else "",
            )
        }
    }
}

@Composable
private fun teks(res: Int?): String? = res?.let { stringResource(it) }

@Composable
private fun FormAkunUi(
    meja: MejaPerusahaanResponse,
    akun: AkunBarisDto?,
    form: StatusFormAkun,
    ui: SheetAkunUi,
    onNonaktif: () -> Unit,
    onAktif: () -> Unit,
    onHapus: () -> Unit,
    onAktivasi: () -> Unit,
) {
    val warna = LocalMkColors.current
    val adalahSaya = akun?.id == meja.me
    val penuh = meja.scope != "ENTITY"
    val perusahaan = form.perusahaan(meja)
    val opsiPosisi = posisiUntuk(perusahaan, meja.manageableRoles)
    val tampilGalat = form.dicoba

    // Keanggotaan divisi termuat dari server: isi awal sekali, kecuali sudah disentuh.
    LaunchedEffect(ui.anggotaDimuat, ui.anggotaDivisiAwal) {
        if (ui.anggotaDimuat && !form.anggotaDisentuh) form.anggotaDivisi = ui.anggotaDivisiAwal.orEmpty()
    }

    if (akun != null) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            MkAvatar(inisial = inisial(akun.name), ukuran = 56.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = akun.username ?: "—", style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                akun.email?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                val masuk = akun.lastLoginAt?.let { stringResource(R.string.ent_akun_terakhir_masuk, tanggalWib(it) ?: "") }
                    ?: stringResource(R.string.ent_akun_belum_pernah_masuk)
                Text(
                    text = masuk + if (adalahSaya) " · " + stringResource(R.string.ent_akun_anda) else "",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
            LencanaAkun(akun)
        }
    }

    // Penempatan & posisi
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        JudulBagian(stringResource(R.string.ent_form_penempatan_posisi), Icons.Outlined.Business)
        if (penuh && meja.companies.isNotEmpty()) {
            val opsi = listOf(MkOpsi("", stringResource(R.string.ent_form_tingkat_grup))) + meja.companies.map { c ->
                val akhiran = buildString {
                    if (c.type == "HOLDING") append(" · holding")
                    if (!c.isActive) append(" · nonaktif")
                }
                MkOpsi(c.id, c.name + akhiran)
            }
            MkPilih(
                pilihan = opsi,
                terpilih = opsi.firstOrNull { it.value == form.idPerusahaan.orEmpty() },
                onPilih = { o ->
                    form.idPerusahaan = o.value.ifBlank { null }
                    val baru = posisiUntuk(form.perusahaan(meja), meja.manageableRoles)
                    if (baru.none { it.peran == form.peran }) form.peran = baru.firstOrNull()?.peran ?: "ADMIN_PT"
                    form.divisiDipimpin = ""
                    form.proyekDipegang = ""
                    form.anggotaDivisi = ""
                    form.anggotaDisentuh = true
                },
                label = stringResource(R.string.ent_form_perusahaan),
            )
            Text(text = stringResource(R.string.ent_form_perusahaan_petunjuk), style = MkTypography.footnote, color = warna.ink2)
        }
        teks(form.galatPenempatan(meja))?.takeIf { tampilGalat }?.let { CatatanInfo(teks = it, status = MkStatus.LATE) }
        Column(modifier = Modifier.selectableGroup()) {
            opsiPosisi.forEach { o ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(selected = form.peran == o.peran, role = Role.RadioButton) { form.peran = o.peran }
                        .padding(vertical = MkSpacing.space2),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                ) {
                    RadioButton(selected = form.peran == o.peran, onClick = null)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = o.label, style = MkTypography.bodyStrong, color = warna.ink)
                        Text(text = o.petunjuk, style = MkTypography.footnote, color = warna.ink2)
                    }
                }
            }
            if (opsiPosisi.none { it.peran == form.peran }) {
                // Posisi akun saat ini di luar pilihan penempatan ini: tetap tampil agar tidak tertukar diam-diam.
                CatatanInfo(teks = stringResource(R.string.ent_form_posisi_luar, labelPeran(form.peran)), status = MkStatus.RISK)
            }
        }
        if (perusahaan != null && form.peran == "KEPALA_DIVISI") {
            val opsi = listOf(
                MkOpsi("", stringResource(if (akun != null) R.string.ent_form_tidak_diubah else R.string.ent_form_belum_ditentukan)),
            ) + perusahaan.divisions.map { d ->
                MkOpsi(
                    d.id,
                    d.name + " " + (
                        d.headName?.let { stringResource(R.string.ent_form_kini, it) }
                            ?: stringResource(R.string.ent_form_belum_ada_kepala)
                        ),
                )
            } + MkOpsi(PILIH_BARU, stringResource(R.string.ent_form_divisi_baru))
            MkPilih(
                pilihan = opsi,
                terpilih = opsi.firstOrNull { it.value == form.divisiDipimpin },
                onPilih = { form.divisiDipimpin = it.value },
                label = stringResource(R.string.ent_form_divisi_dipimpin),
            )
            if (form.divisiDipimpin == PILIH_BARU) {
                MkField(
                    nilai = form.divisiBaru,
                    onUbah = { form.divisiBaru = it },
                    label = stringResource(R.string.ent_form_nama_divisi_baru),
                    placeholder = stringResource(R.string.ent_form_nama_divisi_contoh),
                )
            }
        }
        if (perusahaan != null && form.peran == "PIC_PROYEK") {
            val opsi = listOf(
                MkOpsi("", stringResource(if (akun != null) R.string.ent_form_tidak_diubah else R.string.ent_form_belum_ditentukan)),
            ) + perusahaan.projects.map { p ->
                MkOpsi(
                    p.id,
                    p.name + " " + (
                        p.picName?.let { stringResource(R.string.ent_form_kini, it) }
                            ?: stringResource(R.string.ent_form_belum_ada_manager)
                        ),
                )
            } + MkOpsi(PILIH_BARU, stringResource(R.string.ent_form_proyek_baru))
            MkPilih(
                pilihan = opsi,
                terpilih = opsi.firstOrNull { it.value == form.proyekDipegang },
                onPilih = { form.proyekDipegang = it.value },
                label = stringResource(R.string.ent_form_proyek_dipegang),
            )
            if (form.proyekDipegang == PILIH_BARU) {
                MkField(
                    nilai = form.proyekBaru,
                    onUbah = { form.proyekBaru = it },
                    label = stringResource(R.string.ent_form_nama_proyek_baru),
                )
            }
        }
        if (perusahaan != null && perusahaan.type == "PT" && perusahaan.divisions.isNotEmpty()) {
            val opsi = listOf(MkOpsi("", stringResource(R.string.ent_form_tanpa_divisi))) +
                perusahaan.divisions.map { MkOpsi(it.id, it.name) }
            MkPilih(
                pilihan = opsi,
                terpilih = opsi.firstOrNull { it.value == form.anggotaDivisi },
                onPilih = {
                    form.anggotaDivisi = it.value
                    form.anggotaDisentuh = true
                },
                label = stringResource(R.string.ent_form_anggota_divisi),
                enabled = ui.anggotaDimuat,
            )
            Text(text = stringResource(R.string.ent_form_anggota_petunjuk), style = MkTypography.footnote, color = warna.ink2)
        }
    }

    // Identitas
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        JudulBagian(stringResource(R.string.ent_form_identitas), Icons.Outlined.PersonOutline)
        MkField(
            nilai = form.nama,
            onUbah = form::ubahNama,
            label = stringResource(R.string.ent_form_nama),
            isError = tampilGalat && form.galatNama() != null,
            supportingText = teks(form.galatNama())?.takeIf { tampilGalat },
        )
        MkField(
            nilai = form.username,
            onUbah = {
                form.username = it.lowercase()
                form.usernameDisentuh = true
            },
            label = stringResource(R.string.ent_form_username),
            placeholder = stringResource(R.string.ent_form_username_placeholder),
            isError = tampilGalat && form.galatUsername() != null,
            supportingText = teks(form.galatUsername())?.takeIf { tampilGalat } ?: stringResource(R.string.ent_form_username_petunjuk),
        )
        MkField(
            nilai = form.email,
            onUbah = { form.email = it },
            label = stringResource(R.string.ent_form_email),
            isError = tampilGalat && form.galatEmail() != null,
            supportingText = teks(form.galatEmail())?.takeIf { tampilGalat }
                ?: if (akun == null && form.email.isBlank()) {
                    stringResource(R.string.ent_form_email_bawaan, form.username.ifBlank { "username" })
                } else {
                    null
                },
        )
        MkField(
            nilai = form.jabatan,
            onUbah = { form.jabatan = it },
            label = stringResource(R.string.ent_form_jabatan),
            placeholder = opsiPosisi.firstOrNull { it.peran == form.peran }?.label,
        )
        MkField(
            nilai = form.telepon,
            onUbah = { form.telepon = it },
            label = stringResource(R.string.ent_form_telepon),
            placeholder = "+62…",
            isError = tampilGalat && form.galatTelepon() != null,
            supportingText = teks(form.galatTelepon())?.takeIf { tampilGalat },
        )
    }

    // Aktivasi (hanya bila server menyatakan akun ini menunggu aktivasi)
    if (akun != null && !adalahSaya && (ui.aktivasiTersedia == true || ui.tautan != null)) {
        BagianAktivasi(ui = ui, onTerbitkan = onAktivasi)
    }

    // Kata sandi
    BagianSandi(form = form, baru = akun == null, akun = akun, tampilGalat = tampilGalat)

    // Status & hapus
    if (akun != null) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            JudulBagian(stringResource(R.string.ent_form_status), Icons.Outlined.Settings)
            if (adalahSaya) {
                CatatanInfo(teks = stringResource(R.string.ent_akun_sendiri_catatan))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(if (akun.isActive) R.string.ent_akun_status_aktif else R.string.ent_akun_status_nonaktif),
                            style = MkTypography.bodyStrong,
                            color = warna.ink,
                        )
                        Text(text = stringResource(R.string.ent_akun_status_catatan), style = MkTypography.footnote, color = warna.ink2)
                    }
                    MkButton(
                        label = stringResource(
                            when {
                                ui.sibuk == AksiAkun.STATUS -> R.string.ent_umum_memproses
                                akun.isActive -> R.string.ent_akun_nonaktifkan
                                else -> R.string.ent_akun_aktifkan
                            },
                        ),
                        onClick = if (akun.isActive) onNonaktif else onAktif,
                        enabled = ui.sibuk == null,
                        size = MkButtonSize.S,
                    )
                }
                MkDivider()
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = stringResource(R.string.ent_akun_hapus), style = MkTypography.bodyStrong, color = warna.ink)
                        Text(text = stringResource(R.string.ent_akun_hapus_catatan), style = MkTypography.footnote, color = warna.ink2)
                    }
                    MkButton(
                        label = stringResource(if (ui.sibuk == AksiAkun.HAPUS) R.string.ent_umum_menghapus else R.string.ent_akun_hapus),
                        onClick = onHapus,
                        enabled = ui.sibuk == null,
                        size = MkButtonSize.S,
                    )
                }
            }
        }
    }

    ui.galat?.let { CatatanInfo(teks = it, status = MkStatus.LATE) }
}

@Composable
private fun BagianSandi(form: StatusFormAkun, baru: Boolean, akun: AkunBarisDto?, tampilGalat: Boolean) {
    val warna = LocalMkColors.current
    val salin = rememberSalinRahasia()
    val labelSalin = stringResource(R.string.ent_form_sandi_salin)
    var disalin by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        JudulBagian(
            stringResource(if (baru) R.string.ent_form_sandi_awal else R.string.ent_form_sandi_setel_ulang),
            Icons.Outlined.Key,
        )
        MkField(
            nilai = form.sandi,
            onUbah = {
                form.sandi = it
                disalin = false
            },
            label = stringResource(if (baru) R.string.ent_form_sandi else R.string.ent_form_sandi_baru),
            placeholder = if (baru) null else stringResource(R.string.ent_form_tidak_diubah),
            isError = tampilGalat && form.galatSandi() != null,
            supportingText = teks(form.galatSandi())?.takeIf { tampilGalat }
                ?: stringResource(if (baru) R.string.ent_form_sandi_petunjuk_baru else R.string.ent_form_sandi_petunjuk_ubah),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), verticalAlignment = Alignment.CenterVertically) {
            MkButton(
                label = stringResource(R.string.ent_form_sandi_acak),
                onClick = {
                    form.sandi = sandiAcak()
                    disalin = false
                },
                size = MkButtonSize.S,
            )
            MkButton(
                label = stringResource(R.string.ent_form_sandi_salin),
                onClick = {
                    salin(labelSalin, form.sandi)
                    disalin = true
                },
                variant = MkButtonVariant.PLAIN,
                size = MkButtonSize.S,
                enabled = form.sandi.isNotEmpty(),
            )
            if (disalin) Text(text = stringResource(R.string.ent_umum_disalin), style = MkTypography.footnote, color = warna.ink2)
        }
        if (!baru && akun != null && !akun.hasPassword) {
            CatatanInfo(teks = stringResource(R.string.ent_form_sandi_belum_ada), status = MkStatus.RISK)
        }
    }
}

@Composable
private fun BagianAktivasi(ui: SheetAkunUi, onTerbitkan: () -> Unit) {
    val warna = LocalMkColors.current
    val salin = rememberSalinRahasia()
    val labelSalin = stringResource(R.string.ent_aktivasi_salin)
    var disalin by remember(ui.tautan?.url) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        JudulBagian(stringResource(R.string.ent_aktivasi_judul), Icons.Outlined.Link)
        val t = ui.tautan
        if (t == null) {
            Text(text = stringResource(R.string.ent_aktivasi_catatan), style = MkTypography.footnote, color = warna.ink2)
            MkButton(
                label = stringResource(if (ui.sibuk == AksiAkun.AKTIVASI) R.string.ent_aktivasi_menerbitkan else R.string.ent_aktivasi_terbitkan),
                onClick = onTerbitkan,
                enabled = ui.sibuk == null,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            StatusBadge(status = MkStatus.INFO, text = stringResource(R.string.ent_aktivasi_menunggu))
            Text(text = stringResource(R.string.ent_aktivasi_sampaikan, t.username), style = MkTypography.body, color = warna.ink)
            Text(
                text = stringResource(R.string.ent_aktivasi_berlaku, waktuWib(t.kedaluwarsaIso) ?: stringResource(R.string.ent_aktivasi_24_jam)),
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(MkShapes.md)
                        .background(warna.fill1)
                        .padding(MkSpacing.space3),
                ) {
                    SelectionContainer {
                        Text(text = t.url, style = MkTypography.code, color = warna.ink, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                }
                MkIconBtn(
                    icon = Icons.Outlined.ContentCopy,
                    label = stringResource(R.string.ent_aktivasi_salin),
                    onClick = {
                        salin(labelSalin, t.url)
                        disalin = true
                    },
                )
            }
            if (disalin) Text(text = stringResource(R.string.ent_aktivasi_disalin), style = MkTypography.footnote, color = warna.ink2)
        }
    }
}

/** Akun di luar wewenang meja: identitas baca-saja + alasan. */
@Composable
private fun AkunBacaSaja(akun: AkunBarisDto, perusahaan: PerusahaanDto?) {
    val warna = LocalMkColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
        MkAvatar(inisial = inisial(akun.name), ukuran = 56.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = akun.username ?: "—", style = MkTypography.bodyStrong, color = warna.ink)
            akun.email?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
            Text(
                text = listOfNotNull(labelPeran(akun.role), perusahaan?.name).joinToString(" · "),
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
        LencanaAkun(akun)
    }
    val posisi = if (akun.role == "DIREKTUR_ENTITAS") stringResource(R.string.ent_akun_direktur_perusahaan) else labelPeran(akun.role)
    CatatanInfo(teks = stringResource(R.string.ent_akun_luar_jangkauan, posisi), status = MkStatus.INFO)
}

/** Serah terima akun baru: kata sandi awal untuk disampaikan langsung. */
@Composable
private fun SerahTerimaAkunBaru(dibuat: AkunDibuat) {
    val warna = LocalMkColors.current
    val sandi = dibuat.sandiAwal.nilai
    val salin = rememberSalinRahasia()
    val labelSalin = stringResource(R.string.ent_form_sandi_salin)
    var disalin by remember { mutableStateOf(false) }
    Kotak {
        StatusBadge(status = MkStatus.DONE, text = stringResource(R.string.ent_akun_dibuat_lencana))
        Text(text = stringResource(R.string.ent_akun_dibuat, dibuat.username), style = MkTypography.bodyStrong, color = warna.ink)
        if (sandi.isNotEmpty()) {
            Text(text = stringResource(R.string.ent_akun_dibuat_sandi_catatan), style = MkTypography.footnote, color = warna.ink2)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                SelectionContainer(modifier = Modifier.weight(1f)) {
                    Text(text = sandi, style = MkTypography.code, color = warna.ink)
                }
                MkIconBtn(
                    icon = Icons.Outlined.ContentCopy,
                    label = stringResource(R.string.ent_form_sandi_salin),
                    onClick = {
                        salin(labelSalin, sandi)
                        disalin = true
                    },
                )
            }
            if (disalin) Text(text = stringResource(R.string.ent_umum_disalin), style = MkTypography.footnote, color = warna.ink2)
        } else {
            Text(text = stringResource(R.string.ent_akun_dibuat_tanpa_sandi), style = MkTypography.footnote, color = warna.ink2)
        }
    }
}
