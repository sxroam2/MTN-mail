var supportVideoUtil = require('../../../../utils/support-video.js')

Page({
  data: {
    loading: true,
    currentVideo: null,
    currentVideoUrl: '',
    currentDuration: '',
    currentCategory: '',
    currentModel: '',
    relatedVideos: [],
    emptyMessage: ''
  },

  buildRelatedVideoCards: function (videoItems) {
    return (videoItems || []).map(function (item) {
      var displayCoverUrl = String(item && (item.coverUrl || item.imageUrl || item.imageUrlMobile || item.iconUrl) || '').trim()
      var displayDescription = String(item && item.description || '').trim()

      return Object.assign({}, item, {
        displayCoverUrl: displayCoverUrl,
        displayDescription: displayDescription
      })
    })
  },

  buildShareOptions: function () {
    var currentVideo = this.data.currentVideo || {}
    var videoKey = String(currentVideo.itemKey || this.currentVideoKey || '').trim()
    var path = '/pages/shop/demo-video/detail/index'

    if (videoKey) {
      path += '?video=' + encodeURIComponent(videoKey)
    }

    return {
      title: currentVideo.title || '迈瑟伦演示视频',
      path: path,
      imageUrl: String(currentVideo.coverUrl || currentVideo.imageUrl || currentVideo.imageUrlMobile || '').trim()
    }
  },

  onLoad: function (options) {
    this.allVideoCards = []
    this.currentVideoKey = String(options.video || '').trim()
    this.loadPageContent(this.currentVideoKey)
  },

  loadPageContent: function (videoKey) {
    var that = this

    that.setData({ loading: true })

    supportVideoUtil.fetchSupportVideoPage('zh-cn').then(function (pageContent) {
      var sections = pageContent.sections || {}
      var categories = sections.categories || []
      var categoryTitleMap = supportVideoUtil.buildCategoryTitleMap(categories)

      that.allVideoCards = (sections.videos || []).map(function (item) {
        return supportVideoUtil.enrichSupportVideoItem(item, categoryTitleMap)
      }).filter(function (item) {
        return !!item.itemKey
      })

      that.applyCurrentVideo(videoKey || that.currentVideoKey)
    }).catch(function (error) {
      console.error('load support videos failed:', error)
      that.setData({
        loading: false,
        currentVideo: null,
        currentVideoUrl: '',
        currentDuration: '',
        currentCategory: '',
        currentModel: '',
        relatedVideos: [],
        emptyMessage: '演示视频加载失败'
      })

      wx.showToast({
        title: '视频加载失败',
        icon: 'none'
      })
    })
  },

  applyCurrentVideo: function (videoKey) {
    var nextVideoKey = String(videoKey || '').trim()

    if (!nextVideoKey && this.allVideoCards.length > 0) {
      nextVideoKey = this.allVideoCards[0].itemKey
    }

    this.currentVideoKey = nextVideoKey

    var currentVideo = supportVideoUtil.findVideoByKey(this.allVideoCards, nextVideoKey)
    if (!currentVideo) {
      this.setData({
        loading: false,
        currentVideo: null,
        currentVideoUrl: '',
        currentDuration: '',
        currentCategory: '',
        currentModel: '',
        relatedVideos: [],
        emptyMessage: '未找到对应视频'
      })
      return
    }

    var currentVideoUrl = supportVideoUtil.getPlayableVideoUrl(currentVideo)

    wx.setNavigationBarTitle({
      title: currentVideo.title || '视频详情'
    })

    this.setData({
      loading: false,
      currentVideo: currentVideo,
      currentVideoUrl: currentVideoUrl,
      currentDuration: currentVideo.duration || '',
      currentCategory: currentVideo.categoryTitle || '',
      currentModel: currentVideo.model || '',
      relatedVideos: this.buildRelatedVideoCards(supportVideoUtil.buildRelatedVideos(this.allVideoCards, currentVideo)),
      emptyMessage: currentVideoUrl ? '' : '当前视频未配置可播放地址'
    })
  },

  onSelectVideo: function (event) {
    var videoKey = event.currentTarget.dataset.key
    if (!videoKey || videoKey === this.currentVideoKey) {
      return
    }

    this.applyCurrentVideo(videoKey)
  },

  onRetry: function () {
    this.loadPageContent(this.currentVideoKey)
  },

  onBack: function () {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }

    wx.redirectTo({
      url: '/pages/shop/demo-video/index'
    })
  },

  onShareAppMessage: function () {
    return this.buildShareOptions()
  }
})