package com.mauzohalisi.app

import android.app.Application
import com.mauzohalisi.app.core.AppContainer

class MauzoApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
