# Proxy-Lan

一款基于 SwitchyOmega / ZeroOmega 改造的浏览器代理管理工具，支持多个代理配置、自动切换、PAC、规则列表和网络请求监控。

## 安装

1. 打开 Chrome 的 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目目录

修改代码后，在扩展管理页面点击“重新加载”。

## 开发检查

项目不需要安装第三方依赖。需要 Node.js 18 或更高版本。

```powershell
node scripts/validate.mjs
node --test tests/utils.test.mjs tests/options-navigation.test.mjs
```

也可以使用：

```powershell
node --run check
node --run test
```

检查内容包括 JavaScript 语法、JSON、Manifest 资源、HTML 本地引用、国际化 key，以及后台消息方法白名单。

## 主要目录

- `manifest.json`：扩展配置
- `js/background.js`：后台代理逻辑
- `popup/`：弹窗、网络监控和临时规则页面
- `options.html`、`partials/`：设置页面
- `_locales/`：界面翻译
- `lib/`：随项目打包的第三方库

## 隐私说明

网络监控会记录浏览器请求的 URL、请求头、状态码、耗时等元数据，用于展示网络流量。日志导出可能包含浏览记录，请只在必要时导出并分享。

## 许可

项目包含 GPL-3.0 代码及多个第三方开源组件。分发或修改时请保留原许可证、版权和来源声明。
