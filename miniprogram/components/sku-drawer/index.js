var imageUtil = require('../../utils/image.js')

Component({
  properties: {
    /** 控制显示/隐藏 */
    show: { type: Boolean, value: false },
    /** 商品对象（必传，用以判断加载状态） */
    product: { type: Object, value: null },
    /** 商品名称 */
    productName: { type: String, value: '' },
    /** 套餐数组 */
    packages: { type: Array, value: [] },
    /** 默认缩略图 URL（未选套餐时） */
    defaultThumbUrl: { type: String, value: '' },
    /** 价格区间文本（未选套餐时显示） */
    priceRangeText: { type: String, value: '' },
    /** 初始选中套餐 ID */
    selectedPackageId: { type: Number, value: 0 },
    /** 初始数量 */
    initQuantity: { type: Number, value: 1 },
    /**
     * 模式：
     * - 'full' = 加入购物车 + 立即购买（详情页）
     * - 'cart-only' = 仅加入购物车（商城首页快速加购）
     * - 'confirm' = 仅确定（购物车切换套餐）
     */
    mode: { type: String, value: 'full' },
    /** 按钮 loading */
    loading: { type: Boolean, value: false },
    /** 是否自动选中第一个有库存的套餐 */
    autoSelectFirst: { type: Boolean, value: false }
  },

  data: {
    selectedPkg: {},
    quantity: 1,
    maxStock: 1,
    thumbUrl: ''
  },

  observers: {
    'show, packages, selectedPackageId, defaultThumbUrl': function (show) {
      if (!show) return
      var packages = this.properties.packages || []
      var selectedId = this.properties.selectedPackageId
      var pkg = {}
      if (selectedId) {
        pkg = packages.find(function (p) { return p.id === selectedId }) || {}
      }
      if (!pkg.id && this.properties.autoSelectFirst && packages.length > 0) {
        pkg = packages.find(function (p) { return p.stock > 0 }) || packages[0]
      }
      var maxStock = pkg.stock || 1
      var quantity = this.properties.initQuantity || 1
      if (quantity > maxStock) quantity = maxStock
      if (quantity < 1) quantity = 1
      this.setData({
        selectedPkg: pkg,
        quantity: quantity,
        maxStock: maxStock,
        thumbUrl: this._resolveThumb(pkg)
      })
    }
  },

  methods: {
    _resolveThumb: function (pkg) {
      if (pkg && pkg.thumbUrl) return pkg.thumbUrl
      if (pkg && pkg.images && pkg.images.length > 0) return pkg.images[0]
      return this.properties.defaultThumbUrl || ''
    },

    onClose: function () {
      this.triggerEvent('close')
    },

    onPkgTap: function (e) {
      var pkgId = e.currentTarget.dataset.id
      var pkg = (this.properties.packages || []).find(function (p) { return p.id === pkgId })
      if (!pkg || pkg.stock <= 0) return

      if (this.data.selectedPkg && this.data.selectedPkg.id === pkg.id) {
        this.setData({
          selectedPkg: {},
          quantity: 1,
          maxStock: 1,
          thumbUrl: this._resolveThumb(null)
        })
        this.triggerEvent('selectpackage', {
          package: null,
          canceled: true,
          packageId: pkgId
        })
        return
      }

      this.setData({
        selectedPkg: pkg,
        quantity: 1,
        maxStock: pkg.stock || 1,
        thumbUrl: this._resolveThumb(pkg)
      })
      this.triggerEvent('selectpackage', { package: pkg })
    },

    onMinus: function () {
      if (this.data.quantity > 1) {
        this.setData({ quantity: this.data.quantity - 1 })
      }
    },

    onPlus: function () {
      if (this.data.quantity < this.data.maxStock) {
        this.setData({ quantity: this.data.quantity + 1 })
      }
    },

    onThumbTap: function () {
      var pkg = this.data.selectedPkg
      var urls = []
      if (pkg && pkg.images && pkg.images.length > 0) {
        urls = pkg.images.slice()
      }
      if (pkg && pkg.thumbUrl) {
        if (urls.indexOf(pkg.thumbUrl) < 0) urls.unshift(pkg.thumbUrl)
      }
      if (urls.length === 0 && this.data.thumbUrl) {
        urls = [this.data.thumbUrl]
      }
      if (urls.length > 0) {
        wx.previewImage({ current: urls[0], urls: urls })
      }
    },

    onAddCart: function () {
      if (!this.data.selectedPkg.id) {
        wx.showToast({ title: '请选择规格', icon: 'none' })
        return
      }
      this.triggerEvent('addcart', {
        package: this.data.selectedPkg,
        quantity: this.data.quantity
      })
    },

    onBuyNow: function () {
      if (!this.data.selectedPkg.id) {
        wx.showToast({ title: '请选择规格', icon: 'none' })
        return
      }
      this.triggerEvent('buynow', {
        package: this.data.selectedPkg,
        quantity: this.data.quantity
      })
    },

    onConfirm: function () {
      if (!this.data.selectedPkg.id) {
        wx.showToast({ title: '请选择规格', icon: 'none' })
        return
      }
      this.triggerEvent('confirm', {
        package: this.data.selectedPkg,
        quantity: this.data.quantity
      })
    }
  }
})