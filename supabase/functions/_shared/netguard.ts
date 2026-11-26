// Validação de URLs e proteção contra SSRF (parte pura, sem dependências do Deno).

const BLOCKED_HOST_SUFFIXES = [
  "localhost", ".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".arpa",
  ".supabase.internal", "metadata.google.internal",
];

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

export function parseIPv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

export function isPrivateIPv4(ip: string): boolean {
  const p = parseIPv4(ip);
  if (!p) return false;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // link-local / metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                              // multicast / reservado
  );
}

export function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true; // link-local
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // ULA
  if (s.startsWith("ff")) return true; // multicast
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (s.startsWith("::ffff:")) return true; // formato hex mapeado: bloquear por segurança
  if (s.startsWith("64:ff9b:")) return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Validação estática da URL: protocolo, credenciais, porta, host. A resolução DNS é feita em safeFetch. */
export function validatePublicUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "Protocolo não permitido" };
  if (url.username || url.password) return { ok: false, reason: "URL com credenciais não é permitida" };
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, reason: `Porta ${url.port} não permitida` };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host.length > 253) return { ok: false, reason: "Host inválido" };
  if (BLOCKED_HOST_SUFFIXES.some((s) => host === s.replace(/^\./, "") || host.endsWith(s))) {
    return { ok: false, reason: "Host interno não permitido" };
  }
  if (parseIPv4(host) || host.includes(":")) {
    if (isPrivateAddress(host)) return { ok: false, reason: "Endereço IP privado não permitido" };
    return { ok: false, reason: "Acesso direto por IP não é permitido" };
  }
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return { ok: false, reason: "Host numérico não permitido" };
  if (!host.includes(".")) return { ok: false, reason: "Host sem domínio público" };
  return { ok: true, url };
}
