// Root Fase 0 (T4-A1). Versi plugin terkunci di gradle/libs.versions.toml — ubah di sana saja.
//
// Konstanta SDK (modul memakai angka langsung, jangan ubah satu saja):
//   compileSdk = 37 · minSdk = 26 (Android 8.0) · targetSdk = 36 (wajib Play)
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ktlint) apply false
}
