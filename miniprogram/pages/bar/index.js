// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');
const imageUtil = require('../../utils/image.js');

const DEVTOOLS_MOCK_PHONE = '18570330244';
const DEFAULT_NICKNAME = '微信用户';

function normalizeNickname(value) {
  const nickname = String(value || '').trim();
  return nickname || DEFAULT_NICKNAME;
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  const digits = phone.replace(/\D/g, '');

  if (digits.length >= 11) {
    return digits.slice(0, 3) + '****' + digits.slice(-4);
  }

  if (phone.length > 7) {
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }

  return phone;
}

function resolveAvatarUrl(value) {
  const avatarUrl = String(value || '').trim();

  if (!avatarUrl) {
    return '';
  }

  if (/^(data:|blob:|wxfile:)/i.test(avatarUrl)) {
    return avatarUrl;
  }

  if (/^https?:\/\//i.test(avatarUrl)) {
    const absolutePath = avatarUrl.replace(/^https?:\/\/[^/]+/i, '');
    if (!/^\/(api\/|uploads\/)/i.test(absolutePath)) {
      return avatarUrl;
    }
  }

  return imageUtil.resolveImageUrl(avatarUrl);
}

function getMiniProgramEnvVersion() {
  try {
    if (typeof wx.getAccountInfoSync !== 'function') {
      return '';
    }

    var accountInfo = wx.getAccountInfoSync();
    return String(accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion || '').trim();
  } catch (error) {
    return '';
  }
}

function isMockLoginEnabled(platform) {
  return platform === 'devtools';
}

function buildMockLoginTip(platform, enabled) {
  if (!enabled) {
    return '';
  }

  if (platform === 'devtools') {
    return '开发者工具可用，不影响正式微信手机号登录';
  }

  return '';
}

function summarizePhoneCredential(code) {
  var text = String(code || '').trim();
  if (!text) {
    return '';
  }

  if (text.length <= 12) {
    return text;
  }

  return text.slice(0, 6) + '...' + text.slice(-4) + '(' + text.length + ')';
}

function extractWxPhoneDiagnosis(message) {
  var match = String(message || '').match(/诊断号\s*[:：]\s*(WXP-[A-Z0-9]+)/i);
  return match ? match[1].toUpperCase() : '';
}

