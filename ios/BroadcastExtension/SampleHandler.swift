//
//  SampleHandler.swift
//  BroadcastExtension
//
//  Broadcast Upload Extension for MP Live Screen
//  Handles system-wide screen capture like Zoom
//
//  LOCAL_MODE: When true, just captures and logs (no backend needed)
//  Set to false when backend is ready for production
//

import ReplayKit
import Foundation

class SampleHandler: RPBroadcastSampleHandler {
    
    // MARK: - Configuration
    
    /// Set to false when backend is ready
    private let LOCAL_MODE = true
    
    // MARK: - Properties
    
    private var recordingId: String?
    private var chunkIndex: Int = 0
    private var startTime: Date?
    private var lastChunkTime: Date?
    private var lastLogTime: Date?
    private let chunkDuration: TimeInterval = 5.0 // 5 seconds
    
    private var frameCount: Int = 0
    private var videoBuffer: [CMSampleBuffer] = []
    private var audioBuffer: [CMSampleBuffer] = []
    
    private let apiBaseUrl: String
    private let apiKey: String
    
    // MARK: - Initialization
    
    override init() {
        // Read from App Group shared defaults
        let appGroup = "group.com.marketplace.livescreen"
        let defaults = UserDefaults(suiteName: appGroup)
        
        self.apiBaseUrl = defaults?.string(forKey: "apiBaseUrl") ?? "https://vdi-dev.invsta.systems"
        self.apiKey = defaults?.string(forKey: "apiKey") ?? ""
        
        super.init()
        
        NSLog("[BroadcastExtension] Initialized - LOCAL_MODE: \(LOCAL_MODE)")
    }
    
    // MARK: - Broadcast Lifecycle
    
    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        NSLog("[BroadcastExtension] 🎬 Broadcast starting...")
        
        if LOCAL_MODE {
            // LOCAL MODE: Just start capturing without backend
            self.recordingId = "local-\(Int(Date().timeIntervalSince1970))"
            self.startTime = Date()
            self.lastChunkTime = Date()
            self.lastLogTime = Date()
            self.chunkIndex = 0
            self.frameCount = 0
            
            NSLog("[BroadcastExtension] ✅ Recording started in LOCAL MODE")
            NSLog("[BroadcastExtension] Recording ID: \(self.recordingId ?? "unknown")")
            return
        }
        
