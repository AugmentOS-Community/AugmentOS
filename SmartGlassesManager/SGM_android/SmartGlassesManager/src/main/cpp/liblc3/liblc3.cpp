// persistent_encoder.cpp
#include <jni.h>
#include <cstdlib>
#include <cstring>
#include "include/lc3.h"
#include <android/log.h>

#define LOG_TAG "LC3JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

extern "C" JNIEXPORT jlong JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_initEncoder(JNIEnv *env, jclass clazz) {
    int dtUs = 10000;
    int srHz = 16000;
    unsigned encoderSize = lc3_encoder_size(dtUs, srHz);
    void* encMem = malloc(encoderSize);
    if (!encMem) return 0;

    lc3_encoder_t encoder = lc3_setup_encoder(dtUs, srHz, 0, encMem);
    if (!encoder) {
        free(encMem);
        return 0;
    }

    return reinterpret_cast<jlong>(encMem);
}

extern "C" JNIEXPORT void JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_freeEncoder(JNIEnv *env, jclass clazz, jlong encPtr) {
    void* encMem = reinterpret_cast<void*>(encPtr);
    free(encMem);
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_initDecoder(JNIEnv *env, jclass clazz) {
    int dtUs = 10000;
    int srHz = 16000;
    unsigned decoderSize = lc3_decoder_size(dtUs, srHz);
    void* decMem = malloc(decoderSize);
    if (!decMem) return 0;

    lc3_decoder_t decoder = lc3_setup_decoder(dtUs, srHz, 0, decMem);
    if (!decoder) {
        free(decMem);
        return 0;
    }

    return reinterpret_cast<jlong>(decMem);
}

extern "C" JNIEXPORT void JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_freeDecoder(JNIEnv *env, jclass clazz, jlong decPtr) {
    void* decMem = reinterpret_cast<void*>(decPtr);
    free(decMem);
}

// persistent_encoder.cpp

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_encodeLC3(JNIEnv *env, jclass clazz, jlong encPtr, jbyteArray pcmData) {
    jbyte* pcmBytes = env->GetByteArrayElements(pcmData, nullptr);
    int pcmLength = env->GetArrayLength(pcmData);

    int dtUs = 10000;
    int srHz = 16000;
    uint16_t samplesPerFrame = lc3_frame_samples(dtUs, srHz);
    uint16_t bytesPerFrame = samplesPerFrame * 2;
    uint16_t encodedFrameSize = 20;

    int frameCount = pcmLength / bytesPerFrame;
    int outputSize = frameCount * encodedFrameSize;

    if (frameCount <= 0) {
        env->ReleaseByteArrayElements(pcmData, pcmBytes, JNI_ABORT);
        return env->NewByteArray(0);
    }

    int16_t* alignedPcmBuffer = (int16_t*)malloc(bytesPerFrame);
    unsigned char* encodedData = (unsigned char*)malloc(outputSize);
    lc3_encoder_t encoder = (lc3_encoder_t)reinterpret_cast<void*>(encPtr);  // ✅ use passed-in encoder directly

    for (int i = 0, offset = 0; i < frameCount; i++, offset += encodedFrameSize) {
        for (int j = 0; j < samplesPerFrame; j++) {
            int srcIdx = i * bytesPerFrame + j * 2;
            if (srcIdx + 1 >= pcmLength) {
                alignedPcmBuffer[j] = 0;
            } else {
                // ✅ Fix endianness and signed/unsigned issue
                alignedPcmBuffer[j] = (int16_t)(
                        ((int16_t)pcmBytes[srcIdx + 1] << 8) |
                        ((uint8_t)pcmBytes[srcIdx])
                );
            }
        }

        int result = lc3_encode(encoder, LC3_PCM_FORMAT_S16, alignedPcmBuffer, 1,
                                encodedFrameSize, encodedData + offset);

        if (result != 0) {
            memset(encodedData + offset, 0, encodedFrameSize);
        }
    }

    jbyteArray resultArray = env->NewByteArray(outputSize);
    env->SetByteArrayRegion(resultArray, 0, outputSize, (jbyte*)encodedData);

    free(alignedPcmBuffer);
    free(encodedData);
    env->ReleaseByteArrayElements(pcmData, pcmBytes, JNI_ABORT);

    return resultArray;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_decodeLC3(JNIEnv *env, jclass clazz, jlong decPtr, jbyteArray lc3Data) {
    jbyte *lc3Bytes = env->GetByteArrayElements(lc3Data, nullptr);
    int lc3Length = env->GetArrayLength(lc3Data);

    int dtUs = 10000;
    int srHz = 16000;

    uint16_t samplesPerFrame = lc3_frame_samples(dtUs, srHz);
    uint16_t bytesPerFrame = samplesPerFrame * 2;
    uint16_t encodedFrameSize = 20;

    int outSize = (lc3Length / encodedFrameSize) * bytesPerFrame;
    unsigned char* outArray = (unsigned char*)malloc(outSize);
    int16_t* outBuf = (int16_t*)malloc(bytesPerFrame);  // ✅ correct type

    lc3_decoder_t decoder = (lc3_decoder_t)reinterpret_cast<void*>(decPtr);  // ✅ use passed-in decoder

    jsize offset = 0;
    for (int i = 0; i <= lc3Length - encodedFrameSize; i += encodedFrameSize) {
        unsigned char* framePtr = reinterpret_cast<unsigned char*>(lc3Bytes + i);
        lc3_decode(decoder, framePtr, encodedFrameSize, LC3_PCM_FORMAT_S16, outBuf, 1);
        memcpy(outArray + offset, outBuf, bytesPerFrame);
        offset += bytesPerFrame;
        memset(outBuf, 0, bytesPerFrame);
    }

    jbyteArray resultArray = env->NewByteArray(outSize);
    env->SetByteArrayRegion(resultArray, 0, outSize, (jbyte*)outArray);

    env->ReleaseByteArrayElements(lc3Data, lc3Bytes, JNI_ABORT);
    free(outArray);
    free(outBuf);
    return resultArray;
}
