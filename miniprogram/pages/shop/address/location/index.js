var tencentMap = require('../../../../utils/tencent-map.js')
var cityHelper = require('../../../../utils/city-helper.js')

var DEFAULT_LOCATION = {
  latitude: 28.2282,
  longitude: 112.9388
}

function trimValue(value) {
  return String(value || '').trim()
}

function safeDecodeValue(value) {
  var text = trimValue(value)
  if (!text) {
    return ''
  }

  try {
    return decodeURIComponent(text)
  } catch (error) {
    return text
  }
}

function hasValue(value) {
  return !!trimValue(value)
}

function buildCoordinateKey(latitude, longitude) {
  var lat = Number(latitude)
  var lng = Number(longitude)
  if (!isFinite(lat) || !isFinite(lng) || !lat || !lng) {
    return ''
  }

  return lat.toFixed(5) + ',' + lng.toFixed(5)
}

function isDefaultCoordinate(latitude, longitude) {
  return buildCoordinateKey(latitude, longitude) === buildCoordinateKey(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude)
}

function getMapErrorMessage(error) {
  return trimValue(error && error.message)
    || trimValue(error && error.errMsg)
    || '地图地址服务暂时不可用，你仍可切换城市并手动填写详细地址。'
}

function buildFriendlyMapError(error) {
  var message = getMapErrorMessage(error)
  if (/未配置腾讯位置服务 key|未配置腾讯位置服务 Key/i.test(message)) {
    return '未配置腾讯位置服务 Key，当前先提供城市选择和手动填写。'
  }
  if (/url not in domain list|不在以下 request 合法域名列表中|合法域名/i.test(message)) {
    return '请在微信小程序后台和开发者工具中放行 https://apis.map.qq.com，当前先提供城市选择和手动填写。'
  }
  if (/来源域名未被授权|请求来源未被授权|授权/i.test(message)) {
    return '腾讯位置服务 Key 未完成 WebService 授权，当前先提供城市选择和手动填写。'
  }
  if (/网络错误/i.test(message)) {
    return '网络暂时不可用，当前先提供城市选择和手动填写。'
  }
  return '地图地址服务暂时不可用，你仍可切换城市并手动填写详细地址。'
}

function buildMarker(latitude, longitude) {
  latitude = Number(latitude)
  longitude = Number(longitude)
  if (!latitude || !longitude) return []

  return [{
    id: 1,
    latitude: latitude,
    longitude: longitude,
    width: 2,
    height: 2,
    alpha: 0
  }]
}

