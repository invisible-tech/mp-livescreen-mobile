package com.mplivescreen.screencapture

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * UploadManager - Handles uploading video/audio chunks to backend
 * Equivalent to iOS SampleHandler upload logic
 */
class UploadManager(
    private val context: Context
) {
    companion object {
        private const val TAG = "UploadManager"
        private const val PREFS_NAME = "TaskParams"
        private const val UPLOAD_STATUS_PREFS = "UploadStatus"
    }

    data class TaskParams(
        val tenantId: String,
        val campaignId: String,
        val taskId: String,
        val stepId: String,
        val recordingId: String,
        val apiBaseUrl: String,
        val appType: String,       // "gemini" or "chatgpt"
        val taskType: String,      // "audio-video" or "audio"
        val xApiKey: String        // API key for authentication
    )

    private val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val uploadExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var chunksUploaded = 0

    /**
     * Load task parameters from SharedPreferences
     */
    fun loadTaskParams(): TaskParams? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        val tenantId = prefs.getString("tenantId", null)
        val campaignId = prefs.getString("campaignId", null)
        val taskId = prefs.getString("taskId", null)
        val stepId = prefs.getString("stepId", null)
        val apiBaseUrl = prefs.getString("apiBaseUrl", null)
        
        if (tenantId == null || campaignId == null || taskId == null || 
            stepId == null || apiBaseUrl == null) {
            Log.w(TAG, "Missing task parameters")
            return null
        }
        
        return TaskParams(
            tenantId = tenantId,
            campaignId = campaignId,
            taskId = taskId,
            stepId = stepId,
            recordingId = prefs.getString("recordingId", null) ?: java.util.UUID.randomUUID().toString(),
            apiBaseUrl = apiBaseUrl,
            appType = prefs.getString("aiAppType", "gemini") ?: "gemini",
            taskType = prefs.getString("taskType", "audio-video") ?: "audio-video",
            xApiKey = prefs.getString("xApiKey", "") ?: ""
        )
    }

    /**
     * Upload a chunk (video + optional audio)
     */
    fun uploadChunk(
        chunkInfo: ChunkManager.ChunkInfo,
        taskParams: TaskParams,
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        uploadExecutor.submit {
            try {
                Log.d(TAG, "========== UPLOAD CHUNK ${chunkInfo.chunkIndex} ==========")
                Log.d(TAG, "📍 URL: ${taskParams.apiBaseUrl}/api/upload-mobile-content")
                
                val videoFile = File(chunkInfo.videoPath)
                if (!videoFile.exists()) {
                    onError("Video file not found: ${chunkInfo.videoPath}")
                    return@submit
                }
                
                val videoSize = videoFile.length() / 1024  // KB
                Log.d(TAG, "📦 FILES:")
                Log.d(TAG, "   file: chunk_${chunkInfo.chunkIndex}.mp4 → $videoSize KB")
                Log.d(TAG, "   (includes app audio: ${chunkInfo.hasAppAudio})")
                
                // Build multipart request
                val requestBuilder = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart(
                        "file",
                        "chunk_${chunkInfo.chunkIndex}.mp4",
                        videoFile.asRequestBody("video/mp4".toMediaType())
                    )
                
                // Add audio file for Gemini (not for ChatGPT)
                if (taskParams.appType.lowercase() != "chatgpt" && chunkInfo.audioPath != null) {
                    val audioFile = File(chunkInfo.audioPath)
                    if (audioFile.exists()) {
                        val audioSize = audioFile.length() / 1024
                        Log.d(TAG, "   mic_file: human_${chunkInfo.chunkIndex}.m4a → $audioSize KB")
                        requestBuilder.addFormDataPart(
                            "mic_file",
                            "human_${chunkInfo.chunkIndex}.m4a",
                            audioFile.asRequestBody("audio/mp4".toMediaType())
                        )
                    }
                } else if (taskParams.appType.lowercase() == "chatgpt") {
                    Log.d(TAG, "   mic_file: SKIPPED (ChatGPT - user exports manually)")
                }
                
                // Add metadata fields
                val metadata = mapOf(
                    "tenant_id" to taskParams.tenantId,
                    "campaign_id" to taskParams.campaignId,
                    "task_id" to taskParams.taskId,
                    "step_id" to taskParams.stepId,
                    "recording_id" to taskParams.recordingId,
                    "chunk_index" to chunkInfo.chunkIndex.toString(),
                    "is_first" to (chunkInfo.chunkIndex == 0).toString(),
                    "is_final" to chunkInfo.isFinal.toString(),
                    "app_type" to taskParams.appType,
                    "os_type" to "android",
                    "task_type" to taskParams.taskType
                )
                
                Log.d(TAG, "📋 METADATA:")
                metadata.forEach { (key, value) ->
                    Log.d(TAG, "   $key: $value")
                    requestBuilder.addFormDataPart(key, value)
                }
                
                val requestBody = requestBuilder.build()
                Log.d(TAG, "📤 SENDING REQUEST...")
                Log.d(TAG, "   Total body size: ${requestBody.contentLength() / 1024} KB")
                
                val request = Request.Builder()
                    .url("${taskParams.apiBaseUrl}/api/upload-mobile-content")
                    .addHeader("X-API-Key", taskParams.xApiKey)
                    .post(requestBody)
                    .build()
                
                updateUploadStatus(chunkInfo.chunkIndex, "uploading")
                val startTime = System.currentTimeMillis()
                
                client.newCall(request).execute().use { response ->
                    val elapsed = (System.currentTimeMillis() - startTime) / 1000.0
                    Log.d(TAG, "📥 RESPONSE RECEIVED (took ${String.format("%.2f", elapsed)}s)")
                    
                    if (response.isSuccessful) {
                        val responseBody = response.body?.string()
                        Log.d(TAG, "✅ SUCCESS: ${response.code}")
                        Log.d(TAG, "   Response: $responseBody")
                        
                        chunksUploaded++
                        updateUploadStatus(chunkInfo.chunkIndex, "success")
                        
                        // Clean up uploaded files
                        videoFile.delete()
                        chunkInfo.audioPath?.let { File(it).delete() }
                        
                        onSuccess()
                    } else {
                        val errorBody = response.body?.string()
                        Log.e(TAG, "❌ FAILED: ${response.code}")
                        Log.e(TAG, "   Error: $errorBody")
                        
                        updateUploadStatus(chunkInfo.chunkIndex, "error", errorBody)
                        onError("Upload failed: ${response.code} - $errorBody")
                    }
                }
                
            } catch (e: IOException) {
                Log.e(TAG, "❌ NETWORK ERROR: ${e.message}")
                updateUploadStatus(chunkInfo.chunkIndex, "error", e.message)
                onError("Network error: ${e.message}")
            } catch (e: Exception) {
                Log.e(TAG, "❌ ERROR: ${e.message}", e)
                updateUploadStatus(chunkInfo.chunkIndex, "error", e.message)
                onError("Error: ${e.message}")
            }
        }
    }

    /**
     * Update upload status in SharedPreferences (for React Native to read)
     */
    private fun updateUploadStatus(chunkIndex: Int, status: String, error: String? = null) {
        val prefs = context.getSharedPreferences(UPLOAD_STATUS_PREFS, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putInt("chunkIndex", chunkIndex)
            putString("status", status)
            putString("error", error ?: "")
            putLong("timestamp", System.currentTimeMillis())
            putInt("chunksUploaded", chunksUploaded)
            apply()
        }
    }

    /**
     * Get upload status
     */
    fun getUploadStatus(): Map<String, Any> {
        val prefs = context.getSharedPreferences(UPLOAD_STATUS_PREFS, Context.MODE_PRIVATE)
        return mapOf(
            "chunkIndex" to prefs.getInt("chunkIndex", 0),
            "status" to (prefs.getString("status", "idle") ?: "idle"),
            "error" to (prefs.getString("error", "") ?: ""),
            "timestamp" to prefs.getLong("timestamp", 0),
            "chunksUploaded" to prefs.getInt("chunksUploaded", 0)
        )
    }

    /**
     * Reset upload status
     */
    fun resetStatus() {
        chunksUploaded = 0
        val prefs = context.getSharedPreferences(UPLOAD_STATUS_PREFS, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
    }

    /**
     * Shutdown upload executor
     */
    fun shutdown() {
        uploadExecutor.shutdown()
        try {
            if (!uploadExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                uploadExecutor.shutdownNow()
            }
        } catch (e: InterruptedException) {
            uploadExecutor.shutdownNow()
        }
    }
}

