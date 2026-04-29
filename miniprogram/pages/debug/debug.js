const api = require('../../utils/api.js');
const bluetoothProfileUtil = require('../../utils/bluetooth-profile.js');

const PARSER_LABEL_MAP = {
  int32: '32 位整数',
  int16Array: '16 位数组',
  enum32: '状态枚举',
  utf8: 'UTF-8 文本'
};

function splitKeywordText(rawValue) {
  return String(rawValue || '')
    .split(/[\r\n,，;；]+/)
    .map(function (item) {
      return item.trim();
    })
    .filter(Boolean);
}

function formatScaleText(command) {
  var scale = Number(command && command.scale);
  var offset = Number(command && command.offset);
  var parts = [];

  if (Number.isFinite(scale) && scale !== 1) {
    parts.push('倍率 ' + scale);
  }

  if (Number.isFinite(offset) && offset !== 0) {
    parts.push('偏移 ' + offset);
  }

  return parts.join(' · ');
}

function buildProfileSummaries(root) {
  var profiles = root && Array.isArray(root.profiles) ? root.profiles : [];

  return profiles.map(function (profile, profileIndex) {
    var metricMap = {};
    (profile.metrics || []).forEach(function (metric) {
      if (metric && metric.key) {
        metricMap[metric.key] = metric;
      }
    });

    var visibleGauges = bluetoothProfileUtil.getVisibleGauges(profile).map(function (gauge) {
      var metricKeys = Array.isArray(gauge.metricKeys) ? gauge.metricKeys.filter(Boolean) : [];

      return {
        key: gauge.key,
        title: gauge.title || gauge.key,
        unit: gauge.detailUnit || '',
        metricCount: metricKeys.length,
        metricKeys: metricKeys
      };
    });

    var commands = (profile.commands || []).map(function (command, commandIndex) {
      var metricKey = String(command && command.metricKey || '').trim();
      var metric = metricMap[metricKey] || {};

      return {
        key: [profile.key || profileIndex, command.cmd || commandIndex, commandIndex].join('-'),
        metricKey: metricKey,
        metricLabel: metric.label || metricKey || '未绑定数据项',
        metricUnit: metric.unit || '',
        cmd: String(command.cmd || '').toUpperCase(),
        ackCmd: String(command.ackCmd || '').toUpperCase(),
        parserLabel: PARSER_LABEL_MAP[command.parser] || String(command.parser || '未设置'),
        scaleText: formatScaleText(command)
      };
    });

    return {
      key: profile.key || ('profile-' + profileIndex),
      name: profile.name || '未命名方案',
      isDefault: root.defaultProfileKey === profile.key,
      matchKeywords: Array.isArray(profile.matchKeywords) ? profile.matchKeywords : [],
      gaugeCount: visibleGauges.length,
      commandCount: commands.length,
      gauges: visibleGauges,
      commands: commands
    };
  });
}

function resolveSelectedProfile(profileSummaries, preferredKey) {
  var summaries = Array.isArray(profileSummaries) ? profileSummaries : [];
  var selectedProfile = null;

  if (preferredKey) {
    selectedProfile = summaries.find(function (profile) {
      return profile.key === preferredKey;
    }) || null;
  }

  if (!selectedProfile && summaries.length) {
    selectedProfile = summaries[0];
  }

  return {
    selectedProfileKey: selectedProfile ? selectedProfile.key : '',
    selectedProfileSummary: selectedProfile
  };
}

function resolveSelectedGauge(profileSummary, preferredKey) {
  var gauges = profileSummary && Array.isArray(profileSummary.gauges) ? profileSummary.gauges : [];
  var selectedGauge = null;

  if (preferredKey) {
    selectedGauge = gauges.find(function (gauge) {
      return gauge.key === preferredKey;
    }) || null;
  }

  if (!selectedGauge && gauges.length) {
    selectedGauge = gauges[0];
  }

  return selectedGauge;
}

