function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadTopics() {
  try {
    const res = await fetch("/api/v1/home", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Debug: confirm counts coming from API
    (data.topics || []).forEach((t) => {
      const liberalCount = t.panels?.find((p) => p.viewpoint === "liberal")?.items?.length ?? 0;
      console.log(`[API] ${t.category}: liberal items=${liberalCount}`);
    });

    (data.topics || []).forEach((topic) => {
      const topicElement = document.querySelector(`details[data-category="${topic.category}"]`);
      if (!topicElement) {
        console.warn(`[UI] No <details> found for category="${topic.category}"`);
        return;
      }

      // Update "Updated:" badge
      topicElement.querySelectorAll(".topicMeta .badge").forEach((b) => {
        if (b.textContent.trim().startsWith("Updated:")) {
          const d = new Date(topic.updatedAt || Date.now());
          b.textContent = `Updated: ${d.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
          })}`;
        }
      });

      (topic.panels || []).forEach((panel) => {
        const selector = `.panel.${panel.viewpoint} ol.headlines`;
        const listEl = topicElement.querySelector(selector);

        if (!listEl) {
          console.warn(`[UI] Missing list for selector: ${selector} (category="${topic.category}")`);
          return;
        }

        listEl.innerHTML = "";

        (panel.items || []).forEach((item) => {
          const li = document.createElement("li");
          li.className = "headlineItem";

          const safeTitle = escapeHtml(item.title);
          const sourceName = escapeHtml(item.source?.name || "Source");
          const publishedAt = escapeHtml(item.publishedAt || "");
          const url = item.url || "#";

          li.innerHTML = `
            <a class="headlineLink" href="${url}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
            <div class="sourceLine">Source: ${sourceName} · ${publishedAt}</div>
          `;

          listEl.appendChild(li);
        });

        // Debug: confirm how many items were rendered
        console.log(`[UI] Rendered ${panel.items?.length ?? 0} items → ${topic.category} / ${panel.viewpoint}`);
      });
    });
  } catch (err) {
    console.error("Failed to load topics:", err);
  }
}

// Run after DOM is ready (prevents “ran too early” issues)
document.addEventListener("DOMContentLoaded", loadTopics);
