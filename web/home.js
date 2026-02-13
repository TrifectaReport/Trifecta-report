async function loadTopics() {
  try {
    const res = await fetch("/api/v1/home", { headers: { "accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    (data.topics || []).forEach((topic) => {
      const topicElement = document.querySelector(`details[data-category="${topic.category}"]`);
      if (!topicElement) return;

      topicElement.querySelectorAll(".topicMeta .badge").forEach((b) => {
        if (b.textContent.trim().startsWith("Updated:")) {
          const d = new Date(topic.updatedAt || Date.now());
          b.textContent = `Updated: ${d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })}`;
        }
      });

      (topic.panels || []).forEach((panel) => {
        const listEl = topicElement.querySelector(`.panel.${panel.viewpoint} ol.headlines`);
        if (!listEl) return;

        listEl.innerHTML = "";

        (panel.items || []).forEach((item) => {
          const li = document.createElement("li");
          li.className = "headlineItem";

          const safeTitle = (item.title || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const sourceName = item.source && item.source.name ? item.source.name : "Source";
          const publishedAt = item.publishedAt || "";

          li.innerHTML = `
            <a class="headlineLink" href="${item.url}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
            <div class="sourceLine">Source: ${sourceName} · ${publishedAt}</div>
          `;

          listEl.appendChild(li);
        });
      });
    });
  } catch (err) {
    console.error("Failed to load topics:", err);
  }
}

loadTopics();
