package com.mplivescreen.screencapture

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

class ScreenCaptureService : Service() {

    companion object {
        const val CHANNEL_ID = "ScreenCaptureChannel"
        const val NOTIFICATION_ID = 1001
        const val CHUNK_DURATION_MS = 5000L // 5 seconds
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handler: Handler? = null
    
    private var recordingId: String? = null
    private var chunkIndex = 0
    private var startTime: Long = 0
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    
    // These should come from SharedPreferences or be passed in
    private var apiBaseUrl = "https://vdi-dev.invsta.systems"
    private var apiKey = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        handler = Handler(Looper.getMainLooper())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val resultCode = intent?.getIntExtra("resultCode", Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        val data = intent?.getParcelableExtra<Intent>("data")
        
        if (resultCode == Activity.RESULT_OK && data != null) {
            startForegroundServiceNotification()
            startScreenCapture(resultCode, data)
        } else {
            stopSelf()
        }
        
        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Screen Capture",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Screen capture recording notification"
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundServiceNotification() {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MP Live Screen")
            .setContentText("Recording your screen...")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, 
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startScreenCapture(resultCode: Int, data: Intent) {
        val mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data)
        
        // Get display metrics
        val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        windowManager.defaultDisplay.getMetrics(metrics)
        
        val width = 1080
        val height = 1920
        val density = metrics.densityDpi
        
        // Create ImageReader
        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        
        // Create virtual display
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "ScreenCapture",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface,
            null,
            handler
        )
        
        // Start recording session
        startRecordingSession()
        
        // Start capturing frames
        startFrameCapture()
    }

    private fun startRecordingSession() {
        Thread {
            try {
                val json = JSONObject().apply {
                    put("deviceId", Build.ID)
                    put("platform", "android")
                    put("quality", "1080p")
                    put("frameRate", 60)
                }
                
                val request = Request.Builder()
                    .url("$apiBaseUrl/api/v1/recordings/start")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("X-API-Key", apiKey)
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                
                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        val responseBody = response.body?.string()
                        val responseJson = JSONObject(responseBody ?: "{}")
                        recordingId = responseJson.optString("recordingId")
                        startTime = System.currentTimeMillis()
                        chunkIndex = 0
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }

    private fun startFrameCapture() {
        handler?.postDelayed(object : Runnable {
            override fun run() {
                captureAndUploadChunk()
                handler?.postDelayed(this, CHUNK_DURATION_MS)
            }
        }, CHUNK_DURATION_MS)
    }

    private fun captureAndUploadChunk() {
        val image = imageReader?.acquireLatestImage() ?: return
        
        try {
            val planes = image.planes
            val buffer = planes[0].buffer
            val pixelStride = planes[0].pixelStride
            val rowStride = planes[0].rowStride
            val rowPadding = rowStride - pixelStride * image.width
            
            val bitmap = Bitmap.createBitmap(
                image.width + rowPadding / pixelStride,
                image.height,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)
            
            // Convert to JPEG
            val outputStream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
            val chunkData = outputStream.toByteArray()
            
            bitmap.recycle()
            
            // Upload chunk
            uploadChunk(chunkData)
        } finally {
            image.close()
        }
    }

    private fun uploadChunk(data: ByteArray) {
        val currentRecordingId = recordingId ?: return
        val currentChunkIndex = chunkIndex++
        
        Thread {
            try {
                val requestBody = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart(
                        "chunk",
                        "chunk_$currentChunkIndex.jpg",
                        data.toRequestBody("image/jpeg".toMediaType())
                    )
                    .addFormDataPart("chunkIndex", currentChunkIndex.toString())
                    .addFormDataPart("timestamp", System.currentTimeMillis().toString())
                    .addFormDataPart("duration", CHUNK_DURATION_MS.toString())
                    .build()
                
                val request = Request.Builder()
                    .url("$apiBaseUrl/api/v1/recordings/$currentRecordingId/chunk")
                    .addHeader("X-API-Key", apiKey)
                    .post(requestBody)
                    .build()
                
                client.newCall(request).execute().close()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }

    private fun endRecordingSession() {
        val currentRecordingId = recordingId ?: return
        val duration = System.currentTimeMillis() - startTime
        
        Thread {
            try {
                val json = JSONObject().apply {
                    put("totalChunks", chunkIndex)
                    put("totalDuration", duration)
                }
                
                val request = Request.Builder()
                    .url("$apiBaseUrl/api/v1/recordings/$currentRecordingId/end")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("X-API-Key", apiKey)
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                
                client.newCall(request).execute().close()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }

    override fun onDestroy() {
        super.onDestroy()
        
        endRecordingSession()
        
        handler?.removeCallbacksAndMessages(null)
        virtualDisplay?.release()
        imageReader?.close()
        mediaProjection?.stop()
    }
}

