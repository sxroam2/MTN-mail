// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');
const imageUtil = require('../../utils/image.js');

const DEVTOOLS_MOCK_PHONE = '18570330244';
const DEFAULT_NICKNAME = '微信用户';
const PRODUCTION_API_BASE_URL = 'https://www.maxcellent-starter.com/api';

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
  var envVersion = getMiniProgramEnvVersion();
  var baseUrl = String(api.getBaseUrl() || '').trim().replace(/\/+$/, '').toLowerCase();
  if (platform === 'devtools') {
    return true;
  }

  if (envVersion === 'develop' || envVersion === 'trial') {
    return true;
  }

  return !!baseUrl && baseUrl !== PRODUCTION_API_BASE_URL;
}

function buildMockLoginTip(platform, enabled, envVersion) {
  if (!enabled) {
    return '';
  }

  if (platform === 'devtools') {
    return '开发者工具可用，不影响正式微信手机号登录';
  }

  if (envVersion === 'develop') {
    return '当前为开发版真机预览，已开启模拟登录，不影响正式微信手机号登录';
  }

  if (envVersion === 'trial') {
    return '当前为体验版真机预览，已开启模拟登录，不影响正式微信手机号登录';
  }

  return '当前为调试接口环境，真机预览也可用，不影响正式微信手机号登录';
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
    tip: buildMockLoginTip(platform, enabled, envVersion)
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
        that.setData({
          isLoggedIn: false,
          userPhone: '',
          maskedUserPhone: ''
        });
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
        that.setData({
          isLoggedIn: false,
          userPhone: '',
          maskedUserPhone: ''
        });
        that.resetBluetoothDebugMenu();
        return null;
      }

      that.setData({
        showBluetoothDebugMenu: !!(payload && payload.hasAccess)
      });
      return payload || null;
    }).catch(function () {
      if (!api.isLoggedIn()) {
        that.setData({
          isLoggedIn: false,
          userPhone: '',
          maskedUserPhone: ''
        });
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
      return text;
    }

    if (/appid privacy api banned|未采集隐私/i.test(text)) {
      return '当前小程序版本在微信平台侧被禁用了手机号隐私接口。请核对提审时是否误选“未采集隐私”，修正后重新上传版本再试。';
    }

    if (/api scope is not declared in the privacy agreement|privacy agreement/i.test(text)) {
      return '小程序后台“用户隐私保护指引”里的手机号声明尚未生效或未正确配置。微信官方说明此类隐私声明变更通常约 5 分钟后生效，请稍后重试；若仍失败，请删除微信最近使用中的小程序后重新进入。';
    }

    if (/微信手机号授权校验未通过/.test(text)) {
      return text;
    }

    if (/HTTP\s*412|授权校验未通过/.test(text)) {
      if (this.data.privacyNeedAuthorization) {
        return '当前微信侧仍要求先完成隐私授权，请点击登录按钮重新同意隐私指引后再试。';
      }

      return '微信前端已成功返回手机号授权凭证，但微信平台未放行当前版本的手机号换号权限。请优先检查当前开发版/体验版在微信后台的“收集手机号”隐私声明和手机号接口权限状态；若刚修改过配置，请等待约 5 分钟后删除微信最近使用中的小程序，再重新进入真机重试。';
    }

    if (/40029|invalid code/i.test(text)) {
      return '微信手机号授权已失效，请重新点击登录。';
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
      wx.showToast({ title: '已取消手机号授权', icon: 'none' });
      return;
    }

    if (/privacy/i.test(errMsg)) {
      wx.showModal({
        title: '需要隐私授权',
        content: '请先同意微信隐私保护指引后，再使用手机号登录。',
        confirmText: '查看指引',
        success: function (res) {
          if (res.confirm && typeof wx.openPrivacyContract === 'function') {
            wx.openPrivacyContract({});
          }
        }
      });
      return;
    }

    wx.showToast({ title: '手机号授权失败，请重试', icon: 'none' });
  },

  onAgreePrivacyAuthorization() {
    this.refreshPrivacySetting();
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
    api.clearToken();
    wx.removeStorageSync('userPhone');
    this.setData({
      isLoggedIn: false,
      userPhone: '',
      maskedUserPhone: '',
      showUserDialog: false,
      profileSyncPending: false,
      showBluetoothDebugMenu: false
    });
    wx.showToast({ title: '已退出登录', icon: 'success' });
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
          that.setData({
            isLoggedIn: false,
            userPhone: '',
            maskedUserPhone: ''
          });
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

  // 商城快捷入口
  goToCart() {
    if (!api.isLoggedIn()) {
      wx.showToast({ title: '请先在个人中心登录', icon: 'none' });
      return;
    }
    wx.switchTab({ url: '/pages/shop/cart/index' });
  },

  goToOrders() {
    if (!api.isLoggedIn()) {
      wx.showToast({ title: '请先在个人中心登录', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/shop/order-list/index' });
  },

  goToAddress() {
    if (!api.isLoggedIn()) {
      wx.showToast({ title: '请先在个人中心登录', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/shop/address/index' });
  },

  goToDemoVideo() {
    wx.navigateTo({ url: '/pages/shop/demo-video/index' });
  },

  goToBluetoothDebug() {
    if (!api.isLoggedIn()) {
      wx.showToast({ title: '请先在个人中心登录', icon: 'none' });
      return;
    }

    if (!this.data.showBluetoothDebugMenu) {
      wx.showToast({ title: '当前账号未开启蓝牙调试权限', icon: 'none' });
      return;
    }

    wx.navigateTo({ url: '/pages/debug/debug' });
  },
});