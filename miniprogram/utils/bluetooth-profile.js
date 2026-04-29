const STATUS_ENUM_MAP = {
  '1': { text: '空闲', statusClass: 'idle' },
  '2': { text: '充电状态', statusClass: 'charging' },
  '4': { text: '放电状态', statusClass: 'discharging' },
  '8': { text: '异常状态', statusClass: 'error' }
};

const HEALTH_ENUM_MAP = {
  '1': { text: '优秀' },
  '2': { text: '良好' },
  '4': { text: '异常' }
};

const DEFAULT_PROFILE = {
  key: 'default',
  name: '默认电池协议',
  matchKeywords: [],
  metrics: [
    {
      key: 'totalVoltage',
      label: '电池总电压',
      unit: 'V',
      icon: '/assets/icons/voltage.png',
      displayType: 'value',
      defaultValue: '0.00',
      decimals: 2
    },
    {
      key: 'cellVoltages',
      label: '各节电池电压',
      unit: 'V',
      icon: '/assets/icons/battery-cell.png',
      displayType: 'grid',
      defaultValue: ['0.00'],
      decimals: 2
    },
    {
      key: 'current',
      label: '电池总电流',
      unit: 'A',
      icon: '/assets/icons/current.png',
      displayType: 'value',
      defaultValue: '0.0',
      decimals: 1
    },
    {
      key: 'temperature',
      label: '产品电芯温度',
      unit: '°C',
      icon: '/assets/icons/temperature.png',
      displayType: 'value',
      defaultValue: '0.0',
      decimals: 1
    },
    {
      key: 'capacity',
      label: '电池额定容量',
      unit: 'mAh',
      icon: '/assets/icons/capacity.png',
      displayType: 'value',
      defaultValue: '0',
      decimals: 0
    },
    {
      key: 'percentage',
      label: '电量百分比',
      unit: '%',
      icon: '/assets/icons/battery-cell.png',
      displayType: 'value',
      defaultValue: '0',
      decimals: 0
    },
    {
      key: 'cycleCount',
      label: '电池循环次数',
      unit: '次',
      icon: '/assets/icons/cycle.png',
      displayType: 'value',
      defaultValue: '0',
      decimals: 0
    },
    {
      key: 'status',
      label: '产品运行状态',
      unit: '',
      icon: '/assets/icons/status.png',
      displayType: 'value',
      defaultValue: '等待数据',
      decimals: 0
    },
    {
      key: 'faultStatus',
      label: '故障状态',
      unit: '',
      icon: '/assets/icons/fault.png',
      displayType: 'value',
      defaultValue: '',
      decimals: 0,
      hideWhenEmpty: true
    },
    {
      key: 'health',
      label: '电池健康度',
      unit: '',
      icon: '/assets/icons/health.png',
      displayType: 'value',
      defaultValue: '等待数据',
      decimals: 0
    },
    {
      key: 'brand',
      label: '品牌',
      unit: '',
      icon: '',
      displayType: 'value',
      defaultValue: '品牌',
      decimals: 0,
      hiddenInMetrics: true
    },
    {
      key: 'model',
      label: '产品型号',
      unit: '',
      icon: '',
      displayType: 'value',
      defaultValue: '型号',
      decimals: 0,
      hiddenInMetrics: true
    },
    {
      key: 'pressure',
      label: '胎压',
      unit: 'Bar',
      icon: '/assets/icons/pressure.png',
      displayType: 'value',
      defaultValue: '0.0',
      decimals: 1
    }
  ],
  commands: [
    { metricKey: 'totalVoltage', cmd: '0001', ackCmd: '8001', parser: 'int32', scale: 0.001, decimals: 2 },
    { metricKey: 'cellVoltages', cmd: '0002', ackCmd: '8002', parser: 'int16Array', scale: 0.001, decimals: 2 },
    { metricKey: 'current', cmd: '0003', ackCmd: '8003', parser: 'int32', scale: 0.001, decimals: 1 },
    { metricKey: 'temperature', cmd: '0004', ackCmd: '8004', parser: 'int32', scale: 0.1, offset: -100, decimals: 1 },
    { metricKey: 'capacity', cmd: '0005', ackCmd: '8005', parser: 'int32', decimals: 0 },
    { metricKey: 'percentage', cmd: '0006', ackCmd: '8006', parser: 'int32', decimals: 0 },
    { metricKey: 'cycleCount', cmd: '0007', ackCmd: '8007', parser: 'int32', decimals: 0 },
    { metricKey: 'status', cmd: '0008', ackCmd: '8008', parser: 'enum32', enumMap: STATUS_ENUM_MAP },
    { metricKey: 'faultStatus', cmd: '0009', ackCmd: '8009', parser: 'utf8' },
    { metricKey: 'health', cmd: '000A', ackCmd: '800A', parser: 'enum32', enumMap: HEALTH_ENUM_MAP },
    { metricKey: 'model', cmd: '000B', ackCmd: '800B', parser: 'utf8' },
    { metricKey: 'brand', cmd: '000C', ackCmd: '800C', parser: 'utf8' }
  ],
  gauges: [
    {
      key: 'voltage',
      title: '电压',
      visible: true,
      valueMetricKey: 'totalVoltage',
      metricKeys: ['totalVoltage', 'cellVoltages'],
      min: 5,
      max: 15,
      splitNumber: 5,
      detailUnit: 'V',
      detailDecimals: 1,
      sourceMultiplier: 1
    },
    {
      key: 'current',
      title: '电流',
      visible: true,
      valueMetricKey: 'current',
      metricKeys: ['current', 'temperature', 'capacity', 'cycleCount', 'health', 'status', 'faultStatus'],
      min: 100,
      max: 3000,
      splitNumber: 5,
      detailUnit: 'A',
      detailDecimals: 1,
      sourceMultiplier: 1000
    },
    {
      key: 'pressure',
      title: '胎压',
      visible: true,
      valueMetricKey: 'pressure',
      metricKeys: ['pressure', 'status', 'faultStatus'],
      min: 0,
      max: 18,
      splitNumber: 6,
      detailUnit: 'Bar',
      detailDecimals: 1,
      sourceMultiplier: 1
    }
  ]
};

