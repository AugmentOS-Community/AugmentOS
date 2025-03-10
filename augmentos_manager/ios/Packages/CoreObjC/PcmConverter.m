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
// Buffer size required by the encoder
static unsigned encodeSize;
// Buffer size required by the decoder
static unsigned decodeSize;
// Number of samples in a single frame
static uint16_t sampleOfFrames;
// Number of bytes in a single frame, 16Bits takes up two bytes for the next sample
static uint16_t bytesOfFrames;
// Encoder buffer
static void* encMem = NULL;
// Decoder buffer
static void* decMem = NULL;
// File descriptor of the input file
static int inFd = -1;
// File descriptor of output file
static int outFd = -1;
// Input frame buffer
static unsigned char *inBuf;
// Output frame buffer
static unsigned char *outBuf;

-(NSMutableData *)decode: (NSData *)lc3data {
    
    encodeSize = lc3_encoder_size(dtUs, srHz);
    decodeSize = lc3_decoder_size(dtUs, srHz);
    sampleOfFrames = lc3_frame_samples(dtUs, srHz);
    bytesOfFrames = sampleOfFrames*2;

    if (lc3data == nil) {
        printf("Failed to decode Base64 data\n");
        return [[NSMutableData alloc] init];
    }
    
    decMem = malloc(decodeSize);
    lc3_decoder_t lc3_decoder = lc3_setup_decoder(dtUs, srHz, 0, decMem);
    if ((outBuf = malloc(bytesOfFrames)) == NULL) {
        printf("Failed to allocate memory for outBuf\n");
        return [[NSMutableData alloc] init];
    }
    
    int totalBytes = (int)lc3data.length;
    int bytesRead = 0;
    
    NSMutableData *pcmData = [[NSMutableData alloc] init];
    
    while (bytesRead < totalBytes) {
        int bytesToRead = MIN(outputByteCount, totalBytes - bytesRead);
        NSRange range = NSMakeRange(bytesRead, bytesToRead);
        NSData *subdata = [lc3data subdataWithRange:range];
        inBuf = (unsigned char *)subdata.bytes;
        
        NSUInteger length = subdata.length;
        for (NSUInteger i = 0; i < length; ++i) {
           // printf("%02X ", inBuf[i]);
        }
        lc3_decode(lc3_decoder, inBuf, outputByteCount, LC3_PCM_FORMAT_S16, outBuf, 1);
        
        NSMutableString *hexString = [NSMutableString stringWithCapacity:bytesOfFrames * 2];
        for (int i = 0; i < bytesOfFrames; i++) {
            
            [hexString appendFormat:@"%02X ", outBuf[i]];
        }
         
        NSData *data = [NSData dataWithBytes:outBuf length:bytesOfFrames];
        [pcmData appendData:data];
        bytesRead += bytesToRead;
    }
    
    free(decMem);
    free(outBuf);
    
    return pcmData;
}

