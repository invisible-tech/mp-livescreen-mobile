import Foundation
import ReplayKit

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
