#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ManagerCoreCommsService, RCTEventEmitter)

RCT_EXTERN_METHOD(startService)
RCT_EXTERN_METHOD(startAugmentosCoreService)
RCT_EXTERN_METHOD(stopService)
RCT_EXTERN_SYNCHRONOUS_METHOD(isServiceRunning)
RCT_EXTERN_METHOD(sendCommandToCore:(NSString *)jsonString)
RCT_EXTERN_METHOD(addListener:(NSString *)eventName)
RCT_EXTERN_METHOD(removeListeners:(NSInteger)count)

@end