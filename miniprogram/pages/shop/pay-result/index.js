/**
 * 支付结果页
 * 参数：orderNo - 订单号，status - success/fail
 */
var api = require('../../../utils/api.js')

var STATUS_PENDING = 'checking'
var STATUS_SUCCESS = 'success'
var STATUS_FAIL = 'fail'
var STATUS_POLL_MAX_RETRIES = 20
var STATUS_POLL_INTERVAL = 1500

function isPaidOrderStatus(orderStatus, payStatus) {
  return Number(payStatus) === 1 || Number(orderStatus) === 1
}

function isClosedOrderStatus(orderStatus, payStatus) {
  return Number(orderStatus) === 4 || Number(payStatus) === 2 || Number(payStatus) === 5
}

Page({
  data: {
    orderNo: '',
    status: STATUS_FAIL,
    isChecking: false,
    checkAttempts: 0,
    maxCheckAttempts: STATUS_POLL_MAX_RETRIES,
    checkMessage: ''
  },

  _pollTimer: null,

  onLoad: function (options) {
    var initialStatus = (options.status || STATUS_FAIL) === STATUS_SUCCESS ? STATUS_PENDING : STATUS_FAIL

    this.setData({
      orderNo: options.orderNo || '',
      status: initialStatus,
      isChecking: initialStatus === STATUS_PENDING,
      checkAttempts: 0,
      maxCheckAttempts: STATUS_POLL_MAX_RETRIES,
      checkMessage: initialStatus === STATUS_PENDING
        ? '支付已提交，正在确认订单状态，请稍候。'
        : '如果刚刚取消支付，您可以重新发起支付或先查看订单详情。'
    })

    if ((options.status || STATUS_FAIL) === STATUS_SUCCESS && options.orderNo) {
      this.pollOrderStatus(0)
    }
  },

  onUnload: function () {
    this.clearPollTimer()
  },

  clearPollTimer: function () {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  },

  scheduleNextPoll: function (retryCount) {
    var that = this
    that.clearPollTimer()
    that._pollTimer = setTimeout(function () {
      that.pollOrderStatus(retryCount + 1)
    }, STATUS_POLL_INTERVAL)
  },

  applyStatusSnapshot: function (status, message, extraData) {
    this.setData(Object.assign({
      status: status,
      isChecking: false,
      checkMessage: message || ''
    }, extraData || {}))
  },

  pollOrderStatus: function (retryCount) {
    var that = this
    if (!that.data.orderNo) {
      return
    }

    that.clearPollTimer()
    that.setData({
      status: STATUS_PENDING,
      isChecking: true,
      checkAttempts: Math.min(retryCount + 1, STATUS_POLL_MAX_RETRIES),
      checkMessage: retryCount === 0
        ? '支付已提交，正在确认订单状态，请稍候。'
        : '正在确认支付结果，如未刷新可手动再查一次。'
    })

    api.get('/api/orders/status/' + that.data.orderNo, { showError: false }).then(function (res) {
      var data = res.data || res || {}
      if (isPaidOrderStatus(data.orderStatus, data.payStatus)) {
        that.applyStatusSnapshot(STATUS_SUCCESS, '支付成功，订单已进入处理流程。')
        return
      }

      if (isClosedOrderStatus(data.orderStatus, data.payStatus)) {
        that.applyStatusSnapshot(STATUS_FAIL, '本次支付未完成，您可以重新发起支付。')
        return
      }

      if (retryCount + 1 >= STATUS_POLL_MAX_RETRIES) {
        that.applyStatusSnapshot(STATUS_PENDING, '支付结果还在同步，您可以重新检查，或先去订单详情查看。')
        return
      }

      that.scheduleNextPoll(retryCount)
    }).catch(function () {
      if (retryCount + 1 >= STATUS_POLL_MAX_RETRIES) {
        that.applyStatusSnapshot(STATUS_PENDING, '当前网络较忙，支付结果可能稍后同步，请重新检查。')
        return
      }

      that.scheduleNextPoll(retryCount)
    })
  },

  requestMiniProgramLoginCode: function () {
    return new Promise(function (resolve, reject) {
      wx.login({
        success: function (res) {
          if (res && res.code) {
            resolve(res.code)
          } else {
            reject(new Error('获取微信登录状态失败'))
          }
        },
        fail: function () {
          reject(new Error('获取微信登录状态失败'))
        }
      })
    })
  },

  isPaymentCanceled: function (err) {
    var errMsg = String(err && (err.errMsg || err.message) || '').toLowerCase()
    return errMsg.indexOf('cancel') >= 0 || errMsg.indexOf('已取消') >= 0
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

  recheckStatus: function () {
    if (!this.data.orderNo || this.data.isChecking) {
      return
    }

    this.pollOrderStatus(0)
  },

  retryPay: function () {
    var that = this

    if (!that.data.orderNo || that.data.isChecking) {
      return
    }

    that.setData({
      isChecking: true,
      checkMessage: '正在重新发起支付，请稍候。'
    })

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
          that.pollOrderStatus(0)
        },
        fail: function (err) {
          var isCanceled = that.isPaymentCanceled(err)
          that.showPaymentFailure(err, '支付已取消')
          that.applyStatusSnapshot(STATUS_FAIL, isCanceled
            ? '本次支付已取消，您可以稍后继续支付。'
            : '支付未完成，您可以重新发起支付。')
        }
      })
    }).catch(function (err) {
      var message = err && err.message ? err.message : '重新发起支付失败，请稍后再试'
      that.applyStatusSnapshot(STATUS_FAIL, message)
      wx.showToast({ title: message, icon: 'none' })
    })
  },

  /** 查看订单详情 */
  viewOrder: function () {
    this.clearPollTimer()
    if (!this.data.orderNo) {
      wx.navigateTo({ url: '/pages/shop/order-list/index' })
      return
    }

    wx.redirectTo({
      url: '/pages/shop/order-detail/index?orderNo=' + this.data.orderNo
    })
  },

  /** 继续购物 */
  continueShopping: function () {
    this.clearPollTimer()
    wx.switchTab({ url: '/pages/shop/index' })
  }
})
