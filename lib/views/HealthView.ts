import { ref } from "vue";
import { BaseView } from "./BaseView";
import { App, MarkdownPostProcessorContext } from "obsidian";
import * as HealthService from "lib/domains/healthpoints";
import HealthCard from "lib/components/HealthCard.vue";
import { KeyValueStore } from "lib/services/kv/kv";
import { HealthState } from "lib/domains/healthpoints";
import {
  ParsedHealthBlock,
  UnresolvedHealthBlock,
  HitDice,
  RawResetConfig,
  ResetConfig,
  TempMaxHealth,
  UnresolvedHitDice,
} from "lib/types";
import { loadDocumentTextFor } from "lib/services/document-text";
import { msgbus } from "lib/services/event-bus";
import { hasTemplateVariables, processTemplate, createTemplateContext } from "lib/utils/template";
import { useFileContext, FileContext } from "./filecontext";
import { shouldResetOnEvent } from "lib/domains/events";
import { VueMarkdown } from "./VueMarkdown";

export class HealthView extends BaseView {
  public codeblock = "healthpoints";

  private kv: KeyValueStore;

  constructor(app: App, kv: KeyValueStore) {
    super(app);
    this.kv = kv;
  }

  public render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const healthMarkdown = new HealthMarkdown(el, source, this.kv, ctx.sourcePath, ctx, this);
    ctx.addChild(healthMarkdown);
  }
}

class HealthMarkdown extends VueMarkdown {
  private kv: KeyValueStore;
  private filePath: string;
  private fileContext: FileContext;
  private unresolvedBlock: UnresolvedHealthBlock;
  private currentHealthBlock: ParsedHealthBlock | null = null;
  private propsRef = ref<Record<string, unknown>>({});
  private mounted = false;
  /**
   * Resolves once the load kicked off by onload() has settled. Obsidian
   * discards onload()'s return value, so this is the only handle on that work.
   */
  ready: Promise<void> = Promise.resolve();

  constructor(
    el: HTMLElement,
    source: string,
    kv: KeyValueStore,
    filePath: string,
    ctx: MarkdownPostProcessorContext,
    baseView: BaseView
  ) {
    super(el);
    this.kv = kv;
    this.filePath = filePath;
    this.fileContext = useFileContext(baseView.app, ctx);
    this.unresolvedBlock = HealthService.parseHealthBlock(source);
  }

  onload() {
    this.setupFrontmatterChangeListener();
    // Component.onload() is typed void, so the render is kicked off here rather
    // than awaited — otherwise a rejection surfaces as an unhandled rejection.
    this.ready = this.processAndRender().catch((error: unknown) => {
      console.error("Error loading health block:", error);
    });
  }

  private async processAndRender() {
    // Resolving against a cold document cache would use default ability
    // scores, and the clamp below would then save current HP under that
    // too-low max for good.
    if (this.hasTemplateValues()) {
      await loadDocumentTextFor(this.containerEl, this.fileContext.md());
    }

    const healthBlock = this.processTemplates(this.unresolvedBlock);
    this.currentHealthBlock = healthBlock;

    const stateKey = healthBlock.state_key;
    if (!stateKey) {
      throw new Error("Health block must contain a 'state_key' property.");
    }

    const defaultState = HealthService.getDefaultHealthState(healthBlock);

    try {
      const savedState = await this.kv.get<HealthState>(stateKey);
      let healthState = savedState || defaultState;

      if (savedState) {
        healthState = this.reconcileState(savedState, healthBlock);
        if (healthState !== savedState) {
          try {
            await this.kv.set(stateKey, healthState);
          } catch (error) {
            console.error("Error saving migrated health state:", error);
          }
        }
      } else {
        try {
          await this.kv.set(stateKey, defaultState);
        } catch (error) {
          console.error("Error saving initial health state:", error);
        }
      }

      this.setupEventSubscription();
      this.renderComponent(healthBlock, healthState);
    } catch (error) {
      console.error("Error loading health state:", error);
      this.setupEventSubscription();
      this.renderComponent(healthBlock, defaultState);
    }
  }

  private reconcileState(state: HealthState, healthBlock: ParsedHealthBlock): HealthState {
    return HealthService.clampHealthState(HealthService.migrateHealthState(state, healthBlock), healthBlock);
  }

  private processTemplates(healthBlock: UnresolvedHealthBlock): ParsedHealthBlock {
    let templateContext: ReturnType<typeof createTemplateContext> | null = null;

    const resolveText = (value: string): string => {
      if (!hasTemplateVariables(value)) return value;
      templateContext ??= createTemplateContext(this.containerEl, this.fileContext);
      return processTemplate(value, templateContext);
    };

    // Resolves templates and plain numeric strings, returning undefined when the result isn't a number
    const resolveNumber = (value: number | string): number | undefined => {
      if (typeof value === "number") return value;
      const parsed = parseInt(resolveText(value), 10);
      return isNaN(parsed) ? undefined : parsed;
    };

    let health: number | string = healthBlock.health;
    if (typeof health === "string") {
      const resolved = resolveNumber(health);
      if (resolved !== undefined) {
        health = resolved;
      } else {
        console.warn(`Health value "${health}" did not resolve to a valid number, using original value`);
      }
    }

    let tempMaxHealth: TempMaxHealth | undefined;
    const rawTempMax = healthBlock.temp_max_health;
    if (rawTempMax !== undefined) {
      let hp = resolveNumber(rawTempMax.hp);
      if (hp === undefined) {
        console.warn(`Temp max health value "${rawTempMax.hp}" is not a valid number, using 0`);
        hp = 0;
      }
      tempMaxHealth = { hp, note: rawTempMax.note ? resolveText(rawTempMax.note) : undefined };
    }

    const hitdice = healthBlock.hitdice?.map((hd) => this.resolveHitDice(hd, resolveNumber));

    return {
      ...healthBlock,
      health,
      temp_max_health: tempMaxHealth,
      hitdice,
      reset_on: this.resolveResetConfigs(healthBlock.reset_on, "health", resolveNumber),
    };
  }