const DEFAULT_ROOT = {
  defaultProfileKey: DEFAULT_PROFILE.key,
  deviceNameConfigs: [
    {
      keyword: 'RF-CRAZY',
      alias: '',
      imageUrl: '/assets/x2800.png'
    }
  ],
  profiles: [DEFAULT_PROFILE]
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeKeywordList(value) {
  if (Array.isArray(value)) {
    return value.map(trimString).filter(Boolean);
  }

  return trimString(value)
    .split(/[\r\n,，;；]+/)
    .map(trimString)
    .filter(Boolean);
}

function normalizeDeviceNameConfig(item) {
  if (typeof item === 'string') {
    return {
      keyword: trimString(item),
      alias: '',
      imageUrl: ''
    };
  }

  const source = Object.assign({}, item || {});
  return {
    keyword: trimString(source.keyword || source.name),
    alias: trimString(source.alias || source.displayName || source.title),
    imageUrl: trimString(source.imageUrl)
  };
}

function normalizeDeviceNameConfigList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = [];
  const indexMap = {};

  value.forEach(function (item) {
    const normalizedItem = normalizeDeviceNameConfig(item);
    if (!normalizedItem.keyword) {
      return;
    }

    const normalizedKey = normalizedItem.keyword.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(indexMap, normalizedKey)) {
      result[indexMap[normalizedKey]] = normalizedItem;
      return;
    }

    indexMap[normalizedKey] = result.length;
    result.push(normalizedItem);
  });

  return result;
}

function mergeListByKey(baseList, overrideList, keyGetter, mergeItem) {
  const result = [];
  const indexMap = {};

  (baseList || []).forEach(function (item) {
    const key = keyGetter(item);
    indexMap[key] = result.length;
    result.push(item);
  });

  (overrideList || []).forEach(function (item) {
    const key = keyGetter(item);
    if (!key) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(indexMap, key)) {
      const targetIndex = indexMap[key];
      result[targetIndex] = mergeItem(result[targetIndex], item);
      return;
    }

    indexMap[key] = result.length;
    result.push(mergeItem(null, item));
  });

  return result;
}

