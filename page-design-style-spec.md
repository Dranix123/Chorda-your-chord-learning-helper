# Dranix 网页设计风格完整复刻规范

版本：2026-07-24  
审计对象：`/Users/shengrenjie/Desktop/hostedpages/page/`  
主样式源：`css/style.css`（SHA-256：`0f69d38568af81f3452dc4cd2d58c9a85cf671ffce766780076abdfb151a8d70`）

## 0. 规范用途与证据边界

本文件是实现级规范，不是仅凭 HTML 文案做出的风格推测。结论来自四类证据：

1. 完整读取实际入口 HTML、组件 HTML、`css/style.css`、`js/main.js`、`js/data.js`、字体与静态资源元数据。
2. 在真实 Chromium 页面中加载本地字体和资源，检查实际 DOM、计算样式、边界框、滚动尺寸和交互状态。
3. 以 `1440×900, DPR=1` 和 `390×844, DPR=1` 检查桌面端与移动端；检查浅色、深色、导航滚动态和移动菜单展开态。
4. 实际检查首页、Music、Collections、About、Contact、Publications、Newsletters、Track、Newsletter Article，共保存 40 组计算样式采样。

本文不嵌入任何图片。出现的图片名称仅用于指定必须使用的原始资源及其处理方式。

### 权威源优先级

按以下顺序解决冲突：

1. 页面内联 `<style>` 与 `style=""`；
2. `css/style.css` 中靠后的同等优先级规则；
3. `css/style.css` 中靠前规则；
4. 浏览器默认样式。

`src/style.css` 是未被这些页面引用的 Vite 初始模板，包含 system-ui、蓝色链接等完全不同的风格；复刻时必须忽略，不能与主样式合并。

## 1. 必须锁定的视觉方向

风格关键词：极简、电影感、黑白摄影、编辑出版物、古典衬线、宽留白、低饱和、克制动效。

- 只使用黑、白与中性灰；没有彩色品牌色。
- 视觉重心依靠大面积留白、居中标题、灰阶图片和 Caslon 衬线字。
- 导航、标签、按钮采用全大写与加宽字距，正文保持正常大小写。
- 卡片只使用轻微圆角、轻微上浮；不使用彩色渐变、发光、玻璃拟态或大圆角胶囊。
- 首页 Hero 永远为白字叠加在 50% 黑色遮罩的背景图上，浅色主题也不改为深色字。
- 所有布局边缘保持干净；输入框与按钮为直角，卡片与内容容器为 8px 圆角，普通图片为 4px 圆角。

## 2. 字体：唯一允许的字体与源码冲突

### 2.1 唯一字体资产

| 用途 | 文件 | 字体内部名称 | PostScript 名称 | CSS 声明 | SHA-256 |
|---|---|---|---|---|---|
| 正体 | `fonts/caslon.otf` | Adobe Caslon Pro Semibold | ACaslonPro-Semibold | family `Caslon`、weight `normal`、style `normal` | `8dfbad931ecaf2784867ce88f82b8248376d531fa26a09a2a1b7d20a54dbbf7e` |
| 斜体 | `fonts/caslon_italic.otf` | Adobe Caslon Pro Semibold Italic | ACaslonPro-SemiboldItalic | family `Caslon`、weight `normal`、style `italic` | `d04e346b1ec8a73117560318f0cd6f5b5949b3e56c5a4a9217fc4635d68293ee` |

必须直接使用这两个文件；不要用 Google Fonts、系统 Caslon、Georgia、Times 或任何“相近字体”替代。字体文件内部虽然是 Semibold，但源码故意将其注册为 `font-weight: normal`。保留该映射，浏览器才会得到同样的字宽与换行。

### 2.2 重要冲突

源码的主要文本实际使用 Caslon，但并非严格“全站只有 Caslon”：

- `button` 和页脚 `input[type=email]` 没有声明 `font-family`，Chromium 计算为 Arial。
- 文章首字下沉写的是 `font-family: serif`。
- 原生 `<audio controls>` 使用浏览器内部字体和控件。
- 变量中保留了 `Georgia, serif` 回退，但字体成功加载时普通正文不会落到回退字体。

因此“逐像素复刻当前源码”与“绝对只允许 Caslon”在原生控件和首字下沉处不能同时成立。若“只能使用这一字体”优先，必须在主 CSS 最末尾加入以下强制规则；视觉意图保持一致，但按钮、输入框、首字下沉会与原源码的浏览器默认字体产生细小字宽差异：

```css
:root {
  --font-main: 'Caslon';
  --font-serif: 'Caslon';
}

html, body, button, input, textarea, select, option {
  font-family: 'Caslon' !important;
}

.article-meta,
.article-content > p:first-of-type::first-letter {
  font-family: 'Caslon' !important;
}
```

如果原生音频控件内部也必须满足单字体要求，需要自制音频控制条并隐藏原生控件；这会失去当前浏览器原生音频控件的逐像素外观。若“与当前页面完全一致”优先，则必须保留原生控件并锁定同一浏览器版本、操作系统和 DPR。

## 3. 颜色令牌

### 3.1 深色主题（默认）

| 令牌 | 值 | 用途 |
|---|---:|---|
| `--bg-color` | `#0f0f0f` | 页面背景 |
| `--text-primary` | `#ffffff` | 主文字 |
| `--text-secondary` | `#cccccc` | 正文次级文字 |
| `--accent-color` | `#a0a0a0` | 标签、年份、激活曲目 |
| `--nav-bg-gradient` | `linear-gradient(to bottom, rgba(15,15,15,.95) 0%, rgba(15,15,15,0) 100%)` | 顶部未滚动导航 |
| `--nav-bg-scrolled` | `#0f0f0f` | 滚动/移动导航背景 |
| `--card-bg` | `#1a1a1a` | 卡片 |
| `--card-border` | `#333333` | Newsletter 与移动菜单边线 |
| `--card-img-placeholder` | `#333333` | 缺图占位 |
| `--footer-bg` | `#050505` | 页脚 |
| `--footer-border` | `#222222` | 页脚顶线 |
| `--footer-text` | `#555555` | 版权文字 |
| `--input-bg` | `transparent` | 输入框 |
| `--input-border` | `#444444` | 输入框/播放列表分隔 |
| `--input-text` | `#ffffff` | 输入文字 |
| `--btn-bg` | `#ffffff` | 按钮 |
| `--btn-text` | `#000000` | 按钮文字 |
| `--btn-hover` | `#dddddd` | 按钮 hover |
| `--track-container-bg` | `#111111` | Track 容器 |
| `--track-container-border` | `#222222` | Track 边框 |
| `--track-left-bg` | `#333333` | Track 封面占位 |
| `--track-shadow` | `0 10px 30px rgba(0,0,0,.5)` | Track 阴影 |

### 3.2 浅色主题

