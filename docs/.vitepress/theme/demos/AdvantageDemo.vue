<script setup lang="ts">
import AbilityCards from "lib/components/AbilityCards.vue";
import SkillCards from "lib/components/SkillCards.vue";
import type { SkillItem } from "lib/types";

defineProps<{ block: "ability" | "skills" }>();

const abilities = [
  { label: "STR", total: 15, modifier: "+2", isProficient: false, savingThrow: "+2", hasAdvantage: true },
  { label: "DEX", total: 14, modifier: "+2", isProficient: false, savingThrow: "+2", hasAdvantage: true },
  { label: "CON", total: 13, modifier: "+1", isProficient: false, savingThrow: "+1" },
  { label: "INT", total: 12, modifier: "+1", isProficient: false, savingThrow: "+1" },
  { label: "WIS", total: 10, modifier: "+0", isProficient: false, savingThrow: "+0", hasDisadvantage: true },
  { label: "CHA", total: 8, modifier: "-1", isProficient: false, savingThrow: "-1" },
];

const skills: SkillItem[] = [
  { ability: "STR", label: "Athletics", modifier: 0, hasDisadvantage: true },
  { ability: "INT", label: "Investigation", modifier: 1 },
  { ability: "WIS", label: "Perception", modifier: 3, isProficient: true, hasAdvantage: true },
  { ability: "DEX", label: "Stealth", modifier: 5, isProficient: true, hasAdvantage: true },
];
</script>

<template>
  <div class="dnd-ui-demo">
    <AbilityCards v-if="block === 'ability'" :abilities="abilities" />
    <SkillCards v-else :items="skills" />
  </div>
</template>
