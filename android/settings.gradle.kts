// Skeleton Fase 0 (T4-A1) — rancangan: docs/zcode/RANCANGAN-ANDROID-NATIVE.md §6.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        // Penanda plugin ktlint (org.jlleitschuh.gradle) & detekt hanya terbit di portal.
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MonitorKarya"

include(
    ":app",
    ":designsystem",
    ":core:network",
    ":core:data",
    ":core:domain",
    ":core:testing",
)
