/**
 * 📹 RTMP Streaming Module
 *
 * Provides functionality for TPAs to request and manage RTMP streams from smart glasses.
 * Handles stream lifecycle, status monitoring, and cleanup.
 */
import {
  TpaToCloudMessageType,
  CloudToTpaMessageType,
  RtmpStreamRequest,
  RtmpStreamStopRequest,
  RtmpStreamStatus,
  isRtmpStreamStatus
} from '../../../types';
import {
  VideoConfig,
  AudioConfig,
  StreamConfig,
  // StreamStatus,
  StreamStatusHandler
} from '../../../types/rtmp-stream';

// Re-export types from rtmp-stream
export {
  VideoConfig,
  AudioConfig,
  StreamConfig,
  // StreamStatus,
  StreamStatusHandler
};
import { StreamType } from '../../../types/streams';

// Video, Audio and Stream configuration interfaces are imported from '../../../types/rtmp-stream'

/**
 * Configuration options for an RTMP stream
 */
export interface RtmpStreamOptions {
  /** The RTMP URL to stream to (e.g., rtmp://server.example.com/live/stream-key) */
  rtmpUrl: string;
  /** Optional video configuration settings */
  video?: VideoConfig;
  /** Optional audio configuration settings */
  audio?: AudioConfig;
  /** Optional stream configuration settings */
  stream?: StreamConfig;
}

// Stream status information and handler types are imported from '../../../types/rtmp-stream'

/**
 * StreamingModule provides functionality for TPAs to request and manage RTMP streams.
 *
 * Streams can be requested with configurable parameters for video quality,
 * audio settings, and stream constraints. Status updates are received through
 * the standard subscription mechanism.
 */
export class StreamingModule {
  private send: (message: any) => void;
  private packageName: string;
  private sessionId: string;
  private session?: any; // Reference to TpaSession
  private isStreaming: boolean = false;
  private currentStreamUrl?: string;
  private currentStreamState?: RtmpStreamStatus;

  /**
   * Create a new StreamingModule
   *
   * @param packageName - The TPA package name
   * @param sessionId - The current session ID
   * @param send - Function to send messages to the cloud
   * @param session - Reference to the parent TpaSession (optional)
   */
  constructor(packageName: string, sessionId: string, send: (message: any) => void, session?: any) {
    this.packageName = packageName;
    this.sessionId = sessionId;
    this.send = send;
    this.session = session;
  }

  /**
   * Begin an RTMP stream to the specified URL
   *
   * @param options - Configuration options for the stream
   * @returns Promise that resolves when the stream request is sent (not when streaming begins)
   */
  async requestStream(options: RtmpStreamOptions): Promise<void> {
    if (!options.rtmpUrl) {
      throw new Error('rtmpUrl is required');
    }

    if (this.isStreaming) {
      throw new Error('Already streaming. Stop the current stream before starting a new one.');
    }

    // Create stream request message
    const message: RtmpStreamRequest = {
      type: TpaToCloudMessageType.RTMP_STREAM_REQUEST,
      packageName: this.packageName,
      sessionId: this.sessionId,
      rtmpUrl: options.rtmpUrl,
      video: options.video,
      audio: options.audio,
      stream: options.stream,
      timestamp: new Date()
    };

    // Save stream URL for reference
    this.currentStreamUrl = options.rtmpUrl;

    // Send the request
    try {
      this.send(message);
      this.isStreaming = true;
      return Promise.resolve();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return Promise.reject(new Error(`Failed to request RTMP stream: ${errorMessage}`));
    }
  }

  /**
   * Stop the current RTMP stream
   *
   * @returns Promise that resolves when the stop request is sent
   */
  async stopStream(): Promise<void> {
    if (!this.isStreaming) {
      // Not an error - just a no-op if not streaming
      return Promise.resolve();
    }

    // Create stop request message
    const message: RtmpStreamStopRequest = {
      type: TpaToCloudMessageType.RTMP_STREAM_STOP,
      packageName: this.packageName,
      sessionId: this.sessionId,
      streamId: this.currentStreamState?.streamId,  // Include streamId if available
      timestamp: new Date()
    };

    // Send the request
    try {
      this.send(message);
      return Promise.resolve();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return Promise.reject(new Error(`Failed to stop RTMP stream: ${errorMessage}`));
    }
  }

  /**
   * Check if currently streaming
   *
   * @returns True if a stream is active or initializing
   */
  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  /**
   * Get the URL of the current stream (if any)
   *
   * @returns The RTMP URL of the current stream, or undefined if not streaming
   */
  getCurrentStreamUrl(): string | undefined {
    return this.currentStreamUrl;
  }

  /**
   * Get the current stream status
   *
   * @returns The current stream status, or undefined if not available
   */
  getStreamStatus(): RtmpStreamStatus | undefined {
    return this.currentStreamState;
  }

  /**
   * Subscribe to RTMP stream status updates
   * This uses the standard stream subscription mechanism
   */
  subscribeToStatusUpdates(): void {
    if (this.session) {
      this.session.subscribe(StreamType.RTMP_STREAM_STATUS);
    } else {
      console.error('Cannot subscribe to status updates: session reference not available');
    }
  }

  /**
   * Unsubscribe from RTMP stream status updates
   */
  unsubscribeFromStatusUpdates(): void {
    if (this.session) {
      this.session.unsubscribe(StreamType.RTMP_STREAM_STATUS);
    }
  }

  /**
   * Listen for status updates using the standard event system
   * @param handler - Function to call when stream status changes
   * @returns Cleanup function to remove the handler
   */
  onStatus(handler: StreamStatusHandler): () => void {
    if (!this.session) {
      console.error('Cannot listen for status updates: session reference not available');
      return () => {};
    }

    this.subscribeToStatusUpdates();
    return this.session.on(StreamType.RTMP_STREAM_STATUS, handler);
  }

  /**
   * Update internal stream state based on a status message
   * For internal use by TpaSession
   * @param message - The status message from the cloud
   */
  updateStreamState(message: any): void {
    // Verify this is a valid stream response
    if (!isRtmpStreamStatus(message)) {
      console.warn('Received invalid stream status message', message);
      return;
    }

    // Convert to StreamStatus format
    const status: RtmpStreamStatus = {
      type: message.type,
      streamId: message.streamId,
      status: message.status,
      errorDetails: message.errorDetails,
      appId: message.appId,
      stats: message.stats,
      timestamp: message.timestamp || new Date()
    };

    // Update local state based on status
    if (status.status === 'stopped' || status.status === 'error') {
      this.isStreaming = false;
      this.currentStreamUrl = undefined;
    }

    // Save the latest status
    this.currentStreamState = status;
  }
}