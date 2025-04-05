////
////  PcmConverter.m
////  Runner
////
////  Created by Hawk on 2024/3/14.
////
//
//#import "PcmConverter.h"
//#import "lc3.h"
//
//@implementation PcmConverter
//
//// Frame length 10ms
//static const int dtUs = 10000;
//// Sampling rate 48K
//static const int srHz = 16000;
//// Output bytes after encoding a single frame
//static const uint16_t outputByteCount = 20;  // 40
//// Buffer size required by the encoder
//static unsigned encodeSize;
//// Buffer size required by the decoder
//static unsigned decodeSize;
//// Number of samples in a single frame
//static uint16_t sampleOfFrames;
//// Number of bytes in a single frame, 16Bits takes up two bytes for the next sample
//static uint16_t bytesOfFrames;
//// Encoder buffer
//static void* encMem = NULL;
//// Decoder buffer
//static void* decMem = NULL;
//// File descriptor of the input file
//static int inFd = -1;
//// File descriptor of output file
//static int outFd = -1;
//// Input frame buffer
//static unsigned char *inBuf;
//// Output frame buffer
//static unsigned char *outBuf;
//
//-(NSMutableData *)decode: (NSData *)lc3data {
//    
//    encodeSize = lc3_encoder_size(dtUs, srHz);
//    decodeSize = lc3_decoder_size(dtUs, srHz);
//    sampleOfFrames = lc3_frame_samples(dtUs, srHz);
//    bytesOfFrames = sampleOfFrames*2;
//
//    if (lc3data == nil) {
//        printf("Failed to decode Base64 data\n");
//        return [[NSMutableData alloc] init];
//    }
//    
//    decMem = malloc(decodeSize);
//    lc3_decoder_t lc3_decoder = lc3_setup_decoder(dtUs, srHz, 0, decMem);
//    if ((outBuf = malloc(bytesOfFrames)) == NULL) {
//        printf("Failed to allocate memory for outBuf\n");
//        return [[NSMutableData alloc] init];
//    }
//    
//    int totalBytes = (int)lc3data.length;
//    int bytesRead = 0;
//    
//    NSMutableData *pcmData = [[NSMutableData alloc] init];
//    
//    while (bytesRead < totalBytes) {
//        int bytesToRead = MIN(outputByteCount, totalBytes - bytesRead);
//        NSRange range = NSMakeRange(bytesRead, bytesToRead);
//        NSData *subdata = [lc3data subdataWithRange:range];
//        inBuf = (unsigned char *)subdata.bytes;
//        
//        NSUInteger length = subdata.length;
//        for (NSUInteger i = 0; i < length; ++i) {
//           // printf("%02X ", inBuf[i]);
//        }
//        lc3_decode(lc3_decoder, inBuf, outputByteCount, LC3_PCM_FORMAT_S16, outBuf, 1);
//        
//        NSMutableString *hexString = [NSMutableString stringWithCapacity:bytesOfFrames * 2];
//        for (int i = 0; i < bytesOfFrames; i++) {
//            
//            [hexString appendFormat:@"%02X ", outBuf[i]];
//        }
//         
//        NSData *data = [NSData dataWithBytes:outBuf length:bytesOfFrames];
//        [pcmData appendData:data];
//        bytesRead += bytesToRead;
//    }
//    
//    free(decMem);
//    free(outBuf);
//    
//    return pcmData;
//}
//
//-(NSData *)encode:(NSData *)pcmData {
//    // Get the PCM data bytes
//    const unsigned char *pcmBytes = pcmData.bytes;
//    int pcmLength = (int)pcmData.length;
//    
//    // Calculate frames and sizes
//    sampleOfFrames = lc3_frame_samples(dtUs, srHz);
//    bytesOfFrames = sampleOfFrames * 2; // 16-bit samples (2 bytes per sample)
//    
//    // Calculate total output size based on complete frames
//    int frameCount = pcmLength / bytesOfFrames;
//    int outputSize = frameCount * outputByteCount;
//    
//    // Allocate buffer for all encoded frames
//    unsigned char *encodedData = (unsigned char *)malloc(outputSize);
//    if (encodedData == NULL) {
//        printf("Failed to allocate memory for encoded data\n");
//        return nil;
//    }
//    
//    // Allocate and set up encoder
//    encodeSize = lc3_encoder_size(dtUs, srHz);
//    encMem = malloc(encodeSize);
//    lc3_encoder_t encoder = lc3_setup_encoder(dtUs, srHz, srHz, encMem);
//    
//    int offset = 0;
//    
//    // Process each complete frame
//    for (int i = 0; i <= pcmLength - bytesOfFrames; i += bytesOfFrames) {
//        // Get pointer to the current PCM frame
//        const unsigned char *framePcm = pcmBytes + i;
//        
//        // Encode the frame
//        lc3_encode(encoder, LC3_PCM_FORMAT_S16, framePcm, 1, outputByteCount, encodedData + offset);
//        
//        // Move to the next output position
//        offset += outputByteCount;
//    }
//    
//    // Create NSData from the encoded bytes
//    NSData *result = [NSData dataWithBytes:encodedData length:outputSize];
//    
//    // Clean up
//    free(encodedData);
//    free(encMem);
//    encMem = NULL;
//    
//    return result;
//}
//@end


//
//  PcmConverter.m
//  Runner
//
//  Created by Hawk on 2024/3/14.
//

#import "PcmConverter.h"
#import "lc3.h"

@implementation PcmConverter

