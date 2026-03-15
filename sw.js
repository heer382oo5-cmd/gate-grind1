/* ── GATE GRIND v5 · SERVICE WORKER ─────────────────────
   Responsibilities:
   1. Generate & cache app icons (192 + 512px) via OffscreenCanvas
   2. Cache app shell (index.html, manifest.json)
   3. Serve all assets cache-first, network as fallback
   4. Pass through fonts/external APIs without caching
──────────────────────────────────────────────────────── */

const CACHE      = "gate-grind-v5";
const ICON_CACHE = "gate-grind-icons-v1";

/* ── ICON DRAWING ─────────────────────────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

function drawIcon(ctx, s) {
  ctx.fillStyle = "#04080F";
  ctx.fillRect(0, 0, s, s);

  const pad = Math.round(s * 0.1);
  const rad = Math.round(s * 0.2);
  roundRect(ctx, pad, pad, s - pad * 2, s - pad * 2, rad);
  ctx.fillStyle = "#0C1624";
  ctx.fill();

  ctx.save();
  roundRect(ctx, pad, pad, s - pad * 2, s - pad * 2, rad);
  ctx.clip();
  const grd = ctx.createRadialGradient(s / 2, s * 0.28, 0, s / 2, s / 2, s * 0.62);
  grd.addColorStop(0, "rgba(0,200,255,0.22)");
  grd.addColorStop(0.6, "rgba(155,95,255,0.06)");
  grd.addColorStop(1, "rgba(255,45,135,0.04)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, s, s);
  ctx.restore();

  roundRect(ctx, pad, pad, s - pad * 2, s - pad * 2, rad);
  ctx.strokeStyle = "rgba(0,200,255,0.38)";
  ctx.lineWidth = Math.max(2, Math.round(s * 0.018));
  ctx.stroke();

  ctx.fillStyle = "#00C8FF";
  ctx.font = "bold " + Math.round(s * 0.44) + "px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,200,255,0.55)";
  ctx.shadowBlur = Math.round(s * 0.06);
  ctx.fillText("G", s / 2, Math.round(s * 0.62));
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,184,0,0.88)";
  ctx.font = "bold " + Math.round(s * 0.095) + "px Arial, Helvetica, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("GATE GRIND", s / 2, Math.round(s * 0.82));
}

async function generateIcons() {
  if (typeof OffscreenCanvas === "undefined") return false;
  try {
    const cache = await caches.open(ICON_CACHE);
    for (const size of [192, 512]) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");
      drawIcon(ctx, size);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      await cache.put(
        new Request("./icon-" + size + ".png"),
        new Response(blob, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=604800"
          }
        })
      );
    }
    return true;
  } catch (err) {
    console.warn("[SW] Icon generation failed:", err);
    return false;
  }
}

/* ── INSTALL ─────────────────────────────────────────── */
self.addEventListener("install", function(e) {
  e.waitUntil(
    generateIcons()
      .then(function() {
        return caches.open(CACHE).then(function(c) {
          return c.addAll(["./index.html", "./manifest.json"]).catch(function(){});
        });
      })
      .then(function() { return self.skipWaiting(); })
  );
});

/* ── ACTIVATE ────────────────────────────────────────── */
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE && k !== ICON_CACHE; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

/* ── FETCH ───────────────────────────────────────────── */
self.addEventListener("fetch", function(e) {
  if (!e.request.url.startsWith("http")) return;

  var url = new URL(e.request.url);
  var path = url.pathname;

  // Fonts & external APIs — network only, no caching
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com")) {
    e.respondWith(
      fetch(e.request).catch(function() { return caches.match(e.request); })
    );
    return;
  }

  // App icons — serve from icon cache
  if (path.endsWith("/icon-192.png") || path.endsWith("/icon-512.png") ||
      path === "/icon-192.png" || path === "/icon-512.png") {
    e.respondWith(
      caches.open(ICON_CACHE)
        .then(function(c) { return c.match(e.request); })
        .then(function(r) { return r || fetch(e.request); })
        .catch(function() { return new Response("Icon not found", { status: 404 }); })
    );
    return;
  }

  // Everything else — cache-first, network fallback
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request)
        .then(function(r) {
          if (r && r.status === 200 && r.type !== "opaque") {
            caches.open(CACHE).then(function(cache) { cache.put(e.request, r.clone()); });
          }
          return r;
        })
        .catch(function() { return new Response("Offline", { status: 503 }); });
    })
  );
});
