var api = require('../../../utils/api.js')

function createEmptyForm() {
  return {
    invoiceType: '1',
    invoicePerson: '1',
    title: '',
    taxNo: '',
    email: '',
    registerAddress: '',
    phone: '',
    bankName: '',
    bankAccount: ''
  }
}

function normalizeInvoiceType(value) {
  return String(Number(value) === 2 ? 2 : 1)
}

function normalizeInvoicePerson(value, invoiceType) {
  if (String(invoiceType) === '2') {
    return '2'
  }
  return String(Number(value) === 2 ? 2 : 1)
}

function buildFormFromSource(source) {
  var invoiceType = normalizeInvoiceType(source && (source.invoiceType != null ? source.invoiceType : source.type))
  return {
    invoiceType: invoiceType,
    invoicePerson: normalizeInvoicePerson(source && (source.invoicePerson != null ? source.invoicePerson : source.type), invoiceType),
    title: String(source && source.title || '').trim(),
    taxNo: String(source && (source.taxNo != null ? source.taxNo : source.taxNumber) || '').trim(),
    email: String(source && source.email || '').trim(),
    registerAddress: String(source && source.registerAddress || '').trim(),
    phone: String(source && source.phone || '').trim(),
    bankName: String(source && source.bankName || '').trim(),
    bankAccount: String(source && source.bankAccount || '').trim()
  }
}

function mergeInvoiceForm(baseForm, overrideForm) {
  var merged = Object.assign(createEmptyForm(), baseForm || {})
  var override = overrideForm || {}

  if (override.invoiceType != null) {
    merged.invoiceType = normalizeInvoiceType(override.invoiceType)
  }
  if (override.invoicePerson != null) {
    merged.invoicePerson = normalizeInvoicePerson(override.invoicePerson, merged.invoiceType)
  }

  ;['title', 'taxNo', 'email', 'registerAddress', 'phone', 'bankName', 'bankAccount'].forEach(function (field) {
    var value = String(override[field] || '').trim()
    if (value) {
      merged[field] = value
    }
  })

  merged.invoicePerson = normalizeInvoicePerson(merged.invoicePerson, merged.invoiceType)
  return merged
}

