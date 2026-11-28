<script setup lang="ts">
import { ref, computed } from "vue";
import type { InitiativeBlock, InitiativeItem, InitiativeConsumable, ParsedConsumableBlock } from "lib/types";
import { getSortedInitiativeItems, getMaxHp, itemHashKey, InitiativeState } from "lib/domains/initiative";
import MultiConsumableCheckboxes from "lib/components/MultiConsumableCheckboxes.vue";
import type { ConsumableState } from "lib/domains/consumables";

const props = defineProps<{
  static: InitiativeBlock;
  state: InitiativeState;
}>();

const emit = defineEmits<{
  "update:state": [newState: InitiativeState];
}>();

const inputValues = ref<Record<string, string>>({});

function getItemKey(item: InitiativeItem): string {
  const index = props.static.items.indexOf(item);
  return itemHashKey(item, index, props.static.items);
}

function getInputValue(key: string): string {
  return inputValues.value[key] ?? "1";
}

function setInputValue(key: string, value: string) {
  inputValues.value = { ...inputValues.value, [key]: value };
}

function resetInputValue(key: string) {
  const updated = { ...inputValues.value };
  delete updated[key];
  inputValues.value = updated;
}

const sortedItems = computed(() => getSortedInitiativeItems(props.static.items, props.state.initiatives));

function adaptInitiativeConsumable(consumable: InitiativeConsumable): ParsedConsumableBlock {
  return {
    label: consumable.label,
    state_key: consumable.state_key,
    uses: consumable.uses,
    reset_on: consumable.reset_on_round ? [{ event: "round", amount: undefined }] : undefined,
  };
}

function handleSetInitiative(item: InitiativeItem, value: string) {
  const itemHash = getItemKey(item);
  const initiativeValue = parseInt(value) || 0;
  const newInitiatives = { ...props.state.initiatives };

  newInitiatives[itemHash] = initiativeValue;
  emit("update:state", {
    ...props.state,
    initiatives: newInitiatives,
  });
}

function handleDamage(item: InitiativeItem, monsterKey: string, value: string, type: "damage" | "heal" = "damage") {
  const parsedValue = parseInt(value) || 0;
  if (parsedValue <= 0) return;

  const itemHash = getItemKey(item);

  const newHp = { ...props.state.hp };
  if (!newHp[itemHash]) {
    newHp[itemHash] = {};
  }

  const currentHp = newHp[itemHash][monsterKey] || 0;

  let applyValue = 0;
  if (type === "damage") {
    applyValue = Math.max(0, currentHp - parsedValue);
  } else {
    const maxHp = getMaxHp(item, monsterKey);
    applyValue = Math.min(maxHp, currentHp + parsedValue);
  }

  newHp[itemHash] = {
    ...newHp[itemHash],
    [monsterKey]: applyValue,
  };

  emit("update:state", { ...props.state, hp: newHp });
}

function handleNext() {
  if (sortedItems.value.length === 0) return;

  const currentActiveIndex = props.state.activeIndex;
  let nextActiveIndex = -1;
  let newRound = props.state.round;
  const newConsumables = { ...(props.state.consumables || {}) };

  const currentActiveItemIndex = sortedItems.value.findIndex((item) => item.index === currentActiveIndex);

  if (currentActiveItemIndex === -1 || currentActiveItemIndex === sortedItems.value.length - 1) {
    nextActiveIndex = sortedItems.value[0].index;
    if (currentActiveItemIndex !== -1) {
      newRound = props.state.round + 1;

      if (props.static.consumables) {
        props.static.consumables.forEach((consumable) => {
          if (consumable.reset_on_round) {
            newConsumables[consumable.state_key] = 0;
          }
        });
      }
    }
  } else {
    nextActiveIndex = sortedItems.value[currentActiveItemIndex + 1].index;
  }

  emit("update:state", {
    ...props.state,
    activeIndex: nextActiveIndex,
    round: newRound,
    consumables: newConsumables,
  });
}

function handlePrev() {
  if (sortedItems.value.length === 0) return;

  const currentActiveIndex = props.state.activeIndex;
  let prevActiveIndex = -1;
  let newRound = props.state.round;

  const currentActiveItemIndex = sortedItems.value.findIndex((item) => item.index === currentActiveIndex);

  if (currentActiveItemIndex === -1 || currentActiveItemIndex === 0) {
    prevActiveIndex = sortedItems.value[sortedItems.value.length - 1].index;
    if (currentActiveItemIndex !== -1 && props.state.round > 1) {
      newRound = props.state.round - 1;
    }
  } else {
    prevActiveIndex = sortedItems.value[currentActiveItemIndex - 1].index;
  }

  emit("update:state", {
    ...props.state,
    activeIndex: prevActiveIndex,
    round: newRound,
  });
}

