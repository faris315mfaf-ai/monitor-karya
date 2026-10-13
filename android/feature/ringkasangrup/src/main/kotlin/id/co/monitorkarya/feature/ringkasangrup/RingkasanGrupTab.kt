// Tab Ringkasan pemantau grup (Fase 3, keputusan pemilik 8 Okt 2026) — paritas
// web oversight-dashboard.tsx → management-dashboard.tsx + company-reports.tsx
// + management-charts.tsx untuk MANAJEMEN, DIREKTUR_ENTITAS, DIREKTUR_SDM_GA,
// AUDITOR, TI, SUPERADMIN. Urutan layar: satu kalimat jawaban → maks 4 KPI →
// Laporan per perusahaan (Sheet drill-down perusahaan → proyek → laporan +
// eskalasi) → grafik. Tata letak adaptif lewat BoxWithConstraints (modul tidak
// memuat material3-adaptive): ≥600dp dua kolom kartu + 2 kolom kartu PT,
// ≥840dp 3 kolom kartu PT. Baca-saja: tidak ada tombol tulis.
package id.co.monitorkarya.feature.ringkasangrup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.status.KEPATUHAN_BAIK_MIN
import id.co.monitorkarya.designsystem.components.ActivityItem
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkDivisionBar
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkPenandaTersimpan
import id.co.monitorkarya.designsystem.components.MkSegmentedControl
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.nadaDivisi
import id.co.monitorkarya.designsystem.components.nadaDivisiCerah
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.ringkasangrup.data.GrafikManajemenDto
import id.co.monitorkarya.feature.ringkasangrup.data.HalamanInsidenDto
import id.co.monitorkarya.feature.ringkasangrup.data.PetaKepatuhanDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.TrenKpiDto
import id.co.monitorkarya.feature.ringkasangrup.grafik.DataBatang
import id.co.monitorkarya.feature.ringkasangrup.grafik.GrafikBatang
import id.co.monitorkarya.feature.ringkasangrup.grafik.GrafikDonat
import id.co.monitorkarya.feature.ringkasangrup.grafik.GrafikTren
import id.co.monitorkarya.feature.ringkasangrup.grafik.LegendaPetaPanas
import id.co.monitorkarya.feature.ringkasangrup.grafik.PetaPanas
import id.co.monitorkarya.feature.ringkasangrup.grafik.SegmenDonat
import id.co.monitorkarya.feature.ringkasangrup.grafik.keMk
import id.co.monitorkarya.feature.ringkasangrup.logika.FormatWib
import id.co.monitorkarya.feature.ringkasangrup.logika.KelompokPerusahaan
import id.co.monitorkarya.feature.ringkasangrup.logika.MetrikKpi
import id.co.monitorkarya.feature.ringkasangrup.logika.StatusRingkas
import id.co.monitorkarya.feature.ringkasangrup.logika.TARGET_TEPAT_WAKTU
import id.co.monitorkarya.feature.ringkasangrup.logika.barisMingguan
import id.co.monitorkarya.feature.ringkasangrup.logika.deltaProgres
import id.co.monitorkarya.feature.ringkasangrup.logika.hitungStatus
import id.co.monitorkarya.feature.ringkasangrup.logika.jumlahPersetujuan
import id.co.monitorkarya.feature.ringkasangrup.logika.kalimatJawaban
import id.co.monitorkarya.feature.ringkasangrup.logika.kalimatKritis
import id.co.monitorkarya.feature.ringkasangrup.logika.kalimatPendukung
import id.co.monitorkarya.feature.ringkasangrup.logika.kelompokPerusahaan
import id.co.monitorkarya.feature.ringkasangrup.logika.kinerjaDivisi
import id.co.monitorkarya.feature.ringkasangrup.logika.kinerjaPerusahaan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelCakupan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelSiklus
import id.co.monitorkarya.feature.ringkasangrup.logika.labelStatusProyek
import id.co.monitorkarya.feature.ringkasangrup.logika.lencanaPerusahaan
import id.co.monitorkarya.feature.ringkasangrup.logika.nilaiMetrik
import id.co.monitorkarya.feature.ringkasangrup.logika.persen
import id.co.monitorkarya.feature.ringkasangrup.logika.rataProgres
import id.co.monitorkarya.feature.ringkasangrup.logika.ratakanPeta
import id.co.monitorkarya.feature.ringkasangrup.logika.statusDonatHarian
import id.co.monitorkarya.feature.ringkasangrup.logika.pitaKepatuhan
import java.time.ZonedDateTime
import kotlin.math.roundToInt

