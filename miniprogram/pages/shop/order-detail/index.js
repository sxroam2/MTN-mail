var api = require('../../../utils/api.js')
var afterSalesUtil = require('../../../utils/after-sales.js')
var productPackageDisplay = require('../../../utils/product-package-display.js')
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

function isPendingPaymentStatus(orderStatus) {
  return orderStatus === 0 || orderStatus === 7
}

function getOrderStatusText(orderStatus) {
  return STATUS_TEXT[orderStatus] || '未知状态'
}

function shouldLoadLogistics(order) {
  return Boolean(order && order.logisticsNo)
}

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

function getInvoiceStatusText(order) {
  var status = Number(order && order.invoiceStatus || 0)
  var map = {
    0: '未申请',
    1: '开票中',
    2: '已开票',
    3: '发送失败'
  }
  return map[status] || '未申请'
}

function hasInvoiceDownloadFiles(order) {
  return !!(order && (order.invoiceFileUrl || order.invoiceOfdUrl || order.invoiceZipUrl))
}

function getInvoiceNoticeText(order) {
  var status = Number(order && order.invoiceStatus || 0)
  var email = String(order && order.invoiceEmail || '').trim()

  if (status === 2) {
    return email
      ? '电子发票已开具，请前往接收邮箱查看。'
      : '电子发票已开具，请联系工作人员协助查看。'
  }

  if (status === 1) {
    return email
      ? '发票开具完成后会发送到接收邮箱，请留意查收。'
      : '发票正在开具中，完成后可联系工作人员查看。'
  }

  return ''
}

function canApplyInvoice(order) {
  return Number(order && order.orderStatus) === 3
    && Number(order && order.invoiceStatus || 0) === 0
    && !hasInvoiceDownloadFiles(order)
}

function shouldShowInvoiceSection(order) {
  return canApplyInvoice(order)
    || Number(order && order.invoiceStatus || 0) > 0
    || hasInvoiceDownloadFiles(order)
    || !!String(order && order.invoiceTitle || '').trim()
    || !!String(order && order.invoiceEmail || '').trim()
}

var RETURN_LOGISTICS_PREFIX_RULES = [
  { prefix: 'JDK', company: '京东快递' },
  { prefix: 'DPK', company: '丹鸟物流' },
  { prefix: 'CAI', company: '菜鸟橙运' },
  { prefix: 'SF', company: '顺丰速运' },
  { prefix: 'JD', company: '京东快递' },
  { prefix: 'YT', company: '圆通速递' },
  { prefix: 'JT', company: '极兔速递' },
  { prefix: 'DN', company: '丹鸟物流' },
  { prefix: 'KY', company: '跨越速运' },
  { prefix: 'UC', company: '优速快递' },
  { prefix: 'ZP', company: '中通快运' }
]

var RETURN_LOGISTICS_NUMERIC_RULES = [
  { prefixes: ['754', '755'], company: '菜鸟橙运' },
  { prefixes: ['75', '78', '73'], company: '中通快递' },
  { prefixes: ['88', '12', '77'], company: '申通快递' },
  { prefixes: ['38', '39', '19', '46'], company: '韵达速递' },
  { prefixes: ['98', '96', '97'], company: '邮政快递包裹' },
  { prefixes: ['80'], company: '极兔速递' },
  { prefixes: ['90'], company: '优速快递' },
  { prefixes: ['13', '10', '94'], company: 'EMS' }
]

function resolveReturnLogisticsCompany(logisticsNo) {
  var normalizedNo = String(logisticsNo || '').trim().toUpperCase()
  if (!normalizedNo) return ''

  var prefixMatch = RETURN_LOGISTICS_PREFIX_RULES.find(function (item) {
    return normalizedNo.indexOf(item.prefix) === 0
  })
  if (prefixMatch) return prefixMatch.company

  if (!/^\d+$/.test(normalizedNo)) return ''

  var numericMatch = RETURN_LOGISTICS_NUMERIC_RULES.find(function (item) {
    return item.prefixes.some(function (prefix) {
      return normalizedNo.indexOf(prefix) === 0
    })
  })

  return numericMatch ? numericMatch.company : ''
}

function canEditAfterSalesTracking(request) {
  return String(request && request.shippingMethod || '').toLowerCase() === 'self'
    && [2, 3, 4].indexOf(Number(request && request.afterSaleStatus)) === -1
}

function getAfterSalesHistoryUpdatedAtMs(entry) {
  var updatedAt = afterSalesUtil.parseTime(entry && entry.updatedAt)
  return updatedAt ? updatedAt.getTime() : 0
}

