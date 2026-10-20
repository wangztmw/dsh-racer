# DSH 赛车 · 安卓版

> **推荐用法：直接开 <https://wangztmw.github.io/dsh-racer/>，在 Chrome 里「添加到主屏幕」，
> 桌面就会多一个全屏图标，离线也能玩、永远最新。** 这是 PWA（可安装 Web 应用），
> 不需要 APK、不需要任何权限、不受系统 WebView 版本影响。
>
> 下面的 APK 方案保留作为备用（想脱离浏览器、或需要完全离线的独立安装包时用）。

把桌面那份网页赛车打包成 **一个安卓 App**：全屏 WebView + 内置 assets，
没有网络请求、没有第三方依赖、APK 大约 1 MB。

编译交给 GitHub Actions（这台 Mac 没装 JDK 和 Android SDK），你只要把代码推上去。

---

## 一、怎么拿到 APK

### 1. 建仓库

GitHub 上新建一个空仓库（公开私有都行；私有仓库每月 2000 分钟免费额度，这个项目一次编译约 3~5 分钟）。

### 2. 推代码

工程已经初始化成 git 仓库、提交好了（分支 `main`），你只需要加远端然后推：

```bash
cd ~/Desktop/dsh_wksp/racer-android
git remote add origin git@github.com:你的用户名/你的仓库名.git
git push -u origin main
```

如果用的是 HTTPS 或者别的协议，把 origin 地址换成对应的即可。

### 3. 等编译

仓库页面点 **Actions**，`构建 APK` 会自动开始跑。绿色对勾 = 成功。

- **直接下载**：点进那次运行 → 页面底部 **Artifacts** → `racer-apk`（是个 zip，解压得到 `app-debug.apk`）。需要登录 GitHub。
- **发 Release（推荐）**：打个 tag，APK 会直接挂在 Release 页面上，手机浏览器点链接就能下，不用登录：

```bash
git tag v1.0
git push origin v1.0
```

### 4. 查编译结果（可选，用 gh CLI）

```bash
gh run list --limit 5
gh run view <run-id> --log
gh run view <run-id> --json conclusion --jq .conclusion   # 只看这个判断成败
```

> ⚠️ 别用 `gh run watch` 的退出码判断成败——它轮询 post 步骤时网络抖一下也会返回 1，实际是成功的。

### 5. 装到手机

把 `app-debug.apk` 传到手机（AirDrop / 微信 / 数据线都行），点开安装。
第一次会提示「未知来源应用」，允许即可。

> debug 签名的密钥在 CI 里缓存了，所以**后续版本可以直接覆盖安装**，不用先卸载。
> 但和别的应用签名不同，不能共存安装两个版本。
>
> **想让手机浏览器点链接直接下载（不用登录 GitHub），仓库必须设为公开**；
> 私有仓库的 Release 下载同样要登录。

---

## 二、更新游戏内容

桌面版的网页游戏在 `../racer`。改完代码后同步进来，再提交：

```bash
cd ~/Desktop/dsh_wksp/racer-android
./sync-web.sh          # 复制 index.html / src / styles，并带上必需的 three 文件
./check.sh             # 推送前静态检查（XML / 资源引用 / 括号配平）
git add -A
git commit -m "同步游戏更新"
git push
```

`sync-web.sh` 会把 importmap 里指向 `node_modules` 的路径改写成随包的 `vendor/`，
所以 APK 里只带 three 的运行必需文件（约 900 KB），不是整个 32 MB 的 node_modules。

---

## 三、结构

```
app/src/main/
├── AndroidManifest.xml          横屏、全屏、允许本地 http
├── java/com/zhuanz1/racer/
│   ├── MainActivity.kt          全屏 WebView + 沉浸式
│   └── AssetServer.kt           极简静态服务器（把 assets 走 127.0.0.1 提供）
├── assets/game/                 ← sync-web.sh 生成，不要手改
│   ├── index.html
│   ├── src/  styles/
│   └── vendor/                  three.module.js + 两个 addon
└── res/                         图标 / 主题 / 字符串
```

### 为什么要内置一个 HTTP 服务器

游戏用的是 **ES module + importmap**。WebView 在 `file://` 协议下会把页面当成不透明来源，
模块请求会被拦截、页面直接白屏。通过 `http://127.0.0.1:随机端口/` 提供后，
行为和桌面浏览器完全一致（含 localStorage、WebAudio、WebGL）。

服务器只绑定回环地址，不监听外部网络，没有任何权限声明。

---

## 四、推送前先跑检查

本机没有 JDK / Android SDK，编译器错误只能靠 CI 发现；但资源和语法层面的错误可以先挡掉：

```bash
./check.sh
```

它做三件事（对应桌面文档《安卓应用云端打包经验》第 8 节）：

1. `xmllint` 校验所有 XML
2. 扫描 `@string/ @drawable/ @mipmap/ @style/ @color/` 引用，与 `res/` 下的实际定义比对
3. 检查 `.kt` 的 `{} () []` 配平

## 五、注意

- **Android 8.0+**（minSdk 26）。ES module 和 importmap 依赖较新的系统 WebView，
  Android 8~9 上的旧 WebView 可能需要先在应用商店更新「Android System WebView」。
- 触屏设备上游戏会自动显示虚拟方向键和油门/刹车键（`@media (pointer: coarse)`），
  小地图和速度表会自动上移让出位置。
- 游戏内可以切视角（`C`）没有虚拟键；手机上默认就是追尾视角。
