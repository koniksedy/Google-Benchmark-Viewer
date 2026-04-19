# Google Benchmark Viewer

Interactive browser viewer for [Google Benchmark](https://github.com/google/benchmark) JSON output.

It helps you inspect benchmark groups, compare two runs, map name tokens to chart dimensions, and review both charts and raw values in one place.

## Features

- Load Google Benchmark JSON by drag and drop or file picker.
- Automatic grouping by benchmark name prefix (everything before first `/`).
- Name Mapping Studio for token-role assignment (`subtype`, `series`, `x axis`).
- Multiple chart types and display controls.
- Filter controls for subtype levels.
- Raw grouped data tables.
- Compare mode for base vs compare benchmark files.
- CPU and Wall time switching.
- Theme toggle (light/dark).

## Quick Start

No build step is required.

1. Clone this repository.
2. Open `index.html` in a browser, or serve the project with a static server.

Example static server command:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Input File Format

The viewer expects a Google Benchmark JSON payload that contains a `benchmarks` array.

It reads and normalizes:

- `name`
- `real_time` / `cpu_time` with `time_unit`
- `real_time_ns` / `cpu_time_ns` (if already present)
- benchmark rows flagged as `is_aggregate` are ignored

The tool also copies any `*_per_second` fields into `counters` when needed.

Generate JSON from Google Benchmark with:

```bash
./your_benchmark_binary --benchmark_format=json --benchmark_out=bench_results.json
```

## Benchmark Name Structure

This viewer uses benchmark names heavily to build the UI and chart dimensions.

Expected shape:

```text
GroupName/token1/token2/token3/...
```

Rules:

1. `GroupName` (before the first `/`) becomes a tab.
2. Tokens after `/` become mappable segments.
3. Numeric tokens are treated as numbers where relevant.
4. String tokens are supported and can be used for subtype or series labels.

Example names:

```text
BM_OffsetList/avx2/64/insert/1024
BM_OffsetList/avx2/64/erase/1024
BM_OffsetList/scalar/64/insert/1024
BM_OffsetList/scalar/64/erase/1024
```

In this example:

- `BM_OffsetList` is the group tab.
- `avx2|scalar` can be mapped as subtype or series.
- `64` can be subtype/series/x depending on your mapping.
- `insert|erase` can be mapped as series.
- `1024` is a common candidate for x axis.

## Compare Mode

You can load a second file with **Compare** after loading a base file.

Important behavior:

- Compare data is matched by exact benchmark `name`.
- If names don't precisely overlap, compare mode is rejected.
- UI shows base and compare values together where possible.

Tip: keep benchmark naming stable across runs if you plan to compare them.

## UI Workflow

1. Load base benchmark JSON.
2. Open a group tab.
3. In **Name Mapping Studio**, assign token roles.
4. Role meanings: `Subtype N` creates hierarchical filter buckets.
5. Role meanings: `Series` creates separate chart series.
6. Role meanings: `X axis` defines x-axis source.
7. Adjust graph type, log scaling, and focus settings.
8. Optionally load compare JSON.
9. Inspect chart cards and raw grouped table.

## Project Structure

Top-level layout:

- `index.html`: app shell.
- `css/`: split stylesheet modules (`base`, `panels`, chart/data UI sections).
- `js/main.js`: entrypoint and wiring.
- `js/app/`: app state, theme, data normalization, viewer rendering.
- `js/panels/`: mapping studio, chart-grid builders, filters, raw table.
- `js/charts/`: Chart.js wrappers and theme helpers.
- `js/utils/`: parsing and formatting utilities.

## Development Notes

- The app is plain HTML/CSS/JS modules.
- Charting is powered by Chart.js loaded from CDN in `index.html`.
- No bundler or package manager is currently required.

## License

See [LICENSE](LICENSE) for details.
