// ViewModel kecil penanda luring + antrean (A1-LURING.md §5). Dipakai lewat
// composable *Otomatis di PenandaLuringUi.kt sehingga layar mana pun cukup
// menaruh satu baris tanpa menyentuh ViewModel-nya sendiri.
package id.co.monitorkarya.app.ui.luring

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.outbox.AntreanOutbox
import id.co.monitorkarya.core.data.outbox.PesanOutbox
import id.co.monitorkarya.core.data.sync.PenandaLuring
import id.co.monitorkarya.core.data.sync.StatusLuring
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class LuringViewModel @Inject constructor(
    penanda: PenandaLuring,
    private val antrean: AntreanOutbox,
) : ViewModel() {

    /** Status jaringan + sinkron terakhir + jumlah antrean. */
    val status: StateFlow<StatusLuring> = penanda.status
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(BERHENTI_MS), StatusLuring())

    /** Pesan antrean (MENUNGGU + GAGAL); [kunciAwalan] null = semua. */
    fun pesan(kunciAwalan: String?): Flow<List<PesanOutbox>> =
        if (kunciAwalan == null) antrean.amati() else antrean.amatiKunci(kunciAwalan)

    fun ulangi(id: Long) {
        viewModelScope.launch { antrean.ulangi(id) }
    }

    fun buang(id: Long) {
        viewModelScope.launch { antrean.buang(id) }
    }

    fun kirimSekarang() = antrean.kirimSekarang()

    private companion object {
        const val BERHENTI_MS = 5_000L
    }
}
