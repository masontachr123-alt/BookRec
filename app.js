const sampleBooks = [
  { title: "Piranesi", author: "Susanna Clarke", tags: ["literary", "fantasy", "mysterious", "atmospheric"] },
  { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", tags: ["science-fiction", "literary", "political", "speculative"] },
  { title: "The Dispossessed", author: "Ursula K. Le Guin", tags: ["science-fiction", "political", "philosophical", "speculative"] },
  { title: "The Secret History", author: "Donna Tartt", tags: ["literary", "mysterious", "dark-academia", "psychological"] },
  { title: "The City & the City", author: "China Miéville", tags: ["mysterious", "science-fiction", "literary", "political"] },
  { title: "Kindred", author: "Octavia E. Butler", tags: ["science-fiction", "historical", "political", "emotional"] },
  { title: "Sea of Tranquility", author: "Emily St. John Mandel", tags: ["science-fiction", "literary", "time-travel", "atmospheric"] },
  { title: "The Employees", author: "Olga Ravn", tags: ["science-fiction", "experimental", "philosophical", "strange"] },
  { title: "The Memory Police", author: "Yoko Ogawa", tags: ["literary", "dystopian", "mysterious", "atmospheric"] },
  { title: "Babel", author: "R.F. Kuang", tags: ["historical", "dark-academia", "political", "fantasy"] },
  { title: "The Book of Form and Emptiness", author: "Ruth Ozeki", tags: ["literary", "magical-realism", "emotional", "philosophical"] },
  { title: "Station Eleven", author: "Emily St. John Mandel", tags: ["literary", "dystopian", "emotional", "atmospheric"] },
  { title: "The Haunting of Hill House", author: "Shirley Jackson", tags: ["horror", "psychological", "mysterious", "atmospheric"] },
  { title: "The Master and Margarita", author: "Mikhail Bulgakov", tags: ["literary", "fantasy", "satire", "strange"] },
  { title: "Drive Your Plow Over the Bones of the Dead", author: "Olga Tokarczuk", tags: ["mysterious", "literary", "political", "strange"] }
];

const els = {
  input: document.querySelector("#csv-input"),
  demo: document.querySelector("#demo-button"),
  excludeDnf: document.querySelector("#exclude-dnf"),
  clear: document.querySelector("#clear-button"),
  empty: document.querySelector("#shelf-empty"),
  shelf: document.querySelector("#shelf-list"),
  recommendations: document.querySelector("#recommendations"),
  grid: document.querySelector("#recommendation-grid"),
  count: document.querySelector("#shelf-count"),
  title: document.querySelector("#shelf-title")
  ,catalogStatus: document.querySelector("#catalog-status"),
  refresh: document.querySelector("#refresh-button"),
  searchDeeper: document.querySelector("#search-deeper-button")
};
let shelf = [];
let importedShelf = [];
let catalog = sampleBooks;
let recommendationSeed = Math.random();
let catalogSubjects = [];
let catalogPages = new Map();
let catalogTotals = new Map();
let catalogLoading = false;

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])))
    .filter((book) => book.title);
}

function isDidNotFinish(book) {
  const shelfText = `${book.exclusiveshelf || ""} ${book.bookshelves || ""} ${book.shelves || ""}`.toLowerCase();
  return /\b(dnf|did[\s-]?not[\s-]?finish|did[\s-]?not[\s-]?read|abandoned)\b/.test(shelfText);
}

function ratingStars(value) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? "★".repeat(rating) : "";
}

function tagsFor(book) {
  const subjects = [...(book.tags || []), book.shelves || "", book.bookshelves || "", book.exclusiveshelf || ""];
  return [...new Set(subjects.flatMap((subject) => String(subject).split(/[,;/]/).map(normalizeSubject).filter(Boolean)))];
}

function normalizeSubject(subject) {
  const normalized = String(subject).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const ignored = new Set(["fiction", "general", "books", "book", "read", "to read", "currently reading", "currently-reading", "owned", "wishlist", "favorites", "favorite", "accessible book", "large type books", "protected daisy", "in library", "nyt bestseller"]);
  if (!normalized || ignored.has(normalized) || normalized.length > 70 || /\b(award|bestseller|new york times|nyt:|edition|translations into)\b/.test(normalized)) return "";
  return normalized;
}

function buildTasteProfile() {
  const counts = new Map();
  shelf.forEach((book) => {
    const rating = Number(book.rating || book.myrating);
    const weight = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating / 3 : 1;
    new Set(tagsFor(book)).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + weight));
  });
  const totalWeight = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { weights: counts, totalWeight };
}

