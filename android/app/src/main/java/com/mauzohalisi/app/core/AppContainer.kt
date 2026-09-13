package com.mauzohalisi.app.core

import android.content.Context
import com.mauzohalisi.app.core.data.SessionStore
import com.mauzohalisi.app.core.net.Api
import com.mauzohalisi.app.core.net.ApiClient

/**
 * Dependencies, wired by hand.
 *
 * Hilt would mean annotation processing on every build for what is, at this
 * size, two objects. When the graph grows past the point where this is obvious,
 * swapping it out is a contained change because nothing reaches for these
 * except through the container.
 */
class AppContainer(context: Context) {
    val session: SessionStore = SessionStore(context.applicationContext)
    val api: Api by lazy { ApiClient.create(session) }
}
