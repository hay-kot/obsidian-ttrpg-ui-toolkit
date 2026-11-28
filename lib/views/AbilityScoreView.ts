import { BaseView } from "./BaseView";
import { TemplateAwareComponent } from "./TemplateAwareComponent";
import AbilityCards from "../components/AbilityCards.vue";
import { MarkdownPostProcessorContext } from "obsidian";
import * as AbilityService from "lib/domains/abilities";
import { msgbus } from "lib/services/event-bus";

export class AbilityScoreView extends BaseView {
  public codeblock = "ability";

  public render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const cmp = new AbilityScoreComponent(el, source, this.app, ctx);
    ctx.addChild(cmp);
  }
}

class AbilityScoreComponent extends TemplateAwareComponent {
  protected listenToAbilitiesChange = false;
  private previousTotalScores: Record<string, number> | null = null;

  protected processAndRender() {
    const raw = AbilityService.parseAbilityBlock(this.source);
    this.setupTemplates([this.source]);
    const frontmatter = this.fileContext.frontmatter();
    const abilityBlock = AbilityService.resolveAbilityBlock(raw, frontmatter);

    const currentTotalScores: Record<string, number> = {};

    const abilities = Object.entries(abilityBlock.abilities).map(([key, value]) => {
      const isProficient = abilityBlock.proficiencies.includes(key);
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const totalScore = AbilityService.getTotalScore(
        value,
        key as keyof typeof abilityBlock.abilities,
        abilityBlock.bonuses
      );

      currentTotalScores[key] = totalScore;

      let savingThrowValue = AbilityService.calculateModifier(totalScore);
      if (isProficient) savingThrowValue += frontmatter.proficiency_bonus;
      savingThrowValue += AbilityService.getSavingThrowBonus(
        key as keyof typeof abilityBlock.abilities,
        abilityBlock.bonuses
      );

      const abbreviation = label.substring(0, 3).toUpperCase();

      const abilityKey = key as keyof typeof abilityBlock.abilities;
      const advantage = abilityBlock.advantage?.[abilityKey] ?? false;
      const disadvantage = abilityBlock.disadvantage?.[abilityKey] ?? false;

      return {
        label: abbreviation,
        total: totalScore,
        modifier: AbilityService.formatModifier(AbilityService.calculateModifier(totalScore)),
        isProficient,
        savingThrow: AbilityService.formatModifier(savingThrowValue),
        hasAdvantage: advantage && !disadvantage,
        hasDisadvantage: disadvantage && !advantage,
      };
    });

    // Contract: every current `abilities:changed` subscriber (TemplateAwareComponent via
    // fileContext.onAbilitiesChange) re-renders from createTemplateContext(), which reads only the
    // six total scores. Publish only when those totals differ, to avoid redundant re-renders.
    // If a subscriber starts reading anything else (proficiencies, bonuses, saving throws),
    // widen this comparison accordingly.
    const previous = this.previousTotalScores;
    const keys = Object.keys(currentTotalScores);
    const scoresChanged =
      !previous ||
      keys.length !== Object.keys(previous).length ||
      keys.some((key) => currentTotalScores[key] !== previous[key]);

    if (scoresChanged) {
      this.previousTotalScores = currentTotalScores;
      msgbus.publish(this.fileContext.filepath, "abilities:changed", undefined);
    }

    this.mount(AbilityCards, { abilities });
  }
}
