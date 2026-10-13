package io.github.bassandres.financiabass;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Lo que la página puede pedirle a Android (window.FBAndroid). Solo se carga la página de FinanciaBass:
 * cualquier otro sitio se abre fuera de la app, así que nadie más puede llamar a estos métodos.
 */
final class Bridge {
    static final int VERSION = 1;
    static final String TEST_TEXT = "Compraste $1.00 en PRUEBA FINANCIABASS";
    private static final String BACKUP_DIR = "FinanciaBass";
    private static final int KEEP_BACKUPS = 7;
    private final MainActivity a;

    Bridge(MainActivity activity) {
        a = activity;
    }

    @JavascriptInterface
    public int version() {
        return VERSION;
    }

    /** Estado de los permisos, para mostrarlo en Más → Captura automática. */
    @JavascriptInterface
    public String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("version", VERSION);
            o.put("access", hasAccess());
            o.put("notify", canNotify());
            o.put("battery", batteryExempt());
            o.put("confirm", CaptureStore.confirm(a));
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("brand", Build.MANUFACTURER);
        } catch (JSONException ignored) {
            // nada
        }
        return o.toString();
    }

    @JavascriptInterface
    public String pending() {
        return CaptureStore.pending(a);
    }

    @JavascriptInterface
    public void ack(String idsJson) {
        CaptureStore.ack(a, idsJson);
    }

    private boolean hasAccess() {
        return NotificationManagerCompat.getEnabledListenerPackages(a).contains(a.getPackageName());
    }

    private boolean canNotify() {
        if (Build.VERSION.SDK_INT >= 33
            && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(a).areNotificationsEnabled();
    }

    private boolean batteryExempt() {
        PowerManager pm = a.getSystemService(PowerManager.class);
        return pm != null && pm.isIgnoringBatteryOptimizations(a.getPackageName());
    }

    /** Abre la pantalla de Android para dar acceso a las notificaciones. */
    @JavascriptInterface
    public void openAccess() {
        ComponentName cn = new ComponentName(a, CaptureListener.class);
        Intent i;
        if (Build.VERSION.SDK_INT >= 30) {
            i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, cn.flattenToString());
        } else {
            i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        }
        if (!start(i)) start(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
    }

    /** Información de la app (ahí está "⋮ → Permitir configuración restringida"). */
    @JavascriptInterface
    public void openAppInfo() {
        start(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName())));
    }

    @JavascriptInterface
    public void askNotify() {
        if (Build.VERSION.SDK_INT >= 33
            && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            a.runOnUiThread(() -> a.requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, MainActivity.REQ_NOTIFY));
        } else {
            start(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName()));
        }
    }

    @JavascriptInterface
    public void askBattery() {
        if (batteryExempt()) return;
        if (!start(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + a.getPackageName())))) {
            start(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    @JavascriptInterface
    public void setConfirm(boolean on) {
        CaptureStore.setConfirm(a, on);
    }

    /** Apps que escucho + apps que han mandado notificaciones (con su nombre), para elegir. */
    @JavascriptInterface
    public String apps() {
        JSONObject out = new JSONObject();
        try {
            Set<String> sel = CaptureStore.selected(a);
            JSONObject seen = CaptureStore.seenApps(a);
            List<String> pkgs = new ArrayList<>(sel);
            Iterator<String> it = seen.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (!pkgs.contains(k)) pkgs.add(k);
            }
            if (!pkgs.contains(CaptureStore.WALLET) && installed(CaptureStore.WALLET)) pkgs.add(CaptureStore.WALLET);
            JSONArray list = new JSONArray();
            for (String p : pkgs) {
                if (p.equals(a.getPackageName())) continue;
                JSONObject e = new JSONObject();
                e.put("pkg", p);
                e.put("label", label(p));
                e.put("on", sel.contains(p));
                e.put("installed", installed(p));
                JSONObject s = seen.optJSONObject(p);
                e.put("n", s == null ? 0 : s.optInt("n"));
                e.put("last", s == null ? 0 : s.optLong("last"));
                list.put(e);
            }
            out.put("apps", list);
        } catch (JSONException ignored) {
            // nada
        }
        return out.toString();
    }

    /** Todas las apps con ícono (por si tu banco todavía no ha mandado ninguna notificación). */
    @JavascriptInterface
    public String allApps() {
        JSONArray list = new JSONArray();
        try {
            PackageManager pm = a.getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            for (android.content.pm.ResolveInfo ri : pm.queryIntentActivities(main, 0)) {
                String p = ri.activityInfo.packageName;
                if (p.equals(a.getPackageName())) continue;
                JSONObject e = new JSONObject();
                e.put("pkg", p);
                e.put("label", String.valueOf(ri.loadLabel(pm)));
                list.put(e);
            }
        } catch (Exception ignored) {
            // nada
        }
        return list.toString();
    }

    @JavascriptInterface
    public void setApps(String pkgsJson) {
        CaptureStore.setSelected(a, pkgsJson);
    }

    /**
     * Prueba de punta a punta: publica una notificación de compra falsa; si el permiso está bien,
     * CaptureListener la toma, la quita y la página dice "¡Funciona!". Regresa "ok", "access" o "notify".
     */
    @JavascriptInterface
    public String test() {
        if (!hasAccess()) return "access";
        if (!canNotify()) return "notify";
        CaptureListener.ensureChannels(a);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(a, CaptureListener.CH_TEST) : new Notification.Builder(a);
        b.setSmallIcon(android.R.drawable.ic_menu_agenda)
            .setContentTitle("PRUEBA FinanciaBass")
            .setContentText(TEST_TEXT)
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true);
        NotificationManager nm = a.getSystemService(NotificationManager.class);
        if (nm == null) return "notify";
        nm.notify(CaptureListener.TEST_TAG, (int) (System.currentTimeMillis() % 100000), b.build());
        return "ok";
    }

    /** Comparte un archivo (respaldo, calendario) con el menú de Android: Drive, WhatsApp, correo… */
    @JavascriptInterface
    public boolean shareFile(String name, String text, String mime) {
        try {
            File dir = new File(a.getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) return false;
            File f = new File(dir, safeName(name));
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".files", f);
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType(mime == null || mime.isEmpty() ? "text/plain" : mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, name)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(name, uri));
            return start(Intent.createChooser(send, name));
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Respaldo automático en Descargas/FinanciaBass (sobrevive aunque desinstales la app). Guarda los últimos 7.
     * Regresa dónde quedó, o "" si no se pudo.
     */
    @JavascriptInterface
    public String saveBackup(String name, String text) {
        String file = safeName(name);
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = a.getContentResolver();
                Uri coll = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                String rel = Environment.DIRECTORY_DOWNLOADS + "/" + BACKUP_DIR + "/";
                Uri target = null;
                try (Cursor c = cr.query(coll, new String[] {MediaStore.MediaColumns._ID},
                    MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?",
                    new String[] {file, rel}, null)) {
                    if (c != null && c.moveToFirst()) target = Uri.withAppendedPath(coll, String.valueOf(c.getLong(0)));
                }
                if (target == null) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, file);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
                    target = cr.insert(coll, v);
                }
                if (target == null) return "";
                try (OutputStream out = cr.openOutputStream(target, "wt")) {
                    if (out == null) return "";
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                }
                prune(cr, coll, rel);
                return "Descargas/" + BACKUP_DIR + "/" + file;
            }
            File dir = a.getExternalFilesDir("respaldos");
            if (dir == null) return "";
            try (FileOutputStream out = new FileOutputStream(new File(dir, file))) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            return dir.getAbsolutePath() + "/" + file;
        } catch (Exception e) {
            return "";
        }
    }

    private static void prune(ContentResolver cr, Uri coll, String rel) {
        try (Cursor c = cr.query(coll, new String[] {MediaStore.MediaColumns._ID},
            MediaStore.MediaColumns.RELATIVE_PATH + "=?", new String[] {rel},
            MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
            if (c == null) return;
            int i = 0;
            while (c.moveToNext()) {
                if (i++ < KEEP_BACKUPS) continue;
                try {
                    cr.delete(Uri.withAppendedPath(coll, String.valueOf(c.getLong(0))), null, null);
                } catch (Exception ignored) {
                    // copias de una instalación anterior: no son nuestras, se quedan
                }
            }
        }
    }

    /** Texto del portapapeles (para "Pegar mis datos" y "Pegar compra"). */
    @JavascriptInterface
    public String clipboard() {
        AtomicReference<String> out = new AtomicReference<>("");
        CountDownLatch done = new CountDownLatch(1);
        a.runOnUiThread(() -> {
            try {
                ClipboardManager cm = a.getSystemService(ClipboardManager.class);
                ClipData clip = cm == null ? null : cm.getPrimaryClip();
                if (clip != null && clip.getItemCount() > 0) {
                    CharSequence t = clip.getItemAt(0).coerceToText(a);
                    out.set(t == null ? "" : t.toString());
                }
            } catch (Exception ignored) {
                // nada
            }
            done.countDown();
        });
        try {
            done.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        return out.get();
    }

    /** Abre un enlace fuera de la app (calendario, Play Store…). */
    @JavascriptInterface
    public void openUrl(String url) {
        try {
            start(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
            // nada
        }
    }

    private boolean start(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean installed(String pkg) {
        try {
            a.getPackageManager().getApplicationInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private String label(String pkg) {
        try {
            PackageManager pm = a.getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return String.valueOf(pm.getApplicationLabel(ai));
        } catch (Exception e) {
            return pkg;
        }
    }

    private static String safeName(String name) {
        String n = name == null ? "archivo.txt" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return n.isEmpty() ? "archivo.txt" : n;
    }
}
