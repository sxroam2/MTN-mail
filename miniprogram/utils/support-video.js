var api = require('./api.js')
var imageUtil = require('./image.js')

var PAGE_KEY = 'support-videos'
var DEFAULT_LANG = 'zh-cn'

function pickValue(source, camelKey, pascalKey, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue
  }

  if (source[camelKey] !== undefined && source[camelKey] !== null) {
    return source[camelKey]
  }

  if (source[pascalKey] !== undefined && source[pascalKey] !== null) {
    return source[pascalKey]
  }

  return fallbackValue
}

function trimString(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  var numberValue = Number(value)
  return isFinite(numberValue) ? numberValue : 0
}

function resolveSiteImageUrl(url) {
  var normalizedUrl = trimString(url)

  if (!normalizedUrl) {
    return ''
  }

  if (/^(data:|blob:|wxfile:)/i.test(normalizedUrl)) {
    return normalizedUrl
  }

  if (/^(https?:)?\/\//i.test(normalizedUrl)) {
    return normalizedUrl
  }

  return imageUtil.resolveImageUrl(normalizedUrl)
}

function resolveMediaUrl(url) {
  var normalizedUrl = trimString(url)

  if (!normalizedUrl) {
    return ''
  }

  if (/^(data:|blob:|wxfile:)/i.test(normalizedUrl)) {
    return normalizedUrl
  }

  if (/^(https?:)?\/\//i.test(normalizedUrl)) {
    return normalizedUrl
  }

  return imageUtil.resolveImageUrl(normalizedUrl)
}

function unwrapApiData(payload) {
  if (!payload) {
    return {}
  }

  if (payload.data !== undefined && payload.data !== null) {
    return payload.data
  }

  if (payload.Data !== undefined && payload.Data !== null) {
    return payload.Data
  }

  return payload
}

