package com.mauzohalisi.app.core.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Every endpoint answers with the same envelope, so it is modelled once.
 * `success` is not trusted on its own; the HTTP status decides, and this only
 * carries the payload and the message shown to the user.
 */
@Serializable
data class Envelope<T>(
    val success: Boolean = false,
    val message: String? = null,
    val data: T? = null,
)

@Serializable
data class LoginRequest(val username: String, val password: String, val totp: String? = null)

@Serializable
data class User(
    val id: String,
    val email: String? = null,
    val fullName: String,
    val role: String,
)

@Serializable
data class Account(
    val id: String,
    val legalName: String,
    val plan: String? = null,
    val subscriptionActive: Boolean = true,
    val daysRemaining: Int? = null,
)

@Serializable
data class LoginResponse(
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val user: User? = null,
    val account: Account? = null,
    val shopId: String? = null,
    @SerialName("require2fa") val require2fa: Boolean = false,
)

@Serializable
data class Shop(
    val id: String,
    val tradingName: String,
    val businessType: String,
    val currency: String = "TZS",
    val isActive: Boolean = true,
)

@Serializable
data class ActiveShopRequest(val shopId: String)

@Serializable
data class ActiveShopResponse(val accessToken: String? = null)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class RefreshResponse(val accessToken: String? = null, val refreshToken: String? = null)

/**
 * Field names here are the ones /reporting/dashboard actually returns. They were
 * originally guessed, and because kotlinx falls back to defaults for absent keys
 * the screen showed a confident set of zeros over real sales rather than failing.
 */
@Serializable
data class TopProduct(val productId: String? = null, val name: String? = null)

@Serializable
data class DashboardStats(
    val revenue: Double = 0.0,
    val tax: Double = 0.0,
    val discounts: Double = 0.0,
    val transactions: Int = 0,
    val customers: Int = 0,
    val products: Int = 0,
    val topProducts: List<TopProduct> = emptyList(),
)

/**
 * A product as the API sends it. `stock` and `sellingPrice` are added by the
 * server on top of the stored row, and `sellPrice` is the stored column; both
 * are present, and sellingPrice is the one the till should charge.
 */
@Serializable
data class Product(
    val id: String,
    val name: String,
    val sku: String? = null,
    val barcode: String? = null,
    val unit: String = "ea",
    val sellPrice: Double = 0.0,
    val sellingPrice: Double = 0.0,
    val stock: Double = 0.0,
    val isActive: Boolean = true,
    val type: String = "PRODUCT",
    val trackStock: Boolean = true,
) {
    val price: Double get() = if (sellingPrice > 0) sellingPrice else sellPrice

    /** A service has nothing to run out of, so it is always sellable. */
    val sellable: Boolean get() = type == "SERVICE" || !trackStock || stock > 0
}

@Serializable
data class SaleItem(
    val productId: String,
    val quantity: Double,
    val unitPrice: Double,
    val unitLabel: String = "ea",
)

@Serializable
data class SalePayment(val method: String, val amount: Double)

@Serializable
data class SaleRequest(
    val items: List<SaleItem>,
    val payments: List<SalePayment>,
    val customerId: String? = null,
    val discountAmount: Double = 0.0,
)

@Serializable
data class SaleResponse(
    val id: String? = null,
    val receiptNo: String? = null,
    val total: Double = 0.0,
)
