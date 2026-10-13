# Aturan R8/ProGuard rilis. Tambah aturan keep bila modul menambah refleksi/serialisasi.

# Tink (androidx.security:security-crypto) merujuk anotasi errorprone yang hanya
# ada saat kompilasi — aman diabaikan (aturan dari missing_rules.txt R8).
-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue
-dontwarn com.google.errorprone.annotations.CheckReturnValue
-dontwarn com.google.errorprone.annotations.Immutable
-dontwarn com.google.errorprone.annotations.RestrictedApi
