package com.syncoraa.nativeapp.data

import android.content.Context
import com.syncoraa.nativeapp.model.AuthSession

interface SessionStorage {
    fun getSession(): AuthSession?
    fun saveSession(session: AuthSession)
    fun clearSession()

    fun getSelectedCompanyId(): String?
    fun getSelectedCompanyName(): String?
    fun saveSelectedCompany(id: String, name: String)
    fun clearSelectedCompany()

    fun getDarkMode(): String
    fun setDarkMode(mode: String)
}

class SharedPrefsSessionStore(context: Context) : SessionStorage {
    private val prefs = context.getSharedPreferences("syncora_native_prefs", Context.MODE_PRIVATE)

    override fun getSession(): AuthSession? {
        val token = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return null
        val refresh = prefs.getString(KEY_REFRESH_TOKEN, null) ?: return null
        val userId = prefs.getString(KEY_USER_ID, null) ?: return null
        val email = prefs.getString(KEY_EMAIL, null) ?: ""
        val name = prefs.getString(KEY_NAME, null) ?: ""
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)
        if (token.isBlank() || userId.isBlank()) return null
        return AuthSession(
            accessToken = token,
            refreshToken = refresh,
            expiresAtEpochSec = expiresAt,
            userId = userId,
            email = email,
            name = name
        )
    }

    override fun saveSession(session: AuthSession) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, session.accessToken)
            .putString(KEY_REFRESH_TOKEN, session.refreshToken)
            .putLong(KEY_EXPIRES_AT, session.expiresAtEpochSec)
            .putString(KEY_USER_ID, session.userId)
            .putString(KEY_EMAIL, session.email)
            .putString(KEY_NAME, session.name)
            .apply()
    }

    override fun clearSession() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_EXPIRES_AT)
            .remove(KEY_USER_ID)
            .remove(KEY_EMAIL)
            .remove(KEY_NAME)
            .apply()
    }

    override fun getSelectedCompanyId(): String? = prefs.getString(KEY_COMPANY_ID, null)
    override fun getSelectedCompanyName(): String? = prefs.getString(KEY_COMPANY_NAME, null)

    override fun saveSelectedCompany(id: String, name: String) {
        prefs.edit()
            .putString(KEY_COMPANY_ID, id)
            .putString(KEY_COMPANY_NAME, name)
            .apply()
    }

    override fun clearSelectedCompany() {
        prefs.edit()
            .remove(KEY_COMPANY_ID)
            .remove(KEY_COMPANY_NAME)
            .apply()
    }

    override fun getDarkMode(): String = prefs.getString(KEY_DARK_MODE, "system") ?: "system"

    override fun setDarkMode(mode: String) {
        prefs.edit().putString(KEY_DARK_MODE, mode).apply()
    }

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_NAME = "name"
        private const val KEY_COMPANY_ID = "selected_company_id"
        private const val KEY_COMPANY_NAME = "selected_company_name"
        private const val KEY_DARK_MODE = "dark_mode"
    }
}
