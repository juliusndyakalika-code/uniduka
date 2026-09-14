package com.mauzohalisi.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mauzohalisi.app.core.AppContainer
import com.mauzohalisi.app.feature.auth.LoginScreen
import com.mauzohalisi.app.feature.auth.LoginViewModel
import com.mauzohalisi.app.feature.dashboard.DashboardScreen
import com.mauzohalisi.app.feature.pos.PosScreen
import com.mauzohalisi.app.feature.pos.PosViewModel
import com.mauzohalisi.app.ui.theme.MauzoTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Held until the session has been read, so the app never shows the login
        // screen for a frame before discovering it is already signed in.
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = (application as MauzoApplication).container
        var ready by mutableStateOf(false)
        splash.setKeepOnScreenCondition { !ready }

        setContent {
            val signedIn by app.session.isSignedIn.collectAsStateWithLifecycle(initialValue = null)
            LaunchedEffect(signedIn) { if (signedIn != null) ready = true }

            MauzoTheme {
                when (signedIn) {
                    null  -> Unit                     // still reading the session
                    false -> {
                        val vm: LoginViewModel = viewModel(factory = factory { LoginViewModel(app) })
                        LoginScreen(vm) { /* session flow flips this to the dashboard */ }
                    }
                    true  -> {
                        val scope = rememberCoroutineScope()
                        // Two screens so far, so a back-stack library would be more
                        // machinery than routing. Navigation Compose goes in when a
                        // third screen needs deep links or arguments.
                        var atPos by rememberSaveable { mutableStateOf(false) }
                        BackHandler(enabled = atPos) { atPos = false }

                        if (atPos) {
                            val vm: PosViewModel = viewModel(factory = factory { PosViewModel(app) })
                            PosScreen(vm) { atPos = false }
                        } else {
                            DashboardScreen(
                                app = app,
                                onOpenPos = { atPos = true },
                                onSignOut = { scope.launch { app.session.clear() } },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Minimal factory so view models can take the container without a DI framework. */
private fun <T : ViewModel> factory(create: () -> T) = object : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <V : ViewModel> create(modelClass: Class<V>): V = create() as V
}
