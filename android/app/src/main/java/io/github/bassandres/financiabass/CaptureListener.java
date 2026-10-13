package io.github.bassandres.financiabass;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Escucha las notificaciones de Google Wallet y de las apps de banco que elijas. Cuando una parece compra,
 * la guarda en CaptureStore; la página la anota la próxima vez que abras FinanciaBass. No abre nada.
 */
public class CaptureListener extends NotificationListenerService {
    static final String TEST_TAG = "fb-test";
    static final String CH_CONFIRM = "confirm";
    static final String CH_TEST = "test";
    private static final Pattern DIGIT = Pattern.compile("\\d");
    private static final Pattern AMOUNT = Pattern.compile("(?:MX\\$|\\$)\\s?(\\d[\\d,]*(?:\\.\\d{1,2})?)");
    private static final Pattern NOT_PURCHASE = Pattern.compile(
        "rechaz|declin|no (se )?(pudo|fue|autoriz)|fallid|insuficiente|recibiste|recibimos|has recibido|te (enviaron|depositaron|transfirieron)|abono a tu|dep[oó]sito|gracias por tu pago|pago (aplicado|recibido)|transferencia (recibida|entrante)|reembolso",
        Pattern.CASE_INSENSITIVE);

    private static String lastConfirmAmount = "";
    private static long lastConfirmAt = 0;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            handle(sbn);
        } catch (Throwable ignored) {
            // Nunca tumbar el servicio por una notificación rara.
        }
    }

    @Override
    public void onListenerDisconnected() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(new ComponentName(this, CaptureListener.class));
        }
    }

    private void handle(StatusBarNotification sbn) throws JSONException {
        String pkg = sbn.getPackageName();
        Notification n = sbn.getNotification();
        if (n == null || pkg == null) return;
        boolean own = getPackageName().equals(pkg);
        if (own && !TEST_TAG.equals(sbn.getTag())) return; // nuestros propios avisos
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        if (!own && (n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;

        Bundle x = n.extras;
        if (x == null) return;
        String title = str(x.getCharSequence(Notification.EXTRA_TITLE));
        CharSequence big = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
        String text = str(big != null && big.length() > 0 ? big : x.getCharSequence(Notification.EXTRA_TEXT));
        if (title.isEmpty() && text.isEmpty()) return;

        long now = System.currentTimeMillis();
        if (!own) CaptureStore.seen(this, pkg, now);
        if (!own && !CaptureStore.selected(this).contains(pkg)) return;
        if (!own && !DIGIT.matcher(title + " " + text).find()) return;

        long when = n.when > 0 ? n.when : sbn.getPostTime();
        JSONObject item = new JSONObject();
        // El mismo id aunque la app actualice la notificación: así no se anota dos veces.
        item.put("id", pkg + "-" + sbn.getId() + "-" + when);
        item.put("pkg", pkg);
        item.put("app", label(pkg));
        item.put("title", title);
        item.put("text", text);
        item.put("when", when);
        if (!CaptureStore.enqueue(this, item)) return;

        if (own) {
            cancelNotification(sbn.getKey());
        } else {
            confirm(title, text);
        }
        CaptureStore.notifyListener();
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString().replaceAll("\\s+", " ").trim();
    }

    private String label(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return String.valueOf(pm.getApplicationLabel(ai));
        } catch (Exception e) {
            return pkg;
        }
    }

    /** Aviso silencioso "Compra detectada" (si lo tienes activado). Una sola vez si Wallet y el banco avisan lo mismo. */
    private void confirm(String title, String text) {
        if (!CaptureStore.confirm(this)) return;
        String all = title + " " + text;
        if (NOT_PURCHASE.matcher(all).find()) return;
        Matcher m = AMOUNT.matcher(all);
        if (!m.find()) return;
        String amount = m.group(1);
        long now = System.currentTimeMillis();
        synchronized (CaptureListener.class) {
            if (amount.equals(lastConfirmAmount) && now - lastConfirmAt < 3 * 3600 * 1000L) return;
            lastConfirmAmount = amount;
            lastConfirmAt = now;
        }
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return;
        ensureChannels(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String where = title.isEmpty() ? "" : " · " + title;
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CH_CONFIRM) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_menu_agenda)
            .setContentTitle("Compra detectada: $" + amount)
            .setContentText("Se anota en FinanciaBass" + where)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(2, b.build());
    }

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel confirm = new NotificationChannel(CH_CONFIRM, "Compras detectadas", NotificationManager.IMPORTANCE_LOW);
        confirm.setDescription("Un aviso silencioso cada vez que FinanciaBass detecta una compra");
        nm.createNotificationChannel(confirm);
        NotificationChannel test = new NotificationChannel(CH_TEST, "Prueba de captura", NotificationManager.IMPORTANCE_DEFAULT);
        test.setDescription("Notificación de prueba para revisar que la captura funciona");
        nm.createNotificationChannel(test);
    }
}
