const bluetoothProfileUtil = require('../../utils/bluetooth-profile.js');

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    autoCheckAdapter: {
      type: Boolean,
      value: true
    },
    showHeader: {
      type: Boolean,
      value: true
    }
  },

  data: {
    bluetoothAdapter: false,
    isSearching: false,
    deviceList: [],
    connectedDevice: null,
    messages: [],
    logs: [],
    lastMessageId: '',
    // 数据缓冲区，用于处理粘包
    dataBuffer: new ArrayBuffer(0),
    writeCharacteristic: null,
    // CMD回复映射表 
    cmdAckMap: {
      '0001': '8001', // 电池总电压 -> 电池总电压回复
      '0002': '8002', // 各节电池电压 -> 各节电池电压回复
      '0003': '8003', // 电池总电流 -> 电池总电流回复
      '0004': '8004', // 产品电芯温度 -> 产品电芯温度回复
      '0005': '8005', // 电池额定容量 -> 电池额定容量回复
      '0006': '8006', // 电量百分比 -> 电量百分比回复
      '0007': '8007', // 电池循环次数 -> 电池循环次数回复
      '0008': '8008', // 产品运行状态 -> 产品运行状态回复
      '0009': '8009', // 故障状态位 -> 故障状态位回复
      '000A': '800A', // 电池健康度 -> 电池健康度回复
      '000B': '800B', // 产品型号 -> 产品型号回复
      '000C': '800C' // 品牌 -> 品牌回复
    }
  },
  lifetimes: {
    attached() {
      if (this.data.autoCheckAdapter) {
        this.checkBluetoothAdapter();
      }
    },

    detached() {
      this.closeAllConnections();
      wx.offBluetoothDeviceFound();
      wx.offBLECharacteristicValueChange();
    }
  },

  methods: {
    // 检查蓝牙适配器状态
    checkBluetoothAdapter() {
      wx.getBluetoothAdapterState({
        success: (res) => {
          this.setData({
            bluetoothAdapter: res.available
          });
          if (res.available) {
            this.addLog('蓝牙适配器已就绪');
          } else {
            this.addLog('蓝牙适配器不可用', 'warn');
          }
        },
        fail: () => {
          this.setData({
            bluetoothAdapter: false
          });
          this.addLog('获取蓝牙适配器状态失败', 'error');
        }
      });
    },

    // 初始化蓝牙/开始搜索
    initializeBluetooth() {
      if (this.data.connectedDevice) {
        this.addLog('当前已有设备连接，请先断开后再搜索');
        return;
      }

      if (this.data.isSearching) {
        this.addLog('正在搜索中');
        return;
      }

      this.addLog('正在初始化蓝牙...');

      wx.openBluetoothAdapter({
        success: () => {
          this.setData({
            bluetoothAdapter: true
          });
          this.addLog('蓝牙适配器打开成功');
          this.startBluetoothSearch();
        },
        fail: (err) => {
          this.setData({
            bluetoothAdapter: false
          });
          this.addLog('打开蓝牙失败：' + err.errMsg, 'error');

          wx.showModal({
            title: '提示',
            content: '请开启手机蓝牙后重试',
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

    // 开始扫描
    startBluetoothSearch() {
      if (this.data.connectedDevice) {
        this.addLog('当前已有设备连接，请先断开后再搜索');
        return;
      }

      this.addLog('开始扫描蓝牙设备...');

      wx.onBluetoothDeviceFound((res) => {
        const devices = res.devices || [];
        devices.forEach(device => {
          this.addDeviceToList(device);
        });
      });

      wx.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
        interval: 0,
        success: () => {
          this.setData({
            isSearching: true
          });
          this.addLog('扫描已启动');
        },
        fail: (err) => {
          this.addLog('启动扫描失败：' + err.errMsg, 'error');
          this.setData({
            isSearching: false
          });
        }
      });

      setTimeout(() => {
        if (this.data.isSearching) {
          this.stopBluetoothSearch();
        }
      }, 10000);
    },

    // 停止搜索
    stopBluetoothSearch() {
      wx.stopBluetoothDevicesDiscovery({
        success: () => {
          this.setData({
            isSearching: false
          });
          this.addLog('已停止扫描');
        },
        fail: (err) => {
          this.addLog('停止扫描失败：' + err.errMsg, 'warn');
          this.setData({
            isSearching: false
          });
        }
      });
    },

    isBluetoothNameAllowed(device) {
      const deviceName = device.localName || device.name || '';
      if (!deviceName) {
        return false;
      }

      const app = getApp();
      if (!app || typeof app.isBluetoothNameAllowed !== 'function') {
        return true;
      }

      return app.isBluetoothNameAllowed(deviceName);
    },

    getCurrentBluetoothProfile() {
      const app = getApp();
      if (!app || typeof app.getBluetoothProfile !== 'function') {
        return bluetoothProfileUtil.getDefaultProfile(bluetoothProfileUtil.DEFAULT_ROOT);
      }

      const deviceName = this.data.connectedDevice && this.data.connectedDevice.name
        ? this.data.connectedDevice.name
        : '';
      return app.getBluetoothProfile(deviceName);
    },

    // 将设备加入列表
    addDeviceToList(device) {
      if (!device.localName && !device.name) {
        return;
      }

      if (!this.isBluetoothNameAllowed(device)) {
        return;
      }

      let list = this.data.deviceList;
      const index = list.findIndex(d => d.deviceId === device.deviceId);

      const newDevice = {
        name: device.localName || device.name,
        deviceId: device.deviceId,
        RSSI: device.RSSI || -100,
        connected: false
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
      if (this.data.connectedDevice?.deviceId === device.deviceId) {
        this.addLog('已连接至该设备');
        return;
      }

      this.addLog(`尝试连接设备：${device.name}`);

      if (this.data.isSearching) {
        this.stopBluetoothSearch();
      }

      wx.createBLEConnection({
        deviceId: device.deviceId,
        success: () => {
          const list = this.data.deviceList.map(d => ({
            ...d,
            connected: d.deviceId === device.deviceId
          }));

          this.setData({
            connectedDevice: {
              ...device,
              connected: true
            },
            deviceList: list,
            messages: [],
            dataBuffer: new ArrayBuffer(0)
          });

          this.addLog(`设备 ${device.name} 连接成功`);

          setTimeout(() => {
            this.setupNotification();
          }, 500);
        },
        fail: (err) => {
          this.addLog(`连接失败：${err.errMsg}`, 'error');
        }
      });
    },

    // 设置通知
    setupNotification() {
      if (!this.data.connectedDevice) return;

      const deviceId = this.data.connectedDevice.deviceId;

      wx.getBLEDeviceServices({
        deviceId,
        success: (res) => {
          const services = res.services || [];
          this.addLog(`发现 ${services.length} 个服务`);

          let serviceProcessed = 0;
          // 提前查找并缓存可写特征
          this.findAndCacheWriteCharacteristic(deviceId, services);

          services.forEach(service => {
            wx.getBLEDeviceCharacteristics({
              deviceId,
              serviceId: service.uuid,
              success: (charRes) => {
                const chars = charRes.characteristics || [];
                chars.forEach(char => {
                  if (char.properties.notify || char.properties.indicate) {
                    wx.notifyBLECharacteristicValueChange({
                      deviceId,
                      serviceId: service.uuid,
                      characteristicId: char.uuid,
                      state: true,
                      success: () => {
                        this.addLog(`已开启数据监听`);
                      }
                    });
                  }
                });
              },
              complete: () => {
                serviceProcessed++;
                if (serviceProcessed === services.length) {
                  this.addLog('准备接收数据...');
                }
              }
            });
          });
        },
        fail: (err) => {
          this.addLog(`获取服务失败：${err.errMsg}`, 'error');
        }
      });

      wx.onBLECharacteristicValueChange((result) => {
        this.processReceivedData(result.value);
      });
    },

    // 提前查找并缓存可写特征
    findAndCacheWriteCharacteristic(deviceId, services) {
      for (const service of services) {
        wx.getBLEDeviceCharacteristics({
          deviceId,
          serviceId: service.uuid,
          success: (charRes) => {
            const chars = charRes.characteristics || [];
            for (const char of chars) {
              if (char.properties.write || char.properties.writeNoResponse) {
                this.setData({
                  writeCharacteristic: {
                    serviceId: service.uuid,
                    characteristicId: char.uuid
                  }
                });
                this.addLog(`已缓存可写特征: ${char.uuid}`);
                return;
              }
            }
          }
        });
      }
    },

    // 处理接收到的数据
    processReceivedData(buffer) {
      const bytes = new Uint8Array(buffer);
      const hexStr = this.ab2hex(buffer);
      const time = this.formatTime();

      this.addLog(`收到原始数据包: ${hexStr}`, 'info');

      // 关键修改：完全忽略旧的缓冲区，直接解析当前收到的数据包
      // 不再使用 this.data.dataBuffer 进行追加

      // 直接解析当前收到的buffer，不依赖任何历史数据
      const {
        messages,
        remainingBuffer
      } = this.parseFrames(buffer); // 直接传buffer，不传this.data.dataBuffer

      // 更新消息列表 - 完全替换为当前解析出的数据
      if (messages.length > 0) {
        // 只保留校验和通过的消息
        const validMessages = messages.filter(msg => msg.parsed.checksumValid);
        
        if (validMessages.length > 0) {
          const newMessages = validMessages.map(msg => ({
            ...msg,
            time
          }));
      
          this.setData({
            messages: newMessages,
            lastMessageId: `msg-${newMessages.length - 1}`,
            dataBuffer: new ArrayBuffer(0)
          });
      
          this.addLog(`解析到 ${validMessages.length} 个有效数据帧`, 'success');
      
          // 只为有效的消息发送回复
          validMessages.forEach(msg => {
            this.addLog(`→ CMD: 0x${msg.parsed.cmd} (${msg.parsed.description})`, 'info');
      
            const cmdInt = parseInt(msg.parsed.cmd, 16);
            const isProductToUser = !(cmdInt & 0x8000);
      
            if (isProductToUser && msg.parsed.checksumValid) {
              this.sendAckForCmdImmediately(
                msg.parsed.cmdValue,
                msg.parsed.paramLength,
                msg.parsed.checksumValid
              );
            }
          });
        } else {
          let logMsg = '所有数据帧校验和失败，已丢弃';
          
          if (messages.length > 0 && messages[0].parsed) {
            const firstFailedFrame = messages[0].parsed;
            // 格式：正确的校验和应是：XX
            logMsg += `；正确的校验和应是：${firstFailedFrame.calculatedChecksum}`;
          }
          
          this.addLog(logMsg, 'warn');
          this.setData({ dataBuffer: new ArrayBuffer(0) });
        }
      }
    },

    // 立即发送回复帧（不经过任何延迟）
    sendAckForCmdImmediately(cmdValue, paramLength, checksumValid) {
      if (!this.data.connectedDevice) {
        this.addLog('未连接设备，无法发送回复', 'warn');
        return;
      }

      // 如果校验和失败，不发送回复
      if (!checksumValid) {
        this.addLog('校验和失败，不发送回复', 'warn');
        return;
      }

      const profile = this.getCurrentBluetoothProfile();
      const ackCmd = bluetoothProfileUtil.getAckCmd(profile, cmdValue) || this.data.cmdAckMap[cmdValue];
      if (!ackCmd) {
        this.addLog(`未知CMD: 0x${cmdValue}，无需回复`, 'debug');
        return;
      }

      const deviceId = this.data.connectedDevice.deviceId;

      // 解析回复CMD的高字节和低字节
      const ackCmdHigh = parseInt(ackCmd.substring(0, 2), 16);
      const ackCmdLow = parseInt(ackCmd.substring(2, 4), 16);

      // 构建回复帧: A5 [ackCmd] [参数长度] FF FF ... [校验和]
      const frame = [0xA5, ackCmdHigh, ackCmdLow, paramLength];

      // 添加参数（全部填充0xFF）
      for (let i = 0; i < paramLength; i++) {
        frame.push(0xFF);
      }

      // 计算校验和
      let sum = 0;
      for (let i = 0; i < frame.length; i++) {
        sum += frame[i];
      }
      const checksum = sum & 0xFF;
      frame.push(checksum);

      // 转换为ArrayBuffer
      const buffer = new Uint8Array(frame).buffer;
      const hexStr = this.ab2hex(buffer);

      this.addLog(`立即发送回复帧 [${ackCmd}]: ${hexStr}`, 'send');

      // 立即发送，不使用缓存，每次都重新查找可写特征
      this.sendDataImmediately(deviceId, buffer);
    },

    // 立即发送数据（每次都重新查找可写特征，确保发送成功）
    sendDataImmediately(deviceId, buffer) {
      wx.getBLEDeviceServices({
        deviceId,
        success: (res) => {
          const services = res.services || [];
          let sent = false;

          for (const service of services) {
            if (sent) break;

            wx.getBLEDeviceCharacteristics({
              deviceId,
              serviceId: service.uuid,
              success: (charRes) => {
                const chars = charRes.characteristics || [];

                for (const char of chars) {
                  // 查找可写的特征
                  if (char.properties.write || char.properties.writeNoResponse) {
                    // 立即发送
                    wx.writeBLECharacteristicValue({
                      deviceId,
                      serviceId: service.uuid,
                      characteristicId: char.uuid,
                      value: buffer,
                      success: () => {
                        this.addLog(`回复帧发送成功`, 'success');
                        // 缓存这个可写特征供下次使用
                        this.setData({
                          writeCharacteristic: {
                            serviceId: service.uuid,
                            characteristicId: char.uuid
                          }
                        });
                      },
                      fail: (err) => {
                        this.addLog(`回复帧发送失败: ${err.errMsg}`, 'error');
                      }
                    });
                    sent = true;
                    break;
                  }
                }
              }
            });
          }

          // 如果没有立即找到可写特征，设置一个定时器稍后重试
          setTimeout(() => {
            if (!sent) {
              this.addLog('未找到可写特征，尝试使用缓存发送', 'warn');
              if (this.data.writeCharacteristic) {
                wx.writeBLECharacteristicValue({
                  deviceId,
                  serviceId: this.data.writeCharacteristic.serviceId,
                  characteristicId: this.data.writeCharacteristic.characteristicId,
                  value: buffer,
                  success: () => {
                    this.addLog(`回复帧发送成功(使用缓存)`, 'success');
                  },
                  fail: (err) => {
                    this.addLog(`回复帧发送失败: ${err.errMsg}`, 'error');
                  }
                });
              }
            }
          }, 100);
        },
        fail: (err) => {
          this.addLog(`获取服务失败: ${err.errMsg}`, 'error');
        }
      });
    },

    // 发送对应CMD的回复帧
    sendAckForCmd(cmdValue, paramLength) {
      // 直接调用立即发送方法
      this.sendAckForCmdImmediately(cmdValue, paramLength, true);
    },

    // 查找可写的特征值并发送数据
    findAndWriteCharacteristic(deviceId, buffer) {
      wx.getBLEDeviceServices({
        deviceId,
        success: (res) => {
          const services = res.services || [];
          let found = false;
          let serviceCount = 0;

          if (services.length === 0) {
            this.addLog('未找到任何服务', 'warn');
            return;
          }

          // 遍历服务查找可写的特征
          for (const service of services) {
            wx.getBLEDeviceCharacteristics({
              deviceId,
              serviceId: service.uuid,
              success: (charRes) => {
                const chars = charRes.characteristics || [];

                for (const char of chars) {
                  // 查找可写的特征 (write 或 writeNoResponse)
                  if (char.properties.write || char.properties.writeNoResponse) {
                    // 缓存找到的写特征
                    this.setData({
                      writeCharacteristic: {
                        serviceId: service.uuid,
                        characteristicId: char.uuid
                      }
                    });

                    // 发送数据
                    wx.writeBLECharacteristicValue({
                      deviceId,
                      serviceId: service.uuid,
                      characteristicId: char.uuid,
                      value: buffer,
                      success: () => {
                        this.addLog(`回复帧发送成功`, 'success');
                      },
                      fail: (err) => {
                        this.addLog(`回复帧发送失败: ${err.errMsg}`, 'error');
                        this.setData({
                          writeCharacteristic: null
                        });
                      }
                    });
                    found = true;
                    break;
                  }
                }
              },
              complete: () => {
                serviceCount++;
                // 所有服务遍历完成后，如果没找到可写特征，给出提示
                if (serviceCount === services.length && !found) {
                  this.addLog('未找到可写的特征值', 'warn');
                }
              }
            });
          }
        },
        fail: (err) => {
          this.addLog(`获取服务失败: ${err.errMsg}`, 'error');
        }
      });
    },

    // 解析数据帧 - 根据完整通讯协议
    parseFrames(buffer) {
      const messages = [];
      const bytes = new Uint8Array(buffer);
      const profile = this.getCurrentBluetoothProfile();
      let offset = 0;

      // 如果buffer太小，直接返回空
      if (bytes.length < 5) {
        return {
          messages,
          remainingBuffer: new ArrayBuffer(0)
        };
      }

      while (offset < bytes.length) {
        // 1. 查找帧头 (Byte0) - 1字节，固定0xA5
        const frameStart = offset;
        const header = bytes[offset];

        // 验证帧头
        if (header !== 0xA5) {
          // 不是有效帧头，跳过当前字节继续查找
          offset++;
          continue;
        }

        // 已经找到帧头，开始解析完整帧
        offset++; // 跳过帧头

        // 2. CMD (Byte1-Byte2) - 2字节
        if (offset + 2 > bytes.length) {
          // 数据不足，直接返回已解析的消息，剩余数据不要了
          return {
            messages,
            remainingBuffer: new ArrayBuffer(0)
          };
        }

        const cmd = (bytes[offset] << 8) | bytes[offset + 1];
        offset += 2;

        // 3. 参数长度 (Byte3) - 1字节
        if (offset >= bytes.length) {
          return {
            messages,
            remainingBuffer: new ArrayBuffer(0)
          };
        }

        const paramLength = bytes[offset];
        offset += 1;

        // 检查是否有足够的数据（参数 + 校验和）
        if (offset + paramLength + 1 > bytes.length) {
          // 数据不足，直接返回已解析的消息，剩余数据不要了
          return {
            messages,
            remainingBuffer: new ArrayBuffer(0)
          };
        }

        // 4. 参数 (Byte4 开始) - N字节
        const params = [];
        for (let i = 0; i < paramLength; i++) {
          params.push(bytes[offset + i]);
        }
        offset += paramLength;

        // 5. 校验和 (最后1字节)
        const checksum = bytes[offset];
        offset += 1;

        // 计算校验和：从帧头开始到参数结束的所有字节累加，取低8位
        let sum = 0;
        for (let i = frameStart; i < offset - 1; i++) {
          sum += bytes[i];
        }
        const calculatedChecksum = sum & 0xFF;
        const checksumValid = (calculatedChecksum === checksum);

        // 构建完整的帧数据用于显示
        const frameBytes = [];
        for (let i = frameStart; i < offset; i++) {
          frameBytes.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
        }

        // 构建参数显示字符串
        let paramsDisplay = '';
        if (params.length > 0) {
          paramsDisplay = params.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        } else {
          paramsDisplay = '无';
        }

        // 解析参数值（根据不同CMD）
        let parsedValue = null;
        let parsedText = '';
        let unit = '';
        let description = '';
        let metricKey = '';
        let displayType = 'value';
        let displayValue = '';
        let statusClass = '';

        // 获取CMD的低15位（去掉方向位）
        const cmdValue = cmd & 0x7FFF;
        const cmdValueHex = cmdValue.toString(16).padStart(4, '0').toUpperCase();

        // 判断方向：最高位为0表示产品端发给用户端，为1表示用户端发送给产品端
        const direction = (cmd & 0x8000) ? '用户端→产品端' : '产品端→用户端';
        const isProductToUser = !(cmd & 0x8000);

        const parsedCommand = isProductToUser
          ? bluetoothProfileUtil.parseCommand(profile, cmdValueHex, params)
          : null;
        if (parsedCommand) {
          parsedValue = parsedCommand.value;
          parsedText = parsedCommand.text || '';
          unit = parsedCommand.unit || '';
          description = parsedCommand.description || parsedCommand.label || `CMD ${cmdValueHex}`;
          metricKey = parsedCommand.metricKey || '';
          displayType = parsedCommand.displayType || 'value';
          displayValue = Array.isArray(parsedCommand.formattedValue)
            ? parsedCommand.formattedValue.join(', ')
            : (parsedCommand.formattedValue || '');
          statusClass = parsedCommand.statusClass || '';
        } else {
          description = `未知CMD(0x${cmdValue.toString(16)})`;
        }

        // 检查是否为回复帧（参数为0xFFFFFFFF表示收到正确数据）
        let isAck = false;
        if (paramLength === 4) {
          const ackValue = (params[0] << 24) | (params[1] << 16) | (params[2] << 8) | params[3];
          if (ackValue === 0xFFFFFFFF) {
            isAck = true;
          }
        }

        // 构建消息对象
        messages.push({
          rawHex: frameBytes.join(' '),
          parsed: {
            header: header.toString(16).padStart(2, '0').toUpperCase(),
            cmd: cmd.toString(16).padStart(4, '0').toUpperCase(),
            cmdValue: cmdValueHex,
            direction: direction,
            description: description,
            paramLength: paramLength,
            params: paramsDisplay,
            parsedValue: parsedValue,
            parsedText: parsedText,
            unit: unit,
            metricKey: metricKey,
            displayType: displayType,
            displayValue: displayValue,
            statusClass: statusClass,
            isAck: isAck,
            checksum: checksum.toString(16).padStart(2, '0').toUpperCase(),
            checksumValid: checksumValid,
            calculatedChecksum: calculatedChecksum.toString(16).padStart(2, '0').toUpperCase()
          }
        });

        // 继续下一帧的解析，offset已经指向下一帧的开始位置
      }

      // 返回空剩余数据，避免残留
      return {
        messages,
        remainingBuffer: new ArrayBuffer(0)
      };
    },

    // 微信小程序兼容的UTF-8解码函数
    decodeUTF8(bytes) {
      try {
        // 将数字数组转换为Uint8Array
        const uint8Array = new Uint8Array(bytes);

        // 方法1：手动实现UTF-8解码（最稳定，避免URI错误）
        let result = '';
        let i = 0;

        while (i < uint8Array.length) {
          const byte1 = uint8Array[i];

          if (byte1 < 0x80) {
            // 单字节字符 (0xxxxxxx)
            result += String.fromCharCode(byte1);
            i++;
          } else if (byte1 >= 0xC0 && byte1 < 0xE0 && i + 1 < uint8Array.length) {
            // 双字节字符 (110xxxxx 10xxxxxx)
            const byte2 = uint8Array[i + 1];
            if ((byte2 & 0xC0) === 0x80) {
              const codePoint = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
              result += String.fromCharCode(codePoint);
              i += 2;
            } else {
              // 无效的UTF-8序列
              result += '?';
              i++;
            }
          } else if (byte1 >= 0xE0 && byte1 < 0xF0 && i + 2 < uint8Array.length) {
            // 三字节字符 (1110xxxx 10xxxxxx 10xxxxxx)
            const byte2 = uint8Array[i + 1];
            const byte3 = uint8Array[i + 2];
            if ((byte2 & 0xC0) === 0x80 && (byte3 & 0xC0) === 0x80) {
              const codePoint = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
              result += String.fromCharCode(codePoint);
              i += 3;
            } else {
              // 无效的UTF-8序列
              result += '?';
              i++;
            }
          } else if (byte1 >= 0xF0 && byte1 < 0xF8 && i + 3 < uint8Array.length) {
            // 四字节字符 (11110xxx 10xxxxxx 10xxxxxx 10xxxxxx)
            const byte2 = uint8Array[i + 1];
            const byte3 = uint8Array[i + 2];
            const byte4 = uint8Array[i + 3];
            if ((byte2 & 0xC0) === 0x80 && (byte3 & 0xC0) === 0x80 && (byte4 & 0xC0) === 0x80) {
              const codePoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
              // 四字节字符需要特殊处理（超出U+FFFF）
              if (codePoint > 0xFFFF) {
                const surrogatePair = this.codePointToSurrogatePair(codePoint);
                result += surrogatePair;
              } else {
                result += String.fromCharCode(codePoint);
              }
              i += 4;
            } else {
              // 无效的UTF-8序列
              result += '?';
              i++;
            }
          } else {
            // 无效的起始字节
            result += '?';
            i++;
          }
        }

        return result;
      } catch (e) {
        console.error('UTF-8解码失败:', e);

        // 方法2：备用方案 - 直接显示十六进制
        try {
          const hexStr = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join('');
          return '0x' + hexStr;
        } catch (e2) {
          return '[解码失败]';
        }
      }
    },
    codePointToSurrogatePair(codePoint) {
      const highSurrogate = Math.floor((codePoint - 0x10000) / 0x400) + 0xD800;
      const lowSurrogate = ((codePoint - 0x10000) % 0x400) + 0xDC00;
      return String.fromCharCode(highSurrogate) + String.fromCharCode(lowSurrogate);
    },
    // 合并ArrayBuffer
    appendBuffer(buffer1, buffer2) {
      const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
      tmp.set(new Uint8Array(buffer1), 0);
      tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
      return tmp.buffer;
    },

    // 断开连接
    disconnectDevice() {
      if (!this.data.connectedDevice) return;

      const deviceId = this.data.connectedDevice.deviceId;

      wx.closeBLEConnection({
        deviceId,
        success: () => {
          const list = this.data.deviceList.map(d => ({
            ...d,
            connected: false
          }));

          this.setData({
            connectedDevice: null,
            deviceList: list,
            messages: [],
            dataBuffer: new ArrayBuffer(0),
            writeCharacteristic: null
          });
          this.addLog('设备已断开连接');
        },
        fail: (err) => {
          this.addLog(`断开连接失败：${err.errMsg}`, 'error');
        }
      });
    },

    // 关闭所有连接
    closeAllConnections() {
      return new Promise((resolve) => {
        if (this.data.connectedDevice) {
          this.disconnectDevice();
        }
        wx.closeBluetoothAdapter({
          complete: () => {
            resolve();
          }
        });
      });
    },

    // 清除消息记录
    clearMessages() {
      this.setData({
        messages: [],
        dataBuffer: new ArrayBuffer(0)
      });
      this.addLog('已清除消息记录');
    },

    // 清除日志
    clearLogs() {
      this.setData({
        logs: []
      });
    },

    // 添加系统日志
    addLog(text, type = 'info') {
      const logs = [...this.data.logs, {
        time: this.formatTime(true),
        text: text,
        type: type
      }];
      if (logs.length > 20) logs.shift();
      this.setData({
        logs
      });

      if (type === 'error') {
        wx.vibrateShort({
          type: 'medium'
        });
      }
    },

    // 格式化时间
    formatTime(short = false) {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      const s = now.getSeconds().toString().padStart(2, '0');
      const ms = now.getMilliseconds().toString().padStart(3, '0');
      return short ? `${h}:${m}:${s}` : `${h}:${m}:${s}.${ms}`;
    },

    // ArrayBuffer 转 16进制字符串
    ab2hex(buffer) {
      const bytes = new Uint8Array(buffer);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
    },

    // 对外暴露的方法
    checkAdapter() {
      this.checkBluetoothAdapter();
    },

    startSearch() {
      this.initializeBluetooth();
    },

    stopSearch() {
      this.stopBluetoothSearch();
    },

    disconnect() {
      this.disconnectDevice();
    }
  }
})