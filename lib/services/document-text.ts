import { App, MarkdownPostProcessorContext } from "obsidian";
import * as Fm from "lib/domains/frontmatter";
import { msgbus } from "./event-bus";

/**
 * Holds the full text of notes whose code blocks render without section info.
 *
 * Blocks look up sibling blocks (the `ability` block, the `skills` block) in
 * the note's text, which `ctx.getSectionInfo()` normally provides. Obsidian
 * returns null there for embeds (`![[Note#Section]]`) and for markdown other
 * plugins render themselves (e.g. HTML Tabs), so those blocks fall back to the
 * whole file. Reading a file is async but rendering is sync, so a miss starts
 * a read and returns "" for now; once the text arrives, `fm:changed` fires for
 * the file and template-aware blocks re-render with the real data.
 */
export class DocumentTextCache {
  private app: App | null = null;
  private texts = new Map<string, string>();
  private loads = new Map<string, Promise<string>>();

  init(app: App) {
    this.clear();
    this.app = app;
  }

  /** Drops all cached text and the app, so reads return "" until the next init. */
  clear() {
    this.app = null;
    this.texts.clear();
    this.loads.clear();
  }

  /** Cached text for `path`, or "" while the first read is still in flight. */
  get(path: string): string {
    const text = this.texts.get(path);
    if (text !== undefined) return text;
    void this.read(path);
    return "";
  }

  read(path: string): Promise<string> {
    const text = this.texts.get(path);
    if (text !== undefined) return Promise.resolve(text);

    const inFlight = this.loads.get(path);
    if (inFlight) return inFlight;

    const load = this.load(path).finally(() => this.loads.delete(path));
    this.loads.set(path, load);
    return load;
  }

  /** Refreshes a cached file. Files no block has asked for are not stored. */
  update(path: string, text: string) {
    if (this.texts.has(path)) this.texts.set(path, text);
  }

  remove(path: string) {
    this.texts.delete(path);
  }

  private async load(path: string): Promise<string> {
    const app = this.app;
    if (!app) return "";

    let text = "";
    const file = app.vault.getFileByPath(path);
    if (file) {
      try {
        text = await app.vault.cachedRead(file);
      } catch (error) {
        console.error(`[ttrpg-ui-toolkit] Could not read ${path}:`, error);
      }
    }

    // The cache was cleared (plugin unload) while the read was in flight.
    if (this.app !== app) return text;

    this.texts.set(path, text);
    if (text) publishFrontmatterChange(app, path);
    return text;
  }
}

export const documentText = new DocumentTextCache();

export function publishFrontmatterChange(app: App, path: string) {
  const fm = app.metadataCache.getCache(path)?.frontmatter;
  msgbus.publish(path, "fm:changed", Fm.anyIntoFrontMatter(fm || {}));
}

/**
 * Text of the note a code block belongs to: the section info's text when
 * Obsidian provides it, otherwise the cached file (see DocumentTextCache).
 */
export function documentTextFor(el: HTMLElement, ctx: MarkdownPostProcessorContext): string {
  const sectionText = ctx.getSectionInfo(el)?.text;
  if (sectionText !== undefined) return sectionText;
  return ctx.sourcePath ? documentText.get(ctx.sourcePath) : "";
}

/**
 * Like documentTextFor, but waits for the file read instead of returning ""
 * on a cache miss. Blocks that persist state derived from templates (health,
 * consumables) use this so a cold cache cannot save values computed from
 * default ability scores.
 */
export async function loadDocumentTextFor(el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<string> {
  const sectionText = ctx.getSectionInfo(el)?.text;
  if (sectionText !== undefined) return sectionText;
  return ctx.sourcePath ? documentText.read(ctx.sourcePath) : "";
}
