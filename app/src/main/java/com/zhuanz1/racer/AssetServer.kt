package com.zhuanz1.racer

import android.content.Context
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

/**
 * 极小的静态服务器：把 assets/game 通过 http://127.0.0.1:port 提供出去。
 *
 * 为什么需要它：游戏是 ES module + importmap，WebView 在 file:// 协议下会把页面
 * 当成不透明来源，模块请求全部被拦；走 localhost 就和普通网页完全一致，
 * 而且 localStorage、WebAudio、WebGL 的手势策略也都正常。
 *
 * 只绑定回环地址，不监听外部网络；没有任何第三方依赖。
 */
class AssetServer(private val context: Context) {

    private val serverSocket = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
    private val cache = ConcurrentHashMap<String, ByteArray>()
    val port: Int = serverSocket.localPort

    @Volatile
    private var running = true

    init {
        thread(isDaemon = true, name = "racer-assets") { acceptLoop() }
    }

    private fun acceptLoop() {
        while (running) {
            val client = try {
                serverSocket.accept()
            } catch (e: Exception) {
                if (running) continue else break
            }
            thread(isDaemon = true) { serve(client) }
        }
    }

    private fun serve(client: Socket) {
        try {
            client.use { socket ->
                val input = socket.getInputStream()
                val requestLine = readLine(input) ?: return

                // 读完请求头，别让客户端等我们
                while (true) {
                    val header = readLine(input) ?: break
                    if (header.isEmpty()) break
                }

                val target = requestLine.split(' ').getOrNull(1) ?: "/"
                val path = target.substringBefore('?').substringBefore('#')
                val assetPath = if (path == "/" || path.isEmpty()) "game/index.html" else "game$path"

                if (assetPath.contains("..")) {
                    write(socket, 400, "text/plain; charset=utf-8", ByteArray(0))
                    return
                }

                val body = load(assetPath)
                if (body == null) {
                    write(socket, 404, "text/plain; charset=utf-8", ByteArray(0))
                } else {
                    write(socket, 200, mimeOf(assetPath), body)
                }
            }
        } catch (ignored: Exception) {
            // 客户端提前断开是常态
        }
    }

    private fun load(assetPath: String): ByteArray? {
        cache[assetPath]?.let { return it }
        return try {
            val bytes = context.assets.open(assetPath).use { it.readBytes() }
            cache[assetPath] = bytes
            bytes
        } catch (e: Exception) {
            null
        }
    }

    private fun write(socket: Socket, code: Int, mime: String, body: ByteArray) {
        val reason = when (code) {
            200 -> "OK"
            404 -> "Not Found"
            else -> "Bad Request"
        }
        val head = "HTTP/1.1 $code $reason\r\n" +
            "Content-Type: $mime\r\n" +
            "Content-Length: ${body.size}\r\n" +
            "Cache-Control: no-store\r\n" +
            "Connection: close\r\n\r\n"
        val out = socket.getOutputStream()
        out.write(head.toByteArray(Charsets.US_ASCII))
        if (body.isNotEmpty()) out.write(body)
        out.flush()
    }

    private fun readLine(input: InputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val b = input.read()
            if (b == -1) return if (sb.isEmpty()) null else sb.toString()
            if (b == '\n'.code) return sb.toString().trimEnd('\r')
            if (sb.length > 8192) return null
            sb.append(b.toChar())
        }
    }

    private fun mimeOf(name: String): String = when {
        name.endsWith(".html") -> "text/html; charset=utf-8"
        name.endsWith(".js") || name.endsWith(".mjs") -> "text/javascript; charset=utf-8"
        name.endsWith(".css") -> "text/css; charset=utf-8"
        name.endsWith(".json") -> "application/json; charset=utf-8"
        name.endsWith(".png") -> "image/png"
        name.endsWith(".svg") -> "image/svg+xml"
        name.endsWith(".woff2") -> "font/woff2"
        else -> "application/octet-stream"
    }

    fun stop() {
        running = false
        try {
            serverSocket.close()
        } catch (ignored: Exception) {
        }
    }
}
