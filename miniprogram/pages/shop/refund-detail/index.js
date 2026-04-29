/**
 * 退款详情页
 * 参数：refundId - 退款ID, orderNo - 订单号
 */
var api = require('../../../utils/api.js')
var imageUtil = require('../../../utils/image.js')

var STATUS_MAP = {
  0: { text: '退款申请中', desc: '等待商家审核，请耐心等待', icon: 'clock-o' },
  1: { text: '退款已同意', desc: '商家已同意退款', icon: 'passed' },
  2: { text: '退款被拒绝', desc: '商家已拒绝退款申请', icon: 'close' },
  3: { text: '退款成功', desc: '退款已到账', icon: 'checked' },
  4: { text: '退款已撤销', desc: '您已撤销退款申请', icon: 'info-o' }
}

Page({
  data: {
    refundId: '',
    orderNo: '',
    refund: null,
    timeline: [],
    statusText: '',
    statusDesc: '',
    statusIcon: 'clock-o',
    loading: true
  },

  onLoad: function (options) {
    this.setData({
      refundId: options.refundId || '',
      orderNo: options.orderNo || ''
    })
    this.loadDetail()
  },

  /** 加载退款详情 */
  loadDetail: function () {
    var that = this
    that.setData({ loading: true })
    var url = that.data.refundId
      ? '/api/orders/refund/' + that.data.refundId
      : '/api/orders/refund-by-order/' + that.data.orderNo

    api.get(url).then(function (res) {
      var data = res.data || res
      var refund = data.refund || data
      refund.createTime = (refund.createTime || '').replace('T', ' ').substring(0, 16)
      // 解析图片
      if (refund.images && typeof refund.images === 'string') {
        try { refund.images = JSON.parse(refund.images) } catch (e) { refund.images = [] }
      }
      refund.images = (refund.images || []).map(function (url) {
        return imageUtil.resolveImageUrl(url)
      })

      var status = STATUS_MAP[refund.status] || STATUS_MAP[0]
      var timeline = (data.timeline || []).map(function (t) {
        return {
          content: t.content,
          time: (t.time || '').replace('T', ' ').substring(0, 16)
        }
      })

      that.setData({
        refund: refund,
        timeline: timeline,
        statusText: status.text,
        statusDesc: status.desc,
        statusIcon: status.icon,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /** 预览凭证图片 */
  previewImage: function (e) {
    var idx = e.currentTarget.dataset.index || 0
    wx.previewImage({
      current: this.data.refund.images[idx],
      urls: this.data.refund.images
    })
  },

  /** 撤销退款申请 */
  cancelRefund: function () {
    var that = this
    wx.showModal({
      title: '提示',
      content: '确定撤销退款申请吗？',
      success: function (res) {
        if (res.confirm) {
          api.put('/api/orders/refund-cancel/' + that.data.refundId).then(function () {
            wx.showToast({ title: '已撤销', icon: 'success' })
            that.loadDetail()
          })
        }
      }
    })
  }
})
