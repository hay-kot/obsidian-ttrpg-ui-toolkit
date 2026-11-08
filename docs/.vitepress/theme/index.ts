import DefaultTheme from "vitepress/theme";
import "./custom.css";
import CustomLayout from "./CustomLayout.vue";
import AbilityCardsDemo from "./demos/AbilityCardsDemo.vue";
import AdvantageDemo from "./demos/AdvantageDemo.vue";
import BadgesDemo from "./demos/BadgesDemo.vue";
import ConsumablesDemo from "./demos/ConsumablesDemo.vue";
import DaggerHeartAbilityDemo from "./demos/DaggerHeartAbilityDemo.vue";
import DaggerHeartSkillDemo from "./demos/DaggerHeartSkillDemo.vue";
import HealthCardDemo from "./demos/HealthCardDemo.vue";
import HealthCardTempMaxDemo from "./demos/HealthCardTempMaxDemo.vue";
import InitiativeDemo from "./demos/InitiativeDemo.vue";
import SkillCardsDemo from "./demos/SkillCardsDemo.vue";
import SpellComponentsDemo from "./demos/SpellComponentsDemo.vue";
import StatCardsDemo from "./demos/StatCardsDemo.vue";
import CharacterGenerator from "./demos/generator/CharacterGenerator.vue";

export default {
  extends: DefaultTheme,
  Layout: CustomLayout,
  enhanceApp({ app }) {
    app.component("AbilityCardsDemo", AbilityCardsDemo);
    app.component("AdvantageDemo", AdvantageDemo);
    app.component("BadgesDemo", BadgesDemo);
    app.component("ConsumablesDemo", ConsumablesDemo);
    app.component("DaggerHeartAbilityDemo", DaggerHeartAbilityDemo);
    app.component("DaggerHeartSkillDemo", DaggerHeartSkillDemo);
    app.component("HealthCardDemo", HealthCardDemo);
    app.component("HealthCardTempMaxDemo", HealthCardTempMaxDemo);
    app.component("InitiativeDemo", InitiativeDemo);
    app.component("SkillCardsDemo", SkillCardsDemo);
    app.component("SpellComponentsDemo", SpellComponentsDemo);
    app.component("StatCardsDemo", StatCardsDemo);
    app.component("CharacterGenerator", CharacterGenerator);
  },
};
