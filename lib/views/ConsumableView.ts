import { ref } from "vue";
import { BaseView } from "./BaseView";
import { App, MarkdownPostProcessorContext } from "obsidian";
import * as ConsumableService from "lib/domains/consumables";
import MultiConsumableCheckboxes from "lib/components/MultiConsumableCheckboxes.vue";
import { KeyValueStore } from "lib/services/kv/kv";
import { ConsumableState } from "lib/domains/consumables";
import { loadDocumentTextFor } from "lib/services/document-text";
import { msgbus } from "lib/services/event-bus";
import { shouldResetOnEvent, getResetAmount } from "lib/domains/events";
import { ParsedConsumableBlock } from "lib/types";
import { hasTemplateVariables, processTemplate, createTemplateContext } from "lib/utils/template";
import { useFileContext, FileContext } from "./filecontext";
import { VueMarkdown } from "./VueMarkdown";

export class ConsumableView extends BaseView {
  public codeblock = "consumable";

  private kv: KeyValueStore;

  constructor(app: App, kv: KeyValueStore) {
    super(app);
    this.kv = kv;
  }

  public render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const consumableMarkdown = new ConsumableMarkdown(el, source, this.kv, ctx.sourcePath, ctx, this);
    ctx.addChild(consumableMarkdown);
  }
}

class ConsumableMarkdown extends VueMarkdown {
  private source: string;
  private kv: KeyValueStore;
  private filePath: string;
  private fileContext: FileContext;
  private propsRef = ref<Record<string, unknown>>({});
  private mounted = false;
  /**
   * Resolves once the load kicked off by onload() has settled. Obsidian
   * discards onload()'s return value, so this is the only handle on that work.
   */
  ready: Promise<void> = Promise.resolve();
  private consumables: ParsedConsumableBlock[] = [];
  private states: Record<string, ConsumableState> = {};
  private originalUsesValues: Map<string, number | string> = new Map();

  constructor(
    el: HTMLElement,
    source: string,
    kv: KeyValueStore,
    filePath: string,
    ctx: MarkdownPostProcessorContext,
    baseView: BaseView
  ) {
    super(el);
    this.source = source;
    this.kv = kv;
    this.filePath = filePath;
    this.fileContext = useFileContext(baseView.app, ctx);
  }

  onload() {
    // Component.onload() is typed void, so the async work is kicked off here
    // rather than declared on onload — otherwise a rejection (the missing
    // state_key throw below included) surfaces as an unhandled rejection.
    this.ready = this.initialize().catch((error: unknown) => {
      console.error("Error loading consumable block:", error);
    });
  }

