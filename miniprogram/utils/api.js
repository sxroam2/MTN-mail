/**
 * 统一 API 请求封装
 * 默认走生产 API，开发调试时在 app.js 中显式覆盖 apiBaseUrl。
 */

const TOKEN_KEY = 'maxcellent_token';
const LANG = 'zh-cn';
const DEFAULT_API_BASE_URL = 'https://www.maxcellent-starter.com/API';

let cachedBaseUrl = DEFAULT_API_BASE_URL;

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function setBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized) {
    cachedBaseUrl = normalized;
  }
  return cachedBaseUrl;
}

function getBaseUrl() {
  let app = null;
  try {
    app = getApp();
  } catch (error) {
    app = null;
  }

  const runtimeBaseUrl = app && app.globalData && app.globalData.apiBaseUrl;
  if (runtimeBaseUrl) {
    return setBaseUrl(runtimeBaseUrl);
  }

  return cachedBaseUrl;
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

function isLoggedIn() {
  return !!getToken();
}

function buildRequestPath(path, query) {
  const queryParams = {
    ...(query || {})
  };

  if (queryParams.lang === undefined || queryParams.lang === null || queryParams.lang === '') {
    queryParams.lang = LANG;
  }

  const queryItems = [];
  Object.keys(queryParams).forEach((key) => {
    const value = queryParams[key];
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null || item === '') {
          return;
        }
        queryItems.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      });
      return;
    }

    queryItems.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });

  if (!queryItems.length) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${queryItems.join('&')}`;
}

/**
 * 通用请求方法
 * @param {string} path - API 路径，如 '/api/products'
 * @param {object} options - { method, data, header, showError }
 * @returns {Promise<{code, message, data}>}
 */
function request(path, options = {}) {
  const baseUrl = getBaseUrl();
  const token = getToken();
  const method = (options.method || 'GET').toUpperCase();
  
  const header = {
    'content-type': 'application/json',
    'Accept-Language': LANG,
    ...options.header
  };

  if (token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  const url = `${baseUrl}${buildRequestPath(path, options.query)}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: options.data,
      header,
      timeout: options.timeout || 15000,
      success: (res) => {
        if (res.statusCode === 401) {
          clearToken();
          if (options.showError !== false) {
            wx.showToast({ title: '请先登录', icon: 'none' });
          }
          reject({ code: 401, message: '未登录' });
          return;
        }
        if (res.statusCode >= 400) {
          const msg = (res.data && res.data.message) || `请求失败(${res.statusCode})`;
          if (options.showError !== false) {
            wx.showToast({ title: msg, icon: 'none' });
          }
          reject({ code: res.statusCode, message: msg, data: res.data });
          return;
        }
          const payload = res.data;
          const businessCode = payload && typeof payload.code === 'number'
            ? payload.code
            : payload && typeof payload.Code === 'number'
              ? payload.Code
              : null;
          const businessMessage = (payload && (payload.message || payload.Message)) || '请求失败';

          if (businessCode !== null && businessCode !== 200) {
            if (businessCode === 401) {
              clearToken();
            }
            if (options.showError !== false) {
              wx.showToast({ title: businessMessage, icon: 'none' });
            }
            reject({
              code: businessCode,
              message: businessMessage,
              data: payload && (payload.data || payload.Data)
            });
            return;
          }

          resolve(payload);
      },
      fail: (err) => {
        console.error(`[API] ${method} ${path} 失败:`, err);
        if (options.showError !== false) {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
        reject({ code: -1, message: '网络错误', error: err });
      }
    });
  });
}

function get(path, options = {}) {
  return request(path, { ...options, method: 'GET' });
}

function post(path, data, options = {}) {
  return request(path, { ...options, method: 'POST', data });
}

function put(path, data, options = {}) {
  return request(path, { ...options, method: 'PUT', data });
}

function del(path, options = {}) {
  return request(path, { ...options, method: 'DELETE' });
}

/**
 * 上传文件
 * @param {string} path - API 路径
 * @param {string} filePath - 本地文件路径
 * @param {string} name - 文件字段名，默认 'file'
 * @returns {Promise}
 */
function uploadFile(path, filePath, name = 'file') {
  const baseUrl = getBaseUrl();
  const token = getToken();
  const url = `${baseUrl}${path}?lang=${LANG}`;

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name,
      header: {
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode === 401) {
          clearToken();
          reject({ code: 401, message: '未登录' });
          return;
        }
        try {
          const data = JSON.parse(res.data);
          resolve(data);
        } catch (e) {
          resolve(res.data);
        }
      },
      fail: (err) => {
        reject({ code: -1, message: '上传失败', error: err });
      }
    });
  });
}

/**
 * 更新 TabBar 购物车角标数量
 * 在每个 TabBar 页面的 onShow 中调用
 */
function updateCartBadge() {
  if (!isLoggedIn()) {
    wx.removeTabBarBadge({ index: 2, fail: function () {} });
    return;
  }
  get('/api/cart').then(function (res) {
    var items = res && Array.isArray(res.data)
      ? res.data
      : Array.isArray(res)
        ? res
        : [];
    var count = 0;
    items.forEach(function (item) {
      count += (item.cartItem && item.cartItem.quantity) || 1;
    });
    if (count > 0) {
      wx.setTabBarBadge({ index: 2, text: String(count), fail: function () {} });
    } else {
      wx.removeTabBarBadge({ index: 2, fail: function () {} });
    }
  }).catch(function () {
    wx.removeTabBarBadge({ index: 2, fail: function () {} });
  });
}

module.exports = {
  get,
  post,
  put,
  del,
  request,
  uploadFile,
  getToken,
  setToken,
  setBaseUrl,
  clearToken,
  isLoggedIn,
  getBaseUrl,
  updateCartBadge
};