/** Titik masuk tab Ringkasan peran pemantau grup (dipasang MKShell oleh parent). */
@Composable
fun RingkasanGrupTab(peran: Peran, modifier: Modifier = Modifier) {
    val vm: RingkasanGrupViewModel = hiltViewModel()
    LaunchedEffect(peran) { vm.mulai(peran) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    RingkasanGrupIsi(
        ui = ui,
        aksi = AksiRingkasan(
            muatUlang = vm::muatUlang,
            bukaPerusahaan = vm::bukaPerusahaan,
            bukaProyek = vm::bukaProyek,
            kembali = vm::kembali,
            tutupSheet = vm::tutupSheet,
            ulangLaporan = vm::ulangLaporan,
            pilihMetrik = vm::pilihMetrik,
            pilihTitikTren = vm::pilihTitikTren,
            pilihBatangMinggu = vm::pilihBatangMinggu,
        ),
        modifier = modifier,
    )
}

/** Kumpulan aksi layar supaya versi state-murni mudah dipratinjau. */
data class AksiRingkasan(
    val muatUlang: () -> Unit = {},
    val bukaPerusahaan: (String) -> Unit = {},
    val bukaProyek: (String) -> Unit = {},
    val kembali: () -> Unit = {},
    val tutupSheet: () -> Unit = {},
    val ulangLaporan: () -> Unit = {},
    val pilihMetrik: (MetrikKpi) -> Unit = {},
    val pilihTitikTren: (Int) -> Unit = {},
    val pilihBatangMinggu: (Int) -> Unit = {},
)

private val LEBAR_DUA_KOLOM = 600.dp
private val LEBAR_TIGA_KOLOM = 840.dp

/** Versi state-murni layar. */
@Composable
fun RingkasanGrupIsi(
    ui: RingkasanGrupUi,
    aksi: AksiRingkasan,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val duaKolom = maxWidth >= LEBAR_DUA_KOLOM
        val kolomPt = when {
            maxWidth >= LEBAR_TIGA_KOLOM -> 3
            duaKolom -> 2
            else -> 1
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // Margin samping layar 12dp (aturan desain Android).
                .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
        ) {
            if (!ui.pemantau) {
                EmptyNote(teks = stringResource(R.string.rg_bukan_pemantau))
                return@Column
            }
            // B6: isi dari potret Room (server tak terjangkau) selalu ditandai.
            ui.tersimpanPada?.let { MkPenandaTersimpan(tersimpanPadaMs = it) }
            when (val r = ui.ringkasan) {
                Bagian.Memuat -> KerangkaRingkasan(duaKolom)
                is Bagian.Galat -> ErrorNote(
                    pesan = stringResource(R.string.rg_galat_ringkasan) + " " + r.pesan,
                    onCobaLagi = aksi.muatUlang,
                )
                is Bagian.Ditolak -> EmptyNote(teks = r.pesan)
                is Bagian.Siap -> IsiRingkasan(r.data, ui, aksi, duaKolom, kolomPt)
            }

            JudulBagian(stringResource(R.string.rg_grafik_judul))
            Text(
                text = stringResource(R.string.rg_grafik_catatan),
                style = MkTypography.footnote,
                color = LocalMkColors.current.ink2,
            )
            Pasangan(
                duaKolom,
                kiri = { KartuTrenKpi(ui.tren, ui, aksi) },
                kanan = { KartuStatusHarian(ui.grafik, aksi) },
            )
            Pasangan(
                duaKolom,
                kiri = { KartuSubHolding(ui.grafik, aksi) },
                kanan = { KartuUmurEskalasi(ui.grafik, aksi) },
            )
            Pasangan(
                duaKolom,
                kiri = { KartuMingguan(ui.grafik, aksi) },
                kanan = { KartuInsiden(ui.insiden, aksi) },
            )
            KartuPeta(ui.peta, aksi)
            KartuPtTerendah(ui.grafik, aksi, duaKolom)
        }

        val ringkasan = (ui.ringkasan as? Bagian.Siap)?.data
        if (ringkasan != null) {
            SheetDrillDown(
                ringkasan = ringkasan,
                sheet = ui.sheet,
                laporan = ui.laporanProyek,
                aksi = aksi,
            )
        }
    }
}

