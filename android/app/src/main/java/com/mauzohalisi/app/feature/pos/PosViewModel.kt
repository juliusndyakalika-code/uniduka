package com.mauzohalisi.app.feature.pos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mauzohalisi.app.core.AppContainer
import com.mauzohalisi.app.core.net.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.IOException

data class CartLine(val product: Product, val qty: Double) {
    val lineTotal: Double get() = product.price * qty
}

data class PosState(
    val products: List<Product> = emptyList(),
    val search: String = "",
    val cart: List<CartLine> = emptyList(),
    val loading: Boolean = true,
    val charging: Boolean = false,
    val error: String? = null,
    val lastReceipt: String? = null,
) {
    val visible: List<Product>
        get() = if (search.isBlank()) products
                else products.filter {
                    it.name.contains(search, true) || it.sku?.contains(search, true) == true
                }
    val total: Double get() = cart.sumOf { it.lineTotal }
    val count: Int get() = cart.size
}

class PosViewModel(private val app: AppContainer) : ViewModel() {

    private val _state = MutableStateFlow(PosState())
    val state: StateFlow<PosState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val res = app.api.products()
                if (res.isSuccessful) {
                    _state.value = _state.value.copy(
                        products = res.body()?.data.orEmpty(),
                        loading = false,
                    )
                } else {
                    _state.value = _state.value.copy(loading = false,
                        error = res.body()?.message ?: "Could not load products.")
                }
            } catch (e: IOException) {
                _state.value = _state.value.copy(loading = false,
                    error = "No connection. Check your internet and try again.")
            }
        }
    }

    fun onSearch(v: String) { _state.value = _state.value.copy(search = v) }

    /**
     * Quantities are Double, not Int, because a grocery sells 1.5 kg and a
     * pharmacy doses in millilitres. The stored column is a float, so rounding
     * here would be the client inventing a restriction the system does not have.
     */
    fun add(product: Product, qty: Double = 1.0) {
        if (!product.sellable) return
        val cart = _state.value.cart.toMutableList()
        val at = cart.indexOfFirst { it.product.id == product.id }
        val wanted = if (at >= 0) cart[at].qty + qty else qty

        // Never let the till commit to more than is on the shelf. Services and
        // untracked lines have no ceiling.
        val capped = if (product.type == "SERVICE" || !product.trackStock) wanted
                     else minOf(wanted, product.stock)
        if (capped <= 0) return

        if (at >= 0) cart[at] = cart[at].copy(qty = capped) else cart.add(CartLine(product, capped))
        _state.value = _state.value.copy(cart = cart)
    }

    fun setQty(productId: String, qty: Double) {
        val cart = _state.value.cart.toMutableList()
        val at = cart.indexOfFirst { it.product.id == productId }
        if (at < 0) return
        if (qty <= 0) cart.removeAt(at) else {
            val p = cart[at].product
            val capped = if (p.type == "SERVICE" || !p.trackStock) qty else minOf(qty, p.stock)
            cart[at] = cart[at].copy(qty = capped)
        }
        _state.value = _state.value.copy(cart = cart)
    }

    fun remove(productId: String) {
        _state.value = _state.value.copy(cart = _state.value.cart.filterNot { it.product.id == productId })
    }

    fun clearCart() { _state.value = _state.value.copy(cart = emptyList(), error = null) }

    fun dismissReceipt() { _state.value = _state.value.copy(lastReceipt = null) }

    /** Cash sale, paid in full. Split tenders and credit come later. */
    fun charge(method: String = "CASH") {
        val s = _state.value
        if (s.cart.isEmpty() || s.charging) return
        _state.value = s.copy(charging = true, error = null)

        viewModelScope.launch {
            try {
                val res = app.api.sell(
                    SaleRequest(
                        items = s.cart.map {
                            SaleItem(it.product.id, it.qty, it.product.price, it.product.unit)
                        },
                        payments = listOf(SalePayment(method, s.total)),
                    )
                )
                if (res.isSuccessful) {
                    val sale = res.body()?.data
                    _state.value = _state.value.copy(
                        charging = false,
                        cart = emptyList(),
                        lastReceipt = sale?.receiptNo ?: "Sale recorded",
                    )
                    // Stock moved, so the shelf figures on screen are now stale.
                    load()
                } else {
                    _state.value = _state.value.copy(charging = false,
                        error = res.body()?.message ?: "The sale could not be recorded.")
                }
            } catch (e: IOException) {
                _state.value = _state.value.copy(charging = false,
                    error = "No connection. The sale was not recorded, so nothing was charged.")
            }
        }
    }
}
