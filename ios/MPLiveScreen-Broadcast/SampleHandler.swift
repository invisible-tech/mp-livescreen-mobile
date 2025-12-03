//
//  SampleHandler.swift
//  BroadcastExtension
//
//  Broadcast Upload Extension for MP LiveCapture
//  Handles system-wide screen capture and uploads video chunks to backend
//

import ReplayKit
import Foundation
import AVFoundation

// MARK: - File Logger for Extension Debugging
class ExtensionLogger {
    static let shared = ExtensionLogger()
    private let appGroup = "group.com.marketplace.live.screen"
    private let logFileName = "extension_logs.txt"
    private let maxLogSize = 50000 // 50KB max
    
    private var logFileURL: URL? {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            return nil
        }
        return containerURL.appendingPathComponent(logFileName)
    }
    
    func log(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let logLine = "[\(timestamp)] \(message)\n"
        
        NSLog("[BroadcastExtension] \(message)")
        
        guard let fileURL = logFileURL else { return }
        
        DispatchQueue.global(qos: .utility).async {
            do {
                if FileManager.default.fileExists(atPath: fileURL.path) {
                    let attrs = try FileManager.default.attributesOfItem(atPath: fileURL.path)
                    if let size = attrs[.size] as? Int, size > self.maxLogSize {
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                    
                    let handle = try FileHandle(forWritingTo: fileURL)
                    handle.seekToEndOfFile()
                    if let data = logLine.data(using: .utf8) {
                        handle.write(data)
                    }
                    handle.closeFile()
                } else {
                    try logLine.write(to: fileURL, atomically: true, encoding: .utf8)
                }
            } catch {
                // Ignore logging errors
            }
        }
    }
    
    func clear() {
        guard let fileURL = logFileURL else { return }
        try? FileManager.default.removeItem(at: fileURL)
    }
}

@objc(SampleHandler)
class SampleHandler: RPBroadcastSampleHandler {
    
    // MARK: - Configuration
    
    private let appGroup = "group.com.marketplace.live.screen"
    private let uploadEndpoint = "/api/upload-mobile-content"
    private var chunkDuration: TimeInterval = 30.0 // 30 seconds - smaller chunks upload before extension dies
    private var apiBaseUrl: String = "https://vdi-dev-ali.invsta.systems"
    
    // MARK: - Task Parameters
    
    private var tenantId: String?
    private var campaignId: String?
    private var taskId: String?
    private var stepId: String?
    private var aiAppType: String?
    private var taskType: String = "audio-video"  // Default to 'audio-video'
    private var xApiKey: String = ""  // API key for authentication
    
    // MARK: - Recording State
    
    private var recordingId: String?
    private var chunkIndex: Int = 0
    private var startTime: Date?
    private var lastChunkTime: Date?
    private var frameCount: Int = 0
    private var micSampleCount: Int = 0
    
    // MARK: - Video Writing (Video + App Audio)
    
    private var assetWriter: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?
    private var currentChunkURL: URL?
    private var isWriterConfigured = false
    private var isWriting = false
    
    // Store first samples to configure writer
    private var pendingVideoSample: CMSampleBuffer?
    private var pendingAudioSample: CMSampleBuffer?
    private var videoSize: CGSize = .zero
    
    // MARK: - Mic Audio Writing (Separate file)
    
    private var micWriter: AVAssetWriter?
    private var micInput: AVAssetWriterInput?
    private var currentMicURL: URL?
    private var isMicWriterConfigured = false
    private var isMicWriting = false
    private var pendingMicSample: CMSampleBuffer?
    
    // MARK: - Chunk URLs for merging
    private var completedChunkURLs: [URL] = []
    
    // MARK: - Initialization
    
    override init() {
        if let defaults = UserDefaults(suiteName: "group.com.marketplace.live.screen") {
            defaults.set(Date().description, forKey: "extension_last_init")
            defaults.set(true, forKey: "extension_did_init")
            defaults.synchronize()
        }
        
        super.init()
        
        ExtensionLogger.shared.log("🚀 Extension initialized")
        loadTaskParams()
    }
    