// ------------------------------------------------------------------
// Bagian ringkasan (/api/ringkasan)
// ------------------------------------------------------------------

@Composable
private fun IsiRingkasan(
    d: RingkasanGrupDto,
    ui: RingkasanGrupUi,
    aksi: AksiRingkasan,
    duaKolom: Boolean,
    kolomPt: Int,
) {
    val warna = LocalMkColors.current
    // Kepala: konteks + judul + satu kalimat jawaban + pendukung.
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MkSpacing.space1)) {
            Text(
                text = "${labelCakupan(d)} · ${FormatWib.tanggalPanjang(ZonedDateTime.now(FormatWib.WIB))}",
                style = MkTypography.footnote,
                color = warna.ink2,
            )
            Text(
                text = stringResource(R.string.rg_judul),
                style = MkTypography.title1,
                color = warna.ink,
                modifier = Modifier.semantics { heading() },
            )
        }
        MkIconBtn(icon = Icons.Outlined.Refresh, label = stringResource(R.string.rg_muat_ulang), onClick = aksi.muatUlang)
    }
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.rg_eyebrow), style = MkTypography.footnote, color = warna.ink2)
        Text(kalimatJawaban(d), style = MkTypography.title3, color = warna.ink, modifier = Modifier.padding(top = 4.dp))
        Text(kalimatPendukung(d), style = MkTypography.body, color = warna.ink2, modifier = Modifier.padding(top = 4.dp))
    }

    KpiRingkasan(d, duaKolom)

    JudulBagian(stringResource(R.string.rg_laporan_perusahaan))
    GridPerusahaan(kelompokPerusahaan(d.projects), kolomPt, aksi.bukaPerusahaan)

    Pasangan(
        duaKolom,
        kiri = { KartuStatusProyek(d) },
        kanan = { KartuTrenMinggu(d, ui.batangMinggu, aksi.pilihBatangMinggu) },
    )
    Pasangan(
        duaKolom,
        kiri = { KartuKinerja(d) },
        kanan = { KartuAktivitas(d) },
    )
}

/** Maks 4 KPI (aturan desain). Ponsel 2×2, tablet satu baris. */
@Composable
private fun KpiRingkasan(d: RingkasanGrupDto, duaKolom: Boolean) {
    val setuju = jumlahPersetujuan(d)
    val ubin: List<@Composable (Modifier) -> Unit> = listOf(
        { m ->
            StatTile(
                modifier = m,
                label = stringResource(R.string.rg_kpi_progres),
                value = "${rataProgres(d.projects)}%",
                delta = deltaProgres(d),
                tone = MkStatus.NEUTRAL,
            )
        },
        { m ->
            StatTile(
                modifier = m,
                label = stringResource(R.string.rg_kpi_tepat),
                value = "${d.daily.onTime30Pct}%",
                delta = "${FormatWib.angka(d.daily.onTime30)} dari ${FormatWib.angka(d.daily.total30)} laporan",
                tone = if (d.daily.onTime30Pct >= TARGET_TEPAT_WAKTU) MkStatus.ON else MkStatus.RISK,
            )
        },
        { m ->
            StatTile(
                modifier = m,
                label = stringResource(R.string.rg_kpi_harian),
                value = "${persen(d.daily.submitted, d.daily.expected)}%",
                delta = "${FormatWib.angka(d.daily.submitted)} dari ${FormatWib.angka(d.daily.expected)} proyek",
                tone = if (d.daily.expected > 0 && d.daily.submitted >= d.daily.expected) MkStatus.ON else MkStatus.NEUTRAL,
            )
        },
        { m ->
            StatTile(
                modifier = m,
                label = stringResource(R.string.rg_kpi_keputusan),
                value = setuju,
                delta = "${FormatWib.angka(d.escalations.size)} eskalasi terbuka",
                tone = if (setuju > 0 || d.escalations.isNotEmpty()) MkStatus.RISK else MkStatus.ON,
            )
        },
    )
    if (duaKolom) {
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            ubin.forEach { it(Modifier.weight(1f)) }
        }
    } else {
        ubin.chunked(2).forEach { baris ->
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                baris.forEach { it(Modifier.weight(1f)) }
            }
        }
    }
}

