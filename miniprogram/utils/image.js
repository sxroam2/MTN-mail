/**
 * 图片 URL 解析工具
 * 将相对路径转为完整 URL
 */
var api = require('./api.js')

function getApiBaseUrl() {
  return api.getBaseUrl().replace(/\/+$/, '')
}

function joinUrl(base, path) {
  if (!path) return base
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path)
}

function resolveImageUrl(url) {
  if (!url) return ''
  if (/^(data:|blob:|wxfile:)/i.test(url)) return url
  if (/^\/?assets\//i.test(url)) return url.startsWith('/') ? url : '/' + url

  var apiBaseUrl = getApiBaseUrl()
  var apiOrigin = apiBaseUrl.replace(/\/API$/i, '')
  var normalizedUrl = String(url).trim()

  if (/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = normalizedUrl.replace(/^https?:\/\/[^/]+/i, '')
  }

  if (/^\/api\//i.test(normalizedUrl)) {
    return joinUrl(apiOrigin, normalizedUrl)
  }

  return joinUrl(apiBaseUrl, normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl)
}

module.exports = { resolveImageUrl }
