package id.co.monitorkarya.core.network

import kotlinx.serialization.json.Json

/** Konfigurasi Json bersama: server boleh menambah field tanpa memecah klien. */
val mkJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    isLenient = true
}
