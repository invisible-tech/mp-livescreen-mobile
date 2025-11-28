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
    private var chunkDuration: TimeInterval = 5.0
    private var apiBaseUrl: String = "https://vdi-dev-ali.invsta.systems"
    
    // MARK: - Task Parameters
    
    private var tenantId: String?
    private var campaignId: String?
    private var taskId: String?
    private var stepId: String?
    
    // MARK: - Recording State
    
    private var recordingId: String?
    private var chunkIndex: Int = 0
    private var startTime: Date?
    private var lastChunkTime: Date?
    private var frameCount: Int = 0
    
    // MARK: - Video Writing
    
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
        
        if let savedApiUrl = defaults.string(forKey: "apiBaseUrl"), !savedApiUrl.isEmpty {
            apiBaseUrl = savedApiUrl
        }
        
        let savedDuration = defaults.double(forKey: "chunkDuration")
        if savedDuration > 0 {
            chunkDuration = savedDuration
        }
    }
    
    private func updateUploadStatus(chunkIndex: Int, status: String, error: String? = nil) {
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
        
        recordingId = UUID().uuidString
        startTime = Date()
        lastChunkTime = Date()
        chunkIndex = 0
        frameCount = 0
        completedChunkURLs = []
        isWriterConfigured = false
        pendingVideoSample = nil
        pendingAudioSample = nil
        
        log.log("Recording ID: \(recordingId ?? "unknown")")
        log.log("Task: tenant=\(tenantId ?? "nil"), campaign=\(campaignId ?? "nil"), task=\(taskId ?? "nil")")
        
        prepareNewChunk()
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
            // Only capture app/system audio (consistent format)
            // Mixing audioApp + audioMic causes format mismatch and distortion
            if pendingAudioSample == nil {
                pendingAudioSample = sampleBuffer
            }
        case .audioMic:
            // Skip mic audio - format differs from app audio
            break
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
            // Only process app audio (system sounds, media playback)
            if let input = audioInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
        case .audioMic:
            // Skip mic - different format causes distortion
            break
            
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
                AVVideoAverageBitRateKey: 6000000,
                AVVideoMaxKeyFrameIntervalKey: 60
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
        
        let chunkFileName = "chunk_\(recordingId ?? "unknown")_\(chunkIndex).mp4"
        currentChunkURL = chunksDir.appendingPathComponent(chunkFileName)
        
        guard let url = currentChunkURL else { return }
        
        try? FileManager.default.removeItem(at: url)
        
        do {
            assetWriter = try AVAssetWriter(url: url, fileType: .mp4)
            isWriterConfigured = false
            isWriting = false
            pendingVideoSample = nil
            pendingAudioSample = nil
            
            NSLog("[BroadcastExtension] Prepared chunk \(chunkIndex)")
        } catch {
            NSLog("[BroadcastExtension] Failed to create writer: \(error)")
        }
    }
    
    private func finalizeCurrentChunk(isFinal: Bool) {
        guard isWriting else { return }
        isWriting = false
        
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        
        let currentIndex = chunkIndex
        let chunkURL = currentChunkURL
        
        let semaphore = DispatchSemaphore(value: 0)
        
        assetWriter?.finishWriting { [weak self] in
            if let url = chunkURL, FileManager.default.fileExists(atPath: url.path) {
                self?.completedChunkURLs.append(url)
            }
            semaphore.signal()
        }
        
        _ = semaphore.wait(timeout: .now() + 5.0)
        
        // Upload chunk
        if let url = chunkURL {
            uploadChunk(fileURL: url, chunkIndex: currentIndex, isFinal: isFinal)
        }
        
        chunkIndex += 1
    }
    
    private func finalizeLastChunkAndMerge() {
        let log = ExtensionLogger.shared
        log.log("📦 Finalizing...")
        
        if isWriting {
            isWriting = false
            videoInput?.markAsFinished()
            audioInput?.markAsFinished()
            
            let currentIndex = chunkIndex
            let chunkURL = currentChunkURL
            
            let semaphore = DispatchSemaphore(value: 0)
            
            assetWriter?.finishWriting { [weak self] in
                if let url = chunkURL, FileManager.default.fileExists(atPath: url.path) {
                    self?.completedChunkURLs.append(url)
                    log.log("✅ Final chunk \(currentIndex) saved")
                }
                semaphore.signal()
            }
            
            _ = semaphore.wait(timeout: .now() + 5.0)
            
            if let url = chunkURL {
                uploadChunk(fileURL: url, chunkIndex: currentIndex, isFinal: true)
            }
            
            chunkIndex += 1
        }
        
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
    
    private func uploadChunk(fileURL: URL, chunkIndex: Int, isFinal: Bool) {
        let log = ExtensionLogger.shared
        
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        
        guard let tenantId = tenantId,
              let campaignId = campaignId,
              let taskId = taskId,
              let stepId = stepId,
              let recordingId = recordingId else {
            return
        }
        
        guard let url = URL(string: "\(apiBaseUrl)\(uploadEndpoint)") else { return }
        
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60
        
        var body = Data()
        
        if let fileData = try? Data(contentsOf: fileURL) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"file\"; filename=\"chunk_\(chunkIndex).mp4\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: video/mp4\r\n\r\n".data(using: .utf8)!)
            body.append(fileData)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        let fields: [String: String] = [
            "tenant_id": tenantId,
            "campaign_id": campaignId,
            "task_id": taskId,
            "step_id": stepId,
            "recording_id": recordingId,
            "chunk_index": String(chunkIndex),
            "is_final": String(isFinal)
        ]
        
        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        updateUploadStatus(chunkIndex: chunkIndex, status: "uploading")
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            if let httpResponse = response as? HTTPURLResponse,
               httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                log.log("✅ Chunk \(chunkIndex) uploaded")
                self?.updateUploadStatus(chunkIndex: chunkIndex, status: "success")
            } else {
                let errorMsg = error?.localizedDescription ?? "HTTP error"
                self?.updateUploadStatus(chunkIndex: chunkIndex, status: "failed", error: errorMsg)
            }
        }
        
        task.resume()
    }
}
