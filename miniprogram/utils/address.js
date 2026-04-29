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

module.exports = {
  filterDomesticAddresses: filterDomesticAddresses,
  isDomesticAddress: isDomesticAddress,
  normalizeAddressType: normalizeAddressType,
  resolveAddressType: resolveAddressType
}