var app = getApp()
var api = require('../../../utils/api.js')
var imageUtil = require('../../../utils/image.js')
var addressUtil = require('../../../utils/address.js')

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

function stripProductBrandPrefix(value) {
  var text = String(value || '').trim()
  if (!text) {
    return ''
  }

  var stripped = text
    .replace(/^(迈瑟伦|MAXELLENT|Maxcellent|Maysellent|Mayselun|迈瑟倫)[\s\-—–·/,:：，、()（）【】]*/i, '')
    .trim()

  return stripped || text
}

function buildPriceRangeText(packages, fallbackPrice) {
  var prices = (packages || []).map(function (pkg) {
    return Number(pkg.price)
  }).filter(function (price) {
    return isFinite(price)
  })

  if (prices.length > 0) {
    var minPrice = Math.min.apply(null, prices)
    var maxPrice = Math.max.apply(null, prices)
    if (maxPrice > minPrice) {
      return formatPriceValue(minPrice) + '-' + formatPriceValue(maxPrice)
    }
    return formatPriceValue(minPrice)
  }

  return formatPriceValue(fallbackPrice)
}

function buildAddressText(address) {
  if (!address) {
    return ''
  }
  return [address.province, address.city, address.district, address.detailAddress]
    .filter(function (part) { return !!part })
    .join('')
}

function buildPackagePreviewImages(pkg, fallbackImages) {
  var urls = []
  if (pkg) {
    if (pkg.images && pkg.images.length > 0) {
      urls = pkg.images.slice()
    }
    // 无套餐图片时回退到缩略图
    if (urls.length === 0 && pkg.thumbUrl) {
      urls = [pkg.thumbUrl]
    }
  }

  if (urls.length === 0) {
    return (fallbackImages || []).map(function (img) {
      return {
        id: img.id,
        url: img.url,
        altText: img.altText || ''
      }
    })
  }

  return urls.map(function (url, index) {
    return {
      id: 'pkg-' + index,
      url: url,
      altText: pkg && pkg.name ? pkg.name : ''
    }
  })
}

function buildBuyNowCheckoutUrl(productId, packageId, quantity, addressId) {
  var url = '/pages/shop/checkout/index?buyNowProductId='
    + encodeURIComponent(productId)
    + '&buyNowPackageId='
    + encodeURIComponent(packageId)
    + '&buyNowQuantity='
    + encodeURIComponent(quantity)

  if (addressId) {
    url += '&addressId=' + encodeURIComponent(addressId)
  }

  return url
}

function rpxToPx(rpx) {
  try {
    var windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
    var windowWidth = Number(windowInfo && windowInfo.windowWidth) || 375
    return Math.round(Number(rpx || 0) * windowWidth / 750)
  } catch (error) {
    return Math.round(Number(rpx || 0) / 2)
  }
}