function buildProtocolCommands(profileSummary, selectedGauge) {
  var commands = profileSummary && Array.isArray(profileSummary.commands) ? profileSummary.commands : [];

  if (!selectedGauge || !Array.isArray(selectedGauge.metricKeys) || !selectedGauge.metricKeys.length) {
    return commands;
  }

  return commands.filter(function (command) {
    return selectedGauge.metricKeys.indexOf(command.metricKey) !== -1;
  });
}

function resolveProfileDetail(profileSummaries, preferredProfileKey, preferredGaugeKey) {
  var profileSelection = resolveSelectedProfile(profileSummaries, preferredProfileKey);
  var selectedProfile = profileSelection.selectedProfileSummary;
  var selectedGauge = resolveSelectedGauge(selectedProfile, preferredGaugeKey);

  return {
    selectedProfileKey: profileSelection.selectedProfileKey,
    selectedProfileSummary: selectedProfile,
    selectedGaugeKey: selectedGauge ? selectedGauge.key : '',
    selectedProtocolCommands: buildProtocolCommands(selectedProfile, selectedGauge)
  };
}

Page({
  data: {
    loading: true,
    hasAccess: false,
    userPhone: '',
    allowedDeviceNames: [],
    profileSummaries: [],
    showProtocolPanel: false,
    selectedProfileKey: '',
    selectedProfileSummary: null,
    selectedGaugeKey: '',
    selectedProtocolCommands: [],
    emptyTitle: '',
    emptyDescription: ''
  },

  onLoad() {
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#0a0a0a'
    });

    this.prepareBluetoothDebugSession().finally(() => {
      this.loadDebugConfig(true);
    });
  },

  prepareBluetoothDebugSession() {
    var app = getApp();
    var that = this;

    if (!app) {
      return Promise.resolve();
    }

    if (typeof app.syncBluetoothConnectionState === 'function') {
      return app.syncBluetoothConnectionState().then(function (result) {
        var currentDevice = result && result.device ? result.device : app.globalData.connectedDevice;
        if (!result || !result.isConnected || !currentDevice || !currentDevice.deviceId) {
          return;
        }

        return that.disconnectExistingBluetoothDevice(currentDevice.deviceId);
      }).catch(function () {
        return Promise.resolve();
      });
    }

    if (app.globalData.bluetoothConnected && app.globalData.connectedDevice && app.globalData.connectedDevice.deviceId) {
      return this.disconnectExistingBluetoothDevice(app.globalData.connectedDevice.deviceId);
    }

    return Promise.resolve();
  },

  disconnectExistingBluetoothDevice(deviceId) {
    var app = getApp();

    return new Promise(function (resolve) {
      wx.closeBLEConnection({
        deviceId: deviceId,
        complete: function () {
          if (app && typeof app.updateBluetoothConnection === 'function') {
            app.updateBluetoothConnection(null, false);
          }

          wx.closeBluetoothAdapter({
            complete: function () {
              resolve();
            }
          });
        }
      });
    });
  },

  refreshDebugConfig() {
    this.loadDebugConfig(false);
  },

  toggleProtocolPanel() {
    this.setData({
      showProtocolPanel: !this.data.showProtocolPanel
    });
  },

  selectProtocolProfile(e) {
    var profileKey = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.key || '').trim()
      : '';
    var nextSelection = resolveProfileDetail(this.data.profileSummaries, profileKey, '');

    this.setData(nextSelection);
  },

  selectGaugeChip(e) {
    var gaugeKey = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.key || '').trim()
      : '';
    var nextSelection = resolveProfileDetail(
      this.data.profileSummaries,
      this.data.selectedProfileKey,
      gaugeKey
    );

    this.setData(nextSelection);
  },

  loadDebugConfig(shouldInitializeBluetooth) {
    var that = this;
    var app = getApp();

    that.setData({
      loading: true,
      emptyTitle: '',
      emptyDescription: ''
    });

    if (!api.isLoggedIn()) {
      that.setData({
        loading: false,
        hasAccess: false,
        userPhone: '',
        allowedDeviceNames: [],
        profileSummaries: [],
        selectedProfileKey: '',
        selectedProfileSummary: null,
        selectedGaugeKey: '',
        selectedProtocolCommands: [],
        emptyTitle: '请先登录',
        emptyDescription: '请先在个人中心完成登录，再使用蓝牙调试。'
      });
      return;
    }

    if (!app || typeof app.loadBluetoothDebugAccess !== 'function') {
      that.setData({
        loading: false,
        hasAccess: false,
        allowedDeviceNames: [],
        profileSummaries: [],
        selectedProfileKey: '',
        selectedProfileSummary: null,
        selectedGaugeKey: '',
        selectedProtocolCommands: [],
        emptyTitle: '调试能力暂不可用',
        emptyDescription: '当前运行环境未注入蓝牙调试权限接口，请稍后重试。'
      });
      return;
    }

    app.loadBluetoothDebugAccess().then(function (payload) {
      if (!api.isLoggedIn()) {
        that.setData({
          loading: false,
          hasAccess: false,
          userPhone: '',
          allowedDeviceNames: [],
          profileSummaries: [],
          selectedProfileKey: '',
          selectedProfileSummary: null,
          selectedGaugeKey: '',
          selectedProtocolCommands: [],
          emptyTitle: '请先登录',
          emptyDescription: '登录态已失效，请回到个人中心重新登录后再使用蓝牙调试。'
        });
        return;
      }

      var hasAccess = !!(payload && payload.hasAccess);
      var userPhone = String(payload && payload.userPhone || '').trim();

      if (!hasAccess) {
        that.setData({
          loading: false,
          hasAccess: false,
          userPhone: userPhone,
          allowedDeviceNames: [],
          profileSummaries: [],
          selectedProfileKey: '',
          selectedProfileSummary: null,
          selectedGaugeKey: '',
          selectedProtocolCommands: [],
          emptyTitle: '当前账号暂无权限',
          emptyDescription: '请在官网后台的小程序管理 - 蓝牙配置中，把当前手机号加入蓝牙调试权限列表后再试。'
        });
        return;
      }

      var rawBluetoothNameFilters = payload.bluetoothNameFilters || '';
      var rawBluetoothProfileConfig = payload.bluetoothProfileConfigsJson || app.globalData.bluetoothProfileConfigsJson || '';
      var configRoot = bluetoothProfileUtil.parseBluetoothProfileConfig(rawBluetoothProfileConfig);
      var profileSummaries = buildProfileSummaries(configRoot);
      var nextSelection = resolveProfileDetail(
        profileSummaries,
        that.data.selectedProfileKey,
        that.data.selectedGaugeKey
      );

      that.setData({
        loading: false,
        hasAccess: true,
        userPhone: userPhone,
        allowedDeviceNames: splitKeywordText(rawBluetoothNameFilters),
        profileSummaries: profileSummaries,
        selectedProfileKey: nextSelection.selectedProfileKey,
        selectedProfileSummary: nextSelection.selectedProfileSummary,
        emptyTitle: '',
        emptyDescription: ''
      });

      if (shouldInitializeBluetooth) {
        wx.nextTick(function () {
          var bluetoothCom = that.selectComponent('#bluetoothCom');
          if (bluetoothCom) {
            bluetoothCom.initializeBluetooth();
          }
        });
      }
    }).catch(function () {
      that.setData({
        loading: false,
        hasAccess: false,
        allowedDeviceNames: [],
        profileSummaries: [],
        selectedProfileKey: '',
        selectedProfileSummary: null,
        selectedGaugeKey: '',
        selectedProtocolCommands: [],
        emptyTitle: '读取失败',
        emptyDescription: '后台配置读取失败，请检查网络或稍后重试。'
      });
    });
  }
});