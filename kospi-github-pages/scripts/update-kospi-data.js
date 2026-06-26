const https = require("https");
const fs = require("fs");
const path = require("path");

const YAHOO_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?range=5y&interval=1d&includePrePost=false&events=history";

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
          resolve(JSON.parse(data));
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("Yahoo Finance request timed out")));
    req.on("error", reject);
  });
}

function round(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toDate(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
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
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = [];
  const window = [];
  let sum = 0;

  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (close == null || Number.isNaN(close)) continue;

    window.push(close);
    sum += close;
    if (window.length > 50) sum -= window.shift();

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

  return {
    symbol: "^KS11",
    name: "KOSPI Composite Index",
    source: "Yahoo Finance chart API · GitHub Actions 자동 갱신",
    fetchedAt: new Date().toISOString(),
    marketTime: result?.meta?.regularMarketTime
      ? new Date(result.meta.regularMarketTime * 1000).toISOString()
      : null,
    latest: completePoints.at(-1) || null,
    points: completePoints,
  };
}

async function main() {
  const raw = await fetchJson(YAHOO_URL);
  const payload = buildPayload(raw);
  const outputDir = path.join(__dirname, "..", "public", "data");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "kospi.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.points.length} records to public/data/kospi.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
