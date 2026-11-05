import { AbilityBlock, AbilityScores, Frontmatter, GenericBonus } from "lib/types";
import { MarkdownPostProcessorContext } from "obsidian";
import * as Utils from "lib/utils/utils";
import { parseYamlObject } from "lib/utils/yaml";
import { extractFirstCodeBlock } from "../utils/codeblock-extractor";
import { documentTextFor } from "../services/document-text";
import { coerceBooleanTemplate, processTemplate, TemplateContext } from "../utils/template";

export { calculateModifier, formatModifier } from "./dnd/modifiers";

export type RawAbilityScores = {
  strength: number | string;
  dexterity: number | string;
  constitution: number | string;
  intelligence: number | string;
  wisdom: number | string;
  charisma: number | string;
};

export type RawAbilityBlock = {
  abilities: RawAbilityScores;
  bonuses: GenericBonus[];
  proficiencies: string[];
  advantage?: Record<string, string | boolean>;
  disadvantage?: Record<string, string | boolean>;
};

// Maps both full ability names and their 3-letter abbreviations to the canonical
// AbilityScores key, so advantage/disadvantage entries can be written either way.
const ABILITY_ALIASES: Record<string, keyof AbilityScores> = {
  str: "strength",
  strength: "strength",
  dex: "dexterity",
  dexterity: "dexterity",
  con: "constitution",
  constitution: "constitution",
  int: "intelligence",
  intelligence: "intelligence",
  wis: "wisdom",
  wisdom: "wisdom",
  cha: "charisma",
  charisma: "charisma",
};

const ABILITY_KEYS: (keyof RawAbilityScores)[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const EMPTY_FRONTMATTER: Frontmatter = { proficiency_bonus: 0 };

const ZERO_ABILITIES: AbilityScores = {
  strength: 0,
  dexterity: 0,
  constitution: 0,
  intelligence: 0,
  wisdom: 0,
  charisma: 0,
};

export function parseAbilityBlockFromDocument(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  frontmatter?: Frontmatter | null
): AbilityBlock {
  const abilityContent = extractFirstCodeBlock(documentTextFor(el, ctx), "ability");

  if (!abilityContent) {
    throw new Error("No ability code blocks found");
  }

  const raw = parseAbilityBlock(abilityContent);
  return resolveAbilityBlock(raw, frontmatter ?? null);
}

export function parseAbilityBlock(yamlString: string): RawAbilityBlock {
  const def: RawAbilityBlock = {
    abilities: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    },
    bonuses: [],
    proficiencies: [],
    advantage: {},
    disadvantage: {},
  };

  const parsed = parseYamlObject<RawAbilityBlock>(yamlString);
  return Utils.mergeWithDefaults(parsed, def);
}

/**
 * Resolves an advantage/disadvantage map (keyed by full ability name or 3-letter
 * abbreviation, with boolean or template-string values) into a map keyed by the
 * canonical AbilityScores name. Only truthy entries are retained.
 */
function resolveAdvantageMap(
  map: Record<string, string | boolean> | undefined,
  context: TemplateContext
): Partial<Record<keyof AbilityScores, boolean>> {
  const resolved: Partial<Record<keyof AbilityScores, boolean>> = {};
  if (!map) return resolved;

  for (const [rawKey, value] of Object.entries(map)) {
    const ability = ABILITY_ALIASES[rawKey.toLowerCase()];
    if (!ability) continue;
    if (coerceBooleanTemplate(value, context)) resolved[ability] = true;
  }

  return resolved;
}

/**
 * Resolves a RawAbilityBlock (whose ability scores may be Handlebars template
 * strings such as `{{frontmatter.str}}`) into an AbilityBlock with numeric
 * scores. Templates are evaluated against a minimal context (frontmatter +
 * zeroed abilities/skills) to avoid recursing through `createTemplateContext`,
 * which itself calls `parseAbilityBlockFromDocument`. Non-finite results emit a
 * console.warn and fall back to 0.
 */
export function resolveAbilityBlock(raw: RawAbilityBlock, frontmatter: Frontmatter | null): AbilityBlock {
  const fm = frontmatter ?? EMPTY_FRONTMATTER;
  const templateContext = {
    frontmatter: fm,
    abilities: { ...ZERO_ABILITIES },
    skills: {
      proficiencies: [],
      expertise: [],
      half_proficiencies: [],
      bonuses: [],
    },
  };

  const resolved: AbilityScores = { ...ZERO_ABILITIES };

  for (const key of ABILITY_KEYS) {
    const value = raw.abilities[key];
    if (typeof value === "number") {
      resolved[key] = value;
      continue;
    }

    const processed = processTemplate(value, templateContext);
    const trimmed = processed.trim();
    const num = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(num)) {
      resolved[key] = num;
    } else {
      console.warn(
        `[ttrpg-ui-toolkit] Ability "${key}" template did not resolve to a number: ${JSON.stringify(processed)} (from ${JSON.stringify(value)})`
      );
      resolved[key] = 0;
    }
  }

  return {
    abilities: resolved,
    bonuses: raw.bonuses,
    proficiencies: raw.proficiencies,
    advantage: resolveAdvantageMap(raw.advantage, templateContext),
    disadvantage: resolveAdvantageMap(raw.disadvantage, templateContext),
  };
}

export function getModifiersForAbility(modifiers: GenericBonus[], ability: keyof AbilityScores): GenericBonus[] {
  return modifiers.filter((mod) => mod.target === ability);
}

export function getTotalScore(baseScore: number, ability: keyof AbilityScores, modifiers: GenericBonus[]): number {
  const abilityModifiers = getModifiersForAbility(modifiers, ability).filter(
    (mod) => !mod.modifies || mod.modifies === "score"
  );
  const modifierTotal = abilityModifiers.reduce((sum, mod) => sum + mod.value, 0);
  return baseScore + modifierTotal;
}

export function getSavingThrowBonus(ability: keyof AbilityScores, modifiers: GenericBonus[]): number {
  const savingThrowModifiers = getModifiersForAbility(modifiers, ability).filter(
    (mod) => !mod.modifies || mod.modifies === "saving_throw"
  );
  return savingThrowModifiers.reduce((sum, mod) => sum + mod.value, 0);
}
