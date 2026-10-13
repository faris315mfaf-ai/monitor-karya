// Wizard tambah perusahaan (padanan company-wizard.tsx), hanya dibuka bila
// server menyatakan canManageCompanies: Identitas -> Kontak -> Posisi & akun
// -> Tinjau, lalu serah terima kata sandi awal akun pertama. Isian wizard
// (termasuk sandi) dipegang di memori ViewModel (vm.formWizard) agar tidak
// hilang/diacak ulang saat rotasi; bukan bundel tersimpan, dibuang saat
// wizard ditutup. Serah terima membaca sandi yang terkirim (ui.serahTerima).
// Tidak dicatat log.
// Logo perusahaan diunggah lewat web (data URL besar tidak dikirim dari HP).
package id.co.monitorkarya.feature.entitas.perusahaan

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
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
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.feature.entitas.R
import id.co.monitorkarya.feature.entitas.data.MejaPerusahaanResponse
import id.co.monitorkarya.feature.entitas.data.PosisiBaruRequest
import id.co.monitorkarya.feature.entitas.data.TambahPerusahaanRequest
import id.co.monitorkarya.feature.entitas.ui.CatatanInfo
import id.co.monitorkarya.feature.entitas.ui.Kotak
import id.co.monitorkarya.feature.entitas.ui.rememberSalinRahasia

/** Satu posisi/akun pertama dalam wizard. */
internal class DrafPosisi(peran: String) {
    var peran by mutableStateOf(peran)
    var nama by mutableStateOf("")
    var username by mutableStateOf("")
    var usernameDisentuh by mutableStateOf(false)
    var email by mutableStateOf("")
    var jabatan by mutableStateOf("")
    var sandi by mutableStateOf(sandiAcak())
    var namaDivisi by mutableStateOf("")
    var namaProyek by mutableStateOf("")
}

/** Status isian wizard (state Compose). */
internal class StatusWizard(adaHolding: Boolean, indukAwal: String) {
    var langkah by mutableIntStateOf(0)
    var holding by mutableStateOf(!adaHolding)
    var nama by mutableStateOf("")
    var induk by mutableStateOf(indukAwal)
    var kode by mutableStateOf("")
    var kodeDisentuh by mutableStateOf(false)
    var alamat by mutableStateOf("")
    var telepon by mutableStateOf("")
    var email by mutableStateOf("")
    var situs by mutableStateOf("")
    val draf = mutableStateListOf(DrafPosisi("ADMIN_PT"))
    val dicoba = mutableStateListOf<Int>()

    fun kodeTampil(): String = if (kodeDisentuh) kode else kodeTurunan(nama, holding)

    /** E2E-3 B18: ada isian yang akan hilang bila sheet tertutup tak sengaja. */
    fun adaIsian(): Boolean = langkah > 0 || kodeDisentuh ||
        listOf(nama, alamat, telepon, email, situs).any { it.isNotBlank() } ||
        draf.any { d -> listOf(d.nama, d.email, d.jabatan, d.namaDivisi, d.namaProyek).any { it.isNotBlank() } }

    /** Galat per langkah sebagai id string + argumen (seperti stepErrors web). */
    fun galat(langkah: Int): List<Pair<Int, List<Any>>> = when (langkah) {
        0 -> buildList {
            if (nama.trim().length < 2) add(R.string.ent_wizard_galat_nama to emptyList())
            if (!holding && induk.isBlank()) add(R.string.ent_wizard_galat_induk to emptyList())
            val k = kodeTampil()
            if (k.isNotEmpty() && !kodeSah(k)) add(R.string.ent_wizard_galat_kode to emptyList())
        }
        1 -> buildList {
            if (email.isNotBlank() && !emailSah(email.trim())) add(R.string.ent_wizard_galat_email to emptyList())
            if (!teleponSah(telepon.trim())) add(R.string.ent_form_telepon_salah to emptyList())
        }
        2 -> buildList {
            draf.forEachIndexed { i, d ->
                val n = i + 1
                if (d.nama.isBlank()) add(R.string.ent_wizard_galat_posisi_nama to listOf(n))
                if (!usernameSah(d.username)) add(R.string.ent_wizard_galat_posisi_username to listOf(n))
                if (d.email.isNotBlank() && !emailSah(d.email.trim())) add(R.string.ent_wizard_galat_posisi_email to listOf(n))
                if (d.sandi.isNotEmpty() && d.sandi.length < SANDI_MINIMAL) add(R.string.ent_wizard_galat_posisi_sandi to listOf(n))
            }
            if (draf.map { it.username }.toSet().size != draf.size) add(R.string.ent_wizard_galat_username_sama to emptyList())
        }
        else -> emptyList()
    }