function rankRecommendations(candidates) {
  const profile = buildTasteProfile();
  const shelfTitles = shelf.map((book) => book.title.toLowerCase());
  const available = candidates
    .filter((book) => !shelfTitles.includes(book.title.toLowerCase()))
    .map((book) => {
      const tags = tagsFor(book);
      const matchTerms = tags.filter((tag) => profile.weights.has(tag));
      const matchedWeight = matchTerms.reduce((sum, term) => sum + profile.weights.get(term), 0);
      const score = profile.totalWeight ? Math.round(100 * matchedWeight / profile.totalWeight) : 0;
      return { ...book, tags, matchTerms, score, rankNoise: Math.random() * 3 * recommendationSeed };
    });
  const selected = [];
  const remaining = [...available];
  while (selected.length < 12 && remaining.length) {
    const next = remaining
      .map((book) => {
        const repeatedThemes = book.matchTerms.filter((tag) => selected.some((picked) => picked.matchTerms.includes(tag))).length;
        const authorRepeat = selected.some((picked) => picked.author === book.author) ? 12 : 0;
        return { book, selectionScore: book.score + book.rankNoise - repeatedThemes * 2 - authorRepeat };
      })
      .sort((a, b) => b.selectionScore - a.selectionScore)[0];
    selected.push(next.book);
    remaining.splice(remaining.indexOf(next.book), 1);
  }
  return selected;
}

const shelfSubjectCacheKey = "marginalia-openlibrary-subjects-v1";

function readSubjectCache() {
  try {
    return JSON.parse(localStorage.getItem(shelfSubjectCacheKey) || "{}");
  } catch (error) {
    console.warn("Could not read cached book subjects:", error);
    return {};
  }
}

function writeSubjectCache(cache) {
  try {
    localStorage.setItem(shelfSubjectCacheKey, JSON.stringify(cache));
  } catch (error) {
    console.warn("Could not save cached book subjects:", error);
  }
}

