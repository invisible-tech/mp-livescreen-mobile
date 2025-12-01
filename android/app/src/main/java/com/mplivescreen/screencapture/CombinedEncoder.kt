package com.mplivescreen.screencapture

import android.annotation.SuppressLint
import android.content.Context
import android.media.*
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * CombinedEncoder - Encodes video + app audio into a single MP4 file
 * Equivalent to iOS AVAssetWriter with both video and audioApp inputs
 * 
 * This produces the same output format as iOS:
 * - Video track: H.264 encoded screen capture
 * - Audio track: AAC encoded app audio (Gemini/ChatGPT voice)
 */
class CombinedEncoder(
    private val context: Context,
    private val width: Int,
    private val height: Int,
    private val videoBitRate: Int = 6_000_000,   // 6 Mbps
    private val audioBitRate: Int = 128_000,      // 128 kbps
    private val frameRate: Int = 30,
    private val sampleRate: Int = 44100,
    private val audioChannels: Int = 2
) {
    companion object {
        private const val TAG = "CombinedEncoder"
        private const val VIDEO_MIME = MediaFormat.MIMETYPE_VIDEO_AVC
        private const val AUDIO_MIME = MediaFormat.MIMETYPE_AUDIO_AAC
        private const val TIMEOUT_US = 10000L
    }

    // Video encoder
    private var videoEncoder: MediaCodec? = null
    private var inputSurface: Surface? = null
    
    // App audio capture (AudioPlaybackCapture)
    private var audioRecord: AudioRecord? = null
    private var audioEncoder: MediaCodec? = null
    
    // Muxer (single file with both tracks)
    private var muxer: MediaMuxer? = null
    private var videoTrackIndex: Int = -1
    private var audioTrackIndex: Int = -1
    private var isMuxerStarted = false
    private val muxerLock = Object()
    
    // State
    private var isEncoding = AtomicBoolean(false)
    private var outputPath: String? = null
    
    // Threads
    private var videoEncoderThread: HandlerThread? = null
    private var videoEncoderHandler: Handler? = null
    private var audioRecordThread: Thread? = null
    private var audioEncoderThread: HandlerThread? = null
    private var audioEncoderHandler: Handler? = null
    
    // Timing
    private var startTimeNs: Long = 0
    private var videoFrameCount: Int = 0
    private var audioSampleCount: Long = 0
    private var audioBufferSize: Int = 0
    
    // Track readiness
    private var videoFormatReceived = AtomicBoolean(false)
    private var audioFormatReceived = AtomicBoolean(false)

    /**
     * Check if app audio capture is supported
     */
    fun isAppAudioSupported(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    }

    /**
     * Prepare the encoder
     * @param outputFilePath Path for the MP4 output
     * @param mediaProjection MediaProjection for app audio capture (can be null)
     * @return Surface to render screen capture to
     */
    @SuppressLint("MissingPermission")
    fun prepare(outputFilePath: String, mediaProjection: MediaProjection?): Surface? {
        Log.d(TAG, "Preparing combined encoder: ${width}x${height}")
        outputPath = outputFilePath
        
        try {
            // Create muxer first
            muxer = MediaMuxer(outputFilePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            
            // === Video Encoder ===
            val videoFormat = MediaFormat.createVideoFormat(VIDEO_MIME, width, height).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_BIT_RATE, videoBitRate)
                setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
                setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileHigh)
                setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel41)
            }
            
            videoEncoder = MediaCodec.createEncoderByType(VIDEO_MIME)
            videoEncoder?.configure(videoFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            inputSurface = videoEncoder?.createInputSurface()
            
            // === Audio Encoder + App Audio Capture ===
            if (mediaProjection != null && isAppAudioSupported()) {
                val channelConfig = if (audioChannels == 2) 
                    AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
                
                audioBufferSize = AudioRecord.getMinBufferSize(
                    sampleRate, channelConfig, AudioFormat.ENCODING_PCM_16BIT
                ) * 2
                
                if (audioBufferSize > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
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
                            .setBufferSizeInBytes(audioBufferSize)
                            .build()
                        
                        if (audioRecord?.state == AudioRecord.STATE_INITIALIZED) {
                            // Create audio encoder
                            val audioEncFormat = MediaFormat.createAudioFormat(AUDIO_MIME, sampleRate, audioChannels).apply {
                                setInteger(MediaFormat.KEY_BIT_RATE, audioBitRate)
                                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, audioBufferSize)
                            }
                            
                            audioEncoder = MediaCodec.createEncoderByType(AUDIO_MIME)
                            audioEncoder?.configure(audioEncFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                            
                            Log.d(TAG, "App audio capture configured")
                        } else {
                            Log.w(TAG, "AudioRecord failed to initialize")
                            audioRecord?.release()
                            audioRecord = null
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to setup app audio capture", e)
                        audioRecord = null
                    }
                }
            } else {
                Log.d(TAG, "App audio capture not available (API ${Build.VERSION.SDK_INT})")
            }
            
            // Create threads
            videoEncoderThread = HandlerThread("VideoEncoderThread").apply { start() }
            videoEncoderHandler = Handler(videoEncoderThread!!.looper)
            
            if (audioRecord != null) {
                audioEncoderThread = HandlerThread("AudioEncoderThread").apply { start() }
                audioEncoderHandler = Handler(audioEncoderThread!!.looper)
            }
            
            Log.d(TAG, "Combined encoder prepared, hasAppAudio=${audioRecord != null}")
            return inputSurface
            
        } catch (e: Exception) {
            Log.e(TAG, "Error preparing combined encoder", e)
            release()
            return null
        }
    }

    /**
     * Start encoding
     */
    fun start() {
        Log.d(TAG, "Starting combined encoder")
        isEncoding.set(true)
        startTimeNs = System.nanoTime()
        videoFrameCount = 0
        audioSampleCount = 0
        
        // Start video encoder
        videoEncoder?.start()
        videoEncoderHandler?.post { drainVideoEncoder(false) }
        
        // Start audio capture and encoder
        if (audioRecord != null && audioEncoder != null) {
            audioEncoder?.start()
            audioRecord?.startRecording()
            
            audioRecordThread = Thread {
                audioRecordLoop()
            }.apply {
                name = "AudioRecordThread"
                start()
            }
            
            audioEncoderHandler?.post { drainAudioEncoder(false) }
        } else {
            // No audio - mark as received so muxer can start
            audioFormatReceived.set(true)
        }
    }

    /**
     * Audio recording loop
     */
    private fun audioRecordLoop() {
        Log.d(TAG, "Audio record loop started")
        val buffer = ByteArray(audioBufferSize)
        
        while (isEncoding.get()) {
            val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: -1
            
            if (bytesRead > 0) {
                feedAudioEncoder(buffer, bytesRead)
                audioSampleCount += bytesRead / (2 * audioChannels)
            } else if (bytesRead < 0) {
                Log.e(TAG, "AudioRecord read error: $bytesRead")
                break
            }
        }
        
        Log.d(TAG, "Audio record loop ended, samples=$audioSampleCount")
    }

    /**
     * Feed PCM data to audio encoder
     */
    private fun feedAudioEncoder(data: ByteArray, size: Int) {
        val encoder = audioEncoder ?: return
        
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
     * Drain video encoder
     */
    private fun drainVideoEncoder(endOfStream: Boolean) {
        val encoder = videoEncoder ?: return
        val bufferInfo = MediaCodec.BufferInfo()
        
        while (isEncoding.get() || endOfStream) {
            val outputIndex = encoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
            
            when {
                outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream) {
                        videoEncoderHandler?.postDelayed({ drainVideoEncoder(false) }, 10)
                        return
                    }
                    break
                }
                
                outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    synchronized(muxerLock) {
                        if (videoTrackIndex < 0) {
                            val format = encoder.outputFormat
                            Log.d(TAG, "Video format: $format")
                            videoTrackIndex = muxer?.addTrack(format) ?: -1
                            videoFormatReceived.set(true)
                            checkAndStartMuxer()
                        }
                    }
                }
                
                outputIndex >= 0 -> {
                    val encodedData = encoder.getOutputBuffer(outputIndex)
                    
                    if (encodedData != null && bufferInfo.size > 0) {
                        synchronized(muxerLock) {
                            if (isMuxerStarted && videoTrackIndex >= 0) {
                                bufferInfo.presentationTimeUs = (System.nanoTime() - startTimeNs) / 1000
                                encodedData.position(bufferInfo.offset)
                                encodedData.limit(bufferInfo.offset + bufferInfo.size)
                                muxer?.writeSampleData(videoTrackIndex, encodedData, bufferInfo)
                                videoFrameCount++
                            }
                        }
                    }
                    
                    encoder.releaseOutputBuffer(outputIndex, false)
                    
                    if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        Log.d(TAG, "Video EOS")
                        break
                    }
                }
            }
        }
    }

    /**
     * Drain audio encoder
     */
    private fun drainAudioEncoder(endOfStream: Boolean) {
        val encoder = audioEncoder ?: return
        val bufferInfo = MediaCodec.BufferInfo()
        
        while (isEncoding.get() || endOfStream) {
            val outputIndex = encoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
            
            when {
                outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream) {
                        audioEncoderHandler?.postDelayed({ drainAudioEncoder(false) }, 10)
                        return
                    }
                    break
                }
                
                outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    synchronized(muxerLock) {
                        if (audioTrackIndex < 0) {
                            val format = encoder.outputFormat
                            Log.d(TAG, "Audio format: $format")
                            audioTrackIndex = muxer?.addTrack(format) ?: -1
                            audioFormatReceived.set(true)
                            checkAndStartMuxer()
                        }
                    }
                }
                
                outputIndex >= 0 -> {
                    val encodedData = encoder.getOutputBuffer(outputIndex)
                    
                    if (encodedData != null && bufferInfo.size > 0) {
                        synchronized(muxerLock) {
                            if (isMuxerStarted && audioTrackIndex >= 0) {
                                encodedData.position(bufferInfo.offset)
                                encodedData.limit(bufferInfo.offset + bufferInfo.size)
                                muxer?.writeSampleData(audioTrackIndex, encodedData, bufferInfo)
                            }
                        }
                    }
                    
                    encoder.releaseOutputBuffer(outputIndex, false)
                    
                    if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        Log.d(TAG, "Audio EOS")
                        break
                    }
                }
            }
        }
    }

    /**
     * Check if both tracks are ready and start muxer
     */
    private fun checkAndStartMuxer() {
        if (!isMuxerStarted && videoFormatReceived.get() && audioFormatReceived.get()) {
            muxer?.start()
            isMuxerStarted = true
            Log.d(TAG, "Muxer started (video=$videoTrackIndex, audio=$audioTrackIndex)")
        }
    }

    /**
     * Stop encoding
     */
    fun stop(): String? {
        Log.d(TAG, "Stopping combined encoder, frames=$videoFrameCount, audioSamples=$audioSampleCount")
        isEncoding.set(false)
        
        try {
            // Stop audio first
            audioRecordThread?.join(1000)
            
            // Signal audio EOS
            audioEncoder?.let { encoder ->
                val inputIndex = encoder.dequeueInputBuffer(TIMEOUT_US)
                if (inputIndex >= 0) {
                    encoder.queueInputBuffer(
                        inputIndex, 0, 0,
                        (System.nanoTime() - startTimeNs) / 1000,
                        MediaCodec.BUFFER_FLAG_END_OF_STREAM
                    )
                }
            }
            drainAudioEncoder(true)
            
            // Signal video EOS
            videoEncoder?.signalEndOfInputStream()
            drainVideoEncoder(true)
            
            release()
            
            Log.d(TAG, "Combined encoder stopped, output: $outputPath")
            return outputPath
            
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping combined encoder", e)
            release()
            return null
        }
    }

    /**
     * Release all resources
     */
    private fun release() {
        Log.d(TAG, "Releasing combined encoder")
        
        try { audioRecord?.stop() } catch (e: Exception) {}
        try { audioRecord?.release() } catch (e: Exception) {}
        audioRecord = null
        
        try { audioEncoder?.stop() } catch (e: Exception) {}
        try { audioEncoder?.release() } catch (e: Exception) {}
        audioEncoder = null
        
        try { videoEncoder?.stop() } catch (e: Exception) {}
        try { videoEncoder?.release() } catch (e: Exception) {}
        videoEncoder = null
        
        inputSurface?.release()
        inputSurface = null
        
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
        
        videoEncoderThread?.quitSafely()
        audioEncoderThread?.quitSafely()
        videoEncoderThread = null
        audioEncoderThread = null
        videoEncoderHandler = null
        audioEncoderHandler = null
        
        videoTrackIndex = -1
        audioTrackIndex = -1
    }

    fun getInputSurface(): Surface? = inputSurface
    fun isEncoding(): Boolean = isEncoding.get()
    fun getVideoFrameCount(): Int = videoFrameCount
    fun hasAppAudio(): Boolean = audioRecord != null
}

