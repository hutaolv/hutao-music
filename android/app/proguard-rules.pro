# Capacitor WebView JS 接口
-keepclassmembers class com.getcapacitor.** {
  @android.webkit.JavascriptInterface <methods>;
}

# 保留 Capacitor 插件
-keep class com.getcapacitor.** { *; }
-keep class com.capacitor.** { *; }
-keep class com.hutao.music.** { *; }

# 保留 AndroidX
-keep class androidx.** { *; }

# 保留 Kotlin
-keep class kotlin.** { *; }
-keep class kotlinx.** { *; }

# 保留 HTTP 请求相关
-keep class org.apache.** { *; }
