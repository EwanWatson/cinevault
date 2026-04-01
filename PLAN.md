# CineVault Enhancement Plan

## Overview

Enhance the existing `index.html` movie gallery with a **Watched/Rating system**, a **Stats Dashboard** (Chart.js), **Advanced Filtering**, and an **upgraded data export**. All changes stay inside the single `index.html` file, continuing to use Tailwind CSS (CDN) and PapaParse.

---

## Current Architecture

- **Single-page app** — all HTML, CSS, and JS in `index.html`.
- **Data**: 37 CSV files (`films_1980s.csv`, `films_1990.csv` – `films_2025.csv`), ~6,500 rows total.
- **Columns**: `Rank, Title, Year, Director, Primary_Genre, Synopsis, Major_Awards, Key_Sources`.
- **State management**: in-memory `state` object + `localStorage` for favorites, watchlist, film metadata, and poster cache.
- **Poster fetching**: TMDB API with batched requests (4 concurrent, 180 ms delay between batches).
- **Rendering**: string-template HTML injected via `innerHTML`, event delegation on the grid.

---

## Feature 1 — Watched & Star-Rating System

### What it does
- Adds a **star icon** to every film card that opens a 1–5 star rating picker.
- Once rated, the film is marked **watched** and the star rating is displayed on the card.
- A **progress bar** at the top of each year's view shows watched count vs. total (e.g., "12 / 150").
- Watched state + rating + timestamp are persisted in `localStorage`.

### Design Decisions
| Decision | Choice | Rationale |
|---|---|---|
| Rating UI | Inline 5-star row on click/tap | Avoids a modal for a quick action; mobile-friendly |
| Storage key | `cv_watched` → `{ "Title|||Year": { rating: 3, timestamp: "..." } }` | Mirrors existing `cv_favorites` / `cv_watchlist` pattern |
| Progress bar location | Below the header status bar, above the grid | Always visible without scrolling |
| Un-watch flow | Tap star icon again → confirm or clear rating | Prevents accidental removal |

### Implementation Sketch
1. Add `state.watched` (`Map<filmKey, {rating, timestamp}>`).
2. `loadPersisted()` / `saveWatched()` — same pattern as favorites.
3. `createCardHTML()` — add a star button + filled-star display when rated.
4. Rating picker — small popover with 5 clickable stars; on select → save → re-render card.
5. Progress bar component — a thin gold bar + text, re-calculated in `applyFilters()`.
6. Modal — show watched status + rating, allow edit.

### localStorage Schema Addition
```jsonc
// key: "cv_watched"
{
  "Anora|||2024": { "rating": 5, "timestamp": "2026-04-01T12:00:00Z" },
  "Nickel Boys|||2024": { "rating": 4, "timestamp": "2026-03-28T09:30:00Z" }
}
```

---

## Feature 2 — Stats Dashboard (Chart.js)

### What it does
- A **collapsible panel** at the top of the page (below header, above progress bar).
- Contains three Chart.js visualizations that update when the year changes.
- Supports an **"All Time"** aggregation mode.

### Charts

| Chart | Type | Data Source | X / Labels | Y / Values |
|---|---|---|---|---|
| Genre Breakdown | Doughnut | Current year's films | `Primary_Genre` (split on `/`, take first) | Count per genre |
| Director Leaderboard | Horizontal Bar | Films in Favorites ∪ Watched (current year or all-time) | Director name | Appearance count |
| Quality Heatmap | Bar (grouped) | Watched films for current year | Film title (top N) | User rating vs. year average rating |

### Design Decisions
| Decision | Choice | Rationale |
|---|---|---|
| Library | Chart.js 4.x via CDN | Lightweight, no build step, good docs |
| Panel toggle | Chevron button in header; `max-height` + CSS transition | Smooth UX, no layout shift |
| "All Time" mode | Extra option in the year `<select>` dropdown (value `"all"`) | Re-uses existing year-switching logic |
| Chart color palette | Gold accent `#c9a84c` + muted grays matching existing theme | Visual consistency |
| Performance | Compute stats from in-memory `state.films`; destroy & re-create chart instances on year change | Avoids memory leaks from Chart.js |

