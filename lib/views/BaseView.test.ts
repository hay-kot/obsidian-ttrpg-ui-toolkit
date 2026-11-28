import { describe, it, expect } from "vitest";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { BaseView } from "./BaseView";

class CaptureView extends BaseView {
  public codeblock = "capture";
  public received: string | null = null;

  render(source: string): void {
    this.received = source;
  }
}

function makeEl(): HTMLElement {
  const div = { createDiv: () => div, appendChild: () => div };
  return { createDiv: () => div } as unknown as HTMLElement;
}

describe("BaseView.register", () => {
  it("should pass tab-normalized source to render", () => {
    const view = new CaptureView({} as App);
    view.register("a:\n\tb: 1", makeEl(), {} as MarkdownPostProcessorContext);
    expect(view.received).toBe("a:\n  b: 1");
  });
});
