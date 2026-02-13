/**
 * Netlify Function: api
 *
 * Handles:
 *   GET /api/v1/home -> JSON payload your frontend uses
 *   GET /health      -> { status: "ok" }
 *
 * With netlify.toml redirects, /api/* is rewritten to:
 *   /.netlify/functions/api/<splat>
 */

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

// ✅ Generates exactly N items so your UI always has 10 links per panel
function makeItems(prefix, sourceName, label, urlBase, today, count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    title: `${label} #${i + 1}`,
    url: `${urlBase}?id=${encodeURIComponent(prefix)}-${i + 1}`,
    source: { name: sourceName },
    publishedAt: today,
  }));
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

  // ✅ support /api/v1/home AND /v1/home (with or without trailing slash)
  const isHome =
    routePath === "/api/v1/home" ||
    routePath === "/api/v1/home/" ||
    routePath === "/v1/home" ||
    routePath === "/v1/home/";

  if (isHome) {
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    return jsonResponse(200, {
      meta: {
        generatedAt: nowIso,
        limits: { itemsPerPanel: 10, panelsPerTopic: 3 },
      },
      topics: [
        {
          topicKey: "top-stories",
          title: "Top Stories",
          category: "Top Stories",
          updatedAt: nowIso,
          panels: [
            {
              viewpoint: "liberal",
              items: makeItems(
                "ts-l",
                "CNN",
                "Sample Top Story (Liberal)",
                "https://example.com",
                today,
                10
              ),
            },
            {
              viewpoint: "libertarian",
              items: makeItems(
                "ts-lib",
                "Reason",
                "Sample Top Story (Libertarian)",
                "https://example.com",
                today,
                10
              ),
            },
            {
              viewpoint: "conservative",
              items: makeItems(
                "ts-c",
                "Fox News",
                "Sample Top Story (Conservative)",
                "https://example.com",
                today,
                10
              ),
            },
          ],
        },
        {
          topicKey: "politics",
          title: "Politics",
          category: "Politics",
          updatedAt: nowIso,
          panels: [
            {
              viewpoint: "liberal",
              items: makeItems(
                "p-l",
                "MSNBC",
                "Sample Politics headline (Liberal)",
                "https://example.com",
                today,
                10
              ),
            },
            {
              viewpoint: "libertarian",
              items: makeItems(
                "p-lib",
                "Cato Institute",
                "Sample Politics headline (Libertarian)",
                "https://example.com",
                today,
                10
              ),
            },
            {
              viewpoint: "conservative",
              items: makeItems(
                "p-c",
                "The Daily Wire",
                "Sample Politics headline (Conservative)",
                "https://example.com",
                today,
                10
              ),
            },
          ],
        },
      ],
    });
  }

  return jsonResponse(404, { error: "Not Found", path: routePath });
};