| 令牌 | 值 |
|---|---:|
| `--bg-color` | `#ffffff` |
| `--text-primary` | `#1a1a1a` |
| `--text-secondary` | `#555555` |
| `--accent-color` | `#666666` |
| `--nav-bg-gradient` | `linear-gradient(to bottom, rgba(255,255,255,.95) 0%, rgba(255,255,255,0) 100%)` |
| `--nav-bg-scrolled` | `#ffffff` |
| `--nav-text-active` / `--nav-border-active` | `#000000` |
| `--card-bg` | `#f4f4f4` |
| `--card-img-placeholder` | `#e0e0e0` |
| `--card-border` | `#e0e0e0` |
| `--footer-bg` | `#f9f9f9` |
| `--footer-border` | `#e5e5e5` |
| `--footer-text` | `#888888` |
| `--input-bg` | `#ffffff` |
| `--input-border` | `#cccccc` |
| `--input-text` | `#333333` |
| `--btn-bg` / `--btn-hover` | `#1a1a1a` / `#333333` |
| `--btn-text` | `#ffffff` |
| `--track-container-bg` | `#ffffff` |
| `--track-container-border` / `--track-left-bg` | `#e0e0e0` |
| `--track-shadow` | `0 5px 20px rgba(0,0,0,.1)` |

浅色普通卡片的实际边框是后置规则写死的 `#eeeeee`，不是 `--card-border`；Newsletter 卡片仍使用 `--card-border: #e0e0e0`。

## 4. 基础排版与尺寸

根字号使用浏览器默认 `16px`；源码没有修改 `html` 字号。所有 `rem` 换算都以 16px 为基准。

| 元素 | 字号 | 字重 | 行高 | 字距/变形 |
|---|---:|---:|---:|---|
| Body | 16px | 400 | 25.6px（1.6） | 正常 |
| Logo | 19.2px | 700 | 30.72px | 2px，全大写 |
| 桌面导航链接 | 14.4px | 400 | 23.04px | 1px，全大写 |
| 移动导航链接 | 17.6px | 400 | 28.16px | 1px，全大写 |
| Hero H1 | 64px | 400 | 102.4px | 1px |
| Hero 副标题 | 17.6px | 400 | 28.16px | 3px，全大写 |
| Section Title | 40px | 400 | 64px | 正常 |
| Card 标签 | 12.8px | 400 | 20.48px | 全大写 |
| Newsletter 标题 | 24px | bold | 38.4px | 正常 |
| Newsletter 摘要 | 15.2px | 400 | 24.32px | 最多 3 行 |
| Newsletter 元信息 | 12.8px | 500 | 20.48px | 正常 |
| Article Title | 40px | 浏览器 bold | 48px | 渐变填充 |
| Article 正文 | 18px | 400 | 32.4px（1.8） | 正常 |
| Article H2 | 28.8px | 浏览器 bold | 46.08px | 下方虚线 |
| 首字下沉 | 56px | 400 | 44.8px | 左浮动 |
| Footer 标题 | 16px | 浏览器 bold | 25.6px | 2px，全大写 |
| 按钮 | 12.8px | 700 | normal | 1px，全大写 |
| 版权 | 12px | 400 | 21.6px | 正常 |

不要擅自给 Hero、Section Title 或正文加入移动端字号缩减；源码在 390px 宽度仍保持上述字号。

## 5. 全局布局与实测锚点

### 5.1 全局规则

- 全局重置：所有元素 `margin:0; padding:0; box-sizing:border-box`。
- Body：背景/文字用主题变量，Caslon，`line-height:1.6`，WebKit 抗锯齿；背景色和文字色切换均为 300ms ease。
- 链接继承颜色、无下划线、透明度 300ms；hover 为 `opacity:.7`。
- 通用 Section：`padding:96px 32px; max-width:1200px; margin:0 auto`。
- 内页 `.page-offset`：桌面 `padding-top:100px; min-height:100vh`；移动端 `padding-top:40px`。由于其 class 优先级高于 `section`，移动端最终为 `40px 32px 96px`。

### 5.2 1440×900 实测

| 对象 | 实际边界框/布局 |
|---|---|
| 未滚动 Header | `x0 y0 w1440 h94.71875`；fixed；padding `32px 48px` |
| 滚动 Header | `x0 y0 w1440 h62.71875`；padding `16px 48px`；滚动阈值 50px |
| Logo | `x48 y32 w92.328125 h30.71875` |
| 首页 Hero | `x0 y0 w1440 h900` |
| 通用 Section | `x120 w1200`；内容宽 `1136` |
| 首页 Grid | `x152 y1108 w1136`；列 `280 280 280`；gap 32px |
| 首页首卡 | `x268 y1108 w280 h391.53125` |
| About 图 | `x313 y100 w350 h460.53125` |
| About 文本 | `x727 y138.890625 w400 h382.75`，右对齐 |
| Contact 图 | `x320 y156 w550 h361.59375` |
| Contact 文本 | `x880 y429.609375 w240 h87.984375`，右对齐并贴图底部 |
| Newsletter 卡 | `x320 y212 w800 h200`；右图宽 200px |
| Track 容器 | `x220 y161.453125 w1000 h451.09375` |
| Article 容器 | `x380 y64 w680`；内部内容宽 632px |

### 5.3 390×844 实测

| 对象 | 实际边界框/布局 |
|---|---|
| Header | `x0 y0 w390 h86`；relative；最终 padding 24px；横向排列 |
| Logo | 左边距 24px |
| 菜单按钮 | `x321 y24 w45 h38` |
| 展开菜单 | `x0 y86 w390 h415.84375`；不锁 Body 滚动 |
| 首页 Hero | `x0 y86 w390 h844`；Header 占文档流后仍保持 `100vh` |
| 通用 Section | `x0 w390`；左右 padding 32px；内容宽 326px |
| Grid | 内容宽 326px；单列 280px；卡片 `x55 w280`；gap 32px |
| About 图 | `x32 y126 w326 h429.609375` |
| About 文本 | `x32 y619.609375 w326`；仍右对齐 |
| Contact 图 | `x32 y182 w326 h218.21875` |
| Contact 文本 | `x75 y410.21875 w240` |
| Newsletter 卡 | `x32 y238 w326 h347.796875`；上图高 150px |
| Track 容器 | `x32 y236 w326 h835.96875`；封面 324×324 |
| Article 容器 | `x0 y150 w390`；padding `32px 24px 96px`；正文宽 342px |

所有实测页面在上述两个视口中均无横向溢出：`document.scrollWidth === viewport width`。

## 6. 组件参数

### 6.1 Header / Nav

- Header：`position:fixed; top:0; width:100%; z-index:1000`。
- 未滚动 padding：`2rem 3rem`；背景为主题顶部渐隐。
- `scrollY > 50` 时加 `.scrolled`：纯色背景、`0 2px 10px rgba(0,0,0,.1)`、padding `1rem 3rem`。
- Nav 列表：横向 Flex，gap `2rem`。
- 链接：`font-size:.9rem; letter-spacing:1px; text-transform:uppercase; padding:5px 0`。
- 当前页：2px 底边，`padding-bottom:4px`。