function normalizeMetric(metric, baseMetric) {
  const source = Object.assign({}, baseMetric || {}, metric || {});
  return {
    key: trimString(source.key),
    label: trimString(source.label || source.key),
    unit: trimString(source.unit),
    icon: trimString(source.icon),
    displayType: trimString(source.displayType || 'value'),
    defaultValue: source.defaultValue,
    decimals: normalizeNumber(source.decimals, 0),
    hideWhenEmpty: source.hideWhenEmpty === true,
    hiddenInMetrics: source.hiddenInMetrics === true
  };
}

function getCommandMergeKey(command) {
  return trimString(command && (command.metricKey || command.fieldKey || command.cmd));
}

function normalizeCommand(command, baseCommand) {
  const source = Object.assign({}, baseCommand || {}, command || {});
  return {
    metricKey: trimString(source.metricKey || source.fieldKey),
    cmd: trimString(source.cmd).toUpperCase(),
    ackCmd: trimString(source.ackCmd).toUpperCase(),
    parser: trimString(source.parser || 'int32'),
    scale: normalizeNumber(source.scale, 1),
    offset: normalizeNumber(source.offset, 0),
    decimals: normalizeNumber(source.decimals, 0),
    enumMap: Object.assign({}, (baseCommand && baseCommand.enumMap) || {}, source.enumMap || {})
  };
}

function normalizeGauge(gauge, baseGauge) {
  const source = Object.assign({}, baseGauge || {}, gauge || {});
  return {
    key: trimString(source.key),
    title: trimString(source.title || source.key),
    visible: source.visible !== false,
    valueMetricKey: trimString(source.valueMetricKey),
    metricKeys: Array.isArray(source.metricKeys) ? source.metricKeys.map(trimString).filter(Boolean) : [],
    min: normalizeNumber(source.min, 0),
    max: normalizeNumber(source.max, 100),
    splitNumber: normalizeNumber(source.splitNumber, 5),
    detailUnit: trimString(source.detailUnit),
    detailDecimals: normalizeNumber(source.detailDecimals, 1),
    sourceMultiplier: normalizeNumber(source.sourceMultiplier, 1)
  };
}

function normalizeProfile(profile, inheritedProfile) {
  const profileSource = profile || {};
  const baseProfile = inheritedProfile || DEFAULT_PROFILE;
  const inheritDefault = profileSource.inheritDefault !== false;
  const mergeBase = inheritDefault ? baseProfile : { metrics: [], commands: [], gauges: [] };

  const metrics = mergeListByKey(
    mergeBase.metrics || [],
    Array.isArray(profileSource.metrics) ? profileSource.metrics : [],
    function (item) {
      return trimString(item && item.key);
    },
    function (baseMetric, overrideMetric) {
      return normalizeMetric(overrideMetric, baseMetric);
    }
  );

  const commands = mergeListByKey(
    mergeBase.commands || [],
    Array.isArray(profileSource.commands) ? profileSource.commands : [],
    getCommandMergeKey,
    function (baseCommand, overrideCommand) {
      return normalizeCommand(overrideCommand, baseCommand);
    }
  ).filter(function (command) {
    return command.metricKey && command.cmd;
  });

  const gauges = mergeListByKey(
    mergeBase.gauges || [],
    Array.isArray(profileSource.gauges) ? profileSource.gauges : [],
    function (item) {
      return trimString(item && item.key);
    },
    function (baseGauge, overrideGauge) {
      return normalizeGauge(overrideGauge, baseGauge);
    }
  ).filter(function (gauge) {
    return gauge.key;
  });

  return {
    key: trimString(profileSource.key || baseProfile.key || 'default'),
    name: trimString(profileSource.name || baseProfile.name || '默认协议'),
    matchKeywords: normalizeKeywordList(profileSource.matchKeywords),
    metrics: metrics,
    commands: commands,
    gauges: gauges
  };
}