    private func loadTaskParams() {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        
        tenantId = defaults.string(forKey: "tenantId")
        campaignId = defaults.string(forKey: "campaignId")
        taskId = defaults.string(forKey: "taskId")
        stepId = defaults.string(forKey: "stepId")
        aiAppType = defaults.string(forKey: "aiAppType")
        taskType = defaults.string(forKey: "taskType") ?? "audio-video"  // Default to 'audio-video'
        xApiKey = defaults.string(forKey: "xApiKey") ?? ""  // API key for authentication
        
        if let savedApiUrl = defaults.string(forKey: "apiBaseUrl"), !savedApiUrl.isEmpty {
            apiBaseUrl = savedApiUrl
        }
        
        let savedDuration = defaults.double(forKey: "chunkDuration")
        if savedDuration > 0 {
            chunkDuration = savedDuration
        }
    }
    
    private func updateUploadStatus(chunkIndex: Int, status: String, error: String? = nil, isFinal: Bool = false) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        
        let statusDict: [String: Any] = [
            "chunkIndex": chunkIndex,
            "status": status,
            "error": error ?? "",
            "timestamp": Date().timeIntervalSince1970,
            "chunksUploaded": status == "success" ? chunkIndex + 1 : chunkIndex,
            "recordingId": recordingId ?? ""
        ]
        
