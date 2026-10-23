# ResQnet Location Companion

This app uses Android's native precise-location permission and GPS provider, then sends the fix to the connected ResQnet node at `http://192.168.4.1/phone-location`. It needs no internet at runtime.

## Install and use
1. Open the repository's **Actions** tab.
2. Select **Build ResQnet Location Companion APK**, then open the latest successful run.
3. Under **Artifacts**, download `resqnet-location-companion-debug-apk` and extract `app-debug.apk`.
4. Transfer the APK to the Android phone and install it. Approve the one-time “install unknown apps” permission for the file/browser app if Android asks.
5. Connect to a node AP: `ResQnet-6CC474`, `ResQnet-6F7510`, or `ResQnet-E64AD8`.
6. Open the app and grant **Precise location**.
7. Wait for a fresh fix and the message confirming it was sent.
8. Return to `http://192.168.4.1/`, check the displayed coordinates, and submit the report within five minutes.

## Limitations
The app cannot override permission denial, disabled Location Services, or missing satellite reception. The node accepts a recent fix for up to five minutes. The demo endpoint is plain HTTP on an open AP; do not use it in production without authentication and transport security.
