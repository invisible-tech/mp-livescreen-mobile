//
//  SampleHandler.swift
//  BroadcastExtension
//
//  MINIMAL TEST VERSION - to verify extension loads
//

import ReplayKit

@objc(SampleHandler)
class SampleHandler: RPBroadcastSampleHandler {
    
    let appGroup = "group.com.marketplace.live.screen"
    
    override init() {
        // Write IMMEDIATELY to UserDefaults - simplest possible test
        if let defaults = UserDefaults(suiteName: "group.com.marketplace.live.screen") {
            defaults.set(true, forKey: "extension_did_init")
            defaults.set("INIT: \(Date())", forKey: "extension_last_init")
            defaults.synchronize()
        }
        
        super.init()
    }
    
    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        // Write to UserDefaults
        if let defaults = UserDefaults(suiteName: appGroup) {
            defaults.set("STARTED: \(Date())", forKey: "extension_last_init")
            defaults.set(true, forKey: "extension_did_start")
            defaults.synchronize()
        }
    }
    
    override func broadcastPaused() {
        // Do nothing
    }
    
    override func broadcastResumed() {
        // Do nothing
    }
    
    override func broadcastFinished() {
        // Write to UserDefaults
        if let defaults = UserDefaults(suiteName: appGroup) {
            defaults.set("FINISHED: \(Date())", forKey: "extension_last_init")
            defaults.set(true, forKey: "extension_did_finish")
            defaults.synchronize()
        }
    }
    
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        // Do nothing - just receive samples
    }
}
