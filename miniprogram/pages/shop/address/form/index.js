var api = require('../../../../utils/api.js')
var tencentMap = require('../../../../utils/tencent-map.js')

var DEFAULT_LOCATION = {
  latitude: 28.2282,
  longitude: 112.9388,
  name: '地图预览',
  address: '支持微信导入、当前位置、地图选点和剪贴板识别'
}

var LABEL_OPTIONS = ['家', '公司', '学校']

function trimValue(value) {
  return String(value || '').trim()
}

function sanitizePhone(value) {
  return trimValue(value).replace(/\s+/g, '')
}

function hasValue(value) {
  return !!trimValue(value)
}

var FORM_SHEET_DEFAULT_HEIGHT_RPX = 1070
var FORM_SHEET_EXPANDED_OFFSET_RPX = 300

function convertRpxToPx(rpx, windowWidth) {
  if (!windowWidth) {
    return 0
  }

  return Math.round(Number(rpx || 0) * windowWidth / 750)
}

function buildRegionLabel(form) {
  return [form.province, form.city, form.district].filter(hasValue).join(' ')
}

function buildFullAddress(form) {
  var localAddress = trimValue(form.street) || trimValue(form.detailAddress)
  return [form.province, form.city, form.district, localAddress]
    .filter(hasValue)
    .join(' ')
}

