package dev.unac.local_session

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "local_session/download")
            .setMethodCallHandler { call, result ->
                if (call.method != "baixar") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val url = call.argument<String>("url")
                val nome = call.argument<String>("nome")
                if (url == null || nome == null) {
                    result.error("argumentos", "url e nome são obrigatórios", null)
                    return@setMethodCallHandler
                }
                try {
                    result.success(baixar(url, nome))
                } catch (e: Exception) {
                    result.error("falhou", e.message, null)
                }
            }
    }

    // O cookie HttpOnly com o token só existe no CookieManager da WebView;
    // o DownloadManager roda em outro processo e não o enxerga sozinho.
    private fun baixar(url: String, nome: String): Long {
        val pedido = DownloadManager.Request(Uri.parse(url))
            .setTitle(nome)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nome)
        CookieManager.getInstance().getCookie(url)?.let { pedido.addRequestHeader("Cookie", it) }
        val gerenciador = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        return gerenciador.enqueue(pedido)
    }
}
