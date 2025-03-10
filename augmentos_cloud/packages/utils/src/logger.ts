import winston from 'winston';
import { UserSession } from '@augmentos/sdk';

// Define the error structure
interface FormattedError {
  kind: string;
  message: string;
  stack: string;
}

// Add typing to the formatter
const errorFormat = winston.format((info: any) => {
  if (info.error instanceof Error) {
    info.error = {
      kind: info.error.name,
      message: info.error.message,
      stack: info.error.stack
    } as FormattedError;
  }
  return info;
});

// Factory function to create a logger
export function createLogger(defaultMeta = {}) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      errorFormat(),
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: {
      service: process.env.SERVICE_NAME || 'unknown-service',
      ...defaultMeta
    },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, userId, sessionId, service, error, ...rest }: any) => {
            const userInfo = userId ? `${userId}` : '';
            const sessionInfo = sessionId ? `${sessionId}` : '';
            const meta = Object.keys(rest).length ? `\n${JSON.stringify(rest)}` : '';
            // Cast error to our interface
            const typedError = error as FormattedError | undefined;
            const errorStack = typedError ? `\n${typedError.stack}` : '';
            return `[${level}, ${timestamp}, ${userInfo}]:\n${message}${meta}${errorStack}`;
          })
        )
      })
    ]
  });
}

// System logger for non-session events
export const systemLogger = createLogger();
export const logger = systemLogger;

// Add logger to UserSession
export function createLoggerForUserSession(userId: string): winston.Logger {
  return createLogger({ userId });
}