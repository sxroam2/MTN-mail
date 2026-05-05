// app.js
const imageUtil = require('./utils/image.js');
const api = require('./utils/api.js');
const bluetoothProfileUtil = require('./utils/bluetooth-profile.js');

const BLUETOOTH_NAME_FILTERS_CACHE_KEY = 'miniapp_bluetooth_name_filters';
const BLUETOOTH_PROFILE_CONFIG_CACHE_KEY = 'miniapp_bluetooth_profile_configs_json';
const LEGACY_BLUETOOTH_DEVICE_IMAGE_MAP = {
  'rf-crazy': '/assets/x2800.png'
};

function resolveCustomerServiceErrorMessage(error) {
  const message = String(error && error.errMsg || '').trim();

  if (!message) {
    return '打开客服失败，请稍后重试';
  }

  if (/cancel/i.test(message)) {
    return '';
  }

  if (/openCustomerServiceChat/i.test(message) && /function/i.test(message)) {
    return '当前微信版本过低，请升级后重试';
  }

  if (/corpId|企业ID|主体|bind/i.test(message)) {
    return '请先在小程序后台完成企业微信客服绑定';
  }

  if (/url|链接/i.test(message)) {
    return '客服链接配置无效，请检查企业微信后台';
  }

  return '打开客服失败，请稍后重试';
}

