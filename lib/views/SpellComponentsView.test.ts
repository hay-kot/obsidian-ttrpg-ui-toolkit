import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, MarkdownPostProcessorContext } from "obsidian";
import { SpellComponentsView } from "./SpellComponentsView";
import { documentText } from "lib/services/document-text";
import type { SpellComponentsBlock } from "lib/types";

vi.mock("./VueMarkdown", () => ({
  VueMarkdown: class {
    containerEl: HTMLElement;
    constructor(el: HTMLElement) {
      this.containerEl = el;
    }
    mount = vi.fn();
  },
}));

const abilityNote = (wisdom: number) => `\`\`\`ability\nabilities:\n  wisdom: ${wisdom}\n\`\`\`\n`;

describe("SpellComponentsView", () => {
  let app: App;
  let cachedRead: ReturnType<typeof vi.fn>;
  let fileText: string;

  beforeEach(() => {
    fileText = abilityNote(16);
    cachedRead = vi.fn(async () => fileText);
    app = {
      vault: { getFileByPath: (path: string) => ({ path }), cachedRead },
      metadataCache: { getCache: () => ({ frontmatter: { level: 5, spellcasting_ability: "wisdom" } }) },
    } as unknown as App;
    documentText.init(app);
  });

  afterEach(() => {
    documentText.clear();
  });

  async function render(sectionText: string | null): Promise<SpellComponentsBlock> {
    const ctx = {
      sourcePath: "sheet.md",
      addChild: vi.fn(),
      getSectionInfo: () => (sectionText === null ? null : { text: sectionText, lineStart: 0, lineEnd: 0 }),
    } as unknown as MarkdownPostProcessorContext;
    new SpellComponentsView(app).register("save: true\nattack: true", document.createElement("div"), ctx);
    await vi.waitFor(() => expect(ctx.addChild).toHaveBeenCalled());
    const child = (ctx.addChild as ReturnType<typeof vi.fn>).mock.calls[0][0];
    return child.mount.mock.calls[0][1].data;
  }

  // Level 5 -> proficiency +3. WIS 16 -> +3, WIS 10 -> +0.

  it("reads the note file when section info is null (embeds)", async () => {
    const data = await render(null);

    expect(data.save_dc).toBe(14);
    expect(data.attack_bonus).toBe(6);
  });

  it("prefers the section text over the note file", async () => {
    const data = await render(abilityNote(10));

    expect(data.save_dc).toBe(11);
    expect(data.attack_bonus).toBe(3);
    expect(cachedRead).not.toHaveBeenCalled();
  });

  it("leaves DC and attack unset when the note has no ability block", async () => {
    fileText = "No ability block here.";

    const data = await render(null);

    expect(data.save_dc).toBeUndefined();
    expect(data.attack_bonus).toBeUndefined();
  });
});
