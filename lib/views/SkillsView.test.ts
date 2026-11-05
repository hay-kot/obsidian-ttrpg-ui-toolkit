import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillsView } from "./SkillsView";
import { App, MarkdownPostProcessorContext } from "obsidian";
import * as AbilityService from "../domains/abilities";
import { documentText } from "../services/document-text";

// Mock VueMarkdown to avoid DOM issues in Node environment.
// TemplateAwareComponent extends VueMarkdown, so we capture mount calls and
// preserve a working containerEl/addUnloadFn surface.
vi.mock("./VueMarkdown", () => {
  return {
    VueMarkdown: class {
      public containerEl: HTMLElement;
      public mount = vi.fn();
      public mountReactive = vi.fn();
      public addUnloadFn = vi.fn();
      constructor(el: HTMLElement) {
        this.containerEl = el;
      }
    },
  };
});

// onFrontmatterChange/onAbilitiesChange need to return unsubscribe fns;
// frontmatter() is called during processAndRender.
const onFrontmatterChange = vi.fn((_cb: (...args: any[]) => void) => () => {});
const onAbilitiesChange = vi.fn((_cb: (...args: any[]) => void) => () => {});

vi.mock("./filecontext", () => ({
  useFileContext: vi.fn((_app: App, ctx: MarkdownPostProcessorContext) => ({
    filepath: ctx.sourcePath,
    frontmatter: vi.fn(() => ({
      proficiency_bonus: 3,
    })),
    onFrontmatterChange,
    onAbilitiesChange,
    md: () => ctx,
  })),
}));

