var api = require('../../../utils/api.js')
var imageUtil = require('../../../utils/image.js')
var afterSalesUtil = require('../../../utils/after-sales.js')

function buildIncompleteRepairLockReasonMap(requests) {
  var reasonMap = {}

  ;(requests || []).forEach(function (request) {
    var type = String(request && request.afterSaleType || '').toLowerCase()
    var status = Number(request && request.afterSaleStatus)
    if (type !== 'repair' || [0, 1, 2].indexOf(status) === -1) {
      return
    }

    var reason = status >= 2
      ? '该商品维修中，需待当前维修单完成后才能再次申请维修'
      : '该商品已有维修申请处理中，需待当前维修单完成后才能再次申请维修'

    ;(request.items || []).forEach(function (item) {
      var orderItemId = Number(item && item.orderItemId || 0)
      if (!orderItemId || reasonMap[orderItemId]) {
        return
      }
      reasonMap[orderItemId] = reason
    })
  })

  return reasonMap
}

Page({
  data: {
    orderNo: '',
    itemId: null,
    order: null,
    payment: null,
    refundSummary: null,
    items: [],
    config: afterSalesUtil.getFallbackOrderDetailPageConfig(),
    loading: true,
    loadError: '',
    submitting: false,
    availableAfterSaleTypes: [],
    afterSaleType: '',
    afterSaleTypeLabel: '',
    afterSaleTypeDescription: '',
    showTypeSheet: false,
    tempAfterSaleType: '',
    reasonText: '',
    reasons: [],
    showReasonSheet: false,
    tempReason: '',
    description: '',
    requestedRefundAmount: '',
    fileList: [],
    evidenceImageUrls: [],
    forceWholeOrderRefund: true,
    requiresReturnFlow: false,
    requiresCustomRefundAmount: false,
    shippingMethod: 'pickup',
    selectedAddress: null,
    pickupDateStart: '',
    pickupDate: '',
    pickupDateOptions: [],
    showPickupDateSheet: false,
    tempPickupDate: '',
    pickupSlotOptions: [],
    pickupSlotLabels: [],
    pickupSlotIndex: -1,
    pickupSlotValue: '',
    pickupSlotText: '',
    showPickupSlotSheet: false,
    tempPickupSlotValue: '',
    selectedSubtotal: 0,
    selectedSubtotalText: '0.00',
    selectedRefundedAmount: 0,
    selectedRefundedAmountText: '0.00',
    selectedRemainingRefundAmount: 0,
    selectedRemainingRefundAmountText: '0.00',
    maxCustomRefundAmount: 0,
    customAmountHint: '',
    speedRefundVisible: false,
    shippingRefundTipVisible: false,
    returnFlowTitle: '寄回安排',
    showRefundSummaryCards: true,
    showPriceDiffCard: false,
    showPickupFeeCard: false,
    showDeliveryFeeCard: false,
    priceDiffAmount: 0,
    priceDiffText: '',
    priceDiffHintText: '',
    pickupServiceFee: 0,
    pickupServiceFeeText: '',
    deliveryFee: 0,
    deliveryFeeText: '',
    supplementPayAmount: 0,
    supplementPayAmountText: '0.00',
    showSupplementPayment: false,
    submitButtonText: '提交售后申请',
    showExchangeDrawer: false,
    productCatalogLoading: false,
    productCatalog: [],
    productCategories: [],
    activeProductCategory: '',
    exchangeDrawerKeyword: '',
    filteredProductCatalog: [],
    exchangeDrawerItemId: null,
    exchangeDrawerProductId: null,
    exchangeDrawerProductTitle: '',
    exchangeDrawerProductDescription: '',
    exchangeDrawerProductImg: '',
    exchangeDrawerPackages: [],
    exchangeDrawerPackagesLoading: false,
    exchangeDrawerSelectedPackage: null,
    exchangeDrawerSelectedPackageImages: [],
    exchangeDrawerPackageId: null,
    exchangeDrawerQuantity: 1,
    exchangeDrawerExistingSelection: false
  },

  _detailPayload: null,
  _pageConfig: null,
  _selectedAddress: null,
  _pickupFeeRules: null,
  _expressRules: null,
  _productPackageCache: null,
  _supplementPollTimer: null,
  _preferredAfterSaleType: '',

  onLoad: function (options) {
    this._pickupFeeRules = []
    this._expressRules = []
    this._productPackageCache = {}
    this._preferredAfterSaleType = String(options.afterSaleType || '').trim().toLowerCase()
    this._pageConfig = afterSalesUtil.getFallbackOrderDetailPageConfig()
    this.setData({
      orderNo: options.orderNo || '',
      itemId: options.itemId ? Number(options.itemId) : null,
      pickupDateStart: this.formatDate(new Date())
    })
    this.loadPageConfig()
    this.loadSupportData()
    this.loadDetail()
  },

  onUnload: function () {
    this.clearSupplementPollTimer()
  },

  onShow: function () {
    this.syncSelectedAddressFromPage()
  },

  syncSelectedAddressFromPage: function () {
    var pages = getCurrentPages()
    var current = pages[pages.length - 1]
    if (current && current._selectedAddress) {
      this.applySelectedAddress(current._selectedAddress)
      current._selectedAddress = null
    }
  },

  loadPageConfig: function () {
    var that = this
    afterSalesUtil.fetchOrderDetailPageConfig(api).then(function (config) {
      that._pageConfig = config
      that.setData({ config: config })
      that.applyPageState()
    })
  },

  loadSupportData: function () {
    var that = this
    Promise.all([
      api.get('/api/config/pickup-fee', { showError: false }).catch(function () { return [] }),
      api.get('/api/config/express', { showError: false }).catch(function () { return [] })
    ]).then(function (results) {
      that._pickupFeeRules = (results[0] && (results[0].data || results[0])) || []
      that._expressRules = (results[1] && (results[1].data || results[1])) || []
      that.refreshDerivedState()
    })
  },

  loadDetail: function () {
    var that = this
    that.setData({ loading: true })
    api.get('/api/orders/detail/' + that.data.orderNo).then(function (res) {
      var data = res.data || res
      var rawOrder = data.order || data
      var repairLockReasonMap = buildIncompleteRepairLockReasonMap(data.afterSalesRequests || [])
      var items = (Array.isArray(data.items) ? data.items : []).map(function (item) {
        var remainingRefundAmount = item.remainingRefundAmount != null ? Number(item.remainingRefundAmount) : Number(item.subtotal || 0)
        var refundedAmount = Number(item.refundedAmount || 0)
        var repairLockReason = repairLockReasonMap[item.id]
        return {
          id: item.id,
          productId: item.productId,
          packageId: item.packageId,
          productName: item.snapProductName || '商品',
          packageName: [item.snapPackageName || '', item.snapSku || ''].filter(function (part) { return !!String(part || '').trim() }).join(' / '),
          imageUrl: imageUtil.resolveImageUrl(item.snapImageUrl),
          unitPrice: Number(item.unitPrice || 0),
          quantity: Number(item.quantity || 0),
          subtotal: Number(item.subtotal || 0),
          refundedAmount: refundedAmount,
          refundedAmountText: that.formatAmount(refundedAmount),
          remainingRefundAmount: remainingRefundAmount,
          remainingRefundAmountText: that.formatAmount(remainingRefundAmount),
          afterSalesLocked: !!item.afterSalesLocked || !!repairLockReason,
          afterSalesLockReason: repairLockReason || item.afterSalesLockReason || '该商品已完成退款，不能重复申请售后',
          selected: false,
          selectedQuantity: 0
        }
      })

      that._detailPayload = {
        order: rawOrder,
        payment: data.payment || null,
        refundSummary: data.refundSummary || null,
        refundRecords: data.refundRecords || [],
        afterSalesRequests: data.afterSalesRequests || [],
        items: items
      }

      that.setData({
        order: Object.assign({}, rawOrder, {
          createTimeText: that.formatTime(rawOrder.createTime),
          payTimeText: that.formatTime(rawOrder.payTime)
        }),
        payment: data.payment || null,
        refundSummary: afterSalesUtil.computeRefundSummary({
          order: rawOrder,
          payment: data.payment || null,
          refundSummary: data.refundSummary || null,
          refundRecords: data.refundRecords || [],
          afterSalesRequests: data.afterSalesRequests || [],
          items: items
        }),
        loading: false
      })
      that.applyPageState()
    }).catch(function () {
      that.setData({ loading: false, loadError: '加载失败，请稍后重试' })
    })
  },

  applyPageState: function () {
    var detail = this._detailPayload
    if (!detail) return

    var config = this._pageConfig || afterSalesUtil.getFallbackOrderDetailPageConfig()
    var entryState = afterSalesUtil.getAfterSalesEntryState(detail, config)
    var allowedTypes = entryState.availableAfterSaleTypes || []

    if (!entryState.canRequest || !allowedTypes.length) {
      var lockedStage = afterSalesUtil.getAfterSalesOrderStage(detail.order)
      this.setData({
        loadError: entryState.reason || '当前订单暂不支持申请售后',
        items: this.decorateItems(detail.items, false, ''),
        availableAfterSaleTypes: [],
        afterSaleType: '',
        afterSaleTypeLabel: '',
        afterSaleTypeDescription: '',
        showTypeSheet: false,
        tempAfterSaleType: '',
        reasons: [],
        reasonText: '',
        forceWholeOrderRefund: lockedStage !== 3
      })
      return
    }

    var preferredType = this._preferredAfterSaleType || this.data.afterSaleType
    var selectedType = allowedTypes.find(function (item) {
      return item.key === preferredType
    }) || allowedTypes[0]
    var reasons = afterSalesUtil.getReasonOptions(selectedType.key, detail.order, config)
    var nextReason = this.data.reasonText
    if (reasons.indexOf(nextReason) === -1) {
      nextReason = ''
    }

    var forceWholeOrderRefund = afterSalesUtil.getAfterSalesOrderStage(detail.order) !== 3
    var items = this.decorateItems(detail.items, forceWholeOrderRefund, selectedType.key)

    this.setData({
      loadError: '',
      config: config,
      availableAfterSaleTypes: allowedTypes,
      afterSaleType: selectedType.key,
      afterSaleTypeLabel: selectedType.label || afterSalesUtil.getAfterSaleTypeLabel(selectedType.key),
      afterSaleTypeDescription: selectedType.description || '',
      showTypeSheet: false,
      tempAfterSaleType: selectedType.key,
      reasons: reasons,
      reasonText: nextReason,
      items: items,
      forceWholeOrderRefund: forceWholeOrderRefund
    })
    this.refreshDerivedState()
  },

  applyAfterSaleType: function (type) {
    var detail = this._detailPayload
    if (!detail || !type || type === this.data.afterSaleType) return

    var selectedType = (this.data.availableAfterSaleTypes || []).find(function (item) {
      return item.key === type
    })
    if (!selectedType) return

    var forceWholeOrderRefund = afterSalesUtil.getAfterSalesOrderStage(detail.order) !== 3
    var reasons = afterSalesUtil.getReasonOptions(type, detail.order, this._pageConfig || this.data.config)
    var nextReason = reasons.indexOf(this.data.reasonText) >= 0 ? this.data.reasonText : ''
    var items = this.decorateItems(detail.items, forceWholeOrderRefund, type)

    this.setData({
      afterSaleType: type,
      afterSaleTypeLabel: selectedType.label || afterSalesUtil.getAfterSaleTypeLabel(type),
      afterSaleTypeDescription: selectedType.description || '',
      showTypeSheet: false,
      tempAfterSaleType: type,
      reasons: reasons,
      reasonText: nextReason,
      items: items,
      requestedRefundAmount: afterSalesUtil.reasonRequiresRequestedAmount(nextReason) ? this.data.requestedRefundAmount : '',
      showExchangeDrawer: type === 'exchange' ? this.data.showExchangeDrawer : false,
      exchangeDrawerKeyword: ''
    })
    this.refreshDerivedState()
  },

  openTypeSheet: function () {
    if ((this.data.availableAfterSaleTypes || []).length <= 1) return
    this.setData({
      showTypeSheet: true,
      tempAfterSaleType: this.data.afterSaleType
    })
  },

  closeTypeSheet: function () {
    this.setData({
      showTypeSheet: false,
      tempAfterSaleType: this.data.afterSaleType
    })
  },

  selectTypeItem: function (e) {
    var type = String(e.currentTarget.dataset.type || '')
    if (!type) return
    this.setData({ tempAfterSaleType: type })
  },

  confirmTypeSheet: function () {
    var type = String(this.data.tempAfterSaleType || '')
    if (!type || type === this.data.afterSaleType) {
      this.closeTypeSheet()
      return
    }
    this.applyAfterSaleType(type)
  },

  decorateItems: function (items, forceWholeOrderRefund, afterSaleType) {
    var previousMap = {}
    ;(this.data.items || []).forEach(function (item) {
      previousMap[item.id] = item
    })

    return (items || []).map(function (item) {
      var previous = previousMap[item.id]
      var nextItem = Object.assign({
        exchangeProductId: null,
        exchangePackageId: null,
        exchangeQuantity: 0,
        exchangeTitle: '',
        exchangePackageLabel: '',
        exchangeDescription: '',
        exchangeImageUrl: '',
        exchangePrice: 0,
        exchangePriceText: ''
      }, item)

      nextItem.lockBadgeText = '已退款'
      nextItem.showRemainingRefundAmount = !nextItem.afterSalesLocked

      if (item.afterSalesLocked) {
        nextItem.selected = false
        nextItem.selectedQuantity = 0
        return nextItem
      }

      if (afterSaleType === 'exchange') {
        nextItem.selected = false
        nextItem.selectedQuantity = 0
        return nextItem
      }

      if (forceWholeOrderRefund) {
        nextItem.selected = true
        nextItem.selectedQuantity = item.quantity
        return nextItem
      }

      if (previous) {
        nextItem.selected = !!previous.selected
        nextItem.selectedQuantity = nextItem.selected
          ? Math.max(1, Math.min(Number(previous.selectedQuantity || 1), item.quantity))
          : 0
        nextItem.exchangeProductId = previous.exchangeProductId || null
        nextItem.exchangePackageId = previous.exchangePackageId || null
        nextItem.exchangeQuantity = Number(previous.exchangeQuantity || 0)
        nextItem.exchangeTitle = previous.exchangeTitle || ''
        nextItem.exchangePackageLabel = previous.exchangePackageLabel || ''
        nextItem.exchangeDescription = previous.exchangeDescription || ''
        nextItem.exchangeImageUrl = previous.exchangeImageUrl || ''
        nextItem.exchangePrice = Number(previous.exchangePrice || 0)
        nextItem.exchangePriceText = previous.exchangePriceText || ''
        return nextItem
      }

      nextItem.selected = true
      nextItem.selectedQuantity = item.quantity
      return nextItem
    })
  },

  refreshDerivedState: function () {
    if (!this._detailPayload || !this.data.afterSaleType) return

    var summary = this.computeSelectionSummary()
    var reason = this.data.reasonText
    var afterSaleType = this.data.afterSaleType
    var isExchangeType = afterSaleType === 'exchange'
    var isRepairType = afterSaleType === 'repair'
    var requiresCustomRefundAmount = afterSaleType === 'return-refund' && afterSalesUtil.reasonRequiresRequestedAmount(reason)
    var requiresReturnFlow = isExchangeType || isRepairType || (afterSaleType === 'return-refund' && !requiresCustomRefundAmount)
    var slotOptions = afterSalesUtil.buildPickupSlots(this.data.pickupDate, new Date())
    var slotIndex = slotOptions.findIndex(function (item) {
      return item.value === this.data.pickupSlotValue
    }, this)
    var slotValue = slotIndex >= 0 ? slotOptions[slotIndex].value : ''
    var strictLessThanRemaining = afterSalesUtil.reasonRequiresStrictLessThanRemaining(reason)
    var maxCustomRefundAmount = summary.remainingRefundAmount
    if (strictLessThanRemaining) {
      maxCustomRefundAmount = Math.max(summary.remainingRefundAmount - 0.01, 0)
    }

    var customAmountHint = ''
    if (requiresCustomRefundAmount) {
      if (maxCustomRefundAmount <= 0) {
        customAmountHint = strictLessThanRemaining
          ? '退差价金额必须小于剩余可退金额，当前剩余可退金额不足以申请退差价。'
          : '当前剩余可退金额不足以提交该售后金额。'
      } else {
        customAmountHint = strictLessThanRemaining
          ? '售后金额必须小于剩余可退金额，当前最多可输入 ¥' + this.formatAmount(maxCustomRefundAmount)
          : '售后金额不能超过剩余可退金额，当前最多可输入 ¥' + this.formatAmount(maxCustomRefundAmount)
      }
    }

    var pickupServiceFee = this.computePickupServiceFee(summary.subtotal, requiresReturnFlow)
    var deliveryFee = this.computeDeliveryFee(summary.subtotal, isExchangeType, isRepairType)
    var priceDiffAmount = this.computePriceDiffAmount(isExchangeType)
    var supplementPayAmount = this.roundAmount(Math.max(0, priceDiffAmount + pickupServiceFee + deliveryFee))
    var showRefundSummaryCards = afterSaleType === 'refund' || afterSaleType === 'return-refund'
    var showPriceDiffCard = isExchangeType && this.getSelectedItems().some(function (item) {
      return !!item.exchangePackageId
    })
    var showPickupFeeCard = requiresReturnFlow && pickupServiceFee > 0
    var showDeliveryFeeCard = (isExchangeType || isRepairType) && deliveryFee > 0
    var pickupServiceFeeText = pickupServiceFee > 0 ? '上门取件费 ¥' + this.formatAmount(pickupServiceFee) : ''
    var deliveryFeeText = deliveryFee > 0
      ? (isExchangeType ? '换货发货运费 ¥' : '维修发货运费 ¥') + this.formatAmount(deliveryFee)
      : ''
    var priceDiffText = ''
    if (showPriceDiffCard) {
      if (!priceDiffAmount) {
        priceDiffText = '当前无需商品差价'
      } else if (priceDiffAmount > 0) {
        priceDiffText = '需补差价 ¥' + this.formatAmount(Math.abs(priceDiffAmount))
      } else {
        priceDiffText = '需退差价 ¥' + this.formatAmount(Math.abs(priceDiffAmount))
      }
    }

    var priceDiffHintText = ''
    if (showPriceDiffCard) {
      if (supplementPayAmount > 0) {
        priceDiffHintText = '提交申请时将先拉起微信支付，支付成功后自动提交售后申请'
      } else if (priceDiffAmount < 0) {
        priceDiffHintText = '审核通过后将按最终结果退回差价'
      } else {
        priceDiffHintText = '审核后将按最终换货结果处理'
      }
    } else if (showPickupFeeCard || showDeliveryFeeCard) {
      priceDiffHintText = supplementPayAmount > 0
        ? '提交申请时将先拉起微信支付，支付成功后自动提交售后申请'
        : '费用将以审核结果为准'
    }

    this.setData({
      requiresCustomRefundAmount: requiresCustomRefundAmount,
      requiresReturnFlow: requiresReturnFlow,
      returnFlowTitle: isRepairType ? '维修寄回安排' : isExchangeType ? '寄回与换货安排' : '寄回安排',
      selectedSubtotal: summary.subtotal,
      selectedSubtotalText: this.formatAmount(summary.subtotal),
      selectedRefundedAmount: summary.refundedAmount,
      selectedRefundedAmountText: this.formatAmount(summary.refundedAmount),
      selectedRemainingRefundAmount: summary.remainingRefundAmount,
      selectedRemainingRefundAmountText: this.formatAmount(summary.remainingRefundAmount),
      showRefundSummaryCards: showRefundSummaryCards,
      pickupSlotOptions: slotOptions,
      pickupSlotLabels: slotOptions.map(function (item) { return item.label }),
      pickupSlotIndex: slotIndex,
      pickupSlotValue: slotValue,
      pickupSlotText: slotIndex >= 0 ? slotOptions[slotIndex].label : '',
      maxCustomRefundAmount: maxCustomRefundAmount,
      customAmountHint: customAmountHint,
      shippingRefundTipVisible: this.data.afterSaleType === 'refund' && Number(this.data.order && this.data.order.orderStatus) === 1 && !requiresCustomRefundAmount,
      speedRefundVisible: this.isEligibleForSpeedRefund(),
      showPriceDiffCard: showPriceDiffCard,
      showPickupFeeCard: showPickupFeeCard,
      showDeliveryFeeCard: showDeliveryFeeCard,
      priceDiffAmount: priceDiffAmount,
      priceDiffText: priceDiffText,
      priceDiffHintText: priceDiffHintText,
      pickupServiceFee: pickupServiceFee,
      pickupServiceFeeText: pickupServiceFeeText,
      deliveryFee: deliveryFee,
      deliveryFeeText: deliveryFeeText,
      supplementPayAmount: supplementPayAmount,
      supplementPayAmountText: this.formatAmount(supplementPayAmount),
      showSupplementPayment: (isExchangeType || isRepairType) && supplementPayAmount > 0,
      submitButtonText: (isExchangeType || isRepairType) && supplementPayAmount > 0 ? '去支付并提交' : '提交售后申请'
    })
  },

  computeSelectionSummary: function () {
    var subtotal = 0
    var refundedAmount = 0
    var remainingRefundAmount = 0

    ;(this.data.items || []).forEach(function (item) {
      var selectedQuantity = Number(item.selectedQuantity || 0)
      if (!item.selected || selectedQuantity <= 0) return
      subtotal += Number(item.unitPrice || 0) * selectedQuantity
      refundedAmount += this.scaleAmountByQuantity(item.refundedAmount, item.quantity, selectedQuantity)
      remainingRefundAmount += this.scaleAmountByQuantity(item.remainingRefundAmount, item.quantity, selectedQuantity)
    }, this)

    return {
      subtotal: this.roundAmount(subtotal),
      refundedAmount: this.roundAmount(refundedAmount),
      remainingRefundAmount: this.roundAmount(remainingRefundAmount)
    }
  },

  computePickupServiceFee: function (subtotal, requiresReturnFlow) {
    if (!requiresReturnFlow || this.data.shippingMethod !== 'pickup') return 0

    var rules = (this._pickupFeeRules || []).slice().sort(function (left, right) {
      var leftSort = Number(left && left.sortOrder) || 0
      var rightSort = Number(right && right.sortOrder) || 0
      if (leftSort !== rightSort) return leftSort - rightSort
      return (Number(left && left.id) || 0) - (Number(right && right.id) || 0)
    })

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i]
      var conditionType = String(rule && rule.conditionType || '').trim().toLowerCase()
      var conditionValue = Number(rule && rule.conditionValue || 0)
      var serviceFee = Number(rule && rule.serviceFee || 0)
      if (conditionType === 'amount_gte' && subtotal >= conditionValue) return this.roundAmount(serviceFee)
      if (conditionType === 'amount_lt' && subtotal < conditionValue) return this.roundAmount(serviceFee)
      if (conditionType === 'default') return this.roundAmount(serviceFee)
    }

    return 0
  },

  computeDeliveryFee: function (subtotal, isExchangeType, isRepairType) {
    if (!isExchangeType && !isRepairType) return 0

    var rules = (this._expressRules || []).slice().sort(function (left, right) {
      var leftSort = Number(left && left.sortOrder) || 0
      var rightSort = Number(right && right.sortOrder) || 0
      if (leftSort !== rightSort) return leftSort - rightSort
      return (Number(left && left.id) || 0) - (Number(right && right.id) || 0)
    })
    var addressText = this.buildDeliveryAddressText().toLowerCase()

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i]
      var conditionType = String(rule && rule.conditionType || '').trim().toLowerCase()
      var conditionValue = String(rule && rule.conditionValue || '').trim().toLowerCase()
      var shippingFee = Number(rule && rule.shippingFee || 0)
      if (conditionType === 'amount_gte' && subtotal >= Number(conditionValue || 0)) return this.roundAmount(shippingFee)
      if (conditionType === 'amount_lt' && subtotal < Number(conditionValue || 0)) return this.roundAmount(shippingFee)
      if (conditionType === 'region_contains' && conditionValue && addressText.indexOf(conditionValue) >= 0) return this.roundAmount(shippingFee)
      if (conditionType === 'default') return this.roundAmount(shippingFee)
    }

    return 0
  },

  buildDeliveryAddressText: function () {
    if (this.data.selectedAddress) {
      return this.data.selectedAddress.fullAddressText || afterSalesUtil.buildUserAddressText(this.data.selectedAddress)
    }
    return String(this.data.order && this.data.order.snapAddress || '')
  },

  computePriceDiffAmount: function (isExchangeType) {
    if (!isExchangeType) return 0

    return this.roundAmount(this.getSelectedItems().reduce(function (total, item) {
      if (!item.exchangePackageId) return total
      var selectedQuantity = Number(item.selectedQuantity || 0)
      var exchangeQuantity = Number(item.exchangeQuantity || selectedQuantity || 0)
      if (selectedQuantity <= 0 || exchangeQuantity <= 0) return total
      return total + Number(item.exchangePrice || 0) * exchangeQuantity - Number(item.unitPrice || 0) * selectedQuantity
    }, 0))
  },

  scaleAmountByQuantity: function (totalAmount, orderQuantity, selectedQuantity) {
    var total = Number(totalAmount || 0)
    var orderQty = Number(orderQuantity || 0)
    var selectedQty = Number(selectedQuantity || 0)
    if (orderQty <= 0 || selectedQty <= 0) return 0
    if (selectedQty >= orderQty) return this.roundAmount(total)
    return this.roundAmount(total * selectedQty / orderQty)
  },

  roundAmount: function (value) {
    return Number(Number(value || 0).toFixed(2))
  },

  showReasons: function () {
    if (!this.data.reasons.length) {
      wx.showToast({ title: '暂无可选售后原因', icon: 'none' })
      return
    }
    this.setData({ showReasonSheet: true, tempReason: this.data.reasonText || '' })
  },

  selectReasonItem: function (e) {
    this.setData({ tempReason: e.currentTarget.dataset.reason })
  },

  confirmReason: function () {
    if (!this.data.tempReason) {
      wx.showToast({ title: '请选择售后原因', icon: 'none' })
      return
    }
    var reason = this.data.tempReason
    this.setData({
      reasonText: reason,
      showReasonSheet: false,
      requestedRefundAmount: afterSalesUtil.reasonRequiresRequestedAmount(reason) ? this.data.requestedRefundAmount : ''
    })
    this.refreshDerivedState()
  },

  closeReasonSheet: function () {
    this.setData({ showReasonSheet: false })
  },

  noop: function () {},

  onDescChange: function (e) {
    var value = e && e.detail && e.detail.value !== undefined ? e.detail.value : e.detail
    this.setData({ description: value || '' })
  },

  onRequestedRefundAmountInput: function (e) {
    var value = String(e.detail.value || '')
      .replace(/[^\d.]/g, '')
      .replace(/\.(?=.*\.)/g, '')
    this.setData({ requestedRefundAmount: value })
  },

  toggleItem: function (e) {
    var itemId = Number(e.currentTarget.dataset.id)
    var forceWholeOrderRefund = this.data.forceWholeOrderRefund
    var items = (this.data.items || []).map(function (item) {
      if (item.id !== itemId) return item
      if (item.afterSalesLocked || forceWholeOrderRefund) return item
      var selected = !item.selected
      return Object.assign({}, item, {
        selected: selected,
        selectedQuantity: selected ? Math.max(1, Number(item.selectedQuantity || 1)) : 0
      })
    })
    this.setData({ items: items })
    this.refreshDerivedState()
  },

  changeQuantity: function (e) {
    var itemId = Number(e.currentTarget.dataset.id)
    var delta = Number(e.currentTarget.dataset.delta || 0)
    var items = (this.data.items || []).map(function (item) {
      if (item.id !== itemId) return item
      if (item.afterSalesLocked || this.data.forceWholeOrderRefund || !item.selected) return item
      var nextQuantity = Math.max(1, Math.min(Number(item.quantity || 1), Number(item.selectedQuantity || 1) + delta))
      return Object.assign({}, item, {
        selectedQuantity: nextQuantity
      })
    }, this)
    this.setData({ items: items })
    this.refreshDerivedState()
  },

  selectShippingMethod: function (e) {
    var method = e.currentTarget.dataset.method
    if (method !== 'pickup' && method !== 'self') return
    this.setData({ shippingMethod: method })
    this.refreshDerivedState()
  },

  chooseAddress: function () {
    var that = this
    wx.navigateTo({
      url: '/pages/shop/address/index?select=1',
      success: function (res) {
        if (res && res.eventChannel) {
          res.eventChannel.on('addressSelected', function (address) {
            if (address) {
              that.applySelectedAddress(address)
            }
          })
        }
      }
    })
  },

  applySelectedAddress: function (address) {
    var normalizedAddress = Object.assign({}, address, {
      fullAddressText: address.fullAddressText || afterSalesUtil.buildUserAddressText(address)
    })
    this.setData({ selectedAddress: normalizedAddress })
    this.refreshDerivedState()
  },

  findItemById: function (itemId) {
    return (this.data.items || []).find(function (item) {
      return Number(item.id) === Number(itemId)
    }) || null
  },

  getProductTitleById: function (productId) {
    var product = (this.data.productCatalog || []).find(function (item) {
      return Number(item.id) === Number(productId)
    })
    return product ? product.title : ''
  },

  getProductImgById: function (productId) {
    var product = (this.data.productCatalog || []).find(function (item) {
      return Number(item.id) === Number(productId)
    })
    return product ? (product.img || '') : ''
  },

  getCachedExchangeProductDescription: function (productId) {
    var cacheEntry = this._productPackageCache[productId]
    if (cacheEntry && !Array.isArray(cacheEntry)) {
      return cacheEntry.productDescription || ''
    }
    return ''
  },

  buildExchangePackagePreviewImages: function (pkg) {
    var urls = []
    if (pkg) {
      if (pkg.thumbUrl) {
        urls.push(pkg.thumbUrl)
      }
      if (Array.isArray(pkg.images) && pkg.images.length) {
        pkg.images.forEach(function (url) {
          if (url && urls.indexOf(url) < 0) {
            urls.push(url)
          }
        })
      }
    }
    return urls.filter(function (url) {
      return !!url
    })
  },

  getExchangeDrawerSelectedPackage: function (packages, packageId) {
    return (packages || []).find(function (item) {
      return Number(item.id) === Number(packageId)
    }) || null
  },

  getFirstAvailableExchangePackage: function (packages) {
    return (packages || []).find(function (item) {
      return !item.disabled && Number(item.stock || 0) > 0
    }) || null
  },

  syncExchangeDrawerSelectionState: function (patch, callback) {
    var nextPatch = patch || {}
    var hasOwn = Object.prototype.hasOwnProperty
    var packages = hasOwn.call(nextPatch, 'exchangeDrawerPackages')
      ? (nextPatch.exchangeDrawerPackages || [])
      : (this.data.exchangeDrawerPackages || [])
    var packageId = hasOwn.call(nextPatch, 'exchangeDrawerPackageId')
      ? nextPatch.exchangeDrawerPackageId
      : this.data.exchangeDrawerPackageId
    var selectedPackage = this.getExchangeDrawerSelectedPackage(packages, packageId)

    this.setData(Object.assign({}, nextPatch, {
      exchangeDrawerSelectedPackage: selectedPackage,
      exchangeDrawerSelectedPackageImages: this.buildExchangePackagePreviewImages(selectedPackage)
    }), callback)
  },

  buildProductCategoryTabs: function (products, serverCategories) {
    var seen = {}
    var orderedCategories = []
    ;(serverCategories || []).forEach(function (name) {
      var category = String(name || '').trim()
      if (category && !seen[category]) {
        seen[category] = true
        orderedCategories.push(category)
      }
    })
    ;(products || []).forEach(function (item) {
      var category = String(item && item.category || '').trim()
      if (category && !seen[category]) {
        seen[category] = true
        orderedCategories.push(category)
      }
    })

    return [{ key: '__all__', label: '全部' }].concat(orderedCategories.map(function (name) {
      return { key: name, label: name }
    }))
  },

  restoreProductCatalogViewState: function (categoryKey, products, serverCategories) {
    var catalog = Array.isArray(products) ? products : (this.data.productCatalog || [])
    var categoryTabs = this.buildProductCategoryTabs(catalog, serverCategories)
    var defaultKey = (categoryTabs[0] || {}).key || ''
    var requestedKey = categoryKey || this.data.activeProductCategory || defaultKey
    var hasCategory = requestedKey && categoryTabs.some(function (item) {
      return item.key === requestedKey
    })
    var nextCategory = hasCategory ? requestedKey : defaultKey

    var keyword = String(this.data.exchangeDrawerKeyword || '').trim().toLowerCase()
    var filtered = nextCategory === '__all__'
      ? catalog.slice()
      : (nextCategory
        ? catalog.filter(function (item) { return String(item.category || '') === String(nextCategory) })
        : catalog.slice())

    if (keyword) {
      filtered = filtered.filter(function (item) {
        return String(item && item.title || '').toLowerCase().indexOf(keyword) >= 0
      })
    }

    this.setData({
      productCatalog: catalog,
      productCategories: categoryTabs,
      activeProductCategory: nextCategory,
      filteredProductCatalog: filtered
    })

    return filtered
  },

  ensureProductCatalog: function () {
    var that = this
    if ((that.data.productCatalog || []).length) {
      that.restoreProductCatalogViewState('', that.data.productCatalog, (that.data.productCategories || []).filter(function (item) {
        return item.key !== '__all__'
      }).map(function (item) {
        return item.label
      }))
      return Promise.resolve(that.data.productCatalog || [])
    }
    if (that.data.productCatalogLoading) {
      return Promise.resolve(that.data.productCatalog || [])
    }

    that.setData({ productCatalogLoading: true })
    return api.get('/api/sitepublic/product', { showError: false }).then(function (res) {
      var data = res.data || res || {}
      var products = (data.products || []).map(function (item) {
        return {
          id: Number(item.id || 0),
          title: item.title || '商品',
          img: imageUtil.resolveImageUrl(item.img),
          category: String(item.category || '').trim(),
          priceText: that.formatAmount(item.price || item.salePrice || 0)
        }
      }).filter(function (item) {
        return item.id > 0
      })

      var serverCategories = (data.categories || []).map(function (name) {
        return String(name || '').trim()
      }).filter(function (name) {
        return !!name
      })

      that.setData({
        productCatalogLoading: false
      })
      that.restoreProductCatalogViewState('', products, serverCategories)
      return products
    }).catch(function (err) {
      that.setData({ productCatalogLoading: false })
      throw err
    })
  },

  applyFilteredProductCatalog: function (categoryKey) {
    return this.restoreProductCatalogViewState(categoryKey, this.data.productCatalog, (this.data.productCategories || []).filter(function (item) {
      return item.key !== '__all__'
    }).map(function (item) {
      return item.label
    }))
  },

  selectExchangeDrawerCategory: function (e) {
    var key = String(e.currentTarget.dataset.key || '__all__')
    if (key === this.data.activeProductCategory) return
    this.applyFilteredProductCatalog(key)
  },

  onExchangeDrawerKeywordInput: function (e) {
    var keyword = String(e.detail.value || '')
    this.setData({
      exchangeDrawerKeyword: keyword
    }, function () {
      this.applyFilteredProductCatalog(this.data.activeProductCategory)
    }.bind(this))
  },

  buildExchangeDrawerPackages: function (productId) {
    var targetItem = this.findItemById(this.data.exchangeDrawerItemId)
    var cacheEntry = this._productPackageCache[productId] || []
    var packages = Array.isArray(cacheEntry) ? cacheEntry : (cacheEntry.packages || [])
    var fallbackImg = this.getProductImgById(productId)
    return packages.map(function (pkg) {
      var disabled = !!targetItem
        && Number(targetItem.productId) === Number(productId)
        && Number(targetItem.packageId) === Number(pkg.id)
      return Object.assign({}, pkg, {
        disabled: disabled,
        priceText: this.formatAmount(pkg.price),
        thumbUrl: pkg.thumbUrl || fallbackImg || ''
      })
    }, this)
  },

  ensureExchangePackages: function (productId) {
    var that = this
    var productTitle = that.getProductTitleById(productId)
    if (that._productPackageCache[productId]) {
      var cachedPackages = that.buildExchangeDrawerPackages(productId)
      var cachedProductDescription = that.getCachedExchangeProductDescription(productId)
      var matchedCachedPackage = cachedPackages.find(function (item) {
        return Number(item.id) === Number(that.data.exchangeDrawerPackageId)
      })
      that.syncExchangeDrawerSelectionState({
        exchangeDrawerProductTitle: productTitle,
        exchangeDrawerProductDescription: cachedProductDescription,
        exchangeDrawerPackages: cachedPackages,
        exchangeDrawerPackagesLoading: false,
        exchangeDrawerPackageId: matchedCachedPackage && !matchedCachedPackage.disabled && Number(matchedCachedPackage.stock || 0) > 0
          ? that.data.exchangeDrawerPackageId
          : null
      })
      return Promise.resolve(cachedPackages)
    }

    that.syncExchangeDrawerSelectionState({
      exchangeDrawerProductTitle: productTitle,
      exchangeDrawerProductDescription: '',
      exchangeDrawerPackagesLoading: true,
      exchangeDrawerPackages: []
    })

    return api.get('/api/sitepublic/product-detail/' + productId, { showError: false }).then(function (res) {
      var data = res.data || res || {}
      var detail = data.productDetail || {}
      var product = detail.product || {}
      var i18n = detail.i18n || {}
      var resolvedProductTitle = productTitle || i18n.name || product.name || product.title || product.sku || '商品'
      var productDescription = i18n.description || product.description || ''
      var packages = (detail.packages || []).map(function (pkg) {
        var pkgObj = pkg.package || pkg
        var pkgI18n = pkg.i18n || {}
        var thumbUrl = pkgObj.thumbUrl || ''
        var images = (pkg.images || []).map(function (img) {
          return imageUtil.resolveImageUrl(img.imageUrl || img.url || '')
        }).filter(function (url) {
          return !!url
        })
        var resolvedThumbUrl = thumbUrl ? imageUtil.resolveImageUrl(thumbUrl) : (images[0] || '')
        return {
          id: Number(pkgObj.id || pkg.id || 0),
          label: pkgI18n.name || pkgObj.name || pkgObj.sku || pkg.name || pkg.packageName || '默认规格',
          price: Number(pkgObj.price || pkg.price || 0),
          stock: Number(pkgObj.stock || pkg.stock || 0),
          description: pkgI18n.description || pkgObj.description || pkg.description || '',
          thumbUrl: resolvedThumbUrl,
          images: images
        }
      }).filter(function (item) {
        return item.id > 0
      })

      that._productPackageCache[productId] = {
        packages: packages,
        productDescription: productDescription
      }
      var drawerPackages = that.buildExchangeDrawerPackages(productId)
      var matchedPackage = drawerPackages.find(function (item) {
        return Number(item.id) === Number(that.data.exchangeDrawerPackageId)
      })
      that.syncExchangeDrawerSelectionState({
        exchangeDrawerProductTitle: resolvedProductTitle,
        exchangeDrawerProductDescription: productDescription,
        exchangeDrawerPackagesLoading: false,
        exchangeDrawerPackages: drawerPackages,
        exchangeDrawerPackageId: matchedPackage && !matchedPackage.disabled && Number(matchedPackage.stock || 0) > 0
          ? that.data.exchangeDrawerPackageId
          : null
      })
      return drawerPackages
    }).catch(function (err) {
      that.syncExchangeDrawerSelectionState({
        exchangeDrawerProductDescription: '',
        exchangeDrawerPackagesLoading: false,
        exchangeDrawerPackages: []
      })
      throw err
    })
  },

  openExchangeDrawer: function (e) {
    var that = this
    var itemId = Number(e.currentTarget.dataset.id)
    var targetItem = that.findItemById(itemId)
    if (!targetItem) return

    that.syncExchangeDrawerSelectionState({
      showExchangeDrawer: true,
      exchangeDrawerItemId: itemId,
      exchangeDrawerKeyword: '',
      exchangeDrawerProductId: Number(targetItem.exchangeProductId || targetItem.productId || 0) || null,
      exchangeDrawerPackageId: Number(targetItem.exchangePackageId || 0) || null,
      exchangeDrawerQuantity: Math.max(1, Number(targetItem.exchangeQuantity || targetItem.selectedQuantity || 1)),
      exchangeDrawerExistingSelection: !!targetItem.exchangePackageId,
      exchangeDrawerPackages: [],
      exchangeDrawerPackagesLoading: false,
      exchangeDrawerProductTitle: '',
      exchangeDrawerProductDescription: '',
      exchangeDrawerProductImg: ''
    }, function () {
      that.ensureProductCatalog().then(function (products) {
        var fallbackProductId = Number(targetItem.exchangeProductId || targetItem.productId || (products[0] && products[0].id) || 0)
        if (!fallbackProductId) return []
        var fallbackProduct = (products || []).find(function (item) {
          return Number(item.id) === fallbackProductId
        }) || null
        that.applyFilteredProductCatalog(fallbackProduct && fallbackProduct.category ? fallbackProduct.category : '')
        that.setData({
          exchangeDrawerProductId: fallbackProductId,
          exchangeDrawerProductImg: fallbackProduct && fallbackProduct.img ? fallbackProduct.img : that.getProductImgById(fallbackProductId)
        })
        return that.ensureExchangePackages(fallbackProductId)
      }).catch(function () {
        wx.showToast({ title: '可更换商品加载失败', icon: 'none' })
      })
    })
  },

  closeExchangeDrawer: function () {
    this.setData({
      showExchangeDrawer: false,
      exchangeDrawerExistingSelection: false,
      exchangeDrawerKeyword: ''
    })
  },

  selectExchangeDrawerProduct: function (e) {
    var productId = Number(e.currentTarget.dataset.productId)
    if (!productId) return
    if (productId === Number(this.data.exchangeDrawerProductId || 0) && (this.data.exchangeDrawerPackages || []).length) return

    this.syncExchangeDrawerSelectionState({
      exchangeDrawerProductId: productId,
      exchangeDrawerProductImg: ((this.data.productCatalog || []).find(function (item) {
        return Number(item.id) === Number(productId)
      }) || {}).img || this.getProductImgById(productId),
      exchangeDrawerPackageId: null,
      exchangeDrawerPackages: [],
      exchangeDrawerProductDescription: ''
    })

    this.ensureExchangePackages(productId).then(function (packages) {
      var firstAvailable = this.getFirstAvailableExchangePackage(packages)
      if (!firstAvailable) {
        return
      }
      this.syncExchangeDrawerSelectionState({
        exchangeDrawerPackageId: Number(firstAvailable.id),
        exchangeDrawerQuantity: Math.max(1, Math.min(Number(this.data.exchangeDrawerQuantity || 1), Number(firstAvailable.stock || 1)))
      })
    }.bind(this)).catch(function () {
      wx.showToast({ title: '更换规格加载失败', icon: 'none' })
    })
  },

  selectExchangeDrawerPackage: function (e) {
    var packageId = Number(e.currentTarget.dataset.packageId)
    var target = (this.data.exchangeDrawerPackages || []).find(function (item) {
      return Number(item.id) === Number(packageId)
    })
    if (!target) return
    if (target.disabled) {
      wx.showToast({ title: '不可选择原商品原套餐', icon: 'none' })
      return
    }
    if (Number(target.stock || 0) <= 0) {
      wx.showToast({ title: '当前规格库存不足', icon: 'none' })
      return
    }

    this.syncExchangeDrawerSelectionState({
      exchangeDrawerPackageId: packageId,
      exchangeDrawerQuantity: Math.max(1, Math.min(Number(this.data.exchangeDrawerQuantity || 1), Number(target.stock || 1)))
    })
  },

  previewExchangePackageImages: function (e) {
    var packageId = Number(e.currentTarget.dataset.packageId || 0)
    var current = String(e.currentTarget.dataset.current || '')
    var target = packageId
      ? (this.data.exchangeDrawerPackages || []).find(function (item) {
          return Number(item.id) === packageId
        })
      : this.data.exchangeDrawerSelectedPackage

    if (!target) return

    var urls = this.buildExchangePackagePreviewImages(target)
    if (!urls.length) return

    wx.previewImage({
      current: current || urls[0],
      urls: urls
    })
  },

  previewSelectedExchangePackage: function (e) {
    var urls = (this.data.exchangeDrawerSelectedPackageImages || []).filter(function (url) {
      return !!url
    })
    if (!urls.length) return

    var index = Number(e.currentTarget.dataset.index || 0)
    wx.previewImage({
      current: urls[index] || urls[0],
      urls: urls
    })
  },

  changeExchangeDrawerQuantity: function (e) {
    var delta = Number(e.currentTarget.dataset.delta || 0)
    var selectedPackage = (this.data.exchangeDrawerPackages || []).find(function (item) {
      return Number(item.id) === Number(this.data.exchangeDrawerPackageId)
    }, this)
    var maxQuantity = selectedPackage && Number(selectedPackage.stock || 0) > 0 ? Number(selectedPackage.stock) : 99
    var nextQuantity = Math.max(1, Math.min(maxQuantity, Number(this.data.exchangeDrawerQuantity || 1) + delta))
    this.setData({ exchangeDrawerQuantity: nextQuantity })
  },

  clearExchangeDrawerSelection: function () {
    var itemId = Number(this.data.exchangeDrawerItemId || 0)
    if (!itemId) return

    var items = (this.data.items || []).map(function (item) {
      if (Number(item.id) !== itemId) return item
      return Object.assign({}, item, {
        exchangeProductId: null,
        exchangePackageId: null,
        exchangeQuantity: 0,
        exchangeTitle: '',
        exchangePackageLabel: '',
        exchangeDescription: '',
        exchangeImageUrl: '',
        exchangePrice: 0,
        exchangePriceText: ''
      })
    })

    this.setData({
      items: items,
      showExchangeDrawer: false,
      exchangeDrawerExistingSelection: false
    })
    this.refreshDerivedState()
  },

  confirmExchangeDrawer: function () {
    var itemId = Number(this.data.exchangeDrawerItemId || 0)
    var productId = Number(this.data.exchangeDrawerProductId || 0)
    var packageId = Number(this.data.exchangeDrawerPackageId || 0)
    if (!itemId || !productId || !packageId) {
      wx.showToast({ title: '请选择更换商品规格', icon: 'none' })
      return
    }

    var selectedPackage = (this.data.exchangeDrawerPackages || []).find(function (item) {
      return Number(item.id) === Number(packageId)
    })
    if (!selectedPackage || selectedPackage.disabled || Number(selectedPackage.stock || 0) <= 0) {
      wx.showToast({ title: '当前规格不可选择', icon: 'none' })
      return
    }

    var productTitle = this.getProductTitleById(productId) || this.data.exchangeDrawerProductTitle || '商品'
    var items = (this.data.items || []).map(function (item) {
      if (Number(item.id) !== itemId) return item
      return Object.assign({}, item, {
        exchangeProductId: productId,
        exchangePackageId: packageId,
        exchangeQuantity: Number(this.data.exchangeDrawerQuantity || item.selectedQuantity || 1),
        exchangeTitle: productTitle,
        exchangePackageLabel: selectedPackage.label || '',
        exchangeDescription: selectedPackage.description || this.data.exchangeDrawerProductDescription || '',
        exchangeImageUrl: selectedPackage.thumbUrl || this.buildExchangePackagePreviewImages(selectedPackage)[0] || '',
        exchangePrice: Number(selectedPackage.price || 0),
        exchangePriceText: this.formatAmount(selectedPackage.price || 0)
      })
    }, this)

    this.setData({
      items: items,
      showExchangeDrawer: false,
      exchangeDrawerExistingSelection: false
    })
    this.refreshDerivedState()
  },

  onPickupDateChange: function (e) {
    this.setData({
      pickupDate: e.detail.value,
      pickupSlotIndex: -1,
      pickupSlotValue: '',
      pickupSlotText: ''
    })
    this.refreshDerivedState()
  },

  onPickupSlotChange: function (e) {
    var index = Number(e.detail.value)
    var option = this.data.pickupSlotOptions[index]
    this.setData({
      pickupSlotIndex: index,
      pickupSlotValue: option ? option.value : '',
      pickupSlotText: option ? option.label : ''
    })
  },

  buildPickupDateOptions: function () {
    var weekDays = ['日', '一', '二', '三', '四', '五', '六']
    var now = new Date()
    var options = []
    for (var i = 0; i < 7; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
      var prefix = i === 0 ? '今天 ' : i === 1 ? '明天 ' : i === 2 ? '后天 ' : ''
      options.push({
        value: this.formatDate(d),
        label: prefix + (d.getMonth() + 1) + '/' + d.getDate() + ' 周' + weekDays[d.getDay()]
      })
    }
    return options
  },

  openPickupDateSheet: function () {
    this.setData({
      pickupDateOptions: this.buildPickupDateOptions(),
      tempPickupDate: this.data.pickupDate || '',
      showPickupDateSheet: true
    })
  },

  selectPickupDateItem: function (e) {
    this.setData({ tempPickupDate: e.currentTarget.dataset.value })
  },

  confirmPickupDate: function () {
    if (!this.data.tempPickupDate) {
      wx.showToast({ title: '请选择上门日期', icon: 'none' })
      return
    }
    this.setData({
      pickupDate: this.data.tempPickupDate,
      showPickupDateSheet: false,
      pickupSlotIndex: -1,
      pickupSlotValue: '',
      pickupSlotText: ''
    })
    this.refreshDerivedState()
  },

  closePickupDateSheet: function () {
    this.setData({ showPickupDateSheet: false })
  },

  openPickupSlotSheet: function () {
    if (!this.data.pickupDate) {
      wx.showToast({ title: '请先选择上门日期', icon: 'none' })
      return
    }
    if (!(this.data.pickupSlotOptions || []).length) {
      wx.showToast({ title: '当天无可选时段', icon: 'none' })
      return
    }
    this.setData({
      tempPickupSlotValue: this.data.pickupSlotValue || '',
      showPickupSlotSheet: true
    })
  },

  selectPickupSlotItem: function (e) {
    this.setData({ tempPickupSlotValue: e.currentTarget.dataset.value })
  },

  confirmPickupSlot: function () {
    if (!this.data.tempPickupSlotValue) {
      wx.showToast({ title: '请选择时间段', icon: 'none' })
      return
    }
    var options = this.data.pickupSlotOptions || []
    var target = this.data.tempPickupSlotValue
    var index = -1
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === target) { index = i; break }
    }
    if (index < 0) {
      this.setData({ showPickupSlotSheet: false })
      return
    }
    this.setData({
      pickupSlotIndex: index,
      pickupSlotValue: options[index].value,
      pickupSlotText: options[index].label,
      showPickupSlotSheet: false
    })
  },

  closePickupSlotSheet: function () {
    this.setData({ showPickupSlotSheet: false })
  },

  onAfterRead: function (e) {
    var that = this
    var files = Array.isArray(e.detail.file) ? e.detail.file : [e.detail.file]
    var currentFileList = (that.data.fileList || []).slice()
    var remainCount = Math.max(0, 4 - currentFileList.length)
    var allowedFiles = files.slice(0, remainCount)

    allowedFiles.forEach(function (file) {
      currentFileList.push({ url: file.url, status: 'uploading', message: '上传中' })
    })

    that.setData({ fileList: currentFileList })

    allowedFiles.forEach(function (file) {
      that.uploadEvidenceFile(file)
    })

    if (allowedFiles.length < files.length) {
      wx.showToast({ title: '凭证图片最多上传 4 张', icon: 'none' })
    }
  },

  uploadEvidenceFile: function (file) {
    var that = this
    var fileList = (that.data.fileList || []).slice()
    var index = fileList.findIndex(function (item) {
      return item.url === file.url && item.status === 'uploading'
    })

    api.uploadFile('/api/orders/after-sales/upload-evidence', file.url, 'file').then(function (res) {
      var payload = res || {}
      var code = typeof payload.code === 'number'
        ? payload.code
        : typeof payload.Code === 'number'
          ? payload.Code
          : 200
      var message = payload.message || payload.Message || '上传失败'
      if (code !== 200) {
        throw new Error(message)
      }

      var remoteUrl = payload.data || payload.Data || payload.url || file.url
      var previewUrl = imageUtil.resolveImageUrl(remoteUrl)
      if (index >= 0) {
        fileList[index] = {
          url: previewUrl,
          remoteUrl: remoteUrl,
          status: 'done',
          message: ''
        }
      }

      var evidenceImageUrls = (that.data.evidenceImageUrls || []).slice()
      if (evidenceImageUrls.indexOf(remoteUrl) === -1) {
        evidenceImageUrls.push(remoteUrl)
      }

      that.setData({
        fileList: fileList,
        evidenceImageUrls: evidenceImageUrls
      })
    }).catch(function (err) {
      if (index >= 0) {
        fileList[index] = {
          url: file.url,
          status: 'failed',
          message: '上传失败'
        }
      }
      that.setData({ fileList: fileList })
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
    })
  },

  onDeleteImage: function (e) {
    var index = Number(e.detail.index)
    var fileList = (this.data.fileList || []).slice()
    var removed = fileList.splice(index, 1)[0]
    var removedRemoteUrl = removed ? (removed.remoteUrl || removed.url) : ''
    var evidenceImageUrls = (this.data.evidenceImageUrls || []).filter(function (url) {
      return removedRemoteUrl ? url !== removedRemoteUrl : true
    })
    this.setData({
      fileList: fileList,
      evidenceImageUrls: evidenceImageUrls
    })
  },

  getSelectedItems: function () {
    return (this.data.items || []).filter(function (item) {
      return item.selected && Number(item.selectedQuantity || 0) > 0
    })
  },

  isEligibleForSpeedRefund: function () {
    if (this.data.afterSaleType !== 'refund') return false
    var minutes = afterSalesUtil.toNumber(this.data.config && this.data.config.speedRefundMinutes)
    if (minutes <= 0) return false
    if (Number(this.data.order && this.data.order.orderStatus) !== 1) return false
    var createTime = afterSalesUtil.parseTime(this.data.order && this.data.order.createTime)
    if (!createTime) return false
    return Date.now() - createTime.getTime() <= minutes * 60 * 1000
  },

  buildPayload: function () {
    var selectedItems = this.getSelectedItems()
    var afterSaleType = this.data.afterSaleType
    var showRefundSummaryCards = this.data.showRefundSummaryCards
    var selectedRemainingRefundAmount = Number(this.data.selectedRemainingRefundAmount || 0)
    var strictLessThanRemaining = afterSalesUtil.reasonRequiresStrictLessThanRemaining(this.data.reasonText)
    var requiresCustomRefundAmount = this.data.requiresCustomRefundAmount
    var requestedRefundAmount = null

    if (!this.data.reasonText) {
      wx.showToast({ title: '请选择售后原因', icon: 'none' })
      return null
    }

    if (!selectedItems.length) {
      wx.showToast({ title: '请至少选择一个售后商品', icon: 'none' })
      return null
    }

    if (showRefundSummaryCards && selectedRemainingRefundAmount <= 0) {
      wx.showToast({ title: '当前所选商品暂无可退金额', icon: 'none' })
      return null
    }

    if (requiresCustomRefundAmount) {
      var normalizedAmount = Number(Number(this.data.requestedRefundAmount || 0).toFixed(2))
      if (!normalizedAmount || normalizedAmount <= 0) {
        wx.showToast({ title: '请输入售后金额', icon: 'none' })
        return null
      }
      if (normalizedAmount > selectedRemainingRefundAmount) {
        wx.showToast({ title: '售后金额不能超过剩余可退金额', icon: 'none' })
        return null
      }
      if (strictLessThanRemaining && normalizedAmount >= selectedRemainingRefundAmount) {
        wx.showToast({ title: '退差价金额必须小于剩余可退金额', icon: 'none' })
        return null
      }
      requestedRefundAmount = normalizedAmount
    }

    if (afterSaleType === 'exchange') {
      var missingExchangeItem = selectedItems.find(function (item) {
        return !item.exchangePackageId
      })
      if (missingExchangeItem) {
        wx.showToast({ title: '请为每个售后商品选择更换规格', icon: 'none' })
        return null
      }
    }

    if (this.data.requiresReturnFlow) {
      if (!this.data.selectedAddress) {
        wx.showToast({ title: '请选择寄回地址', icon: 'none' })
        return null
      }
      if (this.data.shippingMethod === 'pickup') {
        if (!this.data.pickupDate) {
          wx.showToast({ title: '请选择上门日期', icon: 'none' })
          return null
        }
        if (!this.data.pickupSlotValue) {
          wx.showToast({ title: '请选择时间段', icon: 'none' })
          return null
        }
      }
    }

    var pickupOption = (this.data.pickupSlotOptions || []).find(function (item) {
      return item.value === this.data.pickupSlotValue
    }, this)

    return {
      afterSaleType: this.data.afterSaleType,
      reason: this.data.reasonText,
      description: String(this.data.description || '').trim() || null,
      requestedRefundAmount: requestedRefundAmount,
      evidenceImageUrls: (this.data.evidenceImageUrls || []).slice(),
      items: selectedItems.map(function (item) {
        return {
          orderItemId: item.id,
          quantity: Number(item.selectedQuantity || 0),
          newPackageId: afterSaleType === 'exchange' ? Number(item.exchangePackageId || 0) || null : null,
          exchangeQuantity: afterSaleType === 'exchange'
            ? Number(item.exchangeQuantity || item.selectedQuantity || 0)
            : 0
        }
      }),
      shippingMethod: this.data.requiresReturnFlow ? this.data.shippingMethod : null,
      pickupWindowStart: this.data.requiresReturnFlow && this.data.shippingMethod === 'pickup' && pickupOption ? pickupOption.startText : null,
      pickupWindowEnd: this.data.requiresReturnFlow && this.data.shippingMethod === 'pickup' && pickupOption ? pickupOption.endText : null,
      returnLogisticsCompany: null,
      returnTrackingNo: null,
      returnAddressKey: this.data.requiresReturnFlow && this.data.selectedAddress ? String(this.data.selectedAddress.id) : null,
      returnAddressText: this.data.requiresReturnFlow && this.data.selectedAddress ? afterSalesUtil.buildReturnAddressText(this.data.selectedAddress) : null,
      isSpeedRefund: this.isEligibleForSpeedRefund()
    }
  },

  requestMiniProgramLoginCode: function () {
    return new Promise(function (resolve, reject) {
      wx.login({
        success: function (res) {
          if (res && res.code) {
            resolve(res.code)
            return
          }
          reject(new Error('微信登录态获取失败，请重试'))
        },
        fail: function () {
          reject(new Error('微信登录态获取失败，请检查网络后重试'))
        }
      })
    })
  },

  isPaymentCanceled: function (err) {
    var errMsg = String(err && (err.errMsg || err.message) || '').toLowerCase()
    return errMsg.indexOf('cancel') !== -1
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

  createHandledError: function (message) {
    return {
      handled: true,
      message: message || ''
    }
  },

  clearSupplementPollTimer: function () {
    if (this._supplementPollTimer) {
      clearTimeout(this._supplementPollTimer)
      this._supplementPollTimer = null
    }
  },

  waitAndPollAfterSalesSupplementStatus: function (tradeNo, attempt) {
    var that = this
    that.clearSupplementPollTimer()
    return new Promise(function (resolve, reject) {
      that._supplementPollTimer = setTimeout(function () {
        that.pollAfterSalesSupplementStatus(tradeNo, attempt).then(resolve).catch(reject)
      }, 1500)
    })
  },

  pollAfterSalesSupplementStatus: function (tradeNo, attempt) {
    var that = this
    return api.get('/api/orders/after-sales/supplement-payment-status/' + tradeNo, { showError: false }).then(function (res) {
      var status = res.data || res || {}
      var payStatus = Number(status.payStatus || 0)
      if (payStatus === 1 && status.submittedAt) {
        that.finalizeAfterSalesSubmitted()
        return true
      }

      if (payStatus === 2 || payStatus === 5) {
        var closedMessage = status.message || '补差支付未完成'
        wx.showToast({ title: closedMessage, icon: 'none' })
        throw that.createHandledError(closedMessage)
      }

      if (attempt >= 19) {
        var timeoutMessage = payStatus === 1
          ? '支付成功，售后提交处理中，请稍后在订单详情查看'
          : (status.message || '正在确认支付结果，请稍后在订单详情查看')
        wx.showToast({ title: timeoutMessage, icon: 'none' })
        setTimeout(function () {
          that.backToDetail()
        }, 800)
        throw that.createHandledError(timeoutMessage)
      }

      return that.waitAndPollAfterSalesSupplementStatus(tradeNo, attempt + 1)
    }).catch(function (err) {
      if (err && err.handled) {
        throw err
      }
      if (attempt >= 19) {
        var failMessage = '支付结果确认超时，请稍后在订单详情查看'
        wx.showToast({ title: failMessage, icon: 'none' })
        setTimeout(function () {
          that.backToDetail()
        }, 800)
        throw that.createHandledError(failMessage)
      }
      return that.waitAndPollAfterSalesSupplementStatus(tradeNo, attempt + 1)
    })
  },

  finalizeAfterSalesSubmitted: function () {
    var that = this
    that.clearSupplementPollTimer()
    wx.showToast({ title: '售后申请已提交', icon: 'success' })
    setTimeout(function () {
      var pages = getCurrentPages()
      var prev = pages[pages.length - 2]
      if (prev && typeof prev.loadDetail === 'function') {
        prev.loadDetail()
      }
      wx.navigateBack({
        delta: 1,
        fail: function () {
          wx.redirectTo({ url: '/pages/shop/order-detail/index?orderNo=' + that.data.orderNo })
        }
      })
    }, 800)
  },

  createSupplementPayment: function (payload) {
    var that = this
    return that.requestMiniProgramLoginCode().then(function (loginCode) {
      return api.post('/api/orders/after-sales/supplement-payment/' + that.data.orderNo, Object.assign({}, payload, {
        payType: 'wxpay',
        clientType: 'miniapp',
        loginCode: loginCode
      }), { showError: false })
    }).then(function (res) {
      var payData = res.data || res || {}
      if (!payData.tradeNo || !payData.timeStamp || !payData.nonceStr || !(payData.packageValue || payData['package']) || !payData.paySign) {
        var invalidMessage = '支付参数异常，请稍后重试'
        wx.showToast({ title: invalidMessage, icon: 'none' })
        throw that.createHandledError(invalidMessage)
      }

      return new Promise(function (resolve, reject) {
        wx.requestPayment({
          timeStamp: payData.timeStamp,
          nonceStr: payData.nonceStr,
          package: payData.packageValue || payData['package'],
          signType: payData.signType || 'RSA',
          paySign: payData.paySign,
          success: function () {
            that.pollAfterSalesSupplementStatus(payData.tradeNo, 0).then(resolve).catch(reject)
          },
          fail: function (err) {
            var message = that.isPaymentCanceled(err)
              ? '已取消支付，可稍后重新提交'
              : that.resolvePaymentFailureMessage(err)
            wx.showToast({ title: message, icon: 'none' })
            reject(that.createHandledError(message))
          }
        })
      })
    }).catch(function (err) {
      if (err && err.handled) {
        throw err
      }
      var message = err && err.message ? err.message : '补差支付创建失败'
      wx.showToast({ title: message, icon: 'none' })
      throw that.createHandledError(message)
    })
  },

  submitAfterSales: function () {
    var that = this
    var payload = that.buildPayload()
    if (!payload) return

    that.setData({ submitting: true })
    var shouldSupplementPay = that.data.showSupplementPayment && (payload.afterSaleType === 'exchange' || payload.afterSaleType === 'repair')
    var submitTask = shouldSupplementPay
      ? that.createSupplementPayment(payload)
      : api.post('/api/orders/apply-after-sales/' + that.data.orderNo, payload, { showError: false }).then(function () {
          that.finalizeAfterSalesSubmitted()
        })

    submitTask.catch(function (err) {
      if (err && err.handled) {
        return
      }
      wx.showToast({ title: (err && err.message) || '售后申请提交失败', icon: 'none' })
    }).finally(function () {
      that.setData({ submitting: false })
    })
  },

  backToDetail: function () {
    var that = this
    wx.navigateBack({
      delta: 1,
      fail: function () {
        wx.redirectTo({ url: '/pages/shop/order-detail/index?orderNo=' + that.data.orderNo })
      }
    })
  },

  formatAmount: function (value) {
    var numericValue = Number(value || 0)
    if (!Number.isFinite(numericValue)) numericValue = 0
    return numericValue.toFixed(2)
  },

  formatTime: function (value) {
    if (!value) return ''
    var date = afterSalesUtil.parseTime(value)
    if (!date) return String(value)
    return date.getFullYear() + '-' + this.pad(date.getMonth() + 1) + '-' + this.pad(date.getDate()) + ' ' + this.pad(date.getHours()) + ':' + this.pad(date.getMinutes()) + ':' + this.pad(date.getSeconds())
  },

  formatDate: function (date) {
    return date.getFullYear() + '-' + this.pad(date.getMonth() + 1) + '-' + this.pad(date.getDate())
  },

  pad: function (value) {
    return value < 10 ? '0' + value : '' + value
  }
})