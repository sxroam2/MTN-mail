var api = require('../../../utils/api.js')
var afterSalesUtil = require('../../../utils/after-sales.js')
var imageUtil = require('../../../utils/image.js')

var STATUS_TEXT = {
  0: '待付款',
  1: '待发货',
  2: '待收货',
  3: '已完成',
  4: '交易关闭',
  5: '售后处理中',
  6: '已退款',
  7: '支付中'
}

var TABS = [
  { title: '全部', status: '' },
  { title: '待付款', status: '0' },
  { title: '待发货', status: '1' },
  { title: '待收货', status: '2' },
  { title: '已完成', status: '3' },
  { title: '退款/售后', status: '5,6' }
]

var DEFAULT_PAYMENT_WINDOW_SECONDS = 15 * 60

function hasDeliveredLogisticsSignal(order) {
  if (order && order.logisticsSignedTime) {
    return true
  }

  var logisticsStatus = String(order && order.logisticsStatus || '').trim().toLowerCase()
  if (!logisticsStatus) {
    return false
  }

  return /已签收|签收|妥投|已妥投|delivered|signed|received/.test(logisticsStatus)
}

function canConfirmReceipt(order) {
  return Number(order && order.orderStatus) === 2 && hasDeliveredLogisticsSignal(order)
}

