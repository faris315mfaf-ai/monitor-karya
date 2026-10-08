// Activity tunggal: tema (aksen + terang/gelap) dibaca dari MkPrefs (DataStore)
// — padanan data-accent/data-theme web — lalu membungkus navigasi dalam MKTheme.
package id.co.monitorkarya.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import id.co.monitorkarya.app.navigation.MkNavHost
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkAccent
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var prefs: MkPrefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val aksen by prefs.aksen.collectAsStateWithLifecycle(initialValue = "merah")
            val tema by prefs.tema.collectAsStateWithLifecycle(initialValue = "system")
            val gelap = when (tema) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }
            MKTheme(darkTheme = gelap, accent = aksenKeEnum(aksen)) {
                MkNavHost()
            }
        }
    }

    /** "merah|biru|hijau|ungu|oranye|grafit" → MkAccent; nilai asing jatuh ke merah
     *  (padanan parse() di src/lib/tampilan.ts). */
    private fun aksenKeEnum(nama: String): MkAccent = when (nama) {
        "biru" -> MkAccent.BIRU
        "hijau" -> MkAccent.HIJAU
        "ungu" -> MkAccent.UNGU
        "oranye" -> MkAccent.ORANYE
        "grafit" -> MkAccent.GRAFIT
        else -> MkAccent.MERAH
    }
}
