package id.co.monitorkarya.feature.proyek

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.feature.proyek.ui.ProyekLayar
import id.co.monitorkarya.feature.proyek.ui.ProyekViewModel

/**
 * Titik masuk publik tab Proyek (TabId.PROYEK) untuk semua peran. Cakupan
 * dan izin ditentukan server dari sesi; [peran] hanya untuk teks yang
 * menyesuaikan peran (mis. kalimat kosong PIC). Dipasang parent di MKShell.
 */
@Composable
fun ProyekTab(peran: Peran, modifier: Modifier = Modifier) {
    val vm: ProyekViewModel = hiltViewModel()
    ProyekLayar(vm = vm, peran = peran, modifier = modifier)
}
