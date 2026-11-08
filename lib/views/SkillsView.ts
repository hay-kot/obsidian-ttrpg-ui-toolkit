import { BaseView } from "./BaseView";
import { TemplateAwareComponent } from "./TemplateAwareComponent";
import SkillCards from "../components/SkillCards.vue";
import { MarkdownPostProcessorContext } from "obsidian";
import * as AbilityService from "lib/domains/abilities";
import * as SkillsService from "lib/domains/skills";
import { documentTextFor } from "lib/services/document-text";
import { AbilityBlock, AbilityScores, SkillItem } from "lib/types";
import { extractFirstCodeBlock } from "../utils/codeblock-extractor";
import { coerceBooleanTemplate } from "../utils/template";

export class SkillsView extends BaseView {
  public codeblock = "skills";

  public render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const cmp = new SkillsComponent(el, source, this.app, ctx);
    ctx.addChild(cmp);
  }
}

class SkillsComponent extends TemplateAwareComponent {
  protected alwaysRerenderOnChange = true;

  protected processAndRender() {
    const skillsBlock = SkillsService.parseSkillsBlock(this.source);

    const documentText = documentTextFor(this.containerEl, this.fileContext.md());
    const abilityBlockSrc = extractFirstCodeBlock(documentText, "ability") ?? "";

    const templateContext = this.setupTemplates([this.source, abilityBlockSrc]);

    const frontmatter = this.fileContext.frontmatter();
    let abilityBlock: AbilityBlock;
    try {
      abilityBlock = AbilityService.parseAbilityBlockFromText(documentText, frontmatter);
    } catch {
      // No ability block found; fall back to defaults
      abilityBlock = {
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
      };
    }

    const items: SkillItem[] = [];

    const skillFlag = (map: Record<string, string | boolean> | undefined, label: string): boolean => {
      if (!map) return false;
      const entry = Object.entries(map).find(([key]) => key.toLowerCase() === label.toLowerCase());
      return entry ? coerceBooleanTemplate(entry[1], templateContext) : false;
    };

    for (const skill of SkillsService.Skills) {
      const isHalfProficient = skillsBlock.half_proficiencies.some(
        (x) => x.toLowerCase() === skill.label.toLowerCase()
      );
      const isProficient = skillsBlock.proficiencies.some((x) => x.toLowerCase() === skill.label.toLowerCase());
      const isExpert = skillsBlock.expertise.some((x) => x.toLowerCase() === skill.label.toLowerCase());

      const skillAbility = abilityBlock.abilities[skill.ability as keyof AbilityBlock["abilities"]];
      if (skillAbility === undefined) {
        throw new Error(`Skill ${skill.ability} not found in Skills list`);
      }

      const totalAbilityScore = AbilityService.getTotalScore(
        skillAbility,
        skill.ability as keyof AbilityScores,
        abilityBlock.bonuses
      );
      let skillCheckValue = AbilityService.calculateModifier(totalAbilityScore);
      if (isExpert) skillCheckValue += frontmatter.proficiency_bonus * 2;
      else if (isProficient) skillCheckValue += frontmatter.proficiency_bonus;
      else if (isHalfProficient) skillCheckValue += Math.floor(frontmatter.proficiency_bonus / 2);

      for (const bonus of skillsBlock.bonuses) {
        if (String(bonus.target).toLowerCase() === skill.label.toLowerCase()) {
          skillCheckValue += bonus.value;
        }
      }

      const abbreviation = skill.ability.substring(0, 3).toUpperCase();

      const advantage = skillFlag(skillsBlock.advantage, skill.label);
      const disadvantage = skillFlag(skillsBlock.disadvantage, skill.label);

      items.push({
        label: skill.label,
        ability: abbreviation,
        modifier: skillCheckValue,
        isProficient,
        isExpert,
        isHalfProficient,
        hasAdvantage: advantage && !disadvantage,
        hasDisadvantage: disadvantage && !advantage,
      });
    }

    this.mount(SkillCards, { items });
  }
}
