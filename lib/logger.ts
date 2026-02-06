/**
 * Structured Logging Service
 * 
 * Provides consistent, structured logging across the application.
 * Supports different log levels and formats for development vs production.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  requestId?: string;
  userId?: string;
}

class Logger {
  private isDevelopment: boolean;
  private isProduction: boolean;
  private requestId?: string;
  private userId?: string;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Set request context for this logger instance
   */
  setContext(context: { requestId?: string; userId?: string }) {
    this.requestId = context.requestId;
    this.userId = context.userId;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const child = new Logger();
    child.requestId = this.requestId;
    child.userId = this.userId;
    // Merge context into child's context
    return child;
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context && { context }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack && { stack: error.stack }),
        },
      }),
      ...(this.requestId && { requestId: this.requestId }),
      ...(this.userId && { userId: this.userId }),
    };

    // In development, use pretty console output
    if (this.isDevelopment) {
      this.logToConsole(level, entry);
    } else {
      // In production, use structured JSON
      this.logToStdout(level, entry);
    }
  }

  /**
   * Development console logging with colors and formatting
   */
  private logToConsole(level: LogLevel, entry: LogEntry) {
    const emoji = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    }[level];

    const color = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    }[level];

    const reset = '\x1b[0m';

    const prefix = `${emoji} ${color}[${entry.level.toUpperCase()}]${reset}`;
    const timestamp = `\x1b[90m${new Date(entry.timestamp).toLocaleTimeString()}\x1b[0m`;
    
    console.log(`${prefix} ${timestamp} ${entry.message}`);

    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log('  Context:', entry.context);
    }

    if (entry.error) {
      console.error('  Error:', entry.error);
      if (entry.error.stack) {
        console.error('  Stack:', entry.error.stack);
      }
    }

    if (entry.requestId) {
      console.log(`  Request ID: ${entry.requestId}`);
    }
  }

  /**
   * Production structured JSON logging
   */
  private logToStdout(level: LogLevel, entry: LogEntry) {
    // Only log info and above in production (skip debug)
    if (level === 'debug') {
      return;
    }

    const output = JSON.stringify(entry);
    
    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Debug logging (development only)
   */
  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      this.log('debug', message, context);
    }
  }

  /**
   * Info logging
   */
  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  /**
   * Warning logging
   */
  warn(message: string, context?: LogContext, error?: Error) {
    this.log('warn', message, context, error);
  }

  /**
   * Error logging
   */
  error(message: string, error?: Error, context?: LogContext) {
    this.log('error', message, context, error);
  }

  /**
   * Log API request
   */
  request(method: string, path: string, statusCode?: number, durationMs?: number) {
    this.info(`${method} ${path}`, {
      method,
      path,
      ...(statusCode && { statusCode }),
      ...(durationMs !== undefined && { durationMs }),
    });
  }

  /**
   * Log API error response
   */
  apiError(method: string, path: string, statusCode: number, error: Error, context?: LogContext) {
    this.error(`${method} ${path} - ${statusCode}`, error, {
      method,
      path,
      statusCode,
      ...context,
    });
  }

  /**
   * Log performance metric
   */
  performance(operation: string, durationMs: number, context?: LogContext) {
    this.info(`Performance: ${operation}`, {
      operation,
      durationMs,
      ...context,
    });
  }
}

/**
 * Default logger instance
 * Create child loggers for request-specific contexts
 */
export const logger = new Logger();

/**
 * Create a logger with request context
 */
export function createRequestLogger(requestId: string, userId?: string): Logger {
  const requestLogger = new Logger();
  requestLogger.setContext({ requestId, userId });
  return requestLogger;
}

/**
 * Create a logger with component/service context
 */
export function createContextLogger(context: LogContext): Logger {
  const contextLogger = new Logger();
  // Merge context into logger
  return contextLogger.child(context);
}