    fun langkahSalahPertama(): Int? = (0..2).firstOrNull { galat(it).isNotEmpty() }

    fun keRequest(): TambahPerusahaanRequest = TambahPerusahaanRequest(
        name = nama.trim(),
        isHolding = holding,
        parentId = if (holding) null else induk.ifBlank { null },
        code = if (kodeDisentuh) kode.trim().uppercase() else null,
        address = alamat.trim().ifBlank { null },
        phone = telepon.trim().ifBlank { null },
        email = email.trim().ifBlank { null },
        website = situs.trim().ifBlank { null },
        positions = draf.map { d ->
            PosisiBaruRequest(
                role = d.peran,
                name = d.nama.trim(),
                username = d.username.trim().lowercase(),
                email = d.email.trim().lowercase().ifBlank { null },
                password = d.sandi.ifBlank { null },
                title = d.jabatan.trim().ifBlank { null },
                divisionName = d.namaDivisi.trim().ifBlank { null }.takeIf { d.peran == "KEPALA_DIVISI" },
                projectName = d.namaProyek.trim().ifBlank { null }.takeIf { d.peran == "PIC_PROYEK" },
            )
        },
    )
}

private val JUDUL_LANGKAH = listOf(
    R.string.ent_wizard_langkah_identitas,
    R.string.ent_wizard_langkah_kontak,
    R.string.ent_wizard_langkah_posisi,
    R.string.ent_wizard_langkah_tinjau,
)