Page({
  data: {
    loading: true,
    locating: false,
    searching: false,
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
    scale: 16,
    keyword: '',
    markers: buildMarker(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude),
    currentCity: cityHelper.getDefaultCity(),
    serviceUnavailable: false,
    serviceMessage: '',
    poiEmptyMessage: '暂无地点结果，拖动地图或重新搜索即可。',
    selectedLocation: {
      locationName: '',
      locationAddress: ''
    },
    sheetDefaultHeightPx: 0,
    sheetHeightPx: 0,
    sheetMaxHeightPx: 0,
    locateFabBottomPx: 0,
    selectedPoiKey: '',
    poiList: []
  },

  onLoad: function (options) {
    this._pageActive = true
    this._refreshRequestId = 0
    this._activeReverseGeocoder = null
    this._activeSuggestionRequest = null
    this._regionChangeTimer = null
    this._pendingProgrammaticCenterKey = ''
    this._sheetDragStartY = null
    this._sheetDragLatestY = null

    this.setupInitialSheetState()

    var latitude = Number(options.latitude) || DEFAULT_LOCATION.latitude
    var longitude = Number(options.longitude) || DEFAULT_LOCATION.longitude
    var initialKeyword = safeDecodeValue(options.keyword)
    var initialCityName = safeDecodeValue(options.city)
    var explicitCity = cityHelper.findCityByName(initialCityName)
    var hasExplicitCity = !!explicitCity
    var initialCity = cityHelper.findCityByName(initialCityName)
      || cityHelper.loadCurrentCity()
      || cityHelper.findNearestCity(latitude, longitude)
      || cityHelper.getDefaultCity()

    this._hasExplicitCity = hasExplicitCity

    if (hasExplicitCity
      && explicitCity.latitude
      && explicitCity.longitude
      && isDefaultCoordinate(latitude, longitude)) {
      latitude = Number(explicitCity.latitude)
      longitude = Number(explicitCity.longitude)
    }

    this.setData({
      latitude: latitude,
      longitude: longitude,
      keyword: initialKeyword,
      markers: buildMarker(latitude, longitude),
      currentCity: initialCity
    })
  },

  onShow: function () {
    this._pageActive = true

    var pages = getCurrentPages()
    var current = pages[pages.length - 1]
    if (current && current._selectedCity) {
      this.applySelectedCity(current._selectedCity)
      current._selectedCity = null
    }
  },

  onHide: function () {
    this.cleanupPendingWork()
  },

  onUnload: function () {
    this.cleanupPendingWork()
  },

  onReady: function () {
    this.mapCtx = wx.createMapContext('locationMap', this)
    this.syncSheetMetrics()
    this.initializePage()
  },

  setupInitialSheetState: function () {
    var windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
    var windowHeight = Number(windowInfo && (windowInfo.windowHeight || windowInfo.screenHeight)) || 0
    var defaultHeight = Math.round(windowHeight * 0.58)

    this._windowHeight = windowHeight
    this.setData({
      sheetDefaultHeightPx: defaultHeight,
      sheetHeightPx: defaultHeight,
      sheetMaxHeightPx: defaultHeight,
      locateFabBottomPx: defaultHeight + 16
    })
  },

  syncSheetMetrics: function () {
    var that = this
    var windowHeight = this._windowHeight || 0

    if (!windowHeight) {
      return
    }

    wx.createSelectorQuery()
      .in(this)
      .select('.search-bar')
      .boundingClientRect(function (rect) {
        var topGap = 12
        var maxHeight = rect
          ? Math.max(that.data.sheetHeightPx, Math.round(windowHeight - rect.bottom - topGap))
          : that.data.sheetHeightPx
        var defaultHeight = Number(that.data.sheetDefaultHeightPx) || that.data.sheetHeightPx
        var nextHeight = Number(that.data.sheetHeightPx) > defaultHeight
          ? maxHeight
          : Math.min(defaultHeight, maxHeight)

        that.setData({
          sheetHeightPx: nextHeight,
          sheetMaxHeightPx: maxHeight,
          locateFabBottomPx: nextHeight + 16
        })
      })
      .exec()
  },

  updateSheetHeight: function (height) {
    var defaultHeight = Number(this.data.sheetDefaultHeightPx) || 0
    var maxHeight = Number(this.data.sheetMaxHeightPx) || defaultHeight
    var nextHeight = Math.max(defaultHeight, Math.min(Number(height) || defaultHeight, maxHeight))

    this.setData({
      sheetHeightPx: nextHeight,
      locateFabBottomPx: nextHeight + 16
    })
  },

  onSheetDragStart: function (e) {
    var touch = e && e.touches && e.touches[0]
    if (!touch) {
      return
    }

    this._sheetDragStartY = touch.clientY
    this._sheetDragLatestY = touch.clientY
  },

  onSheetDragMove: function (e) {
    var touch = e && e.touches && e.touches[0]
    var startY = this._sheetDragStartY
    if (!touch || startY === null) {
      return
    }

    this._sheetDragLatestY = touch.clientY
  },

  onSheetDragEnd: function (e) {
    var touch = (e && e.changedTouches && e.changedTouches[0]) || (e && e.touches && e.touches[0])
    var startY = this._sheetDragStartY
    var endY = touch ? touch.clientY : this._sheetDragLatestY
    var threshold = 18
    var nextHeight = Number(this.data.sheetHeightPx) || Number(this.data.sheetDefaultHeightPx) || 0

    if (startY !== null && endY !== null) {
      if (endY - startY <= -threshold) {
        nextHeight = this.data.sheetMaxHeightPx
      } else if (endY - startY >= threshold) {
        nextHeight = this.data.sheetDefaultHeightPx
      }
    }

    this._sheetDragStartY = null
    this._sheetDragLatestY = null
    this.updateSheetHeight(nextHeight)
  },

  initializePage: function () {
    var that = this

    if (this._hasExplicitCity) {
      this.refreshByCoordinate(this.data.latitude, this.data.longitude, null, {
        silent: true,
        fallbackCity: this.data.currentCity
      }).then(function () {
        if (that._pageActive && that.data.keyword) {
          that.searchSuggestions(true)
        }
      })
      return
    }

    this.locateCurrentPosition(true).then(function (located) {
      if (!that._pageActive) {
        return null
      }

      if (located) {
        return null
      }
      return that.refreshByCoordinate(that.data.latitude, that.data.longitude, null, {
        silent: true,
        fallbackCity: that.data.currentCity
      })
    }).then(function () {
      if (that._pageActive && that.data.keyword) {
        that.searchSuggestions(true)
      }
    })
  },

  cleanupPendingWork: function () {
    this._pageActive = false
    this._pendingProgrammaticCenterKey = ''

    if (this._regionChangeTimer) {
      clearTimeout(this._regionChangeTimer)
      this._regionChangeTimer = null
    }

    if (this._activeReverseGeocoder && typeof this._activeReverseGeocoder.abort === 'function') {
      this._activeReverseGeocoder.abort()
    }
    this._activeReverseGeocoder = null

    if (this._activeSuggestionRequest && typeof this._activeSuggestionRequest.abort === 'function') {
      this._activeSuggestionRequest.abort()
    }
    this._activeSuggestionRequest = null
  },

  shouldIgnoreProgrammaticRegionChange: function (latitude, longitude) {
    var pendingKey = this._pendingProgrammaticCenterKey
    if (!pendingKey) {
      return false
    }

    this._pendingProgrammaticCenterKey = ''
    return pendingKey === buildCoordinateKey(latitude, longitude)
  },

  setActiveCity: function (city, options) {
    if (!city) return

    var nextCity = cityHelper.findCityByCode(city.code)
      || cityHelper.findCityByName(city.name)
      || city
    var patch = {
      currentCity: nextCity
    }

    if (options && options.updateCoordinate && nextCity.latitude && nextCity.longitude) {
      patch.latitude = Number(nextCity.latitude)
      patch.longitude = Number(nextCity.longitude)
      patch.markers = buildMarker(nextCity.latitude, nextCity.longitude)
    }

    this.setData(patch)
    if (!options || options.persist !== false) {
      cityHelper.saveCurrentCity(nextCity)
    }
  },

  applySelectedCity: function (city) {
    var nextCity = cityHelper.findCityByCode(city && city.code)
      || cityHelper.findCityByName(city && city.name)
      || this.data.currentCity
      || cityHelper.getDefaultCity()
    var nextLatitude = Number(nextCity.latitude) || Number(this.data.latitude) || DEFAULT_LOCATION.latitude
    var nextLongitude = Number(nextCity.longitude) || Number(this.data.longitude) || DEFAULT_LOCATION.longitude

    this.setActiveCity(nextCity)
    this.setData({
      keyword: '',
      latitude: nextLatitude,
      longitude: nextLongitude,
      markers: buildMarker(nextLatitude, nextLongitude)
    })

    this.refreshByCoordinate(nextLatitude, nextLongitude, null, {
      silent: true,
      fallbackCity: nextCity
    })
  },

  openCityPicker: function () {
    var currentCity = this.data.currentCity || cityHelper.getDefaultCity()
    var url = '/pages/shop/address/city/index?currentCity='
      + encodeURIComponent(currentCity && currentCity.name || '')
      + '&selectedCity='
      + encodeURIComponent((currentCity && currentCity.name) || this.data.selectedLocation.city || '')
    wx.navigateTo({ url: url })
  },

  refreshByCoordinate: function (latitude, longitude, preferredPoi, options) {
    var that = this
    var requestOptions = options || {}
    var nextLatitude = Number(latitude) || that.data.latitude || DEFAULT_LOCATION.latitude
    var nextLongitude = Number(longitude) || that.data.longitude || DEFAULT_LOCATION.longitude
    var requestId = (that._refreshRequestId || 0) + 1

    if (!that._pageActive) {
      return Promise.resolve(null)
    }

    that._refreshRequestId = requestId
    that._pendingProgrammaticCenterKey = buildCoordinateKey(nextLatitude, nextLongitude)

    if (that._activeReverseGeocoder && typeof that._activeReverseGeocoder.abort === 'function') {
      that._activeReverseGeocoder.abort()
    }

    that.setData({
      loading: true,
      latitude: nextLatitude,
      longitude: nextLongitude,
      markers: buildMarker(nextLatitude, nextLongitude)
    })

    var reverseGeocoderRequest = tencentMap.reverseGeocoder({
      latitude: nextLatitude,
      longitude: nextLongitude
    })
    that._activeReverseGeocoder = reverseGeocoderRequest

    return reverseGeocoderRequest.then(function (result) {
      if (!that._pageActive || requestId !== that._refreshRequestId) {
        return null
      }

      if (that._activeReverseGeocoder === reverseGeocoderRequest) {
        that._activeReverseGeocoder = null
      }

      var resolvedCity = cityHelper.findCityByName(result && result.address_component && result.address_component.city)
        || requestOptions.fallbackCity
        || that.data.currentCity
      var selectedLocation = that.buildSelectionFromResult(result, preferredPoi)
      var selectedPoiKey = that.resolveSelectedPoiKey(selectedLocation, preferredPoi)
      var poiList = that.buildPoiList(result, preferredPoi, selectedPoiKey)
      if (!poiList.length) {
        poiList = that.buildFallbackPoiList(resolvedCity, latitude, longitude, '')
      }

      if (resolvedCity) {
        that.setActiveCity(resolvedCity)
      }

      that.setData({
        loading: false,
        serviceUnavailable: false,
        serviceMessage: '',
        poiEmptyMessage: '暂无地点结果，拖动地图或重新搜索即可。',
        selectedLocation: selectedLocation,
        selectedPoiKey: selectedPoiKey,
        poiList: poiList
      })
    }).catch(function (error) {
      if (that._activeReverseGeocoder === reverseGeocoderRequest) {
        that._activeReverseGeocoder = null
      }

      if (!that._pageActive || requestId !== that._refreshRequestId || (error && error.aborted)) {
        return null
      }

      that.applyFallbackSelection(nextLatitude, nextLongitude, preferredPoi, error, requestOptions)
      return null
    })
  },

  applyFallbackSelection: function (latitude, longitude, preferredPoi, error, options) {
    var requestOptions = options || {}
    var currentCity = requestOptions.fallbackCity
      || this.data.currentCity
      || cityHelper.findNearestCity(latitude, longitude)
      || cityHelper.getDefaultCity()
    var selectedLocation = this.buildFallbackSelection(latitude, longitude, currentCity, preferredPoi)
    var selectedPoiKey = this.resolveSelectedPoiKey(selectedLocation, preferredPoi)

    if (currentCity) {
      this.setActiveCity(currentCity)
    }

    this.setData({
      loading: false,
      serviceUnavailable: true,
      serviceMessage: buildFriendlyMapError(error),
      poiEmptyMessage: '地图服务暂不可用，可切换城市或手动确认当前定位。',
      selectedLocation: selectedLocation,
      selectedPoiKey: selectedPoiKey,
      poiList: this.buildFallbackPoiList(currentCity, latitude, longitude, this.data.keyword)
    })

    if (!requestOptions.silent) {
      wx.showToast({ title: '已切换为手动地址模式', icon: 'none' })
    }
  },

  buildFallbackSelection: function (latitude, longitude, city, preferredPoi) {
    var cityName = city && city.name || ''
    var provinceName = city && city.province || ''
    var keyword = trimValue(this.data.keyword)
    var locationName = trimValue(preferredPoi && preferredPoi.title)
      || (keyword ? '手动填写地址' : (cityName || '地图选点'))
    var locationAddress = trimValue(preferredPoi && preferredPoi.address)
      || [provinceName, cityName, trimValue(preferredPoi && preferredPoi.manualStreet) || keyword]
        .filter(hasValue)
        .join('')

    return {
      latitude: Number(latitude) || this.data.latitude || DEFAULT_LOCATION.latitude,
      longitude: Number(longitude) || this.data.longitude || DEFAULT_LOCATION.longitude,
      province: provinceName,
      city: cityName,
      district: trimValue(preferredPoi && preferredPoi.district),
      street: trimValue(preferredPoi && preferredPoi.manualStreet) || '',
      detailAddress: trimValue(preferredPoi && preferredPoi.manualDetailAddress) || '',
      locationName: locationName,
      locationAddress: locationAddress || [provinceName, cityName].filter(hasValue).join('') || '请手动确认地址'
    }
  },

  buildSelectionFromResult: function (result, preferredPoi) {
    var component = result && result.address_component || {}
    var location = result && result.location || {}
    var fullAddress = trimValue(result && result.address)
    var detailAddress = trimValue(preferredPoi && preferredPoi.address)
      || [component.street, component.street_number].filter(hasValue).join('')

    return {
      latitude: Number(location.lat) || this.data.latitude,
      longitude: Number(location.lng) || this.data.longitude,
      province: trimValue(component.province),
      city: trimValue(component.city),
      district: trimValue(component.district),
      street: trimValue(component.street),
      detailAddress: detailAddress,
      locationName: trimValue(preferredPoi && preferredPoi.title)
        || trimValue(result && result.formatted_addresses && result.formatted_addresses.recommend)
        || fullAddress
        || '地图选点',
      locationAddress: fullAddress || detailAddress
    }
  },

  buildPoiKey: function (title, address) {
    return trimValue(title) + '|' + trimValue(address)
  },

  resolveSelectedPoiKey: function (selectedLocation, preferredPoi) {
    var preferredPoiKey = trimValue(preferredPoi && preferredPoi.key)
    if (preferredPoiKey) {
      return preferredPoiKey
    }

    if (preferredPoi) {
      return this.buildPoiKey(preferredPoi.title || preferredPoi.name, preferredPoi.address)
    }

    return this.buildPoiKey(
      selectedLocation && selectedLocation.locationName,
      selectedLocation && selectedLocation.locationAddress
    )
  },

  buildPoiList: function (result, preferredPoi, selectedPoiKey) {
    var seen = {}
    var list = []
    var appendItem = function (item) {
      var title = trimValue(item.title || item.name)
      var address = trimValue(item.address)
      var latitude = Number(item.latitude || (item.location && item.location.lat))
      var longitude = Number(item.longitude || (item.location && item.location.lng))
      if (!title || !latitude || !longitude) return

      var key = title + '|' + address
      if (seen[key]) return
      seen[key] = true

      list.push({
        key: key,
        title: title,
        address: address,
        latitude: latitude,
        longitude: longitude,
        province: trimValue(item.province),
        city: trimValue(item.city),
        district: trimValue(item.district),
        active: key === selectedPoiKey
      })
    }

    if (preferredPoi) {
      appendItem(preferredPoi)
    }

    var pois = result && Array.isArray(result.pois) ? result.pois : []
    pois.forEach(function (item) {
      appendItem(item)
    })

    return list.slice(0, 12)
  },

  buildFallbackPoiList: function (city, latitude, longitude, keyword) {
    var cityName = city && city.name || ''
    var provinceName = city && city.province || ''
    var list = []
    var currentLatitude = Number(latitude) || this.data.latitude || DEFAULT_LOCATION.latitude
    var currentLongitude = Number(longitude) || this.data.longitude || DEFAULT_LOCATION.longitude
    var addressPrefix = [provinceName, cityName].filter(hasValue).join('')
    var manualKeyword = trimValue(keyword)

    if (manualKeyword) {
      list.push({
        key: 'manual|' + manualKeyword,
        title: '使用“' + manualKeyword + '”作为详细地址',
        address: [addressPrefix, manualKeyword].filter(hasValue).join(''),
        latitude: currentLatitude,
        longitude: currentLongitude,
        province: provinceName,
        city: cityName,
        district: '',
        manualStreet: manualKeyword,
        manualDetailAddress: '',
        fallback: true
      })
    }

    list.push({
      key: 'fallback-city|' + cityName,
      title: cityName ? (cityName + '当前定位') : '当前地图中心',
      address: addressPrefix
        ? (addressPrefix + '，确认后可返回补充门牌号')
        : '确认后可返回补充门牌号',
      latitude: currentLatitude,
      longitude: currentLongitude,
      province: provinceName,
      city: cityName,
      district: '',
      manualStreet: '',
      manualDetailAddress: '',
      fallback: true
    })

    return list
  },

  buildLocalSuggestionList: function (keyword) {
    var city = this.data.currentCity || cityHelper.getDefaultCity()
    var currentLatitude = Number(this.data.latitude) || Number(city.latitude) || DEFAULT_LOCATION.latitude
    var currentLongitude = Number(this.data.longitude) || Number(city.longitude) || DEFAULT_LOCATION.longitude
    var list = this.buildFallbackPoiList(city, currentLatitude, currentLongitude, keyword)
    var matchedCities = cityHelper.searchCities(keyword, 8)

    matchedCities.forEach(function (item) {
      list.push({
        key: 'city-switch|' + item.code,
        title: '切换到' + item.name,
        address: item.province,
        latitude: Number(item.latitude) || currentLatitude,
        longitude: Number(item.longitude) || currentLongitude,
        province: item.province,
        city: item.name,
        district: '',
        cityRecord: item,
        citySwitch: true
      })
    })

    return list.slice(0, 10)
  },

  applyFallbackPoiSelection: function (item) {
    var selectedLocation = {
      latitude: Number(item.latitude) || this.data.latitude || DEFAULT_LOCATION.latitude,
      longitude: Number(item.longitude) || this.data.longitude || DEFAULT_LOCATION.longitude,
      province: trimValue(item.province) || trimValue(this.data.selectedLocation.province),
      city: trimValue(item.city) || trimValue(this.data.selectedLocation.city),
      district: trimValue(item.district),
      street: trimValue(item.manualStreet),
      detailAddress: trimValue(item.manualDetailAddress),
      locationName: trimValue(item.title) || '已选位置',
      locationAddress: trimValue(item.address) || '请手动确认地址'
    }
    var selectedPoiKey = trimValue(item.key)
    var nextPoiList = this.data.poiList.map(function (poi) {
      return Object.assign({}, poi, { active: poi.key === selectedPoiKey })
    })

    this.setData({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      markers: buildMarker(selectedLocation.latitude, selectedLocation.longitude),
      selectedLocation: selectedLocation,
      selectedPoiKey: selectedPoiKey,
      poiList: nextPoiList
    })
  },

  applyPoiSelection: function (item) {
    var currentLocation = this.data.selectedLocation || {}
    var currentCity = this.data.currentCity || {}
    var latitude = Number(item.latitude) || this.data.latitude || DEFAULT_LOCATION.latitude
    var longitude = Number(item.longitude) || this.data.longitude || DEFAULT_LOCATION.longitude
    var selectedPoiKey = trimValue(item.key) || this.buildPoiKey(item.title, item.address)
    var province = trimValue(item.province) || trimValue(currentLocation.province) || trimValue(currentCity.province)
    var city = trimValue(item.city) || trimValue(currentLocation.city) || trimValue(currentCity.name)
    var district = trimValue(item.district) || trimValue(currentLocation.district)
    var title = trimValue(item.title || item.name) || '已选位置'
    var address = trimValue(item.address)
    var locationAddress = address || [province, city, district, title].filter(hasValue).join('') || title
    var nextPoiList = this.data.poiList.map(function (poi) {
      return Object.assign({}, poi, { active: poi.key === selectedPoiKey })
    })

    this._pendingProgrammaticCenterKey = buildCoordinateKey(latitude, longitude)

    this.setData({
      latitude: latitude,
      longitude: longitude,
      markers: buildMarker(latitude, longitude),
      selectedLocation: {
        latitude: latitude,
        longitude: longitude,
        province: province,
        city: city,
        district: district,
        street: '',
        detailAddress: address,
        locationName: title,
        locationAddress: locationAddress
      },
      selectedPoiKey: selectedPoiKey,
      poiList: nextPoiList
    })
  },

  onMapRegionChange: function (e) {
    if (e.type !== 'end' || !this.mapCtx || !this._pageActive) return

    var that = this
    if (this._regionChangeTimer) {
      clearTimeout(this._regionChangeTimer)
    }

    this._regionChangeTimer = setTimeout(function () {
      that._regionChangeTimer = null
      if (!that.mapCtx || !that._pageActive) {
        return
      }

      that.mapCtx.getCenterLocation({
        success: function (res) {
          var centerKey
          if (!that._pageActive) {
            return
          }

          if (that.shouldIgnoreProgrammaticRegionChange(res.latitude, res.longitude)) {
            return
          }

          centerKey = buildCoordinateKey(res.latitude, res.longitude)
          if (centerKey && centerKey === buildCoordinateKey(that.data.latitude, that.data.longitude) && !that.data.loading) {
            return
          }

          that.refreshByCoordinate(res.latitude, res.longitude, null, {
            silent: true,
            fallbackCity: that.data.currentCity
          })
        }
      })
    }, 120)
  },

  onKeywordInput: function (e) {
    if (this._activeSuggestionRequest && typeof this._activeSuggestionRequest.abort === 'function') {
      this._activeSuggestionRequest.abort()
      this._activeSuggestionRequest = null
    }

    this.setData({ keyword: e.detail.value })
  },

  searchSuggestions: function () {
    var that = this
    var keyword = trimValue(this.data.keyword)
    if (!that._pageActive) {
      return
    }

    if (!keyword) {
      wx.showToast({ title: '请输入地点关键词', icon: 'none' })
      return
    }

    if (that._activeSuggestionRequest && typeof that._activeSuggestionRequest.abort === 'function') {
      that._activeSuggestionRequest.abort()
    }

    that.setData({ searching: true })
    var suggestionRequest = tencentMap.suggestion({
      keyword: keyword,
      region: (that.data.currentCity && that.data.currentCity.name)
        || that.data.selectedLocation.city
        || that.data.selectedLocation.province,
      location: {
        latitude: that.data.latitude,
        longitude: that.data.longitude
      }
    })
    that._activeSuggestionRequest = suggestionRequest

    suggestionRequest.then(function (list) {
      if (!that._pageActive || that._activeSuggestionRequest !== suggestionRequest) {
        return null
      }

      that._activeSuggestionRequest = null
      var poiList = (list || []).map(function (item) {
        var latitude = Number(item.location && item.location.lat)
        var longitude = Number(item.location && item.location.lng)
        return {
          key: that.buildPoiKey(item.title, item.address),
          title: trimValue(item.title),
          address: trimValue(item.address),
          latitude: latitude,
          longitude: longitude,
          province: trimValue(item.province),
          city: trimValue(item.city),
          district: trimValue(item.district)
        }
      }).filter(function (item) {
        return item.title && item.latitude && item.longitude
      })

      that.setData({ searching: false, poiList: poiList })
      if (!poiList.length) {
        wx.showToast({ title: '未找到相关地点', icon: 'none' })
      }
      return null
    }).catch(function (error) {
      var fallbackList
      if (that._activeSuggestionRequest === suggestionRequest) {
        that._activeSuggestionRequest = null
      }

      if (!that._pageActive || (error && error.aborted)) {
        return null
      }

      fallbackList = that.buildLocalSuggestionList(keyword)
      that.setData({
        searching: false,
        serviceUnavailable: true,
        serviceMessage: buildFriendlyMapError(error),
        poiList: fallbackList,
        selectedPoiKey: fallbackList[0] ? fallbackList[0].key : that.data.selectedPoiKey,
        poiEmptyMessage: '搜索服务暂不可用，可切换城市或使用手动填写。'
      })
      if (!fallbackList.length) {
        wx.showToast({ title: '未找到相关地点，请手动填写', icon: 'none' })
      }
      return null
    })
  },

  selectPoi: function (e) {
    var index = Number(e.currentTarget.dataset.index)
    var item = this.data.poiList[index]
    if (!item) return

    if (item.citySwitch && item.cityRecord) {
      this.applySelectedCity(item.cityRecord)
      return
    }

    if (item.fallback) {
      this.applyFallbackPoiSelection(item)
      return
    }

    this.applyPoiSelection(item)
  },

  locateCurrentPosition: function () {
    var that = this
    var silentMode = arguments[0] === true
    if (typeof wx.getFuzzyLocation !== 'function') {
      if (!silentMode) {
        wx.showToast({ title: '当前微信版本不支持模糊定位', icon: 'none' })
      }
      return Promise.resolve(false)
    }

    that.setData({ locating: true })
    return new Promise(function (resolve) {
      wx.getFuzzyLocation({
        type: 'wgs84',
        success: function (res) {
          if (!that._pageActive) {
            resolve(false)
            return
          }

          var currentCity = cityHelper.findNearestCity(res.latitude, res.longitude)
            || that.data.currentCity
            || cityHelper.getDefaultCity()
          that.setData({ locating: false })
          that.setActiveCity(currentCity)
          that.refreshByCoordinate(res.latitude, res.longitude, null, {
            silent: silentMode,
            fallbackCity: currentCity
          }).then(function () {
            resolve(true)
          })
        },
        fail: function (error) {
          if (!that._pageActive) {
            resolve(false)
            return
          }

          that.setData({ locating: false })
          var message = (error && error.errMsg) || ''
          if (!silentMode) {
            if (/auth deny|authorize/i.test(message)) {
              wx.showToast({ title: '请先开启定位权限', icon: 'none' })
              resolve(false)
              return
            }
            if (!/cancel/i.test(message)) {
              wx.showToast({ title: '定位失败，请稍后重试', icon: 'none' })
            }
          }
          resolve(false)
        }
      })
    })
  },

  confirmLocation: function () {
    if (!this.data.selectedLocation || !this.data.selectedLocation.locationAddress) {
      wx.showToast({ title: '请先选择一个位置', icon: 'none' })
      return
    }

    var pages = getCurrentPages()
    var prev = pages[pages.length - 2]
    if (prev) {
      prev._selectedLocation = this.data.selectedLocation
    }
    wx.navigateBack()
  }
})