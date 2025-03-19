#import "ManagerCoreCommsService.h"
#import <React/RCTLog.h>

@implementation ManagerCoreCommsService
{
  bool hasListeners;
}

// Make this module available to JavaScript
RCT_EXPORT_MODULE();

+ (id)allocWithZone:(NSZone *)zone {
  static ManagerCoreCommsService *sharedInstance = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    sharedInstance = [super allocWithZone:zone];
  });
  return sharedInstance;
}

// Initialize the module
- (instancetype)init
{
  self = [super init];
  if (self) {
    // Initialize any properties here
  }
  return self;
}

// Required for RCTEventEmitter
- (NSArray<NSString *> *)supportedEvents
{
  return @[@"coreMessage", @"coreStatus"];
}

// Called when this module's first listener is added
-(void)startObserving {
  hasListeners = YES;
}

// Called when this module's last listener is removed
-(void)stopObserving {
  hasListeners = NO;
}

// Method to emit messages to JavaScript
- (void)emitMessageToJS:(NSString *)eventName withMessage:(NSString *)message
{
  if (hasListeners) {
    [self sendEventWithName:eventName body:message];
  }
}

// JavaScript methods
RCT_EXPORT_METHOD(startService)
{
  RCTLogInfo(@"ManagerCoreCommsService: startService called");
  // iOS doesn't have foreground services like Android
  // Instead, we would implement the equivalent functionality here
  // This might involve setting up background tasks or communication channels
}

RCT_EXPORT_METHOD(startAugmentosCoreService)
{
  RCTLogInfo(@"ManagerCoreCommsService: startAugmentosCoreService called");
  // Implement the iOS equivalent of starting the core service
  // This might involve launching another app or starting a background process
}

RCT_EXPORT_METHOD(stopService)
{
  RCTLogInfo(@"ManagerCoreCommsService: stopService called");
  // Implement the iOS equivalent of stopping the service
}

RCT_EXPORT_SYNCHRONOUS_METHOD(isServiceRunning)
{
  // Return whether the service is running
  // This is a synchronous method that returns a boolean
  return @(NO); // Replace with actual implementation
}

RCT_EXPORT_METHOD(sendCommandToCore:(NSString *)jsonString)
{
  RCTLogInfo(@"ManagerCoreCommsService: sendCommandToCore called with: %@", jsonString);
  // Implement the iOS equivalent of sending a command to the core service
  // This might involve inter-process communication or another mechanism
}

RCT_EXPORT_METHOD(addListener:(NSString *)eventName)
{
  // Keep: Required for RN built in Event Emitter Calls
}

RCT_EXPORT_METHOD(removeListeners:(NSInteger)count)
{
  // Keep: Required for RN built in Event Emitter Calls
}

@end