  private resolveHitDice(
    hd: UnresolvedHitDice,
    resolveNumber: (value: number | string) => number | undefined
  ): HitDice {
    const value = resolveNumber(hd.value);
    if (value === undefined || value <= 0) {
      console.warn(`Hitdice value "${hd.value}" for ${hd.dice} is not a valid positive number, using 1`);
    }

    return {
      dice: hd.dice,
      value: value !== undefined && value > 0 ? value : 1,
      reset_on: this.resolveResetConfigs(hd.reset_on, hd.dice, resolveNumber),
    };
  }

  private resolveResetConfigs(
    configs: RawResetConfig[] | undefined,
    label: string,
    resolveNumber: (value: number | string) => number | undefined
  ): ResetConfig[] | undefined {
    return configs?.map((config) => {
      if (config.amount === undefined) return { event: config.event };

      const amount = resolveNumber(config.amount);
      if (amount === undefined) {
        console.warn(
          `Reset amount "${config.amount}" for ${label} on ${config.event} is not a valid number and is ignored`
        );
      }

      return { event: config.event, amount: amount === undefined ? undefined : Math.max(0, amount) };
    });
  }

  private hasTemplateValues(): boolean {
    const isTemplate = (value: number | string | undefined) => typeof value === "string" && hasTemplateVariables(value);

    const tempMax = this.unresolvedBlock.temp_max_health;
    if (isTemplate(this.unresolvedBlock.health) || isTemplate(tempMax?.hp) || isTemplate(tempMax?.note)) {
      return true;
    }

    return (this.unresolvedBlock.hitdice ?? []).some(
      (hd) => isTemplate(hd.value) || hd.reset_on?.some((config) => isTemplate(config.amount))
    );
  }

  private setupFrontmatterChangeListener() {
    if (!this.hasTemplateValues()) return;

    this.addUnloadFn(this.fileContext.onFrontmatterChange(() => void this.handleFrontmatterChange()));
  }

  private setupEventSubscription() {
    this.addUnloadFn(
      msgbus.subscribe(this.filePath, "reset", (resetEvent) => {
        const healthBlock = this.currentHealthBlock;
        if (!healthBlock) return;

        const resetOn = healthBlock.reset_on;
        const affectsHitDice = (healthBlock.hitdice ?? []).some((hd) =>
          shouldResetOnEvent(hd.reset_on, resetEvent.eventType)
        );

        if (shouldResetOnEvent(resetOn, resetEvent.eventType) || affectsHitDice) {
          void this.handleResetEvent(healthBlock, resetEvent.eventType);
        }
      })
    );
  }

  private async handleFrontmatterChange() {
    if (!this.currentHealthBlock) return;

    try {
      const updatedHealthBlock = this.processTemplates(this.unresolvedBlock);

      if (JSON.stringify(this.currentHealthBlock) === JSON.stringify(updatedHealthBlock)) return;

      this.currentHealthBlock = updatedHealthBlock;

      const stateKey = updatedHealthBlock.state_key;
      if (!stateKey) return;

      try {
        const currentState = await this.kv.get<HealthState>(stateKey);
        if (!currentState) return;

        // A shrinking max — an expired temp max health effect, say — has to pull current health down with it
        const reconciled = this.reconcileState(currentState, updatedHealthBlock);
        if (reconciled !== currentState) {
          await this.kv.set(stateKey, reconciled);
        }

        this.renderComponent(updatedHealthBlock, reconciled);
      } catch (error) {
        console.error("Error loading state during frontmatter update:", error);
      }
    } catch (error) {
      console.error("Error handling frontmatter change:", error);
    }
  }

  private renderComponent(healthBlock: ParsedHealthBlock, state: HealthState) {
    const stateKey = healthBlock.state_key;
    if (!stateKey) return;

    const newProps = {
      static: healthBlock,
      state: state,
      "onUpdate:state": (newState: HealthState) => {
        void this.handleStateChange(healthBlock, newState);
        this.renderComponent(healthBlock, newState);
      },
    };

    if (!this.mounted) {
      this.propsRef.value = newProps;
      this.mountReactive(HealthCard, this.propsRef);
      this.mounted = true;
    } else {
      this.propsRef.value = newProps;
    }
  }

  private async handleStateChange(healthBlock: ParsedHealthBlock, newState: HealthState) {
    const stateKey = healthBlock.state_key;
    if (!stateKey) return;

    try {
      await this.kv.set(stateKey, newState);
    } catch (error) {
      console.error(`Error saving health state for ${stateKey}:`, error);
    }
  }

  private async handleResetEvent(healthBlock: ParsedHealthBlock, eventType: string) {
    const stateKey = healthBlock.state_key;
    if (!stateKey) return;

    try {
      const currentState =
        (await this.kv.get<HealthState>(stateKey)) ?? HealthService.getDefaultHealthState(healthBlock);
      const resetState = HealthService.computeResetState(currentState, healthBlock, eventType);

      await this.kv.set(stateKey, resetState);
      this.renderComponent(healthBlock, resetState);
    } catch (error) {
      console.error(`Error resetting health state for ${stateKey}:`, error);
    }
  }
}