function normalizeBookMatch(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function enrichShelfSubjects() {
  const cache = readSubjectCache();
  let completed = 0;
  let consecutiveErrors = 0;
  for (const book of shelf) {
    if (book.tags?.length || tagsFor(book).length) {
      completed += 1;
      continue;
    }
    const cacheKey = `${normalizeBookMatch(book.title)}|${normalizeBookMatch(book.author)}`;
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.checkedAt < 90 * 24 * 60 * 60 * 1000) {
      book.tags = cached.subjects;
      completed += 1;
      continue;
    }

    if (completed > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    els.catalogStatus.textContent = `finding subjects for books ${completed + 1}/${shelf.length}…`;
    const params = new URLSearchParams({
      title: book.title,
      limit: "10",
      fields: "title,author_name,subject"
    });
    try {
      const response = await fetchWithTimeout(`https://openlibrary.org/search.json?${params}`);
      if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
      const result = await response.json();
      const wantedTitle = normalizeBookMatch(book.title);
      const wantedAuthorParts = normalizeBookMatch(book.author).split(" ").filter((part) => part.length > 2);
      const match = (result.docs || [])
        .map((doc) => {
          const foundTitle = normalizeBookMatch(doc.title);
          const titleMatch = foundTitle === wantedTitle ? 10 : foundTitle.startsWith(wantedTitle) || wantedTitle.startsWith(foundTitle) ? 5 : 0;
          const authorMatch = (doc.author_name || []).some((author) => {
            const parts = normalizeBookMatch(author).split(" ");
            return wantedAuthorParts.some((part) => parts.includes(part));
          }) ? 3 : 0;
          return { doc, score: titleMatch + authorMatch };
        })
        .sort((a, b) => b.score - a.score)[0];
      const subjects = match?.score >= 10 ? (match.doc.subject || []).map((subject) => String(subject).toLowerCase()) : [];
      book.tags = subjects;
      cache[cacheKey] = { subjects, checkedAt: Date.now() };
      completed += 1;
      consecutiveErrors = 0;
      if (completed % 5 === 0 || completed === shelf.length) {
        writeSubjectCache(cache);
        render();
        els.catalogStatus.textContent = `book subjects ${completed}/${shelf.length} · ${shelf.filter((shelfBook) => tagsFor(shelfBook).length).length} matched`;
      }
    } catch (error) {
      console.warn(`Could not find Open Library subjects for "${book.title}":`, error);
      consecutiveErrors += 1;
      completed += 1;
      if (consecutiveErrors >= 5) {
        els.catalogStatus.textContent = `subject lookup paused after repeated errors · ${completed}/${shelf.length} checked`;
        break;
      }
    }
  }
  writeSubjectCache(cache);
  return { completed, matched: shelf.filter((book) => tagsFor(book).length).length };
}

function getCatalogSubjects() {
  const profileTags = [...buildTasteProfile().weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([subject]) => subject);
  const broadSubjects = ["fiction", "literary fiction", "mystery", "romance", "fantasy", "science fiction", "historical fiction", "thrillers", "horror", "biography", "memoir", "young adult"];
  return (profileTags.length ? profileTags : broadSubjects).slice(0, 8).map((tag) => tag.replaceAll("-", " "));
}

async function fetchSubjectPage(subject, page) {
    const url = `https://openlibrary.org/search.json?subject=${encodeURIComponent(subject)}&limit=100&page=${page}&fields=key,title,author_name,subject,first_publish_year`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
    return response.json();
}

function addCatalogResults(results) {
  const books = new Map(catalog.map((book) => [book.key || `${book.title.toLowerCase()}|${book.author.toLowerCase()}`, book]));
  let added = 0;
  results.forEach((result) => (result.docs || []).forEach((doc) => {
    if (!doc.title || !doc.author_name?.length || !doc.key || books.has(doc.key)) return;
    books.set(doc.key, {
      key: doc.key,
      title: doc.title,
      author: doc.author_name[0],
      tags: (doc.subject || []).map((subject) => subject.toLowerCase()).slice(0, 12),
      url: `https://openlibrary.org${doc.key}`,
      year: doc.first_publish_year
    });
    added += 1;
  }));
  catalog = [...books.values()];
  return added;
}

async function fetchInitialCatalog() {
  catalogSubjects = getCatalogSubjects();
  catalogPages = new Map(catalogSubjects.map((subject) => [subject, 1]));
  catalogTotals = new Map();
  const responses = await fetchInBatches(catalogSubjects.map((subject) => async () => ({
    subject,
    result: await fetchSubjectPage(subject, 1)
  })));
  const successful = responses.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const failed = responses.length - successful.length;
  addCatalogResults(successful.map(({ result }) => result));
  successful.forEach(({ subject, result }) => catalogTotals.set(subject, result.numFound || 0));
  if (!successful.length) throw new Error("Open Library returned no subject results");
  return { failed };
}

async function fetchNextCatalogPages() {
  const subjectsWithMore = catalogSubjects.filter((subject) => {
    const currentPage = catalogPages.get(subject) || 1;
    return currentPage * 100 < (catalogTotals.get(subject) || 0);
  });
  const responses = await fetchInBatches(subjectsWithMore.map((subject) => async () => {
    const nextPage = (catalogPages.get(subject) || 1) + 1;
    const result = await fetchSubjectPage(subject, nextPage);
    catalogPages.set(subject, nextPage);
    return { subject, result };
  }));
  const successful = responses.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const failed = responses.length - successful.length;
  successful.forEach(({ subject, result }) => catalogTotals.set(subject, result.numFound || 0));
  const added = addCatalogResults(successful.map(({ result }) => result));
  return { added, failed, exhausted: subjectsWithMore.length === 0 };
}

async function fetchInBatches(requests, batchSize = 4) {
  const results = [];
  for (let index = 0; index < requests.length; index += batchSize) {
    const batch = requests.slice(index, index + batchSize).map((request) => request());
    results.push(...await Promise.allSettled(batch));
  }
  return results;
}

async function loadMoreCatalog() {
  if (catalogLoading || !catalogSubjects.length) return;
  catalogLoading = true;
  els.searchDeeper.disabled = true;
  els.catalogStatus.textContent = "searching next result pages…";
  let exhausted = false;
  try {
    const result = await fetchNextCatalogPages();
    exhausted = result.exhausted;
    recommendationSeed = Math.random();
    render();
    els.catalogStatus.textContent = result.exhausted
      ? `${catalog.length} candidates · all matching pages searched`
      : result.failed
      ? `${catalog.length} candidates · ${result.added} added; some pages unavailable`
      : `${catalog.length} candidates · ${result.added} added this search`;
  } catch (error) {
    els.catalogStatus.textContent = `${catalog.length} candidates · deeper search failed`;
    console.error("Could not fetch more Open Library results:", error);
  } finally {
    catalogLoading = false;
    els.searchDeeper.disabled = exhausted;
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function timeoutAfter(milliseconds) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Open Library catalog request timed out")), milliseconds);
  });
}