function getMockLoginState(platform) {
  var envVersion = getMiniProgramEnvVersion();
  var enabled = isMockLoginEnabled(platform);

  return {
    envVersion: envVersion,
    enabled: enabled,
    tip: buildMockLoginTip(platform, enabled)
  };
}

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    tempNickname: '',
    showUserDialog: false,
    currentYear: new Date().getFullYear(),
    phone: app.globalData.customerPhone,
    email: app.globalData.officialEmail,
    version: app.globalData.version,
    isLoggedIn: false,
    userPhone: '',
    maskedUserPhone: '',
    phoneLoginPending: false,
    profileSyncPending: false,
    privacyNeedAuthorization: false,
    privacyContractName: '《用户隐私保护指引》',
    isDevtools: false,
    miniProgramEnvVersion: '',
    isMockLoginAvailable: false,
    showBluetoothDebugMenu: false,
    mockPhoneNumber: DEVTOOLS_MOCK_PHONE,
    mockLoginTip: ''
  },

  onLoad() {
    const platform = wx.getSystemInfoSync().platform;
    const mockLoginState = getMockLoginState(platform);

    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#0a0a0a'
    });

    // 从缓存中读取头像和昵称
    const avatarUrl = resolveAvatarUrl(wx.getStorageSync('userAvatar'));
    const nickname = normalizeNickname(wx.getStorageSync('userNickname'));

    this.setData({
      avatarUrl: avatarUrl || '',
      nickname: nickname,
      tempNickname: nickname,
      isDevtools: platform === 'devtools',
      miniProgramEnvVersion: mockLoginState.envVersion,
      isMockLoginAvailable: mockLoginState.enabled,
      mockLoginTip: mockLoginState.tip
    });

    this.refreshPrivacySetting();
  },

  onShow() {
    // 每次显示页面时刷新登录状态
    const isLoggedIn = api.isLoggedIn();
    const platform = wx.getSystemInfoSync().platform;
    const mockLoginState = getMockLoginState(platform);

    const storedPhone = wx.getStorageSync('userPhone') || '';

    this.setData({
      isLoggedIn: isLoggedIn,
      userPhone: storedPhone,
      maskedUserPhone: maskPhone(storedPhone),
      miniProgramEnvVersion: mockLoginState.envVersion,
      isMockLoginAvailable: mockLoginState.enabled,
      mockLoginTip: mockLoginState.tip
    });
    this.refreshPrivacySetting();
    api.updateCartBadge();

    if (isLoggedIn) {
      this.loadBluetoothDebugMenu();
      this.syncProfileFromServer();
    } else {
      this.resetBluetoothDebugMenu();
    }

    this.scrollToTopOnLoginEntry();
  },

  scrollToTopOnLoginEntry() {
    if (!api.consumeLoginPageScrollTop()) {
      return;
    }

    setTimeout(function () {
      if (typeof wx.pageScrollTo !== 'function') {
        return;
      }

      wx.pageScrollTo({
        scrollTop: 0,
        duration: 0,
        fail: function () {}
      });
    }, 0);
  },

  refreshPrivacySetting() {
    if (typeof wx.getPrivacySetting !== 'function') {
      this.setData({
        privacyNeedAuthorization: false,
        privacyContractName: '《用户隐私保护指引》'
      });
      return;
    }

    const that = this;
    wx.getPrivacySetting({
      success(res) {
        that.setData({
          privacyNeedAuthorization: !!res.needAuthorization,
          privacyContractName: res.privacyContractName || '《用户隐私保护指引》'
        });
      },
      fail() {
        that.setData({
          privacyNeedAuthorization: false,
          privacyContractName: '《用户隐私保护指引》'
        });
      }
    });
  },

  applyProfileData(profile) {
    if (!profile) {
      return;
    }

    const nickname = normalizeNickname(profile.nickname);
    const avatarUrl = resolveAvatarUrl(profile.avatarUrl);
    const userPhone = String(profile.phone || '').trim();

    wx.setStorageSync('userNickname', nickname);
    if (avatarUrl) {
      wx.setStorageSync('userAvatar', avatarUrl);
    } else {
      wx.removeStorageSync('userAvatar');
    }

    if (userPhone) {
      wx.setStorageSync('userPhone', userPhone);
    }

    this.setData({
      nickname: nickname,
      tempNickname: nickname,
      avatarUrl: avatarUrl,
      userPhone: userPhone || this.data.userPhone,
      maskedUserPhone: maskPhone(userPhone || this.data.userPhone)
    });
  },

  resetLocalProfileState() {
    wx.removeStorageSync('userPhone');
    wx.removeStorageSync('userNickname');
    wx.removeStorageSync('userAvatar');

    this.setData({
      isLoggedIn: false,
      userPhone: '',
      maskedUserPhone: '',
      nickname: DEFAULT_NICKNAME,
      tempNickname: DEFAULT_NICKNAME,
      avatarUrl: '',
      showUserDialog: false,
      profileSyncPending: false,
      phoneLoginPending: false,
      showBluetoothDebugMenu: false
    });
  },

  syncProfileFromServer() {
    const that = this;

    if (!api.isLoggedIn()) {
      return Promise.resolve(null);
    }

    return api.get('/api/users/profile', { showError: false }).then(function (res) {
      const profile = res && res.data ? res.data : res;
      if (profile) {
        that.applyProfileData(profile);
      }
      return profile || null;
    }).catch(function () {
      if (!api.isLoggedIn()) {
        that.resetLocalProfileState();
        that.resetBluetoothDebugMenu();
      }
      return null;
    });
  },

  resetBluetoothDebugMenu() {
    this.setData({
      showBluetoothDebugMenu: false
    });
  },

  loadBluetoothDebugMenu() {
    const that = this;
    const appInstance = getApp();

    if (!api.isLoggedIn() || !appInstance || typeof appInstance.loadBluetoothDebugAccess !== 'function') {
      that.resetBluetoothDebugMenu();
      return Promise.resolve(null);
    }

    return appInstance.loadBluetoothDebugAccess().then(function (payload) {
      if (!api.isLoggedIn()) {
        that.resetLocalProfileState();
        that.resetBluetoothDebugMenu();
        return null;
      }

      that.setData({
        showBluetoothDebugMenu: !!(payload && payload.hasAccess)
      });
      return payload || null;
    }).catch(function () {
      if (!api.isLoggedIn()) {
        that.resetLocalProfileState();
      }
      that.resetBluetoothDebugMenu();
      return null;
    });
  },

  showProfileSyncError(error, fallbackTitle) {
    const message = String((error && error.message) || fallbackTitle || '同步失败').trim();

    if (message.length > 18) {
      wx.showModal({
        title: fallbackTitle || '同步失败',
        content: message,
        showCancel: false
      });
      return;
    }

    wx.showToast({
      title: message,
      icon: 'none'
    });
  },

  applyLoginSuccess(loginData) {
    api.setToken(loginData.token);
    wx.setStorageSync('userPhone', loginData.phone || '');
    this.applyProfileData({
      nickname: loginData.nickname || this.data.nickname,
      avatarUrl: loginData.avatarUrl || this.data.avatarUrl,
      phone: loginData.phone || this.data.userPhone
    });
    this.setData({
      isLoggedIn: true,
      userPhone: loginData.phone || this.data.userPhone,
      maskedUserPhone: maskPhone(loginData.phone || this.data.userPhone)
    });
    api.updateCartBadge();
    this.loadBluetoothDebugMenu();
    this.syncProfileFromServer();
    wx.showToast({ title: '登录成功', icon: 'success' });
  },

  showLoginError(message, appendDevtoolsTip) {
    var text = message || '登录失败';
    if (appendDevtoolsTip && this.data.isDevtools) {
      text += '，开发者工具里请优先用真机预览重试';
    }
    if (text.length > 18) {
      wx.showModal({
        title: '登录失败',
        content: text,
        showCancel: false
      });
    } else {
      wx.showToast({ title: text, icon: 'none' });
    }
  },

  hideLoginLoading() {
    wx.hideLoading();
    this.setData({ phoneLoginPending: false });
  },

  normalizePhoneLoginError(message) {
    var text = String(message || '').trim();
    if (!text) {
      return '登录失败';
    }

    if (/诊断号\s*[:：]/.test(text)) {
      return '当前微信登录暂时不可用，请稍后再试，如多次失败请联系客服处理。';
    }

    if (/appid privacy api banned|未采集隐私/i.test(text)) {
      return '当前版本暂时无法使用手机号快捷登录，请稍后再试或联系客服处理。';
    }

    if (/api scope is not declared in the privacy agreement|privacy agreement/i.test(text)) {
      return '登录能力刚刚更新，通常几分钟内会恢复，请稍后再试。';
    }

    if (/微信手机号授权校验未通过/.test(text)) {
      return '微信手机号登录暂时不可用，请稍后重试。';
    }

    if (/HTTP\s*412|授权校验未通过/.test(text)) {
      if (this.data.privacyNeedAuthorization) {
        return '请先同意隐私指引，再点击手机号登录。';
      }

      return '当前微信登录还在同步，请稍后再试；如刚更新配置，稍等几分钟后重新进入小程序即可。';
    }

    if (/40029|invalid code/i.test(text)) {
      return '本次登录信息已失效，请重新点击登录。';
    }

    if (/privacy/i.test(text)) {
      return '请先同意微信隐私保护指引后，再使用手机号登录。';
    }

    if (/no permission|permission denied|auth deny|scope/i.test(text)) {
      return '当前微信账号未授予手机号权限，请重新授权后再试。';
    }

    return text;
  },

  handlePhoneNumberReject(detail) {
    var errMsg = String(detail && detail.errMsg || '').trim();
    if (/cancel/i.test(errMsg)) {
      wx.showToast({ title: '本次未登录，可稍后再试', icon: 'none' });
      return;
    }

    if (/privacy/i.test(errMsg)) {
      wx.showModal({
        title: '需要隐私授权',
        content: '先同意微信隐私保护指引，再完成手机号登录。',
        confirmText: '查看指引',
        success: function (res) {
          if (res.confirm && typeof wx.openPrivacyContract === 'function') {
            wx.openPrivacyContract({});
          }
        }
      });
      return;
    }

    wx.showToast({ title: '登录未完成，请再试一次', icon: 'none' });
  },

  onAgreePrivacyAuthorization(e) {
    var detail = e && e.detail ? e.detail : {};

    this.refreshPrivacySetting();

    if (detail.errMsg && detail.errMsg !== 'agreePrivacyAuthorization:ok') {
      if (/cancel/i.test(detail.errMsg)) {
        wx.showToast({ title: '已取消隐私授权', icon: 'none' });
        return;
      }

      wx.showToast({ title: '隐私授权失败，请重试', icon: 'none' });
      return;
    }

    wx.showToast({ title: '已同意隐私指引，请继续完成登录', icon: 'none' });
  },

  // 获取微信手机号登录
  onGetPhoneNumber(e) {
    var detail = e && e.detail ? e.detail : {};

    console.log('[wx-phone-login] getPhoneNumber callback:', {
      errcode: detail.errno,
      errno: detail.errno,
      errmsg: detail.errMsg || '',
      codeHint: summarizePhoneCredential(detail.code),
      privacyNeedAuthorization: this.data.privacyNeedAuthorization,
      envVersion: this.data.miniProgramEnvVersion || '',
      isDevtools: this.data.isDevtools
    });

    if (this.data.phoneLoginPending) {
      return;
    }

    if (detail.errMsg !== 'getPhoneNumber:ok') {
      console.error('[wx-phone-login] getPhoneNumber rejected:', {
        errcode: detail.errno,
        errno: detail.errno,
        errmsg: detail.errMsg || '',
        detail: detail
      });
      this.handlePhoneNumberReject(detail);
      return;
    }

    const code = detail.code;
    if (!code) {
      console.error('[wx-phone-login] getPhoneNumber missing code:', {
        errcode: detail.errno,
        errno: detail.errno,
        errmsg: detail.errMsg || '',
        detail: detail
      });
      this.showLoginError('微信未返回可用手机号凭证，请退出小程序后重新进入，再在真机里重试。', true);
      return;
    }

    const that = this;
    const nickname = that.data.nickname !== '微信用户' ? that.data.nickname : '';
    const avatarUrl = that.data.avatarUrl || '';
    that.setData({ phoneLoginPending: true });
    wx.showLoading({ title: '登录中...' });
    api.post('/api/auth/wx-phone-login', {
      code: code,
      nickname: nickname,
      avatarUrl: avatarUrl
    }).then(function (res) {
      that.hideLoginLoading();
      if (res && res.code === 200 && res.data && res.data.token) {
        that.applyLoginSuccess(res.data);
      } else {
        console.error('[wx-phone-login] backend business fail:', {
          responseCode: res && res.code,
          message: (res && res.message) || '',
          diagnosis: extractWxPhoneDiagnosis((res && res.message) || ''),
          response: res
        });
        that.showLoginError(that.normalizePhoneLoginError((res && res.message) || '登录失败'), true);
      }
    }).catch(function (err) {
      that.hideLoginLoading();
      console.error('[wx-phone-login] backend request error:', {
        message: err && err.message || '',
        diagnosis: extractWxPhoneDiagnosis(err && err.message || ''),
        error: err
      });
      that.showLoginError(that.normalizePhoneLoginError(err.message || '登录失败'), true);
    });
  },

  onDevtoolsMockLogin() {
    if (!this.data.isMockLoginAvailable) {
      wx.showToast({ title: '当前环境未开启模拟登录', icon: 'none' });
      return;
    }

    const that = this;
    const nickname = that.data.nickname !== '微信用户' ? that.data.nickname : '微信开发者工具用户';
    const avatarUrl = that.data.avatarUrl || '';

    wx.showLoading({ title: '模拟登录中...' });
    api.post('/api/auth/devtools-mock-login', {
      phoneNumber: that.data.mockPhoneNumber,
      envVersion: that.data.miniProgramEnvVersion || '',
      nickname: nickname,
      avatarUrl: avatarUrl
    }).then(function (res) {
      wx.hideLoading();
      if (res && res.code === 200 && res.data && res.data.token) {
        that.applyLoginSuccess(res.data);
      } else {
        console.error('devtools-mock-login business fail:', res);
        that.showLoginError((res && res.message) || '模拟登录失败', false);
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('devtools-mock-login error:', err);
      that.showLoginError(err.message || '模拟登录失败', false);
    });
  },

  // 退出登录
  onLogout() {
    var that = this;

    if (!this.data.isLoggedIn) {
      return;
    }

    wx.showModal({
      title: '退出登录',
      content: '退出后可重新用微信手机号登录，购物车、订单和收货地址仍会保留在您的账号里。',
      confirmText: '退出登录',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (!res.confirm) {
          return;
        }

        api.clearToken();
        that.resetLocalProfileState();
        api.updateCartBadge();
        wx.showToast({ title: '已退出登录', icon: 'success' });
      }
    });
  },

  // 显示用户信息编辑弹窗
  showUserInfoDialog() {
    this.setData({
      tempNickname: this.data.nickname,
      showUserDialog: true
    });
  },

  // 关闭弹窗
  onDialogClose() {
    const trimmedNickname = String(this.data.tempNickname || '').trim();
    const nextNickname = trimmedNickname || this.data.nickname;

    if (this.data.profileSyncPending) {
      return;
    }

    if (!this.data.isLoggedIn || nextNickname === this.data.nickname) {
      this.setData({
        nickname: nextNickname,
        tempNickname: nextNickname,
        showUserDialog: false
      });
      wx.setStorageSync('userNickname', nextNickname);
      return;
    }

    const that = this;
    that.setData({ profileSyncPending: true });
    wx.showLoading({ title: '保存中...' });

    api.put('/api/users/profile', {
      nickname: nextNickname
    }, { showError: false }).then(function () {
      wx.hideLoading();
      that.setData({
        profileSyncPending: false,
        nickname: nextNickname,
        tempNickname: nextNickname,
        showUserDialog: false
      });
      wx.setStorageSync('userNickname', nextNickname);
      wx.showToast({
        title: '昵称已更新',
        icon: 'success'
      });
    }).catch(function (err) {
      wx.hideLoading();
      that.setData({
        profileSyncPending: false,
        tempNickname: nextNickname
      });
      that.showProfileSyncError(err, '昵称更新失败');
    });
  },

  // 昵称输入事件
  onNicknameInput(e) {
    this.setData({
      tempNickname: e.detail.value
    });
  },

  // 选择微信头像
  chooseAvatar(event) {
    console.log('选择头像', event);
    const avatarUrl = event.detail.avatarUrl;

    if (!avatarUrl || this.data.profileSyncPending) {
      return;
    }

    if (!this.data.isLoggedIn) {
      const nextAvatarUrl = resolveAvatarUrl(avatarUrl);

      this.setData({
        avatarUrl: nextAvatarUrl,
        showUserDialog: false
      });

      wx.setStorageSync('userAvatar', nextAvatarUrl);

      wx.showToast({
        title: '头像已更新',
        icon: 'success'
      });
      return;
    }

    const that = this;
    that.setData({ profileSyncPending: true });
    wx.showLoading({ title: '上传中...' });

    api.uploadFile('/api/users/profile/avatar', avatarUrl, 'file').then(function (res) {
      wx.hideLoading();

      const payload = res || {};
      const code = typeof payload.code === 'number'
        ? payload.code
        : typeof payload.Code === 'number'
          ? payload.Code
          : 200;
      const message = payload.message || payload.Message || '头像已更新';

      if (code !== 200) {
        if (code === 401) {
          api.clearToken();
          that.resetLocalProfileState();
          that.resetBluetoothDebugMenu();
        }

        that.setData({ profileSyncPending: false });
        that.showProfileSyncError({ message: message }, '头像更新失败');
        return;
      }

      const serverAvatarUrl = payload.data || payload.Data || avatarUrl;
      const nextAvatarUrl = resolveAvatarUrl(serverAvatarUrl);

      that.setData({
        profileSyncPending: false,
        avatarUrl: nextAvatarUrl,
        showUserDialog: false
      });

      wx.setStorageSync('userAvatar', nextAvatarUrl);

      wx.showToast({
        title: message,
        icon: 'success'
      });
    }).catch(function (err) {
      wx.hideLoading();
      that.setData({ profileSyncPending: false });
      that.showProfileSyncError(err, '头像更新失败');
    });
  },

  // 拨打电话
  makePhoneCall(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.makePhoneCall({
      phoneNumber: phone.replace(/-/g, ''),
      success: () => {
        console.log('拨打电话成功');
      },
      fail: (err) => {
        console.log('拨打电话失败', err);
        wx.showToast({
          title: '拨号失败',
          icon: 'none'
        });
      }
    });
  },

  // 复制邮箱
  copyEmail(e) {
    const email = e.currentTarget.dataset.email;
    wx.setClipboardData({
      data: email,
      success: () => {
        wx.showToast({
          title: '邮箱已复制',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },

  openCustomerService() {
    app.openCustomerServiceChat();
  },

  showLoginHint() {
    wx.showToast({ title: '请先点击上方登录', icon: 'none' });
  },

  // 商城快捷入口
  goToCart() {
    if (!api.isLoggedIn()) {
      this.showLoginHint();
      return;
    }
    wx.switchTab({ url: '/pages/shop/cart/index' });
  },

  goToOrders() {
    if (!api.isLoggedIn()) {
      this.showLoginHint();
      return;
    }
    wx.navigateTo({ url: '/pages/shop/order-list/index' });
  },

  goToAddress() {
    if (!api.isLoggedIn()) {
      this.showLoginHint();
      return;
    }
    wx.navigateTo({ url: '/pages/shop/address/index' });
  },

  goToDemoVideo() {
    wx.navigateTo({ url: '/pages/shop/demo-video/index' });
  },

  goToBluetoothDebug() {
    if (!api.requireLogin({
      message: '登录后可校验当前账号是否具备蓝牙调试权限。'
    })) {
      return;
    }

    if (!this.data.showBluetoothDebugMenu) {
      wx.showToast({ title: '当前账号未开启蓝牙调试权限', icon: 'none' });
      return;
    }

    wx.navigateTo({ url: '/pages/debug/debug' });
  },
});