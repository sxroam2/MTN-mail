var chinaCityData = require('china-city-data')

var STORAGE_KEY = 'address_location_city'

var PROVINCE_NAME_MAP = {
  '11': '北京市',
  '12': '天津市',
  '13': '河北省',
  '14': '山西省',
  '15': '内蒙古自治区',
  '21': '辽宁省',
  '22': '吉林省',
  '23': '黑龙江省',
  '31': '上海市',
  '32': '江苏省',
  '33': '浙江省',
  '34': '安徽省',
  '35': '福建省',
  '36': '江西省',
  '37': '山东省',
  '41': '河南省',
  '42': '湖北省',
  '43': '湖南省',
  '44': '广东省',
  '45': '广西壮族自治区',
  '46': '海南省',
  '50': '重庆市',
  '51': '四川省',
  '52': '贵州省',
  '53': '云南省',
  '54': '西藏自治区',
  '61': '陕西省',
  '62': '甘肃省',
  '63': '青海省',
  '64': '宁夏回族自治区',
  '65': '新疆维吾尔自治区',
  '71': '台湾省',
  '81': '香港特别行政区',
  '82': '澳门特别行政区'
}

var PROVINCE_FALLBACK_CITY_MAP = {
  '北京市': '北京市',
  '天津市': '天津市',
  '河北省': '石家庄市',
  '山西省': '太原市',
  '内蒙古自治区': '呼和浩特市',
  '辽宁省': '沈阳市',
  '吉林省': '长春市',
  '黑龙江省': '哈尔滨市',
  '上海市': '上海市',
  '江苏省': '南京市',
  '浙江省': '杭州市',
  '安徽省': '合肥市',
  '福建省': '福州市',
  '江西省': '南昌市',
  '山东省': '济南市',
  '河南省': '郑州市',
  '湖北省': '武汉市',
  '湖南省': '长沙市',
  '广东省': '广州市',
  '广西壮族自治区': '南宁市',
  '海南省': '海口市',
  '重庆市': '重庆市',
  '四川省': '成都市',
  '贵州省': '贵阳市',
  '云南省': '昆明市',
  '西藏自治区': '拉萨市',
  '陕西省': '西安市',
  '甘肃省': '兰州市',
  '青海省': '西宁市',
  '宁夏回族自治区': '银川市',
  '新疆维吾尔自治区': '乌鲁木齐市',
  '台湾省': '台北市',
  '香港特别行政区': '香港特别行政区',
  '澳门特别行政区': '澳门特别行政区'
}

var HOT_CITY_NAMES = [
  '上海市',
  '北京市',
  '广州市',
  '成都市',
  '苏州市',
  '深圳市',
  '南京市',
  '天津市',
  '重庆市',
  '厦门市',
  '武汉市',
  '西安市',
  '长沙市'
]