function handleReset() {
  const newInitiatives = { ...props.state.initiatives };
  const newHp: Record<string, Record<string, number>> = {};
  const newConsumables: Record<string, number> = {};

  props.static.items.forEach((item) => {
    const indexStr = getItemKey(item);
    newInitiatives[indexStr] = 0;
    newHp[indexStr] = {};

    if (typeof item.hp === "number") {
      newHp[indexStr]["main"] = item.hp;
    } else if (item.hp && typeof item.hp === "object") {
      Object.entries(item.hp).forEach(([key, value]) => {
        newHp[indexStr][key] = value as number;
      });
    }
  });

  if (props.static.consumables) {
    props.static.consumables.forEach((consumable) => {
      newConsumables[consumable.state_key] = 0;
    });
  }

  emit("update:state", {
    ...props.state,
    activeIndex: -1,
    initiatives: newInitiatives,
    hp: newHp,
    round: 1,
    consumables: newConsumables,
  });
}

function handleConsumableStateChange(stateKey: string, newState: ConsumableState) {
  const newConsumables = { ...(props.state.consumables || {}) };
  newConsumables[stateKey] = newState.value;

  emit("update:state", {
    ...props.state,
    consumables: newConsumables,
  });
}

function getMonsterStatusClass(currentHp: number, maxHp: number): string {
  const healthPercent = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
  if (currentHp <= 0) return "dnd-ui-monster-status-dead";
  if (healthPercent <= 33) return "dnd-ui-monster-status-injured";
  if (healthPercent >= 90) return "dnd-ui-monster-status-healthy";
  return "";
}

function getSingleMonsterStatusClass(item: InitiativeItem): string {
  const hashKey = getItemKey(item);
  const itemHp = props.state.hp[hashKey] || {};
  const monsterKey = Object.keys(itemHp)[0] || "main";
  const maxHp = getMaxHp(item);
  const currentHp = itemHp[monsterKey] || 0;
  const healthPercent = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
  if (currentHp <= 0) return "dnd-ui-monster-status-dead";
  if (healthPercent <= 33) return "dnd-ui-monster-status-injured";
  return "";
}

function consumableStates(): Record<string, ConsumableState> {
  if (!props.static.consumables) return {};
  return Object.fromEntries(
    props.static.consumables.map((consumable) => [
      consumable.state_key,
      { value: props.state.consumables?.[consumable.state_key] || 0 },
    ])
  );
}
</script>

