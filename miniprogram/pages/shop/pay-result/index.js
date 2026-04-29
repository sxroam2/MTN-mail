/**
 * 支付结果页
 * 参数：orderNo - 订单号，status - success/fail
 */
var api = require('../../../utils/api.js')

Page({
  data: {
    orderNo: '',
    status: 'fail'
  },

  _pollTimer: null,

  onLoad: function (options) {
    this.setData({
      orderNo: options.orderNo || '',
      status: options.status || 'fail'
    })

    if ((options.status || 'fail') === 'success' && options.orderNo) {
      this.pollOrderStatus(0)
    }
  },

  onUnload: function () {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  },

  pollOrderStatus: function (retryCount) {
    var that = this
    if (!that.data.orderNo || retryCount > 5) {
      return
    }

    api.get('/api/orders/status/' + that.data.orderNo, { showError: false }).then(function (res) {
      var data = res.data || res || {}
      if (data.payStatus === 1 || data.orderStatus === 1) {
        that.setData({ status: 'success' })
        return
      }

      if (data.orderStatus === 4 || data.payStatus === 2 || data.payStatus === 5) {
        that.setData({ status: 'fail' })
        return
      }

      that._pollTimer = setTimeout(function () {
        that.pollOrderStatus(retryCount + 1)
      }, 1500)
    }).catch(function () {
      that._pollTimer = setTimeout(function () {
        that.pollOrderStatus(retryCount + 1)
      }, 1500)
    })
  },

  /** 查看订单详情 */
  viewOrder: function () {
    wx.redirectTo({
      url: '/pages/shop/order-detail/index?orderNo=' + this.data.orderNo
    })
  },

  /** 继续购物 */
  continueShopping: function () {
    wx.switchTab({ url: '/pages/shop/index' })
  }
})