function parseBluetoothProfileConfig(rawConfig) {
  if (!rawConfig) {
    return deepClone(DEFAULT_ROOT);
  }

  let parsed = rawConfig;
  if (typeof rawConfig === 'string') {
    try {
      parsed = JSON.parse(rawConfig);
    } catch (error) {
      return deepClone(DEFAULT_ROOT);
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return deepClone(DEFAULT_ROOT);
  }

  const rootSource = Array.isArray(parsed) ? { profiles: parsed } : parsed;
  const configuredDefaultKey = trimString(rootSource.defaultProfileKey || DEFAULT_PROFILE.key) || DEFAULT_PROFILE.key;
  const deviceNameConfigs = normalizeDeviceNameConfigList(rootSource.deviceNameConfigs);
  const rawProfiles = Array.isArray(rootSource.profiles) ? rootSource.profiles : [];
  const defaultOverride = rawProfiles.find(function (profile) {
    return trimString(profile && profile.key) === configuredDefaultKey;
  }) || { key: configuredDefaultKey };
  const defaultProfile = normalizeProfile(defaultOverride, DEFAULT_PROFILE);

  const profiles = [defaultProfile];
  rawProfiles.forEach(function (profile) {
    const key = trimString(profile && profile.key);
    if (!key || key === configuredDefaultKey) {
      return;
    }

    profiles.push(normalizeProfile(profile, defaultProfile));
  });

  return {
    defaultProfileKey: configuredDefaultKey,
    deviceNameConfigs: deviceNameConfigs,
    profiles: profiles
  };
}

function getDefaultProfile(config) {
  const root = config && Array.isArray(config.profiles) ? config : DEFAULT_ROOT;
  const defaultKey = trimString(root.defaultProfileKey || DEFAULT_PROFILE.key) || DEFAULT_PROFILE.key;
  const matched = root.profiles.find(function (profile) {
    return trimString(profile && profile.key) === defaultKey;
  });
  return matched || root.profiles[0] || DEFAULT_PROFILE;
}

function getMatchedProfile(config, deviceName) {
  const root = config && Array.isArray(config.profiles) ? config : DEFAULT_ROOT;
  const normalizedName = trimString(deviceName).toLowerCase();
  const defaultProfile = getDefaultProfile(root);

  if (!normalizedName) {
    return defaultProfile;
  }

  const matched = root.profiles.find(function (profile) {
    if (profile === defaultProfile) {
      return false;
    }

    return (profile.matchKeywords || []).some(function (keyword) {
      return normalizedName.includes(trimString(keyword).toLowerCase());
    });
  });

  return matched || defaultProfile;
}

function getMatchedDeviceNameConfig(config, deviceName) {
  const root = config && Array.isArray(config.deviceNameConfigs) ? config : DEFAULT_ROOT;
  const normalizedName = trimString(deviceName).toLowerCase();

  if (!normalizedName) {
    return null;
  }

  let matched = null;
  (root.deviceNameConfigs || []).forEach(function (item) {
    const normalizedKeyword = trimString(item && item.keyword).toLowerCase();
    if (!normalizedKeyword || normalizedName.indexOf(normalizedKeyword) === -1) {
      return;
    }

    if (!matched || normalizedKeyword.length > trimString(matched.keyword).length) {
      matched = item;
    }
  });

  return matched;
}

function getMetricDefinition(profile, metricKey) {
  return (profile.metrics || []).find(function (metric) {
    return trimString(metric.key) === trimString(metricKey);
  }) || null;
}

function getCommandDefinition(profile, cmd) {
  const normalizedCmd = trimString(cmd).toUpperCase();
  return (profile.commands || []).find(function (command) {
    return trimString(command.cmd).toUpperCase() === normalizedCmd;
  }) || null;
}

function getAckCmd(profile, cmd) {
  const command = getCommandDefinition(profile, cmd);
  return command ? trimString(command.ackCmd).toUpperCase() : '';
}

function readInt32(bytes) {
  if (!bytes || bytes.length < 4) {
    return null;
  }

  return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
}

function readUInt16Array(bytes) {
  const result = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    result.push((bytes[index] << 8) | bytes[index + 1]);
  }
  return result;
}

