// pages/home/home.js
const app = getApp();

Page({
  data: {
    carouselData: [],
    currentModel: '',
    connectedDevices: [],
    showActionSheet: false,
    actionSheetActions: [],
    selectedDevice: null,
    selectedIndex: -1,
    isGloballyConnected: false,
    currentlyConnectedDevice: null,
    homeTitle: '',
    defaultDeviceImage: '',
    isInit: false // 标记是否已初始化过（用于辅助逻辑，不再阻塞渲染）
  },

  onLoad() {
    // 【核心优化】第一步：立刻读取全局缓存渲染，保证秒开（<1秒），绝无任何 Loading
    this.renderFromCache();

    // 【核心优化】第二步：无论是否有缓存，都立即发起后台静默刷新
    // 即使是第一次安装打开（缓存为空），也走静默模式，不阻塞用户操作
    this.silentRefresh();
    
    // 标记一下，表示已经执行过初始化流程
    if (!this.data.isInit) {
      this.setData({ isInit: true });
    }
  },

  onShow() {
    // 每次回到首页，先同步真实蓝牙连接状态，再刷新设备列表
    this.refreshBluetoothConnectionState();
    
    // 可选：如果希望每次切回首页都刷新最新数据，保持下面的调用
    // 如果担心频繁请求，可以加个时间戳限制，比如间隔大于30秒才刷新
    this.silentRefresh();

    // 更新购物车角标
    var apiUtil = require('../../utils/api.js');
    apiUtil.updateCartBadge();
  },

  refreshBluetoothConnectionState() {
    if (app && typeof app.syncBluetoothConnectionState === 'function') {
      app.syncBluetoothConnectionState().finally(() => {
        this.checkGlobalConnection();
        this.loadConnectedDevices();
      });
      return;
    }

    this.checkGlobalConnection();
    this.loadConnectedDevices();
  },

  // 从缓存渲染 (同步操作，极快，负责瞬间展示界面)
  renderFromCache() {
    const cache = app.globalData;
    this.setData({
      carouselData: cache.carouselData || [],
      homeTitle: cache.homeTitle || '迈瑟伦一体机',
      defaultDeviceImage: cache.defaultDeviceImage || '/assets/default-device.png'
    }, () => {
      this.loadConnectedDevices();
    });
  },

  // 【核心优化】静默刷新 (后台跑，不显示 Loading，拿到数据后无感更新)
  silentRefresh() {
    // 防止并发请求（如果上一个请求还没回来，就不发新的）
    if (this._isRefreshing) return;
    this._isRefreshing = true;

    // 通过 app.loadHomeConfig() 统一刷新
    app.loadHomeConfig().then(() => {
      this.renderFromCache(); 
    }).catch((err) => {
      console.error('静默刷新失败:', err);
    }).finally(() => {
      this._isRefreshing = false;
    });
  },

  checkGlobalConnection() {
    const isConnected = app.globalData?.bluetoothConnected || false;
    const connectedDevice = app.globalData?.connectedDevice || null;

    this.setData({
      isGloballyConnected: isConnected,
      currentlyConnectedDevice: connectedDevice
    });

    if (isConnected && connectedDevice) {
      this.updateDeviceConnection(connectedDevice.deviceId, true);
    } else {
      this.resetAllConnections();
    }
  },

  resetAllConnections() {
    const devices = this.data.connectedDevices.map(device => ({
      ...device,
      connected: false
    }));
    this.setData({
      connectedDevices: devices
    });
    wx.setStorageSync('connected_devices', devices);
  },

  loadConnectedDevices() {
    const devices = wx.getStorageSync('connected_devices') || [];

    const updatedDevices = devices.map(device => {
      const rawName = this.resolveDeviceRawName(device);
      const displayInfo = this.resolveDeviceDisplayInfo(rawName, device);

      if (this.data.isGloballyConnected &&
        this.data.currentlyConnectedDevice &&
        device.deviceId === this.data.currentlyConnectedDevice.deviceId) {
        return {
          ...device,
          name: rawName,
          rawName: rawName,
          image: displayInfo.image,
          displayName: displayInfo.alias,
          connected: true
        };
      }
      return {
        ...device,
        name: rawName,
        rawName: rawName,
        image: displayInfo.image,
        displayName: displayInfo.alias,
        connected: false
      };
    });

    this.setData({
      connectedDevices: updatedDevices
    });
    wx.setStorageSync('connected_devices', updatedDevices);
  },

  resolveDeviceRawName(device) {
    if (!device || typeof device !== 'object') {
      return '';
    }

    return device.rawName || device.name || '';
  },

  resolveDeviceDisplayInfo(deviceName, device) {
    if (app && typeof app.getBluetoothDeviceDisplayInfo === 'function') {
      const displayInfo = app.getBluetoothDeviceDisplayInfo(deviceName);
      return {
        image: displayInfo.imageUrl || (device && device.image) || this.data.defaultDeviceImage || '/assets/default-device.png',
        alias: displayInfo.alias || (device && device.displayName) || deviceName || '未命名设备'
      };
    }

    return {
      image: (device && device.image) || this.data.defaultDeviceImage || '/assets/default-device.png',
      alias: (device && device.displayName) || deviceName || '未命名设备'
    };
  },

  updateDeviceConnection(deviceId, isConnected) {
    const devices = this.data.connectedDevices.map(device => {
      const rawName = this.resolveDeviceRawName(device);
      const displayInfo = this.resolveDeviceDisplayInfo(rawName, device);

      if (device.deviceId === deviceId) {
        return {
          ...device,
          name: rawName,
          rawName: rawName,
          image: displayInfo.image,
          displayName: displayInfo.alias,
          connected: isConnected
        };
      }

      return {
        ...device,
        name: rawName,
        rawName: rawName,
        image: displayInfo.image,
        displayName: displayInfo.alias
      };
    });
    this.setData({
      connectedDevices: devices
    });
    wx.setStorageSync('connected_devices', devices);
  },

  onSwiperChange(e) {
    const currentIndex = e.detail.current;
    const model = this.data.carouselData[currentIndex]?.Model ||
      this.data.carouselData[currentIndex]?.model || '';
    this.setData({
      currentModel: model
    });
  },

  onAddDevice() {
    // 用户随时可以点击，不受网络加载影响
    if (this.data.isGloballyConnected && this.data.currentlyConnectedDevice) {
      wx.showModal({
        title: '提示',
        content: '当前已有设备连接，请先长按已连接设备断开连接后再添加新设备',
        confirmText: '我知道了',
        showCancel: false
      });
    } else {
      wx.navigateTo({
        url: '/pages/equipment/equipment'
      });
    }
  },

  onLongPressDevice(e) {
    const {
      device,
      index
    } = e.currentTarget.dataset;
    if (!device) return;

    wx.vibrateShort({
      type: 'medium'
    });

    const actions = [];
    if (device.connected &&
      this.data.isGloballyConnected &&
      this.data.currentlyConnectedDevice &&
      device.deviceId === this.data.currentlyConnectedDevice.deviceId) {
      actions.push({
        name: '断开连接',
        tone: 'accent'
      });
    }
    actions.push({
      name: '删除设备',
      tone: 'danger'
    });

    this.setData({
      selectedDevice: device,
      selectedIndex: index,
      actionSheetActions: actions,
      showActionSheet: true
    });
  },

  onCloseActionSheet() {
    this.setData({
      showActionSheet: false,
      selectedDevice: null,
      selectedIndex: -1,
      actionSheetActions: []
    });
  },

  onSelectAction(e) {
    const actionName = e.detail.name;
    if (actionName === '断开连接') {
      this.disconnectDevice();
    } else if (actionName === '删除设备') {
      this.deleteDevice();
    }
  },

  onActionSheetActionTap(e) {
    const actionName = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.name
      : '';
    if (!actionName) {
      return;
    }

    this.setData({
      showActionSheet: false
    }, () => {
      this.onSelectAction({
        detail: {
          name: actionName
        }
      });
    });
  },

  noop() {},

  openDeviceMessage(device) {
    if (!device || !device.deviceId) {
      return;
    }

    const navigateToMessage = () => {
      const rawName = this.resolveDeviceRawName(device);
      const displayInfo = this.resolveDeviceDisplayInfo(rawName, device);

      app.updateBluetoothConnection({
        ...device,
        name: rawName,
        rawName: rawName,
        displayName: displayInfo.alias
      }, true);

      wx.navigateTo({
        url: '/pages/message/message'
      });
    };

    if (app && typeof app.getConnectedBluetoothDevices === 'function') {
      app.getConnectedBluetoothDevices().then(({ ok, devices }) => {
        const isConnected = !ok || (devices || []).some((item) => item.deviceId === device.deviceId);

        if (!isConnected) {
          app.updateBluetoothConnection(null, false);
          this.setData({
            isGloballyConnected: false,
            currentlyConnectedDevice: null
          });
          this.updateDeviceConnection(device.deviceId, false);
          wx.showToast({
            title: '设备已断开，请重新连接',
            icon: 'none'
          });
          return;
        }

        navigateToMessage();
      });
      return;
    };

    navigateToMessage();
  },

  handleConnectedDevice(device) {
    app.updateBluetoothConnection(device, true);

    const connectedDevice = app.globalData.connectedDevice || device;
    this.setData({
      isGloballyConnected: true,
      currentlyConnectedDevice: connectedDevice
    });
    this.updateDeviceConnection(device.deviceId, true);

    wx.showToast({
      title: '连接成功',
      icon: 'success',
      duration: 1000
    });

    setTimeout(() => {
      this.openDeviceMessage(connectedDevice);
    }, 500);
  },

  disconnectDevice() {
    if (!this.data.selectedDevice || !this.data.selectedDevice.deviceId) {
      wx.showToast({
        title: '设备信息错误',
        icon: 'error'
      });
      this.onCloseActionSheet();
      return;
    }

    const device = this.data.selectedDevice;
    const deviceLabel = device.displayName || device.name || '该设备';

    wx.showModal({
      title: '提示',
      content: `确定要断开设备 "${deviceLabel}" 的连接吗？`,
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '断开中...',
            mask: true
          });

          wx.closeBLEConnection({
            deviceId: device.deviceId,
            success: () => {
              wx.closeBluetoothAdapter({
                success: () => {
                  wx.hideLoading();
                  app.updateBluetoothConnection(null, false);
                  this.setData({
                    isGloballyConnected: false,
                    currentlyConnectedDevice: null
                  });
                  this.updateDeviceConnection(device.deviceId, false);
                  wx.showToast({
                    title: '已断开',
                    icon: 'success'
                  });
                  this.onCloseActionSheet();
                },
                fail: () => {
                  wx.hideLoading();
                  app.updateBluetoothConnection(null, false);
                  this.setData({
                    isGloballyConnected: false,
                    currentlyConnectedDevice: null
                  });
                  this.updateDeviceConnection(device.deviceId, false);
                  wx.showToast({
                    title: '已断开',
                    icon: 'success'
                  });
                  this.onCloseActionSheet();
                }
              });
            },
            fail: () => {
              wx.hideLoading();
              wx.closeBluetoothAdapter({
                complete: () => {
                  app.updateBluetoothConnection(null, false);
                  this.setData({
                    isGloballyConnected: false,
                    currentlyConnectedDevice: null
                  });
                  this.updateDeviceConnection(device.deviceId, false);
                  wx.showToast({
                    title: '已断开',
                    icon: 'success'
                  });
                  this.onCloseActionSheet();
                }
              });
            }
          });
        } else {
          this.onCloseActionSheet();
        }
      }
    });
  },

  deleteDevice() {
    if (!this.data.selectedDevice || this.data.selectedIndex === -1) {
      wx.showToast({
        title: '设备信息错误',
        icon: 'error'
      });
      this.onCloseActionSheet();
      return;
    }

    const device = this.data.selectedDevice;
    const index = this.data.selectedIndex;
    const deviceLabel = device.displayName || device.name || '该设备';

    wx.showModal({
      title: '提示',
      content: `确定要删除设备 "${deviceLabel}" 吗？`,
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          if (device.connected &&
            this.data.isGloballyConnected &&
            this.data.currentlyConnectedDevice &&
            device.deviceId === this.data.currentlyConnectedDevice.deviceId) {
            wx.closeBLEConnection({
              deviceId: device.deviceId,
              complete: () => {
                wx.closeBluetoothAdapter({
                  complete: () => {
                    app.updateBluetoothConnection(null, false);
                    this.setData({
                      isGloballyConnected: false,
                      currentlyConnectedDevice: null
                    });
                    this.performDelete(index);
                  }
                });
              }
            });
          } else {
            this.performDelete(index);
          }
        } else {
          this.onCloseActionSheet();
        }
      }
    });
  },

  performDelete(index) {
    const newDevices = this.data.connectedDevices.filter((_, i) => i !== index);
    wx.setStorageSync('connected_devices', newDevices);
    this.setData({
      connectedDevices: newDevices,
      showActionSheet: false,
      selectedDevice: null,
      selectedIndex: -1,
      actionSheetActions: []
    });
    wx.showToast({
      title: '已删除',
      icon: 'success'
    });
  },

  connectToDevice(e) {
    const device = e.currentTarget.dataset.device;
    if (!device) return;

    if (device.connected &&
      this.data.isGloballyConnected &&
      this.data.currentlyConnectedDevice &&
      device.deviceId === this.data.currentlyConnectedDevice.deviceId) {
      this.openDeviceMessage(device);
      return;
    }

    if (this.data.isGloballyConnected && this.data.currentlyConnectedDevice) {
      wx.showModal({
        title: '提示',
        content: '已有设备连接，是否先断开当前连接？',
        success: (res) => {
          if (res.confirm) {
            wx.closeBLEConnection({
              deviceId: this.data.currentlyConnectedDevice.deviceId,
              complete: () => {
                wx.closeBluetoothAdapter({
                  complete: () => {
                    app.updateBluetoothConnection(null, false);
                    this.setData({
                      isGloballyConnected: false,
                      currentlyConnectedDevice: null
                    });
                    this.connectToNewDevice(device);
                  }
                });
              }
            });
          }
        }
      });
      return;
    }

    this.connectToNewDevice(device);
  },

  connectToNewDevice(device) {
    wx.showLoading({
      title: '正在连接...',
      mask: true
    });

    wx.openBluetoothAdapter({
      success: () => {
        const createConnection = () => {
          wx.createBLEConnection({
            deviceId: device.deviceId,
            success: () => {
              wx.hideLoading();
              this.handleConnectedDevice(device);
            },
            fail: () => {
              wx.hideLoading();
              this.updateDeviceConnection(device.deviceId, false);
              wx.showToast({
                title: '连接失败，设备可能不可用',
                icon: 'none',
                duration: 2000
              });
            }
          });
        };

        if (app && typeof app.getConnectedBluetoothDevices === 'function') {
          app.getConnectedBluetoothDevices().then(({ devices }) => {
            const alreadyConnected = (devices || []).some((item) => item.deviceId === device.deviceId);
            if (alreadyConnected) {
              wx.hideLoading();
              this.handleConnectedDevice(device);
              return;
            }

            createConnection();
          });
          return;
        }

        createConnection();
      },
      fail: () => {
        wx.hideLoading();
        wx.showModal({
          title: '提示',
          content: '请开启手机蓝牙',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openBluetoothAdapter({
                fail: () => {
                  wx.showToast({
                    title: '请手动开启蓝牙',
                    icon: 'none'
                  });
                }
              });
            }
          }
        });
      }
    });
  }
});