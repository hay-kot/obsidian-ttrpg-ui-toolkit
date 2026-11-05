import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, MarkdownPostProcessorContext } from "obsidian";
import { DocumentTextCache, documentText, documentTextFor } from "./document-text";
import { msgbus } from "./event-bus";

function fakeApp(files: Record<string, string>) {
  const cachedRead = vi.fn(async (file: { path: string }) => files[file.path]);
  const app = {
    vault: {
      getFileByPath: vi.fn((path: string) => (path in files ? { path } : null)),
      cachedRead,
    },
    metadataCache: {
      getCache: vi.fn(() => ({ frontmatter: { proficiency_bonus: 4 } })),
    },
  } as unknown as App;
  return { app, cachedRead };
}

function fakeCtx(sourcePath: string, sectionText: string | null): MarkdownPostProcessorContext {
  return {
    sourcePath,
    getSectionInfo: vi.fn(() => (sectionText === null ? null : { text: sectionText, lineStart: 0, lineEnd: 0 })),
  } as unknown as MarkdownPostProcessorContext;
}

describe("DocumentTextCache", () => {
  let cache: DocumentTextCache;

  beforeEach(() => {
    cache = new DocumentTextCache();
  });

  it("returns empty text on a miss, then the file text once the read settles", async () => {
    const { app } = fakeApp({ "sheet.md": "```ability\n```" });
    cache.init(app);

    expect(cache.get("sheet.md")).toBe("");
    await cache.read("sheet.md");
    expect(cache.get("sheet.md")).toBe("```ability\n```");
  });

  it("reads each file once while a read is in flight", async () => {
    const { app, cachedRead } = fakeApp({ "sheet.md": "text" });
    cache.init(app);

    cache.get("sheet.md");
    cache.get("sheet.md");
    await cache.read("sheet.md");

    expect(cachedRead).toHaveBeenCalledTimes(1);
  });

  it("publishes fm:changed for the file when its text arrives", async () => {
    const { app } = fakeApp({ "sheet.md": "text" });
    cache.init(app);
    const listener = vi.fn();
    const unsubscribe = msgbus.subscribe("sheet.md", "fm:changed", listener);

    await cache.read("sheet.md");
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].proficiency_bonus).toBe(4);
  });

  it("caches an empty result for missing files without publishing", async () => {
    const { app } = fakeApp({});
    cache.init(app);
    const listener = vi.fn();
    const unsubscribe = msgbus.subscribe("missing.md", "fm:changed", listener);

    expect(await cache.read("missing.md")).toBe("");
    expect(await cache.read("missing.md")).toBe("");
    unsubscribe();

    expect(app.vault.getFileByPath).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("refreshes files it holds and ignores files it does not", async () => {
    const { app } = fakeApp({ "sheet.md": "old" });
    cache.init(app);
    await cache.read("sheet.md");

    cache.update("sheet.md", "new");
    cache.update("other.md", "ignored");

    expect(cache.get("sheet.md")).toBe("new");
    expect(cache.get("other.md")).toBe("");
  });

  it("reads the file again after it is removed", async () => {
    const { app, cachedRead } = fakeApp({ "sheet.md": "text" });
    cache.init(app);
    await cache.read("sheet.md");

    cache.remove("sheet.md");
    await cache.read("sheet.md");

    expect(cachedRead).toHaveBeenCalledTimes(2);
  });

  it("returns empty text before init", async () => {
    expect(await cache.read("sheet.md")).toBe("");
  });
});

describe("documentTextFor", () => {
  afterEach(() => {
    documentText.clear();
  });

  it("prefers the section info text", () => {
    const { app, cachedRead } = fakeApp({ "sheet.md": "file text" });
    documentText.init(app);

    expect(documentTextFor({} as HTMLElement, fakeCtx("sheet.md", "section text"))).toBe("section text");
    expect(cachedRead).not.toHaveBeenCalled();
  });

  it("falls back to the cached file when section info is null", async () => {
    const { app } = fakeApp({ "sheet.md": "file text" });
    documentText.init(app);
    const ctx = fakeCtx("sheet.md", null);

    expect(documentTextFor({} as HTMLElement, ctx)).toBe("");
    await documentText.read("sheet.md");
    expect(documentTextFor({} as HTMLElement, ctx)).toBe("file text");
  });

  it("returns empty text when the block has no source path", () => {
    expect(documentTextFor({} as HTMLElement, fakeCtx("", null))).toBe("");
  });
});
