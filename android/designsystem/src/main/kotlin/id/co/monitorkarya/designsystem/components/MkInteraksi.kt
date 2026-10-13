// Pembantu interaksi bersama komponen mk (C4 P2-1, P3-9):
// - cincin fokus 2dp `--focus` untuk komponen ber-indication null (padanan
//   `:focus-visible` web, bundle.css) agar pengguna keyboard/D-pad/Switch Access
//   melihat fokus;
// - target sentuh minimum 48dp dipasang lewat `minimumInteractiveComponentSize()`
//   M3 di tiap komponen (ukuran visual tetap, area sentuh membesar).
package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent

/** Garis 2dp warna `--focus` aksen aktif selama [interactionSource] berfokus. */
@Composable
internal fun Modifier.mkCincinFokus(interactionSource: InteractionSource, shape: Shape): Modifier {
    val fokus by interactionSource.collectIsFocusedAsState()
    return if (fokus) this.border(2.dp, LocalAccent.current.focus, shape) else this
}
