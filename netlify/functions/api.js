\
/**
 * Netlify Function: api (Strict Balance RSS backend)
 *
 * Routes (via netlify.toml redirect /api/* -> /.netlify/functions/api/:splat):
 *   GET /api/v1/home   -> Aggregated JSON for the frontend
 *   GET /health        -> { status: "ok" }
 *
 * Files expected:
 *   netlify/functions/sources.json
 *
 * Notes:
 * - Uses Node 18+ built-in fetch (no npm deps).
 * - Parses RSS2 (<item>) and Atom (<entry>) via lightweight regex.
 */

const DEFAULT_LIMIT = 10;
const FETCH_TIMEOUT_MS = 9000;
const USER_AGENT = "TrifectaReportBot/1.0 (+https://example.com)";

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function getRoutePath(event) {
  const p = event.path || "";
  const fnPrefix = "/.netlify/functions/api";
  if (p.startsWith(fnPrefix)) return p.slice(fnPrefix.length) || "/";
  return p || "/";
}

function decodeEntities(str = "") {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripCdata(str = "") {
  return str.replace(/^<!\[CDATA\[(.*)\]\]>$/s, "$1");
}

function textBetween(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1].trim()));
}

function attrValue(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]+)"[^>]*\\/?>`, "i");
  const m = xml.match(re);
  return m ? decodeEntities(m[1].trim()) : "";
}

function toISODate(input) {
  if (!input) return "";
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString();
  const cleaned = String(input).replace(/\s+\w+\/\w+\s*$/i, "").trim();
  const d2 = new Date(cleaned);
  return isNaN(d2.getTime()) ? "" : d2.toISOString();
}

function isoToYYYYMMDD(iso) {
  return iso ? iso.slice(0, 10) : "";
}

async function fetchText(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "user-agent": USER_AGENT,
      },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function parseRSS2Items(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = textBetween(block, "title");
    let link = textBetween(block, "link");
    if (!link) link = attrValue(block, "link", "href");
    const pubDate = textBetween(block, "pubDate") || textBetween(block, "dc:date");
    const iso = toISODate(pubDate);
    const url = (link || "").trim();
    if (!title || !url) continue;
    items.push({
      title: title.trim(),
      url,
      publishedAtISO: iso,
      publishedAt: isoToYYYYMMDD(iso) || "",
    });
  }
  return items;
}

function parseAtomEntries(xml) {
  const items = [];
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const block of entryBlocks) {
    const title = textBetween(block, "title");
    let link = "";
    const linkCandidates = block.match(/<link\b[^>]*\/?>/gi) || [];
    for (const l of linkCandidates) {
      const rel = (l.match(/\brel="([^"]+)"/i) || [])[1] || "";
      const href = (l.match(/\bhref="([^"]+)"/i) || [])[1] || "";
      if (!href) continue;
      if (!link) link = href;
      if (rel.toLowerCase() === "alternate") { link = href; break; }
    }
    const updated = textBetween(block, "updated") || textBetween(block, "published");
    const iso = toISODate(updated);
    const url = (decodeEntities(link) || "").trim();
    if (!title || !url) continue;
    items.push({
      title: title.trim(),
      url,
      publishedAtISO: iso,
      publishedAt: isoToYYYYMMDD(iso) || "",
    });
  }
  return items;
}

function parseFeed(xml) {
  const rssItems = parseRSS2Items(xml);
  if (rssItems.length) return rssItems;
  return parseAtomEntries(xml);
}

function dedupeByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function sortNewest(items) {
  return [...items].sort((a, b) => {
    const ta = a.publishedAtISO ? Date.parse(a.publishedAtISO) : 0;
    const tb = b.publishedAtISO ? Date.parse(b.publishedAtISO) : 0;
    return tb - ta;
  });
}

function makeId(prefix, url, idx) {
  const h = String(url).replace(/[^a-z0-9]+/gi, "-").slice(0, 40).replace(/^-+|-+$/g, "");
  return `${prefix}-${h || "item"}-${idx}`;
}

function loadSources() {
  const fs = require("fs");
  const path = require("path");
  const p = path.join(__dirname, "sources.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function buildTopStoriesTopic(topicDef) {
  const nowIso = new Date().toISOString();
  const viewpoints = ["liberal", "libertarian", "conservative"];
  const panelsOut = [];

  for (const vp of viewpoints) {
    const feeds = (topicDef.panels && topicDef.panels[vp]) ? topicDef.panels[vp] : [];
    const allItems = [];

    const results = await Promise.allSettled(
      feeds.map(async (src) => {
        const xml = await fetchText(src.rss);
        const parsed = parseFeed(xml);
        return parsed.map((it) => ({
          title: it.title,
          url: it.url,
          source: { name: src.name },
          publishedAt: it.publishedAt || "",
          publishedAtISO: it.publishedAtISO || "",
        }));
      })
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") allItems.push(...r.value);
      else console.log(`RSS failed for ${feeds[i]?.name || "unknown"}:`, String(r.reason || ""));
    }

    const merged = dedupeByUrl(allItems);
    const sorted = sortNewest(merged);

    const limited = sorted.slice(0, DEFAULT_LIMIT).map((it, idx) => ({
      id: makeId(`${topicDef.topicKey}-${vp}`, it.url, idx + 1),
      title: it.title,
      url: it.url,
      source: it.source,
      publishedAt: it.publishedAt || "",
    }));

    // If a viewpoint has fewer than 10 items, fill with "No item" placeholders (keeps UI consistent)
    while (limited.length < DEFAULT_LIMIT) {
      limited.push({
        id: `${topicDef.topicKey}-${vp}-placeholder-${limited.length + 1}`,
        title: "No story available (feed error or empty feed)",
        url: "#",
        source: { name: "Trifecta" },
        publishedAt: "",
      });
    }

    panelsOut.push({ viewpoint: vp, items: limited });
  }

  return {
    topicKey: topicDef.topicKey,
    title: topicDef.title,
    category: topicDef.category,
    updatedAt: nowIso,
    panels: panelsOut,
  };
}

exports.handler = async (event) => {
  const method = (event.httpMethod || "GET").toUpperCase();
  const routePath = getRoutePath(event);

  if (method !== "GET") return jsonResponse(405, { error: "Method Not Allowed" }, { allow: "GET" });

  if (routePath === "/health" || routePath === "/health/") {
    return jsonResponse(200, { status: "ok" });
  }

  const isHome =
    routePath === "/api/v1/home" ||
    routePath === "/api/v1/home/" ||
    routePath === "/v1/home" ||
    routePath === "/v1/home/";

  if (!isHome) return jsonResponse(404, { error: "Not Found", path: routePath });

  let sources;
  try {
    sources = loadSources();
  } catch (e) {
    return jsonResponse(500, { error: "Failed to load sources.json", details: String(e) });
  }

  const topicDef = (sources.topics || []).find((t) => t.topicKey === "top-stories");
  if (!topicDef) return jsonResponse(500, { error: "No top-stories topic found in sources.json" });

  try {
    const topStories = await buildTopStoriesTopic(topicDef);
    return jsonResponse(200, {
      meta: {
        generatedAt: new Date().toISOString(),
        mode: "strict-balance",
        limits: { itemsPerPanel: DEFAULT_LIMIT, panelsPerTopic: 3 },
      },
      topics: [topStories],
    });
  } catch (e) {
    return jsonResponse(500, { error: "Failed to build Top Stories", details: String(e) });
  }
};
