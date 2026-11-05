import { BaseView } from "./BaseView";
import { VueMarkdown } from "./VueMarkdown";
import SpellComponents from "../components/SpellComponents.vue";
import { MarkdownPostProcessorContext, TFile } from "obsidian";
import { AbilityScores, Frontmatter, SpellComponentsBlock } from "lib/types";
import { parseYamlObject } from "lib/utils/yaml";
import { useFileContext } from "./filecontext";
import * as AbilityService from "lib/domains/abilities";
import * as Fm from "lib/domains/frontmatter";
import { loadDocumentTextFor } from "lib/services/document-text";
import { extractFirstCodeBlock } from "lib/utils/codeblock-extractor";

const VALID_ABILITIES: Record<string, true> = {
  strength: true,
  dexterity: true,
  constitution: true,
  intelligence: true,
  wisdom: true,
  charisma: true,
};

export class SpellComponentsView extends BaseView {
  public codeblock = "spell-components";

  public override register(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    this.renderAsync(source, el, ctx).catch((e) => {
      console.error("Error rendering spell components", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      const errorDiv = el.createDiv({ cls: "notice" });
      errorDiv.textContent = `Error parsing spell components: ${errorMessage}`;
    });
  }

  public render(_source: string, _el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    // Not used — renderAsync handles everything
  }

  private async renderAsync(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const parsed = parseYamlObject<SpellComponentsBlock & { castingTime: string }>(source) ?? {};
    const data: SpellComponentsBlock = {
      casting_time: parsed.casting_time || parsed.castingTime,
      range: parsed.range,
      components: parsed.components,
      duration: parsed.duration,
      save: parsed.save,
      attack: parsed.attack,
    };

    if (data.save || data.attack) {
      await this.computeSpellStats(data, el, ctx);
    }

    const child = new VueMarkdown(el);
    child.mount(SpellComponents, { data });
    ctx.addChild(child);
  }

  private async computeSpellStats(
    data: SpellComponentsBlock,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    const fc = useFileContext(this.app, ctx);
    const localFm = fc.frontmatter();

    // Resolve character file if specified, otherwise use current file
    const characterFile = localFm.character_file;
    let frontmatter: Frontmatter;
    let abilityBlockContent: string | null = null;

    if (characterFile) {
      const resolved = this.resolveFile(characterFile, ctx.sourcePath);
      if (!resolved) return;

      const remoteFm = this.app.metadataCache.getCache(resolved.path)?.frontmatter;
      frontmatter = Fm.anyIntoFrontMatter(remoteFm || {});

      const content = await this.app.vault.cachedRead(resolved);
      abilityBlockContent = extractFirstCodeBlock(content, "ability");
    } else {
      frontmatter = localFm;
    }

    const abilityName = frontmatter.spellcasting_ability?.toLowerCase();
    if (!abilityName || !(abilityName in VALID_ABILITIES)) return;

    if (!characterFile) {
      const content = await loadDocumentTextFor(el, ctx);
      abilityBlockContent = extractFirstCodeBlock(content, "ability");
    }
    if (!abilityBlockContent) return;

    try {
      const raw = AbilityService.parseAbilityBlock(abilityBlockContent);
      const abilityBlock = AbilityService.resolveAbilityBlock(raw, frontmatter);

      const baseScore = abilityBlock.abilities[abilityName as keyof AbilityScores];
      const totalScore = AbilityService.getTotalScore(
        baseScore,
        abilityName as keyof AbilityScores,
        abilityBlock.bonuses
      );
      const modifier = AbilityService.calculateModifier(totalScore);
      const profBonus = frontmatter.proficiency_bonus;

      // D&D 5e spell save DC = 8 + proficiency bonus + spellcasting modifier
      if (data.save) {
        data.save_dc = 8 + profBonus + modifier;
      }
      if (data.attack) {
        data.attack_bonus = profBonus + modifier;
      }
    } catch {
      // Malformed ability block; skip DC/attack calculation
    }
  }

  private resolveFile(name: string, sourcePath: string): TFile | null {
    // Strip wiki-link brackets if present (e.g., "[[Din Thornewood]]" -> "Din Thornewood")
    const cleanName = name.replace(/^\[\[|\]\]$/g, "");
    return this.app.metadataCache.getFirstLinkpathDest(cleanName, sourcePath);
  }
}
