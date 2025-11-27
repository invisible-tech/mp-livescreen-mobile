#import <React/RCTBridgeModule.h>

// Enable New Architecture interop
#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTTurboModuleRegistry.h>
#endif

@interface RCT_EXTERN_MODULE(ScreenCaptureModule, NSObject)

RCT_EXTERN_METHOD(startBroadcast:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopBroadcast:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isRecording:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end

