package com.mplivescreen.screencapture

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import java.io.File
import java.nio.ByteBuffer

/**
 * VideoEncoder - Encodes screen capture frames to H.264 video
 * Equivalent to iOS AVAssetWriter for video
 */
class VideoEncoder(
    private val width: Int,
    private val height: Int,
    private val bitRate: Int = 6_000_000,  // 6 Mbps
    private val frameRate: Int = 30,
    private val iFrameInterval: Int = 1     // Keyframe every 1 second
) {
    companion object {
        private const val TAG = "VideoEncoder"
        private const val MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC  // H.264
        private const val TIMEOUT_US = 10000L
    }

    private var encoder: MediaCodec? = null
    private var inputSurface: Surface? = null
    private var muxer: MediaMuxer? = null
    private var trackIndex: Int = -1
    private var isMuxerStarted = false
    private var isEncoding = false
    
    private var encoderThread: HandlerThread? = null
    private var encoderHandler: Handler? = null
    
    private var outputPath: String? = null
    private var onChunkReady: ((String) -> Unit)? = null
    
    // Timing
    private var startTimeNs: Long = 0
    private var frameCount: Int = 0

    /**
     * Prepare the encoder with output file path
     */
    fun prepare(outputFilePath: String): Surface {
        Log.d(TAG, "Preparing encoder: ${width}x${height}, bitRate=$bitRate, fps=$frameRate")
        outputPath = outputFilePath
        
        // Create encoder format
        val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, iFrameInterval)
            
            // For better quality
            setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileHigh)
            setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel41)
        }
        
        // Create encoder
        encoder = MediaCodec.createEncoderByType(MIME_TYPE)
        encoder?.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        
        // Create input surface - this is where frames will be rendered
        inputSurface = encoder?.createInputSurface()
        
        // Create muxer for MP4 output
        muxer = MediaMuxer(outputFilePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        
        // Create encoder thread
        encoderThread = HandlerThread("VideoEncoderThread").apply { start() }
        encoderHandler = Handler(encoderThread!!.looper)
        
        Log.d(TAG, "Encoder prepared, surface created")
        return inputSurface!!
    }

    /**
     * Start encoding
     */
    fun start() {
        Log.d(TAG, "Starting encoder")
        isEncoding = true
        startTimeNs = System.nanoTime()
        frameCount = 0
        
        encoder?.start()
        
        // Start draining encoded data
        encoderHandler?.post { drainEncoder(false) }
    }

    /**
     * Stop encoding and finalize the file
     */
    fun stop(): String? {
        Log.d(TAG, "Stopping encoder, frames=$frameCount")
        isEncoding = false
        
        try {
            // Signal end of stream
            encoder?.signalEndOfInputStream()
            
            // Drain remaining data
            drainEncoder(true)
            
            // Release resources
            release()
            
            Log.d(TAG, "Encoder stopped, output: $outputPath")
            return outputPath
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping encoder", e)
            release()
            return null
        }
    }

    /**
     * Drain encoded data from the encoder
     */
    private fun drainEncoder(endOfStream: Boolean) {
        if (encoder == null) return
        
        val bufferInfo = MediaCodec.BufferInfo()
        
        while (isEncoding || endOfStream) {
            val outputBufferIndex = encoder?.dequeueOutputBuffer(bufferInfo, TIMEOUT_US) ?: -1
            
            when {
                outputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream) {
                        // Schedule next drain
                        encoderHandler?.postDelayed({ drainEncoder(false) }, 10)
                        return
                    }
                    break
                }
                
                outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (isMuxerStarted) {
                        Log.w(TAG, "Format changed after muxer started")
                    } else {
                        val newFormat = encoder?.outputFormat
                        Log.d(TAG, "Encoder output format: $newFormat")
                        trackIndex = muxer?.addTrack(newFormat!!) ?: -1
                        muxer?.start()
                        isMuxerStarted = true
                        Log.d(TAG, "Muxer started, track=$trackIndex")
                    }
                }
                
                outputBufferIndex >= 0 -> {
                    val encodedData = encoder?.getOutputBuffer(outputBufferIndex)
                    
                    if (encodedData != null && bufferInfo.size > 0) {
                        if (!isMuxerStarted) {
                            Log.w(TAG, "Muxer not started, skipping frame")
                        } else {
                            // Adjust presentation time
                            bufferInfo.presentationTimeUs = (System.nanoTime() - startTimeNs) / 1000
                            
                            encodedData.position(bufferInfo.offset)
                            encodedData.limit(bufferInfo.offset + bufferInfo.size)
                            
                            muxer?.writeSampleData(trackIndex, encodedData, bufferInfo)
                            frameCount++
                        }
                    }
                    
                    encoder?.releaseOutputBuffer(outputBufferIndex, false)
                    
                    if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        Log.d(TAG, "End of stream reached")
                        break
                    }
                }
            }
        }
    }

    /**
     * Release all resources
     */
    private fun release() {
        Log.d(TAG, "Releasing encoder resources")
        
        try {
            encoder?.stop()
            encoder?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing encoder", e)
        }
        encoder = null
        
        try {
            if (isMuxerStarted) {
                muxer?.stop()
            }
            muxer?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing muxer", e)
        }
        muxer = null
        isMuxerStarted = false
        
        inputSurface?.release()
        inputSurface = null
        
        encoderThread?.quitSafely()
        encoderThread = null
        encoderHandler = null
        
        trackIndex = -1
    }

    /**
     * Get the input surface for rendering frames
     */
    fun getInputSurface(): Surface? = inputSurface

    /**
     * Check if encoder is currently encoding
     */
    fun isEncoding(): Boolean = isEncoding

    /**
     * Get current frame count
     */
    fun getFrameCount(): Int = frameCount
}