@Composable
internal fun SheetWizard(meja: MejaPerusahaanResponse, ui: WizardUi, vm: PerusahaanViewModel) {
    val holdingList = meja.companies.filter { it.type == "HOLDING" }
    val w = remember {
        vm.formWizard { StatusWizard(adaHolding = holdingList.isNotEmpty(), indukAwal = holdingList.firstOrNull()?.id.orEmpty()) }
    }
    val hasil = ui.hasil

    MkSheet(
        visible = true,
        onTutup = vm::tutupWizard,
        // E2E-3 B18: geser/Kembali/ketuk luar tidak membuang isian (dan sandi
        // serah terima di layar Tersimpan); tombol Batal/Selesai tetap menutup.
        bolehTutupGeser = hasil == null && !w.adaIsian(),
        judul = stringResource(R.string.ent_wizard_judul),
        subjudul = if (hasil == null) {
            stringResource(R.string.ent_wizard_langkah_n, w.langkah + 1, stringResource(JUDUL_LANGKAH[w.langkah]))
        } else {
            null
        },
        backLabel = stringResource(R.string.ent_perusahaan_judul),
        footer = {
            if (hasil != null) {
                MkButton(label = stringResource(R.string.ent_umum_selesai), onClick = vm::tutupWizard, variant = MkButtonVariant.SECONDARY)
                Spacer(Modifier.size(MkSpacing.space2))
                if (hasil.id.isNotBlank()) {
                    MkButton(
                        label = stringResource(R.string.ent_wizard_buka_perusahaan),
                        onClick = {
                            vm.tutupWizard()
                            vm.bukaPerusahaan(hasil.id)
                        },
                        variant = MkButtonVariant.PRIMARY,
                    )
                }
            } else {
                if (w.langkah > 0) {
                    MkButton(
                        label = stringResource(R.string.ent_wizard_kembali),
                        onClick = { w.langkah -= 1 },
                        enabled = !ui.sibuk,
                    )
                    Spacer(Modifier.size(MkSpacing.space2))
                }
                if (w.langkah < JUDUL_LANGKAH.lastIndex) {
                    MkButton(
                        label = stringResource(R.string.ent_wizard_lanjut),
                        onClick = {
                            if (w.galat(w.langkah).isNotEmpty()) {
                                if (w.langkah !in w.dicoba) w.dicoba.add(w.langkah)
                            } else {
                                w.langkah += 1
                            }
                        },
                        variant = MkButtonVariant.PRIMARY,
                    )
                } else {
                    MkButton(
                        label = stringResource(if (ui.sibuk) R.string.ent_umum_menyimpan else R.string.ent_wizard_simpan),
                        onClick = {
                            val salah = w.langkahSalahPertama()
                            if (salah != null) {
                                if (salah !in w.dicoba) w.dicoba.add(salah)
                                w.langkah = salah
                            } else {
                                vm.kirimWizard(w.keRequest())
                            }
                        },
                        enabled = !ui.sibuk,
                        variant = MkButtonVariant.PRIMARY,
                    )
                }
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            if (hasil != null) {
                HasilWizard(nama = hasil.name.ifBlank { w.nama }, akun = ui.serahTerima)
            } else {
                when (w.langkah) {
                    0 -> LangkahIdentitas(w, meja)
                    1 -> LangkahKontak(w)
                    2 -> LangkahPosisi(w)
                    else -> LangkahTinjau(w, meja)
                }
                if (w.langkah in w.dicoba) {
                    w.galat(w.langkah).firstOrNull()?.let { (res, args) ->
                        CatatanInfo(teks = stringResource(res, *args.toTypedArray()), status = MkStatus.LATE)
                    }
                }
                ui.galat?.let { CatatanInfo(teks = it, status = MkStatus.LATE) }
            }
        }
    }
}

@Composable
private fun PilihanRadio(label: String, petunjuk: String?, dipilih: Boolean, enabled: Boolean = true, onPilih: () -> Unit) {
    val warna = LocalMkColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = dipilih, enabled = enabled, role = Role.RadioButton, onClick = onPilih)
            .padding(vertical = MkSpacing.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        RadioButton(selected = dipilih, onClick = null, enabled = enabled)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = label, style = MkTypography.bodyStrong, color = if (enabled) warna.ink else warna.ink3)
            petunjuk?.let { Text(text = it, style = MkTypography.footnote, color = warna.ink2) }
        }
    }
}

@Composable
private fun LangkahIdentitas(w: StatusWizard, meja: MejaPerusahaanResponse) {
    val holdingList = meja.companies.filter { it.type == "HOLDING" }
    Column(modifier = Modifier.selectableGroup()) {
        PilihanRadio(
            label = stringResource(R.string.ent_saring_anak_perusahaan),
            petunjuk = stringResource(R.string.ent_wizard_jenis_pt_petunjuk),
            dipilih = !w.holding,
            enabled = holdingList.isNotEmpty(),
            onPilih = { w.holding = false },
        )
        PilihanRadio(
            label = stringResource(R.string.ent_saring_holding),
            petunjuk = stringResource(R.string.ent_wizard_jenis_holding_petunjuk),
            dipilih = w.holding,
            onPilih = {
                w.holding = true
            },
        )
    }
    MkField(nilai = w.nama, onUbah = { w.nama = it }, label = stringResource(R.string.ent_pengaturan_nama))
    if (!w.holding) {
        val opsi = holdingList.map { MkOpsi(it.id, it.name) }
        MkPilih(
            pilihan = opsi,
            terpilih = opsi.firstOrNull { it.value == w.induk },
            onPilih = { w.induk = it.value },
            label = stringResource(R.string.ent_wizard_induk),
        )
    }
    MkField(
        nilai = w.kodeTampil(),
        onUbah = {
            w.kode = it.uppercase()
            w.kodeDisentuh = true
        },
        label = stringResource(R.string.ent_wizard_kode),
        supportingText = stringResource(R.string.ent_wizard_kode_petunjuk),
    )
}

