var DEFAULT_AFTER_SALE_TYPES = [
  { key: 'refund', label: '退款', description: '未收到货 / 已拒收，或与商家协商一致无需退货。' },
  { key: 'return-refund', label: '退货退款', description: '已收到货，需退回货物。' },
  { key: 'exchange', label: '换货', description: '已收到货，需要更换商品。' },
  { key: 'repair', label: '维修', description: '商品需要维修服务。' }
]

var DEFAULT_AFTER_SALE_REASONS = {
  refund: ['多拍/错拍/不想要', '填错地址/不方便收货', '快递一直未送达', '少件/漏发', '商家发错货', '商品买贵了或降价', '未按约定时间发货', '其他'],
  'return-refund': ['多拍/错拍/不想要', '7天无理由退款', '与商家协商一致退款', '商品质量不好', '商品与描述不符', '商品破损/包装问题', '少件/漏发', '商家发错货', '商品买贵了或降价', '其他'],
  exchange: ['买错款式', '商品质量不好', '商品与描述不符', '商家发错货', '商品破损/包装问题', '其他'],
  repair: ['商品功能故障', '商品质量问题', '商品破损/配件损坏', '商品使用异常', '其他']
}

var CUSTOM_REFUND_REASON = '退差价/补运费'
var OTHER_REASON = '其他'
var REFUND_AMOUNT_REQUIRED_REASONS = ['退差价/补运费', '其他', 'Price adjustment / shipping difference', 'Other']
var STRICT_LESS_THAN_REASONS = ['退差价/补运费', 'Price adjustment / shipping difference']
var PRICE_ADJUSTMENT_REASON_ALIASES = ['商品买贵了或降价', 'Price dropped / purchased at a higher price', '退差价/补运费', 'Price adjustment / shipping difference']
var ORDER_STATUS_REASON_EXCLUDES = {
  1: ['快递一直未送达', '少件/漏发', '商家发错货'],
  2: ['未按约定时间发货', '少件/漏发', '商家发错货']
}

function toNumber(value, fallback) {
  var numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : (fallback || 0)
}

function pad(value) {
  return value < 10 ? '0' + value : '' + value
}

function parseTime(value) {
  if (!value) return null
  var date = new Date(value)
  if (!isNaN(date.getTime())) {
    return date
  }

  if (typeof value === 'string') {
    var normalized = value.replace(/-/g, '/')
    date = new Date(normalized)
    if (!isNaN(date.getTime())) {
      return date
    }
  }

  return null
}

function cloneList(list) {
  return Array.isArray(list) ? list.slice() : []
}

function uniqueList(list) {
  var result = []
  ;(list || []).forEach(function (item) {
    var value = String(item || '').trim()
    if (!value || result.indexOf(value) !== -1) return
    result.push(value)
  })
  return result
}

function ensureRepairAfterSaleType(types) {
  var normalizedTypes = Array.isArray(types) ? types.slice() : []
  var hasRepair = normalizedTypes.some(function (item) {
    return item && String(item.key || '').trim() === 'repair'
  })

  if (hasRepair) {
    return normalizedTypes
  }

  var repairType = DEFAULT_AFTER_SALE_TYPES.find(function (item) {
    return item.key === 'repair'
  })

  if (repairType) {
    normalizedTypes.push(Object.assign({}, repairType))
  }

  return normalizedTypes
}

function getSectionItems(content, sectionKey) {
  var sections = content && content.sections ? content.sections : {}
  return Array.isArray(sections[sectionKey]) ? sections[sectionKey] : []
}

function getItemContent(item) {
  if (!item || typeof item !== 'object') return ''
  return String(item.content || item.title || '').trim()
}

function getConfigValue(configItems, itemKey) {
  var matched = (configItems || []).find(function (item) {
    return item && item.itemKey === itemKey
  })
  return matched ? getItemContent(matched) : ''
}