/** Kartu perusahaan (ponsel 1, tablet 2, lebar 3 kolom). */
@Composable
private fun GridPerusahaan(daftar: List<KelompokPerusahaan>, kolom: Int, onBuka: (String) -> Unit) {
    val warna = LocalMkColors.current
    if (daftar.isEmpty()) {
        EmptyNote(teks = stringResource(R.string.rg_kosong_proyek))
        return
    }
    Text(
        text = "${FormatWib.angka(daftar.size)} perusahaan · ketuk untuk membaca laporan hariannya",
        style = MkTypography.body,
        color = warna.ink2,
    )
    daftar.chunked(kolom).forEach { baris ->
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            baris.forEach { k ->
                val lencana = lencanaPerusahaan(k.lapor, k.total)
                MkCard(
                    modifier = Modifier.weight(1f),
                    padding = MkSpacing.space4,
                    onClick = { onBuka(k.entityId) },
                ) {
                    Text(k.nama, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${FormatWib.angka(k.total)} proyek", style = MkTypography.footnote, color = warna.ink2)
                    Text(
                        "${FormatWib.angka(k.lapor)} dari ${FormatWib.angka(k.total)} proyek lapor hari ini",
                        style = MkTypography.footnote,
                        color = warna.ink2,
                    )
                    StatusBadge(
                        status = lencana.status.keMk(),
                        size = MkBadgeSize.SM,
                        text = lencana.label,
                        modifier = Modifier.padding(top = MkSpacing.space2),
                    )
                }
            }
            repeat(kolom - baris.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}

@Composable
private fun KartuStatusProyek(d: RingkasanGrupDto) {
    KartuGrafik(stringResource(R.string.rg_status_proyek), stringResource(R.string.rg_status_proyek_tanya)) {
        val hitung = hitungStatus(d.projects)
        if (d.projects.isEmpty()) {
            EmptyNote(teks = stringResource(R.string.rg_kosong_proyek))
        } else {
            GrafikDonat(
                segmen = hitung.map { (s, n) -> SegmenDonat(labelStatusProyek(s), n, warnaDonatProyek(s)) },
                judulAksesibel = stringResource(R.string.rg_status_proyek),
                subTengah = "proyek",
                ukuran = 140.dp,
            )
        }
    }
}

@Composable
private fun KartuTrenMinggu(d: RingkasanGrupDto, terpilih: Int?, onPilih: (Int) -> Unit) {
    KartuGrafik(stringResource(R.string.rg_tren_minggu), stringResource(R.string.rg_tren_minggu_tanya)) {
        val tren = d.trend
        if (tren.isEmpty() || tren.all { it.submitted == 0 }) {
            EmptyNote(teks = stringResource(R.string.rg_kosong_tren_minggu))
        } else {
            val idx = (terpilih ?: tren.lastIndex).coerceIn(0, tren.lastIndex)
            val t = tren[idx]
            AngkaTerpilih(
                angka = FormatWib.angka(t.submitted),
                keterangan = "${t.label} · ${t.onTimePct}% tepat waktu",
            )
            GrafikBatang(
                data = tren.map { DataBatang(it.label, it.submitted.toDouble(), FormatWib.angka(it.submitted)) },
                judulAksesibel = stringResource(R.string.rg_tren_minggu),
                terpilih = idx,
                onPilih = onPilih,
                tinggi = 170.dp,
            )
        }
    }
}

@Composable
private fun KartuKinerja(d: RingkasanGrupDto) {
    val divisi = kinerjaDivisi(d.divisions)
    if (divisi.isNotEmpty()) {
        KartuGrafik(stringResource(R.string.rg_kinerja_divisi), stringResource(R.string.rg_kinerja_divisi_tanya)) {
            DaftarBatang(divisi.take(8).map { Triple(it.nama, it.pct, it.meta) }, TARGET_TEPAT_WAKTU)
        }
    } else {
        val pt = kinerjaPerusahaan(d)
        KartuGrafik(stringResource(R.string.rg_tepat_perusahaan), stringResource(R.string.rg_tepat_perusahaan_tanya)) {
            if (pt.isEmpty()) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_tepat))
            } else {
                DaftarBatang(pt.take(8).map { Triple(it.nama, it.pct, it.meta) }, TARGET_TEPAT_WAKTU)
            }
        }
    }
}