<template>
  <div class="dnd-ui-initiative-tracker">
    <div class="dnd-ui-initiative-tracker-controls">
      <div class="dnd-ui-initiative-round-counter">
        Round: <span class="dnd-ui-initiative-round-value">{{ props.state.round }}</span>
      </div>
      <button
        class="dnd-ui-initiative-control-button dnd-ui-initiative-prev"
        aria-label="Previous combatant"
        @click="handlePrev"
      >
        &#x25C0; Prev
      </button>
      <button
        class="dnd-ui-initiative-control-button dnd-ui-initiative-next"
        aria-label="Next combatant"
        @click="handleNext"
      >
        Next &#x25B6;
      </button>
      <button
        class="dnd-ui-initiative-control-button dnd-ui-initiative-reset"
        aria-label="Reset initiative"
        @click="handleReset"
      >
        Reset
      </button>
    </div>

    <!-- Consumables Section -->
    <MultiConsumableCheckboxes
      v-if="props.static.consumables && props.static.consumables.length > 0"
      :consumables="props.static.consumables.map(adaptInitiativeConsumable)"
      :states="consumableStates()"
      @update:state-change="handleConsumableStateChange"
    />

    <div class="dnd-ui-initiative-list">
      <div v-if="sortedItems.length === 0" class="dnd-ui-initiative-empty-state">No combatants added</div>
      <div v-else class="dnd-ui-initiative-items">
        <div
          v-for="{ item, index, initiative } in sortedItems"
          :key="index"
          :class="[
            'dnd-ui-initiative-item',
            index === props.state.activeIndex ? 'dnd-ui-initiative-item-active' : '',
            item.hp !== undefined && typeof item.hp === 'object' && Object.keys(item.hp).length > 1
              ? 'dnd-ui-initiative-item-group'
              : '',
          ]"
        >
          <div class="dnd-ui-initiative-item-main">
            <div class="dnd-ui-initiative-roll">
              <input
                type="number"
                :value="initiative || ''"
                class="dnd-ui-initiative-input"
                placeholder="0"
                @change="handleSetInitiative(props.static.items[index], ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div>
              <div class="dnd-ui-initiative-name">
                <a v-if="item.link" :href="item.link" class="dnd-ui-initiative-link">{{ item.name }}</a>
                <template v-else>{{ item.name }}</template>
              </div>
              <div class="dnd-ui-initiative-ac">
                AC: <span class="dnd-ui-initiative-ac-value">{{ item.ac }}</span>
              </div>
            </div>

            <!-- Single monster HP inline -->
            <template v-if="item.hp !== undefined && !(typeof item.hp === 'object' && Object.keys(item.hp).length > 1)">
              <div :class="['dnd-ui-initiative-hp-inline', getSingleMonsterStatusClass(item)]">
                <div class="dnd-ui-initiative-hp-display">
                  <span class="dnd-ui-initiative-hp-value">{{
                    props.state.hp[getItemKey(item)]?.[
                      Object.keys(props.state.hp[getItemKey(item)] || {})[0] || "main"
                    ] || 0
                  }}</span>
                  <span class="dnd-ui-initiative-hp-separator">/</span>
                  <span class="dnd-ui-initiative-hp-max">{{ getMaxHp(item) }}</span>
                </div>
                <div class="dnd-ui-initiative-hp-controls">
                  <input
                    type="number"
                    class="dnd-ui-initiative-hp-input"
                    placeholder="0"
                    :value="getInputValue(getItemKey(item))"
                    @input="setInputValue(getItemKey(item), ($event.target as HTMLInputElement).value)"
                  />
                  <button
                    class="dnd-ui-initiative-hp-button dnd-ui-initiative-damage"
                    title="Damage"
                    @click="
                      handleDamage(
                        props.static.items[index],
                        Object.keys(props.state.hp[getItemKey(item)] || {})[0] || 'main',
                        getInputValue(getItemKey(item))
                      );
                      resetInputValue(getItemKey(item));
                    "
                  >
                    &#x2212;
                  </button>
                  <button
                    class="dnd-ui-initiative-hp-button dnd-ui-initiative-heal"
                    title="Heal"
                    @click="
                      handleDamage(
                        props.static.items[index],
                        Object.keys(props.state.hp[getItemKey(item)] || {})[0] || 'main',
                        getInputValue(getItemKey(item)),
                        'heal'
                      );
                      resetInputValue(getItemKey(item));
                    "
                  >
                    +
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- Group monster HP -->
          <template v-if="item.hp !== undefined && typeof item.hp === 'object' && Object.keys(item.hp).length > 1">
            <div class="dnd-ui-divider"></div>
            <div class="dnd-ui-initiative-group-container">
              <div class="dnd-ui-initiative-group-hp">
                <div
                  v-for="[key, maxHp] in Object.entries(item.hp as Record<string, number>)"
                  :key="`${index}-${key}`"
                  class="dnd-ui-initiative-monster"
                >
                  <div class="dnd-ui-initiative-monster-header">
                    <span
                      :class="[
                        'dnd-ui-initiative-monster-name',
                        getMonsterStatusClass(props.state.hp[getItemKey(item)]?.[key] || 0, maxHp),
                      ]"
                      >{{ key }}</span
                    >
                    <span class="dnd-ui-initiative-monster-hp">
                      <span class="dnd-ui-initiative-hp-value">{{ props.state.hp[getItemKey(item)]?.[key] || 0 }}</span>
                      <span class="dnd-ui-initiative-hp-separator">/</span>
                      <span class="dnd-ui-initiative-hp-max">{{ maxHp }}</span>
                    </span>
                  </div>
                  <div class="dnd-ui-initiative-monster-actions">
                    <input
                      type="number"
                      class="dnd-ui-initiative-hp-input"
                      placeholder="0"
                      :value="getInputValue(`${getItemKey(item)}-${key}`)"
                      @input="setInputValue(`${getItemKey(item)}-${key}`, ($event.target as HTMLInputElement).value)"
                    />
                    <button
                      class="dnd-ui-initiative-hp-button dnd-ui-initiative-damage"
                      title="Damage"
                      @click="
                        handleDamage(props.static.items[index], key, getInputValue(`${getItemKey(item)}-${key}`));
                        resetInputValue(`${getItemKey(item)}-${key}`);
                      "
                    >
                      &#x2212;
                    </button>
                    <button
                      class="dnd-ui-initiative-hp-button dnd-ui-initiative-heal"
                      title="Heal"
                      @click="
                        handleDamage(
                          props.static.items[index],
                          key,
                          getInputValue(`${getItemKey(item)}-${key}`),
                          'heal'
                        );
                        resetInputValue(`${getItemKey(item)}-${key}`);
                      "
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
