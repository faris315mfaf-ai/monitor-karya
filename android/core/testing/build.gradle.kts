// Pengujian: fixture, MockWebServer, turunan sesi palsu (Rancangan §6, §7).
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.detekt)
}

android {
    namespace = "id.co.monitorkarya.core.testing"
    compileSdk = 37

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(rootProject.files("detekt.yml"))
}

dependencies {
    // Fixture Fase 0: model domain + respons jaringan; fixture Room menyusul.
    api(project(":core:domain"))
    api(project(":core:network"))

    api(libs.junit)
    api(libs.turbine)
    api(libs.mockwebserver)
    api(libs.kotlinx.coroutines.test)
    api(libs.kotlinx.serialization.json)
}