function getFallbackOrderDetailPageConfig() {
  return {
    afterSaleAllowDays: 0,
    repairAllowDays: 0,
    returnMaxDays: 0,
    speedRefundMinutes: 0,
    afterSaleTypes: ensureRepairAfterSaleType(DEFAULT_AFTER_SALE_TYPES),
    afterSaleReasons: {
      refund: cloneList(DEFAULT_AFTER_SALE_REASONS.refund),
      'return-refund': cloneList(DEFAULT_AFTER_SALE_REASONS['return-refund']),
      exchange: cloneList(DEFAULT_AFTER_SALE_REASONS.exchange),
      repair: cloneList(DEFAULT_AFTER_SALE_REASONS.repair)
    }
  }
}

function normalizeOrderDetailPageConfig(payload) {
  var content = payload && payload.data ? payload.data : payload
  var configItems = getSectionItems(content, 'config')
  var afterSaleTypeItems = getSectionItems(content, 'after-sale-types')
  var refundReasonItems = getSectionItems(content, 'after-sale-reasons-refund')
  var returnRefundReasonItems = getSectionItems(content, 'after-sale-reasons-return-refund')
  var exchangeReasonItems = getSectionItems(content, 'after-sale-reasons-exchange')
  var repairReasonItems = getSectionItems(content, 'after-sale-reasons-repair')

  return {
    afterSaleAllowDays: toNumber(getConfigValue(configItems, 'afterSaleAllowDays') || getConfigValue(configItems, 'refundAllowDays')),
    repairAllowDays: toNumber(getConfigValue(configItems, 'repairAllowDays')),
    returnMaxDays: toNumber(getConfigValue(configItems, 'returnMaxDays')),
    speedRefundMinutes: toNumber(getConfigValue(configItems, 'speedRefundMinutes')),
    afterSaleTypes: ensureRepairAfterSaleType(afterSaleTypeItems.length
      ? afterSaleTypeItems.map(function (item) {
          return {
            key: String(item.itemKey || '').trim(),
            label: String(item.title || item.content || item.itemKey || '').trim(),
            description: String(item.description || '').trim()
          }
        }).filter(function (item) {
          return !!item.key
        })
      : DEFAULT_AFTER_SALE_TYPES.slice()),
    afterSaleReasons: {
      refund: refundReasonItems.length
        ? uniqueList(refundReasonItems.map(getItemContent))
        : cloneList(DEFAULT_AFTER_SALE_REASONS.refund),
      'return-refund': returnRefundReasonItems.length
        ? uniqueList(returnRefundReasonItems.map(getItemContent))
        : cloneList(DEFAULT_AFTER_SALE_REASONS['return-refund']),
      exchange: exchangeReasonItems.length
        ? uniqueList(exchangeReasonItems.map(getItemContent))
        : cloneList(DEFAULT_AFTER_SALE_REASONS.exchange),
      repair: repairReasonItems.length
        ? uniqueList(repairReasonItems.map(getItemContent))
        : cloneList(DEFAULT_AFTER_SALE_REASONS.repair)
    }
  }
}

function fetchOrderDetailPageConfig(api) {
  return api.get('/api/sitepublic/page/order-detail', { showError: false }).then(function (res) {
    return normalizeOrderDetailPageConfig(res)
  }).catch(function () {
    return getFallbackOrderDetailPageConfig()
  })
}

function getAllowedAfterSaleTypes(order, config) {
  var status = getAfterSalesOrderStage(order)
  var allTypes = config && Array.isArray(config.afterSaleTypes) && config.afterSaleTypes.length
    ? config.afterSaleTypes
    : DEFAULT_AFTER_SALE_TYPES

  if (status === 1 || status === 2) {
    return isWithinAfterSaleAllowDays(order, config && config.afterSaleAllowDays)
      ? allTypes.filter(function (item) { return item.key === 'refund' })
      : []
  }

  if (status === 3) {
    var availableTypeMap = {}
    if (!isReturnWindowExpired(order, config && config.returnMaxDays)) {
      availableTypeMap['return-refund'] = true
      availableTypeMap.exchange = true
    }
    if (isWithinRepairAllowDays(order, config)) {
      availableTypeMap.repair = true
    }
    return allTypes.filter(function (item) {
      return !!availableTypeMap[item.key]
    })
  }

  return []
}

function hasIncompleteRepairAfterSales(requests) {
  return (requests || []).some(function (request) {
    return String(request && request.afterSaleType || '').toLowerCase() === 'repair'
      && [0, 1, 2].indexOf(Number(request && request.afterSaleStatus)) >= 0
  })
}