var CITY_COORDINATE_MAP = {
  '北京市': { latitude: 39.9042, longitude: 116.4074 },
  '天津市': { latitude: 39.0842, longitude: 117.2009 },
  '上海市': { latitude: 31.2304, longitude: 121.4737 },
  '重庆市': { latitude: 29.5630, longitude: 106.5516 },
  '石家庄市': { latitude: 38.0428, longitude: 114.5149 },
  '保定市': { latitude: 38.8746, longitude: 115.4648 },
  '太原市': { latitude: 37.8706, longitude: 112.5489 },
  '呼和浩特市': { latitude: 40.8426, longitude: 111.7492 },
  '沈阳市': { latitude: 41.8057, longitude: 123.4315 },
  '大连市': { latitude: 38.9140, longitude: 121.6147 },
  '长春市': { latitude: 43.8171, longitude: 125.3235 },
  '哈尔滨市': { latitude: 45.8038, longitude: 126.5349 },
  '南京市': { latitude: 32.0603, longitude: 118.7969 },
  '苏州市': { latitude: 31.2989, longitude: 120.5853 },
  '无锡市': { latitude: 31.4912, longitude: 120.3119 },
  '杭州市': { latitude: 30.2741, longitude: 120.1551 },
  '宁波市': { latitude: 29.8683, longitude: 121.5440 },
  '合肥市': { latitude: 31.8206, longitude: 117.2272 },
  '福州市': { latitude: 26.0745, longitude: 119.2965 },
  '厦门市': { latitude: 24.4798, longitude: 118.0894 },
  '南昌市': { latitude: 28.6820, longitude: 115.8579 },
  '济南市': { latitude: 36.6512, longitude: 117.1201 },
  '青岛市': { latitude: 36.0662, longitude: 120.3826 },
  '郑州市': { latitude: 34.7466, longitude: 113.6254 },
  '武汉市': { latitude: 30.5928, longitude: 114.3055 },
  '长沙市': { latitude: 28.2282, longitude: 112.9388 },
  '广州市': { latitude: 23.1291, longitude: 113.2644 },
  '深圳市': { latitude: 22.5431, longitude: 114.0579 },
  '佛山市': { latitude: 23.0215, longitude: 113.1214 },
  '珠海市': { latitude: 22.2710, longitude: 113.5767 },
  '南宁市': { latitude: 22.8170, longitude: 108.3669 },
  '海口市': { latitude: 20.0440, longitude: 110.1999 },
  '成都市': { latitude: 30.5728, longitude: 104.0668 },
  '贵阳市': { latitude: 26.6470, longitude: 106.6302 },
  '昆明市': { latitude: 25.0389, longitude: 102.7183 },
  '拉萨市': { latitude: 29.6525, longitude: 91.1721 },
  '西安市': { latitude: 34.3416, longitude: 108.9398 },
  '兰州市': { latitude: 36.0611, longitude: 103.8343 },
  '西宁市': { latitude: 36.6171, longitude: 101.7782 },
  '银川市': { latitude: 38.4872, longitude: 106.2309 },
  '乌鲁木齐市': { latitude: 43.8256, longitude: 87.6168 },
  '香港特别行政区': { latitude: 22.3193, longitude: 114.1694 },
  '澳门特别行政区': { latitude: 22.1987, longitude: 113.5439 },
  '台北市': { latitude: 25.0330, longitude: 121.5654 }
}

var cachedGroups = null
var cachedFlatCities = null

function trimValue(value) {
  return String(value || '').trim()
}

function normalizeCityName(name) {
  var text = trimValue(name).replace(/\s+/g, '')
  if (!text) return ''

  if (text === '香港') return '香港特别行政区'
  if (text === '澳门') return '澳门特别行政区'
  if (text === '台湾' || text === '台北') return '台北市'

  if (/特别行政区$/.test(text)
    || /自治州$/.test(text)
    || /地区$/.test(text)
    || /盟$/.test(text)
    || /市$/.test(text)
    || /县$/.test(text)) {
    return text
  }

  return text + '市'
}

function stripCitySuffix(name) {
  return normalizeCityName(name)
    .replace(/特别行政区$/, '')
    .replace(/自治州$/, '')
    .replace(/地区$/, '')
    .replace(/盟$/, '')
    .replace(/市$/, '')
}

function getProvinceNameFromCode(code) {
  return PROVINCE_NAME_MAP[String(code || '').slice(0, 2)] || ''
}

function getCoordinate(name, province) {
  var normalized = normalizeCityName(name)
  var direct = CITY_COORDINATE_MAP[normalized]
  if (direct) return direct

  var fallbackCity = PROVINCE_FALLBACK_CITY_MAP[trimValue(province)]
  return fallbackCity ? CITY_COORDINATE_MAP[fallbackCity] || null : null
}

function buildSearchText(city) {
  return [
    city.name,
    city.rawName,
    city.shortName,
    city.province,
    stripCitySuffix(city.province)
  ].filter(Boolean).join('|').toLowerCase()
}

function buildCityRecord(initial, item) {
  var province = getProvinceNameFromCode(item && item.id)
  var name = normalizeCityName(item && item.name)
  var coord = getCoordinate(name, province) || {}

  var city = {
    code: String(item && item.id || ''),
    id: String(item && item.id || ''),
    initial: initial,
    rawName: trimValue(item && item.name),
    name: name,
    shortName: stripCitySuffix(name),
    province: province,
    hot: HOT_CITY_NAMES.indexOf(name) >= 0,
    latitude: Number(coord.latitude) || 0,
    longitude: Number(coord.longitude) || 0
  }

  city.searchText = buildSearchText(city)
  return city
}

