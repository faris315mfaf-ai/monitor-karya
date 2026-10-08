// Modul aplikasi: Activity, navigasi, DI, build type (Rancangan §6).
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp) // dibutuhkan hilt-android-compiler di modul ini
    alias(libs.plugins.hilt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.detekt)
}

android {
    namespace = "id.co.monitorkarya.app"
    compileSdk = 37 // konstanta terkunci, lihat build.gradle.kts root

    defaultConfig {
        applicationId = "id.co.monitorkarya.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        // Dipakai di/AppModule (Retrofit) dan MKApp (Configuration.Provider).
        buildConfigField("String", "BASE_URL", "\"https://monitorkarya.tech/\"")
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            // Rancangan §6: debug memakai staging — URL staging belum tersedia;
            // saat ada, timpa di sini: buildConfigField("String", "BASE_URL", "\"https://staging…/\"")
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // signingConfig diisi saat keystore rilis disiapkan (Play App Signing).
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true // BuildConfig.DEBUG + BASE_URL (dipakai MKApp/AppModule)
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17) // uji unit berjalan di JVM 17
    }
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(rootProject.files("detekt.yml"))
}

dependencies {
    implementation(project(":designsystem"))
    implementation(project(":core:data"))
    implementation(project(":core:domain"))
    implementation(project(":core:network"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // di/AppModule membangun Retrofit bersama (core:network menyembunyikan
    // dependensi ini sebagai implementation, jadi dideklarasikan ulang di sini).
    implementation(libs.retrofit)
    implementation(libs.okhttp)
    implementation(libs.retrofit.kotlinx.serialization.converter)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core) // StateFlow di ViewModel

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    // Ikon tab MKShell & aksi keluar (A3 juga memakainya di designsystem).
    // Versi mengikuti compose-bom; bila BOM tidak lagi memetakan ikon
    // (artefak beku 1.7.8), pin versi itu lalu pindahkan ke libs.versions.toml.
    implementation(libs.androidx.compose.material.icons.extended)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    // MKApp: Configuration.Provider (placeholder WorkManager Fase 0)
    implementation(libs.androidx.work.runtime.ktx)

    testImplementation(libs.junit)
    testImplementation(project(":core:testing"))
}