@Composable
private fun DaftarBatang(baris: List<Triple<String, Int, String>>, target: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
        baris.forEachIndexed { i, (nama, nilai, meta) ->
            MkDivisionBar(
                nama = nama,
                nilai = nilai,
                nada = nadaDivisi(i),
                nadaAwal = nadaDivisiCerah(i),
                target = target,
                meta = meta,
            )
        }
    }
}

@Composable
private fun KartuAktivitas(d: RingkasanGrupDto) {
    KartuGrafik(stringResource(R.string.rg_aktivitas), null) {
        if (d.activity.isEmpty()) {
            EmptyNote(teks = stringResource(R.string.rg_kosong_aktivitas))
        } else {
            d.activity.forEachIndexed { i, a ->
                ActivityItem(
                    who = a.who,
                    action = a.text,
                    waktu = FormatWib.relatif(a.at),
                    terakhir = i == d.activity.lastIndex,
                )
            }
        }
    }
}

// ------------------------------------------------------------------
// Grafik kepatuhan grup (/api/management-charts, kpi-trends, compliance-map, late-incidents)
// ------------------------------------------------------------------

@Composable
private fun KartuTrenKpi(bagian: Bagian<TrenKpiDto>, ui: RingkasanGrupUi, aksi: AksiRingkasan) {
    KartuGrafik(stringResource(R.string.rg_tren_kpi), stringResource(R.string.rg_tren_kpi_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            val bulan = data.months
            if (bulan.isEmpty() || bulan.all { it.totalEntities == 0 }) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_tren_kpi))
                return@IsiBagian
            }
            MkSegmentedControl(
                options = MetrikKpi.entries.map { MkOpsi(value = it.name, label = it.label) },
                terpilih = ui.metrik.name,
                onPilih = { v -> MetrikKpi.entries.firstOrNull { it.name == v }?.let(aksi.pilihMetrik) },
            )
            val idx = (ui.titikTren ?: bulan.lastIndex).coerceIn(0, bulan.lastIndex)
            val nilai = bulan.map { nilaiMetrik(it, ui.metrik) }
            AngkaTerpilih(
                angka = FormatWib.desimal(nilai[idx]),
                keterangan = "${ui.metrik.label} · ${bulan[idx].label}",
            )
            GrafikTren(
                label = bulan.map { it.label },
                nilai = nilai,
                pembanding = if (ui.metrik == MetrikKpi.KEPATUHAN) null else bulan.map { it.avgCompliance },
                labelPembanding = MetrikKpi.KEPATUHAN.label,
                judulAksesibel = "${stringResource(R.string.rg_tren_kpi)}, ${ui.metrik.label}",
                teksNilai = { FormatWib.desimal(it) },
                terpilih = idx,
                onPilih = aksi.pilihTitikTren,
            )
        }
    }
}

