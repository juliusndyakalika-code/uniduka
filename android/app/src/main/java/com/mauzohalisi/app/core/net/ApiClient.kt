package com.mauzohalisi.app.core.net

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.mauzohalisi.app.BuildConfig
import com.mauzohalisi.app.core.data.SessionStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

/**
 * Attaches the access token and, when the server rejects it, refreshes once and
 * replays the request.
 *
 * Shop context travels inside the JWT rather than a header, so a token swapped
 * after choosing a shop changes what the same endpoint returns. That is why the
 * interceptor always reads the token from the store instead of capturing it.
 */
private class AuthInterceptor(private val session: SessionStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { session.accessToken() }
        val request = chain.request().newBuilder()
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .build()
        return chain.proceed(request)
    }
}

/**
 * A 401 means the 20-minute access token expired, not that the person is signed
 * out. Authenticator is used rather than an interceptor because OkHttp
 * serialises it and gives up after one failed attempt, so a dead refresh token
 * cannot spin into a retry loop.
 */
private class TokenRefresher(
    private val session: SessionStore,
    private val refreshApi: () -> Api,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization") == null) return null
        if (responseCount(response) > 1) return null          // already retried once

        val refresh = runBlocking { session.refreshToken() } ?: return null
        val fresh = runBlocking {
            runCatching { refreshApi().refresh(RefreshRequest(refresh)) }.getOrNull()
        } ?: return null
        if (!fresh.isSuccessful) return null

        val newAccess = fresh.body()?.data?.accessToken ?: return null
        runBlocking { session.saveAccess(newAccess) }
        return response.request.newBuilder()
            .header("Authorization", "Bearer $newAccess")
            .build()
    }

    private fun responseCount(response: Response): Int {
        var r = response.priorResponse; var n = 1
        while (r != null) { n++; r = r.priorResponse }
        return n
    }
}

object ApiClient {

    // The API adds fields over time; unknown ones must not crash an older build.
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    fun create(session: SessionStore): Api {
        // A bare client for refreshing, so refreshing cannot recurse into itself.
        val bare = Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE.trimEnd('/') + "/")
            .client(OkHttpClient.Builder().build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(Api::class.java)

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(session))
            .authenticator(TokenRefresher(session) { bare })
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
                }
            }
            .build()

        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE.trimEnd('/') + "/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(Api::class.java)
    }
}
