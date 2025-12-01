package com.mplivescreen.screencapture

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import androidx.core.content.ContextCompat
import java.nio.ByteBuffer

/**
 * AudioEncoder - Records microphone audio and encodes to AAC
 * Equivalent to iOS AVAssetWriter for audio (microphone track)
 */
class AudioEncoder(
    private val context: Context,
    private val sampleRate: Int = 44100,
    private val channelCount: Int = 2,       // Stereo
    private val bitRate: Int = 128000        // 128 kbps
) {
    companion object {
        private const val TAG = "AudioEncoder"
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
     * Check if microphone permission is granted
     */
    fun hasPermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == 
            PackageManager.PERMISSION_GRANTED
    }

    /**
     * Prepare the audio recorder and encoder
     */
    fun prepare(outputFilePath: String): Boolean {
        if (!hasPermission()) {
            Log.e(TAG, "Microphone permission not granted")
            return false
        }
        
        Log.d(TAG, "Preparing audio encoder: sampleRate=$sampleRate, channels=$channelCount")
        outputPath = outputFilePath
        
        // Calculate buffer size
        val channelConfig = if (channelCount == 2) 
            AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
            
        bufferSize = AudioRecord.getMinBufferSize(
            sampleRate,
            channelConfig,
            AudioFormat.ENCODING_PCM_16BIT
        ) * 2  // Double buffer for safety
        
        if (bufferSize <= 0) {
            Log.e(TAG, "Invalid buffer size: $bufferSize")
            return false
        }
        
        try {
            // Create AudioRecord for microphone input
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            )
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize")
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
            
            // Create muxer for M4A output
            muxer = MediaMuxer(outputFilePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            
            // Create encoder thread
            encoderThread = HandlerThread("AudioEncoderThread").apply { start() }
            encoderHandler = Handler(encoderThread!!.looper)
            
            Log.d(TAG, "Audio encoder prepared, bufferSize=$bufferSize")
            return true
            
        } catch (e: Exception) {
            Log.e(TAG, "Error preparing audio encoder", e)
            release()
            return false
        }
    }

    /**
     * Start recording and encoding
     */
    fun start() {
        Log.d(TAG, "Starting audio recording")
        isRecording = true
        startTimeNs = System.nanoTime()
        sampleCount = 0
        
        audioRecord?.startRecording()
        encoder?.start()
        
        // Start recording thread
        recordThread = Thread {
            recordLoop()
        }.apply { 
            name = "AudioRecordThread"
            start() 
        }
        
        // Start encoder drain
        encoderHandler?.post { drainEncoder(false) }
    }

    /**
     * Recording loop - reads from mic and feeds to encoder
     */
    private fun recordLoop() {
        Log.d(TAG, "Recording loop started")
        val buffer = ByteArray(bufferSize)
        
        while (isRecording) {
            val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: -1
            
            if (bytesRead > 0) {
                feedEncoder(buffer, bytesRead)
                sampleCount += bytesRead / (2 * channelCount)  // 16-bit samples
            } else if (bytesRead < 0) {
                Log.e(TAG, "AudioRecord read error: $bytesRead")
                break
            }
        }
        
        Log.d(TAG, "Recording loop ended, samples=$sampleCount")
    }

    /**
     * Feed PCM data to the encoder
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
     * Stop recording and finalize the file
     */
    fun stop(): String? {
        Log.d(TAG, "Stopping audio recording")
        isRecording = false
        
        try {
            // Wait for recording thread to finish
            recordThread?.join(1000)
            
            // Signal end of stream
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
            
            // Drain remaining data
            drainEncoder(true)
            
            // Release resources
            release()
            
            Log.d(TAG, "Audio recording stopped, output: $outputPath")
            return outputPath
            
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping audio recording", e)
            release()
            return null
        }
    }

    /**
     * Drain encoded data from the encoder
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
                        Log.d(TAG, "Audio encoder output format: $newFormat")
                        trackIndex = muxer?.addTrack(newFormat) ?: -1
                        muxer?.start()
                        isMuxerStarted = true
                        Log.d(TAG, "Audio muxer started, track=$trackIndex")
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
                        Log.d(TAG, "Audio end of stream reached")
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
        Log.d(TAG, "Releasing audio resources")
        
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
            Log.e(TAG, "Error releasing audio encoder", e)
        }
        encoder = null
        
        try {
            if (isMuxerStarted) {
                muxer?.stop()
            }
            muxer?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing audio muxer", e)
        }
        muxer = null
        isMuxerStarted = false
        
        encoderThread?.quitSafely()
        encoderThread = null
        encoderHandler = null
        
        trackIndex = -1
    }

    /**
     * Check if currently recording
     */
    fun isRecording(): Boolean = isRecording

    /**
     * Get sample count recorded
     */
    fun getSampleCount(): Long = sampleCount
}

