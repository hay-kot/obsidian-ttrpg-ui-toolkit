// The obsidian package ships types only ("main": ""), so anything importing it at runtime
// cannot be bundled for the docs site. This stands in for the handful of runtime helpers
// the demo components reach for.

/** Obsidian draws its own tooltip; in a plain browser the native one is the closest thing. */
export function setTooltip(el: HTMLElement, tooltip: string): void {
  el.setAttribute("title", tooltip);
}

// Lucide paths for the icons the components ask for. Obsidian bundles the full Lucide set;
// the docs only carry what the demos render.
const ICON_PATHS: Record<string, string[]> = {
  "chevrons-up": ["m17 11-5-5-5 5", "m17 18-5-5-5 5"],
  "chevrons-down": ["m7 6 5 5 5-5", "m7 13 5 5 5-5"],
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function setIcon(el: HTMLElement, iconId: string): void {
  const paths = ICON_PATHS[iconId];
  if (!paths) return;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", `svg-icon lucide-${iconId}`);
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  el.replaceChildren(svg);
}
