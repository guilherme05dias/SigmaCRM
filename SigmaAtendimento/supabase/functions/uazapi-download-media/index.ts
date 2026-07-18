type DownloadRequest = { messageId?: string };

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-internal-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedToken = Deno.env.get("SIGMA_INTERNAL_TOKEN")?.trim() || "";
  const receivedToken = req.headers.get("x-internal-token") || "";
  if (!expectedToken || !receivedToken || !(await secretsEqual(receivedToken, expectedToken))) {
    return json({ error: "Invalid internal token" }, 401);
  }

  const payload = await req.json().catch(() => null) as DownloadRequest | null;
  const messageId = payload?.messageId?.trim();
  if (!messageId) return json({ error: "messageId is required" }, 400);

  const token = Deno.env.get("UAZAPI_TOKEN")?.trim();
  const baseUrl = (Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com").replace(/\/$/, "");
  if (!token) return json({ error: "Missing UAZAPI_TOKEN" }, 500);

  const providerMessageId = messageId.includes(":") ? messageId.split(":").at(-1)! : messageId;
  const upstream = await fetch(`${baseUrl}/message/download`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, token },
    body: JSON.stringify({ id: providerMessageId, return_base64: true, return_link: true }),
  });

  if (!upstream.ok) {
    const details = await upstream.text().catch(() => "");
    return json({ error: "Falha ao baixar mídia da UAZAPI", details: details.slice(0, 500) }, 502);
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return binary(upstream, contentType);
  }

  const result = await upstream.json().catch(() => null);
  const source = findMediaSource(result);
  if (!source) return json({ error: "A UAZAPI não retornou o arquivo da mídia.", details: describeShape(result) }, 502);

  if (source.startsWith("data:")) {
    const decoded = decodeDataUrl(source);
    return new Response(decoded.data, { status: 200, headers: { ...corsHeaders, "content-type": decoded.contentType, "cache-control": "private, max-age=300" } });
  }
  if (/^https?:\/\//i.test(source)) {
    const file = await fetch(source, { headers: { authorization: `Bearer ${token}`, token } });
    if (!file.ok) return json({ error: "A UAZAPI retornou um link de mídia indisponível." }, 502);
    return binary(file, file.headers.get("content-type") || "application/octet-stream");
  }

  const decoded = decodeBase64(source);
  return new Response(decoded, { status: 200, headers: { ...corsHeaders, "content-type": inferContentType(result), "cache-control": "private, max-age=300" } });
});

function findMediaSource(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["dataUrl", "data_url", "mediaUrl", "media_url", "fileURL", "fileUrl", "url", "file", "base64", "data"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const key of ["data", "message", "media", "result"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object") {
      const nested = findMediaSource(candidate);
      if (nested) return nested;
    }
  }
  return null;
}

function inferContentType(value: unknown): string {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  for (const key of ["mimetype", "mimeType", "contentType"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return "application/octet-stream";
}

function describeShape(value: unknown, depth = 0): unknown {
  if (depth > 2 || value === null || value === undefined) return typeof value;
  if (Array.isArray(value)) return { array: true, length: value.length, first: describeShape(value[0], depth + 1) };
  if (typeof value !== "object") return typeof value === "string" ? { stringLength: value.length } : typeof value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, describeShape(entry, depth + 1)]));
}

function decodeDataUrl(value: string): { contentType: string; data: Uint8Array } {
  const match = /^data:([^;,]+)?;base64,(.+)$/s.exec(value);
  if (!match) throw new Error("Data URL de mídia inválida.");
  return { contentType: match[1] || "application/octet-stream", data: decodeBase64(match[2]) };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/^base64,/, "").replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function binary(response: Response, contentType: string): Response {
  return new Response(response.body, { status: 200, headers: { ...corsHeaders, "content-type": contentType || "application/octet-stream", "cache-control": "private, max-age=300" } });
}

async function secretsEqual(received: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [receivedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(receivedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } });
}