function parseSupportVideoExtra(item) {
  var rawExtraJson = pickValue(item, 'extraJson', 'ExtraJson', '')

  if (rawExtraJson && typeof rawExtraJson === 'object') {
    return rawExtraJson
  }

  var extraJson = trimString(rawExtraJson)

  if (!extraJson) {
    return {}
  }

  try {
    var parsed = JSON.parse(extraJson)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

function normalizeSiteItem(item) {
  return {
    id: toNumber(pickValue(item, 'id', 'Id', 0)),
    pageKey: trimString(pickValue(item, 'pageKey', 'PageKey', '')),
    sectionKey: trimString(pickValue(item, 'sectionKey', 'SectionKey', '')),
    itemKey: trimString(pickValue(item, 'itemKey', 'ItemKey', '')),
    lang: trimString(pickValue(item, 'lang', 'Lang', DEFAULT_LANG)),
    title: trimString(pickValue(item, 'title', 'Title', '')),
    subtitle: trimString(pickValue(item, 'subtitle', 'Subtitle', '')),
    description: trimString(pickValue(item, 'description', 'Description', '')),
    content: trimString(pickValue(item, 'content', 'Content', '')),
    imageUrl: resolveSiteImageUrl(pickValue(item, 'imageUrl', 'ImageUrl', '')),
    imageUrlMobile: resolveSiteImageUrl(pickValue(item, 'imageUrlMobile', 'ImageUrlMobile', '')),
    iconUrl: resolveSiteImageUrl(pickValue(item, 'iconUrl', 'IconUrl', '')),
    linkUrl: resolveMediaUrl(pickValue(item, 'linkUrl', 'LinkUrl', '')),
    buttonText: trimString(pickValue(item, 'buttonText', 'ButtonText', '')),
    buttonStyle: trimString(pickValue(item, 'buttonStyle', 'ButtonStyle', '')),
    textColor: trimString(pickValue(item, 'textColor', 'TextColor', '')),
    extraJson: trimString(pickValue(item, 'extraJson', 'ExtraJson', '')),
    sortOrder: toNumber(pickValue(item, 'sortOrder', 'SortOrder', 0)),
    status: toNumber(pickValue(item, 'status', 'Status', 0)),
    updateTime: trimString(pickValue(item, 'updateTime', 'UpdateTime', ''))
  }
}

function normalizeSections(rawSections) {
  var normalizedSections = {}
  var sourceSections = rawSections || {}

  Object.keys(sourceSections).forEach(function (sectionKey) {
    var sectionItems = Array.isArray(sourceSections[sectionKey]) ? sourceSections[sectionKey] : []
    normalizedSections[sectionKey] = sectionItems.map(function (item) {
      return normalizeSiteItem(item)
    }).sort(function (leftItem, rightItem) {
      if (leftItem.sortOrder !== rightItem.sortOrder) {
        return leftItem.sortOrder - rightItem.sortOrder
      }

      return leftItem.id - rightItem.id
    })
  })

  return normalizedSections
}

function buildCategoryTitleMap(categoryItems) {
  var categoryTitleMap = {}

  ;(categoryItems || []).forEach(function (item) {
    if (item && item.itemKey) {
      categoryTitleMap[item.itemKey] = item.title || item.itemKey
    }
  })

  return categoryTitleMap
}

function getPlayableVideoUrl(item) {
  var directLinkUrl = trimString(item && item.linkUrl)
  if (directLinkUrl) {
    return resolveMediaUrl(directLinkUrl)
  }

  var extra = parseSupportVideoExtra(item || {})
  var playUrl = trimString(item && item.playUrl ? item.playUrl : extra.playUrl)
  if (playUrl) {
    return resolveMediaUrl(playUrl)
  }

  return ''
}

function enrichSupportVideoItem(item, categoryTitleMap) {
  var extra = parseSupportVideoExtra(item)
  var categoryKey = trimString(extra.category)
  var categoryTitle = trimString(item.subtitle || categoryTitleMap[categoryKey] || categoryKey)
  var coverUrl = trimString(item.imageUrl || item.imageUrlMobile || item.iconUrl)

  return {
    id: item.id,
    itemKey: item.itemKey,
    title: item.title,
    subtitle: item.subtitle,
    description: item.description,
    imageUrl: item.imageUrl,
    imageUrlMobile: item.imageUrlMobile,
    iconUrl: item.iconUrl,
    coverUrl: coverUrl,
    linkUrl: item.linkUrl,
    extraJson: item.extraJson,
    sortOrder: item.sortOrder,
    category: categoryKey,
    categoryTitle: categoryTitle,
    duration: trimString(extra.duration),
    model: trimString(extra.model),
    playUrl: trimString(extra.playUrl),
    playableUrl: getPlayableVideoUrl(item)
  }
}

function buildRelatedVideos(videoItems, currentVideo) {
  var currentItemKey = currentVideo && currentVideo.itemKey ? currentVideo.itemKey : ''
  var currentModel = trimString(currentVideo && currentVideo.model)
  var sameModelVideos = []
  var fallbackVideos = []

  ;(videoItems || []).forEach(function (item) {
    if (!item || !item.itemKey || item.itemKey === currentItemKey) {
      return
    }

    fallbackVideos.push(item)

    if (currentModel && trimString(item.model) === currentModel) {
      sameModelVideos.push(item)
    }
  })

  return sameModelVideos.length ? sameModelVideos : fallbackVideos
}

function findVideoByKey(videoItems, videoKey) {
  var targetKey = trimString(videoKey)

  if (!targetKey) {
    return null
  }

  for (var index = 0; index < (videoItems || []).length; index += 1) {
    var item = videoItems[index]
    if (item && item.itemKey === targetKey) {
      return item
    }
  }

  return null
}

function fetchSupportVideoPage(lang) {
  var currentLang = trimString(lang) || DEFAULT_LANG

  return api.get('/api/sitepublic/page/' + PAGE_KEY, {
    query: { lang: currentLang },
    showError: false
  }).then(function (payload) {
    var data = unwrapApiData(payload)

    return {
      pageKey: trimString(pickValue(data, 'pageKey', 'PageKey', PAGE_KEY)),
      lang: trimString(pickValue(data, 'lang', 'Lang', currentLang)),
      sections: normalizeSections(pickValue(data, 'sections', 'Sections', {}))
    }
  })
}

module.exports = {
  buildCategoryTitleMap: buildCategoryTitleMap,
  buildRelatedVideos: buildRelatedVideos,
  enrichSupportVideoItem: enrichSupportVideoItem,
  fetchSupportVideoPage: fetchSupportVideoPage,
  findVideoByKey: findVideoByKey,
  getPlayableVideoUrl: getPlayableVideoUrl,
  parseSupportVideoExtra: parseSupportVideoExtra,
  resolveAssetUrl: resolveMediaUrl,
  resolveMediaUrl: resolveMediaUrl,
  resolveSiteImageUrl: resolveSiteImageUrl
}