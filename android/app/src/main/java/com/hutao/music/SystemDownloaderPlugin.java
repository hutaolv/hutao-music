package com.hutao.music;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Arrays;

/**
 * 系统下载插件：把音频交给 Android DownloadManager 下载。
 * 好处：通知栏自带实时进度条/断点重试、文件落系统「下载」目录（用户可见）、
 * 全程不申请任何存储权限（安装页不显示隐私权限）。
 * 下载完成后 getContent 分片读回字节，供网页层写入 IndexedDB 离线播放。
 */
@CapacitorPlugin(name = "SystemDownloader")
public class SystemDownloaderPlugin extends Plugin {

    private static final int DEFAULT_CHUNK = 2 * 1024 * 1024;
    private static final String USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36";

    private DownloadManager dm;

    @Override
    public void load() {
        dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    /**
     * 入队系统下载
     * 入参：url / filename / mimeType
     * 返回：id / filename（实际落盘文件名）/ dir（public=系统下载目录，app=应用专属目录）
     */
    @PluginMethod
    public void enqueue(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename", "download.mp3");
        String mime = call.getString("mimeType", "audio/mpeg");

        if (dm == null) {
            call.reject("DownloadManager unavailable");
            return;
        }
        if (url == null || url.isEmpty()) {
            call.reject("url required");
            return;
        }

        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            call.reject("invalid url scheme");
            return;
        }

        // 只取末段，防止文件名里带路径
        filename = filename.replace('/', '_').replace('\\', '_').trim();
        if (filename.isEmpty()) filename = "download.mp3";

        boolean publicDir = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        File dir = publicDir
                ? Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                : getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            call.reject("download dir unavailable");
            return;
        }
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("cannot create download dir");
            return;
        }

        // 目标已存在会让系统下载失败（ERROR_FILE_ALREADY_EXISTS）：能覆盖就覆盖，否则改名加序号
        File target = new File(dir, filename);
        if (target.exists() && !target.delete()) {
            int dot = filename.lastIndexOf('.');
            String stem = dot > 0 ? filename.substring(0, dot) : filename;
            String ext = dot > 0 ? filename.substring(dot) : "";
            for (int n = 1; n < 100; n++) {
                File alt = new File(dir, stem + " (" + n + ")" + ext);
                if (!alt.exists() || alt.delete()) {
                    target = alt;
                    break;
                }
            }
            filename = target.getName();
        }

        try {
            DownloadManager.Request req = new DownloadManager.Request(uri);
            req.setTitle(filename);
            req.setMimeType(mime);
            // 下载中显示进度条，完成后保留通知
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.addRequestHeader("User-Agent", USER_AGENT);
            if (publicDir) {
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            } else {
                req.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, filename);
            }

            long id = dm.enqueue(req);
            JSObject ret = new JSObject();
            ret.put("id", id);
            ret.put("filename", filename);
            ret.put("dir", publicDir ? "public" : "app");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("enqueue failed: " + e.getMessage());
        }
    }

    /**
     * 查询下载状态：status（1排队 2进行中 4暂停 8完成 16失败）
     * 返回：status / reason / bytes / total / localUri / title
     */
    @PluginMethod
    public void query(PluginCall call) {
        Long id = call.getLong("id");
        if (dm == null || id == null) {
            call.reject("id required");
            return;
        }
        Cursor cursor = dm.query(new DownloadManager.Query().setFilterById(id));
        if (cursor == null || !cursor.moveToFirst()) {
            if (cursor != null) cursor.close();
            call.reject("download not found");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("status", readInt(cursor, DownloadManager.COLUMN_STATUS));
        ret.put("reason", readInt(cursor, DownloadManager.COLUMN_REASON));
        ret.put("bytes", readLong(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
        ret.put("total", readLong(cursor, DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
        ret.put("localUri", readString(cursor, DownloadManager.COLUMN_LOCAL_URI));
        ret.put("title", readString(cursor, DownloadManager.COLUMN_TITLE));
        cursor.close();
        call.resolve(ret);
    }

    /**
     * 分片读回已下载文件（base64）
     * 入参：id / offset / length
     * 返回：data（base64）/ offset（下一片起点）/ done（是否读完）
     */
    @PluginMethod
    public void getContent(PluginCall call) {
        Long id = call.getLong("id");
        int offset = call.getInt("offset", 0);
        int length = call.getInt("length", DEFAULT_CHUNK);
        if (dm == null || id == null) {
            call.reject("id required");
            return;
        }
        if (offset < 0) offset = 0;
        if (length <= 0) length = DEFAULT_CHUNK;

        ParcelFileDescriptor pfd = null;
        FileInputStream in = null;
        try {
            pfd = dm.openDownloadedFile(id);
            if (pfd == null) {
                call.reject("file unavailable");
                return;
            }
            in = new FileInputStream(pfd.getFileDescriptor());

            long remaining = offset;
            while (remaining > 0) {
                long skipped = in.skip(remaining);
                if (skipped <= 0) break;
                remaining -= skipped;
            }
            if (remaining > 0) {
                call.reject("offset beyond file");
                return;
            }

            byte[] buf = new byte[length];
            int total = 0;
            int n;
            while (total < length && (n = in.read(buf, total, length - total)) > 0) {
                total += n;
            }
            byte[] slice = total == length ? buf : Arrays.copyOf(buf, total);

            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(slice, Base64.NO_WRAP));
            ret.put("offset", offset + total);
            ret.put("done", total < length);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("read failed: " + e.getMessage());
        } finally {
            if (in != null) {
                try { in.close(); } catch (IOException ignored) { }
            }
            if (pfd != null) {
                try { pfd.close(); } catch (IOException ignored) { }
            }
        }
    }

    /** 取消下载 */
    @PluginMethod
    public void cancel(PluginCall call) {
        Long id = call.getLong("id");
        if (dm == null || id == null) {
            call.reject("id required");
            return;
        }
        dm.remove(id);
        call.resolve();
    }

    private int readInt(Cursor c, String col) {
        int i = c.getColumnIndexOrThrow(col);
        return c.isNull(i) ? 0 : c.getInt(i);
    }

    private long readLong(Cursor c, String col) {
        int i = c.getColumnIndexOrThrow(col);
        return c.isNull(i) ? 0L : c.getLong(i);
    }

    private String readString(Cursor c, String col) {
        int i = c.getColumnIndexOrThrow(col);
        return c.isNull(i) ? null : c.getString(i);
    }
}
