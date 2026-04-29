var api = require('../../../utils/api.js')
var imageUtil = require('../../../utils/image.js')
var addressUtil = require('../../../utils/address.js')
var productPackageDisplay = require('../../../utils/product-package-display.js')

var NEW_ORDER_TEMPLATE_ID = 'XkORS_dLF7JMx0BLbV6B-Rv5P_1ZT9ylT8UUMQEExak'
var SHIPPED_TEMPLATE_ID = 'UAUfykwxEKqQfP7VTS0WmuHFziBoAV771f6YoymSDWY'
var UNPAID_TEMPLATE_ID = 'kztkKNNQCVZQPrqG-XI1fTuTGBYaRqmCKOnk4N1t_Ug'
var ORDER_SUBSCRIBE_TEMPLATE_IDS = [
  NEW_ORDER_TEMPLATE_ID,
  SHIPPED_TEMPLATE_ID,
  UNPAID_TEMPLATE_ID
]
var PAYMENT_RESUME_MAX_RETRIES = 8
var PAYMENT_RESUME_RETRY_INTERVAL = 1500

function isTemplateAccepted(status) {
  return status === 'accept' || status === 'acceptAlways'
}

Page({
  data: {
    address: null,
    selectedAddressId: 0,
    cartItems: [],
    cartItemIds: [],
    buyNowProductId: 0,
    buyNowPackageId: 0,
    buyNowQuantity: 0,
    totalAmount: 0,
    originalTotalAmount: 0,
    totalDiscount: 0,
    totalItemCount: 0,
    shippingFee: 0,
    payAmount: 0,
    remark: '',
    invoice: null,      // 发票信息
    invoiceDrawerVisible: false,
    invoiceNoticeVisible: false,
    invoiceForm: {
      type: 0,               // 0 不开发票 1 普通发票 2 专用发票
      subject: 'personal',   // personal / corporate
      title: '',
      email: '',
      taxNo: '',
      regAddress: '',
      regPhone: '',
      bankName: '',
      bankAccount: ''
    },
    submitting: false,
    loading: true
  },

  onLoad: function (options) {
    this._productPackageCache = {}
    this._pendingPaymentOrderNo = ''
    this._paymentResumeTimer = null
    var ids = (options.cartItemIds || '').split(',').map(Number).filter(Boolean)
    this.setData({
      cartItemIds: ids,
      buyNowProductId: Number(options.buyNowProductId) || 0,
      buyNowPackageId: Number(options.buyNowPackageId) || 0,
      buyNowQuantity: Number(options.buyNowQuantity) || 0,
      selectedAddressId: Number(options.addressId) || 0
    })
    this.loadData()
  },

  onShow: function () {
    // 从地址选择页返回时读取选中地址
    var pages = getCurrentPages()
    var current = pages[pages.length - 1]
    if (current._selectedAddress) {
      if (addressUtil.isDomesticAddress(current._selectedAddress)) {
        this.setData({
          address: current._selectedAddress,
          selectedAddressId: current._selectedAddress.id
        })
      } else {
        wx.showToast({ title: '小程序暂不支持国际地址', icon: 'none' })
      }
      current._selectedAddress = null
      this.calcPrice()
    }
    // 从发票页返回时读取发票信息
    if (current._invoiceInfo) {
      this.setData({ invoice: current._invoiceInfo })
      current._invoiceInfo = null
    }

    this.resumePendingPaymentIfNeeded(0)
  },

  onUnload: function () {
    this.clearPaymentResumeTimer()
  },

  loadBuyNowItems: function () {
    var that = this
    var productId = Number(that.data.buyNowProductId) || 0
    var packageId = Number(that.data.buyNowPackageId) || 0
    var quantity = Math.max(1, Number(that.data.buyNowQuantity) || 1)

    if (!productId || !packageId) {
      return Promise.reject(new Error('立即购买商品信息无效'))
    }

    return api.get('/api/sitepublic/product-detail/' + productId).then(function (res) {
      var data = res.data || res || {}
      var detail = data.productDetail || {}
      var product = detail.product || {}
      var productI18n = detail.i18n || {}
      var matchedPackage = (detail.packages || []).map(function (pkg) {
        var pkgObj = pkg.package || pkg || {}
        var pkgI18n = pkg.i18n || {}
        return {
          id: pkgObj.id || pkg.id,
          productId: pkgObj.productId || product.id || productId,
          productName: productI18n.name || product.name || product.title || product.sku || '',
          packageName: pkgI18n.name || pkgObj.name || pkg.packageName || pkgObj.sku || '',
          imageUrl: imageUtil.resolveImageUrl(pkgObj.thumbUrl || ''),
          price: Number(pkgObj.price || pkg.price || 0),
          originalPrice: Number(product.originalPrice || pkgObj.originalPrice || pkg.originalPrice || 0),
          stock: Number(pkgObj.stock || pkg.stock || 0),
          quantity: quantity
        }
      }).find(function (item) {
        return Number(item.id) === packageId
      })

      if (!matchedPackage) {
        throw new Error('立即购买套餐不存在或已下架')
      }

      if (matchedPackage.stock <= 0 || quantity > matchedPackage.stock) {
        throw new Error('库存不足')
      }

      return [matchedPackage]
    })
  },

  /** 加载结算数据 */
  loadData: function () {
    var that = this
    that.setData({ loading: true })
    var isBuyNowMode = !!that.data.buyNowPackageId
    var itemTask = isBuyNowMode ? that.loadBuyNowItems() : api.get('/api/cart')
    var tasks = [
      itemTask,
      api.get('/api/address'),
      api.get('/api/config/express')
    ]
    Promise.all(tasks).then(function (results) {
      var sourceItems = results[0].data || results[0] || []
      var addresses = addressUtil.filterDomesticAddresses(results[1].data || results[1] || [])
      var expressRules = results[2].data || results[2] || []
      that._expressRules = expressRules

      var cartItems = isBuyNowMode
        ? sourceItems.map(function (item) {
            return {
              id: item.id || 0,
              productId: item.productId,
              packageId: item.packageId,
              productName: item.productName,
              packageName: item.packageName,
              imageUrl: item.imageUrl,
              price: item.price,
              originalPrice: item.originalPrice || 0,
              quantity: item.quantity
            }
          })
        : sourceItems.filter(function (item) {
            return that.data.cartItemIds.indexOf(item.cartItem.id) >= 0
          }).map(function (item) {
            return {
              id: item.cartItem.id,
              productId: item.cartItem.productId,
              packageId: item.cartItem.packageId,
              productName: item.productName,
              packageName: item.packageName,
              imageUrl: imageUtil.resolveImageUrl(item.imageUrl),
              price: item.price,
              originalPrice: item.originalPrice || 0,
              quantity: item.cartItem.quantity
            }
          })

      var productIds = cartItems.map(function (item) {
        return item.productId
      }).filter(function (productId, index, array) {
        return productId && array.indexOf(productId) === index
      })

      var address = addressUtil.isDomesticAddress(that.data.address) ? that.data.address : null
      if (!address) {
        address = addresses.find(function (a) { return a.id === that.data.selectedAddressId })
          || addresses.find(function (a) { return a.isDefault })
          || addresses[0]
          || null
      }

      productPackageDisplay.ensureProductPackageCache(api, that._productPackageCache, productIds).catch(function () {
        return that._productPackageCache
      }).then(function () {
        var displayItems = cartItems.map(function (item) {
          return productPackageDisplay.decorateCartItem(item, that._productPackageCache)
        })
        that.setData({ cartItems: displayItems, address: address, loading: false })
        that.calcPrice()
      })
    }).catch(function () {
      that.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /** 计算价格 */
  calcPrice: function () {
    var total = 0
    var originalTotal = 0
    var count = 0
    this.data.cartItems.forEach(function (item) {
      total += item.price * item.quantity
      var origPrice = item.originalPrice && item.originalPrice > item.price ? item.originalPrice : item.price
      originalTotal += origPrice * item.quantity
      count += item.quantity
    })
    var shipping = this._calcShippingFee(total, this.data.address)
    var discount = Math.round((originalTotal - total) * 100) / 100
    var pay = Math.max(0, total + shipping)
    this.setData({
      totalAmount: Math.round(total * 100) / 100,
      originalTotalAmount: Math.round(originalTotal * 100) / 100,
      totalDiscount: discount > 0 ? discount : 0,
      totalItemCount: count,
      shippingFee: shipping,
      payAmount: Math.round(pay * 100) / 100
    })
  },

  /** 根据后台运费规则计算运费 */
  _calcShippingFee: function (totalAmount, address) {
    var rules = (this._expressRules || []).slice().sort(function (left, right) {
      var leftSort = Number(left && left.sortOrder) || 0
      var rightSort = Number(right && right.sortOrder) || 0
      if (leftSort !== rightSort) return leftSort - rightSort
      return (Number(left && left.id) || 0) - (Number(right && right.id) || 0)
    })

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i]
      var conditionType = String(rule && rule.conditionType || '').trim().toLowerCase()
      switch (conditionType) {
        case 'amount_gte':
          if (totalAmount >= Number(rule.conditionValue)) return Number(rule.shippingFee) || 0
          break
        case 'amount_lt':
          if (totalAmount < Number(rule.conditionValue)) return Number(rule.shippingFee) || 0
          break
        case 'region_contains':
          if (this._matchRegionShippingRule(rule, address)) return Number(rule.shippingFee) || 0
          break
        case 'default':
          return Number(rule.shippingFee) || 0
      }
    }
    return 0
  },

  _matchRegionShippingRule: function (rule, address) {
    var keyword = String(rule && rule.conditionValue || '').trim().toLowerCase()
    if (!keyword) return false

    var addressText = this._buildAddressText(address).toLowerCase()
    return !!addressText && addressText.indexOf(keyword) >= 0
  },

  _buildAddressText: function (address) {
    if (!address) return ''

    var isInternational = !!(address.country || address.state)
    var parts = isInternational
      ? [address.country, address.state, address.city, address.detailAddress]
      : [address.province, address.city, address.district, address.street, address.detailAddress]

    return parts.filter(function (item) {
      return !!String(item || '').trim()
    }).join(' ')
  },

  /** 选择地址 */
  selectAddress: function () {
    wx.navigateTo({ url: '/pages/shop/address/index?select=1' })
  },

  /** 跳转发票填写（保留老入口，弹窗为主） */
  goInvoice: function () {
    this.openInvoiceDrawer()
  },

  /** 打开发票弹窗 */
  openInvoiceDrawer: function () {
    // 如果已有发票信息，回填到 form
    var form = this.data.invoiceForm
    var invoice = this.data.invoice
    if (invoice) {
      form = {
        type: invoice.type || 1,
        subject: invoice.taxNo ? 'corporate' : 'personal',
        title: invoice.title || '',
        email: invoice.email || '',
        taxNo: invoice.taxNo || '',
        regAddress: invoice.regAddress || '',
        regPhone: invoice.regPhone || '',
        bankName: invoice.bankName || '',
        bankAccount: invoice.bankAccount || ''
      }
    } else {
      // 默认打开时选中普通发票 + 企业
      form.type = 1
      form.subject = 'corporate'
    }
    this.setData({ invoiceDrawerVisible: true, invoiceForm: form })
  },

  /** 关闭发票弹窗 */
  closeInvoiceDrawer: function () {
    this.setData({ invoiceDrawerVisible: false })
  },

  noop: function () {},

  /** 切换发票类型 */
  switchInvoiceType: function (e) {
    var type = Number(e.currentTarget.dataset.type)
    var updates = { 'invoiceForm.type': type }
    // 专用发票强制企业
    if (type === 2) {
      updates['invoiceForm.subject'] = 'corporate'
    }
    this.setData(updates)
  },

  /** 切换开票主体 */
  switchInvoiceSubject: function (e) {
    var subject = e.currentTarget.dataset.subject
    this.setData({ 'invoiceForm.subject': subject })
  },

  /** 发票字段输入 */
  onInvoiceFieldInput: function (e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['invoiceForm.' + field]: e.detail.value })
  },

  /** 保存发票 */
  saveInvoice: function () {
    var form = this.data.invoiceForm
    if (form.type === 0) {
      this.setData({ invoice: null, invoiceDrawerVisible: false })
      return
    }
    if (!form.title) {
      wx.showToast({ title: '请填写发票抬头', icon: 'none' })
      return
    }
    if (!form.email) {
      wx.showToast({ title: '请填写接收邮箱', icon: 'none' })
      return
    }    // 邮箱格式验证
    var emailReg = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
    if (!emailReg.test(form.email)) {
      wx.showToast({ title: '请输入正确的邮箱地址', icon: 'none' })
      return
    }    if (form.subject === 'corporate' && !form.taxNo) {
      wx.showToast({ title: '请填写企业税号', icon: 'none' })
      return
    }
    this.setData({
      invoice: {
        type: form.type,
        title: form.title,
        email: form.email,
        taxNo: form.subject === 'corporate' ? form.taxNo : '',
        regAddress: form.subject === 'corporate' ? form.regAddress : '',
        regPhone: form.subject === 'corporate' ? form.regPhone : '',
        bankName: form.subject === 'corporate' ? form.bankName : '',
        bankAccount: form.subject === 'corporate' ? form.bankAccount : ''
      },
      invoiceDrawerVisible: false
    })
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  /** 显示发票须知 */
  showInvoiceNotice: function () {
    this.setData({ invoiceNoticeVisible: true })
  },

  /** 关闭发票须知 */
  closeInvoiceNotice: function () {
    this.setData({ invoiceNoticeVisible: false })
  },

  /** 备注输入 */
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value })
  },

  requestOrderSubscriptions: function () {
    return new Promise(function (resolve) {
      if (typeof wx.requestSubscribeMessage !== 'function') {
        resolve({
          subscribeNewOrderReminder: false,
          subscribeShippedReminder: false,
          subscribeUnpaidReminder: false
        })
        return
      }

      wx.requestSubscribeMessage({
        tmplIds: ORDER_SUBSCRIBE_TEMPLATE_IDS,
        success: function (res) {
          resolve({
            subscribeNewOrderReminder: isTemplateAccepted(res[NEW_ORDER_TEMPLATE_ID]),
            subscribeShippedReminder: isTemplateAccepted(res[SHIPPED_TEMPLATE_ID]),
            subscribeUnpaidReminder: isTemplateAccepted(res[UNPAID_TEMPLATE_ID])
          })
        },
        fail: function (err) {
          console.warn('requestSubscribeMessage fail:', err)
          resolve({
            subscribeNewOrderReminder: false,
            subscribeShippedReminder: false,
            subscribeUnpaidReminder: false
          })
        }
      })
    })
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

  clearPaymentResumeTimer: function () {
    if (this._paymentResumeTimer) {
      clearTimeout(this._paymentResumeTimer)
      this._paymentResumeTimer = null
    }
  },

  rememberPendingPayment: function (orderNo) {
    this._pendingPaymentOrderNo = String(orderNo || '')
    this.clearPaymentResumeTimer()
  },

  clearPendingPayment: function () {
    this._pendingPaymentOrderNo = ''
    this.clearPaymentResumeTimer()
  },

  redirectToPayResult: function (orderNo) {
    var targetUrl = '/pages/shop/pay-result/index?orderNo=' + orderNo + '&status=success'
    wx.redirectTo({
      url: targetUrl,
      fail: function () {
        wx.reLaunch({ url: targetUrl })
      }
    })
  },

  redirectToOrderDetail: function (orderNo) {
    var targetUrl = '/pages/shop/order-detail/index?orderNo=' + orderNo
    wx.redirectTo({
      url: targetUrl,
      fail: function () {
        wx.reLaunch({ url: targetUrl })
      }
    })
  },

  resumePendingPaymentIfNeeded: function (retryCount) {
    var that = this
    var orderNo = String(that._pendingPaymentOrderNo || '')
    if (!orderNo) {
      return
    }

    that.clearPaymentResumeTimer()
    api.get('/api/orders/status/' + orderNo, { showError: false }).then(function (res) {
      var data = res.data || res || {}
      var payStatus = Number(data.payStatus)
      var orderStatus = Number(data.orderStatus)
      var isPaid = payStatus === 1 || orderStatus === 1 || orderStatus === 2 || orderStatus === 3 || orderStatus === 5
      var isClosed = orderStatus === 4 || payStatus === 2 || payStatus === 5

      if (isPaid) {
        that.clearPendingPayment()
        that.redirectToPayResult(orderNo)
        return
      }

      if (isClosed || retryCount >= PAYMENT_RESUME_MAX_RETRIES) {
        that.clearPendingPayment()
        return
      }

      that._paymentResumeTimer = setTimeout(function () {
        that.resumePendingPaymentIfNeeded(retryCount + 1)
      }, PAYMENT_RESUME_RETRY_INTERVAL)
    }).catch(function () {
      if (retryCount >= PAYMENT_RESUME_MAX_RETRIES) {
        that.clearPendingPayment()
        return
      }

      that._paymentResumeTimer = setTimeout(function () {
        that.resumePendingPaymentIfNeeded(retryCount + 1)
      }, PAYMENT_RESUME_RETRY_INTERVAL)
    })
  },

  /** 提交订单 */
  submitOrder: function () {
    var that = this
    if (!that.data.address) {
      wx.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }
    if (that.data.cartItems.length === 0) {
      wx.showToast({ title: '无商品可结算', icon: 'none' })
      return
    }
    that.setData({ submitting: true })
    that.requestOrderSubscriptions().then(function (subscribeResult) {
      var orderData = {
        addressId: that.data.address.id,
        cartItemIds: that.data.cartItemIds,
        payMethod: 2,
        invoiceType: 0,
        remark: that.data.remark,
        subscribeNewOrderReminder: !!subscribeResult.subscribeNewOrderReminder,
        subscribeShippedReminder: !!subscribeResult.subscribeShippedReminder,
        subscribeUnpaidReminder: !!subscribeResult.subscribeUnpaidReminder
      }

      if (that.data.buyNowPackageId) {
        orderData.buyNowPackageId = that.data.buyNowPackageId
        orderData.buyNowQuantity = Math.max(1, Number(that.data.buyNowQuantity) || 1)
      }

      if (that.data.invoice) {
        orderData.invoiceType = that.data.invoice.type || 0
        orderData.invoiceTitle = that.data.invoice.title || ''
        orderData.invoiceTaxNo = that.data.invoice.taxNo || ''
        orderData.invoiceEmail = that.data.invoice.email || ''
      }

      return api.post('/api/orders', orderData)
    }).then(function (res) {
      var orderNo = res.data || res
      api.updateCartBadge()
      that.requestPayment(orderNo)
    }).catch(function () {
      that.setData({ submitting: false })
    })
  },

  /** 发起微信支付 */
  requestPayment: function (orderNo) {
    var that = this
    that.requestMiniProgramLoginCode().then(function (loginCode) {
      return api.post('/api/pay/miniapp/create', {
        orderNo: orderNo,
        loginCode: loginCode
      })
    }).then(function (res) {
      var payData = res.data || res
      that.rememberPendingPayment(orderNo)
      wx.requestPayment({
        timeStamp: payData.timeStamp,
        nonceStr: payData.nonceStr,
        package: payData.packageValue || payData['package'],
        signType: payData.signType || 'RSA',
        paySign: payData.paySign,
        success: function () {
          that.clearPendingPayment()
          that.redirectToPayResult(orderNo)
        },
        fail: function (err) {
          that.clearPendingPayment()
          var isCanceled = that.isPaymentCanceled(err)
          wx.showToast({
            title: isCanceled ? '已取消支付，可在订单详情继续支付' : that.resolvePaymentFailureMessage(err),
            icon: 'none'
          })
          that.redirectToOrderDetail(orderNo)
        }
      })
    }).catch(function (err) {
      that.clearPendingPayment()
      var message = err && err.message ? err.message : '发起支付失败，可在订单详情继续支付'
      wx.showToast({ title: message, icon: 'none' })
      that.redirectToOrderDetail(orderNo)
    }).finally(function () {
      that.setData({ submitting: false })
    })
  }
})
