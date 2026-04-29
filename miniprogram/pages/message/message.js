import * as echarts from '../../components/ec-canvas/echarts';

const bluetoothProfileUtil = require('../../utils/bluetooth-profile.js');

function getCurrentPageInstance() {
  const pages = getCurrentPages();
  return pages && pages.length ? pages[pages.length - 1] : null;
}

function createGaugeEc(gaugeKey) {
  return {
    lazyLoad: true,
    onInit: function (canvas, width, height, dpr) {
      const page = getCurrentPageInstance();
      const chart = echarts.init(canvas, null, {
        width: width,
        height: height,
        devicePixelRatio: dpr
      });
      canvas.setChart(chart);

      if (page && typeof page.setGaugeChartInstance === 'function') {
        page.setGaugeChartInstance(gaugeKey, chart);
        chart.setOption(page.buildGaugeOption(gaugeKey), true);
      }

      return chart;
    }
  };
}

Page({
  data: {
    currentGaugeIndex: 0,
    activeGauges: [],
    currentGaugeMetrics: [],
    brand: '品牌',
    model: '型号',

    voltageEc: createGaugeEc('voltage'),
    currentEc: createGaugeEc('current'),
    pressureEc: createGaugeEc('pressure'),

    deviceId: '',
    deviceName: '',
    deviceDisplayName: '',
    isConnecting: false,
    isConnected: false,
    services: [],
    writeCharacteristics: [],
    ismessage: true
  },

  onLoad() {
    this.gaugeCharts = {};
    this.runtimeBluetoothProfile = bluetoothProfileUtil.getDefaultProfile(bluetoothProfileUtil.DEFAULT_ROOT);
    this.metricStates = bluetoothProfileUtil.getDefaultMetricStates(this.runtimeBluetoothProfile);

    this.applyBluetoothProfile(this.runtimeBluetoothProfile);
    this.getDeviceFromGlobal();

    setTimeout(() => {
      this.initGauge(this.data.currentGaugeIndex);
    }, 200);

    setTimeout(() => {
      this.setData({ ismessage: false });
    }, 30000);
  },

  onUnload() {
    wx.offBLECharacteristicValueChange();
  },

  getDeviceFromGlobal() {
    const app = getApp();
    if (!app.globalData.connectedDevice) {
      wx.switchTab({
        url: '/pages/home/home'
      });
      return;
    }

    const device = app.globalData.connectedDevice;
    const rawDeviceName = device.rawName || device.name || '';
    const displayDeviceName = app.getBluetoothDeviceDisplayAlias
      ? app.getBluetoothDeviceDisplayAlias(rawDeviceName)
      : (device.displayName || rawDeviceName || '未知设备');
    const profile = app.getBluetoothProfile ? app.getBluetoothProfile(rawDeviceName) : this.runtimeBluetoothProfile;

    this.setData({
      deviceId: device.deviceId,
      deviceName: rawDeviceName || '未知设备',
      deviceDisplayName: displayDeviceName || rawDeviceName || '未知设备'
    });

    this.updateNavigationTitle(displayDeviceName || rawDeviceName || '未知设备');

    this.applyBluetoothProfile(profile);
    this.setData({
      isConnecting: false,
      isConnected: true
    });
    this.getServicesAndCharacteristics();
  },

  updateNavigationTitle(deviceName) {
    wx.setNavigationBarTitle({
      title: `${deviceName} - 设备信息`
    });
  },

  applyBluetoothProfile(profile) {
    const nextProfile = profile || bluetoothProfileUtil.getDefaultProfile(bluetoothProfileUtil.DEFAULT_ROOT);
    const previousStates = this.metricStates || {};
    const nextStates = bluetoothProfileUtil.getDefaultMetricStates(nextProfile);

    Object.keys(nextStates).forEach((key) => {
      if (previousStates[key]) {
        nextStates[key] = previousStates[key];
      }
    });

    this.runtimeBluetoothProfile = nextProfile;
    this.metricStates = nextStates;

    let activeGauges = bluetoothProfileUtil.getVisibleGauges(nextProfile).map((gauge) => ({
      key: gauge.key,
      title: gauge.title
    }));

    if (!activeGauges.length) {
      activeGauges = bluetoothProfileUtil.getVisibleGauges(
        bluetoothProfileUtil.getDefaultProfile(bluetoothProfileUtil.DEFAULT_ROOT)
      ).map((gauge) => ({
        key: gauge.key,
        title: gauge.title
      }));
    }

    const nextGaugeIndex = Math.min(
      this.data.currentGaugeIndex,
      Math.max(activeGauges.length - 1, 0)
    );

    this.setData({
      activeGauges: activeGauges,
      currentGaugeIndex: nextGaugeIndex
    });

    this.refreshGaugePresentation(nextGaugeIndex, activeGauges);
  },

  refreshGaugePresentation(gaugeIndex, activeGauges) {
    const brandState = this.metricStates.brand || { displayValue: '品牌' };
    const modelState = this.metricStates.model || { displayValue: '型号' };
    const targetGaugeIndex = typeof gaugeIndex === 'number' ? gaugeIndex : this.data.currentGaugeIndex;
    const targetActiveGauges = Array.isArray(activeGauges) ? activeGauges : this.data.activeGauges;

    this.setData({
      brand: brandState.displayValue || '品牌',
      model: modelState.displayValue || '型号',
      currentGaugeMetrics: this.buildCurrentGaugeMetrics(targetGaugeIndex, targetActiveGauges)
    });

    this.updateAllGaugeCharts();
  },

  buildCurrentGaugeMetrics(gaugeIndex, activeGauges) {
    const targetGaugeIndex = typeof gaugeIndex === 'number' ? gaugeIndex : this.data.currentGaugeIndex;
    const targetActiveGauges = Array.isArray(activeGauges) ? activeGauges : this.data.activeGauges;
    const currentGauge = targetActiveGauges[targetGaugeIndex];
    if (!currentGauge) {
      return [];
    }

    const gaugeDefinition = bluetoothProfileUtil.getGaugeDefinition(this.runtimeBluetoothProfile, currentGauge.key);
    if (!gaugeDefinition) {
      return [];
    }

    return (gaugeDefinition.metricKeys || []).map((metricKey) => {
      const metricState = this.metricStates[metricKey];
      if (!metricState || metricState.hiddenInMetrics) {
        return null;
      }

      const hasGridData = metricState.displayType === 'grid' && metricState.displayItems && metricState.displayItems.length;
      const hasScalarData = metricState.displayType !== 'grid' && metricState.displayValue !== '';
      if (metricState.hideWhenEmpty && !hasGridData && !hasScalarData) {
        return null;
      }

      return {
        key: metricState.key,
        label: metricState.label,
        icon: metricState.icon,
        displayType: metricState.displayType,
        valueText: metricState.displayValue,
        valueWithUnit: metricState.displayType === 'grid'
          ? ''
          : `${metricState.displayValue}${metricState.unit ? ` ${metricState.unit}` : ''}`,
        gridItems: metricState.displayItems || [],
        gridColumnCount: Math.max((metricState.displayItems || []).length, 1),
        statusClass: metricState.key === 'faultStatus' ? 'fault' : (metricState.statusClass || '')
      };
    }).filter(Boolean);
  },

  getServicesAndCharacteristics() {
    wx.getBLEDeviceServices({
      deviceId: this.data.deviceId,
      success: (res) => {
        const services = res.services || [];
        this.setData({ services: services });
        this.processServices(services);
      },
      fail: () => {
        this.setData({
          isConnected: false,
          services: [],
          writeCharacteristics: []
        });
      }
    });
  },

  processServices(services) {
    if (!services.length) {
      return;
    }

    let processed = 0;
    const writeChars = [];

    services.forEach((service) => {
      wx.getBLEDeviceCharacteristics({
        deviceId: this.data.deviceId,
        serviceId: service.uuid,
        success: (charRes) => {
          const characteristics = charRes.characteristics || [];

          characteristics.forEach((characteristic) => {
            if (characteristic.properties.notify || characteristic.properties.indicate) {
              wx.notifyBLECharacteristicValueChange({
                deviceId: this.data.deviceId,
                serviceId: service.uuid,
                characteristicId: characteristic.uuid,
                state: true
              });
            }

            if (characteristic.properties.write || characteristic.properties.writeNoResponse) {
              writeChars.push({
                serviceId: service.uuid,
                characteristicId: characteristic.uuid
              });
            }
          });
        },
        complete: () => {
          processed += 1;
          if (processed === services.length) {
            this.setData({ writeCharacteristics: writeChars });
            this.startListening();
          }
        }
      });
    });
  },

  startListening() {
    wx.offBLECharacteristicValueChange();
    wx.onBLECharacteristicValueChange((result) => {
      this.parseBLEData(result.value);
    });
  },

  parseBLEData(buffer) {
    const bytes = new Uint8Array(buffer);
    this.parseProtocol(bytes);
  },

  parseProtocol(bytes) {
    if (!bytes || bytes.length < 5 || bytes[0] !== 0xA5) {
      return;
    }

    const cmd = (bytes[1] << 8) | bytes[2];
    const length = bytes[3];
    if (bytes.length < length + 5) {
      return;
    }

    let checksum = 0;
    for (let index = 0; index < bytes.length - 1; index += 1) {
      checksum += bytes[index];
    }

    if ((checksum & 0xFF) !== bytes[bytes.length - 1]) {
      return;
    }

    const isProductToUser = !(cmd & 0x8000);
    const cmdValue = (cmd & 0x7FFF).toString(16).padStart(4, '0').toUpperCase();
    const params = Array.from(bytes.slice(4, 4 + length));

    if (isProductToUser) {
      this.sendAckForCmd(cmdValue, length);
    } else {
      return;
    }

    const parsedCommand = bluetoothProfileUtil.parseCommand(this.runtimeBluetoothProfile, cmdValue, params);
    if (!parsedCommand || !parsedCommand.metricKey) {
      return;
    }

    this.metricStates[parsedCommand.metricKey] = parsedCommand.metricState;
    this.refreshGaugePresentation();
  },

  sendAckForCmd(cmdValue, paramLength) {
    const ackCmd = bluetoothProfileUtil.getAckCmd(this.runtimeBluetoothProfile, cmdValue);
    if (!ackCmd || !this.data.writeCharacteristics.length) {
      return;
    }

    const frame = [
      0xA5,
      parseInt(ackCmd.substring(0, 2), 16),
      parseInt(ackCmd.substring(2, 4), 16),
      paramLength
    ];

    for (let index = 0; index < paramLength; index += 1) {
      frame.push(0xFF);
    }

    const checksum = frame.reduce((sum, item) => sum + item, 0) & 0xFF;
    frame.push(checksum);

    const buffer = new Uint8Array(frame).buffer;
    const writeCharacteristic = this.data.writeCharacteristics[0];
    if (!writeCharacteristic) {
      return;
    }

    wx.writeBLECharacteristicValue({
      deviceId: this.data.deviceId,
      serviceId: writeCharacteristic.serviceId,
      characteristicId: writeCharacteristic.characteristicId,
      value: buffer
    });
  },

  setGaugeChartInstance(gaugeKey, chart) {
    this.gaugeCharts[gaugeKey] = chart;
  },

  buildGaugeOption(gaugeKey) {
    const gauge = bluetoothProfileUtil.getGaugeDefinition(this.runtimeBluetoothProfile, gaugeKey) || {
      min: 0,
      max: 100,
      splitNumber: 5,
      detailUnit: '',
      detailDecimals: 1,
      valueMetricKey: '',
      sourceMultiplier: 1
    };
    const gaugeValue = bluetoothProfileUtil.getGaugeDisplayValue(gauge, this.metricStates || {});
    const detailUnit = gauge.detailUnit ? ` ${gauge.detailUnit}` : '';

    return {
      series: [{
        type: 'gauge',
        center: ['50%', '70%'],
        radius: '100%',
        startAngle: 180,
        endAngle: 0,
        min: gauge.min,
        max: gauge.max,
        splitNumber: gauge.splitNumber,
        progress: {
          show: true,
          roundCap: true,
          width: 15,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: '#4cd964' },
                { offset: 0.95, color: '#ffd700' },
                { offset: 1, color: '#fd666d' }
              ]
            }
          }
        },
        pointer: {
          show: true,
          length: '70%',
          width: 6,
          itemStyle: {
            color: '#ffffff'
          }
        },
        anchor: {
          show: true,
          showAbove: true,
          size: 12,
          itemStyle: {
            color: '#ffffff',
            borderColor: '#ff6a45',
            borderWidth: 4
          }
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 15,
            color: [[1, 'rgba(255, 255, 255, 0.1)']]
          }
        },
        axisTick: {
          show: true,
          distance: -15,
          splitNumber: 5,
          length: 8,
          lineStyle: {
            color: '#ffffff',
            width: 1,
            opacity: 0.6
          }
        },
        splitLine: {
          show: true,
          distance: -7,
          length: 20,
          lineStyle: {
            color: '#ffffff',
            width: 2,
            opacity: 0.8
          }
        },
        axisLabel: {
          show: true,
          color: '#ffffff',
          fontSize: 12,
          distance: 25
        },
        title: { show: false },
        detail: {
          show: true,
          offsetCenter: [0, 40],
          valueAnimation: true,
          fontSize: 24,
          fontWeight: 'bold',
          color: '#ffffff',
          formatter: function (value) {
            return `${Number(value).toFixed(gauge.detailDecimals || 1)}${detailUnit}`;
          }
        },
        data: [{ value: gaugeValue }]
      }]
    };
  },

  updateAllGaugeCharts() {
    Object.keys(this.gaugeCharts || {}).forEach((gaugeKey) => {
      const chart = this.gaugeCharts[gaugeKey];
      if (chart) {
        chart.setOption(this.buildGaugeOption(gaugeKey), true);
      }
    });
  },

  onSwiperChange(e) {
    const current = e.detail.current;
    this.setData({
      currentGaugeIndex: current,
      currentGaugeMetrics: this.buildCurrentGaugeMetrics(current, this.data.activeGauges)
    });
    setTimeout(() => {
      this.initGauge(current);
      this.updateAllGaugeCharts();
    }, 100);
  },

  initGauge(index) {
    const gauge = this.data.activeGauges[index];
    if (!gauge) {
      return;
    }

    const selectorMap = {
      voltage: '#voltage-gauge-canvas',
      current: '#current-gauge-canvas',
      pressure: '#pressure-gauge-canvas'
    };
    const selector = selectorMap[gauge.key];
    if (!selector) {
      return;
    }

    const gaugeChart = this.selectComponent(selector);
    if (gaugeChart) {
      gaugeChart.init();
    }
  },
});