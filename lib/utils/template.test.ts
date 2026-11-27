import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { coerceNumericTemplate, hasTemplateVariables, processTemplate, createTemplateContext } from "./template";
import { calculateModifier } from "lib/domains/abilities";
import type { TemplateContext } from "./template";

describe("template", () => {
  describe("hasTemplateVariables", () => {
    it("should detect template variables", () => {
      expect(hasTemplateVariables("Hello {{name}}")).toBe(true);
      expect(hasTemplateVariables("{{value}} is {{other}}")).toBe(true);
      expect(hasTemplateVariables("No variables here")).toBe(false);
      expect(hasTemplateVariables("{{ spaced }}")).toBe(true);
      expect(hasTemplateVariables("{single}")).toBe(false);
      expect(hasTemplateVariables("")).toBe(false);
    });
  });

  describe("processTemplate", () => {
    const mockContext: TemplateContext = {
      frontmatter: {
        class: "[[wizard-phb|Wizard]]",
        proficiency_bonus: 2,
      },
      abilities: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
      skills: {
        proficiencies: ["Athletics"],
        expertise: [],
        half_proficiencies: [],
        bonuses: [],
      },
    };

    it("should process templates with context variables and math helpers", () => {
      expect(processTemplate("Strength: {{abilities.strength}}", mockContext)).toBe("Strength: 15");
      expect(processTemplate("Proficiency: +{{frontmatter.proficiency_bonus}}", mockContext)).toBe("Proficiency: +2");
      expect(processTemplate("{{add 5 3}}", mockContext)).toBe("8");
      expect(processTemplate("{{subtract 10 4}}", mockContext)).toBe("6");
      expect(processTemplate("{{multiply 3 4}}", mockContext)).toBe("12");
      expect(processTemplate("{{divide 15 3}}", mockContext)).toBe("5");
      expect(processTemplate("{{mod 17 5}}", mockContext)).toBe("2");
      expect(processTemplate("{{floor 3.7}}", mockContext)).toBe("3");
      expect(processTemplate("{{ceil 3.2}}", mockContext)).toBe("4");
      expect(processTemplate("{{round 3.6}}", mockContext)).toBe("4");
      expect(processTemplate("{{min 6 17 10}}", mockContext)).toBe("6");
      expect(processTemplate("{{max 14 19 8}}", mockContext)).toBe("19");
      expect(processTemplate("{{strip-link frontmatter.class}}", mockContext)).toBe("Wizard");
    });

    it("should handle multiple arguments in add helper and modifier calculations", () => {
      expect(processTemplate("{{add 1 2 3 4}}", mockContext)).toBe("10");
      expect(processTemplate("{{add abilities.strength frontmatter.proficiency_bonus}}", mockContext)).toBe("17");
      expect(processTemplate("STR modifier: {{modifier abilities.strength}}", mockContext)).toBe("STR modifier: 2");
      expect(processTemplate("CHA modifier: {{modifier abilities.charisma}}", mockContext)).toBe("CHA modifier: -1");
    });

    it("should wrap negative dividends into the positive range in mod", () => {
      expect(processTemplate("{{mod -1 5}}", mockContext)).toBe("4");
      expect(processTemplate("{{mod -5 5}}", mockContext)).toBe("0");
      expect(processTemplate("{{mod 0 5}}", mockContext)).toBe("0");
      expect(processTemplate("{{mod (subtract frontmatter.proficiency_bonus 3) 6}}", mockContext)).toBe("5");
    });

    it("should return original text when no template variables", () => {
      expect(processTemplate("No templates here", mockContext)).toBe("No templates here");
    });
  });

  describe("coerceNumericTemplate", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("returns the parsed number for valid numeric input", () => {
      expect(coerceNumericTemplate("5", "5")).toBe(5);
      expect(coerceNumericTemplate("-3", "-3")).toBe(-3);
      expect(coerceNumericTemplate("0", "0")).toBe(0);
      expect(coerceNumericTemplate(" 12 ", " 12 ")).toBe(12);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("returns 0 silently for non-numeric raw input (no template)", () => {
      expect(coerceNumericTemplate("abc", "abc")).toBe(0);
      expect(coerceNumericTemplate("", "")).toBe(0);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("warns when a templated source resolves to a non-numeric value", () => {
      expect(coerceNumericTemplate("abc", "{{ frontmatter.foo }}")).toBe(0);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain("did not resolve to a number");
      expect(warnSpy.mock.calls[0][0]).toContain("{{ frontmatter.foo }}");
    });

    it("warns when a templated source resolves to an empty string (missing property)", () => {
      expect(coerceNumericTemplate("", "{{ frontmatter.missing }}")).toBe(0);
      expect(warnSpy).toHaveBeenCalledOnce();
    });

    it("warns when a malformed template falls back to the raw source string", () => {
      // processTemplate returns the original text when Handlebars compile fails,
      // so the processed value here still contains the template delimiters.
      const malformed = "{{#if}}foo{{/if}}";
      expect(coerceNumericTemplate(malformed, malformed)).toBe(0);
      expect(warnSpy).toHaveBeenCalledOnce();
    });

    it("does not warn when the templated source resolves to a number", () => {
      expect(coerceNumericTemplate("7", "{{ frontmatter.bonus }}")).toBe(7);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("createTemplateContext", () => {
    it("should create context with calculated ability scores including bonuses", () => {
      const mockElement = {} as HTMLElement;
      const mockFileContext = {
        frontmatter: () => ({ proficiency_bonus: 2 }),
        md: () => ({
          getSectionInfo: vi.fn().mockReturnValue({
            text: `
\`\`\`ability
abilities:
  strength: 15
  dexterity: 12
bonuses:
  - name: "Belt of Giant Strength"
    target: "strength"
    value: 4
    modifies: "score"
  - name: "Saving Throw Bonus"
    target: "dexterity"
    value: 2
    modifies: "saving_throw"
\`\`\`
`,
          }),
        }),
      } as any;

      const context = createTemplateContext(mockElement, mockFileContext);

      // Strength should be 15 + 4 = 19 (score bonus applied)
      expect(context.abilities.strength).toBe(19);
      // Dexterity should remain 12 (saving throw bonus doesn't affect score)
      expect(context.abilities.dexterity).toBe(12);
      // Other abilities should remain 0 (default values)
      expect(context.abilities.constitution).toBe(0);
    });

    it("should handle missing ability blocks gracefully", () => {
      const mockElement = {} as HTMLElement;
      const mockFileContext = {
        frontmatter: () => ({ proficiency_bonus: 2 }),
        md: () => ({
          getSectionInfo: vi.fn().mockReturnValue({
            text: "No ability blocks here",
          }),
        }),
      } as any;

      const context = createTemplateContext(mockElement, mockFileContext);

      // Should use default values when no ability block found
      expect(context.abilities.strength).toBe(0);
      expect(context.abilities.dexterity).toBe(0);
      expect(context.frontmatter.proficiency_bonus).toBe(2);
    });

    it("should calculate skill proficiency correctly from ability scores, including bonuses", () => {
      const mockElement = {} as HTMLElement;
      const mockFileContext = {
        frontmatter: () => ({ proficiency_bonus: 3 }),

        md: () => ({
          getSectionInfo: vi.fn().mockReturnValue({
            text: `
\`\`\`ability
abilities:
  intelligence: 15
bonuses:
  - name: "Racial"
    target: "intelligence"
    value: 2
    modifies: "score"
  - name: "Telekinetic feat"
    target: "intelligence"
    value: 1
    modifies: "score"
\`\`\`

\`\`\`skills
proficiencies:
  - arcana
  - history
  - investigation
expertise:
  - investigation
\`\`\`
`,
          }),
        }),
      } as any;

      const context = createTemplateContext(mockElement, mockFileContext);

      // Intelligence should be 15 + 2 + 1 = 18 (score bonus applied)
      expect(context.abilities.intelligence).toBe(18);

      // Investigation should be 4 (INT modifier) + 6 (proficiency_bonus * 2) = 10
      const intelligenceModifier = calculateModifier(context.abilities.intelligence);
      const investigationValue = intelligenceModifier + context.frontmatter.proficiency_bonus * 2;
      expect(investigationValue).toBe(10);
    });
  });
});