  private async initialize() {
    const consumablesBlock = ConsumableService.parseConsumablesBlock(this.source);
    // Wait for the note text so templated `uses` do not first render a box
    // count computed from default ability scores (see loadDocumentTextFor).
    if (consumablesBlock.items.some((item) => typeof item.uses === "string" && hasTemplateVariables(item.uses))) {
      await loadDocumentTextFor(this.containerEl, this.fileContext.md());
    }
    this.consumables = consumablesBlock.items.map((item) => this.processTemplateInConsumable(item));

    this.setupFrontmatterChangeListener();

    // Calculate label width
    let maxLabelLength = 0;
    this.consumables.forEach((item) => {
      if (item.label && item.label.length > maxLabelLength) {
        maxLabelLength = item.label.length;
      }
    });
    const labelWidthEm = Math.max(3, maxLabelLength * 0.55);
    this.containerEl.style.setProperty("--consumable-label-width", `${labelWidthEm}em`);

    // Load states for all consumables
    await Promise.all(
      this.consumables.map(async (consumableBlock, index) => {
        const stateKey = consumableBlock.state_key;
        if (!stateKey) {
          throw new Error(`Consumable item at index ${index} must contain a 'state_key' property.`);
        }

        const defaultState = ConsumableService.getDefaultConsumableState(consumableBlock);

        try {
          const savedState = await this.kv.get<ConsumableState>(stateKey);
          this.states[stateKey] = savedState || defaultState;

          if (!savedState) {
            try {
              await this.kv.set(stateKey, defaultState);
            } catch (error) {
              console.error(`Error saving initial consumable state for ${stateKey}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error loading consumable state for ${stateKey}:`, error);
          this.states[stateKey] = defaultState;
        }

        // Setup reset subscription
        if (consumableBlock.reset_on) {
          this.addUnloadFn(
            msgbus.subscribe(this.filePath, "reset", (resetEvent) => {
              if (shouldResetOnEvent(consumableBlock.reset_on, resetEvent.eventType)) {
                const resetAmount = getResetAmount(consumableBlock.reset_on, resetEvent.eventType) || resetEvent.amount;
                void this.handleResetEvent(consumableBlock, resetAmount);
              }
            })
          );
        }
      })
    );

    this.renderAll();
  }

  private processTemplateInConsumable(
    consumable: { uses: number | string } & Omit<ParsedConsumableBlock, "uses">
  ): ParsedConsumableBlock {
    const usesValue = consumable.uses;

    // Store original value for re-processing on frontmatter changes
    this.originalUsesValues.set(consumable.state_key, usesValue);

    if (typeof usesValue === "string" && hasTemplateVariables(usesValue)) {
      const templateContext = createTemplateContext(this.containerEl, this.fileContext);
      const processedUses = processTemplate(usesValue, templateContext);
      const parsedUses = parseInt(processedUses, 10);

      if (!isNaN(parsedUses) && parsedUses > 0) {
        return { ...consumable, uses: parsedUses };
      } else {
        console.warn(
          `Template processed uses value "${processedUses}" is not a valid positive number, using default of 1`
        );
        return { ...consumable, uses: 1 };
      }
    }

    // Ensure uses is a number even if not templated
    if (typeof usesValue === "string") {
      const parsed = parseInt(usesValue, 10);
      return { ...consumable, uses: isNaN(parsed) ? 1 : parsed };
    }

    return { ...consumable, uses: usesValue };
  }

  private setupFrontmatterChangeListener() {
    const hasTemplates = Array.from(this.originalUsesValues.values()).some(
      (v) => typeof v === "string" && hasTemplateVariables(v)
    );

    if (!hasTemplates) return;

    this.addUnloadFn(
      this.fileContext.onFrontmatterChange(() => {
        this.handleFrontmatterChange();
      })
    );
  }

  private handleFrontmatterChange() {
    let changed = false;

    this.consumables = this.consumables.map((consumable) => {
      const originalUses = this.originalUsesValues.get(consumable.state_key);
      if (typeof originalUses !== "string" || !hasTemplateVariables(originalUses)) {
        return consumable;
      }

      const templateContext = createTemplateContext(this.containerEl, this.fileContext);
      const processedUses = processTemplate(originalUses, templateContext);
      const parsedUses = parseInt(processedUses, 10);
      const newUses = !isNaN(parsedUses) && parsedUses > 0 ? parsedUses : 1;

      if (newUses !== consumable.uses) {
        changed = true;
        return { ...consumable, uses: newUses };
      }

      return consumable;
    });

    if (changed) {
      this.renderAll();
    }
  }

  private renderAll() {
    const newProps = {
      consumables: this.consumables,
      states: { ...this.states },
      "onUpdate:stateChange": (stateKey: string, newState: ConsumableState) => {
        this.states[stateKey] = newState;
        this.kv.set(stateKey, newState).catch((error: unknown) => {
          console.error(`Error saving consumable state for ${stateKey}:`, error);
        });
        this.renderAll();
      },
    };

    if (!this.mounted) {
      this.propsRef.value = newProps;
      this.mountReactive(MultiConsumableCheckboxes, this.propsRef);
      this.mounted = true;
    } else {
      this.propsRef.value = newProps;
    }
  }

  private async handleResetEvent(consumableBlock: ParsedConsumableBlock, amount?: number) {
    const stateKey = consumableBlock.state_key;
    if (!stateKey) return;

    try {
      const currentState = await this.kv.get<ConsumableState>(stateKey);
      const currentValue = currentState?.value || 0;

      const resetState: ConsumableState = {
        value: amount !== undefined ? Math.max(0, currentValue - amount) : 0,
      };

      await this.kv.set(stateKey, resetState);
      this.states[stateKey] = resetState;
      this.renderAll();
    } catch (error) {
      console.error(`Error resetting consumable state for ${stateKey}:`, error);
    }
  }
}
