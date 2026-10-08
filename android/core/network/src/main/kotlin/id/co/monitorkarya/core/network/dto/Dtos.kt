package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.Serializable

/** Bentuk persis dari src/app/api/auth/login/route.ts dan src/lib/auth.ts. */

@Serializable
data class LoginRequest(
    val identifier: String,
    val password: String,
)

@Serializable
data class LoginResponse(
    val user: LoginUserDto,
    val mustChangePassword: Boolean = false,
)

@Serializable
data class LoginUserDto(
    val id: String,
    val name: String,
    val email: String,
    val username: String? = null,
    val role: String,
)

@Serializable
data class MeResponse(
    val user: MeUserDto,
)

@Serializable
data class MeUserDto(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
    val scopeEntityId: String? = null,
    val avatarColor: String? = null,
    val mustChangePassword: Boolean = false,
)

@Serializable
data class GantiSandiRequest(
    val currentPassword: String,
    val newPassword: String,
)

@Serializable
data class OkResponse(
    val ok: Boolean = false,
)
