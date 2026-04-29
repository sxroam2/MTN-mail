var supportVideoUtil = require('../../../utils/support-video.js')

Page({
	data: {
		loading: true,
		pageTitle: '演示视频',
		pageDescription: '',
		activeCategory: 'all',
		searchKeyword: '',
		layoutMode: 'double',
		categoryTabs: [
			{ itemKey: 'all', title: '全部' }
		],
		videoCards: []
	},

	onLoad: function () {
		this.allVideoCards = []
		this.loadPageContent()
	},

	loadPageContent: function () {
		var that = this

		that.setData({ loading: true })

		supportVideoUtil.fetchSupportVideoPage('zh-cn').then(function (pageContent) {
			var sections = pageContent.sections || {}
			var hero = sections.hero && sections.hero[0] ? sections.hero[0] : {}
			var categories = sections.categories || []
			var categoryTitleMap = supportVideoUtil.buildCategoryTitleMap(categories)
			var allVideos = (sections.videos || []).map(function (item) {
				return supportVideoUtil.enrichSupportVideoItem(item, categoryTitleMap)
			}).filter(function (item) {
				return !!item.itemKey
			})

			that.allVideoCards = allVideos

			that.setData({
				pageTitle: hero.title || '演示视频',
				pageDescription: hero.description || '',
				categoryTabs: [{ itemKey: 'all', title: '全部' }].concat(categories.map(function (item) {
					return {
						itemKey: item.itemKey,
						title: item.title || item.itemKey
					}
				})),
				activeCategory: 'all',
				searchKeyword: ''
			})

			wx.setNavigationBarTitle({
				title: hero.title || '演示视频'
			})

			that.applyFilters({
				categoryKey: 'all',
				keyword: ''
			})
			that.setData({ loading: false })
		}).catch(function (error) {
			console.error('load support videos failed:', error)
			that.allVideoCards = []
			that.setData({
				loading: false,
				pageTitle: '演示视频',
				pageDescription: '',
				activeCategory: 'all',
				searchKeyword: '',
				categoryTabs: [{ itemKey: 'all', title: '全部' }],
				videoCards: []
			})

			wx.showToast({
				title: '演示视频加载失败',
				icon: 'none'
			})
		})
	},

	onCategoryTap: function (event) {
		var categoryKey = event.currentTarget.dataset.key || 'all'
		if (categoryKey === this.data.activeCategory) {
			return
		}

		this.applyFilters({ categoryKey: categoryKey })
	},

	onSearchInput: function (event) {
		var keyword = event.detail && event.detail.value ? event.detail.value : ''
		this.applyFilters({ keyword: keyword })
	},

	onSearchClear: function () {
		if (!this.data.searchKeyword) {
			return
		}

		this.applyFilters({ keyword: '' })
	},

	onLayoutChange: function () {
		this.setData({
			layoutMode: this.data.layoutMode === 'double' ? 'single' : 'double'
		})
	},

	applyFilters: function (options) {
		var activeCategory = options && options.categoryKey !== undefined
			? String(options.categoryKey || 'all')
			: this.data.activeCategory || 'all'
		var searchKeyword = options && options.keyword !== undefined
			? String(options.keyword || '')
			: this.data.searchKeyword || ''
		var normalizedKeyword = searchKeyword.trim().toLowerCase()
		var nextVideoCards = this.allVideoCards.filter(function (item) {
			var matchesCategory = activeCategory === 'all' || item.category === activeCategory
			if (!matchesCategory) {
				return false
			}

			if (!normalizedKeyword) {
				return true
			}

			var title = String(item.title || '').toLowerCase()
			var model = String(item.model || '').toLowerCase()
			return title.indexOf(normalizedKeyword) !== -1 || model.indexOf(normalizedKeyword) !== -1
		})

		this.setData({
			activeCategory: activeCategory,
			searchKeyword: searchKeyword,
			videoCards: nextVideoCards
		})
	},

	openVideoDetail: function (event) {
		var videoKey = event.currentTarget.dataset.key
		if (!videoKey) {
			return
		}

		wx.navigateTo({
			url: '/pages/shop/demo-video/detail/index?video=' + encodeURIComponent(videoKey)
		})
	}
})