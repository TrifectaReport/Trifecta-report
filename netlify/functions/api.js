/**
 * Netlify Function: api
 *
 * Routes (with netlify.toml redirect):
 *   GET /api/v1/home  -> /.netlify/functions/api/v1/home
 *   GET /health       -> /.netlify/functions/api/health
 */

function jsonResponse(statusCode, body, extraHeaders) {
  return {
    statusCode: statusCode,
    headers: Object.assign(
      {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      extraHeaders || {}
    ),
    body: JSON.stringify(body),
  };
}

function getRoutePath(event) {
  // Netlify calls functions at:
  //   /.netlify/functions/<name>/<splat>
  // and with redirects your event.path will look like that too.
  var p = (event && event.path) ? event.path : "";
  var fnPrefix = "/.netlify/functions/api";
  if (p.indexOf(fnPrefix) === 0) {
    var rest = p.slice(fnPrefix.length);
    return rest ? rest : "/";
  }
  return p ? p : "/";
}

exports.handler = async function (event) {
  try {
    var method = ((event && event.httpMethod) ? event.httpMethod : "GET").toUpperCase();
    var routePath = getRoutePath(event);

    if (method !== "GET") {
      return jsonResponse(405, { error: "Method Not Allowed" }, { allow: "GET" });
    }

    // Health
    if (routePath === "/health" || routePath === "/health/") {
      return jsonResponse(200, { status: "ok" });
    }

    // Home: accept /v1/home (what redirects produce)
    // Also accept /api/v1/home just in case you ever call it directly
    var isHome =
      routePath === "/v1/home" ||
      routePath === "/v1/home/" ||
      routePath === "/api/v1/home" ||
      routePath === "/api/v1/home/";

    if (isHome) {
      var nowIso = new Date().toISOString();
      var today = nowIso.slice(0, 10);

      // 10 items per panel so your UI fills out all 10
      function makeItems(prefix, sourceName) {
        var items = [];
        for (var i = 1; i <= 10; i++) {
          items.push({
            id: prefix + "-" + i,
            title: "Sample headline " + i,
            url: "https://example.com",
            source: { name: sourceName },
            publishedAt: today,
          });
        }
        return items;
      }

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
              { viewpoint: "liberal", items: makeItems("ts-l", "CNN") },
              { viewpoint: "libertarian", items: makeItems("ts-lib", "Reason") },
              { viewpoint: "conservative", items: makeItems("ts-c", "Fox News") },
            ],
          },
          {
            topicKey: "politics",
            title: "Politics",
            category: "Politics",
            updatedAt: nowIso,
            panels: [
              { viewpoint: "liberal", items: makeItems("p-l", "MSNBC") },
              { viewpoint: "libertarian", items: makeItems("p-lib", "Cato Institute") },
              { viewpoint: "conservative", items: makeItems("p-c", "The Daily Wire") },
            ],
          },
        ],
      });
    }

    return jsonResponse(404, { error: "Not Found", path: routePath });
  } catch (err) {
    // Prevent "function crashed" and return JSON instead
    return jsonResponse(500, {
      error: "Function Error",
      message: err && err.message ? err.message : String(err),
    });
  }
