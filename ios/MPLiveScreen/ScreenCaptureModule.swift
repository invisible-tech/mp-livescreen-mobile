import Foundation
import ReplayKit
import AVFoundation
import Photos

@objc(ScreenCaptureModule)
class ScreenCaptureModule: NSObject {
  
  private var isRecordingState = false
  private let appGroup = "group.com.marketplace.live.screen"
  
  @objc
  static func moduleName() -> String! {
    return "ScreenCaptureModule"
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  // MARK: - Permissions
  
  /// Request microphone permission (needed for voice recording during screen capture)
  @objc
  func requestMicrophonePermission(_ resolve: @escaping RCTPromiseResolveBlock,
                                    reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] Requesting microphone permission")
    
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      NSLog("[ScreenCaptureModule] Microphone permission: \(granted ? "granted" : "denied")")
      resolve(granted)
    }
  }
  
  /// Request photo library permission (needed to save recordings)
  @objc
  func requestPhotoLibraryPermission(_ resolve: @escaping RCTPromiseResolveBlock,
                                      reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] Requesting photo library permission")
    
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      let granted = status == .authorized || status == .limited
      NSLog("[ScreenCaptureModule] Photo library permission: \(granted ? "granted" : "denied") (status: \(status.rawValue))")
      resolve(granted)
    }
  }
  
  /// Request all required permissions at once
  @objc
  func requestAllPermissions(_ resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] Requesting all permissions")
    
    let group = DispatchGroup()
    var micGranted = false
    var photoGranted = false
    
    // Request microphone
    group.enter()
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      micGranted = granted
      group.leave()
    }
    
    // Request photo library
    group.enter()
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      photoGranted = status == .authorized || status == .limited
      group.leave()
    }
    
    group.notify(queue: .main) {
      let result: [String: Any] = [
        "microphone": micGranted,
        "photoLibrary": photoGranted
      ]
      NSLog("[ScreenCaptureModule] Permissions result: mic=\(micGranted), photo=\(photoGranted)")
      resolve(result)
    }
  }
  
  /// Check current permission status
  @objc
  func checkPermissions(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    let micStatus = AVAudioSession.sharedInstance().recordPermission
    let photoStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    
    let result: [String: Any] = [
      "microphone": micStatus == .granted,
      "microphoneStatus": micStatus.rawValue,
      "photoLibrary": photoStatus == .authorized || photoStatus == .limited,
      "photoLibraryStatus": photoStatus.rawValue
    ]
    
    resolve(result)
  }
  
  // MARK: - Video Saving
  
  /// Check if there's a pending video to save (left by extension)
  @objc
  func checkPendingVideo(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] checkPendingVideo called")
    
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      NSLog("[ScreenCaptureModule] Failed to access App Group")
      resolve(nil)
      return
    }
    
    // Check for pending video flag set by extension
    let pendingReady = defaults.bool(forKey: "pendingVideoReady")
    let pendingPath = defaults.string(forKey: "pendingVideoPath")
    
    NSLog("[ScreenCaptureModule] pendingReady: \(pendingReady), path: \(pendingPath ?? "nil")")
    
    if pendingReady, let path = pendingPath {
      // Verify file exists
      if FileManager.default.fileExists(atPath: path) {
        let url = URL(fileURLWithPath: path)
        if let attrs = try? FileManager.default.attributesOfItem(atPath: path),
           let size = attrs[.size] as? Int64 {
          let result: [String: Any] = [
            "path": path,
            "filename": url.lastPathComponent,
            "size": size
          ]
          NSLog("[ScreenCaptureModule] Found pending video: \(url.lastPathComponent), size: \(size) bytes")
          resolve(result)
          return
        }
      } else {
        // File doesn't exist, clear the flag
        NSLog("[ScreenCaptureModule] Pending video file not found, clearing flag")
        defaults.removeObject(forKey: "pendingVideoReady")
        defaults.removeObject(forKey: "pendingVideoPath")
        defaults.synchronize()
      }
    }
    
    // Fallback: look for any LiveCapture_ files
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
      resolve(nil)
      return
    }
    
    do {
      let files = try FileManager.default.contentsOfDirectory(at: containerURL, includingPropertiesForKeys: nil)
      let videoFiles = files.filter { $0.pathExtension == "mp4" && $0.lastPathComponent.hasPrefix("LiveCapture_") }
      
      NSLog("[ScreenCaptureModule] Found \(videoFiles.count) video files in App Group")
      
      if let latestVideo = videoFiles.sorted(by: { $0.lastPathComponent > $1.lastPathComponent }).first {
        let attrs = try FileManager.default.attributesOfItem(atPath: latestVideo.path)
        let size = attrs[.size] as? Int64 ?? 0
        
        let result: [String: Any] = [
          "path": latestVideo.path,
          "filename": latestVideo.lastPathComponent,
          "size": size
        ]
        NSLog("[ScreenCaptureModule] Found video: \(latestVideo.lastPathComponent)")
        resolve(result)
      } else {
        NSLog("[ScreenCaptureModule] No pending videos found")
        resolve(nil)
      }
    } catch {
      NSLog("[ScreenCaptureModule] Error checking pending video: \(error)")
      resolve(nil)
    }
  }
  
  /// Save pending video to Photo Library
  @objc
  func savePendingVideoToPhotos(_ resolve: @escaping RCTPromiseResolveBlock,
                                 reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] savePendingVideoToPhotos called")
    
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access App Group", nil)
      return
    }
    
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access UserDefaults", nil)
      return
    }
    
    // First check the pending path from extension
    var videoURL: URL? = nil
    
    if let pendingPath = defaults.string(forKey: "pendingVideoPath"),
       FileManager.default.fileExists(atPath: pendingPath) {
      videoURL = URL(fileURLWithPath: pendingPath)
      NSLog("[ScreenCaptureModule] Using pending path: \(pendingPath)")
    } else {
      // Fallback: find any LiveCapture_ files
      do {
        let files = try FileManager.default.contentsOfDirectory(at: containerURL, includingPropertiesForKeys: nil)
        let videoFiles = files.filter { $0.pathExtension == "mp4" && $0.lastPathComponent.hasPrefix("LiveCapture_") }
        videoURL = videoFiles.sorted(by: { $0.lastPathComponent > $1.lastPathComponent }).first
      } catch {
        NSLog("[ScreenCaptureModule] Error listing files: \(error)")
      }
    }
    
    guard let latestVideo = videoURL else {
      NSLog("[ScreenCaptureModule] No pending video found")
      resolve(false)
      return
    }
    
    NSLog("[ScreenCaptureModule] Saving video: \(latestVideo.lastPathComponent)")
    
    // Check photo library permission
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    guard status == .authorized || status == .limited else {
      NSLog("[ScreenCaptureModule] Photo library permission not granted: \(status.rawValue)")
      reject("PERMISSION_ERROR", "Photo library permission required. Status: \(status.rawValue)", nil)
      return
    }
    
    // Save to Photos
    PHPhotoLibrary.shared().performChanges({
      PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: latestVideo)
    }) { success, error in
      if success {
        NSLog("[ScreenCaptureModule] ✅ Video saved to Photos!")
        
        // Clean up the file
        try? FileManager.default.removeItem(at: latestVideo)
        
        // Clear flags
        defaults.removeObject(forKey: "pendingVideoReady")
        defaults.removeObject(forKey: "pendingVideoPath")
        defaults.removeObject(forKey: "pendingVideoTimestamp")
        defaults.synchronize()
        
        resolve(true)
      } else {
        NSLog("[ScreenCaptureModule] ❌ Failed to save to Photos: \(error?.localizedDescription ?? "unknown")")
        reject("SAVE_ERROR", error?.localizedDescription ?? "Failed to save video", error)
      }
    }
  }
  
  // MARK: - Broadcast Control
  
  @objc
  func startBroadcast(_ resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] startBroadcast called")
    DispatchQueue.main.async {
      self.isRecordingState = true
      NSLog("[ScreenCaptureModule] Broadcast state set to recording")
      resolve(nil)
    }
  }
  
  @objc
  func stopBroadcast(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] stopBroadcast called")
    DispatchQueue.main.async {
      self.isRecordingState = false
      NSLog("[ScreenCaptureModule] Broadcast state set to stopped")
      resolve(nil)
    }
  }
  
  @objc
  func isRecording(_ resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    resolve(isRecordingState)
  }
  
  // MARK: - Task Parameters
  
  /// Save task parameters to App Group for the Broadcast Extension to access
  @objc
  func setTaskParams(_ params: NSDictionary,
                     resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] setTaskParams called")
    
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      NSLog("[ScreenCaptureModule] Failed to access App Group")
      reject("APP_GROUP_ERROR", "Failed to access App Group", nil)
      return
    }
    
    // Save each parameter to the App Group
    if let tenantId = params["tenantId"] as? String {
      defaults.set(tenantId, forKey: "tenantId")
    }
    if let campaignId = params["campaignId"] as? String {
      defaults.set(campaignId, forKey: "campaignId")
    }
    if let campaignName = params["campaignName"] as? String {
      defaults.set(campaignName, forKey: "campaignName")
    }
    if let stepId = params["stepId"] as? String {
      defaults.set(stepId, forKey: "stepId")
    }
    if let taskId = params["taskId"] as? String {
      defaults.set(taskId, forKey: "taskId")
    }
    // Save API base URL (passed from JS .env config)
    if let apiBaseUrl = params["apiBaseUrl"] as? String {
      defaults.set(apiBaseUrl, forKey: "apiBaseUrl")
    }
    
    defaults.synchronize()
    
    NSLog("[ScreenCaptureModule] Task params saved to App Group")
    resolve(true)
  }
  
  /// Clear task parameters from App Group
  @objc
  func clearTaskParams(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[ScreenCaptureModule] clearTaskParams called")
    
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access App Group", nil)
      return
    }
    
    defaults.removeObject(forKey: "tenantId")
    defaults.removeObject(forKey: "campaignId")
    defaults.removeObject(forKey: "campaignName")
    defaults.removeObject(forKey: "stepId")
    defaults.removeObject(forKey: "taskId")
    defaults.removeObject(forKey: "uploadStatus")
    defaults.synchronize()
    
    NSLog("[ScreenCaptureModule] Task params cleared from App Group")
    resolve(true)
  }
  
  /// Set chunk duration in seconds
  @objc
  func setChunkDuration(_ seconds: Double,
                        resolve: @escaping RCTPromiseResolveBlock,
                        reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access App Group", nil)
      return
    }
    
    defaults.set(seconds, forKey: "chunkDuration")
    defaults.synchronize()
    
    NSLog("[ScreenCaptureModule] Chunk duration set to \(seconds)s")
    resolve(true)
  }
  
  /// Get upload status from Broadcast Extension
  @objc
  func getUploadStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access App Group", nil)
      return
    }
    
    if let status = defaults.dictionary(forKey: "uploadStatus") {
      resolve(status)
    } else {
      resolve(nil)
    }
  }
}