Page({
  data: {
    productId: 0,
    product: null,
    isLoggedIn: false,
    productName: '',
    defaultPreviewImage: '',
    images: [],
    detailImages: [],
    productDescription: '',
    specs: [],
    specGroups: [],
    hasSpecCompare: false,
    specCompareHeaders: [],
    specCompareGroups: [],
    specCompareTableWidthRpx: 0,
    packages: [],
    accessories: [],
    defaultDisplayPackage: null,
    selectedPackage: null,
    priceRangeText: '0',
    quantity: 1,
    loading: true,
    currentSwiper: 0,
    isAllSoldOut: false,
    cartCount: 0,
    deliveryAddress: null,
    deliveryAddressText: '',
    selectedAddressId: 0,
    // 底部抽屉
    showSkuDrawer: false,
    skuAction: '', // 'cart' | 'buy'
    skuLoading: false,
    // 服务说明抽屉
    showServiceDrawer: false,
    // 吸顶导航
    showStickyNav: false,
    activeTab: 'product'
  },

  onLoad: function (options) {
    this.setData({
      productId: Number(options.id),
      isLoggedIn: api.isLoggedIn(),
      selectedAddressId: Number(options.addressId) || 0
    })
    this.loadDetail()
    this.loadCartCount()
    this.loadDeliveryAddress()
  },

  onShow: function () {
    this.setData({
      isLoggedIn: api.isLoggedIn()
    })
    this.loadCartCount()
    this.syncSelectedAddressFromPage()
    if (!api.isLoggedIn()) {
      this.applyDeliveryAddress(null)
      return
    }
    if (!this.data.deliveryAddress && api.isLoggedIn()) {
      this.loadDeliveryAddress()
    }
  },

  /** 页面滚动 —— 控制吸顶导航显示与 activeTab */
  onPageScroll: function (e) {
    var scrollTop = e.scrollTop
    var show = scrollTop > 600
    if (show !== this.data.showStickyNav) {
      this.setData({ showStickyNav: show })
    }
    // 缓存位置用于定位当前 tab
    if (!this._sectionQueryPending) {
      this._sectionQueryPending = true
      var that = this
      var query = wx.createSelectorQuery()
      query.select('#section-product').boundingClientRect()
      query.select('#section-detail').boundingClientRect()
      query.select('#section-specs').boundingClientRect()
      query.exec(function (rects) {
        that._sectionQueryPending = false
        var tabs = ['product', 'detail', 'specs']
        var active = 'product'
        var threshold = 120
        for (var i = tabs.length - 1; i >= 0; i--) {
          if (rects[i] && rects[i].top <= threshold) {
            active = tabs[i]
            break
          }
        }
        if (active !== that.data.activeTab) {
          that.setData({ activeTab: active })
        }
      })
    }
  },

  /** 点击导航菜单滚动到对应区域 */
  scrollToSection: function (e) {
    var section = e.currentTarget.dataset.section
    var that = this

    this.setData({ activeTab: section })

    if (section === 'product') {
      wx.pageScrollTo({ scrollTop: 0, duration: 300 })
      return
    }

    // 使用手动坐标计算方式，比 wx.pageScrollTo({ selector }) 更可靠
    // 避免吸顶菜单刚出现时（CSS 过渡尚未完成）selector 方式首次定位偏差
    this.scrollToSectionByKey(section, 0)
  },

  scrollToSectionByKey: function (section, retryCount) {
    var that = this
    var query = wx.createSelectorQuery().in(this)
    query.select('#anchor-' + section).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(function (res) {
      if (!res || !res[0] || !res[1]) {
        if (retryCount < 2) {
          setTimeout(function () {
            that.scrollToSectionByKey(section, retryCount + 1)
          }, 80)
        }
        return
      }

      var offset = rpxToPx(16)
      var scrollTop = Math.max(0, res[1].scrollTop + res[0].top - offset)
      wx.pageScrollTo({ scrollTop: scrollTop, duration: 300 })
    })
  },

  /** 加载商品详情 */
  loadDetail: function () {
    var that = this
    that.setData({ loading: true })
    api.get('/api/sitepublic/product-detail/' + that.data.productId, {
      query: { lang: 'zh-cn' }
    }).then(function (res) {
      var data = res.data || res
      var detail = data.productDetail || {}
      var product = detail.product || {}
      var i18n = detail.i18n || {}
      // 产品名称优先取 i18n.name，回退到 sku
      var productName = stripProductBrandPrefix(i18n.name || product.name || product.title || product.sku || '')
      // 按 imageType 分类图片
      var allApiImages = detail.images || []
      var productMainImages = allApiImages.filter(function (img) {
        return img.imageType === 'main'
      }).map(function (img) {
        return { id: img.id, url: imageUtil.resolveImageUrl(img.imageUrl || img.url), altText: img.altText || '' }
      })
      var galleryImages = (productMainImages.length ? productMainImages : allApiImages.filter(function (img) {
        return img.imageType === 'card' || img.imageType === 'hero' || !img.imageType || img.imageType === 'gallery'
      }).map(function (img) {
        return { id: img.id, url: imageUtil.resolveImageUrl(img.imageUrl || img.url), altText: img.altText || '' }
      }))
      var detailImages = allApiImages.filter(function (img) {
        return img.imageType === 'detail'
      }).map(function (img) {
        return { id: img.id, url: imageUtil.resolveImageUrl(img.imageUrl || img.url), altText: img.altText || '' }
      })
      if (galleryImages.length === 0) {
        galleryImages = allApiImages.filter(function (img) {
          return img.imageType !== 'detail'
        }).map(function (img) {
          return { id: img.id, url: imageUtil.resolveImageUrl(img.imageUrl || img.url), altText: img.altText || '' }
        })
      }
      var productImages = galleryImages
      var productDescription = i18n.description || product.description || ''

      // 解析规格参数（按中文字段映射）
      var rawSpecs = detail.specs || []
      var specGroupMap = {}
      var specGroupOrder = []
      rawSpecs.forEach(function (s) {
        var group = s.specGroupZh || '基本参数'
        if (!specGroupMap[group]) {
          specGroupMap[group] = []
          specGroupOrder.push(group)
        }
        specGroupMap[group].push({ id: s.id, key: s.specKeyZh || '', value: s.specValueZh || '' })
      })
      var specGroups = specGroupOrder.map(function (g) {
        return { name: g, items: specGroupMap[g] }
      })

      var packages = (detail.packages || []).map(function (pkg) {
        var pkgObj = pkg.package || pkg
        var pkgI18n = pkg.i18n || {}
        var thumbUrl = pkgObj.thumbUrl || ''
        var pkgImages = (pkg.images || []).map(function (img) {
          return imageUtil.resolveImageUrl(img.imageUrl || img.url || '')
        })
        var resolvedThumbUrl = thumbUrl
          ? imageUtil.resolveImageUrl(thumbUrl)
          : (pkgImages[0] || (productImages[0] && productImages[0].url) || '')
        return {
          id: pkgObj.id || pkg.id,
          name: pkgI18n.name || pkgObj.name || pkgObj.sku || pkg.name || pkg.packageName || '',
          price: pkgObj.price || pkg.price,
          priceText: formatPriceValue(pkgObj.price || pkg.price),
          originalPrice: pkgObj.originalPrice || pkg.originalPrice,
          originalPriceText: (pkgObj.originalPrice || pkg.originalPrice) ? formatPriceValue(pkgObj.originalPrice || pkg.originalPrice) : '',
          stock: pkgObj.stock || pkg.stock || 0,
          description: pkgI18n.description || pkgObj.description || pkg.description || '',
          thumbUrl: resolvedThumbUrl,
          images: pkgImages,
          enableCompare: !!pkgObj.enableCompare,
          specValues: pkg.specValues || []
        }
      })
      var accessories = (detail.accessories || []).map(function (acc) {
        return {
          name: acc.name || acc.accessoryName,
          imageUrl: imageUtil.resolveImageUrl(acc.imageUrl || acc.image || '')
        }
      })
      var defaultDisplayPackage = null
      var isAllSoldOut = packages.length > 0 && packages.every(function (p) { return p.stock <= 0 })
      var priceRangeText = buildPriceRangeText(packages, product.basePrice || product.salePrice || 0)

      // 保存产品原始图片
      that._originalImages = productImages

      // 默认显示产品主图，点击套餐后再切换到套餐展示图片
      var displayImages = productImages

      // 构建参数对比表（由统一开关控制，兼容旧数据里按参数标记的对比项）
      var compareEnabled = packages.some(function (p) {
        return !!p.enableCompare
      }) || rawSpecs.some(function (spec) {
        return !!spec.showInCompare
      })
      var compareSpecs = rawSpecs.filter(function (spec) {
        return !!spec.showInCompare
      })
      var compareSourceSpecs = compareSpecs.length > 0 ? compareSpecs : rawSpecs
      var hasSpecCompare = packages.length > 1 && compareEnabled && compareSourceSpecs.length > 0
      var specCompareHeaders = []
      var specCompareGroups = []
      var specCompareTableWidthRpx = 0
      if (hasSpecCompare) {
        specCompareHeaders = packages.map(function (p) { return p.name })
        specCompareTableWidthRpx = Math.max(640, 180 + specCompareHeaders.length * 220)
        var compareGroupMap = {}
        var compareGroupOrder = []
        compareSourceSpecs.forEach(function (spec) {
          var groupName = spec.specGroupZh || '基本参数'
          if (!compareGroupMap[groupName]) {
            compareGroupMap[groupName] = []
            compareGroupOrder.push(groupName)
          }
          compareGroupMap[groupName].push({
            id: spec.id,
            key: spec.specKeyZh || '',
            value: spec.specValueZh || ''
          })
        })
        specCompareGroups = compareGroupOrder.map(function (groupName) {
          return {
            name: groupName,
            rows: (compareGroupMap[groupName] || []).map(function (spec) {
              return {
                key: spec.key,
                values: packages.map(function (pkg) {
                  var sv = (pkg.specValues || []).find(function (v) { return v.productSpecId === spec.id })
                  return sv ? (sv.valueZh || '-') : (spec.value || '-')
                })
              }
            })
          }
        })
      }

      that.setData({
        product: product,
        productName: productName,
        defaultPreviewImage: (productImages[0] && productImages[0].url) || (detailImages[0] && detailImages[0].url) || '',
        productDescription: productDescription,
        images: displayImages,
        detailImages: detailImages,
        specs: rawSpecs,
        specGroups: specGroups,
        hasSpecCompare: hasSpecCompare,
        specCompareHeaders: specCompareHeaders,
        specCompareGroups: specCompareGroups,
        specCompareTableWidthRpx: specCompareTableWidthRpx,
        packages: packages,
        accessories: accessories,
        defaultDisplayPackage: defaultDisplayPackage,
        selectedPackage: null,
        priceRangeText: priceRangeText,
        isAllSoldOut: isAllSoldOut,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /** 获取购物车数量（角标用） */
  loadCartCount: function () {
    var that = this
    if (!api.isLoggedIn()) return
    api.get('/api/cart', { showError: false }).then(function (res) {
      var items = res.data || res || []
      var count = 0
      items.forEach(function (item) {
        count += (item.cartItem && item.cartItem.quantity) || 1
      })
      that.setData({ cartCount: count || 0 })
    }).catch(function () {})
  },

  onSwiperChange: function (e) {
    this.setData({ currentSwiper: e.detail.current })
  },

  previewImage: function (e) {
    var idx = e.currentTarget.dataset.index || 0
    var urls = this.data.images.map(function (img) { return img.url })
    wx.previewImage({ current: urls[idx], urls: urls })
  },

  selectPackage: function (e) {
    var pkgId = e.currentTarget.dataset.id
    var pkg = this.data.packages.find(function (p) { return p.id === pkgId })
    if (pkg && pkg.stock > 0) {
      var update = {
        selectedPackage: pkg,
        quantity: 1,
        images: buildPackagePreviewImages(pkg, this._originalImages || this.data.images),
        currentSwiper: 0
      }
      this.setData(update)
    }
  },

  onQuantityChange: function (e) {
    this.setData({ quantity: e.detail })
  },

  onQuantityMinus: function () {
    var qty = this.data.quantity
    if (qty > 1) {
      this.setData({ quantity: qty - 1 })
    }
  },

  onQuantityPlus: function () {
    var qty = this.data.quantity
    var max = (this.data.selectedPackage && this.data.selectedPackage.stock) || 1
    if (qty < max) {
      this.setData({ quantity: qty + 1 })
    }
  },

  /** 打开规格抽屉 —— 加入购物车 */
  openSkuForCart: function () {
    this.setData({ showSkuDrawer: true, skuAction: 'cart' })
  },

  /** 打开规格抽屉 —— 立即购买 */
  openSkuForBuy: function () {
    this.setData({ showSkuDrawer: true, skuAction: 'buy' })
  },

  /** 关闭规格抽屉 */
  closeSkuDrawer: function () {
    this.setData({ showSkuDrawer: false })
  },

  getSelectedActionDetail: function () {
    var selectedPackage = this.data.selectedPackage
    if (!selectedPackage || !selectedPackage.id) {
      return null
    }
    if (selectedPackage.stock <= 0) {
      wx.showToast({ title: '当前套餐已售罄', icon: 'none' })
      return null
    }

    return {
      package: selectedPackage,
      quantity: Math.max(1, Number(this.data.quantity) || 1)
    }
  },

  executeAddToCart: function (detail) {
    var that = this
    if (!api.requireLogin({
      message: '登录后可加入购物车，并同步到你的账号。'
    })) {
      return
    }
    that.setData({ skuLoading: true })
    api.post('/api/cart', {
      packageId: detail.package.id,
      quantity: detail.quantity
    }).then(function () {
      wx.showToast({ title: '已加入购物车', icon: 'success' })
      that.setData({ showSkuDrawer: false, skuLoading: false, selectedPackage: detail.package, quantity: detail.quantity })
      api.updateCartBadge()
      that.loadCartCount()
    }).catch(function () {
      that.setData({ skuLoading: false })
    })
  },

  executeBuyNow: function (detail) {
    var that = this
    if (!api.requireLogin({
      message: '登录后可继续购买并查看订单进度。'
    })) {
      return
    }
    that.setData({ showSkuDrawer: false, skuLoading: false, selectedPackage: detail.package, quantity: detail.quantity })
    wx.navigateTo({
      url: buildBuyNowCheckoutUrl(
        that.data.productId,
        detail.package.id,
        detail.quantity || 1,
        that.data.deliveryAddress && that.data.deliveryAddress.id
      )
    })
  },

  handleGoodsActionAddToCart: function () {
    this.openSkuForCart()
  },

  handleGoodsActionBuyNow: function () {
    var detail = this.getSelectedActionDetail()
    if (!detail) {
      this.openSkuForBuy()
      return
    }
    this.executeBuyNow(detail)
  },

  /** SKU 组件 - 选择套餐 */
  onSkuSelectPackage: function (e) {
    var pkg = e.detail.package
    if (pkg && pkg.id) {
      this.setData({
        selectedPackage: pkg,
        quantity: 1,
        images: buildPackagePreviewImages(pkg, this._originalImages || this.data.images),
        currentSwiper: 0
      })
      return
    }

    this.setData({
      selectedPackage: null,
      quantity: 1,
      images: (this._originalImages || []).slice(),
      currentSwiper: 0
    })
  },

  /** SKU 组件 - 加入购物车 */
  onSkuAddCart: function (e) {
    this.executeAddToCart(e.detail)
  },

  /** SKU 组件 - 立即购买 */
  onSkuBuyNow: function (e) {
    this.executeBuyNow(e.detail)
  },

  /** 加入购物车 */
  addToCart: function () {
    this.handleGoodsActionAddToCart()
  },

  goToCart: function () {
    wx.switchTab({ url: '/pages/shop/cart/index' })
  },

  openCustomerService: function () {
    app.openCustomerServiceChat()
  },

  goShop: function () {
    wx.switchTab({ url: '/pages/shop/index' })
  },

  /** 立即购买 */
  buyNow: function () {
    this.handleGoodsActionBuyNow()
  },

  onShareAppMessage: function () {
    return {
      title: this.data.productName || '迈瑟伦商品',
      path: '/pages/shop/product-detail/index?id=' + this.data.productId,
      imageUrl: this._originalImages && this._originalImages.length > 0
        ? this._originalImages[0].url
        : (this.data.images.length > 0 ? this.data.images[0].url : '')
    }
  },

  goAddressSelect: function () {
    if (!api.requireLogin({
      message: '登录后可选择和管理收货地址。'
    })) {
      return
    }
    addressUtil.navigateToAddressSelector(this, function (address) {
      if (!addressUtil.isDomesticAddress(address)) {
        wx.showToast({ title: '小程序暂不支持国际地址', icon: 'none' })
        return
      }

      this.applyDeliveryAddress(address)
    }.bind(this))
  },

  syncSelectedAddressFromPage: function () {
    addressUtil.consumeSelectedAddress(this, function (address) {
      if (addressUtil.isDomesticAddress(address)) {
        this.applyDeliveryAddress(address)
      } else {
        wx.showToast({ title: '小程序暂不支持国际地址', icon: 'none' })
      }
    }.bind(this))
  },

  loadDeliveryAddress: function () {
    var that = this
    if (!api.isLoggedIn()) {
      that.applyDeliveryAddress(null)
      return
    }
    api.get('/api/address', { showError: false }).then(function (res) {
      var addresses = addressUtil.filterDomesticAddresses(res.data || res || [])
      if (!addresses.length) {
        that.applyDeliveryAddress(null)
        return
      }
      var preferredId = that.data.selectedAddressId || (that.data.deliveryAddress && that.data.deliveryAddress.id) || 0
      var currentAddress = addresses.find(function (item) { return item.id === preferredId })
        || addresses.find(function (item) { return item.isDefault })
        || addresses[0]
      that.applyDeliveryAddress(currentAddress)
    }).catch(function () {
      that.applyDeliveryAddress(null)
    })
  },

  applyDeliveryAddress: function (address) {
    this.setData({
      deliveryAddress: address || null,
      deliveryAddressText: buildAddressText(address),
      selectedAddressId: address ? address.id : 0
    })
  },

  previewSkuThumb: function () {
    var previewPackage = this.data.selectedPackage || this.data.defaultDisplayPackage
    var previewImages = buildPackagePreviewImages(previewPackage, this._originalImages || this.data.images)
    var urls = previewImages.map(function (item) { return item.url }).filter(Boolean)
    var current = previewPackage && previewPackage.thumbUrl
      ? previewPackage.thumbUrl
      : (urls[0] || '')

    if (!current) {
      return
    }
    if (urls.indexOf(current) < 0) {
      urls.unshift(current)
    }
    wx.previewImage({ current: current, urls: urls })
  },

  showServiceInfo: function () {
    this.setData({ showServiceDrawer: true })
  },

  closeServiceDrawer: function () {
    this.setData({ showServiceDrawer: false })
  }
})