function restrictAvailableTypesForDetail(detail, availableTypes) {
  if (!hasIncompleteRepairAfterSales(detail && detail.afterSalesRequests)) {
    return availableTypes
  }

  return (availableTypes || []).filter(function (item) {
    return String(item && item.key || '').toLowerCase() === 'repair'
  })
}

function getAfterSalesOrderStage(order) {
  var status = Number(order && order.orderStatus)
  if (status === 5) {
    if (parseTime(order && order.receiveTime)) return 3
    if (parseTime(order && order.shipTime)) return 2
    return 1
  }
  return status
}

function isWithinTimeWindow(baseTime, allowDays) {
  var numericDays = toNumber(allowDays)
  if (numericDays <= 0) return true
  var resolved = baseTime instanceof Date ? baseTime : parseTime(baseTime)
  if (!resolved) return false
  return Date.now() - resolved.getTime() <= numericDays * 24 * 60 * 60 * 1000
}

function isWithinAfterSaleAllowDays(order, allowDays) {
  return isWithinTimeWindow(order && order.createTime, allowDays)
}

function getRepairAllowDays(config) {
  var repairAllowDays = toNumber(config && config.repairAllowDays)
  if (repairAllowDays > 0) {
    return repairAllowDays
  }
  return toNumber(config && config.afterSaleAllowDays)
}

function isWithinRepairAllowDays(order, config) {
  var allowDays = getRepairAllowDays(config)
  if (allowDays <= 0) return true
  var baseTime = parseTime(order && order.receiveTime)
    || parseTime(order && order.shipTime)
    || parseTime(order && order.payTime)
  return isWithinTimeWindow(baseTime, allowDays)
}

function isReturnWindowExpired(order, returnMaxDays) {
  var numericDays = toNumber(returnMaxDays)
  if (numericDays <= 0) return false
  var status = getAfterSalesOrderStage(order)
  if (status !== 3) return false
  var receiveTime = parseTime(order && order.receiveTime)
  if (!receiveTime) return false
  return Date.now() - receiveTime.getTime() > numericDays * 24 * 60 * 60 * 1000
}

function computeRefundSummary(detail) {
  var orderPayAmount = toNumber(detail && detail.refundSummary && detail.refundSummary.orderPayAmount, toNumber(detail && detail.order && detail.order.payAmount))
  var refundedAmount = Math.max(
    toNumber(detail && detail.refundSummary && detail.refundSummary.refundedAmount),
    toNumber(detail && detail.payment && detail.payment.refundAmount)
  )
  var remainingRefundAmount = detail && detail.refundSummary
    ? toNumber(detail.refundSummary.remainingRefundAmount, Math.max(orderPayAmount - refundedAmount, 0))
    : Math.max(orderPayAmount - refundedAmount, 0)

  return {
    orderPayAmount: orderPayAmount,
    refundedAmount: refundedAmount,
    remainingRefundAmount: remainingRefundAmount,
    refundCount: toNumber(detail && detail.refundSummary && detail.refundSummary.refundCount, Array.isArray(detail && detail.refundRecords) ? detail.refundRecords.length : 0),
    lastRefundTime: detail && detail.refundSummary && detail.refundSummary.lastRefundTime
      ? detail.refundSummary.lastRefundTime
      : detail && detail.payment
        ? detail.payment.refundTime
        : null
  }
}

function computeOrderRefundSnapshot(order) {
  var refundedAmount = toNumber(order && order.refundedAmount)
  var remainingRefundAmount = order && order.remainingRefundAmount != null
    ? toNumber(order.remainingRefundAmount, Math.max(toNumber(order && order.payAmount) - refundedAmount, 0))
    : Math.max(toNumber(order && order.payAmount) - refundedAmount, 0)

  return {
    refundedAmount: refundedAmount,
    remainingRefundAmount: remainingRefundAmount,
    refundCount: toNumber(order && order.refundCount),
    lastRefundTime: order && order.lastRefundTime ? order.lastRefundTime : null
  }
}

