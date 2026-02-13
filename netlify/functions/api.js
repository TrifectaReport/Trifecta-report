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

exports.handler = async (event) => {
  const method = (event.httpMethod || "GET").toUpperCase();
  const routePath = getRoutePath(event);

  if (method !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed" }, { allow: "GET" });
  }

  if (routePath === "/health" || routePath === "/health/") {
    return jsonResponse(200, { status: "ok" });
  }

  if (routePath === "/v1/home" || routePath === "/v1/home/") {
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
              items: [
                { id: "ts-l-1", title: "Sample Top Story (Liberal)", url: "https://example.com", source: { name: "CNN" }, publishedAt: today },
              ],
            },
            {
              viewpoint: "libertarian",
              items: [
                { id: "ts-lib-1", title: "Sample Top Story (Libertarian)", url: "https://example.com", source: { name: "Reason" }, publishedAt: today },
              ],
            },
            {
              viewpoint: "conservative",
              items: [
                { id: "ts-c-1", title: "Sample Top Story (Conservative)", url: "https://example.com", source: { name: "Fox News" }, publishedAt: today },
              ],
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
              items: [
                { id: "p-l-1", title: "Sample Politics headline (Liberal)", url: "https://example.com", source: { name: "MSNBC" }, publishedAt: today },
              ],
            },
            {
              viewpoint: "libertarian",
              items: [
                { id: "p-lib-1", title: "Sample Politics headline (Libertarian)", url: "https://example.com", source: { name: "Cato Institute" }, publishedAt: today },
              ],
            },
            {
              viewpoint: "conservative",
              items: [
                { id: "p-c-1", title: "Sample Politics headline (Conservative)", url: "https://example.com", source: { name: "The Daily Wire" }, publishedAt: today },
              ],
            },
          ],
        },
      ],
    });
  }

  return jsonResponse(404, { error: "Not Found", path: routePath });
};