function getCityGroups() {
  if (cachedGroups) {
    return cachedGroups
  }

  cachedGroups = Object.keys(chinaCityData || {}).sort().filter(function (initial) {
    return /^[A-Z]$/.test(initial)
  }).map(function (initial) {
    var list = Array.isArray(chinaCityData[initial]) ? chinaCityData[initial] : []
    return {
      initial: initial,
      cities: list.map(function (item) {
        return buildCityRecord(initial, item)
      })
    }
  }).filter(function (group) {
    return group.cities.length > 0
  })

  return cachedGroups
}

function getAllCities() {
  if (cachedFlatCities) {
    return cachedFlatCities
  }

  cachedFlatCities = []
  getCityGroups().forEach(function (group) {
    group.cities.forEach(function (city) {
      cachedFlatCities.push(city)
    })
  })
  return cachedFlatCities
}

function cloneCity(city) {
  return city ? Object.assign({}, city) : null
}

function getHotCities() {
  return HOT_CITY_NAMES.map(function (name) {
    return findCityByName(name)
  }).filter(Boolean)
}

function findCityByName(name) {
  var normalized = normalizeCityName(name)
  var shortName = stripCitySuffix(normalized)

  var match = getAllCities().find(function (city) {
    return city.name === normalized
      || city.rawName === trimValue(name)
      || city.shortName === shortName
  })

  return cloneCity(match)
}

function findCityByCode(code) {
  var match = getAllCities().find(function (city) {
    return String(city.code) === String(code)
  })
  return cloneCity(match)
}

function searchCities(keyword, limit) {
  var normalizedKeyword = trimValue(keyword).toLowerCase()
  if (!normalizedKeyword) {
    return []
  }

  var normalizedName = normalizeCityName(keyword)
  var shortName = stripCitySuffix(normalizedName)
  var maxCount = Number(limit) || 20

  return getAllCities().filter(function (city) {
    return city.searchText.indexOf(normalizedKeyword) >= 0
      || city.name.indexOf(normalizedName) >= 0
      || city.shortName.indexOf(shortName) >= 0
  }).slice(0, maxCount).map(cloneCity)
}

function calculateDistanceScore(latitudeA, longitudeA, latitudeB, longitudeB) {
  var latDiff = Number(latitudeA) - Number(latitudeB)
  var lonDiff = Number(longitudeA) - Number(longitudeB)
  return latDiff * latDiff + lonDiff * lonDiff
}

function findNearestCity(latitude, longitude) {
  latitude = Number(latitude)
  longitude = Number(longitude)
  if (!latitude || !longitude) {
    return null
  }

  var nearest = null
  var nearestScore = Number.MAX_VALUE

  getAllCities().forEach(function (city) {
    if (!city.latitude || !city.longitude) return
    var score = calculateDistanceScore(latitude, longitude, city.latitude, city.longitude)
    if (score < nearestScore) {
      nearest = city
      nearestScore = score
    }
  })

  return cloneCity(nearest)
}

function getDefaultCity() {
  return findCityByName('长沙市') || {
    code: '430100',
    id: '430100',
    initial: 'C',
    rawName: '长沙',
    name: '长沙市',
    shortName: '长沙',
    province: '湖南省',
    hot: true,
    latitude: 28.2282,
    longitude: 112.9388,
    searchText: '长沙市|长沙|湖南省|湖南'
  }
}

function saveCurrentCity(city) {
  if (!city || typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') return
  try {
    wx.setStorageSync(STORAGE_KEY, {
      code: city.code,
      name: city.name,
      province: city.province,
      latitude: city.latitude,
      longitude: city.longitude,
      shortName: city.shortName,
      hot: !!city.hot
    })
  } catch (error) {
  }
}

function loadCurrentCity() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return null

  try {
    var cached = wx.getStorageSync(STORAGE_KEY)
    if (!cached) return null
    return findCityByCode(cached.code) || findCityByName(cached.name) || cloneCity(cached)
  } catch (error) {
    return null
  }
}

module.exports = {
  normalizeCityName: normalizeCityName,
  stripCitySuffix: stripCitySuffix,
  getCityGroups: getCityGroups,
  getAllCities: getAllCities,
  getHotCities: getHotCities,
  getDefaultCity: getDefaultCity,
  findCityByName: findCityByName,
  findCityByCode: findCityByCode,
  findNearestCity: findNearestCity,
  searchCities: searchCities,
  saveCurrentCity: saveCurrentCity,
  loadCurrentCity: loadCurrentCity
}