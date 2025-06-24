import * as log from '@std/log';
import { ConsoleHandler, FileHandler } from '@std/log';

export class Logger {
  private static instance: Logger;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  async setup(logLevel: string, logFile?: string): Promise<void> {
    // Convert string log level to proper LevelName
    const level = logLevel.toUpperCase() as log.LevelName;

    const handlers: Record<string, log.BaseHandler> = {
      console: new ConsoleHandler(level, {
        formatter: (logRecord: log.LogRecord) => {
          const timestamp = new Date().toISOString();
          const level = logRecord.levelName.padEnd(5);
          return `${timestamp} [${level}] ${logRecord.msg}`;
        },
      }),
    };

    if (logFile) {
      handlers.file = new FileHandler(level, {
        filename: logFile,
        formatter: (logRecord: log.LogRecord) => {
          const timestamp = new Date().toISOString();
          const level = logRecord.levelName.padEnd(5);
          return `${timestamp} [${level}] ${logRecord.msg}`;
        },
      });
    }

    await log.setup({
      handlers,
      loggers: {
        default: {
          level: level,
          handlers: Object.keys(handlers),
        },
      },
    });
  }

  debug(msg: string, ...args: unknown[]): void {
    log.debug(msg, ...args);
  }

  info(msg: string, ...args: unknown[]): void {
    log.info(msg, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    log.warn(msg, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    log.error(msg, ...args);
  }

  critical(msg: string, ...args: unknown[]): void {
    log.critical(msg, ...args);
  }
}

export const logger = Logger.getInstance();
