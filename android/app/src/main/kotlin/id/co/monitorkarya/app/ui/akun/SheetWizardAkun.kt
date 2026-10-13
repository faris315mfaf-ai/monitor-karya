// Wizard "Tambah akun" / "Ubah data akun" meja akun Admin PT (BUG-03).
// Padanan web: AccountSheet/AccountForm (src/components/companies/
// account-sheet.tsx) — dipecah bertahap seperti SheetWizard feature/entitas:
// Identitas -> Posisi (divisi/proyek bila ada) -> Tinjau -> Buat, lalu serah
// terima sandi awal (tampil sekali, salin bertanda sensitif, tanpa log).
//
// Isian dipegang ViewModel (AkunViewModel.wizard) sehingga stabil saat rotasi
// dan saat permintaan berjalan. Galat langkah dan galat 4xx server tampil di
// footer tepat di atas tombol aksi (selalu terlihat, tidak tergulir).
package id.co.monitorkarya.app.ui.akun

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkField
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPilih
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography

/** Aksi wizard ke ViewModel. */
class AksiWizardAkun(
    val ubah: ((FormAkun) -> FormAkun) -> Unit = {},
    val lanjut: () -> Unit = {},
    val kembali: () -> Unit = {},
    /** Argumen = sedang luring. */
    val kirim: (Boolean) -> Unit = {},
    val tutup: () -> Unit = {},
)

