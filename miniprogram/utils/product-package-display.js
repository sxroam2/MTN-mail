var imageUtil = require('./image.js')

function ensureProductPackageCache(api, cache, productIds) {
  var targetCache = cache || {}
  var missingIds = (productIds || []).filter(function (productId, index, array) {
    return productId && array.indexOf(productId) === index && !targetCache[productId]
  })

  if (!missingIds.length) {
    return Promise.resolve(targetCache)
  }

  return Promise.all(missingIds.map(function (productId) {
    return api.get('/api/products/' + productId, { showError: false }).then(function (res) {
      var data = res.data || res
      targetCache[productId] = buildPackageMetaMap(data)
    }).catch(function () {
      targetCache[productId] = {}
    })
  })).then(function () {
    return targetCache
  })
}

function buildPackageMetaMap(detail) {
  var source = detail && detail.productDetail ? detail.productDetail : (detail || {})
  var packages = Array.isArray(source.packages) ? source.packages : []
  var map = {}

  packages.forEach(function (pkg) {
    var pkgObj = pkg.package || pkg || {}
    var pkgI18n = pkg.i18n || {}
    var packageId = pkgObj.id || pkg.id

    if (!packageId) {
      return
    }

    map[packageId] = {
      name: pkgI18n.name || pkgObj.name || pkg.packageName || pkgObj.sku || '',
      description: pkgI18n.description || pkgObj.description || pkg.description || '',
      thumbUrl: pkgObj.thumbUrl ? imageUtil.resolveImageUrl(pkgObj.thumbUrl) : ''
    }
  })

  return map
}

function getPackageMeta(cache, productId, packageId) {
  if (!cache || !productId || !packageId || !cache[productId]) {
    return null
  }

  return cache[productId][packageId] || null
}

function trimText(value) {
  return String(value || '').trim()
}

function removeLeadingProductName(text, productName) {
  var normalizedText = trimText(text)
  var normalizedProductName = trimText(productName)

  if (!normalizedText) {
    return ''
  }

  if (!normalizedProductName) {
    return normalizedText
  }

  if (normalizedText === normalizedProductName) {
    return ''
  }

  if (normalizedText.indexOf(normalizedProductName) === 0) {
    normalizedText = normalizedText.slice(normalizedProductName.length).replace(/^[\s\-—–·/,:：，、()（）【】]+/, '').trim()
  }

  return normalizedText
}

function buildProductDescription(options) {
  var productName = trimText(options && options.productName)
  var packageDescription = removeLeadingProductName(options && options.packageDescription, productName)
  if (packageDescription) {
    return packageDescription
  }

  var descriptionParts = []
  var packageName = removeLeadingProductName(options && options.packageName, productName)
  if (packageName) {
    descriptionParts.push(packageName)
  }

  var sku = trimText(options && options.sku)
  if (sku) {
    var joinedText = descriptionParts.join(' ')
    if (!joinedText || joinedText.indexOf(sku) === -1) {
      descriptionParts.push(sku)
    }
  }

  return descriptionParts.join(' · ')
}

function decorateOrderItem(item, cache) {
  var packageMeta = getPackageMeta(cache, item.productId, item.packageId)
  var productName = item.snapProductName || '商品'
  var packageName = (packageMeta && packageMeta.name) || item.snapPackageName || ''

  return {
    id: item.id,
    productId: item.productId,
    packageId: item.packageId,
    productName: productName,
    packageName: packageName,
    imageUrl: (packageMeta && packageMeta.thumbUrl) || imageUtil.resolveImageUrl(item.snapImageUrl || ''),
    price: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.subtotal,
    description: buildProductDescription({
      productName: productName,
      packageName: packageName,
      packageDescription: (packageMeta && packageMeta.description) || '',
      sku: item.snapSku || ''
    })
  }
}

function decorateCartItem(item, cache) {
  var packageMeta = getPackageMeta(cache, item.productId, item.packageId)
  var packageName = (packageMeta && packageMeta.name) || item.packageName || ''

  return Object.assign({}, item, {
    packageName: packageName,
    imageUrl: (packageMeta && packageMeta.thumbUrl) || imageUtil.resolveImageUrl(item.imageUrl || ''),
    description: buildProductDescription({
      productName: item.productName || '商品',
      packageName: packageName,
      packageDescription: (packageMeta && packageMeta.description) || '',
      sku: ''
    })
  })
}

module.exports = {
  ensureProductPackageCache: ensureProductPackageCache,
  buildPackageMetaMap: buildPackageMetaMap,
  getPackageMeta: getPackageMeta,
  buildProductDescription: buildProductDescription,
  decorateOrderItem: decorateOrderItem,
  decorateCartItem: decorateCartItem
}