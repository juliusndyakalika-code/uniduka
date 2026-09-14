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

    @GET("inventory/products")
    suspend fun products(
        @Query("limit") limit: Int = 200,
        @Query("active") active: String = "true",
        @Query("search") search: String? = null,
    ): Response<Envelope<List<Product>>>

    @POST("pos/transactions")
    suspend fun sell(@Body body: SaleRequest): Response<Envelope<SaleResponse>>
}