移动端（`<=768px`）：

- Header 改为 relative，横向排列由 `!important` 锁定；后置媒体规则把最终 padding 改成 24px。
- 菜单按钮为 25×2px 的三条线，线间 gap 6px，线圆角 2px，按钮本身 padding 10px。
- 菜单绝对定位到 Header 底部，宽 100%；关闭态 `max-height:0; opacity:0; visibility:hidden`。
- 展开态 `max-height:500px; opacity:1; visibility:visible; padding-bottom:32px`。
- 菜单动画 400ms，曲线 `cubic-bezier(.4,0,.2,1)`；阴影 `0 10px 30px rgba(0,0,0,.5)`。
- 菜单项每个占满宽度、居中；链接 padding `16px 0`。
- 六项依次延迟 100/150/200/250/300/350ms。
- 三条线转为 X：第一条 `translateY(8px) rotate(45deg)`，第二条透明并右移 10px，第三条 `translateY(-8px) rotate(-45deg)`。

### 6.2 Hero

- `height:100vh`，Flex 垂直居中，水平居中，文字居中，左右 padding 16px。
- 背景必须为：50% 黑色线性遮罩 + `hero-bg.jpg`，居中、cover、不重复。
- 有 hover 指针的设备使用 `background-attachment:fixed`；`@media (hover:none)` 改为 scroll。
- H1 底部间距 16px；H1 强制白 `#fff`；副标题强制 `#ddd`，不随主题改变。

### 6.3 Grid / Card

- Grid：`repeat(auto-fit,minmax(150px,280px))`，居中，gap 32px。
- Card：主题背景，1px transparent 边框，8px 圆角，overflow hidden，transform 300ms。
- 浅色 Card 边框写死为 `#eee`。
- Hover：上移 5px；链接整体包裹卡片。
- 图片区：宽 100%，1:1，背景居中/cover/不重复。
- 信息区：padding 24px，居中。
- H3：底部 8px、weight 500、letter-spacing 1px。
- 标签：12.8px、主题 accent、全大写。

### 6.4 About

- 容器 Flex、wrap、gap 64px、双轴居中。
- 图片列：`flex:1 1 280px; max-width:350px`。
- 图片：宽 100%、4px 圆角、默认灰度 100%，hover 500ms 恢复彩色。
- 文本列：`flex:1 1 200px; max-width:400px; text-align:right`。
- 标题右对齐、底部 16px；段落底部 24px、次级文字色。
- 签名高 50px、顶部 16px、opacity .8；深色反转为白，浅色保持黑，filter 300ms。

### 6.5 Contact

- 容器 Flex、wrap、gap 10px、`align-items:flex-end`、居中、顶部 56px。
- 图片列：`flex:1 1 500px; max-width:550px`，灰度/hover 行为同 About。
- 文本列：`flex:1 1 150px; max-width:240px; text-align:right`。
- 标题 24px、右对齐、底部 0。

### 6.6 Publications

- 列表最大宽 800px、居中。
- 每项 padding 24px；纵向 Flex；gap 8px。
- 年份 14.4px、bold、accent。
- 标题 19.2px、weight 500。
- 元信息 14.4px、italic。
- 链接 13.6px、下划线、右间距 16px。
- 当前 `publications.html` 的内联 CSS 覆盖主 CSS：分隔线固定 `#333`，元信息固定 `#888`。浅色模式也保持这两个固定灰色；逐像素复刻时必须保留。

### 6.7 Track Detail

- 外 Section：顶部 padding 150px，最小高 80vh，Flex 居中。
- 容器：宽 100%、最大宽 1000px、8px 圆角、overflow hidden、1px 主题边框、主题阴影。
- 桌面左列：45%，不收缩，1:1；在 1000px 外宽和 1px 边框下实测内容为约 449.094px 正方形。
- 桌面右列：绝对定位 `top:0; right:0; bottom:0; width:55%`，padding 48px，纵向 Flex、右对齐、内部 Y 滚动。
- 滚动条宽 6px，thumb `rgba(128,128,128,.4)`，3px 圆角。
- 移动端：容器纵向；左列 100%；右列恢复 relative、100%、auto 高、无内部滚动、文字居中。
- Playlist 最大高 200px；曲目 padding `12.8px 0`；曲号宽 24px、右间距 16px、opacity .6；名称 15.2px、weight 500。

### 6.8 Newsletter List

- 列表纵向 Flex、gap 32px、最大宽 800px、居中。
- 卡片宽随列表，固定高 200px，8px 圆角，1px 主题边框，overflow hidden。
- Hover 上移 2px，200ms。
- 左内容 `flex:1; padding:24px`，纵向 `space-between`。
- 右封面宽 200px、高 100%、cover、居中、不收缩。
- `<=600px`：`column-reverse`、高度 auto；封面宽 100%、高 150px。

### 6.9 Footer / Form

- Footer：主题背景，`padding:64px 32px`，居中，顶部 1px 主题边线，背景 300ms。
- Newsletter 标题底部 24px。
- Input Group：Flex 居中、gap 8px、最大宽 400px、允许换行。
- Email：padding 12.8px、flex 1、最小宽 200px、1px 边框、直角。
- Button：padding `12.8px 24px`、无边框、直角、全大写、不换行。
- 390px 实测时输入和按钮换为两行，输入宽 326px。
- 版权顶部 32px、12px、主题 footer text、行高 1.8。

### 6.10 Article

- 容器最大宽 680px、居中、`padding:32px 24px 96px`、顶部 margin 64px。
- Header 居中，底部 margin 48px、padding-bottom 32px、1px 主题边线。
- Intro 最大宽 500px、居中、17.6px、行高 1.6、次级色。
- Meta 14.4px、italic、底部 16px。
- Title 40px、行高 1.2；文字为 `120deg` 从主文字到次级文字的渐变裁切。
- 正文 18px、行高 1.8；段落底部 24px。
- 首段首字：56px、float left、行高 .8、右 margin 8px、上 margin 1.6px。
- Figure 桌面 `margin:40px -32px`，图片 100%、4px 圆角、`0 8px 24px rgba(0,0,0,.2)`；`<=700px` 改为 `32px 0`。
- Blockquote：左边 4px 主文字色，`margin:32px 0`，padding `8px 0 8px 24px`，斜体，卡片背景，右侧 8px 圆角。
- H2：顶部 48px、底部 16px、28.8px、底部 1px dashed。
- 返回链接顶部 48px；默认次级色，hover 改主色并出现底边。

## 7. 圆角、阴影与动效总表

