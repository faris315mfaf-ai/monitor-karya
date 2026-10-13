// Fungsi skala grafik Canvas — murni (tanpa Compose) supaya diuji di JVM.
package id.co.monitorkarya.feature.ringkasangrup.grafik

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow

/** Satu titik layar (piksel). */
data class Titik(val x: Float, val y: Float)

/** Satu busur donat dalam derajat; mulai dari jam 12 (−90°), searah jarum jam. */
data class Busur(val mulai: Float, val sapuan: Float)

object SkalaGrafik {

    /**
     * Batas atas sumbu yang "rapi": kelipatan 1, 2, 5 × 10ⁿ yang ≥ [maks].
     * Nilai ≤ 0 memberi 1 supaya pembagian tidak nol.
     */
    fun batasRapi(maks: Double): Double {
        if (maks <= 0.0 || maks.isNaN()) return 1.0
        val pangkat = 10.0.pow(floor(log10(maks)))
        val dasar = maks / pangkat
        val langkah = when {
            dasar <= 1.0 -> 1.0
            dasar <= 2.0 -> 2.0
            dasar <= 5.0 -> 5.0
            else -> 10.0
        }
        return langkah * pangkat
    }

    /** Porsi tinggi/lebar 0..1 dari [nilai] terhadap [batas]. */
    fun porsi(nilai: Double, batas: Double): Float {
        if (batas <= 0.0 || nilai.isNaN()) return 0f
        return (nilai / batas).toFloat().coerceIn(0f, 1f)
    }

    /**
     * Busur donat untuk tiap nilai. Nilai ≤ 0 mendapat busur 0 (tetap di daftar
     * supaya indeks cocok dengan legenda). [celah] derajat dipotong dari tiap
     * busur yang tampil bila ada lebih dari satu busur bernilai.
     */
    fun busurDonat(nilai: List<Double>, celah: Float = 0f): List<Busur> {
        val total = nilai.filter { it > 0 }.sum()
        if (total <= 0.0) return nilai.map { Busur(-90f, 0f) }
        val berisi = nilai.count { it > 0 }
        val potong = if (berisi > 1) celah else 0f
        var sudut = -90f
        return nilai.map { v ->
            if (v <= 0) {
                Busur(sudut, 0f)
            } else {
                val penuh = (v / total * 360.0).toFloat()
                val b = Busur(sudut + potong / 2f, (penuh - potong).coerceAtLeast(0.5f))
                sudut += penuh
                b
            }
        }
    }

    /**
     * Posisi titik garis tren di bidang [lebar]×[tinggi] dengan bantalan
     * horizontal [tepiX] dan atas [tepiAtas]. Titik tunggal ditaruh di tengah.
     */
    fun titikTren(
        nilai: List<Double>,
        lebar: Float,
        tinggi: Float,
        batas: Double,
        tepiX: Float = 0f,
        tepiAtas: Float = 0f,
    ): List<Titik> {
        if (nilai.isEmpty()) return emptyList()
        val bidangX = (lebar - 2 * tepiX).coerceAtLeast(0f)
        val bidangY = (tinggi - tepiAtas).coerceAtLeast(0f)
        val jarak = if (nilai.size > 1) bidangX / (nilai.size - 1) else 0f
        return nilai.mapIndexed { i, v ->
            val x = if (nilai.size == 1) lebar / 2f else tepiX + i * jarak
            val y = tepiAtas + bidangY * (1f - porsi(v, batas))
            Titik(x, y)
        }
    }

    /** Indeks batang/titik terdekat dari koordinat sentuh x pada [jumlah] slot selebar [lebar]. */
    fun indeksDariX(x: Float, lebar: Float, jumlah: Int): Int {
        if (jumlah <= 0 || lebar <= 0f) return -1
        val slot = lebar / jumlah
        return (x / slot).toInt().coerceIn(0, jumlah - 1)
    }

    /** Persen bulat porsi bagian dari total (legenda donat). */
    fun persenBagian(bagian: Int, total: Int): Int =
        if (total <= 0) 0 else Math.round(bagian * 100.0 / total).toInt()

    /**
     * Selang label/angka sumbu (C4 P2-3): teks selebar [lebarTeksMaks] yang
     * dipusatkan di slot selebar [slot] tidak bertabrakan bila hanya tiap
     * [langkahLabel]-slot yang ditulis (jarak [celah] di antaranya). 1 = semua.
     */
    fun langkahLabel(lebarTeksMaks: Float, slot: Float, celah: Float = 0f): Int {
        if (slot <= 0f || lebarTeksMaks.isNaN() || lebarTeksMaks <= 0f) return 1
        return ceil(((lebarTeksMaks + celah) / slot).toDouble()).toInt().coerceAtLeast(1)
    }

    /**
     * Indeks yang ditulis untuk [jumlah] slot dengan selang [langkah]: ditambat ke
     * slot terakhir (minggu/bulan terbaru selalu tertulis) dan [terpilih] selalu
     * tertulis; tetangga terpilih yang terlalu dekat dilewati agar tidak menimpa.
     */
    fun indeksTampil(jumlah: Int, langkah: Int, terpilih: Int): Set<Int> {
        if (jumlah <= 0) return emptySet()
        if (langkah <= 1) return (0 until jumlah).toSet()
        val dasar = (0 until jumlah).filter { (jumlah - 1 - it) % langkah == 0 }
        if (terpilih !in 0 until jumlah) return dasar.toSet()
        return (dasar.filter { abs(it - terpilih) >= langkah } + terpilih).toSet()
    }
}
