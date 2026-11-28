import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Initiative from "./Initiative.vue";
import { getDefaultInitiativeState } from "lib/domains/initiative";
import type { InitiativeBlock } from "lib/types";

const block: InitiativeBlock = {
  state_key: "test",
  items: [
    { name: "Goblin", ac: 12, hp: 7 },
    { name: "Orc", ac: 13, hp: 30 },
    { name: "Goblin", ac: 12, hp: 9 },
  ],
};

function mountTracker() {
  return mount(Initiative, { props: { static: block, state: getDefaultInitiativeState(block) } });
}

describe("Initiative duplicate names", () => {
  it("renders each duplicate-named item with its own HP", () => {
    const wrapper = mountTracker();

    const hpValues = wrapper.findAll(".dnd-ui-initiative-hp-value").map((el) => el.text());

    expect(hpValues).toEqual(["7", "30", "9"]);
  });

  it("stores initiative for the second duplicate under its own key", async () => {
    const wrapper = mountTracker();

    const inputs = wrapper.findAll(".dnd-ui-initiative-input");
    await inputs[2].setValue("18");

    const emitted = wrapper.emitted("update:state");
    expect(emitted).toBeTruthy();
    const state = (emitted as unknown as { initiatives: Record<string, number> }[][])[0][0];
    expect(state.initiatives).toEqual({ Goblin: 0, Orc: 0, Goblin_1: 18 });
  });

  it("applies damage only to the duplicate that was clicked", async () => {
    const wrapper = mountTracker();

    const damageButtons = wrapper.findAll(".dnd-ui-initiative-damage");
    await damageButtons[2].trigger("click");

    const emitted = wrapper.emitted("update:state");
    expect(emitted).toBeTruthy();
    const state = (emitted as unknown as { hp: Record<string, Record<string, number>> }[][])[0][0];
    expect(state.hp["Goblin"]["main"]).toBe(7);
    expect(state.hp["Goblin_1"]["main"]).toBe(8);
  });
});
