// =============================================================================
// EMP CLOUD — Logger (Winston)
// Includes daily log rotation and correlation ID support.
// =============================================================================

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { config } from "../config/index.js";

const { combine, timestamp, printf, colorize, json } = winston.format;

/* v8 ignore start */ // Pretty format only used in development console
const prettyFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ timestamp, level, message, requestId, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : "";
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}:${rid} ${message}${extra}`;
  })
);

/* v8 ignore stop */
const jsonFormat = combine(timestamp(), json());

/* v8 ignore start */ // Production-only transports
const productionTransports: winston.transport[] = [
  new DailyRotateFile({
    filename: "logs/%DATE%-combined.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "50m",
    maxFiles: "30d",
    level: "info",
  }),
  new DailyRotateFile({
    filename: "logs/%DATE%-error.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "50m",
    maxFiles: "30d",
    level: "error",
  }),
];

/* v8 ignore stop */
export const logger = winston.createLogger({
  level: config.log.level,
  format: config.log.format === "pretty" ? prettyFormat : jsonFormat,
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === "production" ? productionTransports : []),
  ],
  silent: process.env.NODE_ENV === "test",
});