| 对象 | 参数 |
|---|---|
| Card / Newsletter / Track | `border-radius:8px` |
| About / Contact / Figure 图片 | `4px` |
| Blockquote | `0 8px 8px 0` |
| Track scrollbar thumb | `3px` |
| Hamburger bar | `2px` |
| 输入框 / 按钮 | `0px` |
| Header 滚动态 | `0 2px 10px rgba(0,0,0,.1)` |
| 移动菜单 | `0 10px 30px rgba(0,0,0,.5)` |
| Track 深/浅 | `0 10px 30px rgba(0,0,0,.5)` / `0 5px 20px rgba(0,0,0,.1)` |
| Figure | `0 8px 24px rgba(0,0,0,.2)` |
| Link hover | opacity 1→.7，300ms ease |
| Card hover | translateY(0→-5px)，300ms ease |
| Newsletter hover | translateY(0→-2px)，200ms |
| 图片灰度 | grayscale(100%→0%)，500ms |
| 主题过渡 | Body 背景/文字 300ms；Footer/Track/Signature 300ms |

## 8. 响应式断点

| 条件 | 精确行为 |
|---|---|
| `max-width:768px` | Header 进入移动布局；汉堡显示；下拉菜单启用；`.page-offset` 顶部 40px；Track 改纵向；Track 右侧取消绝对定位和内滚动；Track 文字居中 |
| `max-width:600px` | Newsletter Card 改 `column-reverse`；封面高 150px |
| `max-width:700px` | Article Figure 取消 -32px 横向越界 |
| `hover:none` | Hero 背景从 fixed 改 scroll |

不要添加 1024px、480px 等新的断点；当前风格没有这些断点。Grid 自身通过 auto-fit 自适应。

## 9. 白天/黑夜模式实现

### 9.1 当前页面的精确实现

当前页面没有可见主题切换按钮，也没有 JavaScript 主题状态。深色是默认值；系统为浅色时由：

```css
@media (prefers-color-scheme: light) {
  :root { /* 覆盖浅色变量 */ }
}
```

自动切换。切换时 Body 背景和文字、Footer、Track、Signature 等以 300ms 过渡。若目标是“与原页面完全一致”，不要额外加入页面内切换按钮。

### 9.2 如必须允许用户手动切换

手动切换不能只写 `color-scheme`；必须将第 3 节的两套变量分别放进 `:root,[data-theme="dark"]` 和 `[data-theme="light"]`。初始化脚本放在 `<head>` 中、主 CSS 前后均可，但应在首次绘制前执行，避免闪烁：

```html
<script>
(() => {
  const saved = localStorage.getItem('theme');
  const system = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = saved || system;
})();
</script>
```

```js
function setTheme(theme) {
  document.documentElement.dataset.theme = theme; // 'light' 或 'dark'
  localStorage.setItem('theme', theme);
}
```

如果要求外观零新增，不在页面中放置切换按钮；通过系统主题或站外设置调用 `setTheme`。若加入可见按钮，它本身就是原页面不存在的新视觉元素。

## 10. 必须保持的 DOM 结构

CSS 依赖以下嵌套，不可随意改名：

```html
<header>
  <div class="logo"><a>Dranix</a></div>
  <button class="mobile-menu-toggle" aria-label="Toggle navigation">
    <span class="bar"></span><span class="bar"></span><span class="bar"></span>
  </button>
  <nav class="main-nav"><ul><li><a>...</a></li></ul></nav>
</header>

<div class="hero"><h1>...</h1><p>...</p></div>

<div class="grid">
  <a class="card-link">
    <div class="card">
      <div class="card-img"></div>
      <div class="card-info"><h3>...</h3><span>...</span></div>
    </div>
  </a>
</div>

<div class="track-container">
  <div class="track-left"></div>
  <div class="track-right">
    <div class="track-player-wrapper">...</div>
    <div class="track-info-wrapper">...</div>
    <div class="playlist">...</div>
  </div>
</div>

<a class="newsletter-card">
  <div class="nl-content"><div>...</div><span class="nl-meta">...</span></div>
  <div class="nl-cover"></div>
</a>

<footer>
  <div class="newsletter">
    <h4>...</h4>
    <div class="input-group"><input type="email"><button>...</button></div>
  </div>
  <div class="copyright">...</div>
</footer>
```

## 11. 静态资源锁定

同一风格不仅依赖 CSS，也依赖以下原始资源。不能用“同类图片”替代。

| 资源 | 尺寸 | SHA-256 | 处理 |
|---|---:|---|---|
| `assets/images/hero-bg.jpg` | 1950×1301 | `a2286a47f5a516ca0b31150a5cea9474e3b4ec4f46d0f174a7037762d4ac9ab8` | center/cover + 50% 黑遮罩 |
| `assets/images/profile.png` | 1276×1644 | `f9ef8fe23f28ddb9660293482298d683dc6f42a5ca4a893f72ff28a0e90b3af9` | 宽 100%、4px、默认灰度 |
| `assets/images/contact.jpg` | 900×576 | `561a54f8faa167acd6a0b851c683bd8e1931e4ac9176519739163b2aa8d47b7d` | 宽 100%、4px、默认灰度 |
| `assets/images/signature.png` | 2143×884 | `5e1bf598d47b0d2d361e83f3f3495dc9ffe6c9009c8720d324f616ba38baae1e` | 高 50px；深色 invert(1) |
| `assets/images/music/vulpolirant.png` | 1850×1850 | `a59f2fc4f0c0cd4312868f3cec313db035a42a4800cff8993f698d0d4db29159` | 卡片/封面 center/cover |
| `assets/images/collections/cover-legendarium.jpg` | 700×700 | `3707262a9d733960d30845eec4d641ea585deb93b0273e964e9eaebd07a09d9f` | center/cover |
| `assets/images/collections/twice.jpg` | 700×700 | `5532bf59790bc07819bcfb5f3f3bcfe96bf77c4289e8fade9a96d17552bf8b86` | center/cover |

## 12. 源码中的级联陷阱

1. `src/style.css` 未使用，禁止引入。
2. 移动 Header 有两组 `max-width:768px` 规则。第一组的横向布局带 `!important`，第二组最终把 padding 改为 24px；不能只复制其中一组。
3. `--input-focus` 未定义，但后面的 `.form-control:focus { border-color:var(--accent-color) }` 会覆盖前一条，最终 focus 使用 accent。
4. `--list-border` 未定义，Playlist 的上下边框声明失效；曲目间分隔线实际来自 `--input-border`。
5. `publications.html` 的内联 CSS覆盖主题化的主 CSS，见 6.6。
6. `index.html` 的 About Preview 使用内联居中、最大宽 800px、段落底部 32px、链接 1px 底边与 2px 下 padding。
7. CSS 中没有对 Hero 字号做移动缩放；不要自行“优化”。
8. CSS 中没有隐藏展开菜单时的页面滚动；不要加入 Body scroll lock。
9. 音频控件是浏览器原生组件；跨浏览器不会逐像素一致。

