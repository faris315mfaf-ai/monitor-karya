// Data: Room, repository, WorkManager sinkron, outbox (Rancangan §4, §6).
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.ksp) // kompilator Room + Hilt
    alias(libs.plugins.hilt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.detekt)
}

android {
    namespace = "id.co.monitorkarya.core.data"
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
    api(project(":core:domain")) // repository memamerkan model domain
    implementation(project(":core:network"))
    // Repo memakai Response/HttpException langsung — Retrofit harus terlihat.
    api(libs.retrofit)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json) // C10-A6: repo mem-parse JsonObject

    api(libs.androidx.room.runtime) // app perlu melihat RoomDatabase untuk factory Hilt
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler) // argumen room.schemaLocation lewat ksp.arg.* di gradle.properties (KSP2)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)

    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    ksp(libs.hilt.compiler)

    implementation(libs.kotlinx.coroutines.core)

    testImplementation(libs.junit)
    testImplementation(libs.turbine)
}
