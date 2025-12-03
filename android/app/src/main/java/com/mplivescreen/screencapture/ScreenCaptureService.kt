package com.mplivescreen.screencapture

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Surface
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * ScreenCaptureService - Foreground service for screen recording
 * Equivalent to iOS Broadcast Extension
 * 
 * Features:
 * - Screen capture via MediaProjection
 * - H.264 video encoding via MediaCodec
 * - AAC audio encoding for microphone (Gemini)
 * - Chunked recording with automatic rotation
 * - Background upload to backend
 */
class ScreenCaptureService : Service() {

    companion object {
        private const val TAG = "ScreenCaptureService"
        const val CHANNEL_ID = "ScreenCaptureChannel"
        const val NOTIFICATION_ID = 1001
        
        const val ACTION_START = "com.mplivescreen.START_CAPTURE"
        const val ACTION_STOP = "com.mplivescreen.STOP_CAPTURE"
        
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_DATA = "data"
        
        // Recording settings
        const val DEFAULT_WIDTH = 1080
        const val DEFAULT_HEIGHT = 1920
        const val DEFAULT_CHUNK_DURATION_MS = 30_000L  // 30 seconds
    }

    // MediaProjection
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    
    // Recording components
    private var chunkManager: ChunkManager? = null
    private var uploadManager: UploadManager? = null
    
    // Recording state
    private var isRecording = false
    private var recordingStartTime: Long = 0
    
    // Configuration
    private var appType: String = "gemini"  // "gemini", "chatgpt", or "search-live"
    
    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        uploadManager = UploadManager(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: action=${intent?.action}")
        
        when (intent?.action) {
            ACTION_STOP -> {
                stopRecording()
                stopSelf()
            }
            else -> {
                val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED) 
                    ?: Activity.RESULT_CANCELED
                val data = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent?.getParcelableExtra(EXTRA_DATA)
                }
                
                if (resultCode == Activity.RESULT_OK && data != null) {
                    startForegroundWithNotification()
                    loadConfiguration()
                    startRecording(resultCode, data)
                } else {
                    Log.e(TAG, "Invalid start parameters")
                    stopSelf()
                }
            }
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
                description = "Recording screen for MP LiveCapture"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundWithNotification() {
        val stopIntent = Intent(this, ScreenCaptureService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MP LiveCapture")
            .setContentText("Recording your screen...")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopPendingIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val foregroundServiceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or 
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            } else {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            }
            startForeground(NOTIFICATION_ID, notification, foregroundServiceType)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        
        Log.d(TAG, "Foreground service started")
    }

    private fun loadConfiguration() {
        val prefs = getSharedPreferences("TaskParams", Context.MODE_PRIVATE)
        appType = prefs.getString("aiAppType", "gemini") ?: "gemini"
        Log.d(TAG, "Configuration loaded: appType=$appType")
    }

