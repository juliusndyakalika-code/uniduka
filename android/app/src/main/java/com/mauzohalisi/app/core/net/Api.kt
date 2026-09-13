package com.mauzohalisi.app.core.net

import retrofit2.Response
import retrofit2.http.*

interface Api {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<Envelope<LoginResponse>>

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<Envelope<RefreshResponse>>

    @GET("shops")
    suspend fun shops(): Response<Envelope<List<Shop>>>

    @POST("shops/active")
    suspend fun setActiveShop(@Body body: ActiveShopRequest): Response<Envelope<ActiveShopResponse>>

    @GET("reporting/dashboard")
    suspend fun dashboard(): Response<Envelope<DashboardStats>>
}
