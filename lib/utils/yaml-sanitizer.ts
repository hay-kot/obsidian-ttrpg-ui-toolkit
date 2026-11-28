/**
 * Converts leading tabs to 2 spaces each so tab-indented YAML parses.
 *
 * The YAML spec forbids tabs as indentation, and the `yaml` library throws
 * "Tabs are not allowed as indentation" for them. Obsidian users who indent
 * with tabs therefore get an error for a block that looks fine.
 *
 * Only the run of tabs at the very start of a line is rewritten. Tabs
 * elsewhere (after a key colon, inside quoted or plain values, inside block
 * scalars) are legal YAML and are left untouched so their content is kept.
 */
export function normalizeYamlIndentation(source: string): string {
  if (!source.includes("\t")) {
    return source;
  }

  return source.replace(/^\t+/gm, (tabs) => "  ".repeat(tabs.length));
}
