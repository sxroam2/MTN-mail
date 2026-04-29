// pages/equipment/equipment.js
Page({
  data: {
    bluetoothEnabled: false,
    isSearching: false,
    deviceList: [],
    checkTimer: null,
    hasAutoSearched: false,
    isPageActive: true,
    isInitialized: false,
    hasConnectedDevice: false
  },

  onLoad() {
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#000000'
    });
  },

  // 检查是否有设备已连接
  checkExistingConnection() {
    const app = getApp();
    const handleConnectionState = (isConnected) => {
      if (isConnected) {
        this.setData({
          hasConnectedDevice: true
        });

        wx.showModal({
          title: '提示',
          content: '当前已有设备连接，请先断开连接后再添加新设备',
          confirmText: '我知道了',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
        return;
      }

      this.setData({
        hasConnectedDevice: false
      });
      this.initBluetooth();
    };

    if (app && typeof app.syncBluetoothConnectionState === 'function') {
      app.syncBluetoothConnectionState().then(({ isConnected }) => {
        handleConnectionState(!!isConnected);
      });
      return;
    }

    handleConnectionState(!!app.globalData.bluetoothConnected);
  },

  onShow() {
    // 如果已经有连接，不执行任何操作
    if (this.data.hasConnectedDevice) return;

    this.setData({
      isPageActive: true,
      hasAutoSearched: false,
      deviceList: [],
      isSearching: false
    });

    // 每次显示页面时重新校验真实连接状态，避免重复连接报错
    this.checkExistingConnection();
  },

  onHide() {
    this.setData({
      isPageActive: false
    });
    this.handlePageExit();
  },

  onUnload() {
    this.setData({
      isPageActive: false
    });
    this.handlePageExit();
  },

  // 处理页面退出
  handlePageExit() {
    const app = getApp();

    // 停止搜索和检查
    this.stopSearch();
    this.stopCheckingBluetooth();

    if (!app.globalData.bluetoothConnected) {
      // 如果没有设备连接，关闭蓝牙适配器
      console.log('退出equipment页面，无设备连接，关闭蓝牙适配器');
      wx.closeBluetoothAdapter({
        complete: () => {
          console.log('蓝牙适配器已关闭');
          this.setData({
            isInitialized: false
          });
        }
      });
    } else {
      console.log('退出equipment页面，有设备连接，保留蓝牙适配器');
    }
  },

  // 初始化蓝牙
  initBluetooth() {
    wx.openBluetoothAdapter({
      success: () => {
        console.log('蓝牙适配器初始化成功');
        this.setData({
          isInitialized: true
        });
        this.checkBluetoothAdapter();
        this.startCheckingBluetooth();
      },
      fail: (err) => {
        console.log('蓝牙适配器初始化失败', err);
        this.setData({
          bluetoothEnabled: false,
          isInitialized: true
        });
        this.startCheckingBluetooth();
      }
    });
  },

  // 开始检查蓝牙状态
  startCheckingBluetooth() {
    this.checkBluetoothAdapter();
    this.data.checkTimer = setInterval(() => {
      if (this.data.isPageActive) {
        this.checkBluetoothAdapter();
      }
    }, 2000);
  },

  // 停止检查蓝牙状态
  stopCheckingBluetooth() {
    if (this.data.checkTimer) {
      clearInterval(this.data.checkTimer);
      this.setData({
        checkTimer: null
      });
    }
  },

  // 检查蓝牙适配器状态
  checkBluetoothAdapter() {
    wx.getBluetoothAdapterState({
      success: (res) => {
        const wasEnabled = this.data.bluetoothEnabled;
        const nowEnabled = res.available;

        console.log('蓝牙状态:', nowEnabled ? '已开启' : '未开启');
        this.setData({
          bluetoothEnabled: nowEnabled
        });

        if (nowEnabled && this.data.isPageActive && !this.data.hasAutoSearched) {
          console.log('蓝牙已开启，准备自动搜索');
          this.setData({
            hasAutoSearched: true
          });

          setTimeout(() => {
            if (this.data.isPageActive) {
              this.startSearch();
            }
          }, 300);
        }
      },
      fail: (err) => {
        console.log('获取蓝牙状态失败', err);
        this.setData({
          bluetoothEnabled: false
        });
      }
    });
  },

  // 处理按钮点击
  handleButtonClick() {
    if (!this.data.bluetoothEnabled) {
      this.openBluetoothSettings();
    } else if (!this.data.isSearching) {
      this.startSearch();
    }
  },

  // 打开蓝牙设置
  openBluetoothSettings() {
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
  },

  // 开始搜索设备
  startSearch() {
    if (!this.data.bluetoothEnabled || this.data.isSearching || !this.data.isPageActive) {
      return;
    }

    console.log('开始搜索设备');

    wx.stopBluetoothDevicesDiscovery({
      complete: () => {
        this.setData({
          isSearching: true,
          deviceList: []
        });

        wx.offBluetoothDeviceFound();

        wx.onBluetoothDeviceFound((res) => {
          if (this.data.isPageActive) {
            const devices = res.devices || [];
            if (devices.length > 0) {
              wx.nextTick(() => {
                devices.forEach(device => {
                  this.addDeviceToList(device);
                });
              });
            }
          }
        });

        wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: false,
          interval: 0,
          success: () => {
            console.log('开始搜索设备成功');
          },
          fail: (err) => {
            console.error('搜索失败', err);
            if (this.data.isPageActive) {
              this.setData({
                isSearching: false
              });
            }
          }
        });
      }
    });
  },

  // 停止搜索
  stopSearch() {
    wx.stopBluetoothDevicesDiscovery({
      success: () => {
        console.log('停止搜索成功');
        if (this.data.isPageActive) {
          this.setData({
            isSearching: false
          });
        }
      },
      fail: () => {
        if (this.data.isPageActive) {
          this.setData({
            isSearching: false
          });
        }
      }
    });
  },

  // 重新搜索
  restartSearch() {
    this.stopSearch();
    setTimeout(() => {
      if (this.data.isPageActive) {
        this.startSearch();
      }
    }, 500);
  },

  isBluetoothNameAllowed(device) {
    const deviceName = device.localName || device.name || '';
    if (!deviceName) return false;

    const app = getApp();
    if (!app || typeof app.isBluetoothNameAllowed !== 'function') {
      return true;
    }

    return app.isBluetoothNameAllowed(deviceName);
  },

  // 添加设备到列表
  addDeviceToList(device) {
    if (!device.localName && !device.name) return;

    if (!this.isBluetoothNameAllowed(device)) return;

    let list = this.data.deviceList;
    const index = list.findIndex(d => d.deviceId === device.deviceId);

    const newDevice = {
      name: device.localName || device.name,
      deviceId: device.deviceId,
      RSSI: device.RSSI || -100
    };

    if (index > -1) {
      list[index] = {
        ...list[index],
        ...newDevice
      };
    } else {
      list.push(newDevice);
    }

    list.sort((a, b) => b.RSSI - a.RSSI);
    this.setData({
      deviceList: list
    });
  },

  // 连接设备
  connectToDevice(e) {
    const device = e.currentTarget.dataset.device;

    wx.showLoading({
      title: '正在连接...',
      mask: true
    });

    if (this.data.isSearching) {
      this.stopSearch();
    }

    wx.openBluetoothAdapter({
      success: () => {
        const createConnection = () => {
          wx.createBLEConnection({
            deviceId: device.deviceId,
            success: () => {
              wx.hideLoading();
              this.handleConnectedDevice(device);
            },
            fail: (err) => {
              wx.hideLoading();
              console.error('连接失败:', err);

              wx.showToast({
                title: '连接失败',
                icon: 'error'
              });
            }
          });
        };

        const app = getApp();
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
      fail: (err) => {
        wx.hideLoading();
        console.error('初始化蓝牙失败:', err);

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
  },

  handleConnectedDevice(device) {
    // 保存到历史记录，标记为已连接
    this.saveToHistory(device, true);

    const app = getApp();
    app.updateBluetoothConnection(device, true);

    wx.showToast({
      title: '连接成功',
      icon: 'success',
      duration: 1000,
      success: () => {
        setTimeout(() => {
          wx.redirectTo({
            url: '/pages/message/message'
          });
        }, 500);
      }
    });
  },

  // 保存到历史记录
  saveToHistory(device, isConnected = false) {
    const displayInfo = this.getDeviceDisplayInfo(device.name);

    let devices = wx.getStorageSync('connected_devices') || [];

    // 先查找是否已存在
    const existingIndex = devices.findIndex(d => d.deviceId === device.deviceId);

    const newDevice = {
      name: device.name,
      rawName: device.name,
      deviceId: device.deviceId,
      image: displayInfo.image,
      displayName: displayInfo.alias,
      lastTime: Date.now(),
      connected: isConnected
    };

    if (existingIndex > -1) {
      // 更新现有设备
      devices[existingIndex] = {
        ...devices[existingIndex],
        ...newDevice
      };
    } else {
      // 添加新设备
      devices.unshift(newDevice);
    }

    // 只保留最近10条
    if (devices.length > 10) devices.pop();

    wx.setStorageSync('connected_devices', devices);
    console.log('已保存到历史记录:', devices);

    // 通知首页更新
    const pages = getCurrentPages();
    const homePage = pages.find(page => page.route === 'pages/home/home');
    if (homePage) {
      homePage.loadConnectedDevices();
    }
  },

  getDeviceDisplayInfo(deviceName) {
    const app = getApp();
    if (app && typeof app.getBluetoothDeviceDisplayInfo === 'function') {
      const displayInfo = app.getBluetoothDeviceDisplayInfo(deviceName);
      return {
        image: displayInfo.imageUrl || '/assets/default-device.png',
        alias: displayInfo.alias || deviceName || '未命名设备'
      };
    }

    return {
      image: '/assets/default-device.png',
      alias: deviceName || '未命名设备'
    };
  },

  getDeviceImage(deviceName) {
    return this.getDeviceDisplayInfo(deviceName).image;
  }
});