@Composable
private fun LangkahKontak(w: StatusWizard) {
    CatatanInfo(teks = stringResource(R.string.ent_pengaturan_logo_web))
    MkField(nilai = w.alamat, onUbah = { w.alamat = it }, label = stringResource(R.string.ent_pengaturan_alamat), baris = 2)
    MkField(nilai = w.telepon, onUbah = { w.telepon = it }, label = stringResource(R.string.ent_pengaturan_telepon), placeholder = "+62…")
    MkField(nilai = w.email, onUbah = { w.email = it }, label = stringResource(R.string.ent_pengaturan_email))
    MkField(nilai = w.situs, onUbah = { w.situs = it }, label = stringResource(R.string.ent_pengaturan_situs), placeholder = "https://")
}

@Composable
private fun LangkahPosisi(w: StatusWizard) {
    val warna = LocalMkColors.current
    val opsiPosisi = (if (w.holding) POSISI_PERUSAHAAN + POSISI_HOLDING else POSISI_PERUSAHAAN).map { MkOpsi(it.peran, it.label) }
    Text(text = stringResource(R.string.ent_wizard_posisi_catatan), style = MkTypography.footnote, color = warna.ink2)
    w.draf.forEachIndexed { i, d ->
        Kotak {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.ent_wizard_posisi_ke, i + 1),
                    style = MkTypography.bodyStrong,
                    color = warna.ink,
                    modifier = Modifier.weight(1f),
                )
                if (w.draf.size > 1) {
                    MkButton(
                        label = stringResource(R.string.ent_wizard_posisi_hapus),
                        onClick = { w.draf.remove(d) },
                        variant = MkButtonVariant.PLAIN,
                        size = MkButtonSize.S,
                    )
                }
            }
            MkPilih(
                pilihan = opsiPosisi,
                terpilih = opsiPosisi.firstOrNull { it.value == d.peran },
                onPilih = { d.peran = it.value },
                label = stringResource(R.string.ent_akun_posisi),
            )
            MkField(
                nilai = d.nama,
                onUbah = {
                    d.nama = it
                    if (!d.usernameDisentuh) d.username = slugify(it)
                },
                label = stringResource(R.string.ent_form_nama),
            )
            MkField(
                nilai = d.username,
                onUbah = {
                    d.username = it.lowercase()
                    d.usernameDisentuh = true
                },
                label = stringResource(R.string.ent_form_username),
            )
            MkField(
                nilai = d.sandi,
                onUbah = { d.sandi = it },
                label = stringResource(R.string.ent_form_sandi),
                supportingText = stringResource(R.string.ent_form_sandi_petunjuk_baru),
            )
            MkField(
                nilai = d.email,
                onUbah = { d.email = it },
                label = stringResource(R.string.ent_form_email),
                supportingText = if (d.email.isBlank()) stringResource(R.string.ent_form_email_bawaan, d.username.ifBlank { "username" }) else null,
            )
            MkField(nilai = d.jabatan, onUbah = { d.jabatan = it }, label = stringResource(R.string.ent_form_jabatan))
            if (d.peran == "KEPALA_DIVISI") {
                MkField(
                    nilai = d.namaDivisi,
                    onUbah = { d.namaDivisi = it },
                    label = stringResource(R.string.ent_wizard_nama_divisi),
                    supportingText = stringResource(R.string.ent_wizard_dibuat_otomatis),
                )
            }
            if (d.peran == "PIC_PROYEK") {
                MkField(
                    nilai = d.namaProyek,
                    onUbah = { d.namaProyek = it },
                    label = stringResource(R.string.ent_wizard_nama_proyek),
                    supportingText = stringResource(R.string.ent_wizard_dibuat_otomatis),
                )
            }
        }
    }
    MkButton(
        label = stringResource(R.string.ent_wizard_posisi_tambah),
        onClick = { w.draf.add(DrafPosisi(if (w.draf.any { it.peran == "ADMIN_PT" }) "KEPALA_DIVISI" else "ADMIN_PT")) },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun LangkahTinjau(w: StatusWizard, meja: MejaPerusahaanResponse) {
    val warna = LocalMkColors.current
    val induk = meja.companies.firstOrNull { it.id == w.induk }?.name
    Kotak {
        Text(text = w.nama.ifBlank { "—" }, style = MkTypography.headline, color = warna.ink)
        Text(
            text = listOfNotNull(
                stringResource(if (w.holding) R.string.ent_saring_holding else R.string.ent_saring_anak_perusahaan),
                w.kodeTampil().ifBlank { null },
                if (!w.holding) induk?.let { stringResource(R.string.ent_perusahaan_anak_dari, it) } else null,
            ).joinToString(" · "),
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        listOf(w.alamat, w.telepon, w.email, w.situs).filter { it.isNotBlank() }.forEach {
            Text(text = it, style = MkTypography.footnote, color = warna.ink2)
        }
    }
    Text(text = stringResource(R.string.ent_wizard_tinjau_akun, w.draf.size), style = MkTypography.bodyStrong, color = warna.ink)
    w.draf.forEachIndexed { i, d ->
        Column(modifier = Modifier.padding(vertical = MkSpacing.space1)) {
            Text(text = d.nama.ifBlank { "—" }, style = MkTypography.body, color = warna.ink)
            Text(
                text = listOf(labelPeran(d.peran), d.username).filter { it.isNotBlank() }.joinToString(" · "),
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
        if (i < w.draf.lastIndex) MkDivider()
    }
    w.langkahSalahPertama()?.let { salah ->
        val (res, args) = w.galat(salah).first()
        CatatanInfo(
            teks = stringResource(
                R.string.ent_wizard_langkah_belum_lengkap,
                stringResource(JUDUL_LANGKAH[salah]).lowercase(),
                stringResource(res, *args.toTypedArray()),
            ),
            status = MkStatus.RISK,
        )
    }
}

/** Serah terima: akun pertama beserta kata sandi awalnya untuk disampaikan langsung. */
@Composable
private fun HasilWizard(nama: String, akun: List<SerahTerimaAkun>) {
    val warna = LocalMkColors.current
    val salin = rememberSalinRahasia()
    val labelSalin = stringResource(R.string.ent_form_sandi_salin)
    var disalin by remember { mutableStateOf<Int?>(null) }
    StatusBadge(status = MkStatus.DONE, text = stringResource(R.string.ent_wizard_tersimpan_lencana))
    Text(text = stringResource(R.string.ent_wizard_tersimpan, nama, akun.size), style = MkTypography.title3, color = warna.ink)
    Text(text = stringResource(R.string.ent_akun_dibuat_sandi_catatan), style = MkTypography.footnote, color = warna.ink2)
    akun.forEachIndexed { i, d ->
        Kotak {
            Text(text = "${d.nama} · ${labelPeran(d.peran)}", style = MkTypography.bodyStrong, color = warna.ink)
            Text(text = d.username, style = MkTypography.code, color = warna.ink2)
            val sandi = d.sandi.nilai
            if (sandi.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SelectionContainer(modifier = Modifier.weight(1f)) {
                        Text(text = sandi, style = MkTypography.code, color = warna.ink)
                    }
                    MkIconBtn(
                        icon = Icons.Outlined.ContentCopy,
                        label = labelSalin,
                        onClick = {
                            salin(labelSalin, sandi)
                            disalin = i
                        },
                    )
                }
                if (disalin == i) Text(text = stringResource(R.string.ent_umum_disalin), style = MkTypography.footnote, color = warna.ink2)
            }
        }
    }
}
