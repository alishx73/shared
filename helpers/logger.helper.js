import winston from 'winston';

require('winston-daily-rotate-file');

const logFile = 'user-app'; // microservice name
const dateFormat = () => new Date(Date.now()).toUTCString();

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: `./logs/${logFile}-%DATE%.log`,
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],

  format: winston.format.combine(
    winston.format.printf((info) => {
      try {
        let message = `${dateFormat()} | ${info.level.toUpperCase()} | ${logFile}.log | ${
          info.message
        } | `;

        message = info.obj
          ? `${message}data:${JSON.stringify(info.obj)} | `
          : message;
        return message;
      } catch (e) {
        return info.message;
      }
    }),
    winston.format.colorize(),
  ),
});

export const logError = (message, obj) => {
  logger.log('error', message, { obj });
};

export const logInfo = (message, obj) => {
  logger.log('info', message, { obj });
};

export const logDebug = (message, obj) => {
  logger.log('debug', message, { obj });
};
