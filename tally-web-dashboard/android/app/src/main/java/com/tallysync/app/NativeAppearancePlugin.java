package com.tallysync.app;

import android.graphics.Color;
import androidx.core.view.WindowCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Match Android's navigation controls to the app's selected appearance. */
@CapacitorPlugin(name = "NativeAppearance")
public class NativeAppearancePlugin extends Plugin {
    @PluginMethod
    public void setTheme(PluginCall call) {
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                android.view.Window window = getActivity().getWindow();
                window.setNavigationBarColor(Color.parseColor(dark ? "#1D2330" : "#EDF0FA"));
                WindowCompat.getInsetsController(window, window.getDecorView())
                    .setAppearanceLightNavigationBars(!dark);
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not update navigation appearance", error);
            }
        });
    }
}
