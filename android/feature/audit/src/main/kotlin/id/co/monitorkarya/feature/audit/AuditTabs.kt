// Titik masuk publik modul :feature:audit — dipasang shell (MKShell.IsiTab):
//   TabId.LOG_AUDIT    → LogAuditTab(peran)
//   TabId.SISTEM_AKSES → SistemAksesTab(peran)
// Izin ditentukan server: /api/audit-logs membatasi cakupan (peran tanpa
// audit:read hanya melihat jejaknya sendiri), /api/system menolak 403 bila
// tanpa users:manage — pesan 403 tampil lewat ErrorNote.
package id.co.monitorkarya.feature.audit

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.feature.audit.log.LogAuditScreen
import id.co.monitorkarya.feature.audit.log.LogAuditViewModel
import id.co.monitorkarya.feature.audit.sistem.SistemAksesScreen
import id.co.monitorkarya.feature.audit.sistem.SistemAksesViewModel

/** Tab Log aktivitas. ViewModel dikunci per peran agar ganti akun tidak mewarisi saringan. */
@Composable
fun LogAuditTab(peran: Peran, modifier: Modifier = Modifier) {
    val vm: LogAuditViewModel = hiltViewModel(key = "log-audit-${peran.name}")
    LogAuditScreen(vm = vm, modifier = modifier)
}

/** Tab Sistem & akses (Tim TI / Super Admin). */
@Composable
fun SistemAksesTab(peran: Peran, modifier: Modifier = Modifier) {
    val vm: SistemAksesViewModel = hiltViewModel(key = "sistem-akses-${peran.name}")
    SistemAksesScreen(vm = vm, modifier = modifier)
}