## 13. 验收标准

实现完成后至少在以下矩阵逐项比对：

| 页面/状态 | 1440×900 | 390×844 |
|---|---:|---:|
| 首页浅色、深色 | 必测 | 必测 |
| Header 未滚动 / scrollY>50 | 必测 | 不适用固定滚动态 |
| 移动菜单关闭 / 展开 | 不适用 | 必测 |
| Music / Collections Grid | 必测 | 必测 |
| About / Contact | 必测 | 必测 |
| Publications | 必测 | 必测 |
| Newsletter List | 必测 | 必测 |
| Track Detail | 必测 | 必测 |
| Article | 必测 | 必测 |

验收条件：

- 字体文件哈希一致且加载成功；普通文本计算字体以 Caslon 开头。
- 主题色与第 3 节完全一致。
- Header、Hero、Grid、About、Track、Article 的实测锚点与第 5 节一致。
- 所有页面无横向滚动。
- 圆角、边框、阴影、字距、动效时长与本规范一致。
- Hero 在两种主题中均为白字；图片默认灰度并仅在 hover 恢复颜色。
- 390px 下菜单高度、Grid 单列、Newsletter 纵向布局、Track 纵向布局一致。
- 若要求跨平台像素一致，必须固定浏览器版本、操作系统、DPR、字体渲染，并替换所有原生控件；否则原生 audio/input/button 的平台差异无法由 CSS 消除。

## 14. 权威 CSS（原文件逐字收录）

以下内容是 `css/style.css` 的完整权威副本。要复刻当前页面，先原样使用；如坚持全站只用 Caslon，再在其末尾追加第 2.2 节的强制规则。