function render() {
  const count = shelf.length;
  els.count.textContent = `${count} ${count === 1 ? "book" : "books"}`;
  els.title.textContent = count ? "A portrait of your reading" : "Waiting for your shelf";
  els.empty.classList.toggle("hidden", count > 0);
  els.shelf.classList.toggle("hidden", count === 0);
  els.clear.classList.toggle("hidden", count === 0);
  els.recommendations.classList.toggle("hidden", count === 0);
  els.shelf.innerHTML = shelf.slice(0, 12).map((book) => `
    <div class="shelf-item"><div><span class="shelf-item-title">${escapeHTML(book.title)}</span><span class="shelf-item-author"> — ${escapeHTML(book.author || "Unknown author")}</span>${tagsFor(book).length ? `<div class="shelf-subjects">${tagsFor(book).slice(0, 4).map(escapeHTML).join(" · ")}</div>` : ""}</div>
    <span class="rating">${ratingStars(book.rating || book.myrating)}</span></div>`).join("");
  els.grid.innerHTML = rankRecommendations(catalog).map((book) => `
    <article class="book-card"><h3>${book.url ? `<a href="${escapeHTML(book.url)}" target="_blank" rel="noreferrer">${escapeHTML(book.title)}</a>` : escapeHTML(book.title)}</h3><span class="book-author">${escapeHTML(book.author)}${book.year ? ` · ${book.year}` : ""}</span>
    <p class="book-description">${book.matchTerms.length ? `Overlaps with your shelf in: ${book.matchTerms.slice(0, 3).map(escapeHTML).join(", ")}.` : "No shared indexed subjects found yet."}</p>
    <div class="tag-row">${book.matchTerms.slice(0, 3).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}<span class="match-score">${book.score}% taste overlap</span></div></article>`).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
async function useShelf(books) {
  importedShelf = books;
  shelf = els.excludeDnf.checked ? importedShelf.filter((book) => !isDidNotFinish(book)) : importedShelf;
  catalog = sampleBooks;
  catalogSubjects = [];
  catalogPages.clear();
  catalogTotals.clear();
  render();
  if (!shelf.length) return;
  els.searchDeeper.disabled = true;
  catalog = [];
  els.catalogStatus.textContent = "finding genres from Open Library…";
  try {
    const metadata = await enrichShelfSubjects();
    els.catalogStatus.textContent = `subjects found for ${metadata.matched}/${shelf.length} shelf books · searching Open Library…`;
    const { failed } = await Promise.race([fetchInitialCatalog(), timeoutAfter(15000)]);
    els.catalogStatus.textContent = failed
      ? `${catalog.length} candidates · subjects on ${metadata.matched}/${shelf.length} books; some searches unavailable`
      : `${catalog.length} candidates · subjects on ${metadata.matched}/${shelf.length} books`;
  } catch (error) {
    els.catalogStatus.textContent = "Live catalog unavailable; using curated catalog";
    catalog = sampleBooks;
    console.error("Could not load Open Library catalog:", error);
  } finally {
    els.searchDeeper.disabled = catalogSubjects.length === 0 || catalogSubjects.every((subject) => (catalogPages.get(subject) || 1) * 100 >= (catalogTotals.get(subject) || 0));
  }
  render();
}
els.input.addEventListener("change", async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try { useShelf(parseCSV(await file.text())); } catch (error) { alert(`Could not read that CSV: ${error.message}`); }
});
els.demo.addEventListener("click", () => useShelf([
  { title: "The Overstory", author: "Richard Powers", shelves: "literary,environmental,philosophical", rating: "5" },
  { title: "Never Let Me Go", author: "Kazuo Ishiguro", shelves: "literary,science-fiction,emotional", rating: "5" },
  { title: "The Fifth Season", author: "N.K. Jemisin", shelves: "science-fiction,fantasy,political", rating: "4" },
  { title: "The Name of the Rose", author: "Umberto Eco", shelves: "mysterious,historical,literary", rating: "4" }
]));
els.clear.addEventListener("click", () => { useShelf([]); els.input.value = ""; });
els.excludeDnf.addEventListener("change", () => useShelf(importedShelf));
els.refresh.addEventListener("click", () => {
  recommendationSeed = Math.random();
  render();
});
els.searchDeeper.addEventListener("click", loadMoreCatalog);
