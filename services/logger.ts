// services/logger.ts
// Production-safe logging utility

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  enableConsole: boolean;
  enableRemote: boolean;
  minLevel: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production, only log warnings and errors
// In development, log everything
const config: LogConfig = {
  enableConsole: __DEV__,
  enableRemote: !__DEV__,
  minLevel: __DEV__ ? 'debug' : 'warn',
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.minLevel];
}

function formatMessage(level: LogLevel, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
}

// Remote logging placeholder - integrate with your error tracking service
async function sendToRemote(level: LogLevel, message: string, data?: any): Promise<void> {
  // TODO: Integrate with Sentry, Firebase Crashlytics, or similar
  // Example with Sentry:
  // if (level === 'error') {
  //   Sentry.captureException(new Error(message), { extra: data });
  // } else if (level === 'warn') {
  //   Sentry.captureMessage(message, { level: 'warning', extra: data });
  // }
}

export const logger = {
  debug: (message: string, data?: any) => {
    if (!shouldLog('debug')) return;
    if (config.enableConsole) {
      console.log(formatMessage('debug', message, data));
    }
  },

  info: (message: string, data?: any) => {
    if (!shouldLog('info')) return;
    if (config.enableConsole) {
      console.info(formatMessage('info', message, data));
    }
  },

  warn: (message: string, data?: any) => {
    if (!shouldLog('warn')) return;
    if (config.enableConsole) {
      console.warn(formatMessage('warn', message, data));
    }
    if (config.enableRemote) {
      sendToRemote('warn', message, data).catch(() => {});
    }
  },

  error: (message: string, error?: Error | any, data?: any) => {
    if (!shouldLog('error')) return;

    const errorData = {
      ...data,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorCode: error?.code,
    };

    if (config.enableConsole) {
      console.error(formatMessage('error', message, errorData));
    }
    if (config.enableRemote) {
      sendToRemote('error', message, errorData).catch(() => {});
    }
  },

  // Track user actions for analytics
  track: (event: string, properties?: Record<string, any>) => {
    if (__DEV__) {
      console.log(`[TRACK] ${event}`, properties);
    }
    // TODO: Integrate with analytics service (Firebase Analytics, Mixpanel, etc.)
  },
};

export default logger;
