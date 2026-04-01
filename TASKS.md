# CineVault Enhancement — Task Breakdown

> Each task is self-contained and can be implemented in a single focused session.
> Tasks within a feature are ordered by dependency. Cross-feature dependencies are noted.

---

## Feature 1 — Watched & Star-Rating System

### Task 1.1: Watched State & localStorage Persistence
**Scope**: JS only (no UI yet)
- Add `state.watched` as a `Map`-like object (`{ filmKey: { rating, timestamp } }`).
- Add `cv_watched` to `loadPersisted()` — load from localStorage on init.
- Add `saveWatched()` helper — same pattern as `saveFavorites()` / `saveWatchlist()`.
- Add `toggleWatched(film, rating)` and `removeWatched(film)` functions.
- Update `addToStore()` / `removeFromStore()` to handle watched entries.
- **Test**: manually call `toggleWatched()` in console, reload, verify persistence.

### Task 1.2: Star-Rating Picker UI Component
**Scope**: HTML + CSS + JS
- Create a small inline rating picker (5 star icons) that appears when the user clicks the star button on a card.
- Picker should be positioned relative to the card (popover/dropdown style).
- On star click → call `toggleWatched(film, rating)` → close picker → re-render card.
- Clicking the star button on an already-watched film should allow re-rating or clearing.
- Style with Tailwind classes; gold filled stars for selected, gray outlines for unselected.
- Must work on mobile (tap targets ≥ 32px).

### Task 1.3: Display Rating on Film Cards
**Scope**: `createCardHTML()` changes
- Add a small star button to the card's action-button overlay (alongside favorite/watchlist).
- When film is watched: show filled stars + numeric rating (e.g., ★★★★☆) below the title or next to the genre tag.
- When film is not watched: show a single outlined star icon as the trigger.
- Update `createCardHTML()` to read from `state.watched`.

### Task 1.4: Display Rating in Modal
**Scope**: `openModal()` changes
- Show current rating as interactive stars in the modal detail view.
- Allow rating/re-rating directly from the modal.
- Show the rating timestamp (formatted as relative time or date).
- Add a "Mark as unwatched" option if already watched.

### Task 1.5: Year Progress Bar
**Scope**: HTML + CSS + JS
- Add a thin progress bar element between the header status bar and the grid.
- Show: `[===-------] 12 / 150 watched` with percentage.
- Gold fill color (`#c9a84c`), dark track.
- Recalculate in `applyFilters()` or `updateStatus()` — count watched films for current year.
- Animate width transitions on updates.
- Hide or show "0 / N" when no films are watched.

---

## Feature 2 — Stats Dashboard

### Task 2.1: Add Chart.js CDN & Collapsible Panel Skeleton
**Scope**: HTML + CSS
- Add Chart.js 4.x CDN `<script>` tag to `<head>`.
- Add a `<section id="statsPanel">` between header and main grid.
- Add a toggle button (chevron icon) in the header to expand/collapse the panel.
- Panel should use `max-height` + `overflow: hidden` + CSS transition for smooth toggle.
- Panel contains three placeholder `<canvas>` elements in a responsive grid.
- Collapsed by default; toggle state saved in `localStorage` (key: `cv_statsOpen`).
- Add empty-state message: "Start rating films to see your stats here."

### Task 2.2: Genre Breakdown Doughnut Chart
**Scope**: JS (Chart.js)
- Write `calcGenreCounts(films)` — iterate films, split `Primary_Genre` on `/`, take first token, count occurrences.
- Create/update a Chart.js doughnut chart on the first `<canvas>`.
- Color palette: use 8–10 muted colors that fit the dark theme.
- Show legend (right side on desktop, bottom on mobile).
- Call `renderGenreChart()` inside a new `renderStats()` function.
- Destroy previous chart instance before creating a new one.

### Task 2.3: Director Leaderboard Bar Chart
**Scope**: JS (Chart.js)
- Write `calcDirectorLeaderboard(films)` — count director appearances in the union of Favorites + Watched for the current view.
- Show top 10 directors as a horizontal bar chart on the second `<canvas>`.
- Gold bars, dark background, white labels.
- Handle "Unknown" directors gracefully (exclude or group).

### Task 2.4: Quality Heatmap / Comparison Chart
**Scope**: JS (Chart.js)
- Write `calcQualityComparison(watchedFilms, allFilms)` — for watched films, compute the user's average rating vs. the year's average user rating.
- Display as a grouped bar chart: each bar group = a rating bucket (1–5 stars), bars = count of user's ratings vs. expected distribution, OR per-film comparison for top N.
- Alternative approach: show user's average rating per genre vs. overall.
- Use contrasting colors (gold for user, gray for average).
- *Design note*: finalise the exact visual during implementation — the key insight is "how does my taste compare to the year's spread."

