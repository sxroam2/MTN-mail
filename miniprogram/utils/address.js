function hasValue(value) {
  return !!String(value || '').trim()
}

function normalizeAddressType(value) {
  var raw = String(value || '').trim()
  if (!raw) return ''

  var normalized = raw
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/_/g, '')
    .toLowerCase()

  if ([
    'international',
    'internationaladdress',
    'intl',
    'intladdress',
    'overseas',
    'abroad',
    'crossborder',
    'global'
  ].indexOf(normalized) >= 0) {
    return 'international'
  }

  if (['chinese', 'china', 'cn', 'mainland', 'domestic'].indexOf(normalized) >= 0) {
    return 'chinese'
  }

  if (raw.indexOf('国际') >= 0 || raw.indexOf('海外') >= 0 || raw.indexOf('境外') >= 0 || raw.indexOf('跨境') >= 0) {
    return 'international'
  }

  if (raw.indexOf('中国') >= 0 || raw.indexOf('国内') >= 0 || raw.indexOf('大陆') >= 0) {
    return 'chinese'
  }

  return ''
}

function resolveAddressType(address) {
  if (!address) return ''

  var normalized = normalizeAddressType(address.addressType)
  if (normalized) {
    return normalized
  }

  var hasChineseFields = hasValue(address.province) || hasValue(address.district) || hasValue(address.street)
  var hasInternationalFields = hasValue(address.country) || hasValue(address.state) || hasValue(address.zipCode)

  if (hasInternationalFields && !hasChineseFields) {
    return 'international'
  }

  if (hasChineseFields) {
    return 'chinese'
  }

  if (hasInternationalFields) {
    return 'international'
  }

  return ''
}

function isDomesticAddress(address) {
  return resolveAddressType(address) !== 'international'
}

function filterDomesticAddresses(addresses) {
  return (addresses || []).filter(isDomesticAddress)
}

var PENDING_SELECTED_ADDRESS_KEY = '__pendingSelectedAddress'

function cloneAddress(address) {
  return address ? Object.assign({}, address) : null
}

function getGlobalData() {
  try {
    var app = getApp()
    return app && app.globalData ? app.globalData : null
  } catch (error) {
    return null
  }
}

function setPendingSelectedAddress(address) {
  var globalData = getGlobalData()
  if (!globalData) {
    return
  }

  globalData[PENDING_SELECTED_ADDRESS_KEY] = cloneAddress(address)
}

function clearPendingSelectedAddress() {
  var globalData = getGlobalData()
  if (!globalData) {
    return
  }

  globalData[PENDING_SELECTED_ADDRESS_KEY] = null
}

function consumePendingSelectedAddress() {
  var globalData = getGlobalData()
  if (!globalData || !globalData[PENDING_SELECTED_ADDRESS_KEY]) {
    return null
  }

  var address = cloneAddress(globalData[PENDING_SELECTED_ADDRESS_KEY])
  globalData[PENDING_SELECTED_ADDRESS_KEY] = null
  return address
}

function emitSelectedAddress(page, address) {
  if (!address) {
    return
  }

  var nextAddress = cloneAddress(address)
  var eventChannel = null
  var pages = getCurrentPages()
  var prev = pages[pages.length - 2]

  setPendingSelectedAddress(nextAddress)

  try {
    eventChannel = page && typeof page.getOpenerEventChannel === 'function'
      ? page.getOpenerEventChannel()
      : null
  } catch (error) {
    eventChannel = null
  }

  if (eventChannel && eventChannel.emit) {
    eventChannel.emit('addressSelected', nextAddress)
  }

  if (prev) {
    prev._selectedAddress = nextAddress
  }
}

function navigateToAddressSelector(page, onSelected) {
  wx.navigateTo({
    url: '/pages/shop/address/index?select=1',
    events: {
      addressSelected: function (address) {
        if (page) {
          page._selectedAddress = null
        }
        clearPendingSelectedAddress()
        if (address && typeof onSelected === 'function') {
          onSelected(cloneAddress(address))
        }
      }
    }
  })
}

function consumeSelectedAddress(page, onSelected) {
  var current = page || null
  var address = current && current._selectedAddress ? cloneAddress(current._selectedAddress) : null

  if (current) {
    current._selectedAddress = null
  }

  if (address) {
    clearPendingSelectedAddress()
  } else {
    address = consumePendingSelectedAddress()
  }

  if (!address) {
    return false
  }

  if (typeof onSelected === 'function') {
    onSelected(cloneAddress(address))
  }

  return true
}

module.exports = {
  clearPendingSelectedAddress: clearPendingSelectedAddress,
  consumePendingSelectedAddress: consumePendingSelectedAddress,
  consumeSelectedAddress: consumeSelectedAddress,
  emitSelectedAddress: emitSelectedAddress,
  filterDomesticAddresses: filterDomesticAddresses,
  isDomesticAddress: isDomesticAddress,
  navigateToAddressSelector: navigateToAddressSelector,
  normalizeAddressType: normalizeAddressType,
  resolveAddressType: resolveAddressType,
  setPendingSelectedAddress: setPendingSelectedAddress
}