@Composable
internal fun SheetWizardAkun(
    ui: WizardAkunUi,
    meja: MejaAkun?,
    luring: Boolean,
    aksi: AksiWizardAkun,
    onSalinSandi: (String) -> Unit,
) {
    val form = ui.form
    val hasil = ui.hasil
    val baru = form.mode == ModeFormAkun.BARU
    val peranBoleh = meja?.peranKelola.orEmpty()
    val galatLangkahIni = if (form.tampilkanGalat()) galatLangkah(form, form.langkah, peranBoleh) else emptyList()

    MkSheet(
        visible = true,
        onTutup = aksi.tutup,
        judul = when {
            hasil != null -> "Akun dibuat"
            baru -> "Tambah akun"
            else -> "Ubah data akun"
        },
        subjudul = if (hasil != null) {
            meja?.namaPt
        } else {
            "Langkah ${form.langkah.ordinal + 1} dari ${LangkahAkun.entries.size} · ${form.langkah.judul}"
        },
        backLabel = "Akun",
        footer = {
            FooterWizard(
                ui = ui,
                luring = luring,
                galatLangkah = galatLangkahIni.firstOrNull()?.pesan,
                aksi = aksi,
                modifier = Modifier.weight(1f),
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            if (hasil != null) {
                HasilSerahTerima(hasil = hasil, namaPt = meja?.namaPt, onSalin = onSalinSandi)
            } else {
                val galat = galatLangkahIni.associate { it.medan to it.pesan }
                when (form.langkah) {
                    LangkahAkun.IDENTITAS -> LangkahIdentitas(form, galat, aksi.ubah)
                    LangkahAkun.POSISI -> LangkahPosisi(form, meja, galat, aksi.ubah)
                    LangkahAkun.TINJAU -> LangkahTinjau(form, meja)
                }
            }
        }
    }
}

/** Galat + catatan luring + tombol; berada di footer sheet supaya selalu terlihat. */
@Composable
private fun FooterWizard(
    ui: WizardAkunUi,
    luring: Boolean,
    galatLangkah: String?,
    aksi: AksiWizardAkun,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    val form = ui.form
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        if (ui.hasil == null) {
            val galat = ui.galat ?: galatLangkah
            if (galat != null) {
                Text(
                    text = galat,
                    style = MkTypography.footnote,
                    color = warna.statusLate,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            } else if (luring && form.langkah == LangkahAkun.TINJAU) {
                Text(
                    text = "Anda sedang luring. Akun hanya bisa dibuat atau diubah saat daring.",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            if (ui.hasil != null) {
                MkButton(
                    label = "Selesai",
                    onClick = aksi.tutup,
                    variant = MkButtonVariant.PRIMARY,
                    modifier = Modifier.weight(1f),
                )
                return@Row
            }
            if (form.langkah.ordinal > 0) {
                MkButton(
                    label = "Kembali",
                    onClick = aksi.kembali,
                    variant = MkButtonVariant.SECONDARY,
                    enabled = !ui.sibuk,
                    modifier = Modifier.weight(1f),
                )
            } else {
                MkButton(
                    label = "Batal",
                    onClick = aksi.tutup,
                    variant = MkButtonVariant.SECONDARY,
                    enabled = !ui.sibuk,
                    modifier = Modifier.weight(1f),
                )
            }
            if (form.langkah != LangkahAkun.TINJAU) {
                MkButton(
                    label = "Lanjut",
                    onClick = aksi.lanjut,
                    variant = MkButtonVariant.PRIMARY,
                    modifier = Modifier.weight(1f),
                )
            } else {
                val baru = form.mode == ModeFormAkun.BARU
                MkButton(
                    label = when {
                        ui.sibuk && baru -> "Membuat…"
                        ui.sibuk -> "Menyimpan…"
                        baru -> "Buat akun"
                        else -> "Simpan perubahan"
                    },
                    onClick = { aksi.kirim(luring) },
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !ui.sibuk && !luring,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

// ------------------------------------------------------------------
// Langkah
// ------------------------------------------------------------------

@Composable
private fun LangkahIdentitas(
    form: FormAkun,
    galat: Map<MedanAkun, String>,
    ubah: ((FormAkun) -> FormAkun) -> Unit,
) {
    MkField(
        nilai = form.nama,
        onUbah = { n -> ubah { it.denganNama(n) } },
        label = "Nama lengkap",
        placeholder = "Nama sesuai identitas",
        isError = MedanAkun.NAMA in galat,
        supportingText = galat[MedanAkun.NAMA],
    )
    MkField(
        nilai = form.username,
        onUbah = { u -> ubah { it.denganUsername(u) } },
        label = "Username",
        placeholder = "otomatis dari nama",
        isError = MedanAkun.USERNAME in galat,
        supportingText = galat[MedanAkun.USERNAME] ?: "Dipakai untuk masuk.",
    )
    MkField(
        nilai = form.email,
        onUbah = { e -> ubah { it.copy(email = e) } },
        label = "Email",
        isError = MedanAkun.EMAIL in galat,
        supportingText = galat[MedanAkun.EMAIL] ?: if (form.mode == ModeFormAkun.BARU && form.email.isBlank()) {
            "Kosongkan untuk ${form.username.ifBlank { "username" }}@karya.co.id"
        } else {
            null
        },
    )
    MkField(
        nilai = form.jabatan,
        onUbah = { j -> ubah { it.copy(jabatan = j) } },
        label = "Jabatan",
        placeholder = labelPosisi(form.peran).takeIf { form.peran.isNotBlank() },
        isError = MedanAkun.JABATAN in galat,
        supportingText = galat[MedanAkun.JABATAN] ?: "Sebutan di profil, mis. Manager Operasional.",
    )
    MkField(
        nilai = form.telepon,
        onUbah = { t -> ubah { it.copy(telepon = t) } },
        label = "Telepon",
        placeholder = "+62…",
        isError = MedanAkun.TELEPON in galat,
        supportingText = galat[MedanAkun.TELEPON],
    )
}

@Composable
private fun LangkahPosisi(
    form: FormAkun,
    meja: MejaAkun?,
    galat: Map<MedanAkun, String>,
    ubah: ((FormAkun) -> FormAkun) -> Unit,
) {
    val warna = LocalMkColors.current
    val opsi = posisiBoleh(meja?.peranKelola.orEmpty())
    val baru = form.mode == ModeFormAkun.BARU
    Text(text = "Posisi", style = MkTypography.title3, color = warna.ink)
    Column(modifier = Modifier.selectableGroup()) {
        opsi.forEach { o ->
            PilihanPosisi(opsi = o, dipilih = form.peran == o.peran, onPilih = { ubah { it.denganPeran(o.peran) } })
        }
    }
    galat[MedanAkun.PERAN]?.let { Text(text = it, style = MkTypography.footnote, color = warna.statusLate) }
    if (opsi.size < OPSI_POSISI.size) {
        Text(
            text = "Posisi Direktur perusahaan hanya dapat dibuat Super Admin.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
    }

    if (meja != null && form.peran == "KEPALA_DIVISI") {
        val pilihan = buildList {
            add(MkOpsi("", if (baru) "Belum ditentukan" else "Tidak diubah"))
            meja.divisi.forEach { d ->
                add(MkOpsi(d.id, d.nama + (d.namaKepala?.let { " (kini: $it)" } ?: " (belum ada kepala)")))
            }
            add(MkOpsi(PILIH_BARU, "Divisi baru…"))
        }
        MkPilih(
            pilihan = pilihan,
            terpilih = pilihan.firstOrNull { it.value == form.divisi },
            onPilih = { o -> ubah { it.copy(divisi = o.value) } },
            label = "Divisi yang dipimpin",
        )
        if (form.divisi == PILIH_BARU) {
            MkField(
                nilai = form.namaDivisiBaru,
                onUbah = { n -> ubah { it.copy(namaDivisiBaru = n) } },
                label = "Nama divisi baru",
                placeholder = "mis. Keuangan",
                isError = MedanAkun.DIVISI_BARU in galat,
                supportingText = galat[MedanAkun.DIVISI_BARU],
            )
        }
        Text(
            text = "Kepala divisi menyerahkan capaian mingguan divisinya.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
    }

    if (meja != null && form.peran == "PIC_PROYEK") {
        val pilihan = buildList {
            add(MkOpsi("", if (baru) "Belum ditentukan" else "Tidak diubah"))
            meja.proyek.forEach { p ->
                add(MkOpsi(p.id, p.nama + (p.namaPic?.let { " (kini: $it)" } ?: " (belum ada manager)")))
            }
            add(MkOpsi(PILIH_BARU, "Proyek baru…"))
        }
        MkPilih(
            pilihan = pilihan,
            terpilih = pilihan.firstOrNull { it.value == form.proyek },
            onPilih = { o -> ubah { it.copy(proyek = o.value) } },
            label = "Proyek yang dipegang",
        )
        if (form.proyek == PILIH_BARU) {
            MkField(
                nilai = form.namaProyekBaru,
                onUbah = { n -> ubah { it.copy(namaProyekBaru = n) } },
                label = "Nama proyek baru",
                isError = MedanAkun.PROYEK_BARU in galat,
                supportingText = galat[MedanAkun.PROYEK_BARU],
            )
        }
        Text(
            text = "Manager proyek mengirim laporan harian proyek ini.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
    }

    // Keanggotaan divisi hanya saat membuat akun (ubah: tidak disentuh).
    if (baru && meja != null && meja.tipePt != "HOLDING" && meja.divisi.isNotEmpty()) {
        val pilihan = listOf(MkOpsi("", "Tanpa divisi")) + meja.divisi.map { MkOpsi(it.id, it.nama) }
        MkPilih(
            pilihan = pilihan,
            terpilih = pilihan.firstOrNull { it.value == form.anggotaDivisi },
            onPilih = { o -> ubah { it.copy(anggotaDivisi = o.value) } },
            label = "Anggota divisi",
        )
        Text(
            text = "Dipakai menghitung kepatuhan laporan per divisi dan tim kepala divisi.",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
    }
}

@Composable
private fun PilihanPosisi(opsi: OpsiPosisi, dipilih: Boolean, onPilih: () -> Unit) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = dipilih, role = Role.RadioButton, onClick = onPilih)
            .padding(vertical = MkSpacing.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        RadioButton(
            selected = dipilih,
            onClick = null,
            colors = RadioButtonDefaults.colors(selectedColor = aksen.fill, unselectedColor = warna.ink2),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = opsi.label, style = MkTypography.bodyStrong, color = warna.ink)
            Text(text = opsi.petunjuk, style = MkTypography.footnote, color = warna.ink2)
        }
    }
}

@Composable
private fun LangkahTinjau(form: FormAkun, meja: MejaAkun?) {
    val warna = LocalMkColors.current
    val baru = form.mode == ModeFormAkun.BARU
    val username = form.username.trim().lowercase()
    val divisi = when (form.divisi) {
        "" -> null
        PILIH_BARU -> form.namaDivisiBaru.trim().ifEmpty { null }?.let { "$it (baru)" }
        else -> meja?.divisi?.firstOrNull { it.id == form.divisi }?.nama
    }
    val proyek = when (form.proyek) {
        "" -> null
        PILIH_BARU -> form.namaProyekBaru.trim().ifEmpty { null }?.let { "$it (baru)" }
        else -> meja?.proyek?.firstOrNull { it.id == form.proyek }?.nama
    }
    val baris = buildList {
        add("Nama" to form.nama.trim())
        add("Username" to username)
        add("Email" to form.email.trim().lowercase().ifEmpty { "$username@karya.co.id (otomatis)" })
        form.jabatan.trim().takeIf { it.isNotEmpty() }?.let { add("Jabatan" to it) }
        form.telepon.trim().takeIf { it.isNotEmpty() }?.let { add("Telepon" to it) }
        add("Posisi" to labelPosisi(form.peran))
        if (form.peran == "KEPALA_DIVISI") add("Divisi dipimpin" to (divisi ?: if (baru) "Belum ditentukan" else "Tidak diubah"))
        if (form.peran == "PIC_PROYEK") add("Proyek dipegang" to (proyek ?: if (baru) "Belum ditentukan" else "Tidak diubah"))
        if (baru && form.anggotaDivisi.isNotEmpty()) {
            meja?.divisi?.firstOrNull { it.id == form.anggotaDivisi }?.let { add("Anggota divisi" to it.nama) }
        }
        meja?.namaPt?.let { add("Perusahaan" to it) }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.fill1)
            .padding(MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        baris.forEachIndexed { i, (label, nilai) ->
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                Text(
                    text = label,
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    modifier = Modifier.weight(0.4f),
                )
                Text(
                    text = nilai,
                    style = MkTypography.body,
                    color = warna.ink,
                    modifier = Modifier.weight(0.6f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (i < baris.lastIndex) MkDivider()
        }
    }
    Text(
        text = if (baru) {
            "Kata sandi awal dibuat acak dan tampil sekali setelah akun dibuat. " +
                "Pemegang akun wajib menggantinya saat masuk pertama."
        } else {
            "Hanya isian yang berubah yang dikirim. Kata sandi tidak berubah; gunakan Setel ulang kata sandi bila perlu."
        },
        style = MkTypography.footnote,
        color = warna.ink2,
    )
}

/** Serah terima: username + sandi awal, tampil sekali, salin bertanda sensitif. */
@Composable
private fun HasilSerahTerima(hasil: HasilAkunBaru, namaPt: String?, onSalin: (String) -> Unit) {
    val warna = LocalMkColors.current
    val sandi = hasil.sandi.nilai
    StatusBadge(status = MkStatus.DONE, text = "Akun dibuat")
    Text(
        text = "Akun ${hasil.nama} (${labelPosisi(hasil.peran)}) dibuat" + (namaPt?.let { " di $it" } ?: "") + ".",
        style = MkTypography.body,
        color = warna.ink,
    )
    Text(
        text = "Sampaikan username dan kata sandi ini langsung kepada pemegang akun. " +
            "Ia wajib mengganti kata sandi saat masuk pertama.",
        style = MkTypography.footnote,
        color = warna.ink2,
    )
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(text = "Username", style = MkTypography.footnote, color = warna.ink2)
        KotakNilai(teks = hasil.username)
    }
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
        Text(text = "Kata sandi awal", style = MkTypography.footnote, color = warna.ink2)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            // Tanpa SelectionContainer: salinan hanya lewat tombol (bertanda sensitif).
            KotakNilai(teks = sandi, modifier = Modifier.weight(1f))
            MkIconBtn(icon = Icons.Outlined.ContentCopy, label = "Salin kata sandi", onClick = { onSalin(sandi) })
        }
    }
    Text(
        text = "Kata sandi ini hanya tampil sekarang. Setelah lembar ini ditutup, gunakan Setel ulang kata sandi bila perlu.",
        style = MkTypography.footnote,
        color = warna.ink2,
    )
}

@Composable
private fun KotakNilai(teks: String, modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = warna.fill1)
            .padding(MkSpacing.space3),
    ) {
        Text(text = teks, style = MkTypography.code, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