@Composable
private fun KartuStatusHarian(bagian: Bagian<GrafikManajemenDto>, aksi: AksiRingkasan) {
    KartuGrafik(stringResource(R.string.rg_status_harian), stringResource(R.string.rg_status_harian_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            if (data.dailyStatus.sumOf { it.jumlah } == 0) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_status_harian))
            } else {
                GrafikDonat(
                    segmen = data.dailyStatus.map {
                        SegmenDonat(it.label, it.jumlah, warnaStatus(statusDonatHarian(it.status).keMk()))
                    },
                    judulAksesibel = stringResource(R.string.rg_status_harian),
                    subTengah = "laporan",
                    ukuran = 140.dp,
                )
            }
        }
    }
}

@Composable
private fun KartuSubHolding(bagian: Bagian<GrafikManajemenDto>, aksi: AksiRingkasan) {
    KartuGrafik(stringResource(R.string.rg_sub_holding), stringResource(R.string.rg_sub_holding_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            if (data.bySubHolding.isEmpty()) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_sub_holding))
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
                    data.bySubHolding.forEach { b ->
                        BatangSkor(
                            nama = b.name,
                            skor = b.skor,
                            meta = "${FormatWib.angka(b.jumlahPt)} PT · ${pitaKepatuhan(b.skor).label}",
                        )
                    }
                }
            }
        }
    }
}

/**
 * DivisionBar skor kepatuhan — warna dari pita tunggal (Baik hijau, Perlu
 * perhatian oranye, Kritis merah; KEPUTUSAN-AMBANG-KEPATUHAN.md) sama dengan
 * peta, garis target = 90 (ambang Baik). Kata pita tertulis di [meta].
 */
@Composable
private fun BatangSkor(nama: String, skor: Double, meta: String) {
    val nada = warnaStatus(pitaKepatuhan(skor).status.keMk())
    MkDivisionBar(
        nama = nama,
        nilai = skor.roundToInt(),
        nada = nada,
        nadaAwal = nada,
        target = KEPATUHAN_BAIK_MIN,
        meta = meta,
    )
}

@Composable
private fun KartuUmurEskalasi(bagian: Bagian<GrafikManajemenDto>, aksi: AksiRingkasan) {
    val warna = LocalMkColors.current
    KartuGrafik(stringResource(R.string.rg_umur_eskalasi), stringResource(R.string.rg_umur_eskalasi_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            GrafikBatang(
                data = data.escalationAging.map {
                    val n = it.dalamSla + it.lewatSla
                    DataBatang(it.bucket, n.toDouble(), FormatWib.angka(n))
                },
                judulAksesibel = stringResource(R.string.rg_umur_eskalasi),
                terpilih = data.escalationAging.indexOfLast { it.lewatSla > 0 },
                tinggi = 170.dp,
            )
            val r = data.ringkasan
            if (r.eskalasiLewatSla > 0) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = MkSpacing.space3)) {
                    Icon(
                        Icons.Outlined.Warning,
                        contentDescription = null,
                        tint = warna.statusLate,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "${r.eskalasiLewatSla} dari ${r.eskalasiTerbuka} eskalasi sudah melewati SLA dan menunggu keputusan Anda.",
                        style = MkTypography.footnote,
                        color = warna.statusLate,
                        modifier = Modifier.padding(start = MkSpacing.space2),
                    )
                }
            } else {
                Text(
                    text = stringResource(R.string.rg_eskalasi_aman),
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    modifier = Modifier.padding(top = MkSpacing.space3),
                )
            }
        }
    }
}

@Composable
private fun KartuMingguan(bagian: Bagian<GrafikManajemenDto>, aksi: AksiRingkasan) {
    val warna = LocalMkColors.current
    KartuGrafik(stringResource(R.string.rg_mingguan), stringResource(R.string.rg_mingguan_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            val p = data.periode
            if (data.weeklyByGroup.isEmpty()) {
                EmptyNote(teks = "Minggu ${p.isoWeek} belum terisi.")
            } else {
                data.weeklyByGroup.map(::barisMingguan).forEachIndexed { i, b ->
                    if (i > 0) MkDivider()
                    Column(Modifier.padding(vertical = MkSpacing.space2)) {
                        Text(b.nama, style = MkTypography.bodyStrong, color = warna.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
                            modifier = Modifier.padding(top = MkSpacing.space1),
                        ) {
                            b.lencana.forEach {
                                StatusBadge(status = it.status.keMk(), size = MkBadgeSize.SM, text = it.label)
                            }
                        }
                    }
                }
            }
            Text(
                text = "Draf dan menunggu persetujuan belum selesai diserahkan. Periode M${p.isoWeek} ${p.isoYear}.",
                style = MkTypography.footnote,
                color = warna.ink2,
                modifier = Modifier.padding(top = MkSpacing.space3),
            )
        }
    }
}

