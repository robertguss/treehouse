import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".ktx2": "image/ktx2",
  ".txt": "text/plain; charset=utf-8",
};

// Maps a URL path to a file inside siteDir, or null if it would escape it.
export function resolveStaticPath(siteDir: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const root = resolve(siteDir);
  const target = resolve(join(root, decoded));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

export async function serveStatic(
  siteDir: string,
  urlPath: string,
  response: ServerResponse,
): Promise<boolean> {
  const target = resolveStaticPath(siteDir, urlPath);
  if (!target) return false;

  let file = target;
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    if (!urlPath.endsWith("/")) {
      response.writeHead(301, { location: `${urlPath}/` }).end();
      return true;
    }
    file = join(file, "index.html");
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) return false;

  const extension = extname(file);
  // Vite puts content-hashed files under assets/; everything else must revalidate so a
  // deploy reaches the iPads on the next launch.
  const immutable = urlPath.includes("/assets/") && extension !== ".html";
  response.writeHead(200, {
    "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
    "content-length": info.size,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(file).pipe(response);
  return true;
}
