package com.mauzohalisi.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * Bluetooth thermal receipt printing.
 *
 * The web app cannot reach a Bluetooth printer: Web Bluetooth does not cover
 * the Serial Port Profile these printers speak, and is unavailable in a WebView
 * regardless. So the shell does it, and the page calls in.
 *
 * Devices must already be paired in Android settings. Pairing involves a PIN
 * prompt owned by the system, and reimplementing discovery here would add a
 * second, worse pairing flow for no gain.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        @Permission(alias = "bluetooth", strings = {
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.BLUETOOTH_SCAN,
        }),
    }
)
public class ThermalPrinterPlugin extends Plugin {

    /** The well-known Serial Port Profile UUID every ESC/POS printer exposes. */
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private static final String PREFS = "mauzo_printer";
    private static final String KEY_ADDRESS = "address";
    private static final String KEY_WIDTH = "width";

    private BluetoothSocket socket;
    private OutputStream stream;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Paired devices, so the page can offer a choice. */
    @PluginMethod
    public void listDevices(PluginCall call) {
        if (!hasBluetoothPermission()) { requestPermissionForAlias("bluetooth", call, "afterPermission"); return; }
        deliverDevices(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is needed to reach the printer.");
            return;
        }
        deliverDevices(call);
    }

    private void deliverDevices(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (adapter == null)          { call.reject("This device has no Bluetooth."); return; }
        if (!adapter.isEnabled())     { call.reject("Bluetooth is switched off."); return; }

        JSArray list = new JSArray();
        try {
            Set<BluetoothDevice> paired = adapter.getBondedDevices();
            for (BluetoothDevice d : paired) {
                JSObject o = new JSObject();
                o.put("name", d.getName() == null ? d.getAddress() : d.getName());
                o.put("address", d.getAddress());
                list.put(o);
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth permission is needed to reach the printer.");
            return;
        }

        JSObject res = new JSObject();
        res.put("devices", list);
        res.put("selected", prefs().getString(KEY_ADDRESS, null));
        call.resolve(res);
    }

    /** Remember which printer to use, and how wide its paper is. */
    @PluginMethod
    public void select(PluginCall call) {
        String address = call.getString("address");
        if (address == null) { call.reject("A printer address is required."); return; }
        int width = call.getInt("width", EscPos.WIDTH_58MM);

        prefs().edit().putString(KEY_ADDRESS, address).putInt(KEY_WIDTH, width).apply();
        closeQuietly();                     // force a reconnect to the new printer
        call.resolve();
    }

    @PluginMethod
    public void getSelected(PluginCall call) {
        JSObject res = new JSObject();
        res.put("address", prefs().getString(KEY_ADDRESS, null));
        res.put("width", prefs().getInt(KEY_WIDTH, EscPos.WIDTH_58MM));
        call.resolve(res);
    }

    /**
     * Print plain text.
     *
     * Runs off the main thread: a Bluetooth connect blocks for seconds when the
     * printer is asleep or out of range, and doing that on the UI thread freezes
     * the till mid-sale.
     */
    @PluginMethod
    public void printText(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) { call.reject("Nothing to print."); return; }

        String address = call.getString("address", prefs().getString(KEY_ADDRESS, null));
        if (address == null) { call.reject("NO_PRINTER"); return; }

        int width = call.getInt("width", prefs().getInt(KEY_WIDTH, EscPos.WIDTH_58MM));

        new Thread(() -> {
            try {
                ensureConnected(address);
                stream.write(EscPos.receipt(text, width));
                stream.flush();
                call.resolve();
            } catch (SecurityException e) {
                call.reject("Bluetooth permission is needed to reach the printer.");
            } catch (Exception e) {
                // A dropped socket is the common case: the printer sleeps and the
                // cached connection dies silently. Drop it so the next attempt
                // reconnects rather than failing forever.
                closeQuietly();
                call.reject(friendly(e));
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeQuietly();
        call.resolve();
    }

    private void ensureConnected(String address) throws Exception {
        if (socket != null && socket.isConnected() && stream != null) return;
        closeQuietly();

        BluetoothAdapter adapter = adapter();
        if (adapter == null)      throw new IllegalStateException("This device has no Bluetooth.");
        if (!adapter.isEnabled()) throw new IllegalStateException("Bluetooth is switched off.");

        BluetoothDevice device = adapter.getRemoteDevice(address);
        socket = device.createRfcommSocketToServiceRecord(SPP);

        // Discovery keeps the radio busy and makes connect fail intermittently.
        try { adapter.cancelDiscovery(); } catch (SecurityException ignored) { }

        socket.connect();
        stream = socket.getOutputStream();
    }

    private String friendly(Exception e) {
        String m = e.getMessage() == null ? "" : e.getMessage().toLowerCase();
        if (m.contains("timed out"))  return "The printer did not answer. Check it is on and in range.";
        if (m.contains("refused") || m.contains("read failed")) {
            return "Could not connect to the printer. Check it is on and paired.";
        }
        if (e instanceof IllegalStateException) return e.getMessage();
        return "Printing failed. Check the printer is on, paired and has paper.";
    }

    private void closeQuietly() {
        try { if (stream != null) stream.close(); } catch (Exception ignored) { }
        try { if (socket != null) socket.close(); } catch (Exception ignored) { }
        stream = null;
        socket = null;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    /** BLUETOOTH_CONNECT is only a runtime permission from Android 12. */
    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return getPermissionState("bluetooth") == com.getcapacitor.PermissionState.GRANTED;
    }

    @Override
    protected void handleOnDestroy() {
        closeQuietly();
    }
}
