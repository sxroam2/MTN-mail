var api = require('../../../utils/api.js')
var imageUtil = require('../../../utils/image.js')
var addressUtil = require('../../../utils/address.js')
var productPackageDisplay = require('../../../utils/product-package-display.js')

function formatPrice(value) {
  var n = Math.round(Number(value) * 100) / 100
  return isFinite(n) ? n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') : '0'
}

function buildAddressText(address) {
  if (!address) return ''
  return [address.province, address.city, address.district, address.detailAddress]
    .filter(function (p) { return !!p }).join('')
}

Page({
  data: {
    cartItems: [],
    checkedIds: [],
    allChecked: false,
    totalPrice: 0,
    originalTotalPrice: 0,
    totalCount: 0,
    invalidCount: 0,
    loading: true,
    loginRequired: false,
    isEmpty: false,
    isEditMode: false,
    // 地址
    deliveryAddress: null,
    deliveryAddressText: '',
    // 套餐切换抽屉
    showSkuDrawer: false,
    skuCartItem: null,
    skuPackages: [],
    skuConfirming: false
  },

  onLoad: function () {
    this._checkedIdsInitialized = false
    this._checkedIdsSnapshot = []
  },

  onShow: function () {
    if (api.isLoggedIn()) {
      this.setData({ loginRequired: false })
      this.loadCart()
      if (!this.syncSelectedAddressFromPage()) {
        this.loadDeliveryAddress()
      }
    } else {
      this._checkedIdsInitialized = false
      this._checkedIdsSnapshot = []
      this.setData({
        loading: false,
        loginRequired: true,
        isEmpty: false,
        cartItems: [],
        checkedIds: [],
        allChecked: false,
        totalPrice: 0,
        originalTotalPrice: 0,
        totalCount: 0,
        deliveryAddress: null,
        deliveryAddressText: '',
        isEditMode: false
      })
    }
    api.updateCartBadge()
  },

  resolveCheckedIdsForItems: function (items) {
    var itemIds = (items || []).filter(function (item) {
      return !item.isInvalid
    }).map(function (item) { return String(item.id) })

    if (!this._checkedIdsInitialized) {
      this._checkedIdsInitialized = true
      this._checkedIdsSnapshot = itemIds.slice()
      return itemIds
    }

    var snapshot = Array.isArray(this._checkedIdsSnapshot) ? this._checkedIdsSnapshot : []
    var checkedIds = itemIds.filter(function (id) {
      return snapshot.indexOf(id) >= 0
    })

    this._checkedIdsSnapshot = checkedIds.slice()
    return checkedIds
  },

  syncCheckedState: function (checkedIds) {
    var normalizedCheckedIds = (checkedIds || []).map(function (id) { return String(id) })
    var validCount = (this.data.cartItems || []).filter(function (item) {
      return !item.isInvalid
    }).length

    this._checkedIdsInitialized = true
    this._checkedIdsSnapshot = normalizedCheckedIds.slice()
    this.setData({
      checkedIds: normalizedCheckedIds,
      allChecked:
        normalizedCheckedIds.length === validCount && validCount > 0
    })
  },

  loadCart: function () {
    var that = this
    that._productPackageCache = that._productPackageCache || {}
    that.setData({ loading: true, loginRequired: false, isEmpty: false })
    api.get('/api/cart').then(function (res) {
      var payload = res && Array.isArray(res.data)
        ? res.data
        : Array.isArray(res)
          ? res
          : []
      var items = payload.map(function (item) {
        var unitPrice = item.price || 0
        var qty = item.cartItem.quantity || 1
        return {
          id: item.cartItem.id,
          productId: item.cartItem.productId,
          packageId: item.cartItem.packageId,
          quantity: qty,
          productName: item.productName,
          packageName: item.packageName,
          imageUrl: imageUtil.resolveImageUrl(item.imageUrl),
          price: unitPrice,
          originalPrice: item.originalPrice || 0,
          totalPrice: formatPrice(unitPrice * qty),
          originalTotalPrice: item.originalPrice && item.originalPrice > unitPrice ? formatPrice(item.originalPrice * qty) : '',
          stock: Number(item.stock || 0),
          isInvalid: Number(item.stock || 0) <= 0,
          invalidReason: Number(item.stock || 0) <= 0 ? '已下架/缺货' : ''
        }
      })

      var productIds = items.map(function (item) {
        return item.productId
      }).filter(function (productId, index, array) {
        return productId && array.indexOf(productId) === index
      })

      productPackageDisplay.ensureProductPackageCache(api, that._productPackageCache, productIds).catch(function () {
        return that._productPackageCache
      }).then(function () {
        var displayItems = items.map(function (item) {
          return productPackageDisplay.decorateCartItem(item, that._productPackageCache)
        })
        var checkedIds = that.resolveCheckedIdsForItems(displayItems)
        var validCount = displayItems.filter(function (item) { return !item.isInvalid }).length
        var invalidCount = displayItems.length - validCount
        that.setData({
          cartItems: displayItems,
          checkedIds: checkedIds,
          allChecked: validCount > 0 && checkedIds.length === validCount,
          loginRequired: false,
          isEmpty: displayItems.length === 0,
          invalidCount: invalidCount,
          loading: false
        })
        that.calcTotal()
      })
    }).catch(function () {
      that.setData({
        loading: false,
        loginRequired: false,
        isEmpty: true,
        cartItems: [],
        checkedIds: [],
        allChecked: false,
        totalPrice: 0,
        originalTotalPrice: 0,
        totalCount: 0,
        invalidCount: 0
      })
      that._checkedIdsInitialized = false
      that._checkedIdsSnapshot = []
    })
  },

  loadDeliveryAddress: function () {
    var that = this
    if (!api.isLoggedIn()) return
    api.get('/api/address', { showError: false }).then(function (res) {
      var addresses = addressUtil.filterDomesticAddresses(res.data || res || [])
      if (!addresses.length) {
        that.setData({ deliveryAddress: null, deliveryAddressText: '' })
        return
      }
      var current = addresses.find(function (a) { return a.isDefault }) || addresses[0]
      that.setData({
        deliveryAddress: current,
        deliveryAddressText: buildAddressText(current)
      })
    }).catch(function () {})
  },

  syncSelectedAddressFromPage: function () {
    return addressUtil.consumeSelectedAddress(this, function (addr) {
      if (addressUtil.isDomesticAddress(addr)) {
        this.setData({
          deliveryAddress: addr,
          deliveryAddressText: buildAddressText(addr)
        })
      } else {
        wx.showToast({ title: '小程序暂不支持国际地址', icon: 'none' })
      }
    }.bind(this))
  },

  goAddressSelect: function () {
    if (!api.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    addressUtil.navigateToAddressSelector(this, function (addr) {
      if (!addressUtil.isDomesticAddress(addr)) {
        wx.showToast({ title: '小程序暂不支持国际地址', icon: 'none' })
        return
      }

      this.setData({
        deliveryAddress: addr,
        deliveryAddressText: buildAddressText(addr)
      })
    }.bind(this))
  },

  goLogin: function () {
    api.goToLoginPage()
  },

  toggleEditMode: function () {
    var isEditMode = !this.data.isEditMode
    if (isEditMode) {
      // 进入编辑模式：清空选中，用户手动勾选要删除的
      this.setData({ isEditMode: true })
      this.syncCheckedState([])
    } else {
      // 退出编辑模式：重新全选
      var checkedIds = this.data.cartItems.filter(function (i) { return !i.isInvalid }).map(function (i) { return String(i.id) })
      this.setData({ isEditMode: false })
      this.syncCheckedState(checkedIds)
    }
    this.calcTotal()
  },

  onCheckChange: function (e) {
    var checkedIds = (e.detail || []).map(function (id) { return String(id) })
    this.syncCheckedState(checkedIds)
    this.calcTotal()
  },

  toggleAll: function () {
    var allChecked = !this.data.allChecked
    var checkedIds = allChecked
      ? this.data.cartItems.filter(function (i) { return !i.isInvalid }).map(function (i) { return String(i.id) })
      : []
    this.syncCheckedState(checkedIds)
    this.calcTotal()
  },

  calcTotal: function () {
    var ids = this.data.checkedIds
    var items = this.data.cartItems
    var total = 0
    var originalTotal = 0
    var count = 0
    items.forEach(function (item) {
      if (!item.isInvalid && ids.indexOf(String(item.id)) >= 0) {
        total += item.price * item.quantity
        var origPrice = item.originalPrice && item.originalPrice > item.price ? item.originalPrice : item.price
        originalTotal += origPrice * item.quantity
        count += item.quantity
      }
    })
    this.setData({
      totalPrice: formatPrice(total),
      originalTotalPrice: originalTotal > total ? formatPrice(originalTotal) : '',
      totalCount: count
    })
  },

  /** 自定义加减按钮 */
  onStepperTap: function (e) {
    var that = this
    var id = e.currentTarget.dataset.id
    var action = e.currentTarget.dataset.action
    var item = that.data.cartItems.find(function (i) { return i.id === id })
    if (!item) return
    if (item.isInvalid) {
      wx.showToast({ title: '该商品已失效，请先清理', icon: 'none' })
      return
    }

    var newQty = action === 'plus' ? item.quantity + 1 : item.quantity - 1
    if (newQty < 1 || newQty > item.stock) return

    api.put('/api/cart/' + id + '/quantity', { quantity: newQty }).then(function () {
      var items = that.data.cartItems.map(function (i) {
        if (i.id === id) {
          i.quantity = newQty
          i.totalPrice = formatPrice(i.price * newQty)
          i.originalTotalPrice = i.originalPrice && i.originalPrice > i.price ? formatPrice(i.originalPrice * newQty) : ''
        }
        return i
      })
      that.setData({ cartItems: items })
      that.calcTotal()
      api.updateCartBadge()
    })
  },

  /** 跳转商品详情 */
  goToDetail: function (e) {
    var productId = e.currentTarget.dataset.id
    if (productId) {
      wx.navigateTo({ url: '/pages/shop/product-detail/index?id=' + productId })
    }
  },

  /** 打开切换套餐抽屉 */
  openSkuDrawer: function (e) {
    var that = this
    var cartItemId = e.currentTarget.dataset.id
    var item = that.data.cartItems.find(function (i) { return i.id === cartItemId })
    if (!item) return
    if (item.isInvalid) {
      wx.showToast({ title: '该商品已失效，请先清理', icon: 'none' })
      return
    }

    that.setData({
      showSkuDrawer: true,
      skuCartItem: item,
      skuPackages: []
    })

    api.get('/api/sitepublic/product-detail/' + item.productId, { query: { lang: 'zh-cn' } }).then(function (res) {
      var data = res.data || res
      var detail = data.productDetail || {}
      var packages = (detail.packages || []).map(function (pkg) {
        var pkgObj = pkg.package || pkg
        var pkgI18n = pkg.i18n || {}
        var thumbUrl = pkgObj.thumbUrl || ''
        return {
          id: pkgObj.id || pkg.id,
          name: pkgI18n.name || pkgObj.name || pkgObj.sku || pkg.name || '',
          description: pkgI18n.description || pkgObj.description || pkg.description || '',
          price: pkgObj.price || pkg.price,
          stock: pkgObj.stock || pkg.stock || 0,
          thumbUrl: thumbUrl ? imageUtil.resolveImageUrl(thumbUrl) : ''
        }
      })
      var selected = packages.find(function (p) { return p.id === item.packageId }) || {}
      that.setData({ skuPackages: packages })
    })
  },

  closeSkuDrawer: function () {
    this.setData({ showSkuDrawer: false })
  },

  onSkuConfirm: function (e) {
    var that = this
    var cartItem = that.data.skuCartItem
    var newPkg = e.detail.package
    if (!cartItem || !newPkg || !newPkg.id) return

    if (newPkg.id === cartItem.packageId) {
      that.setData({ showSkuDrawer: false })
      return
    }

    that.setData({ skuConfirming: true })
    api.put('/api/cart/' + cartItem.id + '/package', { packageId: newPkg.id }).then(function (res) {
      that.setData({ showSkuDrawer: false, skuConfirming: false })
      that.loadCart()
      api.updateCartBadge()
      wx.showToast({ title: (res && res.message) || '已切换套餐', icon: 'success' })
    }).catch(function () {
      that.setData({ skuConfirming: false })
    })
  },

  /** 批量删除 */
  batchRemove: function () {
    var that = this
    var ids = that.data.checkedIds.slice()
    if (ids.length === 0) return

    wx.showModal({
      title: '提示',
      content: '确定删除选中的 ' + ids.length + ' 件商品吗？',
      success: function (res) {
        if (res.confirm) {
          var promises = ids.map(function (id) {
            return api.del('/api/cart/' + id)
          })
          Promise.all(promises).then(function () {
            that.setData({ isEditMode: false })
            that.loadCart()
            api.updateCartBadge()
          })
        }
      }
    })
  },

  clearInvalidItems: function () {
    var that = this
    var ids = that.data.cartItems.filter(function (item) {
      return item.isInvalid
    }).map(function (item) {
      return item.id
    })

    if (!ids.length) return

    wx.showModal({
      title: '清理失效商品',
      content: '确定删除购物车中 ' + ids.length + ' 件失效商品吗？',
      confirmText: '清理',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (!res.confirm) return
        Promise.all(ids.map(function (id) {
          return api.del('/api/cart/' + id)
        })).then(function () {
          wx.showToast({ title: '已清理', icon: 'success' })
          that.loadCart()
          api.updateCartBadge()
        })
      }
    })
  },

  goCheckout: function () {
    var ids = this.data.checkedIds
    if (ids.length === 0) {
      wx.showToast({ title: '请选择商品', icon: 'none' })
      return
    }
    var url = '/pages/shop/checkout/index?cartItemIds=' + ids.join(',')
    if (this.data.deliveryAddress && this.data.deliveryAddress.id) {
      url += '&addressId=' + this.data.deliveryAddress.id
    }
    wx.navigateTo({ url: url })
  },

  goShopping: function () {
    wx.switchTab({ url: '/pages/shop/index' })
  }
})
