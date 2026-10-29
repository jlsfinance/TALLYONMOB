package com.tallysync.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(PdfDownloadPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