function sortAfterSalesHistoryByUpdatedAtDesc(list) {
  return Array.isArray(list) ? list.slice().sort(function (left, right) {
    return getAfterSalesHistoryUpdatedAtMs(right) - getAfterSalesHistoryUpdatedAtMs(left)
  }) : []
}

function resolveEffectiveReturnTrackingNo(request) {
  var directTrackingNo = String(request && request.returnTrackingNo || '').trim()
  if (directTrackingNo) {
    return directTrackingNo
  }

  var fulfillmentTrackingNo = sortAfterSalesHistoryByUpdatedAtDesc(request && request.fulfillmentChangeHistory)
    .filter(function (item) {
      return String(item && item.changeType || '').toLowerCase() === 'return-logistics'
    })
    .map(function (item) {
      return String(item && item.returnTrackingNo || '').trim()
    })
    .find(function (item) {
      return !!item
    })

  if (fulfillmentTrackingNo) {
    return fulfillmentTrackingNo
  }

  return sortAfterSalesHistoryByUpdatedAtDesc(request && request.returnTrackingHistory)
    .map(function (item) {
      return String(item && item.trackingNo || '').trim()
    })
    .find(function (item) {
      return !!item
    }) || ''
}

function resolveEffectiveReturnLogisticsCompany(request, effectiveTrackingNo) {
  var directCompany = String(request && request.returnLogisticsCompany || '').trim()
  if (directCompany) {
    return directCompany
  }

  var fulfillmentCompany = sortAfterSalesHistoryByUpdatedAtDesc(request && request.fulfillmentChangeHistory)
    .filter(function (item) {
      return String(item && item.changeType || '').toLowerCase() === 'return-logistics'
    })
    .map(function (item) {
      return String(item && item.returnLogisticsCompany || '').trim()
    })
    .find(function (item) {
      return !!item
    })

  if (fulfillmentCompany) {
    return fulfillmentCompany
  }

  var trackingHistoryCompany = sortAfterSalesHistoryByUpdatedAtDesc(request && request.returnTrackingHistory)
    .map(function (item) {
      return String(item && item.logisticsCompany || '').trim()
    })
    .find(function (item) {
      return !!item
    })

  if (trackingHistoryCompany) {
    return trackingHistoryCompany
  }

  return resolveReturnLogisticsCompany(effectiveTrackingNo)
}

function getAfterSalesOrderStage(order) {
  return afterSalesUtil.getAfterSalesOrderStage(order)
}

function buildIncompleteRepairLockReasonMap(requests) {
  var reasonMap = {}

  ;(requests || []).forEach(function (request) {
    var type = String(request && request.afterSaleType || '').toLowerCase()
    var status = Number(request && request.afterSaleStatus)
    if (type !== 'repair' || [0, 1, 2].indexOf(status) === -1) {
      return
    }

    var reason = status >= 2
      ? '该商品维修中，需待当前维修单完成后才能再次申请维修'
      : '该商品已有维修申请处理中，需待当前维修单完成后才能再次申请维修'

    ;(request.items || []).forEach(function (item) {
      var orderItemId = Number(item && item.orderItemId || 0)
      if (!orderItemId || reasonMap[orderItemId]) {
        return
      }
      reasonMap[orderItemId] = reason
    })
  })

  return reasonMap
}

