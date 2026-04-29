/**
 * 物流轨迹详情页
 * 参数：orderNo - 订单号
 */
var api = require('../../../utils/api.js')

Page({
  data: {
    orderNo: '',
    logistics: {},
    traces: [],
    latestTrace: null,
    traceCount: 0,
    loading: true
  },

  onLoad: function (options) {
    this.setData({ orderNo: options.orderNo || '' })
    this.loadLogistics()
  },

  /** 加载物流信息 */
  loadLogistics: function () {
    var that = this
    that.setData({ loading: true })
    api.get('/api/orders/logistics/' + that.data.orderNo).then(function (res) {
      var data = res.data || res
      // 组装轨迹列表（最新在前）
      var traces = (data.traces || []).map(function (t) {
        return {
          content: t.content || t.acceptStation || '',
          time: (t.time || t.acceptTime || '').replace('T', ' ').substring(0, 16)
        }
      })
      var latestTrace = traces.length ? traces[0] : null
      that.setData({
        logistics: {
          logisticsCompany: data.logisticsCompany || data.shipperName || '',
          logisticsNo: data.logisticsNo || data.logisticCode || ''
        },
        traces: traces,
        latestTrace: latestTrace,
        traceCount: traces.length,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /** 复制运单号 */
  copyLogisticsNo: function () {
    wx.setClipboardData({ data: this.data.logistics.logisticsNo || '' })
  }
})
