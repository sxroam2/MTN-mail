Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '选择取消原因' },
    showAddToCart: { type: Boolean, value: true },
    reasons: {
      type: Array,
      value: [
        '规格/款式/数量拍错',
        '无法正常支付',
        '收货地址信息填写错误',
        '商品缺货',
        '我不想买了',
        '其他'
      ]
    }
  },

  data: {
    selectedReason: '',
    addToCart: true
  },

  observers: {
    show: function (show) {
      if (show) {
        this.setData({ selectedReason: '', addToCart: true })
      }
    }
  },

  methods: {
    noop: function () {},

    onClose: function () {
      this.triggerEvent('close')
    },

    selectReason: function (e) {
      this.setData({ selectedReason: e.currentTarget.dataset.reason })
    },

    toggleAddToCart: function () {
      this.setData({ addToCart: !this.data.addToCart })
    },

    onConfirm: function () {
      if (!this.data.selectedReason) {
        wx.showToast({ title: '请选择取消原因', icon: 'none' })
        return
      }

      this.triggerEvent('confirm', {
        reason: this.data.selectedReason,
        addToCart: this.data.addToCart
      })
    }
  }
})