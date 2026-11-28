import { MarkdownRenderChild } from "obsidian";
import { createApp, Component, App as VueApp, defineComponent, h, Ref } from "vue";

type Fn = () => void;

// Vue passes `info` to app.config.errorHandler as a readable string in development
// builds ("render function") and as a docs URL ending in the numeric error code in
// production builds (".../#runtime-1"). Code 0 is setup(), code 1 is the render function.
const RENDER_PHASE_INFO = new Set(["setup function", "render function"]);
const RENDER_PHASE_CODES = new Set(["0", "1"]);
const PROD_INFO_PREFIX = "https://vuejs.org/error-reference/#runtime-";

/**
 * True when a Vue error came from setup() or the render function, meaning the component
 * could not produce output. Errors from event handlers, watchers, and lifecycle hooks
 * return false: the component is still on screen and working, so they are only logged.
 */
export function isRenderPhaseError(info: string): boolean {
  if (info.startsWith(PROD_INFO_PREFIX)) {
    return RENDER_PHASE_CODES.has(info.slice(PROD_INFO_PREFIX.length));
  }
  return RENDER_PHASE_INFO.has(info);
}

export class VueMarkdown extends MarkdownRenderChild {
  private app: VueApp | null = null;
  private callOnUnload: Fn[] = [];

  public addUnloadFn(fn: Fn) {
    this.callOnUnload.push(fn);
  }

  private configureErrorHandler(app: VueApp) {
    app.config.errorHandler = (err, _instance, info) => {
      console.error("[ttrpg-ui-toolkit] Vue error:", err, info);
      if (isRenderPhaseError(info)) {
        this.showErrorFallback(err);
      }
    };
  }

  private showErrorFallback(err: unknown) {
    try {
      this.app?.unmount();
    } catch {
      // Ignore unmount errors during error recovery
    }
    this.app = null;
    this.containerEl.empty();
    const errorDiv = this.containerEl.createDiv({ cls: "dnd-ui-error" });
    errorDiv.textContent = `Render error: ${err instanceof Error ? err.message : String(err)}`;
  }

  public mount(component: Component, props: Record<string, unknown>) {
    if (this.app) {
      this.app.unmount();
      this.containerEl.empty();
    }
    this.app = createApp(component, props);
    this.configureErrorHandler(this.app);
    this.app.mount(this.containerEl);
  }

  public mountReactive(component: Component, propsRef: Ref<Record<string, unknown>>) {
    if (this.app) {
      this.app.unmount();
      this.containerEl.empty();
    }
    const Wrapper = defineComponent({
      setup() {
        return () => h(component, propsRef.value);
      },
    });
    this.app = createApp(Wrapper);
    this.configureErrorHandler(this.app);
    this.app.mount(this.containerEl);
  }

  onunload() {
    if (this.app) {
      try {
        this.app.unmount();
      } catch (e) {
        console.error("Error unmounting Vue component:", e);
      }
      this.app = null;
    }

    for (const fn of this.callOnUnload) {
      try {
        fn();
      } catch (e) {
        console.error("Error calling onUnload function:", e);
      }
    }
  }
}