function hasRefundActivity(detail) {
  var order = detail && detail.order ? detail.order : detail
  var summary = detail && detail.order ? computeRefundSummary(detail) : computeOrderRefundSnapshot(order)
  var refundRecords = detail && Array.isArray(detail.refundRecords) ? detail.refundRecords : []

  return summary.refundCount > 0
    || summary.refundedAmount > 0
    || Boolean(summary.lastRefundTime)
    || refundRecords.length > 0
}

function isFullyRefunded(detail) {
  var order = detail && detail.order ? detail.order : detail
  if (Number(order && order.orderStatus) === 6) {
    return true
  }

  var summary = detail && detail.order ? computeRefundSummary(detail) : computeOrderRefundSnapshot(order)
  return summary.refundedAmount > 0 && summary.remainingRefundAmount <= 0.0001
}

function shouldShowRefundClosedBuyAgain(detail) {
  var order = detail && detail.order ? detail.order : detail
  var status = Number(order && order.orderStatus)

  if (isFullyRefunded(detail)) {
    return true
  }

  return status === 4 && hasRefundActivity(detail)
}

function hasAvailableAfterSalesItem(items) {
  return (items || []).some(function (item) {
    return !item.afterSalesLocked
  })
}

function getAfterSalesEntryState(detail, config) {
  var order = detail && detail.order
  var payment = detail && detail.payment
  var summary = computeRefundSummary(detail)
  var allowedTypes = restrictAvailableTypesForDetail(detail, getAllowedAfterSaleTypes(order, config))

  if (!order || !payment) {
    return { canRequest: false, availableAfterSaleTypes: allowedTypes, reason: '订单信息不完整' }
  }

  if ([1, 2, 3, 5].indexOf(Number(order.orderStatus)) === -1) {
    return { canRequest: false, availableAfterSaleTypes: allowedTypes, reason: '当前订单状态不支持售后申请' }
  }

  if (Number(payment.payStatus) !== 1) {
    return { canRequest: false, availableAfterSaleTypes: allowedTypes, reason: '订单未支付，暂不支持申请售后' }
  }

  if (!allowedTypes.length) {
    return { canRequest: false, availableAfterSaleTypes: allowedTypes, reason: '当前订单已超出售后时效' }
  }

  if (Number(order.orderStatus) === 6 || (summary.refundedAmount > 0 && summary.remainingRefundAmount <= 0.0001)) {
    return { canRequest: false, availableAfterSaleTypes: allowedTypes, reason: '当前订单已无可售后金额' }
  }

  if (!hasAvailableAfterSalesItem(detail && detail.items)) {
    return { canRequest: false, availableAfterSaleTypes: allowedTypes, reason: '当前订单商品已无法再次申请售后' }
  }

  return { canRequest: true, availableAfterSaleTypes: allowedTypes, reason: '' }
}

function getReasonOptions(afterSaleType, order, config) {
  var baseReasons = config && config.afterSaleReasons && config.afterSaleReasons[afterSaleType] && config.afterSaleReasons[afterSaleType].length
    ? cloneList(config.afterSaleReasons[afterSaleType])
    : cloneList(DEFAULT_AFTER_SALE_REASONS[afterSaleType] || [])
  var status = getAfterSalesOrderStage(order)
  var excludes = ORDER_STATUS_REASON_EXCLUDES[status] || []
  var filtered = baseReasons.filter(function (reason) {
    return excludes.indexOf(reason) === -1
  })

  if (afterSaleType === 'return-refund' && status === 3) {
    var hasOtherReason = filtered.indexOf(OTHER_REASON) !== -1
    var contentReasons = filtered.filter(function (reason) {
      return reason !== OTHER_REASON && PRICE_ADJUSTMENT_REASON_ALIASES.indexOf(reason) === -1
    })
    contentReasons.push(CUSTOM_REFUND_REASON)
    if (hasOtherReason) {
      contentReasons.push(OTHER_REASON)
    }
    return uniqueList(contentReasons)
  }

  return uniqueList(filtered)
}

function reasonRequiresRequestedAmount(reason) {
  return REFUND_AMOUNT_REQUIRED_REASONS.indexOf(String(reason || '').trim()) !== -1
}

function reasonRequiresStrictLessThanRemaining(reason) {
  return STRICT_LESS_THAN_REASONS.indexOf(String(reason || '').trim()) !== -1
}

