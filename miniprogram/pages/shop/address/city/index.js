var cityHelper = require('../../../../utils/city-helper.js')

function trimValue(value) {
  return String(value || '').trim()
}

function toViewCity(city) {
  if (!city) return null

  return {
    code: city.code,
    name: city.name,
    province: city.province,
    initial: city.initial
  }
}

Page({
  data: {
    keyword: '',
    currentCity: null,
    hotCities: [],
    indexList: [],
    activeInitial: '',
    displayTitle: '城市列表',
    displayCities: [],
    selectedCityCode: ''
  },

  onLoad: function (options) {
    var that = this
    var currentCity = cityHelper.findCityByName(options.currentCity)
      || cityHelper.loadCurrentCity()
      || cityHelper.getDefaultCity()
    var selectedCity = cityHelper.findCityByName(options.selectedCity)
      || currentCity

    this.cityGroups = cityHelper.getCityGroups()
    this.cityGroupMap = {}
    this.filterTimer = null

    var indexList = []
    this.cityGroups.forEach(function (group) {
      var initial = trimValue(group && group.initial)
      if (!initial) return
      indexList.push(initial)
      that.cityGroupMap[initial] = Array.isArray(group.cities) ? group.cities : []
    })

    var activeInitial = trimValue(selectedCity && selectedCity.initial)
      || trimValue(currentCity && currentCity.initial)
      || indexList[0]
      || ''
    this.defaultInitial = activeInitial

    this.setData({
      currentCity: toViewCity(currentCity),
      hotCities: cityHelper.getHotCities().map(toViewCity),
      indexList: indexList,
      activeInitial: activeInitial,
      displayTitle: activeInitial ? (activeInitial + ' 开头城市') : '城市列表',
      displayCities: this.getDisplayCitiesByInitial(activeInitial),
      selectedCityCode: selectedCity && selectedCity.code || ''
    })
  },

  onUnload: function () {
    if (this.filterTimer) {
      clearTimeout(this.filterTimer)
      this.filterTimer = null
    }
  },

  onKeywordChange: function (e) {
    var keyword = trimValue(e.detail)
    this.setData({ keyword: keyword })
    this.scheduleFilter(keyword)
  },

  onKeywordClear: function () {
    if (this.filterTimer) {
      clearTimeout(this.filterTimer)
      this.filterTimer = null
    }
    this.setData({ keyword: '' })
    this.applyFilter('')
  },

  scheduleFilter: function (keyword) {
    var that = this
    if (this.filterTimer) {
      clearTimeout(this.filterTimer)
    }

    this.filterTimer = setTimeout(function () {
      that.applyFilter(keyword)
      that.filterTimer = null
    }, 120)
  },

  getDisplayCitiesByInitial: function (initial) {
    var list = this.cityGroupMap && this.cityGroupMap[trimValue(initial)]
    if (!Array.isArray(list) || !list.length) {
      return []
    }

    return list.map(toViewCity)
  },

  selectInitial: function (e) {
    var initial = trimValue(e.currentTarget.dataset.initial)
    if (!initial) return

    this.setData({ keyword: '' })
    this.applyInitial(initial)
  },

  applyInitial: function (initial) {
    var normalizedInitial = trimValue(initial) || this.defaultInitial || ''
    this.defaultInitial = normalizedInitial
    this.setData({
      activeInitial: normalizedInitial,
      displayTitle: normalizedInitial ? (normalizedInitial + ' 开头城市') : '城市列表',
      displayCities: this.getDisplayCitiesByInitial(normalizedInitial)
    })
  },

  applyFilter: function (keyword) {
    var normalizedKeyword = trimValue(keyword)
    if (!normalizedKeyword) {
      this.applyInitial(this.data.activeInitial || this.defaultInitial)
      return
    }

    var list = cityHelper.searchCities(normalizedKeyword, 60).map(toViewCity)
    this.setData({
      displayTitle: '搜索结果',
      displayCities: list
    })
  },

  selectCurrentCity: function () {
    if (!this.data.currentCity) return
    this.commitCity(this.data.currentCity)
  },

  selectCity: function (e) {
    var code = e.currentTarget.dataset.code
    var city = cityHelper.findCityByCode(code)
    if (!city) return
    this.commitCity(city)
  },

  commitCity: function (city) {
    cityHelper.saveCurrentCity(city)
    this.setData({ selectedCityCode: city.code })

    var pages = getCurrentPages()
    var prev = pages[pages.length - 2]
    if (prev) {
      prev._selectedCity = city
    }
    wx.navigateBack()
  }
})