Page({
  data: {
    orderNo: '',
    order: null,
    items: [],
    payment: null,
    refundSummary: null,
    refundRecords: [],
    afterSalesRequests: [],
    logistics: null,
    statusText: '',
    loading: true,
    countdown: '',
    showCancelPopup: false,
    showReturnTrackingPopup: false,
    returnTrackingSubmitting: false,
    trackingAfterSaleNo: '',
    trackingReturnLogisticsCompany: '',
    trackingReturnTrackingNo: '',
    trackingAutoDetectedCompany: '',
    canRequestAfterSales: false,
    canConfirmReceipt: false,
    showRefundClosedBuyAgainOnly: false,
    afterSalesEntryReason: '',
    afterSalesEntryTip: '',
    availableAfterSaleTypes: [],
    afterSalesActionText: '申请售后',
    preferredAfterSaleType: '',
    afterSalesOrderStage: 0,
    showAfterSalesDetailPopup: false,
    afterSalesDetail: null,
    showShipmentTrackingPopup: false,
    shipmentTrackingLoading: false,
    shipmentTrackingTitle: '',
    shipmentTrackingStatus: '',
    shipmentTrackingCompany: '',
    shipmentTrackingNo: '',
    shipmentTrackingLatestContent: '',
    shipmentTrackingLatestTime: '',
    shipmentTrackingTraces: [],
    shipmentTrackingMessage: '',
    invoiceStatusText: '',
    invoiceNoticeText: '',
    canApplyInvoice: false,
    showInvoiceSection: false
  },

  _timer: null,
  _productPackageCache: null,
  _detailPayload: null,
  _orderDetailPageConfig: null,
  _pageConfigLoaded: false,
  _detailLoadedOnce: false,
  _trackingCompanyManualEdited: false,
  _trackingCompanyAutoDetected: '',

  onLoad: function (options) {
    this._productPackageCache = {}
    this._orderDetailPageConfig = afterSalesUtil.getFallbackOrderDetailPageConfig()
    this._pageConfigLoaded = false
    this.setData({ orderNo: options.orderNo || '' })
    this.loadPageConfig()
    this.loadDetail()
  },

  onShow: function () {
    if (this._detailLoadedOnce && this.data.orderNo) {
      this.loadDetail()
    }
  },

  onUnload: function () {
    if (this._timer) clearInterval(this._timer)
  },

  loadPageConfig: function () {
    var that = this
    afterSalesUtil.fetchOrderDetailPageConfig(api).then(function (config) {
      that._orderDetailPageConfig = config
      that._pageConfigLoaded = true
      that.updateAfterSalesState()
    })
  },

  updateAfterSalesState: function () {
    var detail = this._detailPayload
    if (!detail) return
    if (!this._pageConfigLoaded) {
      this.setData({
        canRequestAfterSales: false,
        afterSalesEntryReason: '',
        afterSalesEntryTip: '',
        availableAfterSaleTypes: [],
        afterSalesActionText: '申请售后',
        preferredAfterSaleType: ''
      })
      return
    }

    var state = afterSalesUtil.getAfterSalesEntryState(detail, this._orderDetailPageConfig || afterSalesUtil.getFallbackOrderDetailPageConfig())
    var availableTypes = Array.isArray(state.availableAfterSaleTypes) ? state.availableAfterSaleTypes : []
    var singleAvailableType = availableTypes.length === 1 ? availableTypes[0] : null
    var orderStage = getAfterSalesOrderStage(detail.order)
    var actionText = singleAvailableType
      ? '申请' + (singleAvailableType.label || afterSalesUtil.getAfterSaleTypeLabel(singleAvailableType.key))
      : '申请售后'
    var entryTip = ''

    if (!state.canRequest) {
      entryTip = state.reason || ''
    } else if (singleAvailableType && singleAvailableType.key === 'repair') {
      entryTip = '当前订单当前仅支持申请维修'
    }

    this.setData({
      canRequestAfterSales: !!state.canRequest,
      afterSalesEntryReason: state.reason || '',
      afterSalesEntryTip: entryTip,
      availableAfterSaleTypes: availableTypes,
      afterSalesActionText: actionText,
      preferredAfterSaleType: singleAvailableType ? String(singleAvailableType.key || '') : '',
      afterSalesOrderStage: orderStage
    })
  },

  loadDetail: function () {
    var that = this
    that.setData({ loading: true })
    api.get('/api/orders/detail/' + that.data.orderNo).then(function (res) {
      var data = res.data || res
      var rawOrder = data.order || data
      var repairLockReasonMap = buildIncompleteRepairLockReasonMap(data.afterSalesRequests || [])
      var order = Object.assign({}, rawOrder, {
        createTimeText: that.formatTime(rawOrder.createTime),
        payTimeText: that.formatTime(rawOrder.payTime),
        receiveTimeText: that.formatTime(rawOrder.receiveTime),
        shipTimeText: that.formatTime(rawOrder.shipTime)
      })
      var rawItems = Array.isArray(data.items) ? data.items : []
      var productIds = rawItems.map(function (item) {
        return item.productId
      }).filter(function (productId, index, array) {
        return productId && array.indexOf(productId) === index
      })

      return productPackageDisplay.ensureProductPackageCache(api, that._productPackageCache, productIds).catch(function () {
        return that._productPackageCache
      }).then(function () {
        var items = rawItems.map(function (item) {
          var displayItem = productPackageDisplay.decorateOrderItem(item, that._productPackageCache)
          var remainingRefundAmount = item.remainingRefundAmount != null ? Number(item.remainingRefundAmount) : Number(item.subtotal || 0)
          var refundedAmount = Number(item.refundedAmount || 0)
          var repairLockReason = repairLockReasonMap[item.id]
          return {
            id: item.id,
            productId: item.productId,
            packageId: item.packageId,
            productName: displayItem.productName,
            packageName: displayItem.packageName,
            description: displayItem.description,
            imageUrl: displayItem.imageUrl,
            price: displayItem.price,
            quantity: displayItem.quantity,
            subtotal: displayItem.subtotal,
            remainingRefundAmount: remainingRefundAmount,
            remainingRefundAmountText: that.formatAmount(remainingRefundAmount),
            refundedAmount: refundedAmount,
            refundedAmountText: that.formatAmount(refundedAmount),
            afterSalesLocked: !!item.afterSalesLocked || !!repairLockReason,
            afterSalesLockReason: repairLockReason || item.afterSalesLockReason || '该商品已完成退款，不能重复申请售后'
          }
        })

        var refundRecords = that.decorateRefundRecords(data.refundRecords || [])
        var afterSalesRequests = that.decorateAfterSalesRequests(data.afterSalesRequests || [])
        var refundSummary = afterSalesUtil.computeRefundSummary({
          order: rawOrder,
          payment: data.payment || null,
          refundSummary: data.refundSummary || null,
          refundRecords: data.refundRecords || [],
          afterSalesRequests: data.afterSalesRequests || [],
          items: rawItems
        })
        var showRefundClosedBuyAgainOnly = afterSalesUtil.shouldShowRefundClosedBuyAgain({
          order: rawOrder,
          payment: data.payment || null,
          refundSummary: data.refundSummary || null,
          refundRecords: data.refundRecords || []
        })

        that._detailPayload = {
          order: rawOrder,
          items: items,
          payment: data.payment || null,
          refundSummary: data.refundSummary || null,
          refundRecords: data.refundRecords || [],
          afterSalesRequests: data.afterSalesRequests || []
        }
        that._detailLoadedOnce = true

        that.setData({
          order: order,
          items: items,
          payment: data.payment || null,
          refundSummary: Object.assign({}, refundSummary, {
            refundedAmountText: that.formatAmount(refundSummary.refundedAmount),
            remainingRefundAmountText: that.formatAmount(refundSummary.remainingRefundAmount)
          }),
          refundRecords: refundRecords,
          afterSalesRequests: afterSalesRequests,
          statusText: getOrderStatusText(order.orderStatus),
          canConfirmReceipt: canConfirmReceipt(rawOrder),
          showRefundClosedBuyAgainOnly: showRefundClosedBuyAgainOnly,
          invoiceStatusText: getInvoiceStatusText(rawOrder),
          invoiceNoticeText: getInvoiceNoticeText(rawOrder),
          canApplyInvoice: canApplyInvoice(rawOrder),
          showInvoiceSection: shouldShowInvoiceSection(rawOrder),
          logistics: null,
          loading: false
        })
        that.updateAfterSalesState()

        if (isPendingPaymentStatus(order.orderStatus)) {
          that.startCountdown(order.expireTime)
        } else {
          if (that._timer) {
            clearInterval(that._timer)
            that._timer = null
          }
          that.setData({ countdown: '' })
        }

        if (shouldLoadLogistics(order)) {
          that.loadLogistics()
        } else {
          that.setData({ logistics: null })
        }
      })
    }).catch(function () {
      that.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  decorateRefundRecords: function (records) {
    var that = this
    return (Array.isArray(records) ? records.slice() : []).sort(function (left, right) {
      return that.sortByLatestTime(right && right.refundTime, left && left.refundTime, right && right.id, left && left.id)
    }).map(function (record) {
      var statusMap = {
        0: '处理中',
        1: '已退款',
        2: '退款失败'
      }
      return Object.assign({}, record, {
        refundTimeText: that.formatTime(record.refundTime),
        refundAmountText: that.formatAmount(record.refundAmount),
        refundStatusText: statusMap[Number(record.refundStatus)] || '未知状态'
      })
    })
  },

  decorateAfterSalesRequests: function (requests) {
    var that = this
    return (Array.isArray(requests) ? requests.slice() : []).sort(function (left, right) {
      return that.sortByLatestTime(right && right.createTime, left && left.createTime, right && right.id, left && left.id)
    }).map(function (request) {
      var effectiveReturnTrackingNo = resolveEffectiveReturnTrackingNo(request)
      var effectiveReturnLogisticsCompany = resolveEffectiveReturnLogisticsCompany(request, effectiveReturnTrackingNo)

      return Object.assign({}, request, {
        returnTrackingNo: effectiveReturnTrackingNo,
        returnLogisticsCompany: effectiveReturnLogisticsCompany,
        typeLabel: afterSalesUtil.getAfterSaleTypeLabel(request.afterSaleType),
        statusLabel: afterSalesUtil.getAfterSaleStatusLabel(request.afterSaleStatus, request.afterSaleType),
        shippingMethodLabel: afterSalesUtil.getAfterSaleShippingMethodLabel(request.shippingMethod),
        createTimeText: that.formatTime(request.createTime),
        pickupWindowText: that.formatPickupWindow(request.pickupWindowStart, request.pickupWindowEnd),
        requestedRefundAmountText: request.requestedRefundAmount != null ? that.formatAmount(request.requestedRefundAmount) : '',
        priceDiffSummaryText: that.formatAfterSalesPriceDiffSummary(request.priceDiffAmount),
        pickupServiceFeeText: request.pickupServiceFee != null ? that.formatAmount(request.pickupServiceFee) : '',
        deliveryFeeText: request.deliveryFee != null ? that.formatAmount(request.deliveryFee) : '',
        supplementPayAmountText: request.supplementPayAmount != null ? that.formatAmount(request.supplementPayAmount) : '',
        supplementPayTimeText: that.formatTime(request.supplementPayTime),
        showDetailAction: request.afterSaleType === 'exchange' || request.afterSaleType === 'repair',
        detailActionText: request.afterSaleType === 'exchange' ? '查看换货明细' : request.afterSaleType === 'repair' ? '查看维修明细' : '',
        canEditTracking: canEditAfterSalesTracking(request),
        trackingActionText: effectiveReturnTrackingNo ? '修改快递单号' : '填写快递单号'
      })
    })
  },

  formatAfterSalesPriceDiffSummary: function (value) {
    if (value == null) return ''
    var numericValue = Number(value || 0)
    if (!numericValue) return '无商品差价'
    return numericValue > 0
      ? '需补差价 ¥' + this.formatAmount(Math.abs(numericValue))
      : '需退差价 ¥' + this.formatAmount(Math.abs(numericValue))
  },

  sortByLatestTime: function (leftTime, rightTime, leftId, rightId) {
    var left = afterSalesUtil.parseTime(leftTime)
    var right = afterSalesUtil.parseTime(rightTime)
    var leftMs = left ? left.getTime() : 0
    var rightMs = right ? right.getTime() : 0
    if (leftMs !== rightMs) {
      return leftMs - rightMs
    }
    return Number(leftId || 0) - Number(rightId || 0)
  },

  startCountdown: function (expireTime) {
    var that = this
    if (that._timer) clearInterval(that._timer)
    if (!expireTime) {
      that.setData({ countdown: '' })
      return
    }
    that._timer = setInterval(function () {
      var targetTime = afterSalesUtil.parseTime(expireTime)
      var diff = (targetTime ? targetTime.getTime() : 0) - Date.now()
      if (diff <= 0) {
        clearInterval(that._timer)
        that._timer = null
        that.setData({ countdown: '已超时' })
        that.loadDetail()
        return
      }
      var mins = Math.floor(diff / 60000)
      var secs = Math.floor((diff % 60000) / 1000)
      that.setData({
        countdown: mins + '分' + (secs < 10 ? '0' : '') + secs + '秒'
      })
    }, 1000)
  },

  loadLogistics: function () {
    var that = this
    api.get('/api/orders/logistics/' + that.data.orderNo, { showError: false }).then(function (res) {
      var data = res.data || res
      if (data && data.available) {
        that.setData({ logistics: data })
      }
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

  payOrder: function () {
    var that = this
    that.requestMiniProgramLoginCode().then(function (loginCode) {
      return api.post('/api/pay/miniapp/create', {
        orderNo: that.data.orderNo,
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
          api.get('/api/orders/status/' + that.data.orderNo, { showError: false }).finally(function () {
            wx.showToast({ title: '支付成功', icon: 'success' })
            that.loadDetail()
          })
        },
        fail: function (err) {
          var isCanceled = that.isPaymentCanceled(err)
          that.showPaymentFailure(err, '支付取消')
          if (!isCanceled) {
            that.loadDetail()
          }
        }
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '发起支付失败', icon: 'none' })
    })
  },

  cancelOrder: function () {
    if (!this.data.order || !isPendingPaymentStatus(Number(this.data.order.orderStatus))) {
      wx.showToast({ title: '支付确认中，暂不能取消订单', icon: 'none' })
      return
    }

    this.setData({ showCancelPopup: true })
  },

  onCancelPopupClose: function () {
    this.setData({ showCancelPopup: false })
  },

  noop: function () {},

  getAfterSalesRequestByNo: function (afterSaleNo) {
    var matched = (this.data.afterSalesRequests || []).find(function (item) {
      return String(item.afterSaleNo || '') === String(afterSaleNo || '')
    })
    return matched || null
  },

  buildAfterSalesDetailPayload: function (request) {
    var that = this
    var afterSaleType = request.afterSaleType
    var isExchange = afterSaleType === 'exchange'
    return Object.assign({}, request, {
      popupTitle: isExchange ? '换货明细' : afterSaleType === 'repair' ? '维修明细' : '售后明细',
      isExchange: isExchange,
      items: (request.items || []).map(function (item) {
        var unitPrice = item.unitPrice != null ? that.formatAmount(item.unitPrice) : ''
        var quantity = Number(item.quantity || 0)
        var exchangeQuantity = Number(item.exchangeQuantity || 0)
        var exchangeUnitPrice = item.exchangeUnitPrice != null ? that.formatAmount(item.exchangeUnitPrice) : ''
        return {
          imageUrl: imageUtil.resolveImageUrl(item.snapImageUrl || ''),
          productName: item.snapProductName || '商品',
          packageText: String(item.snapPackageName || '').trim(),
          quantityText: 'x' + quantity,
          unitPriceText: unitPrice,
          priceLineText: unitPrice ? '¥' + unitPrice + ' × ' + quantity : '',
          exchangeImageUrl: imageUtil.resolveImageUrl(item.exchangeImageUrl || item.snapImageUrl || ''),
          exchangeTitle: item.exchangeProductName || '',
          exchangePackageText: String(item.exchangePackageName || '').trim(),
          exchangeQuantityText: exchangeQuantity > 0 ? 'x' + exchangeQuantity : '',
          exchangeUnitPriceText: exchangeUnitPrice,
          exchangePriceLineText: exchangeUnitPrice && exchangeQuantity > 0 ? '¥' + exchangeUnitPrice + ' × ' + exchangeQuantity : ''
        }
      })
    })
  },

  openAfterSalesDetailPopup: function (e) {
    var afterSaleNo = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.afterSaleNo || '')
      : ''
    var request = this.getAfterSalesRequestByNo(afterSaleNo)
    if (!request) {
      wx.showToast({ title: '售后记录不存在', icon: 'none' })
      return
    }

    this.setData({
      showAfterSalesDetailPopup: true,
      afterSalesDetail: this.buildAfterSalesDetailPayload(request)
    })
  },

  closeAfterSalesDetailPopup: function () {
    this.setData({
      showAfterSalesDetailPopup: false,
      afterSalesDetail: null
    })
  },

  openShipmentTrackingPopup: function (e) {
    var that = this
    var dataset = e && e.currentTarget ? e.currentTarget.dataset || {} : {}
    var afterSaleNo = String(dataset.afterSaleNo || '')
    var mode = String(dataset.mode || 'exchange')
    if (!afterSaleNo) {
      wx.showToast({ title: '售后单号不能为空', icon: 'none' })
      return
    }

    that.setData({
      showShipmentTrackingPopup: true,
      shipmentTrackingLoading: true,
      shipmentTrackingTitle: mode === 'repair' ? '维修物流轨迹' : '换货物流轨迹',
      shipmentTrackingStatus: '',
      shipmentTrackingCompany: '',
      shipmentTrackingNo: '',
      shipmentTrackingLatestContent: '',
      shipmentTrackingLatestTime: '',
      shipmentTrackingTraces: [],
      shipmentTrackingMessage: ''
    })

    api.get('/api/orders/after-sales/' + encodeURIComponent(afterSaleNo) + '/' + (mode === 'repair' ? 'repair-tracking' : 'exchange-tracking'), {
      showError: false
    }).then(function (res) {
      var data = res.data || res || {}
      var traces = Array.isArray(data.traces) ? data.traces : []
      var latest = traces[0] || null
      that.setData({
        shipmentTrackingLoading: false,
        shipmentTrackingStatus: data.statusText || data.statusCode || '',
        shipmentTrackingCompany: data.logisticsCompany || '',
        shipmentTrackingNo: data.logisticsNo || '',
        shipmentTrackingLatestContent: latest ? latest.content || '' : '',
        shipmentTrackingLatestTime: latest ? latest.time || '' : '',
        shipmentTrackingTraces: traces,
        shipmentTrackingMessage: data.message || ''
      })
    }).catch(function (err) {
      that.setData({
        shipmentTrackingLoading: false,
        shipmentTrackingMessage: (err && err.message) || '物流轨迹加载失败'
      })
    })
  },

  closeShipmentTrackingPopup: function () {
    this.setData({
      showShipmentTrackingPopup: false,
      shipmentTrackingLoading: false,
      shipmentTrackingTraces: []
    })
  },

  copyShipmentTrackingNo: function () {
    var trackingNo = String(this.data.shipmentTrackingNo || '')
    if (!trackingNo) return
    wx.setClipboardData({ data: trackingNo })
  },

  openInvoiceApply: function () {
    var order = this.data.order
    if (!order || !this.data.canApplyInvoice) {
      wx.showToast({ title: '当前订单暂不可申请开票', icon: 'none' })
      return
    }

    var prefill = {
      invoiceType: Number(order.invoiceType) || 1,
      invoicePerson: Number(order.invoicePerson) || 1,
      title: order.invoiceTitle || '',
      taxNumber: order.invoiceTaxNo || '',
      email: order.invoiceEmail || ''
    }

    wx.navigateTo({
      url: '/pages/shop/invoice/index?mode=apply&orderNo='
        + encodeURIComponent(this.data.orderNo)
        + '&data='
        + encodeURIComponent(JSON.stringify(prefill))
    })
  },

  openReturnTrackingPopup: function (e) {
    var afterSaleNo = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.afterSaleNo || '')
      : ''
    var request = this.getAfterSalesRequestByNo(afterSaleNo)

    if (!request || !request.canEditTracking) {
      wx.showToast({ title: '当前售后状态不支持填写寄回物流', icon: 'none' })
      return
    }

    var trackingNo = String(request.returnTrackingNo || '').trim()
    var autoDetectedCompany = resolveReturnLogisticsCompany(trackingNo)
    var logisticsCompany = String(request.returnLogisticsCompany || '').trim() || autoDetectedCompany

    this._trackingCompanyAutoDetected = autoDetectedCompany
    this._trackingCompanyManualEdited = !!logisticsCompany && logisticsCompany !== autoDetectedCompany

    this.setData({
      showReturnTrackingPopup: true,
      returnTrackingSubmitting: false,
      trackingAfterSaleNo: String(request.afterSaleNo || ''),
      trackingReturnLogisticsCompany: logisticsCompany,
      trackingReturnTrackingNo: trackingNo,
      trackingAutoDetectedCompany: autoDetectedCompany
    })
  },

  closeReturnTrackingPopup: function () {
    this.setData({
      showReturnTrackingPopup: false,
      returnTrackingSubmitting: false
    })
  },

  onReturnTrackingNoInput: function (e) {
    var trackingNo = String(e && e.detail && e.detail.value !== undefined ? e.detail.value : '').replace(/\s+/g, '')
    var detectedCompany = resolveReturnLogisticsCompany(trackingNo)
    var currentCompany = String(this.data.trackingReturnLogisticsCompany || '').trim()
    var shouldAutoFillCompany = false

    if (detectedCompany) {
      shouldAutoFillCompany = !currentCompany
        || !this._trackingCompanyManualEdited
        || currentCompany === this._trackingCompanyAutoDetected
    }

    var nextData = {
      trackingReturnTrackingNo: trackingNo,
      trackingAutoDetectedCompany: detectedCompany
    }

    if (shouldAutoFillCompany) {
      nextData.trackingReturnLogisticsCompany = detectedCompany
      this._trackingCompanyAutoDetected = detectedCompany
      this._trackingCompanyManualEdited = false
    } else if (!detectedCompany) {
      this._trackingCompanyAutoDetected = ''
    }

    this.setData(nextData)
  },

  onReturnLogisticsCompanyInput: function (e) {
    var logisticsCompany = String(e && e.detail && e.detail.value !== undefined ? e.detail.value : '')
    var trimmedCompany = logisticsCompany.trim()
    this._trackingCompanyManualEdited = !!trimmedCompany && trimmedCompany !== this._trackingCompanyAutoDetected
    if (!trimmedCompany) {
      this._trackingCompanyManualEdited = false
    }
    this.setData({ trackingReturnLogisticsCompany: logisticsCompany })
  },

  submitReturnTracking: function () {
    var that = this
    var afterSaleNo = String(that.data.trackingAfterSaleNo || '').trim()
    var returnLogisticsCompany = String(that.data.trackingReturnLogisticsCompany || '').trim()
    var returnTrackingNo = String(that.data.trackingReturnTrackingNo || '').trim()

    if (!afterSaleNo) {
      wx.showToast({ title: '售后单号不能为空', icon: 'none' })
      return
    }

    if (!returnTrackingNo) {
      wx.showToast({ title: '请填写寄回快递单号', icon: 'none' })
      return
    }

    if (!returnLogisticsCompany) {
      wx.showToast({ title: '请填写物流公司', icon: 'none' })
      return
    }

    that.setData({ returnTrackingSubmitting: true })
    api.put('/api/orders/after-sales/' + encodeURIComponent(afterSaleNo) + '/return-tracking', {
      returnLogisticsCompany: returnLogisticsCompany,
      returnTrackingNo: returnTrackingNo
    }).then(function () {
      that.setData({
        showReturnTrackingPopup: false,
        returnTrackingSubmitting: false
      })
      wx.showToast({ title: '寄回物流已更新', icon: 'success' })
      that.loadDetail()
    }).catch(function (err) {
      that.setData({ returnTrackingSubmitting: false })
      wx.showToast({ title: (err && err.message) || '寄回物流更新失败', icon: 'none' })
    })
  },

  confirmCancel: function () {
    var that = this
    var detail = arguments[0] && arguments[0].detail ? arguments[0].detail : {}
    var addToCart = Boolean(detail.addToCart)
    api.put('/api/orders/cancel/' + that.data.orderNo, { cancelReason: detail.reason }).then(function () {
      that.setData({ showCancelPopup: false })
      if (addToCart) {
        var items = that.data.items || []
        var tasks = items.map(function (item) {
          return api.post('/api/cart', { packageId: item.packageId || 0, productId: item.productId || 0, quantity: item.quantity }, { showError: false })
        })
        Promise.all(tasks).catch(function () {}).finally(function () {
          wx.showToast({ title: '已取消，商品已加入购物车', icon: 'none', duration: 2000 })
          that.loadDetail()
        })
      } else {
        wx.showToast({ title: '订单已取消', icon: 'success' })
        that.loadDetail()
      }
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
    })
  },

  confirmReceipt: function () {
    var that = this
    if (!canConfirmReceipt(that.data.order)) {
      wx.showToast({ title: '物流未签收，暂不能确认收货', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认收货',
      content: '确认已经收到商品吗？',
      success: function (res) {
        if (res.confirm) {
          api.put('/api/orders/confirm-receipt/' + that.data.orderNo, null, { showError: false }).then(function () {
            wx.showToast({ title: '已确认', icon: 'success' })
            that.loadDetail()
          }).catch(function (err) {
            wx.showToast({ title: (err && err.message) || '确认收货失败', icon: 'none' })
          })
        }
      }
    })
  },

  formatTime: function (timeStr) {
    if (!timeStr) return ''
    var d = afterSalesUtil.parseTime(timeStr)
    if (!d) return String(timeStr)
    return d.getFullYear() + '-' + this.pad(d.getMonth() + 1) + '-' + this.pad(d.getDate()) +
      ' ' + this.pad(d.getHours()) + ':' + this.pad(d.getMinutes()) + ':' + this.pad(d.getSeconds())
  },

  formatPickupWindow: function (start, end) {
    var startText = this.formatTime(start)
    var endText = this.formatTime(end)
    if (!startText && !endText) return ''
    if (!endText) return startText
    return startText + ' - ' + endText.slice(11)
  },

  formatAmount: function (value) {
    var numericValue = Number(value || 0)
    if (!Number.isFinite(numericValue)) numericValue = 0
    return numericValue.toFixed(2)
  },

  pad: function (value) {
    return value < 10 ? '0' + value : '' + value
  },

  copyOrderNo: function () {
    wx.setClipboardData({ data: this.data.orderNo })
  },

  goLogistics: function () {
    wx.navigateTo({ url: '/pages/shop/logistics/index?orderNo=' + this.data.orderNo })
  },

  goRefund: function () {
    if (!this.data.canRequestAfterSales) {
      wx.showToast({ title: this.data.afterSalesEntryReason || '当前订单暂不支持申请售后', icon: 'none' })
      return
    }

    var url = '/pages/shop/refund-apply/index?orderNo=' + this.data.orderNo
    if (this.data.preferredAfterSaleType) {
      url += '&afterSaleType=' + encodeURIComponent(this.data.preferredAfterSaleType)
    }
    wx.navigateTo({ url: url })
  },

  buyAgain: function () {
    var items = Array.isArray(this.data.items) ? this.data.items : []
    if (!items.length) {
      wx.showToast({ title: '暂无可再次购买商品', icon: 'none' })
      return
    }

    wx.showLoading({ title: '处理中', mask: true })
    Promise.all(items.map(function (item) {
      return api.post('/api/cart', {
        productId: item.productId || 0,
        packageId: item.packageId || 0,
        quantity: item.quantity || 1
      }, { showError: false })
    })).then(function () {
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
  }
})