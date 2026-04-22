// =============================================================================
// EMP CLOUD — NAS (SFTP) storage service
//
// Thin wrapper around ssh2-sftp-client used by (a) the biometric-legacy
// face image pipeline and (b) the standalone /api/v3/nas REST module that
// mirrors emp-monitor's file storage API.
//
// If NAS env vars are unset, `isConfigured()` returns false and callers can
// fall back to local-disk behaviour. This keeps dev environments working
// without NAS credentials.
// =============================================================================

import SftpClient from "ssh2-sftp-client";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

function sftpConnectOptions(): SftpClient.ConnectOptions {
  return {
    host: config.nas.sftp.host,
    port: config.nas.sftp.port,
    username: config.nas.sftp.user,
    password: config.nas.sftp.password,
    keepaliveInterval: 10000,
    keepaliveCountMax: 10,
  };
}

function nasBasePath(): string {
  return config.nas.sftp.basePath;
}

export function isConfigured(): boolean {
  return Boolean(
    config.nas.sftp.host &&
      config.nas.sftp.user &&
      config.nas.sftp.password &&
      config.nas.sftp.basePath,
  );
}

async function withSftp<T>(fn: (sftp: SftpClient) => Promise<T>): Promise<T> {
  const sftp = new SftpClient();
  try {
    await sftp.connect(sftpConnectOptions());
    return await fn(sftp);
  } finally {
    try {
      await sftp.end();
    } catch {
      /* ignore */
    }
  }
}

// Upload a buffer to `<basePath>/<projectName>/<email>/<remoteFilename>`.
// Creates intermediate directories as needed, mirroring emp-monitor's
// per-user folder convention.
export async function uploadBuffer(
  buffer: Buffer,
  remoteFilename: string,
  opts: { email: string; projectName: string },
): Promise<void> {
  await withSftp(async (sftp) => {
    const uploadDir = `${nasBasePath()}/${opts.projectName}/${opts.email}`;
    const exists = await sftp.exists(uploadDir);
    if (!exists) await sftp.mkdir(uploadDir, true);
    const remotePath = `${uploadDir}/${remoteFilename}`;
    await sftp.put(buffer, remotePath);
  });
}

// Delete a file at `<basePath>/<relativePath>`. Returns true on success,
// false if the file does not exist. Swallows end-of-session errors.
export async function deleteFile(relativePath: string): Promise<boolean> {
  return withSftp(async (sftp) => {
    const cleaned = path.posix.normalize(relativePath.trim());
    const fullpath = `${nasBasePath()}/${cleaned}`;
    const exists = await sftp.exists(fullpath);
    if (exists !== "-") return false;
    await sftp.delete(fullpath);
    return true;
  });
}

// Stream a NAS file to an Express response, preserving JPEG content-type
// and 404-ing with emp-monitor's exact JSON body shape when the path does
// not resolve to a regular file.
export async function streamFile(relativePath: string, res: Response): Promise<void> {
  const sftp = new SftpClient();
  try {
    await sftp.connect(sftpConnectOptions());
    const cleaned = path.posix.normalize(relativePath.trim());
    const fullpath = `${nasBasePath()}/${cleaned}`;
    const exists = await sftp.exists(fullpath);
    if (exists !== "-") {
      if (!res.headersSent) {
        res.status(404).json({ data: null, error: null, message: "file does not exist" });
      }
      return;
    }
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "image/jpeg");
    const stream = sftp.createReadStream(fullpath);
    await pipeline(stream, res);
  } catch (err) {
    logger.error("NAS streamFile failed", { err: (err as Error)?.message, relativePath });
    if (!res.headersSent) {
      res.status(500).json({ data: null, error: null, message: "internal server error" });
    }
  } finally {
    try {
      await sftp.end();
    } catch {
      /* ignore */
    }
  }
}

// List file entries (non-directory) inside `<basePath>/<relativePath>`.
// Returns an empty array if the directory does not exist.
export interface NasFileEntry {
  name: string;
  size: number;
  modifyTime: number;
  accessTime: number;
  type: string; // "-" file, "d" dir, "l" symlink
}

export async function listFiles(relativePath: string): Promise<NasFileEntry[]> {
  return withSftp(async (sftp) => {
    const cleaned = path.posix.normalize(relativePath.trim());
    const fullpath = `${nasBasePath()}/${cleaned}`;
    const exists = await sftp.exists(fullpath);
    if (exists !== "d") return [];
    const items = await sftp.list(fullpath);
    return items.map((i) => ({
      name: i.name,
      size: i.size,
      modifyTime: i.modifyTime,
      accessTime: i.accessTime,
      type: i.type,
    }));
  });
}
