import { describe, it, expect } from "vitest";
import { extractCodeBlocks, extractFirstCodeBlock } from "./codeblock-extractor";

describe("codeblock-extractor", () => {
  describe("extractCodeBlocks", () => {
    it("should extract single code block", () => {
      const text = `Some text
\`\`\`ability
ability:
  strength: 10
\`\`\``;

      const blocks = extractCodeBlocks(text, "ability");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe("ability:\n  strength: 10");
    });

    it("should extract multiple code blocks", () => {
      const text = `First block:
\`\`\`ability
first: 1
\`\`\`

Second block:
\`\`\`ability
second: 2
\`\`\``;

      const blocks = extractCodeBlocks(text, "ability");
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toBe("first: 1");
      expect(blocks[1]).toBe("second: 2");
    });

    it("should extract code blocks from callouts", () => {
      const text = `> \`\`\`ability
> ability:
>   strength: 15
> \`\`\``;

      const blocks = extractCodeBlocks(text, "ability");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe("ability:\n  strength: 15");
    });

    it("should extract code blocks from nested callouts", () => {
      const text = `>>> \`\`\`skills
>>> proficiencies:
>>>   - athletics
>>>   - intimidation
>>> \`\`\``;

      const blocks = extractCodeBlocks(text, "skills");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe("proficiencies:\n  - athletics\n  - intimidation");
    });

    it("should return empty array when no blocks found", () => {
      const text = "No code blocks here";

      const blocks = extractCodeBlocks(text, "ability");
      expect(blocks).toEqual([]);
    });

    it("should only extract blocks of specified type", () => {
      const text = `\`\`\`ability
ability: test
\`\`\`

\`\`\`skills
skills: test
\`\`\``;

      const abilityBlocks = extractCodeBlocks(text, "ability");
      expect(abilityBlocks).toHaveLength(1);
      expect(abilityBlocks[0]).toBe("ability: test");

      const skillsBlocks = extractCodeBlocks(text, "skills");
      expect(skillsBlocks).toHaveLength(1);
      expect(skillsBlocks[0]).toBe("skills: test");
    });

    it("should handle empty content blocks", () => {
      const text = `\`\`\`ability
\`\`\``;

      const blocks = extractCodeBlocks(text, "ability");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe("");
    });
  });

  describe("tab normalization", () => {
    it("should normalize tab indentation inside extracted blocks", () => {
      const text = "```ability\nability:\n\tstrength: 10\n```";

      const blocks = extractCodeBlocks(text, "ability");
      expect(blocks[0]).toBe("ability:\n  strength: 10");
    });
  });

  describe("extractFirstCodeBlock", () => {
    it("should extract first block when multiple exist", () => {
      const text = `\`\`\`ability
first: 1
\`\`\`

\`\`\`ability
second: 2
\`\`\``;

      const content = extractFirstCodeBlock(text, "ability");
      expect(content).toBe("first: 1");
    });

    it("should return null when no blocks found", () => {
      const text = "No code blocks here";

      const content = extractFirstCodeBlock(text, "ability");
      expect(content).toBeNull();
    });

    it("should extract from callout", () => {
      const text = `> \`\`\`ability
> test: value
> \`\`\``;

      const content = extractFirstCodeBlock(text, "ability");
      expect(content).toBe("test: value");
    });
  });
});