@Composable
private fun KartuInsiden(bagian: Bagian<HalamanInsidenDto>, aksi: AksiRingkasan) {
    val warna = LocalMkColors.current
    KartuGrafik(stringResource(R.string.rg_insiden), stringResource(R.string.rg_insiden_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            if (data.items.isEmpty()) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_insiden), done = true)
                return@IsiBagian
            }
            data.items.take(8).forEachIndexed { i, it ->
                if (i > 0) MkDivider()
                Row(Modifier.padding(vertical = MkSpacing.space2), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            it.entity?.name ?: "Entitas tidak dikenal",
                            style = MkTypography.bodyStrong,
                            color = warna.ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            listOfNotNull(labelSiklus(it.cycle), it.period.ifBlank { null }, it.actionTaken?.ifBlank { null })
                                .joinToString(" · "),
                            style = MkTypography.footnote,
                            color = warna.ink2,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    StatusBadge(
                        status = if (it.occurrenceInMonth >= 3) MkStatus.LATE else MkStatus.RISK,
                        size = MkBadgeSize.SM,
                        text = "Ke-${it.occurrenceInMonth} bulan ini",
                    )
                }
            }
            if (data.total > 8) {
                Text(
                    "${FormatWib.angka(data.total - 8)} keterlambatan lain",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                )
            }
        }
    }
}

@Composable
private fun KartuPeta(bagian: Bagian<PetaKepatuhanDto>, aksi: AksiRingkasan) {
    val warna = LocalMkColors.current
    KartuGrafik(stringResource(R.string.rg_peta), stringResource(R.string.rg_peta_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            val kelompok = ratakanPeta(data.tree)
            if (kelompok.isEmpty()) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_peta))
                return@IsiBagian
            }
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
                kelompok.forEach { k ->
                    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                        Text(
                            text = k.nama + (k.rata?.let { " · rata-rata ${FormatWib.desimal(it)}" } ?: ""),
                            style = MkTypography.footnote,
                            color = warna.ink2,
                        )
                        PetaPanas(sel = k.sel)
                    }
                }
                LegendaPetaPanas()
            }
        }
    }
}

@Composable
private fun KartuPtTerendah(bagian: Bagian<GrafikManajemenDto>, aksi: AksiRingkasan, duaKolom: Boolean) {
    val warna = LocalMkColors.current
    KartuGrafik(stringResource(R.string.rg_pt_terendah), stringResource(R.string.rg_pt_terendah_tanya)) {
        IsiBagian(bagian, aksi.muatUlang) { data ->
            if (data.lowestPt.isEmpty()) {
                EmptyNote(teks = stringResource(R.string.rg_kosong_pt_terendah), done = true)
                return@IsiBagian
            }
            data.lowestPt.chunked(if (duaKolom) 2 else 1).forEach { baris ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4),
                    modifier = Modifier.padding(bottom = MkSpacing.space4),
                ) {
                    baris.forEach { p ->
                        Box(Modifier.weight(1f)) {
                            BatangSkor(
                                nama = p.name,
                                skor = p.skor,
                                meta = "${pitaKepatuhan(p.skor).label} · ${p.region?.ifBlank { null } ?: "Wilayah belum diisi"}",
                            )
                        }
                    }
                    if (duaKolom && baris.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            val r = data.ringkasan
            Text(
                kalimatKritis(r.diBawahTarget, r.entitas),
                style = MkTypography.footnote,
                color = warna.ink2,
            )
        }
    }
}

// ------------------------------------------------------------------
// Bantu tata letak
// ------------------------------------------------------------------

/** Dua kartu sebaris di ≥600dp, bertumpuk di ponsel. */
@Composable
private fun Pasangan(
    duaKolom: Boolean,
    kiri: @Composable () -> Unit,
    kanan: @Composable () -> Unit,
) {
    if (duaKolom) {
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3), verticalAlignment = Alignment.Top) {
            Box(Modifier.weight(1f)) { kiri() }
            Box(Modifier.weight(1f)) { kanan() }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space4)) {
            kiri()
            kanan()
        }
    }
}

