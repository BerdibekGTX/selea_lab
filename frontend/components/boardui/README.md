# BoardUI adaptations

These components adapt the free public BoardUI registry sources retrieved on
2026-11-06. Original source snapshots are in `design-reference/boardui` at the
repository root.

- Stat cards: https://www.boardui.com/r/stat-cards.json
- Pagination: https://www.boardui.com/r/pagination.json
- Agent thinking: https://www.boardui.com/r/agent-thinking.json

Adaptations: Selea CSS tokens instead of BoardUI's Tailwind 4 theme; existing
Phosphor icons; native buttons; English labels without the template localization
wrapper. Stat cards require actual data (no demo defaults or fabricated growth
percentages). The wave loader respects live reduced-motion preference changes;
its elapsed timer is outside the live region. Pagination retains BoardUI's
container-based compact layout and sibling-window algorithm.

No Pro registry, paid template, or license activation is used. The npm CLI declares
MIT; a separate license for the registry components was not supplied in their
JSON, so this directory does not assert that the CLI license covers those assets.
