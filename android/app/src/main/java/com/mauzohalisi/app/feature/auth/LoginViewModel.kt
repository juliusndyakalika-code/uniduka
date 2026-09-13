package com.mauzohalisi.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mauzohalisi.app.core.AppContainer
import com.mauzohalisi.app.core.net.ActiveShopRequest
import com.mauzohalisi.app.core.net.LoginRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.IOException

data class LoginState(
    val username: String = "",
    val password: String = "",
    val totp: String = "",
    val needs2fa: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
)

class LoginViewModel(private val app: AppContainer) : ViewModel() {

    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state

    fun onUsername(v: String) { _state.value = _state.value.copy(username = v, error = null) }
    fun onPassword(v: String) { _state.value = _state.value.copy(password = v, error = null) }
    fun onTotp(v: String)     { _state.value = _state.value.copy(totp = v, error = null) }

    fun submit() {
        val s = _state.value
        if (s.username.isBlank() || s.password.isBlank()) {
            _state.value = s.copy(error = "Enter your email or phone, and your password")
            return
        }
        _state.value = s.copy(loading = true, error = null)

        viewModelScope.launch {
            try {
                val res = app.api.login(
                    LoginRequest(s.username.trim(), s.password, s.totp.ifBlank { null })
                )
                val body = res.body()

                if (!res.isSuccessful) {
                    _state.value = _state.value.copy(
                        loading = false,
                        error = body?.message ?: "Sign in failed. Check your details and try again.",
                    )
                    return@launch
                }

                // The server answers 200 with require2fa rather than an error when
                // a code is needed, so this is a normal branch, not a failure.
                val data = body?.data
                if (data?.require2fa == true) {
                    _state.value = _state.value.copy(loading = false, needs2fa = true)
                    return@launch
                }

                val token = data?.accessToken
                if (token == null) {
                    _state.value = _state.value.copy(loading = false, error = "Sign in failed. Please try again.")
                    return@launch
                }
                app.session.save(token, data.refreshToken, data.user?.fullName, data.user?.role)

                // Most of the API needs a shop in the token, so pick one up front
                // rather than letting the first real screen fail with a 403.
                selectFirstShop()

                // Last, so nothing renders against a half-built session.
                app.session.markReady()
                _state.value = _state.value.copy(loading = false, done = true)

            } catch (e: IOException) {
                _state.value = _state.value.copy(loading = false,
                    error = "No connection. Check your internet and try again.")
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false,
                    error = "Something went wrong. Please try again.")
            }
        }
    }

    private suspend fun selectFirstShop() {
        val shops = runCatching { app.api.shops() }.getOrNull() ?: return
        val first = shops.body()?.data?.firstOrNull() ?: return
        val swapped = runCatching { app.api.setActiveShop(ActiveShopRequest(first.id)) }.getOrNull()
        swapped?.body()?.data?.accessToken?.let { app.session.saveAccess(it) }
        app.session.saveShop(first.id, first.tradingName)
    }
}
