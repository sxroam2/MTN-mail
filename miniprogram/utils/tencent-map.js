var BASE_URL = 'https://apis.map.qq.com'

function trimValue(value) {
  return String(value || '').trim()
}

function withAbort(promise, abortHandler) {
  promise.abort = function () {
    if (typeof abortHandler === 'function') {
      abortHandler()
    }
  }
  return promise
}

function getMapKey() {
  try {
    var app = getApp()
    return trimValue(app && app.globalData && app.globalData.tencentMapKey)
  } catch (error) {
    return ''
  }
}

function request(path, data) {
  var key = getMapKey()
  if (!key) {
    return Promise.reject({ code: -1, message: '未配置腾讯位置服务 Key' })
  }

  var requestTask = null
  var promise = new Promise(function (resolve, reject) {
    requestTask = wx.request({
      url: BASE_URL + path,
      method: 'GET',
      data: Object.assign({}, data, { key: key }),
      timeout: 12000,
      success: function (res) {
        if (res.statusCode >= 400) {
          reject({ code: res.statusCode, message: '地图服务请求失败', data: res.data })
          return
        }

        var payload = res.data || {}
        if (Number(payload.status) !== 0) {
          reject({
            code: Number(payload.status) || -1,
            message: payload.message || '地图服务请求失败',
            data: payload
          })
          return
        }

        resolve(payload.result || payload.data || payload)
      },
      fail: function (error) {
        var errMsg = trimValue(error && error.errMsg)
        if (/abort/i.test(errMsg)) {
          reject({ code: -2, message: '地图请求已取消', error: error, aborted: true })
          return
        }

        reject({
          code: -1,
          message: errMsg || '地图服务网络错误',
          error: error
        })
      }
    })
  })

  return withAbort(promise, function () {
    if (requestTask && typeof requestTask.abort === 'function') {
      requestTask.abort()
    }
  })
}

function geocoder(options) {
  var address = trimValue(options && options.address)
  if (!address) {
    return Promise.reject({ code: -1, message: '缺少地址文本' })
  }

  var data = { address: address }
  var region = trimValue(options && options.region)
  if (region) {
    data.region = region
  }

  return request('/ws/geocoder/v1/', data)
}

function reverseGeocoder(options) {
  var latitude = Number(options && options.latitude)
  var longitude = Number(options && options.longitude)
  if (!latitude || !longitude) {
    return Promise.reject({ code: -1, message: '缺少经纬度参数' })
  }

  return request('/ws/geocoder/v1/', {
    location: latitude + ',' + longitude,
    get_poi: options && options.getPoi === false ? 0 : 1
  })
}

function suggestion(options) {
  var keyword = trimValue(options && options.keyword)
  if (!keyword) {
    return Promise.reject({ code: -1, message: '缺少搜索关键词' })
  }

  var data = {
    keyword: keyword,
    page_size: Number(options && options.pageSize) || 20,
    region_fix: 0
  }

  var region = trimValue(options && options.region)
  if (region) {
    data.region = region
  }

  var location = options && options.location
  if (location && Number(location.latitude) && Number(location.longitude)) {
    data.location = Number(location.latitude) + ',' + Number(location.longitude)
  }

  var suggestionRequest = request('/ws/place/v1/suggestion/', data)
  var promise = suggestionRequest.then(function (result) {
    return Array.isArray(result) ? result : []
  })

  return withAbort(promise, function () {
    if (typeof suggestionRequest.abort === 'function') {
      suggestionRequest.abort()
    }
  })
}

module.exports = {
  geocoder: geocoder,
  reverseGeocoder: reverseGeocoder,
  suggestion: suggestion
}