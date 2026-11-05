import * as Handlebars from "handlebars";
import { AbilityScores, Frontmatter, SkillsBlock } from "../types";
import { parseAbilityBlockFromText, calculateModifier, getTotalScore } from "../domains/abilities";
import { parseSkillsBlock } from "../domains/skills";
import { documentTextFor } from "../services/document-text";
import { FileContext } from "../views/filecontext";
import { extractFirstCodeBlock } from "./codeblock-extractor";

export interface TemplateContext {
  frontmatter: Frontmatter;
  abilities: AbilityScores;
  skills: SkillsBlock;
}

function init() {
  // Register helper functions for math operations
  Handlebars.registerHelper("add", (...args: unknown[]) => {
    // Last argument is handlebars options object, filter it out
    const numbers = args
      .slice(0, -1)
      .map((n) => Number(n))
      .filter((n) => !isNaN(n));
    return numbers.reduce((sum, n) => sum + n, 0);
  });

  Handlebars.registerHelper("subtract", (a: number, b: number) => a - b);
  Handlebars.registerHelper("multiply", (a: number, b: number) => a * b);
  Handlebars.registerHelper("divide", (a: number, b: number) => a / b);
  // Floored modulo, so the result always carries the sign of the divisor. Sheet math
  // is nearly always cycling an index (e.g. stepping a damage die every N levels),
  // where JS remainder semantics would hand back a negative index.
  Handlebars.registerHelper("mod", (a: number, b: number) => {
    const dividend = Number(a);
    const divisor = Number(b);
    return dividend - divisor * Math.floor(dividend / divisor);
  });
  Handlebars.registerHelper("floor", (a: number) => Math.floor(a));
  Handlebars.registerHelper("ceil", (a: number) => Math.ceil(a));
  Handlebars.registerHelper("round", (a: number) => Math.round(a));
  Handlebars.registerHelper("modifier", (score: number) => calculateModifier(score));

  // Text helpers
  Handlebars.registerHelper("strip-link", (a: string) => a.replace(/\[\[([^|]+)\|([^\]]+)\]\]/g, "$2"));
}

init();

export function hasTemplateVariables(text: string): boolean {
  return text.includes("{{") && text.includes("}}");
}

export function processTemplate(text: string, context: TemplateContext): string {
  if (!hasTemplateVariables(text)) {
    return text;
  }

  try {
    const template = Handlebars.compile(text);
    return template(context);
  } catch (error) {
    console.error("Template processing error:", error);
    return text; // Return original text if template processing fails
  }
}

/**
 * Coerces a (possibly template-processed) string into a number for numeric component
 * fields. Falls back to 0 when the value is not numeric. If the original source
 * contained template variables, a typo or compile failure can leave the result empty
 * or non-numeric — in that case we emit a console.warn so the failure leaves a
 * breadcrumb instead of silently rendering as 0.
 */
export function coerceNumericTemplate(processed: string, source: string): number {
  const trimmed = processed.trim();
  const n = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(n)) return n;
  if (hasTemplateVariables(source)) {
    console.warn(
      `[ttrpg-ui-toolkit] Template did not resolve to a number: ${JSON.stringify(processed)} (from ${JSON.stringify(source)})`
    );
  }
  return 0;
}

/**
 * Coerces a (possibly template-processed) value into a boolean for boolean
 * component fields such as advantage/disadvantage flags. Accepts native YAML
 * booleans, and the strings "true"/"false" produced by Handlebars when a
 * frontmatter boolean is interpolated (e.g. `{{frontmatter.strAdvantage}}`).
 * Anything else resolves to false. A context is only needed when the value is a
 * template string; literal booleans are handled without one.
 */
export function coerceBooleanTemplate(value: unknown, context?: TemplateContext | null): boolean {
  if (typeof value === "boolean") return value;
  // Anything that isn't a scalar can't spell "true" once stringified, so it
  // takes the same path null and undefined do.
  if (typeof value !== "string" && typeof value !== "number") return false;
  const str = String(value);
  const processed = context && hasTemplateVariables(str) ? processTemplate(str, context) : str;
  return processed.trim().toLowerCase() === "true";
}

export function createTemplateContext(el: HTMLElement, fileContext: FileContext): TemplateContext {
  const frontmatter = fileContext.frontmatter();
  const documentText = documentTextFor(el, fileContext.md());

  let abilities: AbilityScores = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };

  let skills: SkillsBlock = {
    proficiencies: [],
    expertise: [],
    half_proficiencies: [],
    bonuses: [],
  };

  try {
    const abilityBlock = parseAbilityBlockFromText(documentText, frontmatter);

    // Calculate total scores including bonuses that modify the score
    abilities = {
      strength: getTotalScore(abilityBlock.abilities.strength, "strength", abilityBlock.bonuses),
      dexterity: getTotalScore(abilityBlock.abilities.dexterity, "dexterity", abilityBlock.bonuses),
      constitution: getTotalScore(abilityBlock.abilities.constitution, "constitution", abilityBlock.bonuses),
      intelligence: getTotalScore(abilityBlock.abilities.intelligence, "intelligence", abilityBlock.bonuses),
      wisdom: getTotalScore(abilityBlock.abilities.wisdom, "wisdom", abilityBlock.bonuses),
      charisma: getTotalScore(abilityBlock.abilities.charisma, "charisma", abilityBlock.bonuses),
    };
  } catch {
    // No ability block found; fall back to defaults
  }

  try {
    const skillsContent = extractFirstCodeBlock(documentText, "skills");

    if (skillsContent) {
      skills = parseSkillsBlock(skillsContent);
    }
  } catch {
    // No skills block found; fall back to defaults
  }

  return {
    frontmatter,
    abilities,
    skills,
  };
}
