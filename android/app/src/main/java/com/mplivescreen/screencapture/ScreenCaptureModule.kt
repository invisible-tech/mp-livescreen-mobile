package com.mplivescreen.screencapture

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class ScreenCaptureModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "ScreenCaptureModule"
        const val SCREEN_CAPTURE_REQUEST_CODE = 1001
    }

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var screenCaptureService: ScreenCaptureService? = null
    private var pendingPromise: Promise? = null
    private var isRecording = false

    init {
        reactContext.addActivityEventListener(this)
        mediaProjectionManager = reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun startBroadcast(promise: Promise) {
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
        try {
            stopScreenCapture()
            isRecording = false
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun isRecording(promise: Promise) {
        promise.resolve(isRecording)
    }

    private fun startScreenCapture(resultCode: Int, data: Intent) {
        val context = reactApplicationContext
        
        // Start foreground service
        val serviceIntent = Intent(context, ScreenCaptureService::class.java).apply {
            putExtra("resultCode", resultCode)
            putExtra("data", data)
        }
        
        context.startForegroundService(serviceIntent)
        isRecording = true
    }

    private fun stopScreenCapture() {
        val context = reactApplicationContext
        val serviceIntent = Intent(context, ScreenCaptureService::class.java)
        context.stopService(serviceIntent)
        
        mediaProjection?.stop()
        mediaProjection = null
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == SCREEN_CAPTURE_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                startScreenCapture(resultCode, data)
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

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }
}