        defaults.set(statusDict, forKey: "uploadStatus")
        defaults.synchronize()
    }
    
    // MARK: - Broadcast Lifecycle
    
    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        let log = ExtensionLogger.shared
        log.clear()
        
        log.log("🎬 BROADCAST STARTED!")
        
        // Signal to main app that broadcast is active
        if let defaults = UserDefaults(suiteName: appGroup) {
            defaults.set(true, forKey: "isBroadcastActive")
            defaults.synchronize()
        }
        
        recordingId = UUID().uuidString
        startTime = Date()
        lastChunkTime = Date()
        chunkIndex = 0
        frameCount = 0
        micSampleCount = 0
        completedChunkURLs = []
        isWriterConfigured = false
        pendingVideoSample = nil
        pendingAudioSample = nil
        
        // Reset mic writer state
        isMicWriterConfigured = false
        isMicWriting = false
        pendingMicSample = nil
        
        log.log("Recording ID: \(recordingId ?? "unknown")")
        log.log("Task: tenant=\(tenantId ?? "nil"), campaign=\(campaignId ?? "nil"), task=\(taskId ?? "nil")")
        
        // Call cleanup endpoint before starting recording
        callCleanupEndpoint { [weak self] success in
            guard let self = self else { return }
            if success {
                log.log("✅ Cleanup completed, starting recording")
            } else {
                log.log("⚠️ Cleanup failed, proceeding anyway")
            }
            self.prepareNewChunk()
        }
    }
    
    // MARK: - Cleanup Previous Task
    
    private func callCleanupEndpoint(completion: @escaping (Bool) -> Void) {
        let log = ExtensionLogger.shared
        
        guard let taskId = taskId, let tenantId = tenantId else {
            log.log("⚠️ No task_id or tenant_id for cleanup")
            completion(true)  // Proceed anyway
            return
        }
        
        let fullURL = "\(apiBaseUrl)/api/delete-mobile-content"
        guard let url = URL(string: fullURL) else {
            log.log("❌ Invalid cleanup URL: \(fullURL)")
            completion(false)
            return
        }
        
        log.log("🧹 Calling delete-mobile-content: \(fullURL)")
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(xApiKey, forHTTPHeaderField: "X-API-Key")
        request.timeoutInterval = 30
        
        let body: [String: Any] = [
            "tenant_id": tenantId,
            "campaign_id": campaignId ?? "",
            "task_id": taskId,
            "step_id": stepId ?? "",
            "app_type": aiAppType ?? "gemini",
            "task_type": taskType,
            "os_type": "ios"
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            log.log("❌ Failed to serialize cleanup body: \(error)")
            completion(false)
            return
        }
        
        let semaphore = DispatchSemaphore(value: 0)
        var success = false
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            
            if let error = error {
                log.log("❌ Cleanup error: \(error.localizedDescription)")
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                log.log("📊 Cleanup response: \(httpResponse.statusCode)")
                
                if let data = data, let responseBody = String(data: data, encoding: .utf8) {
                    log.log("📄 Cleanup response body: \(responseBody)")
                }
                
                success = httpResponse.statusCode == 200 || httpResponse.statusCode == 201
            }
        }
        
        task.resume()
        
        // Wait for cleanup to complete (max 30 seconds)
        _ = semaphore.wait(timeout: .now() + 30.0)
        
        completion(success)
    }
    
    override func broadcastPaused() {
        ExtensionLogger.shared.log("⏸️ Paused")
    }
    
    override func broadcastResumed() {
        ExtensionLogger.shared.log("▶️ Resumed")
    }
    
    override func broadcastFinished() {
        let log = ExtensionLogger.shared
        let duration = startTime.map { Date().timeIntervalSince($0) } ?? 0
        
        log.log("🛑 Broadcast finished - duration: \(String(format: "%.1f", duration))s, frames: \(frameCount)")
        
        // Signal to main app that broadcast stopped
        if let defaults = UserDefaults(suiteName: appGroup) {
            defaults.set(false, forKey: "isBroadcastActive")
            defaults.synchronize()
        }
        
        finalizeLastChunkAndMerge()
    }
    
    // MARK: - Sample Processing
    
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        // If writer not configured yet, store samples and configure
        if !isWriterConfigured {
            switch sampleBufferType {
            case .video:
                if pendingVideoSample == nil {
                    pendingVideoSample = sampleBuffer
                    // Get video dimensions
                    if let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer) {
                        let dimensions = CMVideoFormatDescriptionGetDimensions(formatDesc)
                        videoSize = CGSize(width: CGFloat(dimensions.width), height: CGFloat(dimensions.height))
                        ExtensionLogger.shared.log("Video size: \(Int(videoSize.width))x\(Int(videoSize.height))")
                    }
                }
        case .audioApp:
            // App/system audio goes to main writer
            if pendingAudioSample == nil {
                pendingAudioSample = sampleBuffer
            }
        case .audioMic:
            // Mic audio - start session on first sample, then append
            if !isMicWriting, let writer = micWriter, writer.status == .writing {
                let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
                writer.startSession(atSourceTime: timestamp)
                isMicWriting = true
                NSLog("[BroadcastExtension] Mic session started at \(CMTimeGetSeconds(timestamp))s")
            }
            // Always append mic samples (mic writer is pre-configured)
            if isMicWriting, let input = micInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
        @unknown default:
            break
        }
            
            // Once we have both, configure the writer
            if pendingVideoSample != nil && pendingAudioSample != nil {
                configureAndStartWriter()
            } else if pendingVideoSample != nil {
                // Start without audio after a short delay (some recordings have no audio)
                configureAndStartWriter()
            }
            return 
        }
        
        // Normal processing
        guard isWriting, let writer = assetWriter, writer.status == .writing else { return }
        
        switch sampleBufferType {
        case .video:
            frameCount += 1
            if let input = videoInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
            
        case .audioApp:
            // App audio goes to main writer
            if let input = audioInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
        case .audioMic:
            // Mic audio - start session if not started, then append
            if !isMicWriting, let writer = micWriter, writer.status == .writing {
                let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
                writer.startSession(atSourceTime: timestamp)
                isMicWriting = true
                ExtensionLogger.shared.log("🎤 Mic session started")
            }
            if isMicWriting, let input = micInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
                micSampleCount += 1
            }
            
        @unknown default:
            break
        }
        
        checkChunkDuration()
    }
    
    private func configureAndStartWriter() {
        guard let writer = assetWriter else { return }
        
        let log = ExtensionLogger.shared
        
        // Configure video input with detected dimensions
        let width = videoSize.width > 0 ? Int(videoSize.width) : 1080
        let height = videoSize.height > 0 ? Int(videoSize.height) : 1920
        
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 2000000, // 2 Mbps - smaller files, faster upload
                AVVideoMaxKeyFrameIntervalKey: 30
            ]
        ]
        
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput?.expectsMediaDataInRealTime = true
        
        if let videoInput = videoInput, writer.canAdd(videoInput) {
            writer.add(videoInput)
        }
        
        // Audio: Encode to AAC matching audioApp format (44100 Hz stereo)
        // Only audioApp is captured (audioMic is skipped) so format is consistent
        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 128000
        ]
        
        audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
        audioInput?.expectsMediaDataInRealTime = true
        
        if let audioInput = audioInput, writer.canAdd(audioInput) {
            writer.add(audioInput)
            log.log("Audio: 44100 Hz stereo (app audio only)")
        }
        
        // Start writing
        writer.startWriting()
        
        // Start session with first video sample's timestamp
        if let videoSample = pendingVideoSample {
            let timestamp = CMSampleBufferGetPresentationTimeStamp(videoSample)
            writer.startSession(atSourceTime: timestamp)
            
            // Write pending samples
            if let input = videoInput, input.isReadyForMoreMediaData {
                input.append(videoSample)
                frameCount += 1
            }
        }
        
        if let audioSample = pendingAudioSample, let input = audioInput, input.isReadyForMoreMediaData {
            input.append(audioSample)
        }
        
        isWriterConfigured = true
        isWriting = true
        pendingVideoSample = nil
        pendingAudioSample = nil
        
        log.log("Writer configured: \(width)x\(height)")
    }
    
    // MARK: - Mic Writer Configuration
    
    // MARK: - Chunk Management
    
    private func checkChunkDuration() {
        guard let lastChunk = lastChunkTime else { return }
        
        if Date().timeIntervalSince(lastChunk) >= chunkDuration {
            finalizeCurrentChunk(isFinal: false)
            prepareNewChunk()
            lastChunkTime = Date()
        }
    }
    
    private func prepareNewChunk() {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            ExtensionLogger.shared.log("❌ No App Group container")
            return
        }
        
        let chunksDir = containerURL.appendingPathComponent("chunks")
        try? FileManager.default.createDirectory(at: chunksDir, withIntermediateDirectories: true)
        
        // Video chunk (video + app audio)
        let chunkFileName = "chunk_\(recordingId ?? "unknown")_\(chunkIndex).mp4"
        currentChunkURL = chunksDir.appendingPathComponent(chunkFileName)
        
        // Mic audio chunk (human_X.m4a)
        let micFileName = "human_\(recordingId ?? "unknown")_\(chunkIndex).m4a"
        currentMicURL = chunksDir.appendingPathComponent(micFileName)
        
        guard let url = currentChunkURL, let micUrl = currentMicURL else { return }
        
        try? FileManager.default.removeItem(at: url)
        try? FileManager.default.removeItem(at: micUrl)
        
        do {
            // Video writer
            assetWriter = try AVAssetWriter(url: url, fileType: .mp4)
            isWriterConfigured = false
            isWriting = false
            pendingVideoSample = nil
            pendingAudioSample = nil
            
            // Mic writer - PRE-CONFIGURE with known format (48000 Hz, mono)
            // Don't wait for sample - this fixes missing mic files issue
            micWriter = try AVAssetWriter(url: micUrl, fileType: .m4a)
            
            let micSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,      // iOS mic is always 48kHz
                AVNumberOfChannelsKey: 1,     // Mono
                AVEncoderBitRateKey: 128000
            ]
            micInput = AVAssetWriterInput(mediaType: .audio, outputSettings: micSettings)
            micInput?.expectsMediaDataInRealTime = true
            
            if let input = micInput, micWriter?.canAdd(input) == true {
                micWriter?.add(input)
            }
            
            micWriter?.startWriting()
            isMicWriterConfigured = true
            isMicWriting = false  // Will be set to true when first sample arrives
            pendingMicSample = nil
            
            let log = ExtensionLogger.shared
            log.log("📦 Prepared chunk \(chunkIndex)")
            log.log("   Video writer: \(assetWriter != nil ? "✓" : "✗")")
            log.log("   Mic writer: \(micWriter != nil ? "✓" : "✗"), status: \(micWriter?.status.rawValue ?? -1)")
            log.log("   Mic input: \(micInput != nil ? "✓" : "✗")")
        } catch {
            NSLog("[BroadcastExtension] Failed to create writer: \(error)")
        }
    }
    
    private func finalizeCurrentChunk(isFinal: Bool) {
        let log = ExtensionLogger.shared
        log.log("🔄 Finalizing chunk \(chunkIndex) (isFinal: \(isFinal))")
        log.log("   Video frames: \(frameCount), Mic samples: \(micSampleCount)")
        log.log("   isWriting: \(isWriting), isMicWriting: \(isMicWriting)")
        
        guard isWriting else { 
            log.log("⚠️ Video writer not writing - skipping finalize")
            return 
        }
        isWriting = false
        
        let currentIndex = chunkIndex
        let chunkURL = currentChunkURL
        let micURL = currentMicURL
        
        // Finalize video writer
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        
        let videoSemaphore = DispatchSemaphore(value: 0)
        
        assetWriter?.finishWriting { [weak self] in
            if let url = chunkURL, FileManager.default.fileExists(atPath: url.path) {
                self?.completedChunkURLs.append(url)
            }
            videoSemaphore.signal()
        }
        
        // Finalize mic writer
        let micSemaphore = DispatchSemaphore(value: 0)
        
        if isMicWriting {
            isMicWriting = false
            micInput?.markAsFinished()
            
            micWriter?.finishWriting {
                micSemaphore.signal()
            }
        } else {
            micSemaphore.signal()
        }
        
        _ = videoSemaphore.wait(timeout: .now() + 5.0)
        _ = micSemaphore.wait(timeout: .now() + 5.0)
        
        // Log file sizes
        if let url = chunkURL, FileManager.default.fileExists(atPath: url.path),
           let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
           let size = attrs[.size] as? Int64 {
            log.log("✅ Video file: \(size / 1024) KB")
        } else {
            log.log("❌ Video file missing or empty")
        }
        
        if let url = micURL, FileManager.default.fileExists(atPath: url.path),
           let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
           let size = attrs[.size] as? Int64 {
            log.log("✅ Mic file: \(size / 1024) KB")
        } else {
            log.log("❌ Mic file missing or empty")
        }
        
        // Upload both video and mic in single request
        uploadChunk(videoURL: chunkURL, micURL: micURL, chunkIndex: currentIndex, isFinal: isFinal)
        
        chunkIndex += 1
    }
    
    private func finalizeLastChunkAndMerge() {
        let log = ExtensionLogger.shared
        log.log("📦 Finalizing...")
        
        let currentIndex = chunkIndex
        let chunkURL = currentChunkURL
        let micURL = currentMicURL
        
        // Finalize video writer
        if isWriting {
            isWriting = false
            videoInput?.markAsFinished()
            audioInput?.markAsFinished()
            
            let videoSemaphore = DispatchSemaphore(value: 0)
            
            assetWriter?.finishWriting { [weak self] in
                if let url = chunkURL, FileManager.default.fileExists(atPath: url.path) {
                    self?.completedChunkURLs.append(url)
                    log.log("✅ Final video chunk \(currentIndex) saved")
                }
                videoSemaphore.signal()
            }
            
            _ = videoSemaphore.wait(timeout: .now() + 5.0)
            
        }
        
        // Finalize mic writer
        if isMicWriting {
            isMicWriting = false
            micInput?.markAsFinished()
            
            let micSemaphore = DispatchSemaphore(value: 0)
            
            micWriter?.finishWriting {
                log.log("✅ Final mic chunk \(currentIndex) saved")
                micSemaphore.signal()
            }
            
            _ = micSemaphore.wait(timeout: .now() + 5.0)
        }
        
        // Upload both video and mic in single request
        uploadChunk(videoURL: chunkURL, micURL: micURL, chunkIndex: currentIndex, isFinal: true)
        
        chunkIndex += 1
        
        mergeChunksToSingleVideo()
    }
    
    // MARK: - Merge Chunks
    
    private func mergeChunksToSingleVideo() {
        let log = ExtensionLogger.shared
        log.log("📼 Merging \(completedChunkURLs.count) chunks...")
        
        guard !completedChunkURLs.isEmpty else {
            log.log("⚠️ No chunks")
            return
        }
        
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            log.log("❌ No container")
            return
        }
        
        let sortedChunks = completedChunkURLs.sorted { $0.lastPathComponent < $1.lastPathComponent }
        
        // If only one chunk, just copy it
        if sortedChunks.count == 1 {
            copyChunkAsOutput(sortedChunks[0], to: containerURL)
            return
        }
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = dateFormatter.string(from: Date())
        let mergedFileName = "LiveCapture_\(timestamp).mp4"
        let mergedURL = containerURL.appendingPathComponent(mergedFileName)
        
        try? FileManager.default.removeItem(at: mergedURL)
        
        let composition = AVMutableComposition()
        
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            log.log("❌ No video track - fallback")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        
        var currentTime = CMTime.zero
        var successCount = 0
        
        // Verify all chunks exist first
        for (i, url) in sortedChunks.enumerated() {
            let exists = FileManager.default.fileExists(atPath: url.path)
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
            log.log("Chunk \(i): exists=\(exists), size=\(size) bytes")
        }
        
        for chunkURL in sortedChunks {
            guard FileManager.default.fileExists(atPath: chunkURL.path) else {
                log.log("⚠️ Chunk missing: \(chunkURL.lastPathComponent)")
                continue
            }
            
            let asset = AVURLAsset(url: chunkURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
            
            guard let assetVideoTrack = asset.tracks(withMediaType: .video).first else { continue }
            
            // Get actual duration from video track
            let trackDuration = assetVideoTrack.timeRange.duration
            var duration = trackDuration
            
            // Validate duration
            let durationSeconds = CMTimeGetSeconds(duration)
            if durationSeconds <= 0 || durationSeconds > 60 || durationSeconds.isNaN {
                duration = CMTime(seconds: chunkDuration, preferredTimescale: 600)
            }
            
            do {
                let timeRange = CMTimeRange(start: .zero, duration: duration)
                try videoTrack.insertTimeRange(timeRange, of: assetVideoTrack, at: currentTime)
                
                if let assetAudioTrack = asset.tracks(withMediaType: .audio).first,
                   let audioTrack = audioTrack {
                    try audioTrack.insertTimeRange(timeRange, of: assetAudioTrack, at: currentTime)
                }
                
                currentTime = CMTimeAdd(currentTime, duration)
                successCount += 1
            } catch {
                log.log("⚠️ Chunk error: \(error.localizedDescription)")
            }
        }
        
        if successCount == 0 {
            log.log("❌ No chunks merged - fallback")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        log.log("Merged \(successCount) chunks, duration: \(String(format: "%.1f", CMTimeGetSeconds(currentTime)))s")
        
        // Use MediumQuality to re-encode and handle format differences between chunks
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetMediumQuality) else {
            log.log("❌ No exporter - fallback")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        exporter.outputURL = mergedURL
        exporter.outputFileType = .mp4
        exporter.shouldOptimizeForNetworkUse = false
        
        let semaphore = DispatchSemaphore(value: 0)
        var exportSuccess = false
        
        exporter.exportAsynchronously {
            exportSuccess = (exporter.status == .completed)
            if !exportSuccess {
                let error = exporter.error as NSError?
                log.log("❌ Export error: \(exporter.error?.localizedDescription ?? "unknown")")
                log.log("❌ Error code: \(error?.code ?? -1), domain: \(error?.domain ?? "unknown")")
            }
            semaphore.signal()
        }
        
        let waitResult = semaphore.wait(timeout: .now() + 60.0)
        if waitResult == .timedOut {
            log.log("❌ Export timed out")
            exporter.cancelExport()
        }
        
        if exportSuccess {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: mergedURL.path),
               let size = attrs[.size] as? Int64 {
                log.log("✅ Merged: \(size / 1024) KB")
            }
            setVideoReadyFlag(path: mergedURL.path)
            cleanupChunks()
        } else {
            log.log("❌ Export failed - fallback to largest chunk")
            // Find the largest chunk (most complete recording)
            let largestChunk = sortedChunks.max { a, b in
                let sizeA = (try? FileManager.default.attributesOfItem(atPath: a.path)[.size] as? Int64) ?? 0
                let sizeB = (try? FileManager.default.attributesOfItem(atPath: b.path)[.size] as? Int64) ?? 0
                return sizeA < sizeB
            }
            if let chunk = largestChunk {
                copyChunkAsOutput(chunk, to: containerURL)
            } else {
                cleanupChunks()
            }
        }
    }
    
    private func copyChunkAsOutput(_ chunkURL: URL, to containerURL: URL) {
        let log = ExtensionLogger.shared
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = dateFormatter.string(from: Date())
        let outputFileName = "LiveCapture_\(timestamp).mp4"
        let outputURL = containerURL.appendingPathComponent(outputFileName)
        
        try? FileManager.default.removeItem(at: outputURL)
        
        do {
            try FileManager.default.copyItem(at: chunkURL, to: outputURL)
            
            if let attrs = try? FileManager.default.attributesOfItem(atPath: outputURL.path),
                   let size = attrs[.size] as? Int64 {
                log.log("✅ Copied: \(size / 1024) KB")
                }
            
            setVideoReadyFlag(path: outputURL.path)
            cleanupChunks()
        } catch {
            log.log("❌ Copy failed: \(error.localizedDescription)")
            cleanupChunks()
        }
    }
    
    private func setVideoReadyFlag(path: String) {
        if let defaults = UserDefaults(suiteName: appGroup) {
            defaults.set(true, forKey: "pendingVideoReady")
            defaults.set(path, forKey: "pendingVideoPath")
            defaults.set(Date().timeIntervalSince1970, forKey: "pendingVideoTimestamp")
            defaults.synchronize()
            ExtensionLogger.shared.log("📱 Ready for Photos")
        }
    }
    
    private func cleanupChunks() {
        for url in completedChunkURLs {
            try? FileManager.default.removeItem(at: url)
        }
        completedChunkURLs = []
        
        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            let chunksDir = containerURL.appendingPathComponent("chunks")
            try? FileManager.default.removeItem(at: chunksDir)
        }
    }
    
    // MARK: - Upload
    
    private func uploadChunk(videoURL: URL?, micURL: URL?, chunkIndex: Int, isFinal: Bool) {
        let log = ExtensionLogger.shared
        
        log.log("========== UPLOAD CHUNK \(chunkIndex) ==========")
        
        // At minimum we need video file
        guard let videoURL = videoURL, FileManager.default.fileExists(atPath: videoURL.path) else {
            log.log("⚠️ No video file to upload for chunk \(chunkIndex)")
            return
        }
        
        guard let tenantId = tenantId,
              let campaignId = campaignId,
              let taskId = taskId,
              let stepId = stepId,
              let recordingId = recordingId else {
            log.log("⚠️ Missing task params - skipping upload")
            return
        }
        
        let fullURL = "\(apiBaseUrl)\(uploadEndpoint)"
        guard let url = URL(string: fullURL) else { 
            log.log("❌ Invalid URL: \(fullURL)")
            return
        }
        
        log.log("📍 URL: \(fullURL)")
        
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(xApiKey, forHTTPHeaderField: "X-API-Key")
        request.timeoutInterval = 60
        
        var body = Data()
        var videoSize: Int = 0
        var micSize: Int = 0
        
        // Required: video file (name="file")
        if let videoData = try? Data(contentsOf: videoURL) {
            videoSize = videoData.count
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"file\"; filename=\"chunk_\(chunkIndex).mp4\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: video/mp4\r\n\r\n".data(using: .utf8)!)
            body.append(videoData)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Optional: mic audio (name="mic_file") - skip for ChatGPT (user exports manually)
        var hasMic = false
        let isChatGPT = aiAppType?.lowercased() == "chatgpt"
        if !isChatGPT,
           let micURL = micURL, FileManager.default.fileExists(atPath: micURL.path),
           let micData = try? Data(contentsOf: micURL), micData.count > 0 {
            micSize = micData.count
            hasMic = true
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"mic_file\"; filename=\"human_\(chunkIndex).m4a\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
            body.append(micData)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Log file sizes
        log.log("📦 FILES:")
        log.log("   file: chunk_\(chunkIndex).mp4 → \(videoSize / 1024) KB")
        if hasMic {
            log.log("   mic_file: human_\(chunkIndex).m4a → \(micSize / 1024) KB")
        } else if isChatGPT {
            log.log("   mic_file: SKIPPED (ChatGPT - user exports manually)")
        } else {
            log.log("   mic_file: NOT INCLUDED (no mic data)")
        }
        
        // Metadata fields
        var fields: [String: String] = [
            "tenant_id": tenantId,
            "campaign_id": campaignId,
            "task_id": taskId,
            "step_id": stepId,
            "recording_id": recordingId,
            "chunk_index": String(chunkIndex),
            "is_final": String(isFinal),
            "os_type": "ios",
            "task_type": taskType
        ]
        
        // Add app type if available
        if let aiAppType = aiAppType {
            fields["app_type"] = aiAppType
        }
        
        // Log metadata
        log.log("📋 METADATA:")
        for (key, value) in fields {
            log.log("   \(key): \(value)")
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        log.log("📤 SENDING REQUEST...")
        log.log("   Total body size: \(body.count / 1024) KB")
        
        updateUploadStatus(chunkIndex: chunkIndex, status: "uploading")
        
        let uploadStartTime = Date()
        
        // For final chunk, wait synchronously so extension doesn't die before upload completes
        let semaphore = isFinal ? DispatchSemaphore(value: 0) : nil
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let elapsed = Date().timeIntervalSince(uploadStartTime)
            
            log.log("📥 RESPONSE RECEIVED (took \(String(format: "%.2f", elapsed))s)")
            
            if let error = error {
                log.log("❌ NETWORK ERROR:")
                log.log("   \(error.localizedDescription)")
                self?.updateUploadStatus(chunkIndex: chunkIndex, status: "failed", error: error.localizedDescription)
                log.log("========== UPLOAD FAILED ==========")
                semaphore?.signal()
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                log.log("📊 HTTP Status: \(httpResponse.statusCode)")
                
                // Log response body
                if let data = data {
                    let responseBody = String(data: data, encoding: .utf8) ?? "<binary data>"
                    log.log("📄 Response Body: \(responseBody)")
                }
                
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    log.log("✅ SUCCESS! Chunk \(chunkIndex) uploaded successfully")
                    
                    // Note: Success file is now written optimistically after starting upload (before response)
                    // This call updates UserDefaults status
                    self?.updateUploadStatus(chunkIndex: chunkIndex, status: "success", isFinal: isFinal)
                    log.log("========== UPLOAD SUCCESS ==========")
                } else {
                    log.log("❌ HTTP ERROR: Status \(httpResponse.statusCode)")
                    self?.updateUploadStatus(chunkIndex: chunkIndex, status: "failed", error: "HTTP \(httpResponse.statusCode)", isFinal: isFinal)
                    log.log("========== UPLOAD FAILED ==========")
                }
            }
            
            semaphore?.signal()
        }
        
        task.resume()
        
        // Wait for final chunk upload to complete (up to 30 seconds)
        if isFinal {
            log.log("⏳ Waiting for final chunk upload to complete...")
            _ = semaphore?.wait(timeout: .now() + 30.0)
            log.log("✅ Final chunk upload wait complete")
        }
    }
}
