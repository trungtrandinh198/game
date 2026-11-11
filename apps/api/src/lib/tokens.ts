import { createHash, createHmac, randomBytes } from "node:crypto";

/** 32 byte ngẫu nhiên mã base64url (token session và token email). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex (64 ký tự); chỉ lưu giá trị này trong DB, không lưu token thô. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Băm IP có khóa để lưu `ip_hash` mà không lưu IP thô. */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}