//-(NSData *)encode:(NSData *)pcmData {
//    // Initialize LC3 encoder parameters if needed
//    encodeSize = lc3_encoder_size(dtUs, srHz);
//    sampleOfFrames = lc3_frame_samples(dtUs, srHz);
//    bytesOfFrames = sampleOfFrames * 2; // 16-bit samples (2 bytes per sample)
//    
//    // Allocate encoder memory if not already done
//    if (encMem == NULL) {
//        encMem = malloc(encodeSize);
//    }
//    
//    // Set up the encoder
//    lc3_encoder_t lc3_encoder = lc3_setup_encoder(dtUs, srHz, 0, encMem);
//    if (lc3_encoder == NULL) {
//        printf("Failed to set up LC3 encoder\n");
//        return nil;
//    }
//    
//    // Allocate buffer for encoded data
//    if ((outBuf = malloc(outputByteCount)) == NULL) {
//        printf("Failed to allocate memory for outBuf\n");
//        free(encMem);
//        encMem = NULL;
//        return nil;
//    }
//    
//    // Calculate how many frames we need to encode
//    int totalPcmBytes = (int)pcmData.length;
//    int framesCount = (totalPcmBytes + bytesOfFrames - 1) / bytesOfFrames; // Ceiling division
//    NSMutableData *encodedData = [[NSMutableData alloc] init];
//    
//    // Process each frame
//    for (int frameIndex = 0; frameIndex < framesCount; frameIndex++) {
//        // Calculate start position and bytes to read for this frame
//        int startPos = frameIndex * bytesOfFrames;
//        int bytesToRead = MIN(bytesOfFrames, totalPcmBytes - startPos);
//        
//        // If we don't have a full frame, we need to create a padded buffer
//        unsigned char *frameBuffer;
//        BOOL usingTempBuffer = NO;
//        
//        if (bytesToRead < bytesOfFrames) {
//            // Create a temporary buffer and zero-fill it
//            frameBuffer = (unsigned char *)calloc(bytesOfFrames, 1);
//            if (frameBuffer == NULL) {
//                printf("Failed to allocate frame buffer\n");
//                continue;
//            }
//            usingTempBuffer = YES;
//            
//            // Copy available PCM data into the buffer
//            [pcmData getBytes:frameBuffer range:NSMakeRange(startPos, bytesToRead)];
//        } else {
//            // We have a full frame, use the PCM data directly
//            frameBuffer = (unsigned char *)[pcmData bytes] + startPos;
//        }
//        
//        // Encode the frame
//        int result = lc3_encode(lc3_encoder, LC3_PCM_FORMAT_S16, frameBuffer, 1, outputByteCount, outBuf);
//        
//        if (result == 0) {
//            // Encoding successful, append to result
//            [encodedData appendBytes:outBuf length:outputByteCount];
//        } else {
//            printf("LC3 encoding failed with error: %d\n", result);
//        }
//        
//        // Clean up temporary buffer if we used one
//        if (usingTempBuffer) {
//            free(frameBuffer);
//        }
//    }
//    
//    // Clean up
//    free(outBuf);
//    outBuf = NULL;
//    
//    // Note: We don't free encMem here to allow reusing it for subsequent encodings
//    // If you want to free it when done with all encoding, you can add a cleanup method
//    
//    return encodedData;
//}


-(NSData *)encode:(NSData *)pcmData {
    // Get the PCM data bytes
    const unsigned char *pcmBytes = pcmData.bytes;
    int pcmLength = (int)pcmData.length;
    
    // Calculate frames and sizes
    sampleOfFrames = lc3_frame_samples(dtUs, srHz);
    bytesOfFrames = sampleOfFrames * 2; // 16-bit samples (2 bytes per sample)
    
    // Calculate total output size based on complete frames
    int frameCount = pcmLength / bytesOfFrames;
    int outputSize = frameCount * outputByteCount;
    
    // Allocate buffer for all encoded frames
    unsigned char *encodedData = (unsigned char *)malloc(outputSize);
    if (encodedData == NULL) {
        printf("Failed to allocate memory for encoded data\n");
        return nil;
    }
    
    // Allocate and set up encoder
    encodeSize = lc3_encoder_size(dtUs, srHz);
    encMem = malloc(encodeSize);
    lc3_encoder_t encoder = lc3_setup_encoder(dtUs, srHz, srHz, encMem);
    
    int offset = 0;
    
    // Process each complete frame
    for (int i = 0; i <= pcmLength - bytesOfFrames; i += bytesOfFrames) {
        // Get pointer to the current PCM frame
        const unsigned char *framePcm = pcmBytes + i;
        
        // Encode the frame
        lc3_encode(encoder, LC3_PCM_FORMAT_S16, framePcm, 1, outputByteCount, encodedData + offset);
        
        // Move to the next output position
        offset += outputByteCount;
    }
    
    // Create NSData from the encoded bytes
    NSData *result = [NSData dataWithBytes:encodedData length:outputSize];
    
    // Clean up
    free(encodedData);
    free(encMem);
    encMem = NULL;
    
    return result;
}
@end
