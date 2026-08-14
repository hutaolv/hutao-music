package com.hutao.music;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android WebView 默认要求用户手势才能播放媒体，导致后台自动切歌时
        // audio.play() 被拒绝（无手势调用），关闭后可在无用户操作时连续播放
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
