const state = {
  query: "",
  type: "",
  course: "",
  diet: "",
  cookability: "",
  difficulty: "",
  cleanup: "",
  tag: "",
  quick: "all",
};

let entries = [];

const page = document.body.dataset.page;
const els = {
  search: document.getElementById("searchInput"),
  clear: document.getElementById("clearSearch"),
  type: document.getElementById("typeFilter"),
  course: document.getElementById("courseFilter"),
  diet: document.getElementById("dietFilter"),
  cookability: document.getElementById("cookabilityFilter"),
  difficulty: document.getElementById("difficultyFilter"),
  cleanup: document.getElementById("cleanupFilter"),
  tag: document.getElementById("tagFilter"),
  cards: document.getElementById("entryGrid"),
  count: document.getElementById("resultCount"),
  quick: document.querySelectorAll("[data-quick]"),
  homeShelves: document.getElementById("homeShelves"),
  homeResults: document.getElementById("homeSearchResults"),
  homeResultGrid: document.getElementById("homeResultGrid"),
  homeResultCount: document.getElementById("homeResultCount"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function option(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function titleCase(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function countBy(values) {
  const map = new Map();
  values.forEach(value => map.set(value, (map.get(value) || 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function uniqueFacet(groupName) {
  const rows = entries
    .map(entry => entry.classification?.[groupName])
    .filter(value => value?.id && value?.label);
  return [...new Map(rows.map(value => [value.id, value.label])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
}

function buildBrowseFilters() {
  if (!els.type) return;
  const types = [...new Set(entries.map(entry => entry.type))].sort();
  const courses = uniqueFacet("course");
  const diets = uniqueFacet("diet");
  const cookabilities = [...new Map(entries.map(entry => [entry.quality?.cookability?.id, entry.quality?.cookability?.label]).filter(([id]) => id)).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const difficulties = [...new Set(entries.map(entry => entry.effort?.difficulty_level).filter(Boolean))].sort((a, b) => a - b);
  const cleanups = [...new Set(entries.map(entry => entry.effort?.cleanup_level).filter(value => value !== undefined && value !== null))].sort((a, b) => a - b);
  const tags = countBy(entries.flatMap(entry => entry.tags.map((tag, index) => `${tag}|||${entry.tag_labels[index] || tag}`)));

  els.type.innerHTML = option("", "All types") + types.map(type => option(type, titleCase(type))).join("");
  els.course.innerHTML = option("", "All courses") + courses.map(([id, label]) => option(id, label)).join("");
  els.diet.innerHTML = option("", "Any diet") + diets.map(([id, label]) => option(id, label)).join("");
  els.cookability.innerHTML = option("", "Any cookability") + cookabilities.map(([id, label]) => option(id, label)).join("");
  els.difficulty.innerHTML = option("", "Any difficulty") + difficulties.map(level => option(level, `${level} / 5`)).join("");
  els.cleanup.innerHTML = option("", "Any cleanup") + cleanups.map(level => option(level, `${level} / 5`)).join("");
  els.tag.innerHTML = option("", "All tags") + tags
    .map(([packed, count]) => {
      const [tag, label] = packed.split("|||");
      return option(tag, `${label} (${count})`);
    })
    .join("");
}

function normalizedTokens(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function matchesSearch(entry) {
  const tokens = normalizedTokens(state.query);
  return tokens.every(token => entry.search_text.includes(token));
}

function matchesQuick(entry) {
  if (state.quick === "all") return true;
  if (state.quick === "cookable_now") return Boolean(entry.is_cookable_now);
  if (state.quick === "needs_details") return entry.quality?.cookability?.id === "usable_with_notes" || entry.quality?.cookability?.id === "incomplete";
  if (state.quick === "reference") return entry.quality?.cookability?.id === "reference_only";
  if (state.quick === "use_caution") return Boolean(entry.flags?.safety || entry.flags?.warning);
  return entry.shelf_ids?.includes(state.quick);
}

function matchesFilters(entry) {
  if (!matchesSearch(entry)) return false;
  if (!matchesQuick(entry)) return false;
  if (state.type && entry.type !== state.type) return false;
  if (state.course && entry.classification?.course?.id !== state.course) return false;
  if (state.diet && entry.classification?.diet?.id !== state.diet) return false;
  if (state.cookability && entry.quality?.cookability?.id !== state.cookability) return false;
  if (state.difficulty && String(entry.effort?.difficulty_level) !== state.difficulty) return false;
  if (state.cleanup && String(entry.effort?.cleanup_level) !== state.cleanup) return false;
  if (state.tag && !entry.tags.includes(state.tag)) return false;
  return true;
}

function timeLabel(entry) {
  return entry.effort?.total_time || entry.effort?.prep_time || entry.effort?.cook_time || "time varies";
}

function badgeHtml(entry) {
  return (entry.public_badges || [])
    .slice(0, 2)
    .map(badge => `<span class="public-badge ${escapeHtml(badge.id)}">${escapeHtml(badge.label)}</span>`)
    .join("");
}

function card(entry) {
  const diet = entry.classification?.diet?.id !== "unknown" ? entry.classification?.diet?.label : null;
  const facets = [
    entry.classification?.course?.label,
    diet,
    entry.effort?.difficulty_level ? `${entry.effort.difficulty_level} / 5` : null,
    timeLabel(entry),
  ].filter(Boolean);
  const ingredients = (entry.classification?.main_ingredients || []).slice(0, 3).map(item => item.label);
  const tagRow = ingredients.length ? ingredients : entry.tag_labels.slice(0, 3);
  return `
    <a class="entry-card" href="${escapeHtml(entry.detail_url)}">
      <div class="thumb-wrap">
        <img class="thumb" src="${escapeHtml(entry.thumbnail_url)}" alt="" loading="lazy">
      </div>
      <div class="card-body">
        <div class="badge-row">${badgeHtml(entry)}</div>
        <h3 class="card-title">${escapeHtml(entry.title)}</h3>
        <div class="meta-row">${facets.map(value => `<span class="pill">${escapeHtml(value)}</span>`).join("")}</div>
        <p class="card-summary">${escapeHtml(entry.summary)}</p>
        <div class="tag-row">${tagRow.map(value => `<span class="tag">${escapeHtml(value)}</span>`).join("")}</div>
      </div>
    </a>
  `;
}

function renderHomeShelves() {
  document.querySelectorAll("[data-shelf]").forEach(section => {
    const shelfId = section.dataset.shelf;
    const target = document.getElementById(`shelf-${shelfId}`);
    const shelfEntries = entries
      .filter(entry => entry.shelf_ids?.includes(shelfId))
      .slice(0, 10);
    target.innerHTML = shelfEntries.length
      ? shelfEntries.map(card).join("")
      : `<div class="empty-state">No entries in this shelf yet.</div>`;
  });
}

function renderHomeSearch() {
  state.query = els.search?.value.trim() || "";
  const hasQuery = Boolean(state.query);
  els.homeShelves?.classList.toggle("is-hidden", hasQuery);
  els.homeResults?.classList.toggle("is-hidden", !hasQuery);
  if (!hasQuery) return;
  const matches = entries.filter(matchesSearch);
  els.homeResultCount.textContent = `${matches.length} ${matches.length === 1 ? "entry" : "entries"}`;
  els.homeResultGrid.innerHTML = matches.length
    ? matches.slice(0, 24).map(card).join("")
    : `<div class="empty-state">No entries match that search.</div>`;
}

function syncBrowseState() {
  state.query = els.search?.value.trim() || "";
  state.type = els.type?.value || "";
  state.course = els.course?.value || "";
  state.diet = els.diet?.value || "";
  state.cookability = els.cookability?.value || "";
  state.difficulty = els.difficulty?.value || "";
  state.cleanup = els.cleanup?.value || "";
  state.tag = els.tag?.value || "";
  renderBrowse();
}

function renderBrowse() {
  const filtered = entries.filter(matchesFilters);
  if (els.count) els.count.textContent = `${filtered.length} of ${entries.length} entries`;
  if (!els.cards) return;
  els.cards.innerHTML = filtered.length
    ? filtered.map(card).join("")
    : `<div class="empty-state">No entries match those filters.</div>`;
}

function setQuick(value) {
  state.quick = value;
  els.quick.forEach(button => button.classList.toggle("is-active", button.dataset.quick === value));
  renderBrowse();
}

function initBrowseFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const shelf = params.get("shelf");
  if (!shelf) return;
  state.quick = shelf;
  els.quick.forEach(button => button.classList.toggle("is-active", button.dataset.quick === shelf));
}

fetch("search-index.json")
  .then(response => response.json())
  .then(payload => {
    entries = payload;
    if (page === "home") {
      renderHomeShelves();
      els.search?.addEventListener("input", renderHomeSearch);
      els.clear?.addEventListener("click", () => {
        els.search.value = "";
        renderHomeSearch();
      });
      return;
    }

    buildBrowseFilters();
    initBrowseFromUrl();
    [els.search, els.type, els.course, els.diet, els.cookability, els.difficulty, els.cleanup, els.tag]
      .filter(Boolean)
      .forEach(el => {
        el.addEventListener("input", syncBrowseState);
        el.addEventListener("change", syncBrowseState);
      });
    els.clear?.addEventListener("click", () => {
      els.search.value = "";
      syncBrowseState();
    });
    els.quick.forEach(button => button.addEventListener("click", () => setQuick(button.dataset.quick)));
    renderBrowse();
  });