        // BACKEND MODE: Start recording session with backend
        startRecordingSession { [weak self] recordingId in
            guard let self = self else { return }
            
            if let id = recordingId {
                self.recordingId = id
                self.startTime = Date()
                self.lastChunkTime = Date()
                self.chunkIndex = 0
                
                NSLog("[BroadcastExtension] Recording started with ID: \(id)")
            } else {
                // Failed to start session
                self.finishBroadcastWithError(NSError(
                    domain: "com.marketplace.livescreen",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to start recording session"]
                ))
            }
        }
    }
    
    override func broadcastPaused() {
        NSLog("[BroadcastExtension] ⏸️ Broadcast paused")
    }
    
    override func broadcastResumed() {
        NSLog("[BroadcastExtension] ▶️ Broadcast resumed")
    }
    
    override func broadcastFinished() {
        let duration = startTime.map { Date().timeIntervalSince($0) } ?? 0
        NSLog("[BroadcastExtension] 🛑 Broadcast finished")
        NSLog("[BroadcastExtension] Total duration: \(String(format: "%.1f", duration))s")
        NSLog("[BroadcastExtension] Total frames captured: \(frameCount)")
        NSLog("[BroadcastExtension] Total chunks: \(chunkIndex)")
        
        if !LOCAL_MODE {
            // Upload any remaining data
            flushBuffers()
            // End recording session
            endRecordingSession()
        }
    }
    
    // MARK: - Sample Processing
    
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        switch sampleBufferType {
        case .video:
            processVideoSample(sampleBuffer)
            
        case .audioApp:
            // App audio
            processAudioSample(sampleBuffer, isApp: true)
            
        case .audioMic:
            // Microphone audio
            processAudioSample(sampleBuffer, isApp: false)
            
        @unknown default:
            break
        }
        
        if LOCAL_MODE {
            // LOCAL MODE: Log stats periodically
            logStatsIfNeeded()
        } else {
            // BACKEND MODE: Check if it's time to upload a chunk
            checkAndUploadChunk()
        }
    }
    
    // MARK: - Private Methods
    
    private func processVideoSample(_ sampleBuffer: CMSampleBuffer) {
        frameCount += 1
        
        if !LOCAL_MODE {
            videoBuffer.append(sampleBuffer)
        }
        
        // In LOCAL MODE, we're just counting frames (not buffering to save memory)
    }
    
    private func processAudioSample(_ sampleBuffer: CMSampleBuffer, isApp: Bool) {
        if !LOCAL_MODE {
            audioBuffer.append(sampleBuffer)
        }
    }
    
    private func logStatsIfNeeded() {
        guard let lastLog = lastLogTime else { return }
        
        let elapsed = Date().timeIntervalSince(lastLog)
        
        // Log stats every 5 seconds
        if elapsed >= 5.0 {
            let totalElapsed = startTime.map { Date().timeIntervalSince($0) } ?? 0
            let fps = Double(frameCount) / totalElapsed
            
            NSLog("[BroadcastExtension] 📊 Stats: \(frameCount) frames, \(String(format: "%.1f", fps)) fps, \(String(format: "%.1f", totalElapsed))s elapsed")
            
            lastLogTime = Date()
            chunkIndex += 1 // Count "virtual" chunks for stats
        }
    }
    
    private func checkAndUploadChunk() {
        guard let lastChunk = lastChunkTime else { return }
        
        let elapsed = Date().timeIntervalSince(lastChunk)
        
        if elapsed >= chunkDuration {
            uploadChunk()
            lastChunkTime = Date()
        }
    }
    
    private func uploadChunk() {
        guard let recordingId = recordingId else { return }
        guard !videoBuffer.isEmpty else { return }
        
        let currentChunkIndex = chunkIndex
        chunkIndex += 1
        
        // Convert buffers to data
        // In production, you'd encode these to a proper video format (H.264)
        let chunkData = createChunkData()
        
        // Clear buffers
        videoBuffer.removeAll()
        audioBuffer.removeAll()
        
        // Upload chunk
        uploadChunkData(chunkData, chunkIndex: currentChunkIndex, recordingId: recordingId)
    }
    
    private func flushBuffers() {
        if !videoBuffer.isEmpty {
            uploadChunk()
        }
    }
    
    private func createChunkData() -> Data {
        // Placeholder - In production, encode video/audio samples to H.264/AAC
        // Using AVAssetWriter or VideoToolbox
        // This is a simplified version
        
        let timestamp = Date().timeIntervalSince1970
        let metadata: [String: Any] = [
            "timestamp": timestamp,
            "videoFrames": videoBuffer.count,
            "audioFrames": audioBuffer.count
        ]
        
        return try! JSONSerialization.data(withJSONObject: metadata, options: [])
    }
    
    // MARK: - Network Methods
    
    private func startRecordingSession(completion: @escaping (String?) -> Void) {
        guard let url = URL(string: "\(apiBaseUrl)/api/v1/recordings/start") else {
            completion(nil)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        
        let body: [String: Any] = [
            "deviceId": UIDevice.current.identifierForVendor?.uuidString ?? "unknown",
            "platform": "ios",
            "quality": "1080p",
            "frameRate": 60
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let recordingId = json["recordingId"] as? String else {
                completion(nil)
                return
            }
            
            completion(recordingId)
        }
        
        task.resume()
    }
    
    private func uploadChunkData(_ data: Data, chunkIndex: Int, recordingId: String) {
        guard let url = URL(string: "\(apiBaseUrl)/api/v1/recordings/\(recordingId)/chunk") else {
            return
        }
        
        let boundary = UUID().uuidString
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        
        var body = Data()
        
        // Add chunk file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"chunk\"; filename=\"chunk_\(chunkIndex).mp4\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: video/mp4\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n".data(using: .utf8)!)
        
        // Add chunk index
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"chunkIndex\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(chunkIndex)\r\n".data(using: .utf8)!)
        
        // Add timestamp
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"timestamp\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(Date().timeIntervalSince1970)\r\n".data(using: .utf8)!)
        
        // Add duration
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"duration\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(Int(chunkDuration * 1000))\r\n".data(using: .utf8)!)
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                NSLog("[BroadcastExtension] Chunk upload failed: \(error.localizedDescription)")
            } else {
                NSLog("[BroadcastExtension] Chunk \(chunkIndex) uploaded successfully")
            }
        }
        
        task.resume()
    }
    
    private func endRecordingSession() {
        guard let recordingId = recordingId else { return }
        guard let url = URL(string: "\(apiBaseUrl)/api/v1/recordings/\(recordingId)/end") else {
            return
        }
        
        let duration = startTime.map { Date().timeIntervalSince($0) * 1000 } ?? 0
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        
        let body: [String: Any] = [
            "totalChunks": chunkIndex,
            "totalDuration": Int(duration)
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        
        let task = URLSession.shared.dataTask(with: request) { _, _, _ in
            NSLog("[BroadcastExtension] Recording session ended")
        }
        
        task.resume()
    }
}

