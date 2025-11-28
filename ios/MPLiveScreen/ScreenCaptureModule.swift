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
      // For system-wide broadcast, we use RPSystemBroadcastPickerView
      // This is triggered from the UI side via the BroadcastPicker component
      // The actual broadcast is started by the user tapping the system picker
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
  
  /// Get extension logs from App Group file
  @objc
  func getExtensionLogs(_ resolve: @escaping RCTPromiseResolveBlock,
                        reject: @escaping RCTPromiseRejectBlock) {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access App Group container", nil)
      return
    }
    
    let logFileURL = containerURL.appendingPathComponent("extension_logs.txt")
    
    if FileManager.default.fileExists(atPath: logFileURL.path) {
      do {
        let logs = try String(contentsOf: logFileURL, encoding: .utf8)
        resolve(logs)
      } catch {
        reject("READ_ERROR", "Failed to read logs: \(error.localizedDescription)", error)
      }
    } else {
      resolve("No logs yet. Start a recording first.")
    }
  }
  
  /// Clear extension logs
  @objc
  func clearExtensionLogs(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access App Group container", nil)
      return
    }
    
    let logFileURL = containerURL.appendingPathComponent("extension_logs.txt")
    try? FileManager.default.removeItem(at: logFileURL)
    resolve(true)
  }
  
  /// Check if extension actually ran
  @objc
  func checkExtensionRan(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      resolve("❌ Cannot access App Group")
      return
    }
    
    let didInit = defaults.bool(forKey: "extension_did_init")
    let didStart = defaults.bool(forKey: "extension_did_start")
    let didFinish = defaults.bool(forKey: "extension_did_finish")
    let lastInit = defaults.string(forKey: "extension_last_init") ?? "never"
    
    var result = ""
    result += didInit ? "✅ init() called\n" : "❌ init() NOT called\n"
    result += didStart ? "✅ broadcastStarted() called\n" : "❌ broadcastStarted() NOT called\n"
    result += didFinish ? "✅ broadcastFinished() called\n" : "❌ broadcastFinished() NOT called\n"
    result += "\nLast status: \(lastInit)"
    
    if !didInit {
      result += "\n\n⚠️ Extension NEVER loaded!\nTry: Delete app → Clean Build → Reinstall"
    }
    
    resolve(result)
  }
  
  /// Reset extension ran flag
  @objc
  func resetExtensionFlag(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
      reject("APP_GROUP_ERROR", "Cannot access App Group", nil)
      return
    }
    
    defaults.removeObject(forKey: "extension_did_init")
    defaults.removeObject(forKey: "extension_last_init")
    defaults.synchronize()
    resolve(true)
  }
  
  /// Check extension configuration
  @objc
  func checkExtensionSetup(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    var diagnostics: [String] = []
    
    // Check App Group
    if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
      diagnostics.append("✅ App Group accessible: \(containerURL.path)")
    } else {
      diagnostics.append("❌ App Group NOT accessible!")
    }
    
    // Check if extension exists in bundle
    let mainBundle = Bundle.main
    if let pluginsPath = mainBundle.builtInPlugInsPath {
      diagnostics.append("📁 Plugins path: \(pluginsPath)")
      
      let extensionPath = pluginsPath + "/MPLiveScreen-Broadcast.appex"
      if FileManager.default.fileExists(atPath: extensionPath) {
        diagnostics.append("✅ Extension found at: \(extensionPath)")
        
        // Check extension bundle
        if let extBundle = Bundle(path: extensionPath) {
          diagnostics.append("✅ Extension bundle loaded")
          diagnostics.append("   Bundle ID: \(extBundle.bundleIdentifier ?? "unknown")")
          
          if let infoDict = extBundle.infoDictionary {
            if let nsExt = infoDict["NSExtension"] as? [String: Any] {
              diagnostics.append("   Extension Point: \(nsExt["NSExtensionPointIdentifier"] ?? "unknown")")
              diagnostics.append("   Principal Class: \(nsExt["NSExtensionPrincipalClass"] ?? "unknown")")
            }
          }
        } else {
          diagnostics.append("❌ Could not load extension bundle")
        }
      } else {
        diagnostics.append("❌ Extension NOT found! Expected at: \(extensionPath)")
      }
    } else {
      diagnostics.append("❌ Plugins path not found!")
    }
    
    resolve(diagnostics.joined(separator: "\n"))
  }
  
  /// Write a test log to verify App Group is working
  @objc
  func writeTestLog(_ resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
      reject("APP_GROUP_ERROR", "Failed to access App Group container. Check App Group entitlements.", nil)
      return
    }
    
    let logFileURL = containerURL.appendingPathComponent("extension_logs.txt")
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let testLog = """
    [\(timestamp)] ========================================
    [\(timestamp)] 🧪 TEST LOG FROM MAIN APP
    [\(timestamp)] ========================================
    [\(timestamp)] App Group: \(appGroup)
    [\(timestamp)] Container URL: \(containerURL.path)
    [\(timestamp)] Log File: \(logFileURL.path)
    [\(timestamp)] This proves the App Group is working!
    [\(timestamp)] If you see this but NOT extension logs,
    [\(timestamp)] you are selecting the WRONG app in the
    [\(timestamp)] broadcast picker. Select "MP LiveCapture"!
    [\(timestamp)] ========================================
    
    """
    
    do {
      if FileManager.default.fileExists(atPath: logFileURL.path) {
        let handle = try FileHandle(forWritingTo: logFileURL)
        handle.seekToEndOfFile()
        if let data = testLog.data(using: .utf8) {
          handle.write(data)
        }
        handle.closeFile()
      } else {
        try testLog.write(to: logFileURL, atomically: true, encoding: .utf8)
      }
      NSLog("[ScreenCaptureModule] Test log written to: \(logFileURL.path)")
      resolve(true)
    } catch {
      reject("WRITE_ERROR", "Failed to write test log: \(error.localizedDescription)", error)
    }
  }
}