function decodeUTF8(bytes) {
  try {
    const uint8Array = new Uint8Array(bytes || []);
    let result = '';
    let index = 0;

    while (index < uint8Array.length) {
      const byte1 = uint8Array[index];
      if (byte1 < 0x80) {
        result += String.fromCharCode(byte1);
        index += 1;
        continue;
      }

      if (byte1 >= 0xC0 && byte1 < 0xE0 && index + 1 < uint8Array.length) {
        const byte2 = uint8Array[index + 1];
        if ((byte2 & 0xC0) === 0x80) {
          result += String.fromCharCode(((byte1 & 0x1F) << 6) | (byte2 & 0x3F));
          index += 2;
          continue;
        }
      }

      if (byte1 >= 0xE0 && byte1 < 0xF0 && index + 2 < uint8Array.length) {
        const byte2 = uint8Array[index + 1];
        const byte3 = uint8Array[index + 2];
        if ((byte2 & 0xC0) === 0x80 && (byte3 & 0xC0) === 0x80) {
          result += String.fromCharCode(
            ((byte1 & 0x0F) << 12) |
              ((byte2 & 0x3F) << 6) |
              (byte3 & 0x3F)
          );
          index += 3;
          continue;
        }
      }

      result += '?';
      index += 1;
    }

    return result;
  } catch (error) {
    return '';
  }
}

function formatScalarValue(value, decimals) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(decimals);
  }

  return trimString(value);
}

function buildMetricState(metricDefinition, payload) {
  const metric = metricDefinition || {};
  const displayType = trimString(metric.displayType || 'value');
  const decimals = normalizeNumber(metric.decimals, 0);
  const sourceValue = payload && Object.prototype.hasOwnProperty.call(payload, 'value')
    ? payload.value
    : metric.defaultValue;
  const sourceText = payload && Object.prototype.hasOwnProperty.call(payload, 'text')
    ? payload.text
    : '';
  const numericValue = payload && Object.prototype.hasOwnProperty.call(payload, 'numericValue')
    ? payload.numericValue
    : typeof sourceValue === 'number'
      ? sourceValue
      : null;

  let displayValue = sourceText;
  let displayItems = [];

  if (displayType === 'grid') {
    const values = Array.isArray(sourceValue) && sourceValue.length ? sourceValue : (Array.isArray(metric.defaultValue) ? metric.defaultValue : []);
    displayItems = values.map(function (item, index) {
      return {
        label: String(index + 1),
        value: formatScalarValue(item, decimals),
        unit: trimString(metric.unit)
      };
    });
    displayValue = displayItems.length ? displayItems.map(function (item) { return item.value; }).join(', ') : '';
  } else if (!displayValue) {
    displayValue = formatScalarValue(sourceValue, decimals);
  }

  return {
    key: trimString(metric.key),
    label: trimString(metric.label),
    unit: trimString(metric.unit),
    icon: trimString(metric.icon),
    displayType: displayType,
    value: sourceValue,
    numericValue: numericValue,
    displayValue: displayValue,
    displayItems: displayItems,
    statusClass: payload && payload.statusClass ? payload.statusClass : '',
    hideWhenEmpty: metric.hideWhenEmpty === true,
    hiddenInMetrics: metric.hiddenInMetrics === true
  };
}

function getDefaultMetricStates(profile) {
  const metricStates = {};
  (profile.metrics || []).forEach(function (metricDefinition) {
    metricStates[metricDefinition.key] = buildMetricState(metricDefinition, null);
  });
  return metricStates;
}