    private fun callCleanupEndpoint(callback: (Boolean) -> Unit) {
        val prefs = getSharedPreferences("TaskParams", Context.MODE_PRIVATE)
        val taskId = prefs.getString("taskId", null)
        val tenantId = prefs.getString("tenantId", null)
        val campaignId = prefs.getString("campaignId", null)
        val stepId = prefs.getString("stepId", null)
        val apiBaseUrl = prefs.getString("apiBaseUrl", null)
        val xApiKey = prefs.getString("xApiKey", "") ?: ""
        val aiAppType = prefs.getString("aiAppType", "gemini") ?: "gemini"
        val taskType = prefs.getString("taskType", "audio-video") ?: "audio-video"
        
        if (taskId == null || tenantId == null || apiBaseUrl == null) {
            Log.w(TAG, "Missing params for cleanup, proceeding anyway")
            callback(true)
            return
        }
        
        Log.d(TAG, "🧹 Calling delete-mobile-content: $apiBaseUrl/api/delete-mobile-content")
        
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
        
        val jsonBody = JSONObject().apply {
            put("tenant_id", tenantId)
            put("campaign_id", campaignId ?: "")
            put("task_id", taskId)
            put("step_id", stepId ?: "")
            put("app_type", aiAppType)
            put("task_type", taskType)
            put("os_type", "android")
        }
        
        val requestBody = jsonBody.toString()
            .toRequestBody("application/json".toMediaType())
        
        val request = Request.Builder()
            .url("$apiBaseUrl/api/delete-mobile-content")
            .addHeader("Content-Type", "application/json")
            .addHeader("X-API-Key", xApiKey)
            .post(requestBody)
            .build()
        
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "❌ Cleanup error: ${e.message}")
                callback(false)
            }
            
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    Log.d(TAG, "📊 Cleanup response: ${response.code}")
                    val responseBody = response.body?.string()
                    Log.d(TAG, "📄 Cleanup response body: $responseBody")
                    callback(response.isSuccessful)
                }
            }
        })
    }

    private fun startRecording(resultCode: Int, data: Intent) {
        Log.d(TAG, "Starting recording")
        
        // Call cleanup endpoint first, then start recording
        callCleanupEndpoint { success ->
            if (success) {
                Log.d(TAG, "Cleanup completed, starting recording")
            } else {
                Log.w(TAG, "Cleanup failed, proceeding anyway")
            }
            
            handler.post {
                actuallyStartRecording(resultCode, data)
            }
        }
    }
    
    private fun actuallyStartRecording(resultCode: Int, data: Intent) {
        try {
            // Get MediaProjection
            val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = projectionManager.getMediaProjection(resultCode, data)
            
            if (mediaProjection == null) {
                Log.e(TAG, "Failed to get MediaProjection")
                stopSelf()
                return
            }
            
            // Register callback for projection stop
            mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.d(TAG, "MediaProjection stopped")
                    handler.post { stopRecording() }
                }
            }, handler)
            
            // Get display metrics
            val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getMetrics(metrics)
            
            val width = DEFAULT_WIDTH
            val height = DEFAULT_HEIGHT
            val density = metrics.densityDpi
            
            // Create chunk manager
            // For Gemini: capture mic audio (separate file) + app audio (in video file)
            // For ChatGPT: no mic needed (user exports manually)
            val includeMicAudio = appType.lowercase() != "chatgpt"
            
            chunkManager = ChunkManager(
                context = this,
                chunkDurationMs = DEFAULT_CHUNK_DURATION_MS,
                onChunkReady = { chunkInfo -> onChunkReady(chunkInfo) }
            ).apply {
                // Pass mediaProjection for app audio capture (Gemini/ChatGPT voice)
                configure(width, height, includeMicAudio, mediaProjection)
            }
            
            // Start recording and get encoder surface
            val surface = chunkManager?.start()
            
            if (surface == null) {
                Log.e(TAG, "Failed to get encoder surface")
                stopSelf()
                return
            }
            
            // Create VirtualDisplay to render to encoder surface
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "ScreenCapture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                surface,
                null,
                handler
            )
            
            isRecording = true
            recordingStartTime = System.currentTimeMillis()
            
            // Update status
            updateRecordingStatus(true)
            
            Log.d(TAG, "Recording started: ${width}x${height}, density=$density, audio=$includeAudio")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting recording", e)
            stopSelf()
        }
    }

    private fun onChunkReady(chunkInfo: ChunkManager.ChunkInfo) {
        Log.d(TAG, "Chunk ready: index=${chunkInfo.chunkIndex}, duration=${chunkInfo.durationMs}ms, final=${chunkInfo.isFinal}")
        
        val taskParams = uploadManager?.loadTaskParams()
        if (taskParams == null) {
            Log.e(TAG, "No task params, cannot upload")
            return
        }
        
        uploadManager?.uploadChunk(
            chunkInfo = chunkInfo,
            taskParams = taskParams,
            onSuccess = {
                Log.d(TAG, "Chunk ${chunkInfo.chunkIndex} uploaded successfully")
            },
            onError = { error ->
                Log.e(TAG, "Chunk ${chunkInfo.chunkIndex} upload failed: $error")
            }
        )
    }

    private fun stopRecording() {
        Log.d(TAG, "Stopping recording")
        
        if (!isRecording) {
            Log.d(TAG, "Not recording, nothing to stop")
            return
        }
        
        isRecording = false
        val duration = System.currentTimeMillis() - recordingStartTime
        Log.d(TAG, "Recording duration: ${duration}ms")
        
        // Stop chunk manager (will trigger final chunk)
        val finalChunk = chunkManager?.stop()
        if (finalChunk != null) {
            onChunkReady(finalChunk)
        }
        
        // Release VirtualDisplay
        virtualDisplay?.release()
        virtualDisplay = null
        
        // Stop MediaProjection
        mediaProjection?.stop()
        mediaProjection = null
        
        // Update status
        updateRecordingStatus(false)
        
        Log.d(TAG, "Recording stopped")
    }

    private fun updateRecordingStatus(isRecording: Boolean) {
        val prefs = getSharedPreferences("RecordingStatus", Context.MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean("isRecording", isRecording)
            putLong("timestamp", System.currentTimeMillis())
            apply()
        }
        
        // Broadcast state change
        val intent = Intent("com.mplivescreen.RECORDING_STATE_CHANGED").apply {
            putExtra("isRecording", isRecording)
        }
        sendBroadcast(intent)
    }

    override fun onDestroy() {
        Log.d(TAG, "Service destroyed")
        stopRecording()
        uploadManager?.shutdown()
        chunkManager?.cleanupChunks()
        super.onDestroy()
    }
}