/** Kartu grafik: judul + pertanyaan yang dijawab, lalu isi. */
@Composable
private fun KartuGrafik(judul: String, pertanyaan: String?, isi: @Composable ColumnScope.() -> Unit) {
    val warna = LocalMkColors.current
    MkCard(modifier = Modifier.fillMaxWidth()) {
        Text(judul, style = MkTypography.headline, color = warna.ink, modifier = Modifier.semantics { heading() })
        if (pertanyaan != null) {
            Text(pertanyaan, style = MkTypography.footnote, color = warna.ink2, modifier = Modifier.padding(top = 2.dp))
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) { isi() }
    }
}

/** Memuat → kerangka, Galat → ErrorNote + Coba lagi, Ditolak (403) → catatan izin. */
@Composable
private fun <T> IsiBagian(bagian: Bagian<T>, onUlang: () -> Unit, isi: @Composable (T) -> Unit) {
    when (bagian) {
        Bagian.Memuat -> Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
            MkSkeleton(tinggi = 20.dp, lebar = 160.dp)
            MkSkeleton(tinggi = 140.dp)
        }
        is Bagian.Galat -> ErrorNote(pesan = bagian.pesan, onCobaLagi = onUlang)
        is Bagian.Ditolak -> EmptyNote(teks = bagian.pesan.ifBlank { stringResource(R.string.rg_ditolak) })
        is Bagian.Siap -> isi(bagian.data)
    }
}

/** Angka besar + label periode yang mengikuti pilihan batang/titik. */
@Composable
private fun AngkaTerpilih(angka: String, keterangan: String) {
    val warna = LocalMkColors.current
    Column(horizontalAlignment = Alignment.End, modifier = Modifier.fillMaxWidth()) {
        Text(angka, style = MkTypography.title2.tabular, color = warna.ink)
        Text(keterangan, style = MkTypography.footnote, color = warna.ink2)
    }
}

@Composable
private fun JudulBagian(teks: String) {
    Text(
        text = teks,
        style = MkTypography.title3,
        color = LocalMkColors.current.ink,
        modifier = Modifier.padding(top = MkSpacing.space2).semantics { heading() },
    )
}

/** Kerangka memuat seukuran isi: kepala, jawaban, 4 KPI, kartu PT. */
@Composable
private fun KerangkaRingkasan(duaKolom: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3), modifier = Modifier.fillMaxWidth()) {
        MkSkeleton(tinggi = 14.dp, lebar = 220.dp)
        MkSkeleton(tinggi = 34.dp, lebar = 180.dp)
        MkSkeleton(tinggi = 96.dp)
        val per = if (duaKolom) 4 else 2
        repeat(4 / per) {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                repeat(per) { MkSkeleton(tinggi = 88.dp, modifier = Modifier.weight(1f)) }
            }
        }
        repeat(3) { MkSkeleton(tinggi = 104.dp) }
    }
}

/**
 * E2E-R2-3 N3: di donat komposisi, "Sesuai jadwal" (on) dan "Selesai" (done)
 * sama-sama --sukses sehingga tak terbedakan. Untuk grafik saja, Selesai
 * memakai token info (biru) — status lain tetap warna StatusBadge-nya.
 * Legenda tetap menulis kata status, jadi warna bukan satu-satunya pembeda.
 */
@Composable
private fun warnaDonatProyek(s: StatusRingkas): androidx.compose.ui.graphics.Color =
    if (s == StatusRingkas.DONE) LocalMkColors.current.statusInfo else warnaStatus(s.keMk())
