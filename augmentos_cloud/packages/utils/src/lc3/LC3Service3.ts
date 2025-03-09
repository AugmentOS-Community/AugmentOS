// augmentos_cloud/packages/utils/src/LC3Service.ts

import * as fs from 'fs';
import * as path from 'path';

interface LC3Instance {
  samples: Float32Array;
  frame: Uint8Array;
  decode(): void;
  lastUsed: number;
}

export class LC3Service {
  private lc3Exports: WebAssembly.Exports | null = null;
  private decoder: LC3Instance | null = null;
  private initialized = false;

  // Memory management sizes
  private decoderSize = 0;
  private frameSamples = 0;

  // LC3 decoding parameters
  private readonly frameDurationUs = 10000; // 10ms per frame
  private readonly sampleRateHz = 16000;    // 16kHz
  private readonly frameBytes = 20;         // Fixed for our case

  constructor() {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const wasmPath = path.resolve(__dirname, 'liblc3.wasm');
      console.log('Loading WASM from:', wasmPath);
      const wasmBuffer = fs.readFileSync(wasmPath);
      const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
      this.lc3Exports = wasmModule.instance.exports;
      this.frameSamples = (this.lc3Exports.lc3_frame_samples as Function)(
        this.frameDurationUs,
        this.sampleRateHz
      );
      this.decoderSize = (this.lc3Exports.lc3_decoder_size as Function)(
        this.frameDurationUs,
        this.sampleRateHz
      );
      this.decoder = this.createDecoderInstance();
      this.initialized = true;
      console.log('✅ LC3 Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize LC3 Service:', error);
      throw error;
    }
  }

  private createDecoderInstance(): LC3Instance {
    if (!this.lc3Exports) throw new Error('LC3 not initialized');
    const memory = this.lc3Exports.memory as WebAssembly.Memory;
    const basePtr = memory.buffer.byteLength;
    // Calculate the memory required for this instance
    const instanceSize = this.decoderSize + (this.frameSamples * 4) + this.frameBytes;
    const alignedSize = Math.ceil(instanceSize / 4) * 4;
    const pagesNeeded = Math.ceil((basePtr + alignedSize) / (64 * 1024));
    const currentPages = memory.buffer.byteLength / (64 * 1024);
    if (pagesNeeded > currentPages) {
      memory.grow(pagesNeeded - currentPages);
    }
    const decoderPtr = basePtr;
    const samplePtr = decoderPtr + this.decoderSize;
    const framePtr = samplePtr + (this.frameSamples * 4);
    (this.lc3Exports.lc3_setup_decoder as Function)(
      this.frameDurationUs,
      this.sampleRateHz,
      this.sampleRateHz,
      decoderPtr
    );
    return {
      samples: new Float32Array(memory.buffer, samplePtr, this.frameSamples),
      frame: new Uint8Array(memory.buffer, framePtr, this.frameBytes),
      decode: () => {
        (this.lc3Exports!.lc3_decode as Function)(
          decoderPtr,
          framePtr,
          this.frameBytes,
          3, // Using float format (3) for better performance
          samplePtr,
          1
        );
      },
      lastUsed: Date.now()
    };
  }

  async decodeAudioChunk(audioData: ArrayBuffer): Promise<ArrayBuffer | null> {
    if (!this.initialized || !this.decoder) {
      await this.initialize();
    }
    
    let localInputData: Uint8Array | null = null;
    
    try {
      const numFrames = Math.floor(audioData.byteLength / this.frameBytes);
      const totalSamples = numFrames * this.frameSamples;
      const outputBuffer = new ArrayBuffer(totalSamples * 2); // 16-bit PCM
      const outputView = new DataView(outputBuffer);
      localInputData = new Uint8Array(audioData);
      let outputOffset = 0;
      
      for (let i = 0; i < numFrames; i++) {
        this.decoder!.frame.set(
          localInputData.subarray(i * this.frameBytes, (i + 1) * this.frameBytes)
        );
        this.decoder!.decode();
        for (let j = 0; j < this.frameSamples; j++) {
          const pcmValue = Math.max(
            -32768,
            Math.min(32767, Math.floor(this.decoder!.samples[j] * 32768))
          );
          outputView.setInt16(outputOffset, pcmValue, true);
          outputOffset += 2;
        }
      }
      
      // Update last used timestamp
      if (this.decoder) {
        this.decoder.lastUsed = Date.now();
      }
      
      return outputBuffer;
    } catch (error) {
      console.error('❌ Error decoding LC3 audio:', error);
      return null;
    } finally {
      // Release references to input data to help GC
      // This is safe even if there was an error
      localInputData = null;
    }
  }

  cleanup(): void {
    try {
      if (this.decoder && this.lc3Exports) {
        // Force garbage collection of the ArrayBuffer views
        this.decoder.samples = new Float32Array(0);
        this.decoder.frame = new Uint8Array(0);
        
        // If WebAssembly instances support explicit cleanup in future, add it here
        
        // Log memory usage before clearing references
        if (global.gc) {
          console.log('🧹 Running garbage collection for LC3Service cleanup');
          global.gc();
        }
      }
    } catch (error) {
      console.error('Error during LC3Service cleanup:', error);
    } finally {
      // Clear all references to allow garbage collection
      this.initialized = false;
      this.lc3Exports = null;
      this.decoder = null;
    }
  }
}

export default LC3Service;
