const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const YAHOO_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?range=5y&interval=1d&includePrePost=false&events=history";

let cachedPayload = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json,text/plain,*/*",
        },
        timeout: 15000,
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Yahoo Finance returned ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Yahoo Finance request timed out"));
    });
    req.on("error", reject);
  });
}

function toDate(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function round(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getZone(disparity) {
  if (disparity == null) return "unknown";
  if (disparity >= 130) return "overheated";
  if (disparity >= 120) return "warning";
  if (disparity > 105) return "normal";
  return "cooled";
}

function getZoneLabel(zone) {
  return {
    overheated: "과열",
    warning: "경계",
    normal: "정상",
    cooled: "과열해소",
    unknown: "데이터 준비 중",
  }[zone];
}

function buildPayload(raw) {
  const result = raw?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = quote.close || [];

  const points = [];
  const window = [];
  let sum = 0;

  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (close == null || Number.isNaN(close)) continue;

    window.push(close);
    sum += close;
    if (window.length > 50) {
      sum -= window.shift();
    }

    const ma50 = window.length === 50 ? sum / 50 : null;
    const disparity = ma50 ? (close / ma50) * 100 : null;
    const zone = getZone(disparity);

    points.push({
      date: toDate(timestamps[index]),
      close: round(close, 2),
      ma50: round(ma50, 2),
      disparity: round(disparity, 2),
      zone,
      zoneLabel: getZoneLabel(zone),
    });
  }

  const completePoints = points.filter((point) => point.ma50 != null);
  const latest = completePoints.at(-1) || null;

  return {
    symbol: "^KS11",
    name: "KOSPI Composite Index",
    source: "Yahoo Finance chart API",
    fetchedAt: new Date().toISOString(),
    marketTime: result?.meta?.regularMarketTime
      ? new Date(result.meta.regularMarketTime * 1000).toISOString()
      : null,
    latest,
    points: completePoints,
  };
}

async function handleKospi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const shouldRefresh = url.searchParams.get("refresh") === "1";

  if (!shouldRefresh && cachedPayload && Date.now() - cachedAt < CACHE_MS) {
    sendJson(res, 200, { ...cachedPayload, cached: true });
    return;
  }

  try {
    const raw = await fetchJson(YAHOO_URL);
    cachedPayload = buildPayload(raw);
    cachedAt = Date.now();
    sendJson(res, 200, { ...cachedPayload, cached: false });
  } catch (error) {
    sendJson(res, 502, {
      error: "코스피 데이터를 불러오지 못했습니다.",
      detail: error.message,
      cached: false,
    });
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".ico": "image/x-icon",
    }[ext] || "application/octet-stream"
  );
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const cleanPath = decodeURIComponent(requestUrl.pathname);
  const requestedPath =
    cleanPath === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, cleanPath);
  const normalized = path.normalize(requestedPath);

  if (!normalized.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(normalized, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": getContentType(normalized),
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/kospi")) {
    handleKospi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`KOSPI strategy tracker running at http://${HOST}:${PORT}`);
});
