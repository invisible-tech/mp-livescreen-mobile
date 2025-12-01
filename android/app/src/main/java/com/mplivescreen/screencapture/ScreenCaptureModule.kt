package com.mplivescreen.screencapture

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.util.UUID

/**
 * ScreenCaptureModule - React Native bridge for screen capture
 * Matches iOS ScreenCaptureModule API
 */
class ScreenCaptureModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), 
    ActivityEventListener,
    PermissionListener {

    companion object {
        const val NAME = "ScreenCaptureModule"
        private const val TAG = "ScreenCaptureModule"
        private const val SCREEN_CAPTURE_REQUEST_CODE = 1001
        private const val PERMISSION_REQUEST_CODE = 1002
    }

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var pendingPromise: Promise? = null
    private var permissionPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
        mediaProjectionManager = reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) 
            as? MediaProjectionManager
    }

    override fun getName(): String = NAME

    // ==================== Broadcast Control ====================

    @ReactMethod
    fun startBroadcast(promise: Promise) {
        Log.d(TAG, "startBroadcast called")
        val activity = currentActivity
        if (activity == null) {
            promise.reject("ERROR", "Activity is null")
            return
        }

        pendingPromise = promise

        // Request screen capture permission
        val intent = mediaProjectionManager?.createScreenCaptureIntent()
        if (intent != null) {
            activity.startActivityForResult(intent, SCREEN_CAPTURE_REQUEST_CODE)
        } else {
            promise.reject("ERROR", "Could not create screen capture intent")
        }
    }

    @ReactMethod
    fun stopBroadcast(promise: Promise) {
        Log.d(TAG, "stopBroadcast called")
        try {
            val intent = Intent(reactApplicationContext, ScreenCaptureService::class.java).apply {
                action = ScreenCaptureService.ACTION_STOP
            }
            reactApplicationContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping broadcast", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun isRecording(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("RecordingStatus", Context.MODE_PRIVATE)
        val isRecording = prefs.getBoolean("isRecording", false)
        promise.resolve(isRecording)
    }

    @ReactMethod
    fun isBroadcastActive(promise: Promise) {
        // Same as isRecording for Android
        isRecording(promise)
    }

    // ==================== Permissions ====================

    @ReactMethod
    fun requestMicrophonePermission(promise: Promise) {
        Log.d(TAG, "requestMicrophonePermission called")
        
        if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) 
            == PackageManager.PERMISSION_GRANTED) {
            promise.resolve(true)
            return
        }

        val activity = currentActivity
        if (activity == null || activity !is PermissionAwareActivity) {
            promise.reject("ERROR", "Activity not available")
            return
        }

        permissionPromise = promise
        activity.requestPermissions(
            arrayOf(Manifest.permission.RECORD_AUDIO),
            PERMISSION_REQUEST_CODE,
            this
        )
    }

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        val micGranted = ContextCompat.checkSelfPermission(
            reactApplicationContext, 
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        val result = Arguments.createMap().apply {
            putBoolean("microphone", micGranted)
            putInt("microphoneStatus", if (micGranted) 3 else 0)  // 3 = authorized, 0 = not determined
            putBoolean("photoLibrary", true)  // Not needed on Android
            putInt("photoLibraryStatus", 3)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun requestAllPermissions(promise: Promise) {
        requestMicrophonePermission(promise)
    }

    // ==================== Task Parameters ====================

    @ReactMethod
    fun setTaskParams(params: ReadableMap, promise: Promise) {
        Log.d(TAG, "setTaskParams called")
        
        try {
            val prefs = reactApplicationContext.getSharedPreferences("TaskParams", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString("tenantId", params.getString("tenantId"))
                putString("campaignId", params.getString("campaignId"))
                putString("campaignName", params.getString("campaignName"))
                putString("taskId", params.getString("taskId"))
                putString("stepId", params.getString("stepId"))
                putString("taskType", params.getString("taskType") ?: "audio-video")
                putString("apiBaseUrl", params.getString("apiBaseUrl"))
                putString("aiAppType", params.getString("aiAppType"))
                putString("recordingId", UUID.randomUUID().toString())
                apply()
            }
            
            Log.d(TAG, "Task params saved: taskId=${params.getString("taskId")}, appType=${params.getString("aiAppType")}")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error saving task params", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearTaskParams(promise: Promise) {
        Log.d(TAG, "clearTaskParams called")
        
        try {
            val prefs = reactApplicationContext.getSharedPreferences("TaskParams", Context.MODE_PRIVATE)
            prefs.edit().clear().apply()
            
            val uploadPrefs = reactApplicationContext.getSharedPreferences("UploadStatus", Context.MODE_PRIVATE)
            uploadPrefs.edit().clear().apply()
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing task params", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setChunkDuration(seconds: Double, promise: Promise) {
        Log.d(TAG, "setChunkDuration: $seconds seconds")
        val prefs = reactApplicationContext.getSharedPreferences("TaskParams", Context.MODE_PRIVATE)
        prefs.edit().putLong("chunkDurationMs", (seconds * 1000).toLong()).apply()
        promise.resolve(true)
    }

    // ==================== Upload Status ====================

    @ReactMethod
    fun getUploadStatus(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("UploadStatus", Context.MODE_PRIVATE)
        
        val result = Arguments.createMap().apply {
            putInt("chunkIndex", prefs.getInt("chunkIndex", 0))
            putString("status", prefs.getString("status", "idle"))
            putString("error", prefs.getString("error", ""))
            putDouble("timestamp", prefs.getLong("timestamp", 0).toDouble())
            putInt("chunksUploaded", prefs.getInt("chunksUploaded", 0))
            putString("recordingId", prefs.getString("recordingId", ""))
        }
        promise.resolve(result)
    }

    // ==================== Debug ====================

    @ReactMethod
    fun getExtensionLogs(promise: Promise) {
        // Android doesn't have separate extension logs like iOS
        promise.resolve("Android: See logcat for ScreenCaptureService logs")
    }

    @ReactMethod
    fun listAppGroupFiles(promise: Promise) {
        try {
            val filesDir = reactApplicationContext.filesDir
            val chunksDir = java.io.File(filesDir, "chunks")
            
            val fileList = StringBuilder()
            fileList.append("Files directory: ${filesDir.absolutePath}\n")
            
            if (chunksDir.exists()) {
                chunksDir.listFiles()?.forEach { file ->
                    fileList.append("  ${file.name} (${file.length() / 1024} KB)\n")
                }
            } else {
                fileList.append("  No chunks directory\n")
            }
            
            promise.resolve(fileList.toString())
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // ==================== Video Handling (for ChatGPT) ====================

    @ReactMethod
    fun checkPendingVideo(promise: Promise) {
        // Not applicable for Android (used for iOS Photos integration)
        promise.resolve(null)
    }

    @ReactMethod
    fun savePendingVideoToPhotos(promise: Promise) {
        // Not applicable for Android
        promise.resolve(false)
    }

    // ==================== Event Listeners ====================

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    // ==================== Activity Result Handling ====================

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        Log.d(TAG, "onActivityResult: requestCode=$requestCode, resultCode=$resultCode")
        
        if (requestCode == SCREEN_CAPTURE_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                // Start the capture service
                val serviceIntent = Intent(reactApplicationContext, ScreenCaptureService::class.java).apply {
                    putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
                    putExtra(ScreenCaptureService.EXTRA_DATA, data)
                }
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    reactApplicationContext.startForegroundService(serviceIntent)
                } else {
                    reactApplicationContext.startService(serviceIntent)
                }
                
                pendingPromise?.resolve(null)
            } else {
                pendingPromise?.reject("ERROR", "User denied screen capture permission")
            }
            pendingPromise = null
        }
    }

    override fun onNewIntent(intent: Intent?) {
        // Not used
    }

    // ==================== Permission Result Handling ====================

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ): Boolean {
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val granted = grantResults.isNotEmpty() && 
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            permissionPromise?.resolve(granted)
            permissionPromise = null
            return true
        }
        return false
    }

    // ==================== Event Sending ====================

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
