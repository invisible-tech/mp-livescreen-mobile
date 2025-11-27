import Foundation
import ReplayKit

@objc(ScreenCaptureModule)
class ScreenCaptureModule: NSObject {
  
  private var isRecordingState = false
  
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
}

