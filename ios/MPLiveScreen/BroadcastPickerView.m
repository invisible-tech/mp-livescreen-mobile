#import <React/RCTViewManager.h>

// Enable New Architecture interop for View Components
#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTFabricComponentsPlugins.h>
#endif

@interface RCT_EXTERN_MODULE(BroadcastPickerViewManager, RCTViewManager)
@end

// Register component for Fabric interop
#ifdef RCT_NEW_ARCH_ENABLED
Class<RCTComponentViewProtocol> BroadcastPickerViewCls(void)
{
  return nil; // Will use Paper component via interop
}
#endif