Page({
  data: {
    tabs: TABS,
    activeTab: 0,
    orders: [],
    pageLoading: true,
    listLoading: false,
    loadingMore: false,
    hasLoadedOnce: false,
    pageIndex: 1,
    pageSize: 10,
    hasMore: true,
    isEmpty: false,
    searchKeyword: '',
    appliedKeyword: '',
    showCancelPopup: false,
    cancelOrderNo: ''
  },

  _timer: null,
  _loadRequestSeq: 0,
  _productPackageCache: null,

  onLoad: function (options) {
    this._productPackageCache = {}
    this._loadRequestSeq = 0
    if (options.tab) {
      this.setData({ activeTab: this.normalizeActiveTabIndex(options.tab) })
    }
  },

  onShow: function () {
    this.resetAndLoad()
  },

  onHide: function () {
    this.stopCountdownTicker()
  },

  onUnload: function () {
    this.stopCountdownTicker()
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.pageLoading && !this.data.listLoading && !this.data.loadingMore) {
      this.loadOrders({ append: true })
    }
  },

  onPullDownRefresh: function () {
    this.resetAndLoad({ refreshMode: this.data.hasLoadedOnce ? 'list' : 'page' }).then(function () {
      wx.stopPullDownRefresh()
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  onTabChange: function (e) {
    var refreshMode = this.data.hasLoadedOnce ? 'list' : 'page'
    var detail = e && e.detail ? e.detail : {}
    var nextActiveTab = this.normalizeActiveTabIndex(typeof detail.index !== 'undefined' ? detail.index : detail.name)
    this.stopCountdownTicker()
    this.setData({
      activeTab: nextActiveTab,
      pageIndex: 1,
      orders: [],
      hasMore: true,
      isEmpty: false
    })
    this.loadOrders({ refreshMode: refreshMode })
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value || '' })
  },

  clearSearchInput: function () {
    var refreshMode = this.data.hasLoadedOnce ? 'list' : 'page'
    if (!this.data.searchKeyword && !this.data.appliedKeyword) {
      return
    }

    this.stopCountdownTicker()
    this.setData({
      searchKeyword: '',
      appliedKeyword: '',
      pageIndex: 1,
      orders: [],
      hasMore: true,
      isEmpty: false
    })
    this.loadOrders({ refreshMode: refreshMode })
  },

  doSearch: function () {
    var refreshMode = this.data.hasLoadedOnce ? 'list' : 'page'
    var keyword = String(this.data.searchKeyword || '').trim()
    this.stopCountdownTicker()
    this.setData({
      searchKeyword: keyword,
      appliedKeyword: keyword,
      pageIndex: 1,
      orders: [],
      hasMore: true,
      isEmpty: false
    })
    this.loadOrders({ refreshMode: refreshMode })
  },

  resetAndLoad: function (options) {
    this.stopCountdownTicker()
    this.setData({ pageIndex: 1, orders: [], hasMore: true, isEmpty: false })
    return this.loadOrders({
      refreshMode: options && options.refreshMode ? options.refreshMode : (this.data.hasLoadedOnce ? 'list' : 'page')
    })
  },

  normalizeActiveTabIndex: function (value) {
    var index = Number(value)
    if (!Number.isFinite(index) || index < 0 || index >= TABS.length) {
      return 0
    }
    return index
  },

  getActiveTabIndex: function () {
    return this.normalizeActiveTabIndex(this.data.activeTab)
  },

  loadOrders: function (options) {
    options = options || {}
    var that = this
    var append = Boolean(options.append)
    var refreshMode = options.refreshMode || (that.data.hasLoadedOnce ? 'list' : 'page')
    var requestSeq = ++that._loadRequestSeq
    var activeTabIndex = that.getActiveTabIndex()

    if (that.data.activeTab !== activeTabIndex) {
      that.setData({ activeTab: activeTabIndex })
    }

    if (append) {
      that.setData({ loadingMore: true })
    } else if (refreshMode === 'page') {
      that.setData({ pageLoading: true })
    } else {
      that.setData({ listLoading: true })
    }

    var query = {
      pageIndex: that.data.pageIndex,
      pageSize: that.data.pageSize
    }
    var status = TABS[activeTabIndex].status
    if (status !== '') query.status = status
    if (that.data.appliedKeyword) query.keyword = that.data.appliedKeyword

    return api.get('/api/orders/my', { data: query }).then(function (res) {
      if (requestSeq !== that._loadRequestSeq) {
        return
      }

      var data = res.data || res
      var list = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : [])
      var normalizedOrders = list.map(function (order) {
        return that.normalizeOrder(order)
      })

      return that.attachOrderItems(normalizedOrders).then(function (items) {
        if (requestSeq !== that._loadRequestSeq) {
          return
        }

        var allOrders = append ? that.data.orders.concat(items) : items
        that.setData({
          orders: allOrders,
          pageLoading: false,
          listLoading: false,
          loadingMore: false,
          hasLoadedOnce: true,
          isEmpty: allOrders.length === 0,
          hasMore: items.length >= that.data.pageSize,
          pageIndex: that.data.pageIndex + 1
        })
        that.syncCountdownTicker(allOrders)
      })
    }).catch(function () {
      if (requestSeq !== that._loadRequestSeq) {
        return
      }

      that.setData({
        pageLoading: false,
        listLoading: false,
        loadingMore: false
      })
      that.stopCountdownTicker()
    })
  },

  normalizeOrder: function (order) {
    var remainingSeconds = this.getRemainingSeconds(order)
    var isExpired = this.isOrderExpired(order, remainingSeconds)
    var fallbackProductItems = [this.buildFallbackProductItem(order)]
    var showRefundClosedBuyAgainOnly = afterSalesUtil.shouldShowRefundClosedBuyAgain(order)

    return {
      orderNo: order.orderNo,
      orderStatus: order.orderStatus,
      expireTime: order.expireTime,
      statusText: this.getStatusText(order, remainingSeconds),
      statusTone: this.getStatusTone(order, remainingSeconds),
      payAmountText: this.formatAmount(order.payAmount),
      totalAmountText: this.formatAmount(order.totalAmount),
      createTimeText: this.formatTime(order.createTime),
      logisticsText: this.getLogisticsText(order),
      logisticsNo: order.logisticsNo || '',
      remainingSeconds: remainingSeconds,
      countdownText: this.formatCountdown(remainingSeconds),
      showCountdown: !isExpired && Boolean(order.expireTime) && (order.orderStatus === 0 || order.orderStatus === 7) && remainingSeconds > 0,
      isExpired: isExpired,
      canPay: !isExpired && (order.orderStatus === 0 || order.orderStatus === 7),
      canCancel: !isExpired && (order.orderStatus === 0 || order.orderStatus === 7),
      canConfirm: canConfirmReceipt(order),
      canDelete: showRefundClosedBuyAgainOnly ? false : order.orderStatus === 4,
      canTrack: showRefundClosedBuyAgainOnly ? false : (Boolean(order.logisticsNo) && (order.orderStatus === 2 || order.orderStatus === 3)),
      canBuyAgain: showRefundClosedBuyAgainOnly || order.orderStatus === 3 || order.orderStatus === 4,
      isExpanded: false,
      displayItemCount: 1,
      productItems: fallbackProductItems,
      visibleItems: fallbackProductItems
    }
  },

  attachOrderItems: function (orders) {
    var that = this
    if (!Array.isArray(orders) || !orders.length) {
      return Promise.resolve([])
    }

    return Promise.all(orders.map(function (order) {
      return api.get('/api/orders/detail/' + order.orderNo, { showError: false }).then(function (res) {
        var data = res.data || res
        var detailItems = Array.isArray(data.items) ? data.items : []
        return {
          order: order,
          detailItems: detailItems
        }
      }).catch(function () {
        return {
          order: order,
          detailItems: []
        }
      })
    })).then(function (orderDetails) {
      var productIds = []
      orderDetails.forEach(function (entry) {
        ;(entry.detailItems || []).forEach(function (item) {
          if (item.productId && productIds.indexOf(item.productId) === -1) {
            productIds.push(item.productId)
          }
        })
      })

      return that.ensureProductPackageCache(productIds).then(function () {
        return orderDetails.map(function (entry) {
          return that.decorateOrderWithItems(entry.order, entry.detailItems)
        })
      })
    })
  },

  ensureProductPackageCache: function (productIds) {
    var that = this
    if (!that._productPackageCache) {
      that._productPackageCache = {}
    }

    var missingIds = (productIds || []).filter(function (productId) {
      return productId && !that._productPackageCache[productId]
    })

    if (!missingIds.length) {
      return Promise.resolve()
    }

    return Promise.all(missingIds.map(function (productId) {
      return api.get('/api/products/' + productId, { showError: false }).then(function (res) {
        var data = res.data || res
        that._productPackageCache[productId] = that.buildPackageMetaMap(data)
      }).catch(function () {
        that._productPackageCache[productId] = {}
      })
    })).then(function () {})
  },

  buildPackageMetaMap: function (detail) {
    var map = {}
    var packages = Array.isArray(detail.packages) ? detail.packages : []

    packages.forEach(function (pkg) {
      var pkgObj = pkg.package || pkg
      var pkgI18n = pkg.i18n || {}
      var packageId = pkgObj.id || pkg.id

      if (!packageId) {
        return
      }

      map[packageId] = {
        name: pkgI18n.name || pkgObj.name || pkg.packageName || pkgObj.sku || '',
        description: pkgI18n.description || pkgObj.description || pkg.description || '',
        thumbUrl: pkgObj.thumbUrl ? imageUtil.resolveImageUrl(pkgObj.thumbUrl) : ''
      }
    })

    return map
  },

  getPackageMeta: function (productId, packageId) {
    if (!productId || !packageId || !this._productPackageCache) {
      return null
    }

    var productPackageMap = this._productPackageCache[productId]
    if (!productPackageMap) {
      return null
    }

    return productPackageMap[packageId] || null
  },

  decorateOrderWithItems: function (order, detailItems) {
    var that = this
    var productItems = Array.isArray(detailItems) && detailItems.length
      ? detailItems.map(function (item, index) {
        return that.buildProductItem(item, index)
      })
      : order.productItems

    return this.syncOrderVisibleItems(Object.assign({}, order, {
      productItems: productItems,
      displayItemCount: productItems.length || 1
    }))
  },

  buildFallbackProductItem: function (order) {
    var packageName = this.normalizePackageName(order.snapProductName || '', order.snapPackageName || '')
    return {
      key: order.orderNo + '-summary',
      imageUrl: imageUtil.resolveImageUrl(order.snapImageUrl || ''),
      productName: order.snapProductName || '商品',
      packageName: packageName,
      packageDescription: this.buildPackageDescription({
        productName: order.snapProductName || '',
        packageName: packageName,
        packageDescription: '',
        sku: order.snapSku || ''
      }),
      priceText: this.formatAmount(order.totalAmount || order.payAmount),
      quantity: 1
    }
  },

  buildProductItem: function (item, index) {
    var packageMeta = this.getPackageMeta(item.productId, item.packageId)
    var packageName = this.normalizePackageName(
      item.snapProductName || '',
      (packageMeta && packageMeta.name) || item.snapPackageName || ''
    )

    return {
      key: String(item.id || index),
      imageUrl: (packageMeta && packageMeta.thumbUrl) || imageUtil.resolveImageUrl(item.snapImageUrl || ''),
      productName: item.snapProductName || '商品',
      packageName: packageName,
      packageDescription: this.buildPackageDescription({
        productName: item.snapProductName || '',
        packageName: packageName,
        packageDescription: (packageMeta && packageMeta.description) || '',
        sku: item.snapSku || ''
      }),
      priceText: this.formatAmount(item.unitPrice),
      quantity: item.quantity || 1
    }
  },

  normalizePackageName: function (productName, packageName) {
    return this.removeLeadingProductName(packageName, productName)
  },

  buildPackageDescription: function (options) {
    var productName = this.trimText(options.productName)
    var packageName = this.trimText(options.packageName)
    var packageDescription = this.removeLeadingProductName(options.packageDescription, productName)
    if (packageDescription && packageDescription !== packageName) {
      return packageDescription
    }

    var sku = this.trimText(options.sku)
    if (sku && sku !== packageName) {
      return sku
    }

    return ''
  },

  removeLeadingProductName: function (text, productName) {
    var normalizedText = this.trimText(text)
    var normalizedProductName = this.trimText(productName)

    if (!normalizedText) {
      return ''
    }

    if (!normalizedProductName) {
      return normalizedText
    }

    if (normalizedText === normalizedProductName) {
      return ''
    }

    if (normalizedText.indexOf(normalizedProductName) === 0) {
      normalizedText = normalizedText.slice(normalizedProductName.length).replace(/^[\s\-—–·/,:：，、()（）【】]+/, '').trim()
    }

    return normalizedText
  },

  trimText: function (value) {
    return String(value || '').trim()
  },

  syncOrderVisibleItems: function (order) {
    var productItems = Array.isArray(order.productItems) && order.productItems.length
      ? order.productItems
      : [this.buildFallbackProductItem(order)]
    var displayItemCount = order.displayItemCount || productItems.length || 1
    var isExpanded = Boolean(order.isExpanded) && displayItemCount > 1

    return Object.assign({}, order, {
      productItems: productItems,
      displayItemCount: displayItemCount,
      isExpanded: isExpanded,
      visibleItems: isExpanded ? productItems : productItems.slice(0, 1)
    })
  },

  isOrderExpired: function (order, remainingSeconds) {
    return Boolean(order.expireTime) && (order.orderStatus === 0 || order.orderStatus === 7) && remainingSeconds <= 0
  },

  getStatusText: function (order, remainingSeconds) {
    if (this.isOrderExpired(order, remainingSeconds)) {
      return '已失效'
    }
    return STATUS_TEXT[order.orderStatus] || '未知状态'
  },

  getStatusTone: function (order, remainingSeconds) {
    if (this.isOrderExpired(order, remainingSeconds)) {
      return 'closed'
    }

    if (order.orderStatus === 0 || order.orderStatus === 7) {
      return 'pending'
    }

    if (order.orderStatus === 1 || order.orderStatus === 2) {
      return 'progress'
    }

    if (order.orderStatus === 3) {
      return 'completed'
    }

    if (order.orderStatus === 5 || order.orderStatus === 6) {
      return 'refund'
    }

    return 'closed'
  },

  getLogisticsText: function (order) {
    if (order.logisticsStatus) {
      return order.logisticsStatus
    }

    if (order.logisticsNo && order.orderStatus === 3) {
      return '已签收'
    }

    if (order.logisticsNo && order.orderStatus === 2) {
      return '运输中'
    }

    return ''
  },

  getRemainingSeconds: function (order) {
    if ((order.orderStatus !== 0 && order.orderStatus !== 7) || !order.expireTime) {
      return 0
    }

    var expireTime = new Date(order.expireTime).getTime()
    if (isNaN(expireTime)) {
      return 0
    }

    return Math.max(0, Math.floor((expireTime - Date.now()) / 1000))
  },

  formatCountdown: function (seconds) {
    if (!seconds || seconds <= 0) {
      return '00:00'
    }

    var mins = Math.floor(seconds / 60)
    var secs = seconds % 60
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs
  },

  syncCountdownTicker: function (orders) {
    this.stopCountdownTicker()
    if (!orders || !orders.some(function (item) { return item.showCountdown })) {
      return
    }

    var that = this
    that._timer = setInterval(function () {
      that.refreshCountdownOrders()
    }, 1000)
  },

  stopCountdownTicker: function () {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  refreshCountdownOrders: function () {
    var that = this
    var currentOrders = that.data.orders || []
    if (!currentOrders.length) {
      that.stopCountdownTicker()
      return
    }

    var shouldReload = false
    var changed = false
    var nextOrders = currentOrders.map(function (order) {
      if (order.orderStatus !== 0 && order.orderStatus !== 7) {
        return order
      }

      var remainingSeconds = that.getRemainingSeconds(order)
      var isExpired = that.isOrderExpired(order, remainingSeconds)
      var nextOrder = Object.assign({}, order, {
        statusText: that.getStatusText(order, remainingSeconds),
        statusTone: that.getStatusTone(order, remainingSeconds),
        remainingSeconds: remainingSeconds,
        countdownText: that.formatCountdown(remainingSeconds),
        showCountdown: !isExpired && Boolean(order.expireTime) && remainingSeconds > 0,
        isExpired: isExpired,
        canPay: !isExpired,
        canCancel: !isExpired && (order.orderStatus === 0 || order.orderStatus === 7)
      })

      if (
        nextOrder.remainingSeconds !== order.remainingSeconds
        || nextOrder.showCountdown !== order.showCountdown
        || nextOrder.statusText !== order.statusText
      ) {
        changed = true
      }

      if (isExpired && !order.isExpired) {
        shouldReload = true
      }

      return nextOrder
    })

    if (shouldReload) {
      that.resetAndLoad()
      return
    }

    if (changed) {
      that.setData({ orders: nextOrders })
    }

    if (!nextOrders.some(function (item) { return item.showCountdown })) {
      that.stopCountdownTicker()
    }
  },

  formatAmount: function (value) {
    var amount = Number(value || 0)
    return amount.toFixed(2)
  },

  formatTime: function (value) {
    if (!value) {
      return ''
    }
    return String(value).replace('T', ' ').substring(0, 16)
  },

  noop: function () {},

  handleSummaryTap: function (e) {
    var displayItemCount = Number(e.currentTarget.dataset.count || 0)
    if (displayItemCount <= 1) {
      return
    }

    this.toggleItemsByOrderNo(e.currentTarget.dataset.no)
  },

  toggleItems: function (e) {
    this.toggleItemsByOrderNo(e.currentTarget.dataset.no)
  },

  toggleItemsByOrderNo: function (orderNo) {
    var nextOrders = (this.data.orders || []).map(function (order) {
      if (order.orderNo !== orderNo) {
        return order
      }

      return Object.assign({}, order, {
        isExpanded: !order.isExpanded,
        visibleItems: !order.isExpanded ? order.productItems : order.productItems.slice(0, 1)
      })
    })

    this.setData({ orders: nextOrders })
  },

  goDetail: function (e) {
    var orderNo = e.currentTarget.dataset.no
    wx.navigateTo({ url: '/pages/shop/order-detail/index?orderNo=' + orderNo })
  },

  requestMiniProgramLoginCode: function () {
    return new Promise(function (resolve, reject) {
      wx.login({
        success: function (res) {
          if (res && res.code) {
            resolve(res.code)
            return
          }
          reject(new Error('微信登录态获取失败，请重试'))
        },
        fail: function () {
          reject(new Error('微信登录态获取失败，请检查网络后重试'))
        }
      })
    })
  },

  isPaymentCanceled: function (err) {
    var errMsg = String(err && (err.errMsg || err.message) || '').toLowerCase()
    return errMsg.indexOf('cancel') !== -1
  },

  resolvePaymentFailureMessage: function (err) {
    var errMsg = String(err && (err.errMsg || err.message) || '').trim()

    if (!errMsg) {
      return '微信支付拉起失败，请稍后重试'
    }

    if (/invalid signature|签名/i.test(errMsg)) {
      return '微信支付签名异常，请稍后重试'
    }

    if (/appid|mchid|商户号|小程序/i.test(errMsg)) {
      return '小程序支付配置异常，请联系管理员'
    }

    return errMsg.length > 22 ? '微信支付拉起失败，请稍后重试' : errMsg
  },

  showPaymentFailure: function (err, cancelMessage) {
    var isCanceled = this.isPaymentCanceled(err)
    var rawMessage = String(err && (err.errMsg || err.message) || '').trim()
    var message = isCanceled ? cancelMessage : this.resolvePaymentFailureMessage(err)

    console.error('[wxpay] requestPayment fail:', err)

    if (!isCanceled && message === '小程序支付配置异常，请联系管理员' && rawMessage) {
      wx.showModal({
        title: '支付失败',
        content: rawMessage,
        showCancel: false
      })
      return rawMessage
    }

    wx.showToast({ title: message, icon: 'none' })
    return message
  },

  payOrder: function (e) {
    var that = this
    var orderNo = e.currentTarget.dataset.no

    that.requestMiniProgramLoginCode().then(function (loginCode) {
      return api.post('/api/pay/miniapp/create', {
        orderNo: orderNo,
        loginCode: loginCode
      })
    }).then(function (res) {
      var payData = res.data || res
      wx.requestPayment({
        timeStamp: payData.timeStamp,
        nonceStr: payData.nonceStr,
        package: payData.packageValue || payData['package'],
        signType: payData.signType || 'RSA',
        paySign: payData.paySign,
        success: function () {
          api.get('/api/orders/status/' + orderNo, { showError: false }).finally(function () {
            wx.showToast({ title: '支付成功', icon: 'success' })
            that.resetAndLoad()
          })
        },
        fail: function (err) {
          var isCanceled = that.isPaymentCanceled(err)
          that.showPaymentFailure(err, '支付取消')
          if (!isCanceled) {
            that.resetAndLoad()
          }
        }
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '发起支付失败', icon: 'none' })
    })
  },

  goLogistics: function (e) {
    var orderNo = e.currentTarget.dataset.no
    wx.navigateTo({ url: '/pages/shop/logistics/index?orderNo=' + orderNo })
  },

  cancelOrder: function (e) {
    var orderNo = e.currentTarget.dataset.no || ''
    var order = (this.data.orders || []).find(function (item) {
      return item.orderNo === orderNo
    })
    if (!orderNo || !order || (Number(order.orderStatus) !== 0 && Number(order.orderStatus) !== 7)) {
      wx.showToast({ title: '支付确认中，暂不能取消订单', icon: 'none' })
      return
    }

    this.setData({
      showCancelPopup: true,
      cancelOrderNo: orderNo
    })
  },

  onCancelPopupClose: function () {
    this.setData({ showCancelPopup: false, cancelOrderNo: '' })
  },

  confirmCancel: function (e) {
    var that = this
    var detail = e && e.detail ? e.detail : {}
    var orderNo = that.data.cancelOrderNo

    if (!orderNo) {
      return
    }

    api.put('/api/orders/cancel/' + orderNo, { cancelReason: detail.reason }).then(function () {
      that.setData({ showCancelPopup: false, cancelOrderNo: '' })

      if (!detail.addToCart) {
        wx.showToast({ title: '已取消', icon: 'success' })
        that.resetAndLoad()
        return
      }

      api.get('/api/orders/detail/' + orderNo, { showError: false }).then(function (res) {
        var data = res.data || res
        var items = Array.isArray(data.items) ? data.items : []
        if (!items.length) {
          wx.showToast({ title: '订单已取消', icon: 'success' })
          return null
        }

        return Promise.all(items.map(function (item) {
          return api.post('/api/cart', {
            packageId: item.packageId || 0,
            productId: item.productId || 0,
            quantity: item.quantity || 1
          }, { showError: false })
        }))
      }).then(function (result) {
        if (result) {
          api.updateCartBadge()
          wx.showToast({ title: '已取消，商品已加入购物车', icon: 'none', duration: 2000 })
        }
      }).finally(function () {
        that.resetAndLoad()
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
    })
  },

  confirmReceipt: function (e) {
    var that = this
    var orderNo = e.currentTarget.dataset.no
    var order = (that.data.orders || []).find(function (item) {
      return item.orderNo === orderNo
    })

    if (!canConfirmReceipt(order)) {
      wx.showToast({ title: '物流未签收，暂不能确认收货', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认收货',
      content: '确认已经收到商品吗？',
      success: function (res) {
        if (res.confirm) {
          api.put('/api/orders/confirm-receipt/' + orderNo, null, { showError: false }).then(function () {
            wx.showToast({ title: '已确认', icon: 'success' })
            that.resetAndLoad()
          }).catch(function (err) {
            wx.showToast({ title: (err && err.message) || '确认收货失败', icon: 'none' })
          })
        }
      }
    })
  },

  goShopping: function () {
    wx.switchTab({ url: '/pages/shop/index' })
  },

  buyAgain: function (e) {
    var orderNo = e.currentTarget.dataset.no
    wx.showLoading({ title: '处理中', mask: true })

    api.get('/api/orders/detail/' + orderNo, { showError: false }).then(function (res) {
      var data = res.data || res
      var items = Array.isArray(data.items) ? data.items : []
      if (!items.length) {
        return null
      }

      return Promise.all(items.map(function (item) {
        return api.post('/api/cart', {
          productId: item.productId || 0,
          packageId: item.packageId || 0,
          quantity: item.quantity || 1
        }, { showError: false })
      }))
    }).then(function (result) {
      if (!result) {
        wx.showToast({ title: '暂无可再次购买商品', icon: 'none' })
        return
      }

      api.updateCartBadge()
      wx.showToast({ title: '已加入购物车', icon: 'success' })
      setTimeout(function () {
        wx.switchTab({ url: '/pages/shop/cart/index' })
      }, 500)
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    }).finally(function () {
      wx.hideLoading()
    })
  },

  deleteOrder: function (e) {
    var that = this
    var orderNo = e.currentTarget.dataset.no
    var order = (that.data.orders || []).find(function (item) {
      return item.orderNo === orderNo
    })
    if (!order || Number(order.orderStatus) !== 4) {
      wx.showToast({ title: '仅交易关闭订单可删除', icon: 'none' })
      return
    }
    wx.showModal({
      title: '提示',
      content: '确定删除该订单吗？删除后不可恢复',
      success: function (res) {
        if (res.confirm) {
          api.del('/api/orders/' + orderNo).then(function () {
            wx.showToast({ title: '已删除', icon: 'success' })
            that.resetAndLoad()
          })
        }
      }
    })
  }
})