function buildMapMarkers(locationInfo) {
  if (!locationInfo) return []

  var latitude = Number(locationInfo.latitude)
  var longitude = Number(locationInfo.longitude)
  if (!latitude || !longitude) return []

  return [{
    id: 1,
    latitude: latitude,
    longitude: longitude,
    width: 2,
    height: 2,
    alpha: 0,
    callout: {
      content: trimValue(locationInfo.name) || '已选位置',
      color: '#ffffff',
      bgColor: '#1a1a1a',
      borderRadius: 10,
      padding: 8,
      display: 'BYCLICK'
    }
  }]
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeFirstOccurrence(text, value) {
  if (!value) {
    return String(text || '')
  }

  return String(text || '').replace(new RegExp(escapeRegExp(value)), ' ')
}

function stripLeadingRegionText(text, component) {
  var nextText = trimValue(text)
  var locationComponent = component || {}
  var regionParts = [
    [locationComponent.province, locationComponent.city, locationComponent.district].filter(hasValue).join(''),
    [locationComponent.province, locationComponent.city].filter(hasValue).join(''),
    [locationComponent.city, locationComponent.district].filter(hasValue).join(''),
    trimValue(locationComponent.province),
    trimValue(locationComponent.city),
    trimValue(locationComponent.district)
  ].filter(hasValue)
  var changed = true

  while (changed && nextText) {
    changed = false
    for (var i = 0; i < regionParts.length; i += 1) {
      var part = regionParts[i]
      var candidate = trimValue(nextText.replace(new RegExp('^' + escapeRegExp(part) + '[,，、\\s]*'), ''))
      if (candidate !== nextText) {
        nextText = candidate
        changed = true
      }
    }
  }

  return nextText
}

function buildLocalAddressText(street, detailAddress) {
  return [trimValue(street), trimValue(detailAddress)].filter(hasValue).join('')
}

function mergeDistinctText(primary, secondary) {
  var first = trimValue(primary)
  var second = trimValue(secondary)

  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  if (first.indexOf(second) !== -1) {
    return first
  }
  if (second.indexOf(first) !== -1) {
    return second
  }

  return first + second
}

function normalizeLocalAddressText(text, component) {
  return trimValue(stripLeadingRegionText(text, component).replace(/^[,，、\s]+/, ''))
}

function isLikelyName(value) {
  var candidate = trimValue(value).replace(/[：:]/g, '')
  if (!candidate || candidate.length < 2 || candidate.length > 20) {
    return false
  }

  if (/(省|市|区|县|镇|乡|街道|大道|路|号|栋|单元|室|公司|学校|地址|收货|联系|电话|手机|邮编)/.test(candidate)) {
    return false
  }

  return /^[A-Za-z\u4e00-\u9fa5·]{2,20}$/.test(candidate)
}

function extractReceiverName(lines, mergedText) {
  var labeled = String(mergedText || '').match(/(?:收货人|收件人|联系人|姓名)\s*[:：]?\s*([A-Za-z\u4e00-\u9fa5·]{2,20})/)
  if (labeled && isLikelyName(labeled[1])) {
    return trimValue(labeled[1])
  }

  for (var i = 0; i < lines.length; i += 1) {
    var cleanLine = trimValue(String(lines[i] || '').replace(/(?:收货人|收件人|联系人|姓名)\s*[:：]?/g, ' '))
    if (!cleanLine) {
      continue
    }

    var tokens = cleanLine.split(/\s+/)
    for (var j = 0; j < tokens.length; j += 1) {
      if (isLikelyName(tokens[j])) {
        return trimValue(tokens[j])
      }
    }
  }

  var leading = trimValue(mergedText).match(/^([A-Za-z\u4e00-\u9fa5·]{2,20})(?:\s+|,|，)/)
  if (leading && isLikelyName(leading[1])) {
    return trimValue(leading[1])
  }

  return ''
}

function isGenericLocationName(value) {
  var text = trimValue(value)
  if (!text) {
    return true
  }

  return /^(已选位置|地图选点|剪贴板识别|手动填写地址|当前地图中心)$/.test(text)
    || /当前定位$/.test(text)
}

function resolveLocationFormFields(payload) {
  var locationPayload = payload || {}
  var fullText = normalizeLocalAddressText(locationPayload.locationAddress, locationPayload)
  var locationName = trimValue(locationPayload.locationName)
  var street = normalizeLocalAddressText(locationPayload.street, locationPayload)
  var detailAddress = normalizeLocalAddressText(locationPayload.detailAddress, locationPayload)
  var locationLabel = !isGenericLocationName(locationName)
    ? normalizeLocalAddressText(locationName, locationPayload)
    : ''
  var localAddress = ''

  localAddress = detailAddress || fullText || buildLocalAddressText(street, detailAddress) || street

  if (locationLabel) {
    localAddress = mergeDistinctText(localAddress, locationLabel)
  }

  if (!localAddress) {
    localAddress = locationLabel
  }

  return {
    street: normalizeLocalAddressText(localAddress, locationPayload),
    detailAddress: ''
  }
}

function isDevtoolsEnvironment() {
  try {
    return wx.getSystemInfoSync().platform === 'devtools'
  } catch (error) {
    return false
  }
}

Page({
  data: {
    loading: false,
    saving: false,
    parsingClipboard: false,
    geocoding: false,
    editingId: 0,
    formSheetDefaultHeightPx: 0,
    formSheetHeightPx: 0,
    formSheetMaxHeightPx: 0,
    labelOptions: LABEL_OPTIONS,
    form: {
      receiverName: '',
      receiverPhone: '',
      province: '',
      city: '',
      district: '',
      street: '',
      detailAddress: '',
      label: '',
      isDefault: false
    },
    regionValue: [],
    regionLabel: '',
    locationInfo: DEFAULT_LOCATION,
    markers: buildMapMarkers(DEFAULT_LOCATION)
  },

  onLoad: function (options) {
    this._formSheetDragStartY = null
    this._formSheetDragLatestY = null
    this.setupInitialFormSheetState()

    var editingId = Number(options.id) || 0
    this.setData({ editingId: editingId })
    wx.setNavigationBarTitle({
      title: editingId ? '编辑收货地址' : '新增收货地址'
    })

    if (editingId) {
      this.loadAddress(editingId)
      return
    }

    this.applyFormPatch({}, {})
  },

  onShow: function () {
    var pages = getCurrentPages()
    var current = pages[pages.length - 1]
    if (current && current._selectedLocation) {
      this.applySelectedLocation(current._selectedLocation)
      current._selectedLocation = null
    }
  },

  onReady: function () {
    this.syncFormSheetMetrics()
  },

  setupInitialFormSheetState: function () {
    var windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
    var windowHeight = Number(windowInfo && (windowInfo.windowHeight || windowInfo.screenHeight)) || 0
    var windowWidth = Number(windowInfo && windowInfo.windowWidth) || 0
    var defaultHeight = Math.min(windowHeight, convertRpxToPx(FORM_SHEET_DEFAULT_HEIGHT_RPX, windowWidth))

    this._formWindowHeight = windowHeight
    this._formWindowWidth = windowWidth
    this.setData({
      formSheetDefaultHeightPx: defaultHeight,
      formSheetHeightPx: defaultHeight,
      formSheetMaxHeightPx: defaultHeight
    })
  },

  syncFormSheetMetrics: function () {
    var windowHeight = this._formWindowHeight || 0
    var windowWidth = this._formWindowWidth || 0

    if (!windowHeight || !windowWidth) {
      return
    }

    var defaultHeight = Math.min(windowHeight, convertRpxToPx(FORM_SHEET_DEFAULT_HEIGHT_RPX, windowWidth))
    var maxHeight = Math.min(windowHeight, defaultHeight + convertRpxToPx(FORM_SHEET_EXPANDED_OFFSET_RPX, windowWidth))
    var currentHeight = Number(this.data.formSheetHeightPx) > Number(this.data.formSheetDefaultHeightPx)
      ? maxHeight
      : defaultHeight

    this.setData({
      formSheetDefaultHeightPx: defaultHeight,
      formSheetHeightPx: currentHeight,
      formSheetMaxHeightPx: maxHeight
    })
  },

  updateFormSheetHeight: function (height) {
    var defaultHeight = Number(this.data.formSheetDefaultHeightPx) || 0
    var maxHeight = Number(this.data.formSheetMaxHeightPx) || defaultHeight
    var nextHeight = Math.max(defaultHeight, Math.min(Number(height) || defaultHeight, maxHeight))

    this.setData({
      formSheetHeightPx: nextHeight
    })
  },

  onFormSheetDragStart: function (e) {
    var touch = e && e.touches && e.touches[0]
    if (!touch) {
      return
    }

    this._formSheetDragStartY = touch.clientY
    this._formSheetDragLatestY = touch.clientY
  },

  onFormSheetDragMove: function (e) {
    var touch = e && e.touches && e.touches[0]
    var startY = this._formSheetDragStartY
    if (!touch || startY === null) {
      return
    }

    this._formSheetDragLatestY = touch.clientY
  },

  onFormSheetDragEnd: function (e) {
    var touch = (e && e.changedTouches && e.changedTouches[0]) || (e && e.touches && e.touches[0])
    var startY = this._formSheetDragStartY
    var endY = touch ? touch.clientY : this._formSheetDragLatestY
    var threshold = 18
    var nextHeight = Number(this.data.formSheetHeightPx) || Number(this.data.formSheetDefaultHeightPx) || 0

    if (startY !== null && endY !== null) {
      if (endY - startY <= -threshold) {
        nextHeight = this.data.formSheetMaxHeightPx
      } else if (endY - startY >= threshold) {
        nextHeight = this.data.formSheetDefaultHeightPx
      }
    }

    this._formSheetDragStartY = null
    this._formSheetDragLatestY = null
    this.updateFormSheetHeight(nextHeight)
  },

  loadAddress: function (id) {
    var that = this
    that.setData({ loading: true })
    api.get('/api/address', { showError: false }).then(function (res) {
      var list = res && Array.isArray(res.data)
        ? res.data
        : Array.isArray(res)
          ? res
          : []
      var address = list.find(function (item) {
        return Number(item.id) === Number(id)
      })

      if (!address) {
        that.setData({ loading: false })
        wx.showToast({ title: '地址不存在', icon: 'none' })
        setTimeout(function () {
          wx.navigateBack()
        }, 300)
        return
      }

      that.applyFormPatch({
        receiverName: address.receiverName || '',
        receiverPhone: address.receiverPhone || '',
        province: address.province || '',
        city: address.city || '',
        district: address.district || '',
        street: normalizeLocalAddressText(buildLocalAddressText(address.street, address.detailAddress), address),
        detailAddress: '',
        label: address.label || '',
        isDefault: !!address.isDefault
      }, {})
      that.setData({ loading: false })
      that.geocodeCurrentAddress(true)
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  applyFormPatch: function (formPatch, locationPatch) {
    var nextForm = Object.assign({}, this.data.form, formPatch || {})
    var nextLocation = Object.assign({}, this.data.locationInfo || DEFAULT_LOCATION, locationPatch || {})
    if (!trimValue(nextLocation.name)) {
      nextLocation.name = DEFAULT_LOCATION.name
    }
    if (!trimValue(nextLocation.address)) {
      nextLocation.address = buildFullAddress(nextForm) || DEFAULT_LOCATION.address
    }

    this.setData({
      form: nextForm,
      regionValue: [nextForm.province || '', nextForm.city || '', nextForm.district || ''],
      regionLabel: buildRegionLabel(nextForm),
      locationInfo: nextLocation,
      markers: buildMapMarkers(nextLocation)
    })
  },

  onFieldInput: function (e) {
    var field = e.currentTarget.dataset.field
    var value = e.detail && e.detail.value !== undefined ? e.detail.value : e.detail
    if (field === 'receiverPhone') {
      value = String(value || '').replace(/[^\d]/g, '').slice(0, 11)
    }

    var patch = {}
    patch[field] = value
    this.applyFormPatch(patch, {})
  },

  onRegionChange: function (e) {
    var region = e.detail.value || []
    this.applyFormPatch({
      province: region[0] || '',
      city: region[1] || '',
      district: region[2] || ''
    }, {})
    if (hasValue(this.data.form.street) || hasValue(this.data.form.detailAddress)) {
      this.geocodeCurrentAddress(true)
    }
  },

  onAddressBlur: function () {
    this.geocodeCurrentAddress(true)
  },

  selectLabel: function (e) {
    var label = e.currentTarget.dataset.label
    if (!label) return
    this.applyFormPatch({ label: label }, {})
  },

  onDefaultChange: function (e) {
    this.applyFormPatch({ isDefault: !!e.detail }, {})
  },

  noop: function () {},

  toggleDefault: function () {
    this.applyFormPatch({ isDefault: !this.data.form.isDefault }, {})
  },

  chooseWechatAddress: function () {
    var that = this
    if (typeof wx.chooseAddress !== 'function') {
      wx.showToast({ title: '当前微信版本不支持地址导入', icon: 'none' })
      return
    }

    var invokeChooseAddress = function () {
      that.invokeWechatAddressChooser()
    }

    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: invokeChooseAddress,
        fail: function (error) {
          that.handleWechatAddressFailure(error)
        }
      })
      return
    }

    invokeChooseAddress()
  },

  invokeWechatAddressChooser: function () {
    var that = this
    wx.chooseAddress({
      success: function (res) {
        var localAddress = normalizeLocalAddressText(res.detailInfo, {
          province: res.provinceName || '',
          city: res.cityName || '',
          district: res.countyName || ''
        })

        that.applyFormPatch({
          receiverName: res.userName || that.data.form.receiverName,
          receiverPhone: sanitizePhone(res.telNumber || that.data.form.receiverPhone),
          province: res.provinceName || '',
          city: res.cityName || '',
          district: res.countyName || '',
          street: localAddress,
          detailAddress: ''
        }, {
          name: res.detailInfo || '微信地址',
          address: [res.provinceName, res.cityName, res.countyName, res.detailInfo]
            .filter(hasValue)
            .join(' ')
        })
        that.geocodeCurrentAddress(true)
      },
      fail: function (error) {
        that.handleWechatAddressFailure(error)
      }
    })
  },

  handleWechatAddressFailure: function (error) {
    var errMsg = trimValue(error && error.errMsg)
    var normalized = errMsg.toLowerCase()

    if (/cancel/.test(normalized)) {
      return
    }

    if (isDevtoolsEnvironment()) {
      wx.showToast({ title: '开发者工具不支持微信地址簿，请真机重试', icon: 'none' })
      return
    }

    if (/privacy/.test(normalized)) {
      wx.showModal({
        title: '需要隐私授权',
        content: '请先同意小程序隐私保护指引后，再使用微信导入。',
        confirmText: '查看指引',
        success: function (res) {
          if (res.confirm && typeof wx.openPrivacyContract === 'function') {
            wx.openPrivacyContract({})
          }
        }
      })
      return
    }

    if (/auth deny|permission denied|no permission|scope/.test(normalized)) {
      wx.showModal({
        title: '需要通讯地址权限',
        content: '请在微信设置中开启“通讯地址”权限后，再重试微信导入。',
        confirmText: '去设置',
        success: function (res) {
          if (res.confirm && typeof wx.openSetting === 'function') {
            wx.openSetting({})
          }
        }
      })
      return
    }

    if (/function not exist|not supported|unsupported/.test(normalized)) {
      wx.showToast({ title: '当前环境暂不支持微信地址导入', icon: 'none' })
      return
    }

    wx.showToast({ title: errMsg || '微信导入失败，请稍后重试', icon: 'none' })
  },

  importFromClipboard: function () {
    var that = this
    that.setData({ parsingClipboard: true })
    wx.getClipboardData({
      success: function (res) {
        var text = trimValue(res.data)
        if (!text) {
          that.setData({ parsingClipboard: false })
          wx.showToast({ title: '剪贴板暂无可识别内容', icon: 'none' })
          return
        }

        var parsed = that.parseClipboardText(text)
        that.applyClipboardResult(parsed)
        that.geocodeClipboardText(parsed.addressText || text, parsed)
      },
      fail: function () {
        that.setData({ parsingClipboard: false })
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' })
      }
    })
  },

  parseClipboardText: function (text) {
    var normalized = String(text || '')
      .replace(/\r/g, '\n')
      .replace(/[；;]/g, '\n')
      .replace(/[，,]/g, ' ')
      .replace(/\t/g, ' ')
    var lines = normalized.split(/\n+/).map(trimValue).filter(hasValue)
    var merged = trimValue(lines.join(' ').replace(/\s+/g, ' '))
    var phoneMatch = merged.match(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/)
    var phone = phoneMatch ? sanitizePhone(phoneMatch[0]) : ''
    var name = extractReceiverName(lines, merged)
    var stripped = merged
      .replace(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g, ' ')
      .replace(/\b\d{6}\b/g, ' ')
      .replace(/(?:收货人|收件人|联系人|姓名|电话|手机号|手机号码|邮编|所在地区|详细地址|收货地址)\s*[:：]?/g, ' ')

    if (name) {
      stripped = removeFirstOccurrence(stripped, name)
    }

    stripped = trimValue(stripped.replace(/\s+/g, ' '))

    return {
      receiverName: name,
      receiverPhone: phone,
      addressText: stripped
    }
  },

  applyClipboardResult: function (parsed) {
    var patch = {}
    if (parsed.receiverName) {
      patch.receiverName = parsed.receiverName
    }
    if (parsed.receiverPhone) {
      patch.receiverPhone = sanitizePhone(parsed.receiverPhone)
    }

    if (Object.keys(patch).length) {
      this.applyFormPatch(patch, {})
    }
  },

  geocodeClipboardText: function (addressText, parsed) {
    var that = this
    var query = trimValue(addressText)
    if (!query) {
      that.setData({ parsingClipboard: false })
      wx.showToast({ title: '未识别到地址内容', icon: 'none' })
      return
    }

    tencentMap.geocoder({
      address: query,
      region: that.data.form.city || that.data.form.province
    }).then(function (result) {
      that.setData({ parsingClipboard: false })
      var clipboardFields = that.pickClipboardLocationFields(parsed, result, query)
      var payload = that.buildLocationPayload(result, {
        locationName: '剪贴板识别',
        street: clipboardFields.street,
        detailAddress: clipboardFields.detailAddress,
        locationAddress: clipboardFields.locationAddress
      })
      that.applySelectedLocation(payload)
      wx.showToast({ title: '已识别地址', icon: 'success' })
    }).catch(function () {
      that.setData({ parsingClipboard: false })
      that.applyFormPatch({
        street: normalizeLocalAddressText(query, {}),
        detailAddress: ''
      }, {})
      wx.showToast({ title: '已填入地址文本，请核对后保存', icon: 'none' })
    })
  },

  pickClipboardLocationFields: function (parsed, result, fallback) {
    var component = result && (result.address_component || result.addressComponent) || {}
    var rawText = trimValue(parsed && parsed.addressText) || trimValue(fallback)
    var localAddress = normalizeLocalAddressText(rawText, component)
    return {
      street: localAddress,
      detailAddress: '',
      locationAddress: [component.province, component.city, component.district, localAddress]
        .filter(hasValue)
        .join(' ')
    }
  },

  openLocationPicker: function () {
    var locationInfo = this.data.locationInfo || DEFAULT_LOCATION
    var url = '/pages/shop/address/location/index?latitude='
      + encodeURIComponent(String(locationInfo.latitude || DEFAULT_LOCATION.latitude))
      + '&longitude='
      + encodeURIComponent(String(locationInfo.longitude || DEFAULT_LOCATION.longitude))
      + '&keyword='
      + encodeURIComponent(this.data.form.street || this.data.form.detailAddress || '')
      + '&city='
      + encodeURIComponent(this.data.form.city || this.data.form.province || '')
    wx.navigateTo({ url: url })
  },

  geocodeCurrentAddress: function (silent) {
    var that = this
    var query = buildFullAddress(that.data.form)
    if (!query) {
      return Promise.resolve()
    }

    that.setData({ geocoding: !silent })
    return tencentMap.geocoder({
      address: query,
      region: that.data.form.city || that.data.form.province
    }).then(function (result) {
      that.setData({ geocoding: false })
      var payload = that.buildLocationPayload(result, {
        street: that.data.form.street,
        locationName: that.data.locationInfo.name
      })
      that.applySelectedLocation(payload)
    }).catch(function () {
      that.setData({ geocoding: false })
    })
  },

  buildLocationPayload: function (result, options) {
    var component = result && (result.address_component || result.addressComponent) || {}
    var location = result && result.location || {}
    var formatted = result && result.formatted_addresses || {}
    var fullAddress = trimValue(result && result.address) || buildFullAddress(this.data.form)
    var localAddress = normalizeLocalAddressText(
      trimValue(options && options.street)
        || buildLocalAddressText(component.street, component.street_number)
        || fullAddress,
      component
    )

    return {
      latitude: Number(location.lat) || Number(this.data.locationInfo.latitude) || DEFAULT_LOCATION.latitude,
      longitude: Number(location.lng) || Number(this.data.locationInfo.longitude) || DEFAULT_LOCATION.longitude,
      province: trimValue(component.province) || this.data.form.province,
      city: trimValue(component.city) || this.data.form.city,
      district: trimValue(component.district) || this.data.form.district,
      street: localAddress || this.data.form.street,
      detailAddress: '',
      locationName: trimValue(options && options.locationName)
        || trimValue(formatted.recommend)
        || fullAddress
        || '已选位置',
      locationAddress: trimValue(options && options.locationAddress)
        || fullAddress
        || localAddress
    }
  },

  applySelectedLocation: function (payload) {
    var resolvedFields = resolveLocationFormFields(payload)
    var patch = {
      province: payload.province || this.data.form.province,
      city: payload.city || this.data.form.city,
      district: payload.district || this.data.form.district,
      street: resolvedFields.street !== undefined ? resolvedFields.street : this.data.form.street,
      detailAddress: resolvedFields.detailAddress !== undefined ? resolvedFields.detailAddress : this.data.form.detailAddress
    }

    this.applyFormPatch(patch, {
      latitude: Number(payload.latitude) || this.data.locationInfo.latitude || DEFAULT_LOCATION.latitude,
      longitude: Number(payload.longitude) || this.data.locationInfo.longitude || DEFAULT_LOCATION.longitude,
      name: trimValue(payload.locationName) || trimValue(payload.locationAddress) || DEFAULT_LOCATION.name,
      address: trimValue(payload.locationAddress) || buildFullAddress(patch) || DEFAULT_LOCATION.address
    })
  },

  saveAddress: function () {
    var that = this
    var form = that.data.form
    var receiverName = trimValue(form.receiverName)
    var receiverPhone = sanitizePhone(form.receiverPhone)
    var province = trimValue(form.province)
    var city = trimValue(form.city)
    var district = trimValue(form.district)
    var localAddress = trimValue(form.street) || trimValue(form.detailAddress)

    if (!receiverName) {
      wx.showToast({ title: '请输入收货人', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(receiverPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    if (!province || !city || !district) {
      wx.showToast({ title: '请选择所在地区', icon: 'none' })
      return
    }
    if (!localAddress) {
      wx.showToast({ title: '请输入详细地址', icon: 'none' })
      return
    }

    that.setData({ saving: true })
    var payload = {
      addressType: 'chinese',
      receiverName: receiverName,
      receiverPhone: receiverPhone,
      province: province,
      city: city,
      district: district,
      street: localAddress,
      detailAddress: '',
      label: trimValue(form.label),
      isDefault: !!form.isDefault
    }

    var request = that.data.editingId
      ? api.put('/api/address/' + that.data.editingId, payload)
      : api.post('/api/address', payload)

    request.then(function () {
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 350)
    }).catch(function () {
      that.setData({ saving: false })
    })
  }
})