Page({
  data: {
    mode: 'edit',
    orderNo: '',
    form: createEmptyForm(),
    loading: false,
    saving: false
  },

  onLoad: function (options) {
    var mode = options.mode === 'apply' ? 'apply' : 'edit'
    var prefill = createEmptyForm()

    if (options.data) {
      try {
        prefill = mergeInvoiceForm(prefill, buildFormFromSource(JSON.parse(decodeURIComponent(options.data))))
      } catch (e) {
        prefill = createEmptyForm()
      }
    }

    this.setData({
      mode: mode,
      orderNo: String(options.orderNo || ''),
      form: prefill
    })

    if (mode === 'apply') {
      this.loadSavedInvoiceProfile(prefill)
    }
  },

  loadSavedInvoiceProfile: function (prefill) {
    var that = this
    that.setData({ loading: true })
    api.get('/api/invoice/me', { showError: false }).then(function (res) {
      var profile = res && (res.data || res)
      if (!profile) {
        return
      }

      that.setData({
        form: mergeInvoiceForm(buildFormFromSource(profile), prefill)
      })
    }).catch(function () {
      return null
    }).finally(function () {
      that.setData({ loading: false })
    })
  },

  onInvoiceTypeChange: function (e) {
    var invoiceType = normalizeInvoiceType(e.detail)
    this.setData({
      'form.invoiceType': invoiceType,
      'form.invoicePerson': normalizeInvoicePerson(this.data.form.invoicePerson, invoiceType)
    })
  },

  switchInvoiceType: function (e) {
    this.onInvoiceTypeChange({ detail: e.currentTarget.dataset.type })
  },

  onInvoicePersonChange: function (e) {
    if (this.data.form.invoiceType === '2') {
      return
    }
    this.setData({
      'form.invoicePerson': normalizeInvoicePerson(e.detail, this.data.form.invoiceType)
    })
  },

  switchInvoiceSubject: function (e) {
    this.onInvoicePersonChange({ detail: e.currentTarget.dataset.subject })
  },

  onFieldChange: function (e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail })
  },

  buildPayload: function () {
    var form = this.data.form || createEmptyForm()
    var invoiceType = Number(form.invoiceType) === 2 ? 2 : 1
    var invoicePerson = invoiceType === 2 ? 2 : (Number(form.invoicePerson) === 2 ? 2 : 1)
    var title = String(form.title || '').trim()
    var taxNumber = invoicePerson === 2 ? String(form.taxNo || '').trim() : ''
    var email = String(form.email || '').trim()
    var registerAddress = invoiceType === 2 ? String(form.registerAddress || '').trim() : ''
    var phone = invoiceType === 2 ? String(form.phone || '').trim() : ''
    var bankName = invoiceType === 2 ? String(form.bankName || '').trim() : ''
    var bankAccount = invoiceType === 2 ? String(form.bankAccount || '').trim() : ''
    var emailReg = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

    if (!title) {
      return { error: '请输入发票抬头' }
    }
    if (!email) {
      return { error: '请输入接收邮箱' }
    }
    if (!emailReg.test(email)) {
      return { error: '请输入正确的邮箱地址' }
    }
    if (invoicePerson === 2 && !taxNumber) {
      return { error: '请输入企业税号' }
    }
    if (invoiceType === 2) {
      if (!registerAddress) {
        return { error: '请输入注册地址' }
      }
      if (!phone) {
        return { error: '请输入注册电话' }
      }
      if (!bankName) {
        return { error: '请输入开户银行' }
      }
      if (!bankAccount) {
        return { error: '请输入银行账号' }
      }
    }

    return {
      invoiceType: invoiceType,
      invoicePerson: invoicePerson,
      title: title,
      taxNumber: taxNumber,
      email: email,
      registerAddress: registerAddress,
      phone: phone,
      bankName: bankName,
      bankAccount: bankAccount
    }
  },

  saveInvoiceProfile: function (payload) {
    return api.request('/api/invoice/save', {
      method: 'POST',
      header: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      data: {
        invoiceType: payload.invoiceType,
        invoicePerson: payload.invoicePerson,
        title: payload.title,
        taxNumber: payload.taxNumber || '',
        email: payload.email,
        registerAddress: payload.registerAddress || '',
        phone: payload.phone || '',
        bankName: payload.bankName || '',
        bankAccount: payload.bankAccount || ''
      }
    })
  },

  applyInvoiceForOrder: function (payload) {
    var that = this
    if (!that.data.orderNo) {
      wx.showToast({ title: '订单号不能为空', icon: 'none' })
      return
    }

    that.setData({ saving: true })
    that.saveInvoiceProfile(payload).then(function () {
      return api.post('/api/orders/apply-invoice/' + encodeURIComponent(that.data.orderNo), {
        invoiceType: payload.invoiceType,
        invoicePerson: payload.invoicePerson,
        title: payload.title,
        taxNumber: payload.taxNumber || null,
        email: payload.email
      })
    }).then(function () {
      wx.showToast({ title: '申请成功', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 500)
    }).catch(function () {
      return null
    }).finally(function () {
      that.setData({ saving: false })
    })
  },

  saveInvoice: function () {
    var payload = this.buildPayload()
    if (payload.error) {
      wx.showToast({ title: payload.error, icon: 'none' })
      return
    }

    if (this.data.mode === 'apply') {
      this.applyInvoiceForOrder(payload)
      return
    }

    var pages = getCurrentPages()
    if (pages.length >= 2) {
      var prevPage = pages[pages.length - 2]
      prevPage._invoiceInfo = {
        type: payload.invoiceType,
        title: payload.title,
        taxNo: payload.taxNumber,
        email: payload.email,
        regAddress: payload.registerAddress,
        regPhone: payload.phone,
        bankName: payload.bankName,
        bankAccount: payload.bankAccount
      }
    }

    wx.navigateBack()
  }
})