function parseCommand(profile, cmd, params) {
  const command = getCommandDefinition(profile, cmd);
  if (!command) {
    return null;
  }

  const metricDefinition = getMetricDefinition(profile, command.metricKey);
  if (!metricDefinition) {
    return null;
  }

  const parser = trimString(command.parser || 'int32').toLowerCase();
  const scale = normalizeNumber(command.scale, 1);
  const offset = normalizeNumber(command.offset, 0);
  const decimals = normalizeNumber(command.decimals, metricDefinition.decimals || 0);

  let rawValue = null;
  let value = null;
  let text = '';
  let numericValue = null;
  let statusClass = '';

  if (parser === 'int16array') {
    rawValue = readUInt16Array(params);
    value = rawValue.map(function (item) {
      return item * scale + offset;
    });
  } else if (parser === 'utf8') {
    rawValue = decodeUTF8(params);
    value = rawValue;
    text = rawValue;
  } else {
    rawValue = readInt32(params);
    if (rawValue == null) {
      return null;
    }

    if (parser === 'enum32') {
      const enumEntry = command.enumMap[String(rawValue)] || command.enumMap[rawValue];
      value = rawValue;
      numericValue = rawValue;
      if (typeof enumEntry === 'string') {
        text = enumEntry;
      } else if (enumEntry && typeof enumEntry === 'object') {
        text = trimString(enumEntry.text || rawValue);
        statusClass = trimString(enumEntry.statusClass);
      } else {
        text = String(rawValue);
      }
    } else {
      value = rawValue * scale + offset;
      numericValue = value;
    }
  }

  return {
    metricKey: metricDefinition.key,
    label: metricDefinition.label,
    description: metricDefinition.label,
    metricState: buildMetricState(metricDefinition, {
      value: value,
      text: text,
      numericValue: numericValue,
      statusClass: statusClass
    }),
    rawValue: rawValue,
    value: value,
    text: text,
    statusClass: statusClass,
    unit: trimString(metricDefinition.unit),
    displayType: trimString(metricDefinition.displayType),
    formattedValue: parser === 'enum32'
      ? text
      : Array.isArray(value)
        ? value.map(function (item) { return formatScalarValue(item, decimals); })
        : formatScalarValue(value, decimals)
  };
}

function getVisibleGauges(profile) {
  return (profile.gauges || []).filter(function (gauge) {
    return gauge.visible !== false;
  });
}

function getGaugeDefinition(profile, gaugeKey) {
  return (profile.gauges || []).find(function (gauge) {
    return trimString(gauge.key) === trimString(gaugeKey);
  }) || null;
}

function getGaugeDisplayValue(gauge, metricStates) {
  const metricState = metricStates && metricStates[gauge.valueMetricKey];
  const rawNumericValue = metricState && typeof metricState.numericValue === 'number'
    ? metricState.numericValue
    : normalizeNumber(metricState && metricState.value, 0);
  return rawNumericValue * normalizeNumber(gauge.sourceMultiplier, 1);
}

function buildAckFrame(cmd) {
  const normalizedAckCmd = trimString(cmd).toUpperCase();
  if (!normalizedAckCmd || normalizedAckCmd.length !== 4) {
    return null;
  }

  const cmdHigh = parseInt(normalizedAckCmd.substring(0, 2), 16);
  const cmdLow = parseInt(normalizedAckCmd.substring(2, 4), 16);
  if (!Number.isFinite(cmdHigh) || !Number.isFinite(cmdLow)) {
    return null;
  }

  const frame = [0xA5, cmdHigh, cmdLow, 0x04, 0xFF, 0xFF, 0xFF, 0xFF];
  const checksum = frame.reduce(function (sum, item) {
    return sum + item;
  }, 0) & 0xFF;
  frame.push(checksum);
  return new Uint8Array(frame).buffer;
}

module.exports = {
  DEFAULT_ROOT,
  DEFAULT_PROFILE,
  parseBluetoothProfileConfig,
  getDefaultProfile,
  getMatchedProfile,
  getMatchedDeviceNameConfig,
  getMetricDefinition,
  getCommandDefinition,
  getAckCmd,
  parseCommand,
  getDefaultMetricStates,
  getVisibleGauges,
  getGaugeDefinition,
  getGaugeDisplayValue,
  buildAckFrame
};