App({
  globalData: {
    bluetoothConnected: false,
    connectedDevice: null,
    currentDevice: null,
    isBluetoothInitialized: false,
    customerPhone: "185-7033-0244",
    officialEmail: "1501726533@qq.com",
    version: "1.0.0",
    customerServiceCorpId: 'ww46c0a7fc276f53df',
    customerServiceUrl: 'https://work.weixin.qq.com/kfid/kfc2f8875453d05dab3',
    // 官网 API 地址：留空时使用 utils/api.js 的生产默认地址；本地联调再显式改为 http://localhost:8026/API
    apiBaseUrl: '',
    tencentMapKey: 'OJ3BZ-GMSLA-34GKK-C7LHC-YGE23-R2B7B',
    homeTitle: '迈瑟伦一体机',
    carouselData: [],
    carouselAutoPlay: true,
    carouselInterval: 3000,
    defaultDeviceImage: '/assets/default-device.png',
    bluetoothNameFilters: [],
    bluetoothProfileConfigsJson: '',
    bluetoothProfileConfig: bluetoothProfileUtil.parseBluetoothProfileConfig(''),
    bluetoothDebugAccess: false,
    bluetoothDebugUserPhone: ''
  },

  onLaunch() {
    api.setBaseUrl(this.globalData.apiBaseUrl);
    this.initBluetoothState();
    this.loadCachedBluetoothNameFilters();
    this.loadCachedBluetoothProfileConfig();
    this.loadHomeConfig();
  },

  onShow() {
    this.checkBluetoothOnShow();
  },

  initBluetoothState() {
    const savedDevice = wx.getStorageSync('current_connected_device');
    if (savedDevice) {
      this.globalData.connectedDevice = savedDevice;
      this.globalData.bluetoothConnected = false;
    }
    const currentDevice = wx.getStorageSync('current_device');
    if (currentDevice) {
      this.globalData.currentDevice = currentDevice;
    }
  },

  checkBluetoothOnShow() {
    if (this.globalData.connectedDevice && !this.globalData.bluetoothConnected) {
      console.log('有缓存的设备，但未连接');
    }
  },

  normalizeConnectedDevice(device) {
    if (!device || !device.deviceId) {
      return null;
    }

    const rawName = String(device.rawName || device.name || device.localName || '').trim();
    const displayName = rawName
      ? this.getBluetoothDeviceDisplayAlias(rawName)
      : '';

    return {
      ...device,
      name: rawName,
      rawName: rawName,
      displayName: displayName || rawName || '未知设备'
    };
  },

  getConnectedBluetoothDevices() {
    return new Promise((resolve) => {
      wx.getConnectedBluetoothDevices({
        services: [],
        success: (res) => {
          resolve({
            ok: true,
            devices: Array.isArray(res.devices) ? res.devices : []
          });
        },
        fail: () => {
          resolve({
            ok: false,
            devices: []
          });
        }
      });
    });
  },

  syncBluetoothConnectionState() {
    const cachedDevice = this.globalData.connectedDevice || wx.getStorageSync('current_connected_device');

    if (!cachedDevice || !cachedDevice.deviceId) {
      this.globalData.bluetoothConnected = false;
      return Promise.resolve({ isConnected: false, device: null });
    }

    return this.getConnectedBluetoothDevices().then(({ ok, devices }) => {
      if (!ok) {
        this.globalData.bluetoothConnected = false;
        return {
          isConnected: false,
          device: cachedDevice
        };
      }

      const matchedDevice = devices.find((item) => item.deviceId === cachedDevice.deviceId);
      if (matchedDevice) {
        const normalizedDevice = this.normalizeConnectedDevice({
          ...matchedDevice,
          ...cachedDevice,
          name: cachedDevice.rawName || cachedDevice.name || matchedDevice.localName || matchedDevice.name || ''
        });

        this.updateBluetoothConnection(normalizedDevice, true);
        return {
          isConnected: true,
          device: normalizedDevice
        };
      }

      this.globalData.bluetoothConnected = false;
      return {
        isConnected: false,
        device: cachedDevice
      };
    });
  },

  updateBluetoothConnection(device, isConnected) {
    const normalizedDevice = isConnected ? this.normalizeConnectedDevice(device) : null;

    this.globalData.bluetoothConnected = isConnected;
    this.globalData.connectedDevice = isConnected ? normalizedDevice : null;
    if (isConnected && normalizedDevice) {
      wx.setStorageSync('current_connected_device', normalizedDevice);
    } else {
      wx.removeStorageSync('current_connected_device');
    }
    
    const pages = getCurrentPages();
    pages.forEach(page => {
      if (page.route === 'pages/home/home' && page.loadConnectedDevices) {
        page.loadConnectedDevices();
      }
    });
  },

  loadCachedBluetoothNameFilters() {
    const cachedValue = wx.getStorageSync(BLUETOOTH_NAME_FILTERS_CACHE_KEY);
    this.updateBluetoothNameFilters(cachedValue);
  },

  updateBluetoothNameFilters(rawValue) {
    const rawText = String(rawValue || '');
    const filters = rawText
      .split(/[\r\n,，;；]+/)
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);

    this.globalData.bluetoothNameFilters = filters;

    if (rawText) {
      wx.setStorageSync(BLUETOOTH_NAME_FILTERS_CACHE_KEY, rawText);
    } else {
      wx.removeStorageSync(BLUETOOTH_NAME_FILTERS_CACHE_KEY);
    }
  },

  loadCachedBluetoothProfileConfig() {
    const cachedValue = wx.getStorageSync(BLUETOOTH_PROFILE_CONFIG_CACHE_KEY);
    this.updateBluetoothProfileConfig(cachedValue);
  },

  updateBluetoothProfileConfig(rawValue) {
    const rawText = String(rawValue || '').trim();
    this.globalData.bluetoothProfileConfigsJson = rawText;
    this.globalData.bluetoothProfileConfig = bluetoothProfileUtil.parseBluetoothProfileConfig(rawText);

    if (rawText) {
      wx.setStorageSync(BLUETOOTH_PROFILE_CONFIG_CACHE_KEY, rawText);
    } else {
      wx.removeStorageSync(BLUETOOTH_PROFILE_CONFIG_CACHE_KEY);
    }
  },

  getBluetoothProfile(deviceName) {
    return bluetoothProfileUtil.getMatchedProfile(this.globalData.bluetoothProfileConfig, deviceName);
  },

  getBluetoothDeviceDisplayInfo(deviceName) {
    const normalizedDeviceName = String(deviceName || '').trim();
    const matchedConfig = bluetoothProfileUtil.getMatchedDeviceNameConfig(
      this.globalData.bluetoothProfileConfig,
      normalizedDeviceName
    );

    if (matchedConfig) {
      return {
        alias: String(matchedConfig.alias || '').trim() || normalizedDeviceName,
        imageUrl: matchedConfig.imageUrl
          ? imageUtil.resolveImageUrl(matchedConfig.imageUrl)
          : this.globalData.defaultDeviceImage || imageUtil.resolveImageUrl('/assets/default-device.png')
      };
    }

    const normalizedName = normalizedDeviceName.toLowerCase();
    const matchedLegacyKeyword = Object.keys(LEGACY_BLUETOOTH_DEVICE_IMAGE_MAP).find(function (
      keyword
    ) {
      return normalizedName && normalizedName.indexOf(keyword) !== -1;
    });

    return {
      alias: normalizedDeviceName,
      imageUrl: matchedLegacyKeyword
        ? imageUtil.resolveImageUrl(LEGACY_BLUETOOTH_DEVICE_IMAGE_MAP[matchedLegacyKeyword])
        : this.globalData.defaultDeviceImage || imageUtil.resolveImageUrl('/assets/default-device.png')
    };
  },

  getBluetoothDeviceDisplayImage(deviceName) {
    return this.getBluetoothDeviceDisplayInfo(deviceName).imageUrl;
  },

  getBluetoothDeviceDisplayAlias(deviceName) {
    return this.getBluetoothDeviceDisplayInfo(deviceName).alias;
  },

  isBluetoothNameAllowed(deviceName) {
    const normalizedName = String(deviceName || '').trim().toLowerCase();
    if (!normalizedName) {
      return false;
    }

    const filters = Array.isArray(this.globalData.bluetoothNameFilters)
      ? this.globalData.bluetoothNameFilters
      : [];

    if (!filters.length) {
      return true;
    }

    return filters.some(function (keyword) {
      return normalizedName.includes(String(keyword || '').toLowerCase());
    });
  },

  resetBluetoothDebugAccess() {
    this.globalData.bluetoothDebugAccess = false;
    this.globalData.bluetoothDebugUserPhone = '';
  },

  loadBluetoothDebugAccess() {
    const that = this;

    if (!api.isLoggedIn()) {
      that.resetBluetoothDebugAccess();
      return Promise.resolve({ hasAccess: false, userPhone: '' });
    }

    return api.get('/api/miniprogram/debug-access', { showError: false }).then(function (res) {
      const payload = res && res.data ? res.data : (res || {});

      that.globalData.bluetoothDebugAccess = !!payload.hasAccess;
      that.globalData.bluetoothDebugUserPhone = String(payload.userPhone || '').trim();

      if (payload.hasAccess) {
        if (Object.prototype.hasOwnProperty.call(payload, 'bluetoothNameFilters')) {
          that.updateBluetoothNameFilters(payload.bluetoothNameFilters);
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'bluetoothProfileConfigsJson')) {
          that.updateBluetoothProfileConfig(payload.bluetoothProfileConfigsJson);
        }
      }

      return payload;
    }).catch(function () {
      that.resetBluetoothDebugAccess();
      return { hasAccess: false, userPhone: '' };
    });
  },

  openCustomerServiceChat() {
    const corpId = String(this.globalData.customerServiceCorpId || '').trim();
    const customerServiceUrl = String(this.globalData.customerServiceUrl || '').trim();

    if (!corpId || !customerServiceUrl) {
      wx.showToast({
        title: '客服配置缺失',
        icon: 'none'
      });
      return;
    }

    if (typeof wx.openCustomerServiceChat !== 'function') {
      wx.showToast({
        title: '当前微信版本过低',
        icon: 'none'
      });
      return;
    }

    wx.openCustomerServiceChat({
      extInfo: {
        url: customerServiceUrl
      },
      corpId: corpId,
      fail(error) {
        const message = resolveCustomerServiceErrorMessage(error);

        if (!message) {
          return;
        }

        console.error('openCustomerServiceChat 失败:', error);
        wx.showToast({
          title: message,
          icon: 'none'
        });
      }
    });
  },

  // 从小程序专属 API 加载首页配置（轮播图 + 标题）
  loadHomeConfig() {
    const that = this;
    return api.get('/api/miniprogram/home', { showError: false }).then(function (res) {
      const payload = res && res.data;
      if (payload) {
        // banners → carouselData
        if (payload.banners && payload.banners.length) {
          that.globalData.carouselData = payload.banners.map(function (item) {
            return {
              id: item.id,
              imageUrl: imageUtil.resolveImageUrl(item.imageUrl || ''),
              model: item.title || '',
              productId: item.productId,
              sortOrder: item.sortOrder || 0
            };
          }).sort(function (a, b) { return a.sortOrder - b.sortOrder; });
        }
        // 首页配置（字段在 payload 根级别）
        that.globalData.homeTitle = payload.homeTitle || '迈瑟伦一体机';
        that.globalData.defaultDeviceImage = imageUtil.resolveImageUrl(payload.defaultDeviceImage || '/assets/default-device.png');
        that.globalData.carouselAutoPlay = payload.carouselAutoPlay !== false;
        that.globalData.carouselInterval = payload.carouselInterval || 3000;
        if (Object.prototype.hasOwnProperty.call(payload, 'bluetoothNameFilters')) {
          that.updateBluetoothNameFilters(payload.bluetoothNameFilters);
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'bluetoothProfileConfigsJson')) {
          that.updateBluetoothProfileConfig(payload.bluetoothProfileConfigsJson);
        }
      }
      // 通知首页刷新
      var pages = getCurrentPages();
      pages.forEach(function (page) {
        if (page.route === 'pages/home/home' && page.renderFromCache) {
          page.renderFromCache();
          if (page.loadConnectedDevices) {
            page.loadConnectedDevices();
          }
        }
      });
    }).catch(function (err) {
      console.error('loadHomeConfig 失败:', err);
    });
  }
});