```css

/* ===============================
   本地字体定义 (Local Fonts)
   =============================== */
@font-face {
    font-family: 'Caslon';
    src: url('../fonts/caslon.otf') format('opentype');
    font-weight: normal;
    font-style: normal;
    font-display: swap; /* 优化加载体验 */
}

@font-face {
    font-family: 'Caslon';
    src: url('../fonts/caslon_italic.otf') format('opentype');
    font-weight: normal; /* Caslon Italic 本身就是常规粗细的斜体 */
    font-style: italic;
    font-display: swap;
}
/* ===============================
   核心变量与主题定义 (Core Variables)
   =============================== */
:root {
    /* --- 默认深色模式 (Dark Mode) --- */
    --bg-color: #0f0f0f;
    --text-primary: #ffffff;
    --text-secondary: #cccccc;
    --accent-color: #a0a0a0;
    
    /* 导航栏 */
    --nav-bg-gradient: linear-gradient(to bottom, rgba(15,15,15,0.95) 0%, rgba(15,15,15,0) 100%);
    --nav-bg-scrolled: #0f0f0f;
    --nav-text-active: #ffffff;
    --nav-border-active: #ffffff;

    /* 卡片 (Cards) */
    --card-bg: #1a1a1a;
    --card-border: #333333;
    --card-hover-transform: translateY(-5px);
    --card-img-placeholder: #333;

    /* 页脚 (Footer) */
    --footer-bg: #050505;
    --footer-border: #222222;
    --footer-text: #555555;

    /* 输入框与按钮 */
    --input-bg: transparent;
    --input-border: #444;
    --input-text: #fff;
    --btn-bg: #fff;
    --btn-text: #000;
    --btn-hover: #ddd;

    /* 详情页 (Track Detail) */
    --track-container-bg: #111;
    --track-container-border: #222;
    --track-shadow: 0 10px 30px rgba(0,0,0,0.5);
    --track-left-bg: #333;
    
    /* 字体 (不变) */
    --font-main: 'Caslon', 'Georgia', serif; 
    --font-serif: 'Caslon', 'Georgia', serif;
}

/* --- 浅色模式适配 (Light Mode) --- */
@media (prefers-color-scheme: light) {
    :root {
        --bg-color: #ffffff;
        --text-primary: #1a1a1a;
        --text-secondary: #555555;
        --accent-color: #666666;

        /* 导航栏：浅色模式下，滚动前透明，滚动后变白 */
        --nav-bg-gradient: linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%);
        --nav-bg-scrolled: #ffffff;
        --nav-text-active: #000000;
        --nav-border-active: #000000;

        /* 卡片 */
        --card-bg: #f4f4f4;
        --card-img-placeholder: #e0e0e0;
        --card-border: #e0e0e0;

        /* 页脚 */
        --footer-bg: #f9f9f9;
        --footer-border: #e5e5e5;
        --footer-text: #888888;

        /* 输入框与按钮 */
        --input-bg: #ffffff;
        --input-border: #cccccc;
        --input-text: #333;
        --btn-bg: #1a1a1a; /* 按钮变成黑底白字，增加对比度 */
        --btn-text: #ffffff;
        --btn-hover: #333333;

        /* 详情页 */
        --track-container-bg: #ffffff;
        --track-container-border: #e0e0e0;
        --track-shadow: 0 5px 20px rgba(0,0,0,0.1);
        --track-left-bg: #e0e0e0;
    }
}

/* ===============================
   基础重置 (Reset & Base)
   =============================== */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    background-color: var(--bg-color);
    color: var(--text-primary);
    font-family: var(--font-main);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    transition: background-color 0.3s ease, color 0.3s ease; /* 增加平滑过渡 */
}

a { color: inherit; text-decoration: none; transition: opacity 0.3s ease; }
a:hover { opacity: 0.7; }

/* ===============================
   导航栏 (Header)
   =============================== */
header {
    position: fixed;
    top: 0;
    width: 100%;
    padding: 2rem 3rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1000;
    background: var(--nav-bg-gradient);
    transition: all 0.3s ease;
}

header.scrolled {
    background: var(--nav-bg-scrolled);
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 1rem 3rem;
}

.logo { font-size: 1.2rem; letter-spacing: 2px; font-weight: 700; text-transform: uppercase; }

nav ul { display: flex; list-style: none; gap: 2rem; }

nav ul li a {
    font-size: 0.9rem;
    letter-spacing: 1px;
    text-transform: uppercase;
    font-weight: 400;
    padding: 5px 0;
}

nav ul li a.active {
    color: var(--nav-text-active);
    border-bottom: 2px solid var(--nav-border-active);
    padding-bottom: 4px;
}

/* ===============================
   移动端导航适配 (修正版)
   =============================== */

/* 1. 汉堡按钮基础样式 (默认隐藏) */
.mobile-menu-toggle {
    display: none; /* 桌面端隐藏 */
    
    /* 核心修复：去除默认按钮样式 */
    background: transparent !important; /* 强制背景透明，去掉灰色背景 */
    border: none;
    outline: none;
    box-shadow: none;
    
    /* 核心修复：去除手机点击时的灰色高亮块 */
    -webkit-tap-highlight-color: transparent; 
    
    cursor: pointer;
    padding: 10px; /* 增加点击区域，便于手指点击 */
    flex-direction: column;
    gap: 6px;
    z-index: 1002; /* 确保层级最高 */
}

/* 去除点击或聚焦时的默认黑框/蓝框 */
.mobile-menu-toggle:focus,
.mobile-menu-toggle:active {
    outline: none;
    background: transparent;
}

.mobile-menu-toggle .bar {
    display: block;
    width: 25px;
    height: 2px;
    background-color: var(--text-primary); /* 跟随文字颜色 */
    transition: all 0.3s ease;
    border-radius: 2px;
}

/* 2. 移动端媒体查询 (小于 768px) */
@media (max-width: 768px) {
    header {
        /* [关键布局修复] 强制横向排列，Logo左，按钮右 */
        display: flex !important;
        flex-direction: row !important; /* 强制横向 */
        justify-content: space-between !important; /* 两端对齐 */
        align-items: center !important;
        
        padding: 1rem 1.5rem; /* 调整内边距适应手机 */
        position: relative;
    }

    /* 显示汉堡按钮 */
    .mobile-menu-toggle {
        display: flex;
        /* 如果觉得太靠右，可以加一点 margin-right，例如: margin-right: -10px; */
    }

    /* 导航菜单列表容器 - 改为全宽下拉 */
    .main-nav {
        position: absolute;
        top: 100%; /* 紧贴 Header 底部 */
        left: 0;
        width: 100%;
        background-color: var(--nav-bg-scrolled); /* 保证背景不透明 */
        
        /* 默认收起状态 */
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        visibility: hidden; /* 彻底隐藏，防误触 */
        
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); /* 平滑动画 */
        border-bottom: 1px solid var(--card-border);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5); /* 加点阴影更有层次感 */
    }

    /* 展开状态 (通过 JS 添加 .active) */
    .main-nav.active {
        max-height: 500px; /* 设置一个足够大的高度 */
        opacity: 1;
        visibility: visible;
        padding-bottom: 2rem; /* 展开时底部留白 */
    }

    /* 菜单项垂直排列 */
    .main-nav ul {
        flex-direction: column;
        align-items: center;
        gap: 0;
        padding-top: 1rem;
    }

    .main-nav ul li {
        width: 100%;
        text-align: center;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
    }

    /* 链接样式优化 */
    .main-nav ul li a {
        display: block;
        padding: 1rem 0;
        font-size: 1.1rem;
        border-bottom: 1px solid rgba(255,255,255,0.05); /* 极淡的分隔线 */
    }

    /* 逐个显示的动画效果 (可选，增加高级感) */
    .main-nav.active ul li {
        opacity: 1;
        transform: translateY(0);
    }
    /* 为前几个菜单项添加延迟，形成瀑布流效果 */
    .main-nav.active ul li:nth-child(1) { transition-delay: 0.1s; }
    .main-nav.active ul li:nth-child(2) { transition-delay: 0.15s; }
    .main-nav.active ul li:nth-child(3) { transition-delay: 0.2s; }
    .main-nav.active ul li:nth-child(4) { transition-delay: 0.25s; }
    .main-nav.active ul li:nth-child(5) { transition-delay: 0.3s; }
    .main-nav.active ul li:nth-child(6) { transition-delay: 0.35s; }

    /* 汉堡按钮变为 X 的动画 */
    .mobile-menu-toggle.active .bar:nth-child(1) {
        transform: translateY(8px) rotate(45deg);
    }
    .mobile-menu-toggle.active .bar:nth-child(2) {
        opacity: 0;
        transform: translateX(10px);
    }
    .mobile-menu-toggle.active .bar:nth-child(3) {
        transform: translateY(-8px) rotate(-45deg);
    }
}
/* ===============================
   页面顶部间距修复 (Internal Page Spacing)
   =============================== */

/* 专门用于非首页(Index)的页面内容容器 */
.page-offset {
    padding-top: 100px; /* Header的高度(约80px) + 额外的呼吸空间 */
    min-height: 100vh;  /* 保证内容少时Footer也能沉底 */
}

/* 移动端Header可能变小，间距可以稍微缩小 */
@media (max-width: 768px) {
    .page-offset {
        padding-top: 40px; 
    }
}
/* ===============================
   Hero 区块 (保持深色风格)
   =============================== */
/* 注意：Hero 因为有背景图，文字强制保持白色，不受 Light Mode 影响 */
.hero {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 0 1rem;
    background: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('../assets/images/hero-bg.jpg') no-repeat center center/cover;
    background-attachment: fixed;
}

.hero h1 {
    font-family: var(--font-serif);
    font-size: 4rem;
    font-weight: 400;
    margin-bottom: 1rem;
    letter-spacing: 1px;
    color: #fff; /* 强制白色 */
}

.hero p {
    font-size: 1.1rem;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #ddd; /* 强制浅灰 */
}
@media (hover: none) {
    .hero {
        background-attachment: scroll;
    }
}

/* ===============================
   通用区块
   =============================== */
section {
    padding: 6rem 2rem;
    max-width: 1200px;
    margin: 0 auto;
}

.section-title {
    text-align: center;
    font-family: var(--font-serif);
    font-size: 2.5rem;
    margin-bottom: 3rem;
    font-weight: 400;
    color: var(--text-primary);
}

/* ===============================
   网格与卡片
   =============================== */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 280px)); /* 保持之前的优化 */
    justify-content: center;
    gap: 2rem;
}

.card-link { display: block; } /* 让卡片整体可点 */

.card {
    background-color: var(--card-bg);
    transition: transform 0.3s ease;
    /* 可以在浅色模式加一点微弱的边框来增强边界感 */
    border: 1px solid transparent; 
    border-radius: 8px;  /* 设置圆角大小，可按需调整，如 8px, 12px, 16px */
    overflow: hidden;
}

@media (prefers-color-scheme: light) {
    .card { border-color: #eee; }
}

.card:hover { transform: var(--card-hover-transform); }

.card-img {
    width: 100%;
    aspect-ratio: 1 / 1;
    background-color: var(--card-img-placeholder);
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
}

.card-info { padding: 1.5rem; text-align: center; }

.card-info h3 {
    margin-bottom: 0.5rem;
    font-weight: 500;
    letter-spacing: 1px;
    color: var(--text-primary);
}

.card-info span {
    font-size: 0.8rem;
    color: var(--accent-color);
    text-transform: uppercase;
}

/* ===============================
   详情页 (Track Detail) - [布局修正版]
   =============================== */
.track-detail-section {
    padding-top: 150px;
    min-height: 80vh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.track-container {
    display: flex;
    width: 100%;
    max-width: 1000px;
    background: var(--track-container-bg);
    border: 1px solid var(--track-container-border);
    box-shadow: var(--track-shadow);
    transition: background 0.3s;
    
    /* [修改1] 设为相对定位，作为右侧内容的参考锚点 */
    position: relative;
    overflow: hidden; 
    border-radius: 8px;
}

/* --- 左侧：封面图 --- */
.track-left {
    /* [修改2] 宽度固定 45%，并强制不被压缩 */
    width: 45%; 
    flex-shrink: 0; 
    
    /* [修改3] 强制 1:1 正方形，它决定了整个卡片的高度 */
    aspect-ratio: 1 / 1; 
    
    background-color: var(--track-left-bg);
    background-position: center;
    background-size: cover;
}

/* --- 右侧：内容区域 --- */
.track-right {
    /* [修改4] 使用绝对定位，强制填满右侧剩余空间 */
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 55%; /* 剩余的 55% 宽度 */
    
    /* [修改5] 开启垂直滚动 */
    overflow-y: auto; 
    
    /* --- 以下保留你原有的视觉样式，不做任何改动 --- */
    padding: 3rem;
    display: flex;
    flex-direction: column;
    text-align: right;
}

/* 美化滚动条 (保持你原有的设计) */
.track-right::-webkit-scrollbar {
    width: 6px;
}
.track-right::-webkit-scrollbar-thumb {
    background-color: rgba(128, 128, 128, 0.4);
    border-radius: 3px;
}

/* --- 移动端适配 --- */
@media (max-width: 768px) {
    .track-container {
        flex-direction: column;
        /* 移动端高度自适应，取消父容器的高度锁定 */
        height: auto; 
    }

    .track-left {
        width: 100%;
        /* 移动端依然保持正方形封面 */
        aspect-ratio: 1 / 1; 
    }

    .track-right {
        /* [修改6] 移动端还原为普通文档流，取消绝对定位 */
        position: relative; 
        width: 100%;
        height: auto; 
        overflow-y: visible; /* 取消内部滚动，改为页面整体滚动 */
    }
}
/* ===============================
   8. 关于页面 (About) - [修复]
   =============================== */
.about-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4rem;
    align-items: center;
    justify-content: center;
}

.about-img { flex: 1 1 280px; max-width: 350px; }
.about-img img { width: 100%; border-radius: 4px; filter: grayscale(100%); transition: filter 0.5s; }
.about-img img:hover { filter: grayscale(0%); }

.about-text .section-title {
    text-align: right;    /* 关键：让标题右对齐 */
    margin-top: 0;        /* 去掉顶部间距，让它对齐图片顶部 */
    margin-bottom: 1rem;  /* 标题和正文之间的间距 */
}
.about-text { flex: 1 1 200px; text-align: right; max-width: 400px;}
.about-text p { margin-bottom: 1.5rem; color: var(--text-secondary); }

.signature {
    height: 50px;       /* 原来的高度 */
    margin-top: 1rem;   /* 原来的间距 */
    opacity: 0.8;       /* 原来的透明度 */
    
    /* === 核心魔法 === */
    /* 默认深色模式：原图是黑字，反转 100% 变成白字 */
    filter: invert(1); 
    
    transition: filter 0.3s ease; /* 切换模式时有平滑过渡 */
}

/* === 浅色模式适配 === */
@media (prefers-color-scheme: light) {
    .signature {
        /* 浅色模式：背景是白的，我们需要黑字，所以取消反转 */
        filter: invert(0);
    }
}
/* ===============================
   9. 联系页面 (Contact) - [修复]
   =============================== */
.contact-form-wrapper { max-width: 600px; margin: 0 auto; }
.form-group { margin-bottom: 2rem; text-align: left; }
.form-group label { display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--accent-color); letter-spacing: 1px; }

.form-control {
    width: 100%;
    padding: 1rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    color: var(--text-primary);
    font-family: var(--font-main);
    font-size: 1rem;
    outline: none;
    transition: border-color 0.3s;
}
.form-control:focus { border-color: var(--input-focus); }
textarea.form-control { height: 150px; resize: vertical; }

.contact-container {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-end;
    justify-content: center;
    margin-top: 3.5rem;
}

.contact-img { flex: 1 1 500px; max-width: 550px; }
.contact-img img { width: 100%; border-radius: 4px; filter: grayscale(100%); transition: filter 0.5s; }
.contact-img img:hover { filter: grayscale(0%); }

.contact-text .section-title {
    text-align: right;    /* 关键：让标题右对齐 */
    margin-top: 0;        /* 去掉顶部间距，让它对齐图片顶部 */
    margin-bottom: 0rem;  /* 标题和正文之间的间距 */
    font-size: 24px;
}
.contact-text { flex: 1 1 150px; text-align: right; max-width: 240px;}
.contact-text p { margin-bottom: 1.5rem; color: var(--text-secondary); }

/* ===============================
   10. 出版物 (Publications) - [新增]
   =============================== */
.pub-list { max-width: 800px; margin: 0 auto; }

.pub-item { 
    padding: 1.5rem; 
    border-bottom: 1px solid var(--list-border); 
    display: flex; 
    flex-direction: column; 
    gap: 0.5rem; 
}
.pub-item:last-child { border-bottom: none; }

.pub-year { color: var(--accent-color); font-weight: bold; font-size: 0.9rem; }
.pub-title { font-size: 1.2rem; font-weight: 500; color: var(--text-primary); }
.pub-meta { color: var(--text-secondary); font-size: 0.9rem; font-style: italic; }
.pub-links a { color: var(--text-primary); text-decoration: underline; font-size: 0.85rem; margin-right: 1rem; }

/* 乐谱按钮 */
.btn-score {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--text-primary); /* 跟随文字颜色 */
    color: var(--text-primary);
    font-size: 0.8rem;
    text-transform: uppercase;
    transition: all 0.3s ease;
}
.btn-score:hover {
    background: var(--text-primary);
    color: var(--bg-color); /* 反色效果 */
}
/* ===============================
   页脚 (Footer)
   =============================== */
footer {
    background-color: var(--footer-bg);
    padding: 4rem 2rem;
    text-align: center;
    border-top: 1px solid var(--footer-border);
    transition: background 0.3s;
}

.newsletter h4 {
    font-size: 1rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 1.5rem;
    color: var(--text-primary);
}

.input-group {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    max-width: 400px;
    margin: 0 auto;
    flex-wrap: wrap;
}

input[type="email"] {
    padding: 0.8rem;
    flex: 1;
    min-width: 200px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    color: var(--input-text);
    outline: none;
}

button {
    padding: 0.8rem 1.5rem;
    background-color: var(--btn-bg);
    color: var(--btn-text);
    border: none;
    cursor: pointer;
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 1px;
    font-weight: 700;
    transition: background 0.3s;
    white-space: nowrap;
}

button:hover { background-color: var(--btn-hover); }

.copyright {
    font-size: 0.75rem;
    color: var(--footer-text);
    margin-top: 2rem;
    line-height: 1.8;
}

/* ===============================
   其他页面组件 (About/Contact)
   =============================== */
.about-text p {
    margin-bottom: 1.5rem;
    color: var(--text-secondary);
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: var(--accent-color);
    letter-spacing: 1px;
}

.form-control {
    width: 100%;
    padding: 1rem;
    background: var(--card-bg); /* 复用卡片背景 */
    border: 1px solid var(--input-border);
    color: var(--text-primary);
    font-family: var(--font-main);
    font-size: 1rem;
    outline: none;
    transition: border-color 0.3s;
}
.form-control:focus { border-color: var(--accent-color); }

/* ===============================
   移动端响应式
   =============================== */
@media (max-width: 768px) {
    header {
        padding: 1.5rem;
        flex-direction: column;
        gap: 1.5rem;
        background-color: var(--nav-bg-scrolled); /* 移动端背景不透明 */
    }
    .track-container { flex-direction: column; }
    .track-right { text-align: center; }
}

/* ===============================
   播放列表样式 (Playlist)
   =============================== */
.playlist {
    margin-bottom: 2rem;
    max-height: 200px; /* 列表太长可以滚动 */
    overflow-y: auto;
    border-top: 1px solid var(--list-border);
    border-bottom: 1px solid var(--list-border);
}

.playlist-item {
    display: flex;
    align-items: center;
    padding: 0.8rem 0;
    cursor: pointer;
    transition: background 0.2s;
    border-bottom: 1px solid var(--input-border);
}

.playlist-item:last-child {
    border-bottom: none;
}

.playlist-item:hover {
    background-color: rgba(255,255,255,0.05);
}

/* 浅色模式下的 hover */
@media (prefers-color-scheme: light) {
    .playlist-item:hover { background-color: rgba(0,0,0,0.05); }
}

.playlist-item.active {
    color: var(--accent-color); /* 高亮当前播放的曲目 */
}

.playlist-item.active .track-num {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.track-num {
    font-size: 0.8rem;
    margin-right: 1rem;
    opacity: 0.6;
    width: 24px;
    text-align: center;
}

.track-name {
    font-size: 0.95rem;
    font-weight: 500;
}

/* ===============================
   Newsletters样式 
   =============================== */
.newsletter-grid {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    max-width: 800px; /* 限制最大宽度以优化阅读体验 */
    margin: 0 auto;
}

.newsletter-card {
    display: flex;
    background: var(--card-bg); /* 卡片背景色 */
    border: 1px solid var(--card-border);
    height: 200px; /* 固定高度 */
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, border-color 0.2s;
    overflow: hidden; /* 防止图片溢出圆角 */
    border-radius: 8px;
}

.newsletter-card:hover {
    transform: translateY(-2px);
    border-color: var(--card-border);
}

/* 左侧内容区：使用 Flexbox 实现上中下布局 */
.nl-content {
    flex: 1;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between; /* 关键：撑开内容，使时间沉底 */
}

.nl-title {
    font-size: 1.5rem;
    margin: 0;
    font-weight: bold;
}

.nl-excerpt {
    color: var(--text-secondary);
    font-size: 0.95rem;
    margin: 0.5rem 0;
    /* 限制简介显示的行数，超出省略 */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.nl-meta {
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-weight: 500;
}

/* 右侧图片区：固定大小形状 */
.nl-cover {
    width: 200px; /* 固定宽度 */
    height: 100%; /* 撑满高度 */
    background-size: cover;
    background-position: center;
    flex-shrink: 0; /* 防止被左侧内容挤压 */
}

/* 移动端适配：变为垂直排列 */
@media (max-width: 600px) {
    .newsletter-card { flex-direction: column-reverse; height: auto; }
    .nl-cover { width: 100%; height: 150px; }
}

/* =========================================
    文章页专用样式 (Article Specific Styles)
    ========================================= */
/* 文章容器：限制宽度，居中，提升阅读体验 */
.article-container {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1.5rem 6rem; /* 底部留白多一点 */
    margin-top: 4rem;
}

/* 头部信息 */
.article-header {
    text-align: center;
    margin-bottom: 3rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--card-border);
}

.article-intro {
    color: var(--text-secondary); /* 引用变量，自动适配黑白 */
    max-width: 500px;             /* 限制宽度，防止文字太长难读 */
    margin: 0 auto;               /* 水平居中 */
    font-size: 1.1rem;            /* (可选) 稍微大一点点，作为导语 */
    line-height: 1.6;             /* (可选) 增加行高 */
}

.article-meta {
    font-family: 'Caslon', serif; /* 如果有 serif 字体更佳 */
    font-style: italic;
    color: var(--text-secondary); /* 复用变量 */
    font-size: 0.9rem;
    margin-bottom: 1rem;
    display: block;
}

.article-title {
    font-size: 2.5rem;
    line-height: 1.2;
    margin: 0 0 1rem 0;
    background: linear-gradient(120deg, var(--text-primary), var(--text-secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent; /* 简单的渐变文字效果 */
    background-clip: text;
    color: var(--text-primary); /* 降级兼容 */
}

/* 正文排版 */
.article-content {
    font-size: 1.125rem; /* 18px，适合长文阅读 */
    line-height: 1.8;
    color: var(--text-primary);
}

.article-content p {
    margin-bottom: 1.5rem;
}

/* 首字下沉效果 (Drop Cap) - 可选 */
.article-content > p:first-of-type::first-letter {
    font-size: 3.5rem;
    float: left;
    line-height: 0.8;
    margin-right: 0.5rem;
    margin-top: 0.1rem;
    font-family: serif;
    color: var(--text-primary); /* 强调色 */
}

/* 图片样式 */
figure {
    margin: 2.5rem -2rem; /* 让图片比文字宽一点，更有张力 */
}

@media (max-width: 700px) {
    figure { margin: 2rem 0; } /* 移动端恢复对齐 */
}

figure img {
    width: 100%;
    border-radius: 4px;
    display: block;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2); /* 图片阴影 */
}

figcaption {
    text-align: center;
    font-size: 0.9rem;
    color: var(--text-secondary);
    margin-top: 0.8rem;
    font-style: italic;
}

/* 引用块 */
blockquote {
    border-left: 4px solid var(--text-primary);
    margin: 2rem 0;
    padding: 0.5rem 0 0.5rem 1.5rem;
    font-style: italic;
    background: var(--card-bg);
    border-radius: 0 8px 8px 0;
}

/* 小标题 */
.article-content h2 {
    margin-top: 3rem;
    margin-bottom: 1rem;
    font-size: 1.8rem;
    border-bottom: 1px dashed var(--card-border);
    padding-bottom: 0.5rem;
}

/* 返回链接 */
.back-link {
    display: inline-block;
    margin-top: 3rem;
    color: var(--text-secondary);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: all 0.2s;
}
.back-link:hover {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
}
```
