/**
 * 搜索页
 * 支持搜索历史、热门搜索、商品搜索
 */
var api = require('../../../utils/api.js')
var imageUtil = require('../../../utils/image.js')

function formatPriceValue(value) {
  if (value === null || value === undefined || value === '') {
    return '0'
  }

  var numberValue = Number(value)
  if (!isFinite(numberValue)) {
    return String(value)
  }

  var normalized = Math.round(numberValue * 100) / 100
  return normalized.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function buildPriceRangeText(minPrice, maxPrice, fallbackPrice) {
  var resolvedMin = minPrice === null || minPrice === undefined || minPrice === '' ? null : Number(minPrice)
  if (isFinite(resolvedMin)) {
    return formatPriceValue(resolvedMin)
  }
  return formatPriceValue(fallbackPrice)
}

var HISTORY_KEY = 'maxcellent_search_history'
var MAX_HISTORY = 10

Page({
  data: {
    keyword: '',
    searched: false,
    loading: false,
    results: [],
    history: [],
    hotWords: [],
    showSku: false,
    skuProduct: null,
    skuPackages: [],
    skuAdding: false
  },

  onLoad: function () {
    this.loadHistory()
    this.loadHotWords()
  },

  /** 从本地存储加载搜索历史 */
  loadHistory: function () {
    var history = wx.getStorageSync(HISTORY_KEY) || []
    this.setData({ history: history })
  },

  /** 保存搜索词到历史 */
  saveHistory: function (word) {
    var history = this.data.history.filter(function (w) { return w !== word })
    history.unshift(word)
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY)
    this.setData({ history: history })
    wx.setStorageSync(HISTORY_KEY, history)
  },

  /** 加载热门搜索（从后台配置获取） */
  loadHotWords: function () {
    var that = this
    api.get('/api/sitepublic/page/miniprogram', { query: { lang: 'zh-cn' }, showError: false })
      .then(function (res) {
        var data = res.data || res
        var sections = data.sections || {}
        var hotItems = sections.hotsearch || []
        var words = hotItems
          .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0) })
          .map(function (item) { return item.title })
          .filter(function (w) { return w })
        if (words.length > 0) {
          that.setData({ hotWords: words })
        } else {
          // 无后台配置时使用默认词
          that.setData({ hotWords: ['手机云台', '无人机', '运动相机', '麦克风', '配件'] })
        }
      })
      .catch(function () {
        that.setData({ hotWords: ['手机云台', '无人机', '运动相机', '麦克风', '配件'] })
      })
  },

  /** 输入变化 */
  onSearchInput: function (e) {
    this.setData({ keyword: e.detail })
  },

  /** 执行搜索 */
  doSearch: function () {
    var keyword = this.data.keyword.trim()
    if (!keyword) return
    this.saveHistory(keyword)
    this.setData({ searched: true, loading: true, results: [] })

    var that = this
    api.get('/api/sitepublic/product').then(function (res) {
      var data = res.data || res
      var normalizedKeyword = keyword.toLowerCase()
      var products = (data.products || []).filter(function (p) {
        var title = String(p.title || '').toLowerCase()
        var sku = String(p.sku || '').toLowerCase()
        var model = String(p.model || '').toLowerCase()
        var category = String(p.category || '').toLowerCase()
        var packageNames = Array.isArray(p.packageNames) ? p.packageNames.join(' ').toLowerCase() : ''
        return title.indexOf(normalizedKeyword) !== -1
          || sku.indexOf(normalizedKeyword) !== -1
          || model.indexOf(normalizedKeyword) !== -1
          || category.indexOf(normalizedKeyword) !== -1
          || packageNames.indexOf(normalizedKeyword) !== -1
      }).map(function (p) {
        var minPrice = p.minPrice
        var maxPrice = p.maxPrice
        var fallbackPrice = p.salePrice || p.price
        return {
          id: p.id,
          title: p.title,
          img: imageUtil.resolveImageUrl(p.img),
          priceText: buildPriceRangeText(minPrice, maxPrice, fallbackPrice),
          minPrice: minPrice,
          maxPrice: maxPrice,
          originalPrice: p.originalPrice,
          originalPriceText: p.originalPrice ? formatPriceValue(p.originalPrice) : '',
          isNew: p.isNew,
          stock: p.defaultPackageStock || 0,
          defaultPackageId: p.defaultPackageId || 0
        }
      })
      that.setData({ results: products, loading: false })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  /** 点击历史词 */
  onHistoryTap: function (e) {
    this.setData({ keyword: e.currentTarget.dataset.word })
    this.doSearch()
  },

  /** 点击热门词 */
  onHotTap: function (e) {
    this.setData({ keyword: e.currentTarget.dataset.word })
    this.doSearch()
  },

  /** 清空历史 */
  clearHistory: function () {
    this.setData({ history: [] })
    wx.removeStorageSync(HISTORY_KEY)
  },

  /** 取消搜索 */
  onCancel: function () {
    wx.navigateBack()
  },

  /** 跳转详情 */
  goDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/shop/product-detail/index?id=' + id })
  },

  onQuickAdd: function (e) {
    var that = this
    var id = Number(e.currentTarget.dataset.id) || 0
    var product = that.data.results.find(function (item) {
      return Number(item.id) === id
    })

    if (!product || product.stock <= 0) {
      return
    }

    if (!api.isLoggedIn()) {
      wx.showToast({ title: '请先在个人中心登录', icon: 'none' })
      return
    }

    that.setData({
      showSku: true,
      skuProduct: product,
      skuPackages: []
    })

    api.get('/api/sitepublic/product-detail/' + id, { query: { lang: 'zh-cn' } }).then(function (res) {
      var data = res.data || res
      var detail = data.productDetail || {}
      var packages = (detail.packages || []).map(function (pkg) {
        var pkgObj = pkg.package || pkg
        var i18n = pkg.i18n || {}
        var thumbUrl = pkgObj.thumbUrl || ''
        return {
          id: pkgObj.id || pkg.id,
          name: i18n.name || pkgObj.name || pkgObj.sku || pkg.name || pkg.packageName || '',
          description: i18n.description || pkgObj.description || pkg.description || '',
          price: pkgObj.price || pkg.price,
          priceText: formatPriceValue(pkgObj.price || pkg.price),
          stock: pkgObj.stock || pkg.stock || 0,
          thumbUrl: thumbUrl ? imageUtil.resolveImageUrl(thumbUrl) : ''
        }
      })
      that.setData({ skuPackages: packages })
    }).catch(function () {
      that.setData({ showSku: false, skuProduct: null, skuPackages: [] })
    })
  },

  closeSku: function () {
    this.setData({
      showSku: false,
      skuProduct: null,
      skuPackages: [],
      skuAdding: false
    })
  },

  onSkuAddCart: function (e) {
    var that = this
    var detail = e.detail
    if (!detail || !detail.package || !detail.package.id) {
      return
    }

    that.setData({ skuAdding: true })
    api.post('/api/cart', {
      packageId: detail.package.id,
      quantity: detail.quantity
    }).then(function () {
      wx.showToast({ title: '已加入购物车', icon: 'success' })
      that.setData({
        showSku: false,
        skuProduct: null,
        skuPackages: [],
        skuAdding: false
      })
      api.updateCartBadge()
    }).catch(function () {
      that.setData({ skuAdding: false })
    })
  }
})
