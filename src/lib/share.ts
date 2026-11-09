const PREFIX = "#d=";

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(code: string): string {
  return `${PREFIX}${toBase64(code)}`;
}

export function decodeShare(hash: string): string | null {
  if (!hash || !hash.startsWith(PREFIX)) return null;
  const payload = hash.slice(PREFIX.length);
  if (!payload) return null;
  try {
    const decoded = fromBase64(payload);
    return decoded.trim() ? decoded : null;
  } catch {
    return null;
  }
}
