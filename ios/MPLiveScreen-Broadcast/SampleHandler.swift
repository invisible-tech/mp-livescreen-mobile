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
            NSLog("[ExtensionLogger] ERROR: Cannot get container URL for app group: \(appGroup)")
            return nil
        }
        return containerURL.appendingPathComponent(logFileName)
    }
    
    init() {
        writeSync("ExtensionLogger initialized")
    }
    
    func writeSync(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let logLine = "[\(timestamp)] \(message)\n"
        
        NSLog("[BroadcastExtension] \(message)")
        
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            NSLog("[ExtensionLogger] CRITICAL: App Group not accessible!")
            return
        }
        
        let fileURL = containerURL.appendingPathComponent(logFileName)
        
        do {
            if FileManager.default.fileExists(atPath: fileURL.path) {
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
            NSLog("[ExtensionLogger] Write error: \(error)")
        }
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
                NSLog("[BroadcastExtension] Failed to write log: \(error)")
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
    private var isWriting = false
    private var sessionStartTime: CMTime?  // Track first sample time for offset
    
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
        
        let log = ExtensionLogger.shared
        log.log("========================================")
        log.log("🚀 EXTENSION INIT - SampleHandler created")
        log.log("========================================")
        
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
        
        NSLog("[BroadcastExtension] Config: apiBaseUrl=\(apiBaseUrl), chunkDuration=\(chunkDuration)s")
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
        
        log.log("*******************************************")
        log.log("🎬 BROADCAST STARTED!")
        log.log("*******************************************")
        
        recordingId = UUID().uuidString
        startTime = Date()
        lastChunkTime = Date()
        chunkIndex = 0
        frameCount = 0
        completedChunkURLs = []
        
        log.log("Recording ID: \(recordingId ?? "unknown")")
        log.log("Task params: tenant=\(tenantId ?? "nil"), campaign=\(campaignId ?? "nil"), task=\(taskId ?? "nil")")
        
        startNewChunk()
    }
    
    override func broadcastPaused() {
        NSLog("[BroadcastExtension] ⏸️ Broadcast paused")
    }
    
    override func broadcastResumed() {
        NSLog("[BroadcastExtension] ▶️ Broadcast resumed")
    }
    
    override func broadcastFinished() {
        let log = ExtensionLogger.shared
        let duration = startTime.map { Date().timeIntervalSince($0) } ?? 0
        
        log.log("🛑 Broadcast finished - duration: \(String(format: "%.1f", duration))s, frames: \(frameCount)")
        
        // Finalize last chunk synchronously
        finalizeLastChunkAndMerge()
    }
    
    private func finalizeLastChunkAndMerge() {
        let log = ExtensionLogger.shared
        log.log("📦 Finalizing last chunk...")
        
        guard isWriting else {
            log.log("⚠️ Not writing - proceeding to merge")
            mergeChunksToSingleVideo()
            return
        }
        isWriting = false
        
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        
        let currentIndex = chunkIndex
        let chunkURL = currentChunkURL
        
        // Use semaphore to wait for finishWriting to complete
        let semaphore = DispatchSemaphore(value: 0)
        
        assetWriter?.finishWriting { [weak self] in
            guard let self = self, let url = chunkURL else {
                log.log("❌ finishWriting failed")
                semaphore.signal()
                return
            }
            
            if FileManager.default.fileExists(atPath: url.path) {
                self.completedChunkURLs.append(url)
                log.log("✅ Final chunk \(currentIndex) saved")
            }
            
            // Upload last chunk (don't wait for it)
            self.uploadChunk(fileURL: url, chunkIndex: currentIndex, isFinal: true)
            
            semaphore.signal()
        }
        
        // Wait up to 5 seconds for finalization
        let result = semaphore.wait(timeout: .now() + 5.0)
        if result == .timedOut {
            log.log("⚠️ Finalization timed out, proceeding with available chunks")
        }
        
        chunkIndex += 1
        
        // Now merge synchronously
        mergeChunksToSingleVideo()
    }
    
    // MARK: - Sample Processing
    
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard isWriting, let writer = assetWriter, writer.status == .writing else { return }
        
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        
        // Start session with first sample's timestamp
        if sessionStartTime == nil {
            sessionStartTime = timestamp
            writer.startSession(atSourceTime: timestamp)
        }
        
        switch sampleBufferType {
        case .video:
            frameCount += 1
            if let input = videoInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
            
        case .audioApp, .audioMic:
            if let input = audioInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
            
        @unknown default:
            break
        }
        
        checkChunkDuration()
    }
    
    // MARK: - Chunk Management
    
    private func checkChunkDuration() {
        guard let lastChunk = lastChunkTime else { return }
        
        if Date().timeIntervalSince(lastChunk) >= chunkDuration {
            finalizeCurrentChunk(isFinal: false)
            startNewChunk()
            lastChunkTime = Date()
        }
    }
    
    private func startNewChunk() {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            NSLog("[BroadcastExtension] ❌ Failed to get App Group container")
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
            
            let videoSettings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: 1080,
                AVVideoHeightKey: 1920,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: 6000000,
                    AVVideoMaxKeyFrameIntervalKey: 60
                ]
            ]
            
            videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
            videoInput?.expectsMediaDataInRealTime = true
            
            // Use nil for audio settings to pass through source format (prevents distortion)
            audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: nil)
            audioInput?.expectsMediaDataInRealTime = true
            
            if let videoInput = videoInput, assetWriter?.canAdd(videoInput) == true {
                assetWriter?.add(videoInput)
            }
            
            if let audioInput = audioInput, assetWriter?.canAdd(audioInput) == true {
                assetWriter?.add(audioInput)
            }
            
            assetWriter?.startWriting()
            // Don't call startSession here - we'll call it with the first sample's timestamp
            sessionStartTime = nil  // Reset for new chunk
            isWriting = true
            
            NSLog("[BroadcastExtension] Started chunk \(chunkIndex)")
            
        } catch {
            NSLog("[BroadcastExtension] Failed to create asset writer: \(error)")
        }
    }
    
    private func finalizeCurrentChunk(isFinal: Bool) {
        guard isWriting else { return }
        isWriting = false
        
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        
        let currentIndex = chunkIndex
        let chunkURL = currentChunkURL
        
        assetWriter?.finishWriting { [weak self] in
            guard let self = self, let url = chunkURL else { return }
            
            if FileManager.default.fileExists(atPath: url.path) {
                self.completedChunkURLs.append(url)
                NSLog("[BroadcastExtension] ✅ Chunk \(currentIndex) finalized")
            }
            
            self.uploadChunk(fileURL: url, chunkIndex: currentIndex, isFinal: isFinal)
        }
        
        chunkIndex += 1
    }
    
    // MARK: - Merge Chunks (Main app will save to Photos)
    
    private func mergeChunksToSingleVideo() {
        let log = ExtensionLogger.shared
        log.log("📼 Merging \(completedChunkURLs.count) chunks...")
        
        guard !completedChunkURLs.isEmpty else {
            log.log("⚠️ No chunks to merge")
            return
        }
        
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            log.log("❌ Failed to get App Group container")
            return
        }
        
        let sortedChunks = completedChunkURLs.sorted { $0.lastPathComponent < $1.lastPathComponent }
        log.log("Chunks to merge: \(sortedChunks.count)")
        
        // If only one chunk, just copy it directly
        if sortedChunks.count == 1 {
            log.log("Single chunk - copying directly")
            copyChunkAsOutput(sortedChunks[0], to: containerURL)
            return
        }
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = dateFormatter.string(from: Date())
        let mergedFileName = "LiveCapture_\(timestamp).mp4"
        let mergedURL = containerURL.appendingPathComponent(mergedFileName)
        
        try? FileManager.default.removeItem(at: mergedURL)
        
        log.log("Output: \(mergedURL.lastPathComponent)")
        
        let composition = AVMutableComposition()
        
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            log.log("❌ Failed to create video track - falling back to copy")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        
        var currentTime = CMTime.zero
        var successCount = 0
        
        for chunkURL in sortedChunks {
            // Verify chunk exists
            guard FileManager.default.fileExists(atPath: chunkURL.path) else {
                log.log("⚠️ Chunk not found: \(chunkURL.lastPathComponent)")
                continue
            }
            
            let asset = AVURLAsset(url: chunkURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
            
            // Check if asset has video
            guard let assetVideoTrack = asset.tracks(withMediaType: .video).first else {
                log.log("⚠️ No video track in: \(chunkURL.lastPathComponent)")
                continue
            }
            
            // Get duration - validate it's reasonable (< 1 hour per chunk)
            var duration = asset.duration
            let durationSeconds = CMTimeGetSeconds(duration)
            
            if durationSeconds <= 0 || durationSeconds > 3600 || durationSeconds.isNaN {
                log.log("⚠️ Invalid duration \(durationSeconds)s for \(chunkURL.lastPathComponent), using 5s")
                duration = CMTime(seconds: 5.0, preferredTimescale: 600)
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
                log.log("Added: \(chunkURL.lastPathComponent) (\(String(format: "%.1f", durationSeconds))s)")
            } catch {
                log.log("⚠️ Failed: \(error.localizedDescription)")
            }
        }
        
        if successCount == 0 {
            log.log("❌ No chunks added - falling back to copy")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        let totalDuration = CMTimeGetSeconds(currentTime)
        log.log("Total duration: \(String(format: "%.1f", totalDuration))s from \(successCount) chunks")
        
        // Validate total duration
        if totalDuration <= 0 || totalDuration > 7200 {
            log.log("❌ Invalid total duration - falling back to copy")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
            log.log("❌ Failed to create exporter - falling back to copy")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        exporter.outputURL = mergedURL
        exporter.outputFileType = .mp4
        
        log.log("Starting export...")
        
        let semaphore = DispatchSemaphore(value: 0)
        var exportSuccess = false
        
        exporter.exportAsynchronously {
            exportSuccess = (exporter.status == .completed)
            if !exportSuccess {
                log.log("❌ Export error: \(exporter.error?.localizedDescription ?? "unknown")")
            }
            semaphore.signal()
        }
        
        let result = semaphore.wait(timeout: .now() + 60.0)
        
        if result == .timedOut {
            log.log("⚠️ Export timed out - falling back to copy")
            exporter.cancelExport()
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
            return
        }
        
        if exportSuccess {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: mergedURL.path),
               let size = attrs[.size] as? Int64 {
                log.log("✅ Merged video: \(size / 1024) KB")
            }
            
            setVideoReadyFlag(path: mergedURL.path)
            cleanupChunks()
        } else {
            log.log("❌ Export failed - falling back to copy")
            copyChunkAsOutput(sortedChunks.last!, to: containerURL)
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
                log.log("✅ Copied chunk as output: \(size / 1024) KB")
            }
            
            setVideoReadyFlag(path: outputURL.path)
            cleanupChunks()
        } catch {
            log.log("❌ Failed to copy: \(error.localizedDescription)")
            cleanupChunks()
        }
    }
    
    private func setVideoReadyFlag(path: String) {
        let log = ExtensionLogger.shared
        
        if let defaults = UserDefaults(suiteName: appGroup) {
            defaults.set(true, forKey: "pendingVideoReady")
            defaults.set(path, forKey: "pendingVideoPath")
            defaults.set(Date().timeIntervalSince1970, forKey: "pendingVideoTimestamp")
            defaults.synchronize()
            log.log("✅ Video ready flag set")
            log.log("📱 Main app will save to Photos")
        }
    }
    
    private func cleanupChunks() {
        for url in completedChunkURLs {
            try? FileManager.default.removeItem(at: url)
        }
        completedChunkURLs = []
        
        // Clean up chunks directory
        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            let chunksDir = containerURL.appendingPathComponent("chunks")
            try? FileManager.default.removeItem(at: chunksDir)
        }
    }
    
    // MARK: - Upload
    
    private func uploadChunk(fileURL: URL, chunkIndex: Int, isFinal: Bool) {
        let log = ExtensionLogger.shared
        
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            log.log("⚠️ Chunk file not found for upload")
            return
        }
        
        guard let tenantId = tenantId,
              let campaignId = campaignId,
              let taskId = taskId,
              let stepId = stepId,
              let recordingId = recordingId else {
            log.log("⚠️ Missing params - skipping upload (chunks will still be merged)")
            return
        }
        
        guard let url = URL(string: "\(apiBaseUrl)\(uploadEndpoint)") else {
            log.log("❌ Invalid URL")
            return
        }
        
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
            if let error = error {
                log.log("❌ Upload failed: \(error.localizedDescription)")
                self?.updateUploadStatus(chunkIndex: chunkIndex, status: "failed", error: error.localizedDescription)
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    log.log("✅ Chunk \(chunkIndex) uploaded")
                    self?.updateUploadStatus(chunkIndex: chunkIndex, status: "success")
                } else {
                    let responseText = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                    log.log("❌ Upload error: HTTP \(httpResponse.statusCode)")
                    self?.updateUploadStatus(chunkIndex: chunkIndex, status: "failed", error: "HTTP \(httpResponse.statusCode)")
                }
            }
        }
        
        task.resume()
    }
}
