const Parser = require("rss-parser");
const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "TrifectaReportBot/1.0 (+https://trifectareport.com)" },
});

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

// ✅ Put your feeds here first (we’ll move to sources.json after it works)
const FEEDS = {
  "top-stories": {
    liberal: [
      { name: "Reuters Top News", url: "https://feeds.reuters.com/reuters/topNews" }
    ],
    libertarian: [
      { name: "Reason", url: "https://reason.com/feed/" }
    ],
    conservative: [
      { name: "Fox News", url: "https://moxie.foxnews.com/google-publisher/latest.xml" }
    ],
  },
};

async function fetchFeedItems(feed, limit) {
  const data = await parser.parseURL(feed.url);
  const items = Array.isArray(data.items) ? data.items : [];

  return items.slice(0, limit).map((it, idx) => ({
    id: `${feed.name}-${idx}-${(it.guid || it.link || "").slice(-12)}`.replace(/\s+/g, "-"),
    title: it.title || "(untitled)",
    url: it.link || "",
    source: { name: feed.name },
    publishedAt: it.isoDate ? it.isoDate.slice(0, 10) : "",
  }));
}

async function buildPanel(viewpoint, feeds, itemsPerPanel) {
  // Pull from multiple feeds until we have enough items
  const collected = [];
  for (const feed of feeds) {
    try {
      const items = await fetchFeedItems(feed, itemsPerPanel);
      for (const item of items) {
        // basic dedupe by URL
        if (item.url && !collected.some((x) => x.url === item.url)) collected.push(item);
        if (collected.length >= itemsPerPanel) break;
      }
    } catch (e) {
      // Keep going even if one feed fails
      console.log(`[RSS] Failed: ${feed.name} ${feed.url}`, e.message || e);
    }
    if (collected.length >= itemsPerPanel) break;
  }

  return { viewpoint, items: collected.slice(0, itemsPerPanel) };
}

exports.handler = async (event) => {
  const method = (event.httpMethod || "GET").toUpperCase();
  const routePath = getRoutePath(event);

  if (method !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed" }, { allow: "GET" });
  }

  if (routePath === "/health" || routePath === "/health/") {
    return jsonResponse(200, { status: "ok" });
  }

  const isHome =
    routePath === "/api/v1/home" ||
    routePath === "/api/v1/home/" ||
    routePath === "/v1/home" ||
    routePath === "/v1/home/";

  if (!isHome) return jsonResponse(404, { error: "Not Found", path: routePath });

  const nowIso = new Date().toISOString();
  const itemsPerPanel = 10;

  // Top Stories only (for now)
  const feeds = FEEDS["top-stories"];

  const [liberal, libertarian, conservative] = await Promise.all([
    buildPanel("liberal", feeds.liberal, itemsPerPanel),
    buildPanel("libertarian", feeds.libertarian, itemsPerPanel),
    buildPanel("conservative", feeds.conservative, itemsPerPanel),
  ]);

  return jsonResponse(200, {
    meta: {
      generatedAt: nowIso,
      limits: { itemsPerPanel, panelsPerTopic: 3 },
    },
    topics: [
      {
        topicKey: "top-stories",
        title: "Top Stories",
        category: "Top Stories",
        updatedAt: nowIso,
        panels: [liberal, libertarian, conservative],
      },
    ],
  });
};