describe("SkillsView", () => {
  let skillsView: SkillsView;
  let mockApp: App;
  let mockElement: HTMLElement;
  let mockContext: MarkdownPostProcessorContext;
  let addedChild: any = null;

  beforeEach(() => {
    addedChild = null;
    onFrontmatterChange.mockClear();
    onAbilitiesChange.mockClear();
    mockApp = {} as App;
    skillsView = new SkillsView(mockApp);
    mockElement = {
      createEl: vi.fn(() => ({ createEl: vi.fn() })),
    } as any;
    mockContext = {
      sourcePath: "test.md",
      addChild: vi.fn((child: any) => {
        addedChild = child;
      }),
      getSectionInfo: vi.fn(() => null),
    } as any;
  });

  it("should handle missing ability block gracefully", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    parseAbilityBlockSpy.mockImplementation(() => {
      throw new Error("No ability code blocks found");
    });

    const skillsYaml = `proficiencies:
  - athletics
  - intimidation`;

    expect(() => skillsView.render(skillsYaml, mockElement, mockContext)).not.toThrow();
    await addedChild.onload();
    expect(parseAbilityBlockSpy).toHaveBeenCalled();

    parseAbilityBlockSpy.mockRestore();
  });

  it("should use ability scores when ability block is found", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    parseAbilityBlockSpy.mockReturnValue({
      abilities: {
        strength: 16,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
      bonuses: [],
      proficiencies: [],
    });

    const skillsYaml = `proficiencies:
  - athletics`;

    expect(() => skillsView.render(skillsYaml, mockElement, mockContext)).not.toThrow();
    await addedChild.onload();
    expect(parseAbilityBlockSpy).toHaveBeenCalled();

    parseAbilityBlockSpy.mockRestore();
  });

  it("should use default ability scores (10) when no ability block found", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    parseAbilityBlockSpy.mockImplementation(() => {
      throw new Error("No ability code blocks found");
    });

    const skillsYaml = `proficiencies:
  - athletics`;

    expect(() => skillsView.render(skillsYaml, mockElement, mockContext)).not.toThrow();
    await addedChild.onload();

    parseAbilityBlockSpy.mockRestore();
  });

  it("should subscribe to frontmatter and abilities changes when ability block uses templates", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    parseAbilityBlockSpy.mockReturnValue({
      abilities: {
        strength: 14,
        dexterity: 12,
        constitution: 13,
        intelligence: 10,
        wisdom: 8,
        charisma: 16,
      },
      bonuses: [],
      proficiencies: [],
    });

    // Section info containing an ability block with template variables.
    (mockContext.getSectionInfo as any).mockReturnValue({
      text: '```ability\nabilities:\n  strength: "{{frontmatter.str}}"\n```',
      lineStart: 0,
      lineEnd: 4,
    });

    const skillsYaml = `proficiencies:
  - athletics`;

    skillsView.render(skillsYaml, mockElement, mockContext);
    await addedChild.onload();

    // The component is template-aware, so listeners should be installed.
    expect(onFrontmatterChange).toHaveBeenCalledTimes(1);
    expect(onAbilitiesChange).toHaveBeenCalledTimes(1);

    parseAbilityBlockSpy.mockRestore();
  });

  it("should re-render when subscribed frontmatter change fires", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    parseAbilityBlockSpy.mockReturnValue({
      abilities: {
        strength: 14,
        dexterity: 12,
        constitution: 13,
        intelligence: 10,
        wisdom: 8,
        charisma: 16,
      },
      bonuses: [],
      proficiencies: [],
    });

    (mockContext.getSectionInfo as any).mockReturnValue({
      text: '```ability\nabilities:\n  strength: "{{frontmatter.str}}"\n```',
      lineStart: 0,
      lineEnd: 4,
    });

    let registeredCallback: (() => void) | null = null;
    onFrontmatterChange.mockImplementation((cb: any) => {
      registeredCallback = cb;
      return () => {};
    });

    const skillsYaml = `proficiencies:
  - athletics`;

    skillsView.render(skillsYaml, mockElement, mockContext);
    await addedChild.onload();

    const callsAfterInitial = parseAbilityBlockSpy.mock.calls.length;
    expect(callsAfterInitial).toBeGreaterThanOrEqual(1);

    // Trigger the registered frontmatter-change callback — should re-render.
    expect(registeredCallback).not.toBeNull();
    (registeredCallback as any)();

    expect(parseAbilityBlockSpy.mock.calls.length).toBeGreaterThan(callsAfterInitial);

    parseAbilityBlockSpy.mockRestore();
  });

  it("produces numeric skill modifiers from a resolved ability block", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    // Simulate the resolved block (e.g. after templates have been applied).
    parseAbilityBlockSpy.mockReturnValue({
      abilities: {
        strength: 18, // +4
        dexterity: 14, // +2
        constitution: 12,
        intelligence: 10,
        wisdom: 8,
        charisma: 16,
      },
      bonuses: [],
      proficiencies: [],
    });

    const skillsYaml = `proficiencies:
  - athletics`;

    skillsView.render(skillsYaml, mockElement, mockContext);
    await addedChild.onload();

    // mount should have been called with finite numeric modifiers.
    expect(addedChild.mount).toHaveBeenCalled();
    const mountArgs = addedChild.mount.mock.calls[0];
    const props = mountArgs[1];
    expect(Array.isArray(props.items)).toBe(true);
    for (const item of props.items) {
      expect(Number.isFinite(item.modifier)).toBe(true);
    }

    // Athletics is STR-based and listed as a proficiency: +4 (mod) + 3 (prof) = +7.
    const athletics = props.items.find((i: any) => i.label.toLowerCase() === "athletics");
    expect(athletics).toBeDefined();
    expect(athletics.modifier).toBe(7);

    parseAbilityBlockSpy.mockRestore();
  });

  it("renders skills when an ability score resolves to 0 (template fallback)", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    // Simulates resolveAbilityBlock falling back to 0 for an unresolvable template:
    // a strict !skillAbility check would treat 0 as missing and throw.
    parseAbilityBlockSpy.mockReturnValue({
      abilities: {
        strength: 0,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 8,
        charisma: 16,
      },
      bonuses: [],
      proficiencies: [],
    });

    const skillsYaml = `proficiencies:
  - athletics`;

    skillsView.render(skillsYaml, mockElement, mockContext);
    await addedChild.onload();

    expect(addedChild.mount).toHaveBeenCalled();
    const props = addedChild.mount.mock.calls[0][1];
    const athletics = props.items.find((i: any) => i.label.toLowerCase() === "athletics");
    expect(athletics).toBeDefined();
    // Strength 0 → modifier -5; +3 proficiency → -2.
    expect(athletics.modifier).toBe(-2);

    parseAbilityBlockSpy.mockRestore();
  });

  it("flags advantage and disadvantage on the matching skills", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    parseAbilityBlockSpy.mockReturnValue({
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      bonuses: [],
      proficiencies: [],
    });

    const skillsYaml = `proficiencies:
  - athletics
advantage:
  perception: true
disadvantage:
  stealth: true`;

    skillsView.render(skillsYaml, mockElement, mockContext);
    await addedChild.onload();

    const props = addedChild.mount.mock.calls[0][1];
    const perception = props.items.find((i: any) => i.label.toLowerCase() === "perception");
    const stealth = props.items.find((i: any) => i.label.toLowerCase() === "stealth");
    const athletics = props.items.find((i: any) => i.label.toLowerCase() === "athletics");

    expect(perception.hasAdvantage).toBe(true);
    expect(perception.hasDisadvantage).toBe(false);
    expect(stealth.hasDisadvantage).toBe(true);
    expect(stealth.hasAdvantage).toBe(false);
    // Untouched skills carry neither flag.
    expect(athletics.hasAdvantage).toBe(false);
    expect(athletics.hasDisadvantage).toBe(false);

    parseAbilityBlockSpy.mockRestore();
  });

  it("cancels out a skill flagged as both advantage and disadvantage", async () => {
    const parseAbilityBlockSpy = vi.spyOn(AbilityService, "parseAbilityBlockFromDocument");
    parseAbilityBlockSpy.mockReturnValue({
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      bonuses: [],
      proficiencies: [],
    });

    const skillsYaml = `advantage:
  perception: true
disadvantage:
  perception: true`;

    skillsView.render(skillsYaml, mockElement, mockContext);
    await addedChild.onload();

    const props = addedChild.mount.mock.calls[0][1];
    const perception = props.items.find((i: any) => i.label.toLowerCase() === "perception");
    expect(perception.hasAdvantage).toBe(false);
    expect(perception.hasDisadvantage).toBe(false);

    parseAbilityBlockSpy.mockRestore();
  });
  it("uses the note's file text when section info is null (embeds)", async () => {
    const noteText = "```ability\nabilities:\n  strength: 18\n```\n\n```skills\nproficiencies:\n  - athletics\n```";
    documentText.init({
      vault: {
        getFileByPath: (path: string) => ({ path }),
        cachedRead: async () => noteText,
      },
      metadataCache: { getCache: () => ({}) },
    } as unknown as App);

    let rerender: (() => void) | null = null;
    onFrontmatterChange.mockImplementation((cb: any) => {
      rerender = cb;
      return () => {};
    });

    skillsView.render("proficiencies:\n  - athletics", mockElement, mockContext);
    await addedChild.onload();

    const athleticsIn = (call: number) =>
      addedChild.mount.mock.calls[call][1].items.find((i: any) => i.label === "Athletics").modifier;

    // The file read is still in flight on first render, so defaults apply.
    expect(athleticsIn(0)).toBe(3);

    await documentText.read("test.md");
    expect(rerender).not.toBeNull();
    (rerender as any)();

    // Strength 18 -> +4, plus +3 proficiency.
    expect(athleticsIn(1)).toBe(7);

    documentText.clear();
  });
});
