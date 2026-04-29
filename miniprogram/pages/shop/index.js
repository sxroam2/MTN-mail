var api = require('../../utils/api.js')
var imageUtil = require('../../utils/image.js')

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

function buildBuyNowCheckoutUrl(productId, packageId, quantity) {
  return '/pages/shop/checkout/index?buyNowProductId='
    + encodeURIComponent(productId)
    + '&buyNowPackageId='
    + encodeURIComponent(packageId)
    + '&buyNowQuantity='
    + encodeURIComponent(quantity)
}

Page({
  data: {
    products: [],
    allProducts: [],
    categories: [],
    activeCategory: '',
    loading: true,
    // SKU 抽屉相关
    showSku: false,
    skuProduct: null,
    skuPackages: [],
    skuAdding: false
  },

  onLoad: function () {
    this.loadProducts()
  },

  onShow: function () {
    api.updateCartBadge()
  },

  /** 加载商品列表 */
  loadProducts: function () {
    var that = this
    that.setData({ loading: true })
    return api.get('/api/sitepublic/product', { query: { lang: 'zh-cn' } }).then(function (res) {
      var data = res.data || res
      var products = (data.products || []).map(function (p) {
        var minPrice = p.minPrice
        var maxPrice = p.maxPrice
        var fallbackPrice = p.salePrice || p.price
        return {
          id: p.id,
          title: p.title,
          img: imageUtil.resolveImageUrl(p.img),
          price: p.price,
          salePrice: p.salePrice,
          minPrice: minPrice,
          maxPrice: maxPrice,
          priceText: buildPriceRangeText(minPrice, maxPrice, fallbackPrice),
          hasPriceRange: Number(maxPrice) > Number(minPrice),
          originalPrice: p.originalPrice,
          originalPriceText: p.originalPrice ? formatPriceValue(p.originalPrice) : '',
          discount: p.discount,
          isNew: p.isNew,
          category: p.category,
          defaultPackageId: p.defaultPackageId,
          stock: p.defaultPackageStock || 0,
          salesCount: p.salesCount || 0
        }
      })
      var categories = data.categories || []
      var activeCat = categories.length > 0 ? categories[0] : ''
      var filtered = activeCat ? products.filter(function (p) { return p.category === activeCat }) : products
      that.setData({
        allProducts: products,
        products: filtered,
        categories: categories,
        activeCategory: activeCat,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  /** 点击左侧分类 */
  onCategoryTap: function (e) {
    var cat = e.currentTarget.dataset.cat
    this.setData({ activeCategory: cat })
    this.filterProducts()
  },

  /** 根据分类过滤商品 */
  filterProducts: function () {
    var cat = this.data.activeCategory
    var list = this.data.allProducts.filter(function (p) {
      return p.category === cat
    })
    this.setData({ products: list })
  },

  /** 跳转搜索页 */
  goSearch: function () {
    wx.navigateTo({ url: '/pages/shop/search/index' })
  },

  /** 跳转商品详情 */
  goToDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/shop/product-detail/index?id=' + id })
  },

  /** 快速加购 - 打开 SKU 弹窗 */
  onQuickAdd: function (e) {
    var that = this
    var id = e.currentTarget.dataset.id
    var product = that.data.allProducts.find(function (p) { return p.id === id })
    if (!product || product.stock <= 0) return

    if (!api.isLoggedIn()) {
      wx.showToast({ title: '请先在个人中心登录', icon: 'none' })
      return
    }

    // 加载商品规格
    that.setData({ showSku: true, skuProduct: product, skuPackages: [] })
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
          stock: pkgObj.stock || pkg.stock || 0,
          thumbUrl: thumbUrl ? imageUtil.resolveImageUrl(thumbUrl) : ''
        }
      })
      var selected = packages.length > 0 ? packages[0] : {}
      that.setData({ skuPackages: packages })
    })
  },

  /** 关闭 SKU 抽屉 */
  closeSku: function () {
    this.setData({ showSku: false })
  },

  /** SKU 抽屉 - 加入购物车 */
  onSkuAddCart: function (e) {
    var that = this
    var detail = e.detail
    if (!detail || !detail.package || !detail.package.id) return
    that.setData({ skuAdding: true })
    api.post('/api/cart', {
      packageId: detail.package.id,
      quantity: detail.quantity
    }).then(function () {
      wx.showToast({ title: '已加入购物车', icon: 'success' })
      that.setData({ showSku: false, skuAdding: false })
      api.updateCartBadge()
    }).catch(function () {
      that.setData({ skuAdding: false })
    })
  },

  /** SKU 抽屉 - 立即购买 */
  onSkuBuyNow: function (e) {
    var that = this
    var detail = e.detail
    if (!detail || !detail.package || !detail.package.id) return
    if (!that.data.skuProduct || !that.data.skuProduct.id) return
    that.setData({ showSku: false, skuAdding: false })
    wx.navigateTo({
      url: buildBuyNowCheckoutUrl(
        that.data.skuProduct.id,
        detail.package.id,
        detail.quantity || 1
      )
    })
  }
})
