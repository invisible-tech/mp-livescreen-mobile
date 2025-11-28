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
import Photos

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
        // Write immediately on init to prove logger is working
        writeSync("ExtensionLogger initialized")
    }
    
    // Synchronous write - use for critical logs
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
        
        // Also print to NSLog for Console.app
        NSLog("[BroadcastExtension] \(message)")
        
        // Write to file
        guard let fileURL = logFileURL else { return }
        
        DispatchQueue.global(qos: .utility).async {
            do {
                if FileManager.default.fileExists(atPath: fileURL.path) {
                    // Check file size and truncate if too large
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
    private var chunkDuration: TimeInterval = 5.0 // Default, can be overridden from App Group
    
    // Read from App Group (set by main app from .env)
    private var apiBaseUrl: String = "https://vdi-dev-ali.invsta.systems" // Fallback default
    
    // MARK: - Task Parameters (from App Group)
    
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
    
    // MARK: - Chunk URLs for merging
    private var completedChunkURLs: [URL] = []
    private var pendingUploads: Int = 0
    private let uploadQueue = DispatchQueue(label: "com.mplivescreen.upload", qos: .utility)
    
    // MARK: - Initialization
    
    override init() {
        // FIRST: Write directly to UserDefaults BEFORE anything else
        // This proves the extension is actually running
        if let defaults = UserDefaults(suiteName: "group.com.marketplace.live.screen") {
            defaults.set(Date().description, forKey: "extension_last_init")
            defaults.set(true, forKey: "extension_did_init")
            defaults.synchronize()
        }
        
        super.init()
        
        // Write log immediately on init - before anything else
        let log = ExtensionLogger.shared
        log.log("========================================")
        log.log("🚀 EXTENSION INIT - SampleHandler created")
        log.log("========================================")
        log.log("Bundle ID: \(Bundle.main.bundleIdentifier ?? "unknown")")
        log.log("App Group: \(appGroup)")
        
        loadTaskParams()
        
        log.log("Initialization complete")
    }
    
    private func loadTaskParams() {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            NSLog("[BroadcastExtension] ⚠️ Failed to access App Group")
            return
        }
        
        tenantId = defaults.string(forKey: "tenantId")
        campaignId = defaults.string(forKey: "campaignId")
        taskId = defaults.string(forKey: "taskId")
        stepId = defaults.string(forKey: "stepId")
        
        // Load API base URL from App Group (set by main app from .env)
        if let savedApiUrl = defaults.string(forKey: "apiBaseUrl"), !savedApiUrl.isEmpty {
            apiBaseUrl = savedApiUrl
        }
        
        // Load chunk duration (default 5 seconds)
        let savedDuration = defaults.double(forKey: "chunkDuration")
        if savedDuration > 0 {
            chunkDuration = savedDuration
        }
        
        NSLog("[BroadcastExtension] Config loaded:")
        NSLog("[BroadcastExtension]   apiBaseUrl: \(apiBaseUrl)")
        NSLog("[BroadcastExtension]   tenantId: \(tenantId ?? "nil")")
        NSLog("[BroadcastExtension]   campaignId: \(campaignId ?? "nil")")
        NSLog("[BroadcastExtension]   taskId: \(taskId ?? "nil")")
        NSLog("[BroadcastExtension]   stepId: \(stepId ?? "nil")")
        NSLog("[BroadcastExtension]   chunkDuration: \(chunkDuration)s")
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
        log.clear() // Clear old logs on new session
        
        log.log("*******************************************")
        log.log("🎬 BROADCAST STARTED!")
        log.log("*******************************************")
        log.log("Extension is running!")
        log.log("Setup info: \(String(describing: setupInfo))")
        
        // Generate recording ID
        recordingId = UUID().uuidString
        startTime = Date()
        lastChunkTime = Date()
        chunkIndex = 0
        frameCount = 0
        completedChunkURLs = []
        pendingUploads = 0
        
        log.log("✅ Recording initialized")
        log.log("Recording ID: \(recordingId ?? "unknown")")
        log.log("API Base URL: \(apiBaseUrl)")
        log.log("Upload Endpoint: \(uploadEndpoint)")
        
        // Check if task params are set
        log.log("-------- TASK PARAMS --------")
        log.log("tenantId: \(tenantId ?? "NOT SET")")
        log.log("campaignId: \(campaignId ?? "NOT SET")")
        log.log("taskId: \(taskId ?? "NOT SET")")
        log.log("stepId: \(stepId ?? "NOT SET")")
        log.log("chunkDuration: \(chunkDuration)s")
        log.log("-----------------------------")
        
        if tenantId == nil || campaignId == nil || taskId == nil || stepId == nil {
            log.log("⚠️ WARNING: Task params not set!")
            log.log("⚠️ Chunks will NOT be uploaded!")
            log.log("⚠️ Open app via deep link first!")
        } else {
            log.log("✅ Task params OK - uploads enabled")
        }
        
        // Start first chunk
        log.log("Starting first chunk...")
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
        
        log.log("🛑 Broadcast finished")
        log.log("Total duration: \(String(format: "%.1f", duration))s")
        log.log("Total frames: \(frameCount)")
        log.log("Total chunks: \(chunkIndex + 1)")
        
        // Finalize and upload last chunk
        finalizeCurrentChunk(isFinal: true)
        
        // Wait a moment for uploads to start, then merge and save
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.mergeAndSaveToPhotos()
        }
    }
    
    // MARK: - Sample Processing
    
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard isWriting, let writer = assetWriter else { 
            // Log occasionally if not writing
            if frameCount % 100 == 0 {
                NSLog("[BroadcastExtension] ⚠️ processSampleBuffer: Not writing (isWriting=\(isWriting), writer=\(assetWriter != nil ? "exists" : "nil"))")
            }
            return 
        }
        guard writer.status == .writing else { 
            NSLog("[BroadcastExtension] ⚠️ Writer status: \(writer.status.rawValue) (not writing)")
            return 
        }
        
        switch sampleBufferType {
        case .video:
            frameCount += 1
            if let input = videoInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
            // Log every 60 frames (about every second at 60fps)
            if frameCount % 60 == 0 {
                let elapsed = startTime.map { Date().timeIntervalSince($0) } ?? 0
                NSLog("[BroadcastExtension] 📹 Frames: \(frameCount), Elapsed: \(String(format: "%.1f", elapsed))s, Chunk: \(chunkIndex)")
            }
            
        case .audioApp, .audioMic:
            if let input = audioInput, input.isReadyForMoreMediaData {
                input.append(sampleBuffer)
            }
            
        @unknown default:
            break
        }
        
        // Check if it's time for a new chunk
        checkChunkDuration()
    }
    
    // MARK: - Chunk Management
    
    private func checkChunkDuration() {
        guard let lastChunk = lastChunkTime else { return }
        
        let elapsed = Date().timeIntervalSince(lastChunk)
        if elapsed >= chunkDuration {
            // Time for a new chunk
            NSLog("[BroadcastExtension] ⏱️ Chunk duration reached (\(String(format: "%.1f", elapsed))s) - finalizing chunk \(chunkIndex)")
            finalizeCurrentChunk(isFinal: false)
            startNewChunk()
            lastChunkTime = Date()
        }
    }
    
    private func startNewChunk() {
        // Use App Group container for chunks so they persist
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            NSLog("[BroadcastExtension] ❌ Failed to get App Group container")
            return
        }
        
        let chunksDir = containerURL.appendingPathComponent("chunks")
        try? FileManager.default.createDirectory(at: chunksDir, withIntermediateDirectories: true)
        
        let chunkFileName = "chunk_\(recordingId ?? "unknown")_\(chunkIndex).mp4"
        currentChunkURL = chunksDir.appendingPathComponent(chunkFileName)
        
        guard let url = currentChunkURL else { return }
        
        // Remove existing file if any
        try? FileManager.default.removeItem(at: url)
        
        do {
            assetWriter = try AVAssetWriter(url: url, fileType: .mp4)
            
            // Video input settings
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
            
            // Audio input settings
            let audioSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 128000
            ]
            
            audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            audioInput?.expectsMediaDataInRealTime = true
            
            if let videoInput = videoInput, assetWriter?.canAdd(videoInput) == true {
                assetWriter?.add(videoInput)
            }
            
            if let audioInput = audioInput, assetWriter?.canAdd(audioInput) == true {
                assetWriter?.add(audioInput)
            }
            
            assetWriter?.startWriting()
            assetWriter?.startSession(atSourceTime: .zero)
            isWriting = true
            
            NSLog("[BroadcastExtension] Started chunk \(chunkIndex) at \(url.path)")
            
        } catch {
            NSLog("[BroadcastExtension] Failed to create asset writer: \(error)")
        }
    }
    
    private func finalizeCurrentChunk(isFinal: Bool) {
        NSLog("[BroadcastExtension] 📦 finalizeCurrentChunk called (isFinal: \(isFinal))")
        
        guard isWriting else { 
            NSLog("[BroadcastExtension] ⚠️ Not writing - nothing to finalize")
            return 
        }
        isWriting = false
        
        NSLog("[BroadcastExtension] Marking inputs as finished...")
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        
        let currentIndex = chunkIndex
        let chunkURL = currentChunkURL
        
        NSLog("[BroadcastExtension] Finishing asset writer for chunk \(currentIndex)...")
        NSLog("[BroadcastExtension] Chunk URL: \(chunkURL?.absoluteString ?? "nil")")
        
        assetWriter?.finishWriting { [weak self] in
            guard let self = self, let url = chunkURL else { 
                NSLog("[BroadcastExtension] ❌ finishWriting callback: self or URL is nil!")
                return 
            }
            
            // Check writer status
            if let writer = self.assetWriter {
                NSLog("[BroadcastExtension] Writer status after finish: \(writer.status.rawValue)")
                if writer.status == .failed {
                    NSLog("[BroadcastExtension] ❌ Writer error: \(writer.error?.localizedDescription ?? "unknown")")
                }
            }
            
            // Check file
            let fileExists = FileManager.default.fileExists(atPath: url.path)
            NSLog("[BroadcastExtension] ✅ Chunk \(currentIndex) finalized")
            NSLog("[BroadcastExtension] File exists: \(fileExists)")
            
            if fileExists {
                if let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
                   let size = attrs[.size] as? Int64 {
                    NSLog("[BroadcastExtension] File size: \(size) bytes (\(size / 1024) KB)")
                }
                // Save URL for later merging
                self.completedChunkURLs.append(url)
            }
            
            // Upload the chunk
            NSLog("[BroadcastExtension] Calling uploadChunk...")
            self.uploadChunk(fileURL: url, chunkIndex: currentIndex, isFinal: isFinal)
        }
        
        chunkIndex += 1
    }
    
    // MARK: - Merge and Save to Photos
    
    private func mergeAndSaveToPhotos() {
        let log = ExtensionLogger.shared
        log.log("📼 Starting merge and save to Photos...")
        log.log("Chunks to merge: \(completedChunkURLs.count)")
        
        guard !completedChunkURLs.isEmpty else {
            log.log("⚠️ No chunks to merge")
            return
        }
        
        // Sort chunks by index (extracted from filename)
        let sortedChunks = completedChunkURLs.sorted { url1, url2 in
            let name1 = url1.lastPathComponent
            let name2 = url2.lastPathComponent
            return name1 < name2
        }
        
        log.log("Sorted chunks: \(sortedChunks.map { $0.lastPathComponent })")
        
        // Create merged video
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            log.log("❌ Failed to get App Group container")
            return
        }
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = dateFormatter.string(from: Date())
        let mergedFileName = "LiveCapture_\(timestamp).mp4"
        let mergedURL = containerURL.appendingPathComponent(mergedFileName)
        
        // Remove existing file
        try? FileManager.default.removeItem(at: mergedURL)
        
        log.log("Merging to: \(mergedURL.path)")
        
        // Use AVMutableComposition to merge videos
        let composition = AVMutableComposition()
        
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            log.log("❌ Failed to create composition tracks")
            cleanupChunks()
            return
        }
        
        var currentTime = CMTime.zero
        var hasAudio = false
        
        for chunkURL in sortedChunks {
            let asset = AVAsset(url: chunkURL)
            
            do {
                // Add video track
                if let assetVideoTrack = asset.tracks(withMediaType: .video).first {
                    let duration = asset.duration
                    try videoTrack.insertTimeRange(
                        CMTimeRange(start: .zero, duration: duration),
                        of: assetVideoTrack,
                        at: currentTime
                    )
                    
                    // Add audio track if exists
                    if let assetAudioTrack = asset.tracks(withMediaType: .audio).first {
                        try audioTrack.insertTimeRange(
                            CMTimeRange(start: .zero, duration: duration),
                            of: assetAudioTrack,
                            at: currentTime
                        )
                        hasAudio = true
                    }
                    
                    currentTime = CMTimeAdd(currentTime, duration)
                    log.log("Added chunk: \(chunkURL.lastPathComponent), duration: \(CMTimeGetSeconds(duration))s")
                }
            } catch {
                log.log("⚠️ Failed to add chunk \(chunkURL.lastPathComponent): \(error)")
            }
        }
        
        // Remove empty audio track if no audio was added
        if !hasAudio {
            composition.removeTrack(audioTrack)
        }
        
        log.log("Total merged duration: \(CMTimeGetSeconds(currentTime))s")
        
        // Export merged video
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            log.log("❌ Failed to create export session")
            cleanupChunks()
            return
        }
        
        exporter.outputURL = mergedURL
        exporter.outputFileType = .mp4
        exporter.shouldOptimizeForNetworkUse = true
        
        log.log("Starting export...")
        
        exporter.exportAsynchronously { [weak self] in
            guard let self = self else { return }
            
            switch exporter.status {
            case .completed:
                log.log("✅ Export completed!")
                
                // Check file size
                if let attrs = try? FileManager.default.attributesOfItem(atPath: mergedURL.path),
                   let size = attrs[.size] as? Int64 {
                    log.log("Merged file size: \(size / 1024 / 1024) MB")
                }
                
                // Save to Photos
                self.saveToPhotoLibrary(url: mergedURL)
                
            case .failed:
                log.log("❌ Export failed: \(exporter.error?.localizedDescription ?? "unknown")")
                self.cleanupChunks()
                
            case .cancelled:
                log.log("⚠️ Export cancelled")
                self.cleanupChunks()
                
            default:
                log.log("⚠️ Export status: \(exporter.status.rawValue)")
            }
        }
    }
    
    private func saveToPhotoLibrary(url: URL) {
        let log = ExtensionLogger.shared
        log.log("📱 Saving to Photo Library...")
        
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self = self else { return }
            
            switch status {
            case .authorized, .limited:
                log.log("✅ Photo library access granted")
                
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
                }) { success, error in
                    if success {
                        log.log("🎉 Video saved to Photos successfully!")
                        
                        // Notify user via App Group
                        if let defaults = UserDefaults(suiteName: self.appGroup) {
                            defaults.set(true, forKey: "videoSavedToPhotos")
                            defaults.set(Date().description, forKey: "videoSavedAt")
                            defaults.synchronize()
                        }
                    } else {
                        log.log("❌ Failed to save to Photos: \(error?.localizedDescription ?? "unknown")")
                    }
                    
                    // Clean up merged file and chunks
                    try? FileManager.default.removeItem(at: url)
                    self.cleanupChunks()
                }
                
            case .denied, .restricted:
                log.log("❌ Photo library access denied")
                // Still clean up files
                try? FileManager.default.removeItem(at: url)
                self.cleanupChunks()
                
            case .notDetermined:
                log.log("⚠️ Photo library access not determined")
                self.cleanupChunks()
                
            @unknown default:
                log.log("⚠️ Unknown photo library status")
                self.cleanupChunks()
            }
        }
    }
    
    private func cleanupChunks() {
        let log = ExtensionLogger.shared
        log.log("🗑️ Cleaning up chunk files...")
        
        for url in completedChunkURLs {
            do {
                try FileManager.default.removeItem(at: url)
                log.log("Deleted: \(url.lastPathComponent)")
            } catch {
                log.log("⚠️ Failed to delete \(url.lastPathComponent): \(error)")
            }
        }
        
        // Also clean up chunks directory
        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            let chunksDir = containerURL.appendingPathComponent("chunks")
            try? FileManager.default.removeItem(at: chunksDir)
        }
        
        completedChunkURLs = []
        log.log("✅ Cleanup complete")
    }
    
    // MARK: - Upload
    
    private func uploadChunk(fileURL: URL, chunkIndex: Int, isFinal: Bool) {
        let log = ExtensionLogger.shared
        
        log.log("========== UPLOAD START ==========")
        log.log("uploadChunk() called")
        log.log("fileURL: \(fileURL.absoluteString)")
        log.log("chunkIndex: \(chunkIndex)")
        log.log("isFinal: \(isFinal)")
        
        // Check if file exists
        let fileExists = FileManager.default.fileExists(atPath: fileURL.path)
        log.log("File exists: \(fileExists)")
        
        if fileExists {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
               let fileSize = attrs[.size] as? Int64 {
                log.log("File size: \(fileSize) bytes (\(fileSize / 1024) KB)")
            }
        }
        
        guard let tenantId = tenantId,
              let campaignId = campaignId,
              let taskId = taskId,
              let stepId = stepId,
              let recordingId = recordingId else {
            log.log("⚠️ MISSING PARAMS - skipping upload")
            log.log("  tenantId: \(self.tenantId ?? "NIL")")
            log.log("  campaignId: \(self.campaignId ?? "NIL")")
            log.log("  taskId: \(self.taskId ?? "NIL")")
            log.log("  stepId: \(self.stepId ?? "NIL")")
            log.log("  recordingId: \(self.recordingId ?? "NIL")")
            // Don't clean up - we need files for merging
            return
        }
        
        let fullUrlString = "\(apiBaseUrl)\(uploadEndpoint)"
        log.log("Full URL: \(fullUrlString)")
        
        guard let url = URL(string: fullUrlString) else {
            log.log("❌ INVALID URL - cannot create URL from: \(fullUrlString)")
            return
        }
        
        log.log("📤 PREPARING UPLOAD...")
        log.log("-------- REQUEST DATA --------")
        log.log("tenant_id: \(tenantId)")
        log.log("campaign_id: \(campaignId)")
        log.log("task_id: \(taskId)")
        log.log("step_id: \(stepId)")
        log.log("recording_id: \(recordingId)")
        log.log("chunk_index: \(chunkIndex)")
        log.log("is_final: \(isFinal)")
        log.log("-----------------------------")
        
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60
        
        var body = Data()
        
        // Add file
        if let fileData = try? Data(contentsOf: fileURL) {
            log.log("Video data loaded: \(fileData.count) bytes")
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"file\"; filename=\"chunk_\(chunkIndex).mp4\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: video/mp4\r\n\r\n".data(using: .utf8)!)
            body.append(fileData)
            body.append("\r\n".data(using: .utf8)!)
        } else {
            log.log("❌ FAILED to load video data from file!")
        }
        
        // Add metadata fields
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
        
        log.log("Total request body size: \(body.count) bytes (\(body.count / 1024) KB)")
        log.log("🚀 SENDING REQUEST to \(url.absoluteString)...")
        
        // Update status to uploading
        updateUploadStatus(chunkIndex: chunkIndex, status: "uploading")
        
        let uploadStartTime = Date()
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let elapsed = Date().timeIntervalSince(uploadStartTime)
            log.log("-------- RESPONSE --------")
            log.log("Request took: \(String(format: "%.2f", elapsed)) seconds")
            
            // Don't delete file here - we need it for merging
            
            if let error = error {
                log.log("❌ NETWORK ERROR!")
                log.log("Error type: \(type(of: error))")
                log.log("Error description: \(error.localizedDescription)")
                if let nsError = error as NSError? {
                    log.log("Error domain: \(nsError.domain)")
                    log.log("Error code: \(nsError.code)")
                }
                self?.updateUploadStatus(chunkIndex: chunkIndex, status: "failed", error: error.localizedDescription)
                log.log("========== UPLOAD FAILED ==========")
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                log.log("HTTP Status Code: \(httpResponse.statusCode)")
                
                let responseText = data.flatMap { String(data: $0, encoding: .utf8) } ?? "No response body"
                log.log("Response Body: \(responseText)")
                
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    log.log("✅ SUCCESS! Chunk \(chunkIndex) uploaded")
                    self?.updateUploadStatus(chunkIndex: chunkIndex, status: "success")
                    log.log("========== UPLOAD SUCCESS ==========")
                } else {
                    log.log("❌ HTTP ERROR!")
                    log.log("Status: \(httpResponse.statusCode)")
                    log.log("Body: \(responseText)")
                    self?.updateUploadStatus(chunkIndex: chunkIndex, status: "failed", error: "HTTP \(httpResponse.statusCode): \(responseText)")
                    log.log("========== UPLOAD FAILED ==========")
                }
            } else {
                log.log("⚠️ Response is not HTTPURLResponse!")
                log.log("========== UPLOAD UNKNOWN ==========")
            }
        }
        
        task.resume()
        log.log("Request task started (async)")
    }
}