function formatLocalDateTime(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}

function buildPickupSlots(dateText, now) {
  if (!dateText) return []
  var parts = String(dateText).split('-').map(function (part) { return Number(part) })
  var year = parts[0]
  var month = parts[1]
  var day = parts[2]
  var slots = []
  var current = now || new Date()

  if (!year || !month || !day) return slots

  for (var hour = 8; hour < 22; hour += 2) {
    var start = new Date(year, month - 1, day, hour, 0, 0, 0)
    var end = new Date(year, month - 1, day, hour + 2, 0, 0, 0)
    if (start.getTime() <= current.getTime()) continue
    slots.push({
      label: pad(hour) + ':00 - ' + pad(hour + 2) + ':00',
      value: formatLocalDateTime(start) + '|' + formatLocalDateTime(end),
      startText: formatLocalDateTime(start),
      endText: formatLocalDateTime(end)
    })
  }

  return slots
}

function buildUserAddressText(address) {
  if (!address) return ''
  return [address.province, address.city, address.district, address.street, address.detailAddress]
    .filter(function (item) { return !!String(item || '').trim() })
    .join(' ')
}

function buildReturnAddressText(address) {
  if (!address) return ''
  return [
    String(address.receiverName || '').trim(),
    String(address.receiverPhone || '').trim(),
    '/',
    buildUserAddressText(address)
  ].filter(function (item) {
    return !!String(item || '').trim()
  }).join(' ')
}

function getAfterSaleTypeLabel(type) {
  var normalized = String(type || '').toLowerCase()
  if (normalized === 'refund') return '退款'
  if (normalized === 'return-refund') return '退货退款'
  if (normalized === 'exchange') return '换货'
  if (normalized === 'repair') return '维修'
  return '售后'
}

function getAfterSaleStatusLabel(status, afterSaleType) {
  var normalizedType = String(afterSaleType || '').toLowerCase()
  var map = {
    0: '待处理',
    1: '处理中',
    2: normalizedType === 'repair' ? '维修中' : '已通过',
    3: '已拒绝',
    4: '已完成'
  }
  return map[Number(status)] || '未知状态'
}

function getAfterSaleShippingMethodLabel(method) {
  var normalized = String(method || '').toLowerCase()
  if (normalized === 'pickup') return '上门取件'
  if (normalized === 'self') return '自行寄回'
  return '-'
}

module.exports = {
  CUSTOM_REFUND_REASON: CUSTOM_REFUND_REASON,
  OTHER_REASON: OTHER_REASON,
  buildPickupSlots: buildPickupSlots,
  buildReturnAddressText: buildReturnAddressText,
  buildUserAddressText: buildUserAddressText,
  computeRefundSummary: computeRefundSummary,
  hasRefundActivity: hasRefundActivity,
  fetchOrderDetailPageConfig: fetchOrderDetailPageConfig,
  formatLocalDateTime: formatLocalDateTime,
  getAfterSaleShippingMethodLabel: getAfterSaleShippingMethodLabel,
  getAfterSaleStatusLabel: getAfterSaleStatusLabel,
  getAfterSaleTypeLabel: getAfterSaleTypeLabel,
  getAfterSalesEntryState: getAfterSalesEntryState,
  getAfterSalesOrderStage: getAfterSalesOrderStage,
  getAllowedAfterSaleTypes: getAllowedAfterSaleTypes,
  getFallbackOrderDetailPageConfig: getFallbackOrderDetailPageConfig,
  getReasonOptions: getReasonOptions,
  isFullyRefunded: isFullyRefunded,
  isReturnWindowExpired: isReturnWindowExpired,
  isWithinAfterSaleAllowDays: isWithinAfterSaleAllowDays,
  normalizeOrderDetailPageConfig: normalizeOrderDetailPageConfig,
  parseTime: parseTime,
  reasonRequiresRequestedAmount: reasonRequiresRequestedAmount,
  reasonRequiresStrictLessThanRemaining: reasonRequiresStrictLessThanRemaining,
  shouldShowRefundClosedBuyAgain: shouldShowRefundClosedBuyAgain,
  toNumber: toNumber
}