### Implementation Sketch
1. Add `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` to `<head>`.
2. Add collapsible `<section id="statsPanel">` with three `<canvas>` elements.
3. `renderStats()` — called after `applyFilters()` and year change.
4. Helper functions: `calcGenreCounts(films)`, `calcDirectorLeaderboard(films)`, `calcQualityComparison(watched, films)`.
5. For "All Time": load all CSVs in parallel, merge into a single array, compute stats once.
6. Empty state: friendly message + illustration when no watched films exist.

### All-Time Loading Strategy
- Cache parsed CSV data per year in `state.csvCache = {}`.
- On "All Time" selection, iterate cached years; fetch any missing ones in parallel (≤ 6 concurrent).
- Show a loading indicator while fetching; stats render once all data is ready.

---

## Feature 3 — Advanced Filtering

### What it does
- Extends the existing view toggles (All / Favorites / Watchlist) with:
  - **Watched** / **Unwatched** toggle buttons.
  - **Genre** dropdown filter.
- Filters are combinable (e.g., "Watched + Drama").

### Design Decisions
| Decision | Choice | Rationale |
|---|---|---|
| UI placement | Alongside existing view-toggle pills in the header | Consistent with current layout |
| Genre list | Dynamically populated from current year's `Primary_Genre` values | Adapts per year without hardcoding |
| Filter combination | AND logic (all active filters must match) | Most intuitive for users |
| URL/state persistence | Filters reset on year change | Keeps things simple; avoids stale filter states |

### Implementation Sketch
1. Add `state.genreFilter` (string or `null`) and `state.watchedFilter` (`'all'` | `'watched'` | `'unwatched'`).
2. New `<select id="genreSelect">` populated in `applyFilters()` from current year data.
3. New toggle pills: "Watched" / "Unwatched" next to existing Favorites / Watchlist.
4. Update `applyFilters()` to chain all active filters.
5. Update `updateStatus()` to reflect combined filter state in the status text.

---

## Feature 4 — Data Export 2.0

### What it does
- Upgrades the existing JSON export to include watched status, star rating, and rating timestamp for every film in the export.

### Updated Export Schema
```jsonc
{
  "exported": "2026-04-01",
  "favorites": [
    {
      "title": "Anora",
      "year": "2024",
      "director": "Sean Baker",
      "genre": "Comedy/Drama",
      "rank": "1",
      "watched": true,
      "rating": 5,
      "ratingTimestamp": "2026-04-01T12:00:00Z"
    }
  ],
  "watchlist": [ /* same structure */ ],
  "watched": [
    /* films that are watched but NOT in favorites or watchlist */
  ]
}
```

### Implementation Sketch
1. Modify `exportCollection()` to merge watched data into each entry.
2. Add a separate `"watched"` array for films only in the watched list.
3. Keep backward-compatible: existing fields unchanged, new fields additive.

---

## Technical Constraints & Performance Notes

| Concern | Mitigation |
|---|---|
| **6,500+ films for "All Time" stats** | Compute stats in a single pass; avoid repeated DOM reads; use `requestIdleCallback` if needed |
| **TMDB rate limits** (free tier: ~40 req/10 s) | Existing batching (4 concurrent + 180 ms delay) is fine; do NOT fetch posters for "All Time" view |
| **Chart.js memory** | Call `chart.destroy()` before creating a new instance on year change |
| **localStorage size** (~5 MB limit) | Poster cache is the largest consumer; watched data is tiny (~100 KB for 6,500 films) |
| **Single-file constraint** | All code stays in `index.html`; CDN scripts only |

---

## Dependency Additions

| Dependency | Version | CDN URL |
|---|---|---|
| Chart.js | 4.x | `https://cdn.jsdelivr.net/npm/chart.js` |

No other new dependencies. Tailwind CSS and PapaParse remain as-is.
