package com.mplivescreen.screencapture

import android.content.Context
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Surface
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/**
 * ChunkManager - Manages chunked recording with automatic rotation
 * Equivalent to iOS SampleHandler chunk management
 * 
 * Produces the same output as iOS:
 * - chunk_X.mp4: Video + App Audio (like iOS video + audioApp)
 * - human_X.m4a: Microphone audio (like iOS audioMic)
 */
class ChunkManager(
    private val context: Context,
    private val chunkDurationMs: Long = 30_000L,  // 30 seconds default
    private val onChunkReady: (ChunkInfo) -> Unit
) {
    companion object {
        private const val TAG = "ChunkManager"
    }

    data class ChunkInfo(
        val videoPath: String,       // Video + App Audio (like iOS)
        val audioPath: String?,      // Mic audio (separate file like iOS)
        val chunkIndex: Int,
        val durationMs: Long,
        val isFinal: Boolean,
        val hasAppAudio: Boolean     // Whether app audio was captured
    )

    private var currentChunkIndex = 0
    private var chunkStartTime: Long = 0
    private var isActive = false
    
    // Combined encoder (video + app audio in one file)
    private var combinedEncoder: CombinedEncoder? = null
    
    // Mic encoder (separate file like iOS)
    private var audioEncoder: AudioEncoder? = null
    
    private var currentVideoPath: String? = null
    private var currentMicPath: String? = null
    
    private val handler = Handler(Looper.getMainLooper())
    private var chunkRotationRunnable: Runnable? = null
    
    // Configuration
    private var width: Int = 1080
    private var height: Int = 1920
    private var includeMicAudio: Boolean = true  // For Gemini (mic separate from app audio)
    
    // MediaProjection for app audio capture
    private var mediaProjection: MediaProjection? = null

    /**
     * Get output directory for chunks
     */
    private fun getOutputDir(): File {
        val dir = File(context.filesDir, "chunks")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    /**
     * Generate file path for a chunk
     */
    private fun generateChunkPath(chunkIndex: Int, extension: String): String {
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        return File(getOutputDir(), "chunk_${chunkIndex}_$timestamp.$extension").absolutePath
    }

    /**
     * Configure recording parameters
     */
    fun configure(
        width: Int, 
        height: Int, 
        includeMicAudio: Boolean,
        mediaProjection: MediaProjection?
    ) {
        this.width = width
        this.height = height
        this.includeMicAudio = includeMicAudio
        this.mediaProjection = mediaProjection
        Log.d(TAG, "Configured: ${width}x${height}, mic=$includeMicAudio, hasProjection=${mediaProjection != null}")
    }

    /**
     * Start chunked recording
     * Returns the Surface to render screen capture to
     */
    fun start(): Surface? {
        Log.d(TAG, "Starting chunked recording")
        isActive = true
        currentChunkIndex = 0
        
        // Start first chunk
        val surface = startNewChunk()
        
        // Schedule chunk rotation
        scheduleChunkRotation()
        
        return surface
    }

    /**
     * Start a new chunk
     */
    private fun startNewChunk(): Surface? {
        Log.d(TAG, "Starting chunk $currentChunkIndex")
        chunkStartTime = System.currentTimeMillis()
        
        // Generate paths
        currentVideoPath = generateChunkPath(currentChunkIndex, "mp4")
        currentMicPath = if (includeMicAudio) generateChunkPath(currentChunkIndex, "m4a") else null
        
        // Create combined encoder (video + app audio)
        combinedEncoder = CombinedEncoder(context, width, height)
        val surface = combinedEncoder?.prepare(currentVideoPath!!, mediaProjection)
        combinedEncoder?.start()
        
        // Create mic encoder (separate file like iOS audioMic)
        if (includeMicAudio && currentMicPath != null) {
            audioEncoder = AudioEncoder(context)
            if (audioEncoder?.prepare(currentMicPath!!) == true) {
                audioEncoder?.start()
                Log.d(TAG, "Mic encoder started")
            } else {
                Log.w(TAG, "Mic encoder failed to prepare")
                audioEncoder = null
                currentMicPath = null
            }
        }
        
        val hasAppAudio = combinedEncoder?.hasAppAudio() == true
        Log.d(TAG, "Chunk $currentChunkIndex started: video=$currentVideoPath, mic=$currentMicPath, appAudio=$hasAppAudio")
        return surface
    }

    /**
     * Stop current chunk and prepare for upload
     */
    private fun stopCurrentChunk(isFinal: Boolean): ChunkInfo? {
        val chunkIndex = currentChunkIndex
        val duration = System.currentTimeMillis() - chunkStartTime
        
        Log.d(TAG, "Stopping chunk $chunkIndex, duration=${duration}ms, isFinal=$isFinal")
        
        // Stop encoders
        val finalVideoPath = combinedEncoder?.stop()
        val hasAppAudio = combinedEncoder?.hasAppAudio() == true
        val finalMicPath = audioEncoder?.stop()
        
        combinedEncoder = null
        audioEncoder = null
        currentVideoPath = null
        currentMicPath = null
        
        if (finalVideoPath != null) {
            return ChunkInfo(
                videoPath = finalVideoPath,
                audioPath = finalMicPath,
                chunkIndex = chunkIndex,
                durationMs = duration,
                isFinal = isFinal,
                hasAppAudio = hasAppAudio
            )
        }
        
        return null
    }

    /**
     * Rotate to next chunk (called by timer)
     */
    private fun rotateChunk() {
        if (!isActive) return
        
        Log.d(TAG, "Rotating chunk")
        
        // Stop current chunk
        val chunkInfo = stopCurrentChunk(false)
        
        // Notify listener
        if (chunkInfo != null) {
            onChunkReady(chunkInfo)
        }
        
        // Increment and start new chunk
        currentChunkIndex++
        startNewChunk()
        
        // Schedule next rotation
        scheduleChunkRotation()
    }

    /**
     * Schedule chunk rotation
     */
    private fun scheduleChunkRotation() {
        chunkRotationRunnable?.let { handler.removeCallbacks(it) }
        
        chunkRotationRunnable = Runnable { rotateChunk() }
        handler.postDelayed(chunkRotationRunnable!!, chunkDurationMs)
    }

    /**
     * Stop recording and finalize
     */
    fun stop(): ChunkInfo? {
        Log.d(TAG, "Stopping chunked recording")
        isActive = false
        
        // Cancel scheduled rotation
        chunkRotationRunnable?.let { handler.removeCallbacks(it) }
        chunkRotationRunnable = null
        
        // Stop final chunk
        return stopCurrentChunk(true)
    }

    /**
     * Check if recording is active
     */
    fun isActive(): Boolean = isActive

    /**
     * Get current chunk index
     */
    fun getCurrentChunkIndex(): Int = currentChunkIndex

    /**
     * Clean up old chunk files
     */
    fun cleanupChunks() {
        Log.d(TAG, "Cleaning up chunk files")
        getOutputDir().listFiles()?.forEach { file ->
            if (file.delete()) {
                Log.d(TAG, "Deleted: ${file.name}")
            }
        }
    }

    /**
     * Get the current encoder surface (for VirtualDisplay)
     */
    fun getCurrentSurface(): Surface? {
        return combinedEncoder?.getInputSurface()
    }
}
