package com.jls.billbook;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.graphics.Color;
import android.os.Build;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        super.onCreate(savedInstanceState);

        // Make status bar NOT overlay content
        Window window = getWindow();

        // Set status bar color
        window.setStatusBarColor(Color.TRANSPARENT);

        // Set navigation bar color
        window.setNavigationBarColor(Color.TRANSPARENT);

        // Ensure content doesn't go behind status/nav bars
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // For Android 11+
            WindowCompat.setDecorFitsSystemWindows(window, false);
        } else {
            // For older versions
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }

        // Set light/dark status bar icons
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false); // false = white icons
        controller.setAppearanceLightNavigationBars(false);
    }
}
