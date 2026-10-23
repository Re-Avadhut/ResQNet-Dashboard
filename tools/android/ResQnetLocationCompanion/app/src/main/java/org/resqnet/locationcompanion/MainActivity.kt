package org.resqnet.locationcompanion

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : Activity() {
    companion object {
        private const val PERMISSION_REQUEST = 4101
        private const val TIMEOUT_MS = 60_000L
        private const val MAX_FIX_AGE_MS = 120_000L
        private const val NODE_URL = "http://192.168.4.1/phone-location"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var locationManager: LocationManager
    private lateinit var status: TextView
    private lateinit var coords: TextView
    private lateinit var requestButton: Button
    private var listening = false
    private var sending = false

    private val timeout = Runnable {
        if (listening) {
            stopGps()
            status.text = "No fresh GPS fix within 60 seconds. Try outdoors with a clear view of the sky."
        }
    }

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            val age = System.currentTimeMillis() - location.time
            if (age < -60_000L || age > MAX_FIX_AGE_MS || !location.hasAccuracy()) {
                status.text = "Waiting for a fresh GPS fix with accuracy…"
                return
            }
            if (!listening || sending) return
            stopGps()
            coords.text = String.format(
                Locale.US, "Latitude: %.7f\nLongitude: %.7f\nAccuracy: ±%.1f m\nCaptured: %s",
                location.latitude, location.longitude, location.accuracy,
                SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date(location.time))
            )
            status.text = "GPS acquired. Sending to the connected ResQnet node…"
            sendToNode(location)
        }

        @Deprecated("Required for compatibility")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        override fun onProviderEnabled(provider: String) = Unit
        override fun onProviderDisabled(provider: String) {
            if (listening) runOnUiThread {
                stopGps()
                status.text = "Phone GPS is off. Enable Location Services and retry."
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val scroll = ScrollView(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(24), dp(22), dp(24))
        }
        scroll.addView(root)
        root.addView(TextView(this).apply {
            text = "ResQnet Location Companion"
            textSize = 24f
        }, fullWidth())
        root.addView(TextView(this).apply {
            text = "Connect to ResQnet-6CC474, ResQnet-6F7510, or ResQnet-E64AD8 first. Grant Precise Location when prompted. The app gets a fresh phone GPS fix and sends it to 192.168.4.1 over local Wi-Fi; no internet is required."
            textSize = 15f
            setPadding(0, dp(12), 0, dp(12))
        }, fullWidth())
        requestButton = Button(this).apply {
            text = "Request and Send GPS"
            setOnClickListener { requestGps() }
        }
        root.addView(requestButton, fullWidth())
        root.addView(Button(this).apply {
            text = "Request location permission again"
            setOnClickListener { requestPermission() }
        }, fullWidth())
        coords = TextView(this).apply {
            text = "No phone GPS fix received yet."
            textSize = 16f
            setPadding(0, dp(16), 0, dp(8))
        }
        root.addView(coords, fullWidth())
        status = TextView(this).apply {
            text = "Ready. Connect to the node Wi-Fi and request GPS."
            textSize = 14f
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        root.addView(status, fullWidth())
        setContentView(scroll)
        mainHandler.postDelayed({ requestGps() }, 700L)
    }

    private fun requestPermission() {
        requestPermissions(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            PERMISSION_REQUEST
        )
    }

    private fun requestGps() {
        if (listening || sending) return
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            status.text = "Precise location permission is required. Android will ask you to grant it."
            requestPermission()
            return
        }
        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            status.text = "Location Services are off. Enable them and tap Request and Send GPS."
            return
        }
        try {
            listening = true
            requestButton.isEnabled = false
            status.text = "Waiting up to 60 seconds for a fresh GPS fix. Try outdoors if this is the first fix."
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, listener, Looper.getMainLooper())
            mainHandler.removeCallbacks(timeout)
            mainHandler.postDelayed(timeout, TIMEOUT_MS)
        } catch (e: SecurityException) {
            stopGps()
            status.text = "Android did not grant precise location. Change the app permission to Precise location."
        } catch (e: IllegalArgumentException) {
            stopGps()
            status.text = "This phone does not expose a GPS provider."
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                requestGps()
            } else {
                status.text = "Precise location was denied. The app cannot override that decision; grant it in Android app settings and retry."
            }
        }
    }

    private fun stopGps() {
        if (listening) try { locationManager.removeUpdates(listener) } catch (_: SecurityException) { }
        listening = false
        mainHandler.removeCallbacks(timeout)
        runOnUiThread { if (::requestButton.isInitialized) requestButton.isEnabled = !sending }
    }

    private fun sendToNode(location: Location) {
        sending = true
        requestButton.isEnabled = false
        executor.execute {
            var connection: HttpURLConnection? = null
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            var boundNetwork: Network? = null
            try {
                val wifi = cm.allNetworks.firstOrNull { n ->
                    cm.getNetworkCapabilities(n)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
                } ?: error("Connect to the node's ResQnet Wi-Fi first.")
                check(cm.bindProcessToNetwork(wifi)) { "Could not use the connected Wi-Fi network." }
                boundNetwork = wifi
                val body = JSONObject().apply {
                    put("latitude", location.latitude)
                    put("longitude", location.longitude)
                    put("accuracy_m", location.accuracy.toDouble())
                    put("captured_at_ms", location.time)
                }.toString()
                connection = (URL(NODE_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 6000
                    readTimeout = 6000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Cache-Control", "no-store")
                }
                connection!!.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                val code = connection!!.responseCode
                val response = (if (code in 200..299) connection!!.inputStream else connection!!.errorStream)
                    ?.bufferedReader()?.use { it.readText() }.orEmpty()
                check(code in 200..299) { "Node rejected GPS (HTTP $code): $response" }
                runOnUiThread {
                    status.text = "GPS sent to node successfully. Return to the portal and submit the report within five minutes."
                    sending = false
                    requestButton.isEnabled = true
                }
            } catch (e: Exception) {
                runOnUiThread {
                    status.text = "Could not send GPS: ${e.message ?: e.javaClass.simpleName}. Check node Wi-Fi and retry."
                    sending = false
                    requestButton.isEnabled = true
                }
            } finally {
                connection?.disconnect()
                if (boundNetwork != null) cm.bindProcessToNetwork(null)
            }
        }
    }

    override fun onDestroy() {
        stopGps()
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun fullWidth() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    )
}
