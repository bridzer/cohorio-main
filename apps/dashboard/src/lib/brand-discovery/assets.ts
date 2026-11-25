/**
 * Upload validation and dependency-free extraction (Milestone 2).
 * Binary office formats are stored and listed; their text extraction arrives
 * with the document pipeline (deliberately no new npm deps this milestone).
 */

export const ASSET_MAX_BYTES = 8 * 1024 * 1024;

/** Extension allowlist mapped to the stored mime type. */
export const ASSET_ALLOWLIST: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
};

export const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv"]);

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Best-effort magic-byte sniffing. Returns a mime when the bytes agree with
 * the filename extension, otherwise null (reject the upload).
 */
export function sniffMime(bytes: Uint8Array, filename: string): string | null {
  const dot = filename.toLowerCase().lastIndexOf(".");
  const extension = dot >= 0 ? filename.toLowerCase().slice(dot) : "";
  const claimed = ASSET_ALLOWLIST[extension];
  if (!claimed) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return extension === ".pdf" ? claimed : null; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return extension === ".docx" || extension === ".xlsx" ? claimed : null; // ZIP container
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return extension === ".png" ? claimed : null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return extension === ".jpg" || extension === ".jpeg" ? claimed : null;
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // RIFF....WEBP
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return extension === ".webp" ? claimed : null;
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return extension === ".gif" ? claimed : null;
  // Text formats have no magic bytes: accept by extension, reject NUL bytes.
  if (TEXT_MIMES.has(claimed)) {
    return bytes.includes(0x00) ? null : claimed;
  }
  return null;
}

function parseCsvRows(content: string, maxRows: number) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!;
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      if (rows.length >= maxRows) break;
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim()) && rows.length < maxRows) rows.push(row);
  return rows;
}

/**
 * Flattens the first rows of a CSV into readable `header: value` lines with
 * a row count, so catalogs become Brand Brain source text without new deps.
 */
export function csvToText(content: string, maxRows = 20) {
  const rows = parseCsvRows(content.replace(/^﻿/, ""), maxRows + 1);
  if (!rows.length) return { text: "", rowCount: 0 };
  const header = rows[0]!.map((cell) => cell.trim());
  const body = rows.slice(1, maxRows + 1);
  const lines = body.map((cells) =>
    cells
      .map((cell, index) => `${header[index] || `Column ${index + 1}`}: ${cell.trim()}`)
      .join(" | "),
  );
  return { text: lines.join("\n"), rowCount: Math.max(0, rows.length - (header.length ? 1 : 0)) };
}
