package com.zhuanz1.racer

import android.annotation.SuppressLint
import android.app.Activity
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView

/**
 * 整个 App 就是一个全屏 WebView。
 *
 * 游戏资源打在 assets 里，由 [AssetServer] 走本地回环 HTTP 提供，
 * 这样 ES module / importmap / WebGL / WebAudio 的行为和桌面浏览器一致。
 */
class MainActivity : Activity() {

    private companion object {
        const val TAG = "DSHRacer"
    }

    private var server: AssetServer? = null
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 玩的时候别让屏幕灭掉
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        applyImmersiveMode()

        val assets = try {
            AssetServer(this)
        } catch (t: Throwable) {
            // 没有 INTERNET 权限时 ServerSocket 会在这里抛出 EACCES
            showFatal("本地资源服务启动失败：${t.javaClass.simpleName} ${t.message}")
            return
        }
        server = assets

        web = WebView(this).apply {
            setBackgroundColor(0xFF05070C.toInt())
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                useWideViewPort = true
                loadWithOverviewMode = true
                cacheMode = WebSettings.LOAD_NO_CACHE
                allowFileAccess = false
                allowContentAccess = false
                // 触屏设备上游戏会显示虚拟按键，禁止双击缩放免得误触
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    Log.e(TAG, "webview error ${error.errorCode} ${error.description} ${request.url}")
                    if (request.isForMainFrame) showLoadFailure(error.errorCode, error.description.toString())
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    Log.d(TAG, "console: ${m.message()} @${m.sourceId()}:${m.lineNumber()}")
                    return true
                }
            }
            loadUrl("http://127.0.0.1:${assets.port}/")
        }

        setContentView(web)
    }

    /** 页面本身加载失败（端口没起来、资源缺失等）时给出可见提示，别只留一块黑屏。 */
    private fun showLoadFailure(code: Int, description: String) {
        val html = "<html><body style='background:#05070C;color:#FF6B6B;font:14px monospace;padding:28px;white-space:pre-wrap'>" +
            "游戏资源加载失败\n\n错误码 $code\n$description\n\n" +
            "请把这一屏截图反馈，或连接电脑用 chrome://inspect 查看控制台。" +
            "</body></html>"
        web.loadUrl("data:text/html;charset=utf-8," + Uri.encode(html))
    }

    private fun showFatal(message: String) {
        val view = TextView(this).apply {
            text = "应用启动失败\n\n$message\n\n请截图反馈。"
            setTextColor(0xFFFF6B6B.toInt())
            textSize = 14f
            setPadding(56, 120, 56, 56)
            setBackgroundColor(0xFF05070C.toInt())
        }
        setContentView(view)
        Log.e(TAG, message)
    }

    private fun applyImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveMode()
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.onResume()
    }

    override fun onPause() {
        // 后台时让 WebGL / rAF 停下，省电
        if (::web.isInitialized) web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        server?.stop()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
