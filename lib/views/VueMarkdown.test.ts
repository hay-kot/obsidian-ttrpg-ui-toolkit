import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, ref, nextTick, watch } from "vue";
import { VueMarkdown, isRenderPhaseError } from "./VueMarkdown";

const TestComponent = defineComponent({
  props: { message: String },
  setup(props) {
    return () => h("div", { class: "test" }, props.message);
  },
});

const AltComponent = defineComponent({
  props: { text: String },
  setup(props) {
    return () => h("span", { class: "alt" }, props.text);
  },
});

describe("VueMarkdown", () => {
  let container: HTMLElement;
  let vm: VueMarkdown;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    // Add Obsidian's empty() method to the container
    (container as any).empty = function () {
      this.innerHTML = "";
    };
    // Add Obsidian's createDiv() method to the container
    (container as any).createDiv = function (opts: { cls?: string }) {
      const el = document.createElement("div");
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
    vm = new VueMarkdown(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("mount() creates a Vue app and renders content", () => {
    vm.mount(TestComponent, { message: "Hello" });

    expect(container.querySelector(".test")).not.toBeNull();
    expect(container.textContent).toContain("Hello");
  });

  it("onunload() unmounts without error", () => {
    vm.mount(TestComponent, { message: "Hello" });
    expect(container.querySelector(".test")).not.toBeNull();

    vm.onunload();

    expect(container.textContent).toBe("");
  });

  it("mount() twice re-mounts (unmounts first app, renders second)", () => {
    vm.mount(TestComponent, { message: "First" });
    expect(container.textContent).toContain("First");

    vm.mount(AltComponent, { text: "Second" });
    expect(container.querySelector(".test")).toBeNull();
    expect(container.querySelector(".alt")).not.toBeNull();
    expect(container.textContent).toContain("Second");
  });

  it("addUnloadFn callbacks are called on unload", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    vm.addUnloadFn(fn1);
    vm.addUnloadFn(fn2);
    vm.onunload();

    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("mountReactive() renders with initial props", () => {
    const propsRef = ref<Record<string, unknown>>({ message: "Reactive" });
    vm.mountReactive(TestComponent, propsRef);

    expect(container.querySelector(".test")).not.toBeNull();
    expect(container.textContent).toContain("Reactive");
  });

  it("mountReactive() updates when ref changes", async () => {
    const propsRef = ref<Record<string, unknown>>({ message: "Before" });
    vm.mountReactive(TestComponent, propsRef);

    expect(container.textContent).toContain("Before");

    propsRef.value = { message: "After" };
    await nextTick();

    expect(container.textContent).toContain("After");
  });

  it("mount() shows an error fallback when a component throws during render", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = defineComponent({
      setup() {
        return () => {
          throw new Error("boom");
        };
      },
    });

    vm.mount(Broken, {});

    const fallback = container.querySelector(".dnd-ui-error");
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain("boom");
    errorSpy.mockRestore();
  });

  it("mount() shows an error fallback when setup() throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = defineComponent({
      setup() {
        throw new Error("setup boom");
      },
    });

    vm.mount(Broken, {});

    expect(container.querySelector(".dnd-ui-error")?.textContent).toContain("setup boom");
    errorSpy.mockRestore();
  });

  it("keeps the component mounted when an event handler throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Clicky = defineComponent({
      setup() {
        return () =>
          h(
            "button",
            {
              class: "clicky",
              onClick: () => {
                throw new Error("click boom");
              },
            },
            "Click"
          );
      },
    });

    vm.mount(Clicky, {});
    container.querySelector<HTMLButtonElement>(".clicky")!.click();

    expect(container.querySelector(".clicky")).not.toBeNull();
    expect(container.querySelector(".dnd-ui-error")).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("keeps the component mounted when a watcher callback throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const source = ref(0);
    const Watching = defineComponent({
      setup() {
        watch(source, () => {
          throw new Error("watch boom");
        });
        return () => h("div", { class: "watching" }, String(source.value));
      },
    });

    vm.mount(Watching, {});
    source.value = 1;
    await nextTick();

    expect(container.querySelector(".watching")?.textContent).toBe("1");
    expect(container.querySelector(".dnd-ui-error")).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  describe("isRenderPhaseError", () => {
    it("matches Vue development info strings for setup and render", () => {
      expect(isRenderPhaseError("setup function")).toBe(true);
      expect(isRenderPhaseError("render function")).toBe(true);
    });

    it("matches Vue production info URLs for setup (0) and render (1)", () => {
      expect(isRenderPhaseError("https://vuejs.org/error-reference/#runtime-0")).toBe(true);
      expect(isRenderPhaseError("https://vuejs.org/error-reference/#runtime-1")).toBe(true);
    });

    it("rejects handler, watcher, hook, and unknown info", () => {
      expect(isRenderPhaseError("native event handler")).toBe(false);
      expect(isRenderPhaseError("watcher callback")).toBe(false);
      expect(isRenderPhaseError("mounted hook")).toBe(false);
      expect(isRenderPhaseError("https://vuejs.org/error-reference/#runtime-5")).toBe(false);
      expect(isRenderPhaseError("https://vuejs.org/error-reference/#runtime-3")).toBe(false);
      expect(isRenderPhaseError("https://vuejs.org/error-reference/#runtime-10")).toBe(false);
      expect(isRenderPhaseError("")).toBe(false);
    });
  });

  it("mountReactive() cleans up on unload", () => {
    const propsRef = ref<Record<string, unknown>>({ message: "Test" });
    vm.mountReactive(TestComponent, propsRef);

    expect(container.querySelector(".test")).not.toBeNull();

    vm.onunload();

    expect(container.textContent).toBe("");
  });
});
