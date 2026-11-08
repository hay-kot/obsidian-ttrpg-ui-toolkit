import { App, MarkdownPostProcessorContext } from "obsidian";
import { parseYamlObject } from "../utils/yaml";
import { VueMarkdown } from "./VueMarkdown";
import { FileContext, useFileContext } from "./filecontext";
import { hasTemplateVariables, createTemplateContext, TemplateContext } from "../utils/template";

/**
 * Base class for view components that support Handlebars-style template variables
 * in their YAML source. Handles YAML parsing, template detection, context creation,
 * and re-rendering on frontmatter/ability changes.
 *
 * Subclasses implement `processAndRender()` to define their specific YAML-to-props
 * mapping and Vue component mounting.
 */
export abstract class TemplateAwareComponent extends VueMarkdown {
  protected fileContext: FileContext;
  protected source: string;
  protected isTemplate = false;
  /**
   * Set to false in components that themselves publish `abilities:changed`,
   * so they don't subscribe to their own event and recurse on re-render.
   */
  protected listenToAbilitiesChange = true;
  /**
   * Set to true in components whose output depends on the frontmatter or the
   * ability block even when their own YAML has no templates, so they re-render
   * on change events too.
   */
  protected alwaysRerenderOnChange = false;

  constructor(el: HTMLElement, source: string, app: App, ctx: MarkdownPostProcessorContext) {
    super(el);
    this.source = source;
    this.fileContext = useFileContext(app, ctx);
  }

  onload() {
    this.processAndRender();
    this.setupListeners();
  }

  protected abstract processAndRender(): void;

  protected parseSource<T>(): Partial<T> {
    return parseYamlObject<T>(this.source) ?? {};
  }

  /**
   * Inspects an array of source strings for template variables. If any are found,
   * marks this component as template-aware (so frontmatter/ability change events
   * trigger re-renders) and returns a TemplateContext for use by the subclass.
   * Returns null when no templates are present, signaling a static-only render.
   */
  protected setupTemplates(sources: string[]): TemplateContext | null {
    const hasTemplates = sources.some((v) => hasTemplateVariables(v));
    if (!hasTemplates) return null;

    this.isTemplate = true;
    return createTemplateContext(this.containerEl, this.fileContext);
  }

  private setupListeners() {
    this.addUnloadFn(
      this.fileContext.onFrontmatterChange(() => {
        if (!this.isTemplate && !this.alwaysRerenderOnChange) return;
        this.processAndRender();
      })
    );

    if (this.listenToAbilitiesChange) {
      this.addUnloadFn(
        this.fileContext.onAbilitiesChange(() => {
          if (!this.isTemplate && !this.alwaysRerenderOnChange) return;
          this.processAndRender();
        })
      );
    }
  }
}
