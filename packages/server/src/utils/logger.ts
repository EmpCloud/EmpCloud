// =============================================================================
// EMP CLOUD — Logger (Winston)
// =============================================================================

import winston from "winston";
import { config } from "../config/index.js";

const { combine, timestamp, printf, colorize, json } = winston.format;

const prettyFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}: ${message}${extra}`;
  })
);

const jsonFormat = combine(timestamp(), json());

export const logger = winston.createLogger({
  level: config.log.level,
  format: config.log.format === "pretty" ? prettyFormat : jsonFormat,
  transports: [new winston.transports.Console()],
  silent: process.env.NODE_ENV === "test",
});
