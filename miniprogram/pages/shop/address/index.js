var api = require('../../../utils/api.js')
var addressUtil = require('../../../utils/address.js')

function hasValue(value) {
  return !!String(value || '').trim()
}

function buildAddressText(address) {
  return [address.province, address.city, address.district, address.street, address.detailAddress]
    .filter(hasValue)
    .join(' ')
}

Page({
  data: {
    addresses: [],
    loading: true,
    selectMode: false
  },

  onLoad: function (options) {
    var selectMode = options.select === '1'
    this.setData({ selectMode: selectMode })
    wx.setNavigationBarTitle({
      title: selectMode ? '选择收货地址' : '地址管理'
    })
  },

  onShow: function () {
    this.loadAddresses()
  },

  loadAddresses: function () {
    var that = this
    that.setData({ loading: true })
    api.get('/api/address').then(function (res) {
      var list = addressUtil.filterDomesticAddresses(res.data || res || [])
      that.setData({
        addresses: list.map(function (item) {
          item.fullAddressText = buildAddressText(item)
          return item
        }),
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  selectAddress: function (e) {
    if (!this.data.selectMode) return
    var id = e.currentTarget.dataset.id
    var addr = this.data.addresses.find(function (a) { return String(a.id) === String(id) })
    if (addr && !addressUtil.isDomesticAddress(addr)) {
      wx.showToast({ title: '小程序暂不支持国际地址', icon: 'none' })
      return
    }
    if (addr) {
      addressUtil.emitSelectedAddress(this, addr)
      wx.navigateBack()
    }
  },

  openAddForm: function () {
    wx.navigateTo({
      url: '/pages/shop/address/form/index' + (this.data.selectMode ? '?source=select' : '')
    })
  },

  openEditForm: function (e) {
    var id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: '/pages/shop/address/form/index?id=' + id + (this.data.selectMode ? '&source=select' : '')
    })
  },

  deleteAddress: function (e) {
    var that = this
    var id = e.currentTarget.dataset.id
    wx.showModal({
      title: '提示',
      content: '确定删除该地址吗？',
      success: function (res) {
        if (res.confirm) {
          api.del('/api/address/' + id).then(function () {
            wx.showToast({ title: '已删除', icon: 'success' })
            that.loadAddresses()
          })
        }
      }
    })
  },

  setDefault: function (e) {
    var that = this
    var id = e.currentTarget.dataset.id
    api.put('/api/address/' + id + '/default').then(function () {
      wx.showToast({ title: '已设为默认', icon: 'success' })
      that.loadAddresses()
    })
  }
})
