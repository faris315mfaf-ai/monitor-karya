// Titik masuk publik modul :feature:entitas untuk MKShell (integrasi parent):
//   TabId.ENTITAS    -> EntitasTab(peran)
//   TabId.PERUSAHAAN -> PerusahaanTab(peran)
// ViewModel diambil lewat Hilt dari ViewModelStoreOwner terdekat (entri
// NavHost tab) dengan kunci per peran, jadi status tab bertahan selama tab
// itu hidup dan tidak terwariskan ke sesi peran lain.
package id.co.monitorkarya.feature.entitas

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.feature.entitas.entitas.EntitasLayar
import id.co.monitorkarya.feature.entitas.entitas.EntitasViewModel
import id.co.monitorkarya.feature.entitas.perusahaan.PerusahaanLayar
import id.co.monitorkarya.feature.entitas.perusahaan.PerusahaanViewModel

/**
 * Tab Entitas: pohon organisasi holding, kepatuhan per PT, dan rincian PT di
 * sheet. [peran] hanya menyesuaikan kata pesan; izin selalu dari server.
 */
@Composable
fun EntitasTab(peran: Peran, modifier: Modifier = Modifier) {
    val vm: EntitasViewModel = hiltViewModel(key = "entitas-${peran.name}")
    EntitasLayar(peran = peran, vm = vm, modifier = modifier)
}

/**
 * Tab Perusahaan & akun (Super Admin; Admin PT mendapat meja terbatas dari
 * server). Batas wewenang dibaca dari `scope`, `canManageCompanies`, dan
 * `manageableRoles` jawaban GET /api/companies.
 */
@Composable
fun PerusahaanTab(peran: Peran, modifier: Modifier = Modifier) {
    val vm: PerusahaanViewModel = hiltViewModel(key = "perusahaan-${peran.name}")
    PerusahaanLayar(peran = peran, vm = vm, modifier = modifier)
}
