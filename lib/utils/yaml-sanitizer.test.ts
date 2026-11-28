import { describe, it, expect } from "vitest";
import { normalizeYamlIndentation } from "./yaml-sanitizer";
import { parse } from "yaml";

describe("normalizeYamlIndentation", () => {
  it("should pass through content without tabs unchanged", () => {
    const input = "state_key: test\n  health: 24";
    expect(normalizeYamlIndentation(input)).toBe(input);
  });

  it("should convert leading tabs to 2 spaces each", () => {
    const input = "state_key: test\n\thealth: 24";
    const expected = "state_key: test\n  health: 24";
    expect(normalizeYamlIndentation(input)).toBe(expected);
  });

  it("should convert multiple leading tabs", () => {
    const input = "items:\n\t- label: foo\n\t\tvalue: bar";
    const expected = "items:\n  - label: foo\n    value: bar";
    expect(normalizeYamlIndentation(input)).toBe(expected);
  });

  it("should leave inline tabs after a colon unchanged", () => {
    const input = "state_key:\ttest";
    expect(normalizeYamlIndentation(input)).toBe(input);
    expect(parse(normalizeYamlIndentation(input))).toEqual({ state_key: "test" });
  });

  it("should preserve a tab inside a quoted value", () => {
    const input = 'description: "a\tb"\nitems:\n\t- "c\td"';
    const normalized = normalizeYamlIndentation(input);
    expect(normalized).toBe('description: "a\tb"\nitems:\n  - "c\td"');
    expect(parse(normalized)).toEqual({ description: "a\tb", items: ["c\td"] });
  });

  it("should preserve a tab inside a block scalar", () => {
    const input = "text: |\n  col1\tcol2\n  next";
    expect(normalizeYamlIndentation(input)).toBe(input);
    expect(parse(normalizeYamlIndentation(input))).toEqual({ text: "col1\tcol2\nnext\n" });
  });

  it("should handle mixed tabs and spaces (leading tabs only)", () => {
    const input = "\t  nested: value\tkept";
    const expected = "    nested: value\tkept";
    expect(normalizeYamlIndentation(input)).toBe(expected);
  });

  it("should handle first line with tab indentation", () => {
    const input = "\tstate_key: test\n\thealth: 24";
    const expected = "  state_key: test\n  health: 24";
    expect(normalizeYamlIndentation(input)).toBe(expected);
  });

  it("should produce valid YAML after normalization", () => {
    const tabbed = "state_key: hp_test\nhealth: 24\nhitdice:\n\tdice: d8\n\tvalue: 5";
    const normalized = normalizeYamlIndentation(tabbed);
    const parsed = parse(normalized);
    expect(parsed).toEqual({
      state_key: "hp_test",
      health: 24,
      hitdice: {
        dice: "d8",
        value: 5,
      },
    });
  });

  it("should produce valid YAML with list items after normalization", () => {
    const tabbed = "items:\n\t- label: Strength\n\t  value: 18\n\t- label: Dexterity\n\t  value: 14";
    const normalized = normalizeYamlIndentation(tabbed);
    const parsed = parse(normalized);
    expect(parsed).toEqual({
      items: [
        { label: "Strength", value: 18 },
        { label: "Dexterity", value: 14 },
      ],
    });
  });

  it("should handle empty string", () => {
    expect(normalizeYamlIndentation("")).toBe("");
  });

  it("should handle string with only tabs", () => {
    const input = "\t\t";
    const expected = "    ";
    expect(normalizeYamlIndentation(input)).toBe(expected);
  });
});
