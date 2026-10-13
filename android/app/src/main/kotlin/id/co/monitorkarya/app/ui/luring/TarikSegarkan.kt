// Tarik-untuk-muat-ulang bersama (E2E-R2 N3): pembungkus PullToRefreshBox
// bertoken (indikator permukaan + aksen) untuk layar ber-verticalScroll /
// LazyColumn. Isi harus dapat digulir agar gestur tarik terdeteksi.
package id.co.monitorkarya.app.ui.luring

import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TarikSegarkan(
    menyegarkan: Boolean,
    onSegarkan: () -> Unit,
    modifier: Modifier = Modifier,
    isi: @Composable BoxScope.() -> Unit,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val status = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = menyegarkan,
        onRefresh = onSegarkan,
        state = status,
        modifier = modifier.fillMaxSize(),
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = status,
                isRefreshing = menyegarkan,
                containerColor = warna.surface,
                color = aksen.fill,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        },
        content = isi,
    )
}
