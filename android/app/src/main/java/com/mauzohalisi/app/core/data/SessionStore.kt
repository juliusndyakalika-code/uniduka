package com.mauzohalisi.app.core.data

import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("session")

/**
 * The signed-in session.
 *
 * Held in DataStore rather than SharedPreferences so every read suspends and
 * the token is never fetched on the main thread. The access token is short
 * lived (20 minutes) and the refresh token is what actually keeps someone
 * signed in, so both are stored.
 */
class SessionStore(private val context: Context) {

    private object Keys {
        val ACCESS  = stringPreferencesKey("access_token")
        val REFRESH = stringPreferencesKey("refresh_token")
        val SHOP    = stringPreferencesKey("shop_id")
        val NAME    = stringPreferencesKey("user_name")
        val ROLE    = stringPreferencesKey("user_role")
        val SHOPNAME = stringPreferencesKey("shop_name")
        val READY   = booleanPreferencesKey("session_ready")
    }

    /**
     * Signed in AND ready to show data. The two are separate because selecting a
     * shop is itself an authenticated call, so the token has to be stored first.
     * Gating on the token alone raced the dashboard against shop selection, and
     * the dashboard won: it loaded with no shop name and unscoped figures.
     */
    val isSignedIn: Flow<Boolean> =
        context.dataStore.data.map { it[Keys.ACCESS] != null && it[Keys.READY] == true }
    val userName:   Flow<String?> = context.dataStore.data.map { it[Keys.NAME] }
    val shopName:   Flow<String?> = context.dataStore.data.map { it[Keys.SHOPNAME] }
    val shopId:     Flow<String?> = context.dataStore.data.map { it[Keys.SHOP] }

    /** Read straight from disk. Used by the OkHttp interceptor, off the main thread. */
    suspend fun accessToken(): String?  = context.dataStore.data.first()[Keys.ACCESS]
    suspend fun refreshToken(): String? = context.dataStore.data.first()[Keys.REFRESH]

    suspend fun save(access: String, refresh: String?, name: String?, role: String?) {
        context.dataStore.edit {
            it[Keys.ACCESS] = access
            refresh?.let { r -> it[Keys.REFRESH] = r }
            name?.let    { n -> it[Keys.NAME] = n }
            role?.let    { r -> it[Keys.ROLE] = r }
        }
    }

    suspend fun saveAccess(access: String) {
        context.dataStore.edit { it[Keys.ACCESS] = access }
    }

    suspend fun saveShop(id: String, name: String?) {
        context.dataStore.edit {
            it[Keys.SHOP] = id
            name?.let { n -> it[Keys.SHOPNAME] = n }
        }
    }

    /** Flipped once login has finished everything, including choosing a shop. */
    suspend fun markReady() {
        context.dataStore.edit { it[Keys.READY] = true }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
