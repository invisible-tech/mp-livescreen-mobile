package com.mplivescreen.screencapture

import android.annotation.SuppressLint
import android.content.Context
import android.media.*
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.nio.ByteBuffer

/**
 * AppAudioEncoder - Captures and encodes app/system audio
 * Equivalent to iOS ReplayKit's audioApp sample buffer
 * 
 * Uses Android's AudioPlaybackCapture API (Android 10+)
 * to capture audio from other apps (like Gemini/ChatGPT voice)
 */
class AppAudioEncoder(
    private val context: Context,
    private val sampleRate: Int = 44100,
    private val channelCount: Int = 2,    // Stereo
    private val bitRate: Int = 128000     // 128 kbps
) {
    companion object {
        private const val TAG = "AppAudioEncoder"
        private const val MIME_TYPE = MediaFormat.MIMETYPE_AUDIO_AAC
        private const val TIMEOUT_US = 10000L
    }

    private var audioRecord: AudioRecord? = null
    private var encoder: MediaCodec? = null
    private var muxer: MediaMuxer? = null
    private var trackIndex: Int = -1
    private var isMuxerStarted = false
    private var isRecording = false
    
    private var recordThread: Thread? = null
    private var encoderThread: HandlerThread? = null
    private var encoderHandler: Handler? = null
    
    private var outputPath: String? = null
    private var bufferSize: Int = 0
    
    // Timing
    private var startTimeNs: Long = 0
    private var sampleCount: Long = 0

    /**
     * Check if AudioPlaybackCapture is supported
     */
    fun isSupported(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q  // Android 10+
    }

    /**
     * Prepare the app audio recorder using MediaProjection
     */
    @SuppressLint("MissingPermission")
    fun prepare(outputFilePath: String, mediaProjection: MediaProjection): Boolean {
        if (!isSupported()) {
            Log.w(TAG, "AudioPlaybackCapture not supported (requires Android 10+)")
            return false
        }
        
        Log.d(TAG, "Preparing app audio encoder: sampleRate=$sampleRate, channels=$channelCount")
        outputPath = outputFilePath
        
        val channelConfig = if (channelCount == 2) 
            AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
        
        bufferSize = AudioRecord.getMinBufferSize(
            sampleRate,
            channelConfig,
            AudioFormat.ENCODING_PCM_16BIT
        ) * 2
        
        if (bufferSize <= 0) {
            Log.e(TAG, "Invalid buffer size: $bufferSize")
            return false
        }
        
        try {
            // Build AudioPlaybackCaptureConfiguration
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val captureConfig = AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build()
                
                val audioFormat = AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(channelConfig)
                    .build()
                
                audioRecord = AudioRecord.Builder()
                    .setAudioPlaybackCaptureConfig(captureConfig)
                    .setAudioFormat(audioFormat)
                    .setBufferSizeInBytes(bufferSize)
                    .build()
            }
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize for app audio capture")
                return false
            }
            
            // Create AAC encoder
            val format = MediaFormat.createAudioFormat(MIME_TYPE, sampleRate, channelCount).apply {
                setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, bufferSize)
            }
            
            encoder = MediaCodec.createEncoderByType(MIME_TYPE)
            encoder?.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            
            // Create muxer - we'll mux this into the video file later or upload separately
            muxer = MediaMuxer(outputFilePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            
            encoderThread = HandlerThread("AppAudioEncoderThread").apply { start() }
            encoderHandler = Handler(encoderThread!!.looper)
            
            Log.d(TAG, "App audio encoder prepared")
            return true
            
        } catch (e: Exception) {
            Log.e(TAG, "Error preparing app audio encoder", e)
            release()
            return false
        }
    }

    /**
     * Start recording app audio
     */
    fun start() {
        Log.d(TAG, "Starting app audio recording")
        isRecording = true
        startTimeNs = System.nanoTime()
        sampleCount = 0
        
        audioRecord?.startRecording()
        encoder?.start()
        
        recordThread = Thread {
            recordLoop()
        }.apply {
            name = "AppAudioRecordThread"
            start()
        }
        
        encoderHandler?.post { drainEncoder(false) }
    }

    /**
     * Recording loop
     */
    private fun recordLoop() {
        Log.d(TAG, "App audio recording loop started")
        val buffer = ByteArray(bufferSize)
        
        while (isRecording) {
            val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: -1
            
            if (bytesRead > 0) {
                feedEncoder(buffer, bytesRead)
                sampleCount += bytesRead / (2 * channelCount)
            } else if (bytesRead < 0) {
                Log.e(TAG, "AudioRecord read error: $bytesRead")
                break
            }
        }
        
        Log.d(TAG, "App audio recording loop ended, samples=$sampleCount")
    }

    /**
     * Feed PCM data to encoder
     */
    private fun feedEncoder(data: ByteArray, size: Int) {
        val encoder = encoder ?: return
        
        val inputBufferIndex = encoder.dequeueInputBuffer(TIMEOUT_US)
        if (inputBufferIndex >= 0) {
            val inputBuffer = encoder.getInputBuffer(inputBufferIndex)
            inputBuffer?.clear()
            inputBuffer?.put(data, 0, size)
            
            val presentationTimeUs = (System.nanoTime() - startTimeNs) / 1000
            encoder.queueInputBuffer(inputBufferIndex, 0, size, presentationTimeUs, 0)
        }
    }

    /**
     * Stop recording
     */
    fun stop(): String? {
        Log.d(TAG, "Stopping app audio recording")
        isRecording = false
        
        try {
            recordThread?.join(1000)
            
            val encoder = encoder
            if (encoder != null) {
                val inputBufferIndex = encoder.dequeueInputBuffer(TIMEOUT_US)
                if (inputBufferIndex >= 0) {
                    encoder.queueInputBuffer(
                        inputBufferIndex, 0, 0,
                        (System.nanoTime() - startTimeNs) / 1000,
                        MediaCodec.BUFFER_FLAG_END_OF_STREAM
                    )
                }
            }
            
            drainEncoder(true)
            release()
            
            Log.d(TAG, "App audio recording stopped, output: $outputPath")
            return outputPath
            
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping app audio recording", e)
            release()
            return null
        }
    }

    /**
     * Drain encoder
     */
    private fun drainEncoder(endOfStream: Boolean) {
        val encoder = encoder ?: return
        val bufferInfo = MediaCodec.BufferInfo()
        
        while (isRecording || endOfStream) {
            val outputBufferIndex = encoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
            
            when {
                outputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream) {
                        encoderHandler?.postDelayed({ drainEncoder(false) }, 10)
                        return
                    }
                    break
                }
                
                outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (!isMuxerStarted) {
                        val newFormat = encoder.outputFormat
                        Log.d(TAG, "App audio encoder format: $newFormat")
                        trackIndex = muxer?.addTrack(newFormat) ?: -1
                        muxer?.start()
                        isMuxerStarted = true
                    }
                }
                
                outputBufferIndex >= 0 -> {
                    val encodedData = encoder.getOutputBuffer(outputBufferIndex)
                    
                    if (encodedData != null && bufferInfo.size > 0 && isMuxerStarted) {
                        encodedData.position(bufferInfo.offset)
                        encodedData.limit(bufferInfo.offset + bufferInfo.size)
                        muxer?.writeSampleData(trackIndex, encodedData, bufferInfo)
                    }
                    
                    encoder.releaseOutputBuffer(outputBufferIndex, false)
                    
                    if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        break
                    }
                }
            }
        }
    }

    /**
     * Release resources
     */
    private fun release() {
        Log.d(TAG, "Releasing app audio resources")
        
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing AudioRecord", e)
        }
        audioRecord = null
        
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
        
        encoderThread?.quitSafely()
        encoderThread = null
        encoderHandler = null
        
        trackIndex = -1
    }

    fun isRecording(): Boolean = isRecording
    fun getSampleCount(): Long = sampleCount
}