### Task 2.5: "All Time" Stats Aggregation
**Scope**: JS (data loading + stats)
- Add an `"All Time"` option to the year `<select>` dropdown (value: `"all"`).
- When selected, load all 37 CSVs in parallel (limit concurrency to 6).
- Cache parsed results in `state.csvCache` to avoid re-fetching.
- Merge all films into a single array, then call `renderStats()`.
- Show a loading spinner/skeleton while CSVs load.
- Do NOT fetch TMDB posters in All-Time mode (performance + rate limits).
- For the grid: either hide it or show a summary message ("Select a year to browse films").

### Task 2.6: Stats Panel — Empty States & Polish
**Scope**: HTML + CSS + JS
- When no films are watched (current year or all-time), show a friendly empty state per chart area.
- Messages like: "Rate some films to see your genre breakdown!" with a subtle illustration or icon.
- Ensure charts resize correctly on window resize (`responsive: true` in Chart.js config).
- Ensure panel looks good on mobile (stack charts vertically).

---

## Feature 3 — Advanced Filtering

### Task 3.1: Watched / Unwatched Toggle Filters
**Scope**: HTML + JS
- Add two new toggle pills to the `#viewToggles` bar: **Watched** and **Unwatched**.
- Add `state.watchedFilter` — values: `null` (no filter), `'watched'`, `'unwatched'`.
- These work as an AND filter with the existing view mode (All/Favorites/Watchlist).
- Update `applyFilters()` to check `state.watchedFilter`.
- Update button active/inactive styling to match existing pill pattern.
- Update `updateStatus()` text to reflect the active filter combination.

### Task 3.2: Genre Dropdown Filter
**Scope**: HTML + JS
- Add a `<select id="genreSelect">` to the header toolbar (after search, before view toggles).
- Populate dynamically: extract unique genres from `state.films` after CSV load, sort alphabetically, add "All Genres" as default.
- Add `state.genreFilter` — `null` or a genre string.
- Update `applyFilters()` to filter by genre when set.
- Reset genre filter on year change (repopulate the dropdown).
- Style to match existing `#yearSelect`.

### Task 3.3: Filter Combination Logic & Status
**Scope**: JS
- Ensure all filters combine with AND logic:
  `viewMode × watchedFilter × genreFilter × searchQuery`.
- Update `updateStatus()` to produce clear messages, e.g.:
  "3 watched Drama films matching 'nolan'" .
- Edge case: Favorites + Watched filter → films that are both favorited AND watched.
- Edge case: empty results → show appropriate empty-state text for the filter combo.

---

## Feature 4 — Data Export 2.0

### Task 4.1: Enrich Export with Watched Data
**Scope**: JS (`exportCollection()`)
- For each film in favorites/watchlist arrays, look up `state.watched[filmKey]`.
- Add fields: `"watched": true/false`, `"rating": N|null`, `"ratingTimestamp": "ISO"|null`.
- Add a new top-level `"watched"` array containing films that are watched but NOT in favorites or watchlist.
- Maintain backward compatibility: existing fields unchanged.
- Update the export filename to include the date: `cinevault_export_2026-04-01.json`.

---

## Integration & QA Tasks

### Task 5.1: Wire Up Stats Refresh on Year Change
**Scope**: JS
- In `loadYear()`, after films are loaded and `applyFilters()` runs, call `renderStats()`.
- Ensure chart instances are properly destroyed before re-creation.
- If stats panel is collapsed, defer chart rendering until it's opened (performance).

### Task 5.2: Mobile & Responsive Testing
**Scope**: CSS + HTML tweaks
- Verify all new UI elements (progress bar, stats panel, filter pills, genre dropdown, star picker) work on narrow viewports (≤ 400px).
- Stats panel: stack charts in a single column on mobile.
- Filter pills: allow horizontal scroll if they overflow.
- Star picker: ensure tap targets are large enough.

### Task 5.3: Performance Audit
**Scope**: JS optimization
- Profile "All Time" loading with 6,500+ films.
- Ensure `applyFilters()` and `renderStats()` complete in < 100 ms for typical datasets.
- Batch DOM updates; avoid layout thrashing.
- Confirm TMDB poster fetching still respects rate limits (no changes needed if All-Time skips posters).

### Task 5.4: Final Polish & Edge Cases
**Scope**: Full review
- Test with empty CSV files.
- Test with the 1980s file (decade aggregate, different structure?).
- Verify localStorage doesn't exceed quota with heavy usage.
- Ensure the CONFIG object and TMDB API key setup remain intact and documented.
- Cross-browser check: Chrome, Safari, Firefox.

---

## Suggested Implementation Order

```
1.1 → 1.2 → 1.3 → 1.4 → 1.5        (Watched system, end-to-end)
  ↓
2.1 → 2.2 → 2.3 → 2.4 → 2.6        (Stats dashboard, per chart)
  ↓
3.1 → 3.2 → 3.3                      (Filtering)
  ↓
2.5                                    (All-Time — depends on stats + filtering being stable)
  ↓
4.1                                    (Export upgrade)
  ↓
5.1 → 5.2 → 5.3 → 5.4               (Integration & QA)
```

Total: **20 tasks** across 5 groups.
