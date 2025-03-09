#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface ManagerCoreCommsService : RCTEventEmitter <RCTBridgeModule>

// Method to emit messages to JavaScript
- (void)emitMessageToJS:(NSString *)eventName withMessage:(NSString *)message;

@end