package io.github.bassandres.financiabass;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/**
 * Compras detectadas que la página todavía no ha anotado, y qué apps escuchar. Todo vive en el celular
 * (SharedPreferences). La página las toma con Bridge.pending() y confirma con Bridge.ack().
 */
final class CaptureStore {
    static final String WALLET = "com.google.android.apps.walletnfcrel";
    private static final int MAX_QUEUE = 500;
    private static final int MAX_RECENT = 300;

    /** Si la app está abierta, se le avisa al llegar una compra. */
    static volatile Runnable listener;

    private CaptureStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("capture", Context.MODE_PRIVATE);
    }

    private static JSONArray array(SharedPreferences p, String key) {
        try { return new JSONArray(p.getString(key, "[]")); } catch (JSONException e) { return new JSONArray(); }
    }

    private static JSONObject object(SharedPreferences p, String key) {
        try { return new JSONObject(p.getString(key, "{}")); } catch (JSONException e) { return new JSONObject(); }
    }

    /** Agrega una compra a la cola. Regresa false si ya se había visto (la misma notificación actualizada). */
    static synchronized boolean enqueue(Context c, JSONObject item) {
        SharedPreferences p = prefs(c);
        String id = item.optString("id");
        JSONArray recent = array(p, "recent");
        for (int i = 0; i < recent.length(); i++) if (id.equals(recent.optString(i))) return false;
        recent.put(id);
        while (recent.length() > MAX_RECENT) recent.remove(0);
        JSONArray queue = array(p, "queue");
        queue.put(item);
        while (queue.length() > MAX_QUEUE) queue.remove(0);
        p.edit().putString("queue", queue.toString()).putString("recent", recent.toString()).apply();
        return true;
    }

    static synchronized String pending(Context c) {
        return prefs(c).getString("queue", "[]");
    }

    /** Quita de la cola las compras que la página ya procesó (anotadas, repetidas o ignoradas). */
    static synchronized void ack(Context c, String idsJson) {
        Set<String> ids = new HashSet<>();
        try {
            JSONArray a = new JSONArray(idsJson);
            for (int i = 0; i < a.length(); i++) ids.add(a.optString(i));
        } catch (JSONException e) {
            return;
        }
        SharedPreferences p = prefs(c);
        JSONArray queue = array(p, "queue");
        JSONArray keep = new JSONArray();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject o = queue.optJSONObject(i);
            if (o != null && !ids.contains(o.optString("id"))) keep.put(o);
        }
        p.edit().putString("queue", keep.toString()).apply();
    }

    /** Apps que escucho. La primera vez: solo Google Wallet. */
    static synchronized Set<String> selected(Context c) {
        SharedPreferences p = prefs(c);
        Set<String> out = new HashSet<>();
        if (!p.contains("apps")) {
            out.add(WALLET);
            return out;
        }
        JSONArray a = array(p, "apps");
        for (int i = 0; i < a.length(); i++) out.add(a.optString(i));
        return out;
    }

    static synchronized void setSelected(Context c, String pkgsJson) {
        try {
            JSONArray a = new JSONArray(pkgsJson);
            prefs(c).edit().putString("apps", a.toString()).apply();
        } catch (JSONException ignored) {
            // nada
        }
    }

    /** Apps que han mandado notificaciones con texto (solo nombre del paquete, cuántas y cuándo; nunca el contenido). */
    static synchronized void seen(Context c, String pkg, long now) {
        SharedPreferences p = prefs(c);
        JSONObject seen = object(p, "seen");
        JSONObject e = seen.optJSONObject(pkg);
        try {
            if (e == null) e = new JSONObject();
            e.put("n", e.optInt("n") + 1);
            e.put("last", now);
            seen.put(pkg, e);
            // Se olvidan las que no han mandado nada en 60 días.
            Iterator<String> it = seen.keys();
            Set<String> old = new HashSet<>();
            while (it.hasNext()) {
                String k = it.next();
                JSONObject v = seen.optJSONObject(k);
                if (v == null || now - v.optLong("last") > 60L * 24 * 3600 * 1000) old.add(k);
            }
            for (String k : old) seen.remove(k);
            p.edit().putString("seen", seen.toString()).apply();
        } catch (JSONException ignored) {
            // nada
        }
    }

    static synchronized JSONObject seenApps(Context c) {
        return object(prefs(c), "seen");
    }

    static boolean confirm(Context c) {
        return prefs(c).getBoolean("confirm", true);
    }

    static void setConfirm(Context c, boolean on) {
        prefs(c).edit().putBoolean("confirm", on).apply();
    }

    static void notifyListener() {
        Runnable l = listener;
        if (l != null) l.run();
    }
}
