import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, MarkdownPostProcessorContext } from "obsidian";
import { HealthView } from "./HealthView";
import { KeyValueStore } from "lib/services/kv/kv";
import { documentText } from "lib/services/document-text";
import type { HealthState } from "lib/domains/healthpoints";

vi.mock("./VueMarkdown", () => ({
  VueMarkdown: class {
    containerEl: HTMLElement;
    constructor(el: HTMLElement) {
      this.containerEl = el;
    }
    mount = vi.fn();
    mountReactive = vi.fn();
    addUnloadFn = vi.fn();
  },
}));

class MemoryDataStore {
  private data: Record<string, unknown> = {};
  async loadData() {
    return this.data;
  }
  async saveData(data: Record<string, unknown>) {
    this.data = data;
  }
}

// CON 16 -> +3, so max HP resolves to 13 with the real ability block. Against
// the zeroed scores a cold cache gives, it resolves to 5 and the clamp would
// save current HP as 5.
const NOTE = "```ability\nabilities:\n  constitution: 16\n```\n";
const HEALTH_BLOCK = 'state_key: embed_hp\nhealth: "{{add 10 (modifier abilities.constitution)}}"';

describe("HealthView in an embed", () => {
  let app: App;
  let kv: KeyValueStore;
  let view: HealthView;

  beforeEach(() => {
    app = {
      vault: {
        getFileByPath: (path: string) => ({ path }),
        cachedRead: async () => NOTE,
      },
      metadataCache: { getCache: () => ({ frontmatter: { level: 5 } }) },
    } as unknown as App;
    documentText.init(app);
    kv = new KeyValueStore(new MemoryDataStore());
    view = new HealthView(app, kv);
  });

  afterEach(() => {
    documentText.clear();
  });

  async function render(sectionText: string | null) {
    const ctx = {
      sourcePath: "sheet.md",
      addChild: vi.fn(),
      getSectionInfo: () => (sectionText === null ? null : { text: sectionText, lineStart: 0, lineEnd: 0 }),
    } as unknown as MarkdownPostProcessorContext;
    view.render(HEALTH_BLOCK, document.createElement("div"), ctx);
    const child = (ctx.addChild as ReturnType<typeof vi.fn>).mock.calls[0][0];
    child.onload();
    await child.ready;
    return child;
  }

  it("keeps saved HP on a cold document cache", async () => {
    await render(NOTE);
    expect((await kv.get<HealthState>("embed_hp"))?.current).toBe(13);

    // A new session: same saved state, nothing cached yet.
    documentText.init(app);

    const child = await render(null);

    expect((await kv.get<HealthState>("embed_hp"))?.current).toBe(13);
    expect(child.propsRef.value.static.health).toBe(13);
  });
});
