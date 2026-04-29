// pages/admin/config.js
const app = getApp();

Page({
  data: {
    homeTitle: '',
    carouselData: [],
    defaultDeviceImage: '',
    currentCarouselIndex: -1, // -1 表示新增，>=0 表示编辑第几个
    showCarouselDialog: false, // 控制弹窗显示
    carouselForm: {
      id: null,
      image: '',
      model: '',
      sortOrder: 0
    },
    uploading: false,
    activeTab: 'home',
    loading: false
  },

  onLoad() {
    this.loadConfig();
  },

  onShow() {
    this.loadConfig();
  },

  loadConfig() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    Promise.all([
      this.getHomeConfig(),
      this.getCarouselList()
    ]).then(() => {
      wx.hideLoading();
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    });
  },
  // 通用同步函数 (可以在 config.js 顶部定义)
  syncToHomeAndGlobal() {
    // 1. 确保全局数据是最新的 (假设 this.data.carouselData 刚刷新过)
    app.globalData.carouselData = this.data.carouselData;

    // 2. 如果 home 页面在栈中，强制它重新渲染缓存 (无网络请求，瞬间完成)
    const pages = getCurrentPages();
    const homePage = pages.find(page => page.route === 'pages/home/home');
    if (homePage && homePage.renderFromCache) {
      homePage.renderFromCache();
    }
  },
  getHomeConfig() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/Mail/GetHomeConfig`,
        method: 'GET',
        success: (res) => {
          if (res.data && (res.data.code === 0 || res.data.Code === 0) && res.data.tradeList && res.data.tradeList.length > 0) {
            const config = res.data.tradeList[0];
            this.setData({
              homeTitle: config.title || config.Title || '迈瑟伦一体机',
              defaultDeviceImage: config.defaultDeviceImage || config.DefaultDeviceImage || '/assets/default-device.png'
            });
          }
          resolve();
        },
        fail: (err) => {
          console.error('获取首页配置失败:', err);
          reject(err);
        }
      });
    });
  },

  getCarouselList() {
    this.setData({
      loading: true
    });
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.apiBaseUrl}/Mail/GetCarouselList`,
        method: 'GET',
        success: (res) => {
          this.setData({
            loading: false
          });
          if (res.data && (res.data.code === 0 || res.data.Code === 0)) {
            const rawList = res.data.tradeList || res.data.TradeList || [];
            const normalizedList = rawList.map(item => ({
              id: item.Id || item.id,
              imageUrl: item.ImageUrl || item.imageUrl || '',
              model: item.Model || item.model || '',
              sortOrder: item.SortOrder || item.sortOrder || 0,
              isActive: item.IsActive || item.isActive
            }));
            normalizedList.sort((a, b) => a.sortOrder - b.sortOrder);
            this.setData({
              carouselData: normalizedList
            });
            resolve();
          } else {
            wx.showToast({
              title: res.data?.message || '加载失败',
              icon: 'error'
            });
            reject();
          }
        },
        fail: (err) => {
          this.setData({
            loading: false
          });
          console.error('加载轮播图失败', err);
          wx.showToast({
            title: '网络错误',
            icon: 'error'
          });
          reject(err);
        }
      });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab
    });
  },

  onHomeTitleInput(e) {
    this.setData({
      homeTitle: e.detail.value
    });
  },

  saveHomeTitle() {
    if (!this.data.homeTitle) {
      wx.showToast({
        title: '请输入标题',
        icon: 'none'
      });
      return;
    }
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    app.updateHomeTitle(this.data.homeTitle).then(() => {
      wx.hideLoading();
      app.refreshConfig();
      this.getHomeConfig();
      const pages = getCurrentPages();
      const homePage = pages.find(page => page.route === 'pages/home/home');
      if (homePage && homePage.loadConfig) homePage.loadConfig();
      wx.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 1500
      });
    }).catch((err) => {
      wx.hideLoading();
      wx.showToast({
        title: err?.message || '保存失败',
        icon: 'error'
      });
    });
  },

  chooseDefaultDeviceImage() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({
          title: '上传中...',
          mask: true
        });
        that.uploadImage(tempFilePath, 'default').then(imageUrl => {
          wx.hideLoading();
          app.updateDefaultDeviceImage(imageUrl).then(() => {
            that.setData({
              defaultDeviceImage: imageUrl
            });
            wx.showToast({
              title: '更新成功',
              icon: 'success'
            });
          }).catch(() => {
            wx.showToast({
              title: '更新失败',
              icon: 'error'
            });
          });
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({
            title: '上传失败',
            icon: 'error'
          });
        });
      }
    });
  },

  // --- 轮播图相关逻辑开始 ---

  addCarousel() {
    // 新增模式：index = -1, 表单清空
    this.setData({
      showCarouselDialog: true,
      currentCarouselIndex: -1,
      carouselForm: {
        id: null,
        image: '',
        model: '',
        sortOrder: 0
      }
    });
  },

  editCarousel(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.carouselData[index];

    if (!item || !item.id) {
      wx.showToast({
        title: '数据异常',
        icon: 'error'
      });
      return;
    }

    // 编辑模式：index = 当前索引，表单填入数据
    this.setData({
      showCarouselDialog: true,
      currentCarouselIndex: index,
      carouselForm: {
        id: item.id,
        image: item.imageUrl,
        model: item.model,
        sortOrder: item.sortOrder
      }
    });
  },

  deleteCarousel(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.carouselData;

    // 安全检查
    if (index < 0 || index >= list.length) {
      wx.showToast({
        title: '数据索引错误',
        icon: 'none'
      });
      return;
    }

    const item = list[index];
    const id = item ? item.id : null;

    if (!id) {
      wx.showToast({
        title: '缺少ID，无法删除',
        icon: 'error'
      });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: `确定要删除 "${item.model}" 吗？此操作不可恢复。`,
      success: (res) => {
        if (res.confirm) {
          // --- 【核心步骤 1】前端立即移除 (乐观更新) ---
          // 创建新数组，过滤掉当前项，确保触发视图更新
          const newList = list.filter((_, i) => i !== index);

          // 立即更新界面，让用户感觉“秒删”
          this.setData({
            carouselData: newList
          });
          this.syncToHomeAndGlobal(); 
          wx.showLoading({
            title: '删除中...',
            mask: true
          });

          // --- 【核心步骤 2】发送请求给后端 ---
          wx.request({
            url: `${app.globalData.apiBaseUrl}/Mail/DeleteCarousel`,
            method: 'POST',
            data: {
              Id: id
            },
            header: {
              'content-type': 'application/x-www-form-urlencoded'
            },
            success: (res) => {
              wx.hideLoading();
              const code = res.data?.Code || res.data?.code;

              if (code === 0) {
                // 成功：不需要再做任何事，界面已经更新了
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });

                // 可选：如果你担心本地过滤有遗漏，可以在这里再调一次全量刷新
                // setTimeout(() => this.getCarouselList(), 500); 
              } else {
                // 失败：报错，并且可以选择是否把数据加回去（这里简单处理只报错）
                wx.showToast({
                  title: res.data?.Message || '删除失败',
                  icon: 'error'
                });
                // 如果需要回滚，取消下面注释：
                // this.setData({ carouselData: list }); 
              }
            },
            fail: (err) => {
              wx.hideLoading();
              console.error('删除请求网络失败', err);
              wx.showToast({
                title: '网络异常，请稍后重试',
                icon: 'error'
              });

              // 网络失败时，建议把数据加回去，避免数据丢失错觉
              this.setData({
                carouselData: list
              });
            }
          });
        }
      }
    });
  },

  onCarouselModelInput(e) {
    this.setData({
      'carouselForm.model': e.detail.value
    });
  },

  chooseCarouselImage() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        that.setData({
          uploading: true
        });
        wx.showLoading({
          title: '上传中...',
          mask: true
        });

        that.uploadImage(tempFilePath, 'carousel').then(imageUrl => {
          wx.hideLoading();
          that.setData({
            uploading: false,
            'carouselForm.image': imageUrl
          });
          wx.showToast({
            title: '图片上传成功',
            icon: 'success'
          });
        }).catch(() => {
          wx.hideLoading();
          that.setData({
            uploading: false
          });
          wx.showToast({
            title: '上传失败',
            icon: 'error'
          });
        });
      }
    });
  },

  uploadImage(filePath, type) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${app.globalData.apiBaseUrl}/Mail/UploadImage`,
        filePath: filePath,
        name: 'file',
        timeout: 120000,
        formData: {
          type: type
        },
        success: (res) => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(res.data);
              // 兼容后端返回结构：TradeList[0].ImageUrl
              if ((data.code === 0 || data.Code === 0) && data.TradeList && data.TradeList.length > 0) {
                resolve(data.TradeList[0].ImageUrl || data.TradeList[0].imageUrl);
              } else if ((data.code === 0 || data.Code === 0) && data.tradeList && data.tradeList.length > 0) {
                resolve(data.tradeList[0].ImageUrl || data.tradeList[0].imageUrl);
              } else {
                reject(data.message || '上传失败');
              }
            } catch (e) {
              console.error('解析上传响应失败', e);
              reject('解析响应失败');
            }
          } else {
            reject(`HTTP状态码错误：${res.statusCode}`);
          }
        },
        fail: (err) => {
          console.error('上传网络失败', err);
          reject(err);
        }
      });
    });
  },

  closeCarouselDialog() {
    this.setData({
      showCarouselDialog: false
    });
  },

  // 【核心修复】统一保存逻辑：自动判断是新增还是修改
  saveCarousel() {
    const form = this.data.carouselForm;
    const isEdit = this.data.currentCarouselIndex !== -1; // 判断是否为编辑模式

    // 1. 基础校验
    if (!form.model || !form.model.trim()) {
      wx.showToast({
        title: '请输入产品型号',
        icon: 'none'
      });
      return;
    }
    if (!form.image || !form.image.trim()) {
      wx.showToast({
        title: '请先上传图片',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '保存中...',
      mask: true
    });

    // 2. 计算 SortOrder
    let finalSortOrder = form.sortOrder;
    if (!isEdit) {
      // 新增：排在最后
      finalSortOrder = (this.data.carouselData.length || 0) + 1;
    }
    // 如果是编辑，保持原有的 sortOrder 不变（除非你在弹窗里允许改排序）

    const submitData = {
      ImageUrl: form.image.trim(),
      Model: form.model.trim(),
      SortOrder: finalSortOrder
    };

    // 如果是编辑，必须带上 ID
    if (isEdit) {
      submitData.Id = form.id;
    }

    console.log(`提交模式：${isEdit ? '编辑' : '新增'}, 数据:`, submitData);

    // 3. 决定请求地址和方法
    const url = isEdit ?
      `${app.globalData.apiBaseUrl}/Mail/UpdateCarousel` :
      `${app.globalData.apiBaseUrl}/Mail/AddCarousel`;

    wx.request({
      url: url,
      method: 'POST',
      data: submitData,
      header: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      success: (res) => {
        wx.hideLoading();
        const code = res.data?.Code || res.data?.code;
        const msg = res.data?.Message || res.data?.message;

        if (code === 0) {
          wx.showToast({
            title: isEdit ? '修改成功' : '添加成功',
            icon: 'success'
          });

          // 【修复点 2 & 3】关闭弹窗 (使用正确的变量名 showCarouselDialog) 并重置表单
          this.setData({
            showCarouselDialog: false, // 关弹窗
            carouselForm: { // 重置表单
              id: null,
              image: '',
              model: '',
              sortOrder: 0
            }
          });

          // 先刷新当前列表
          this.getCarouselList().then(() => {
            // 再同步到全局和 Home 页
            this.syncToHomeAndGlobal();
          });
        } else {
          wx.showToast({
            title: msg || '操作失败',
            icon: 'error'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('保存失败', err);
        let tip = '网络错误';
        if (err.statusCode === 400) tip = '参数错误 (400)';
        wx.showToast({
          title: tip,
          icon: 'error'
        });
      }
    });
  },
  goBack() {
    wx.navigateBack();
  }
});