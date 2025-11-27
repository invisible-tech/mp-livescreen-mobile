//
//  BroadcastPickerView.swift
//  MPLiveScreen
//
//  Native view for RPSystemBroadcastPickerView
//  This provides the system broadcast picker UI like Zoom uses
//

import UIKit
import ReplayKit

@objc(BroadcastPickerViewManager)
class BroadcastPickerViewManager: RCTViewManager {
    
    override static func moduleName() -> String! {
        return "BroadcastPickerView"
    }
    
    override func view() -> UIView! {
        NSLog("[BroadcastPickerViewManager] Creating BroadcastPickerView")
        return BroadcastPickerView()
    }
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
}

class BroadcastPickerView: UIView {
    
    private var broadcastPicker: RPSystemBroadcastPickerView!
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        NSLog("[BroadcastPickerView] Initializing with frame: \(frame)")
        setupBroadcastPicker()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupBroadcastPicker()
    }
    
    private func setupBroadcastPicker() {
        // Create the system broadcast picker
        broadcastPicker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        broadcastPicker.preferredExtension = "com.marketplace.livescreen.broadcast"
        broadcastPicker.showsMicrophoneButton = false
        
        NSLog("[BroadcastPickerView] Configured for extension: com.marketplace.livescreen.broadcast")
        
        // Style the picker button
        broadcastPicker.translatesAutoresizingMaskIntoConstraints = false
        broadcastPicker.backgroundColor = UIColor.systemRed
        broadcastPicker.layer.cornerRadius = 44
        broadcastPicker.clipsToBounds = true
        
        // Make the button inside more visible
        if let button = broadcastPicker.subviews.first as? UIButton {
            button.imageView?.tintColor = .white
            button.tintColor = .white
            
            // Scale up the image
            let config = UIImage.SymbolConfiguration(pointSize: 32, weight: .medium)
            let image = UIImage(systemName: "record.circle", withConfiguration: config)
            button.setImage(image, for: .normal)
        }
        
        addSubview(broadcastPicker)
        
        // Center the picker in the view
        NSLayoutConstraint.activate([
            broadcastPicker.centerXAnchor.constraint(equalTo: centerXAnchor),
            broadcastPicker.centerYAnchor.constraint(equalTo: centerYAnchor),
            broadcastPicker.widthAnchor.constraint(equalToConstant: 88),
            broadcastPicker.heightAnchor.constraint(equalToConstant: 88)
        ])
        
        // Add shadow
        layer.shadowColor = UIColor.systemRed.cgColor
        layer.shadowOffset = CGSize(width: 0, height: 8)
        layer.shadowOpacity = 0.4
        layer.shadowRadius = 16
    }
    
    override func layoutSubviews() {
        super.layoutSubviews()
        NSLog("[BroadcastPickerView] layoutSubviews called, bounds: \(bounds)")
    }
}

