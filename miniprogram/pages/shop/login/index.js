var api = require('../../../utils/api.js')

Page({
  data: {
    phone: '',
    code: '',
    countdown: 0,
    sending: false,
    submitting: false
  },

  _timer: null,

  onUnload: function () {
    if (this._timer) clearInterval(this._timer)
  },

  onPhoneInput: function (e) {
    this.setData({ phone: e.detail })
  },

  onCodeInput: function (e) {
    this.setData({ code: e.detail })
  },

  sendCode: function () {
    var that = this
    var phone = that.data.phone.trim()
    if (!phone || phone.length < 5) {
      wx.showToast({ title: '请输入手机号/邮箱', icon: 'none' })
      return
    }
    that.setData({ sending: true })
    api.post('/api/auth/send-code', {
      account: phone,
      type: 'login'
    }).then(function () {
      wx.showToast({ title: '验证码已发送', icon: 'success' })
      that.startCountdown()
    }).catch(function () {
      // error already shown by api.js
    }).finally(function () {
      that.setData({ sending: false })
    })
  },

  startCountdown: function () {
    var that = this
    that.setData({ countdown: 60 })
    if (that._timer) clearInterval(that._timer)
    that._timer = setInterval(function () {
      if (that.data.countdown <= 1) {
        clearInterval(that._timer)
        that.setData({ countdown: 0 })
        return
      }
      that.setData({ countdown: that.data.countdown - 1 })
    }, 1000)
  },

  login: function () {
    var that = this
    var phone = that.data.phone.trim()
    var code = that.data.code.trim()
    if (!phone) {
      wx.showToast({ title: '请输入手机号/邮箱', icon: 'none' })
      return
    }
    if (!code) {
      wx.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }
    that.setData({ submitting: true })
    api.post('/api/auth/login-by-code', {
      account: phone,
      code: code
    }).then(function (res) {
      var token = res.data || res
      api.setToken(token)
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 1000)
    }).catch(function () {
      // error already shown by api.js
    }).finally(function () {
      that.setData({ submitting: false })
    })
  }
})