// Frame length 10ms
static const int dtUs = 10000;
// Sampling rate 48K
static const int srHz = 16000;
// Output bytes after encoding a single frame
static const uint16_t outputByteCount = 20;  // 40
// Number of samples in a single frame
static uint16_t sampleOfFrames;
// Number of bytes in a single frame, 16Bits takes up two bytes for the next sample
static uint16_t bytesOfFrames;

// Static persistent encoder and decoder
static lc3_encoder_t staticEncoder = NULL;
static lc3_decoder_t staticDecoder = NULL;
static void* staticEncMem = NULL;
static void* staticDecMem = NULL;
static BOOL isInitialized = NO;

// Initialize the static encoder and decoder
+ (void)initialize {
    if (self == [PcmConverter class]) {
        [self setupStaticEncoderAndDecoder];
    }
}

+ (void)setupStaticEncoderAndDecoder {
    if (isInitialized) return;
    
    // Calculate frame sizes
    sampleOfFrames = lc3_frame_samples(dtUs, srHz);
    bytesOfFrames = sampleOfFrames * 2;
    
    // Setup encoder
    unsigned encodeSize = lc3_encoder_size(dtUs, srHz);
    staticEncMem = malloc(encodeSize);
    if (staticEncMem) {
        staticEncoder = lc3_setup_encoder(dtUs, srHz, srHz, staticEncMem);
    }
    
    // Setup decoder
    unsigned decodeSize = lc3_decoder_size(dtUs, srHz);
    staticDecMem = malloc(decodeSize);
    if (staticDecMem) {
        staticDecoder = lc3_setup_decoder(dtUs, srHz, 0, staticDecMem);
    }
    
    isInitialized = YES;
}

+ (void)cleanupStaticEncoderAndDecoder {
    if (staticEncMem) {
        free(staticEncMem);
        staticEncMem = NULL;
        staticEncoder = NULL;
    }
    
    if (staticDecMem) {
        free(staticDecMem);
        staticDecMem = NULL;
        staticDecoder = NULL;
    }
    
    isInitialized = NO;
}

+ (void)cleanup {
    [self cleanupStaticEncoderAndDecoder];
}

- (instancetype)init {
    self = [super init];
    if (self) {
        // Ensure encoder and decoder are set up
        if (!isInitialized) {
            [[self class] setupStaticEncoderAndDecoder];
        }
    }
    return self;
}

- (NSMutableData *)decode:(NSData *)lc3data {
    // Ensure encoder and decoder are initialized
    if (!isInitialized) {
        [[self class] setupStaticEncoderAndDecoder];
    }
    
    if (lc3data == nil || staticDecoder == NULL) {
        NSLog(@"Failed to decode: %@", staticDecoder == NULL ? @"Decoder not initialized" : @"Input data is nil");
        return [[NSMutableData alloc] init];
    }
    
    unsigned char *outBuf = malloc(bytesOfFrames);
    if (outBuf == NULL) {
        NSLog(@"Failed to allocate memory for outBuf");
        return [[NSMutableData alloc] init];
    }
    
    int totalBytes = (int)lc3data.length;
    int bytesRead = 0;
    
    NSMutableData *pcmData = [[NSMutableData alloc] init];
    
    while (bytesRead < totalBytes) {
        int bytesToRead = MIN(outputByteCount, totalBytes - bytesRead);
        NSRange range = NSMakeRange(bytesRead, bytesToRead);
        NSData *subdata = [lc3data subdataWithRange:range];
        unsigned char *inBuf = (unsigned char *)subdata.bytes;
        
        lc3_decode(staticDecoder, inBuf, outputByteCount, LC3_PCM_FORMAT_S16, outBuf, 1);
        
        NSData *data = [NSData dataWithBytes:outBuf length:bytesOfFrames];
        [pcmData appendData:data];
        bytesRead += bytesToRead;
    }
    
    free(outBuf);
    
    return pcmData;
}

- (NSData *)encode:(NSData *)pcmData {
    // Ensure encoder and decoder are initialized
    if (!isInitialized) {
        [[self class] setupStaticEncoderAndDecoder];
    }
    
    if (pcmData == nil || staticEncoder == NULL) {
        NSLog(@"Failed to encode: %@", staticEncoder == NULL ? @"Encoder not initialized" : @"Input data is nil");
        return nil;
    }
    
    // Get the PCM data bytes
    const unsigned char *pcmBytes = pcmData.bytes;
    int pcmLength = (int)pcmData.length;
    
    // Calculate total output size based on complete frames
    int frameCount = pcmLength / bytesOfFrames;
    int outputSize = frameCount * outputByteCount;
    
    // Allocate buffer for all encoded frames
    unsigned char *encodedData = (unsigned char *)malloc(outputSize);
    if (encodedData == NULL) {
        NSLog(@"Failed to allocate memory for encoded data");
        return nil;
    }
    
    int offset = 0;
    
    // Process each complete frame
    for (int i = 0; i <= pcmLength - bytesOfFrames; i += bytesOfFrames) {
        // Get pointer to the current PCM frame
        const unsigned char *framePcm = pcmBytes + i;
        
        // Encode the frame
        lc3_encode(staticEncoder, LC3_PCM_FORMAT_S16, framePcm, 1, outputByteCount, encodedData + offset);
        
        // Move to the next output position
        offset += outputByteCount;
    }
    
    // Create NSData from the encoded bytes
    NSData *result = [NSData dataWithBytes:encodedData length:outputSize];
    
    // Clean up temporary buffer
    free(encodedData);
    
    return result;
}

@end
