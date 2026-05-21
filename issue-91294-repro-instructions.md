# Issue #91294 — Reproduction & Verification Instructions

## File: `issue-91294-repro.html`

A standalone, self-contained HTML page that loads **mapbox-gl 2.15.0** (the exact version shipped in App) and stress-cycles a fog-enabled map + marker to deterministically trigger the same crash recorded in Sentry **APP-MR**.

## Why a synthetic repro

The Sentry occurrence rate (~0.07%, 448 users / 2,574 events) implies a narrow timing window between Mapbox's internal `setTimeout(_evaluateOpacity, 60)` and the map being torn down. Hitting that window inside the full Expensify dev server requires racing real navigation, which is not deterministic.

The synthetic page collapses that race into a tight loop (`setInterval(250 ms)` creating a map + marker, then calling `map.remove()` ~30–80 ms later). Each cycle that disposes the map between Marker's fade timer being scheduled and it firing reproduces the exact same `TypeError: Cannot read properties of undefined (reading 'get')` inside `Fog.get state()` -> `this.properties.get('range')`.

## How to record the BEFORE video

1. Open `issue-91294-repro.html` in any Chromium-based browser.
2. Paste a Mapbox **public** access token (any `pk.*` token works; you can grab one from `.env` -> `MAPBOX_ACCESS_TOKEN` while the app is running).
3. Leave the **Apply fix** checkbox **unchecked**.
4. Click **Start stress cycle**.
5. Within ~5–30 seconds, the log will start filling with red `UNCAUGHT: TypeError ... reading 'get'` lines, with stack frames pointing at `Fog.get state` / `_queryFogOpacity` / `Marker._evaluateOpacity`. Open the browser DevTools Console to confirm the full stack.
6. Record the screen for ~30 seconds showing crashes accumulating.

## How to record the AFTER video

1. Click **Stop** then **Clear log**.
2. **Check** the **Apply fix** checkbox. (This causes the page to call `map.setFog(null)` inside the `onLoad` callback — exactly what the patch does in `MapViewImpl.website.tsx`.)
3. Click **Start stress cycle** again.
4. Let it run for the same duration (or longer). The log should stay clean — no `UNCAUGHT` entries.
5. Record the screen for ~30 seconds showing zero crashes.

## What the fix does in the real app

Patch: [`src/components/MapView/MapViewImpl.website.tsx`](src/components/MapView/MapViewImpl.website.tsx)

```diff
 <Map
     onDrag={() => setUserInteractedWithMap(true)}
+    onLoad={(event) => {
+        // Disable fog to avoid a mapbox-gl 2.15 teardown race where a deferred
+        // marker fade callback reads `Fog.state.properties` after the style is
+        // disposed. See GH#91294 / Sentry APP-MR.
+        event.target.setFog(null);
+    }}
```

- The Expensify map style (`mapbox://styles/expensify/cllcoiqds00cs01r80kp34tmq`) ships fog in its style definition.
- Fog has no visual effect for the distance-map use case (2-D top-down route view; default projection is `mercator`, not `globe`).
- `setFog(null)` clears `map.style.fog`, which causes the `_queryFogOpacity` early-return guard at [mapbox-gl-unminified.js:61270](node_modules/mapbox-gl/dist/mapbox-gl-unminified.js#L61270) to fire — the crashing `Fog.get state()` getter at [line 35266](node_modules/mapbox-gl/dist/mapbox-gl-unminified.js#L35266) is no longer reachable.

## Root-cause summary (for the proposal body)

`Fog.recalculate()` sets `this.properties`; the constructor does **not**. The `get state()` getter accesses `this.properties.get('range')` **without** a guard, while the sibling `getOpacity` method in the same class **does** guard with `this.properties && ...`. When a Marker schedules `setTimeout(_evaluateOpacity, 60)` and the map is removed (or the style is replaced) within those 60 ms, the deferred callback walks `_queryFogOpacity -> getOpacityAtLatLng -> Fog.get state()` against a Fog instance whose `properties` was never set or was cleared during teardown, and crashes.
