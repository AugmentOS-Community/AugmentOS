#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@protocol EvenRealitiesG1ManagerDelegate <NSObject>
- (void)didConnectToGlasses;
- (void)didDisconnectFromGlasses;
- (void)didReceiveBatteryLevel:(int)level;
- (void)didReceiveHeadUpEvent;
- (void)didReceiveHeadDownEvent;
- (void)didReceiveAudioData:(NSData *)audioData;
@end

@interface EvenRealitiesG1Manager : NSObject <CBCentralManagerDelegate, CBPeripheralDelegate>

@property (nonatomic, weak) id<EvenRealitiesG1ManagerDelegate> delegate;
@property (nonatomic, readonly) BOOL isConnected;

+ (instancetype)sharedInstance;

- (void)startScan;
- (void)stopScan;
- (void)connectToSavedDevices;
- (void)disconnect;
- (void)displayTextWall:(NSString *)text;
- (void)displayBitmap:(UIImage *)image;
- (void)setMicEnabled:(BOOL)enabled;
- (void)setBrightness:(int)brightness autoMode:(BOOL)autoMode;
- (void)setHeadUpAngle:(int)angle;
- (void)showHomeScreen;
- (void)queryBatteryStatus;
- (void)findCompatibleDeviceNames;
- (void)savePreferredDeviceId:(NSString *)deviceId;
- (void)deleteAllSavedPreferences;

@end

NS_ASSUME_NONNULL_END 