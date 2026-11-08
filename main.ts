import "lib/styles/index.css";
import { App, Platform, Plugin, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import { AbilityScoreView } from "lib/views/AbilityScoreView";
import { BaseView } from "lib/views/BaseView";
import { SkillsView } from "lib/views/SkillsView";
import { HealthView } from "lib/views/HealthView";
import { ConsumableView } from "lib/views/ConsumableView";
import { BadgesView, StatsView } from "lib/views/BadgesView";
import { InitiativeView } from "lib/views/InitiativeView";
import { SpellComponentsView } from "lib/views/SpellComponentsView";
import { EventButtonsView } from "lib/views/EventButtonsView";
import { RawAbilityView } from "lib/views/RawAbilityView";
import { RawSkillsView } from "lib/views/RawSkillsView";
import { KeyValueStore } from "lib/services/kv/kv";
import { readLegacySettings, resolveDefaultStatePath } from "lib/services/legacy";
import { JsonDataStore } from "./lib/services/kv/local-file-store";
import { DEFAULT_SETTINGS, TtrpgUIToolkitSettings } from "settings";
import { THEMES } from "lib/themes";
import { documentText, publishFrontmatterChange } from "lib/services/document-text";

export default class TtrpgUIToolkitPlugin extends Plugin {
  settings: TtrpgUIToolkitSettings;
  dataStore: JsonDataStore;

  private colorCssVars(): [string, string][] {
    return Object.entries(this.settings)
      .filter(([key]) => key.startsWith("color"))
      .map(([key, value]) => [`--dnd-ui-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`, value as string]);
  }

  private applyColorVars(root: HTMLElement): void {
    for (const [name, value] of this.colorCssVars()) {
      root.style.setProperty(name, value);
    }
  }

  private removeColorVars(root: HTMLElement): void {
    for (const [name] of this.colorCssVars()) {
      root.style.removeProperty(name);
    }
  }

  private eachStyleRoot(fn: (root: HTMLElement) => void): void {
    fn(document.documentElement);

    // Include popout windows (desktop only - multi-window not available on mobile)
    if (Platform.isDesktop) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const windowDoc = leaf.view.containerEl.ownerDocument;
        if (windowDoc) {
          fn(windowDoc.documentElement);
        }
      });
    }
  }

  applyColorSettings(): void {
    this.eachStyleRoot((root) => this.applyColorVars(root));
  }

  removeColorSettings(): void {
    this.eachStyleRoot((root) => this.removeColorVars(root));
  }

  async onload() {
    await this.loadSettings();

    // Apply color settings on load
    this.applyColorSettings();

    // Listen for new windows and apply settings to them (desktop only)
    if (Platform.isDesktop) {
      this.registerEvent(
        this.app.workspace.on("window-open", (win) => {
          this.applyColorVars(win.doc.documentElement);
        })
      );
    }

    // Initialize the JsonDataStore with the configured path
    this.initDataStore();

    documentText.init(this.app);

    this.registerEvent(
      this.app.metadataCache.on("changed", (file, data) => {
        documentText.update(file.path, data);
        publishFrontmatterChange(this.app, file.path);
      })
    );
    this.registerEvent(this.app.vault.on("delete", (file) => documentText.remove(file.path)));
    this.registerEvent(this.app.vault.on("rename", (_file, oldPath) => documentText.remove(oldPath)));

    const kv = new KeyValueStore(this.dataStore);
    const { app } = this;

    const views: BaseView[] = [
      // Static
      new StatsView(app),
      new AbilityScoreView(app),
      new SkillsView(app),
      new BadgesView(app),
      new SpellComponentsView(app),
      new EventButtonsView(app),
      new RawAbilityView(app),
      new RawSkillsView(app),

      // Dynamic/Stateful
      new HealthView(app, kv),
      new ConsumableView(app, kv),
      new InitiativeView(app, kv),
    ];

    for (const view of views) {
      // Use an arrow function to preserve the 'this' context
      this.registerMarkdownCodeBlockProcessor(view.codeblock, (source, el, ctx) => {
        view.register(source, el, ctx);
      });
    }

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new TtrpgSettingsTab(this.app, this));
  }

  /**
   * Initialize or reinitialize the data store with the current path setting
   */
  initDataStore() {
    // Initialize with the vault adapter and the configured path
    this.dataStore = new JsonDataStore(this.app.vault, this.settings.statePath);
  }

  onunload() {
    this.removeColorSettings();
    documentText.clear();
  }

  async loadSettings() {
    const { adapter, configDir } = this.app.vault;

    let saved = (await this.loadData()) as Partial<TtrpgUIToolkitSettings> | null;
    if (!saved) {
      saved = await readLegacySettings(adapter, configDir);
      // Copied forward so settings survive the user deleting the old plugin folder.
      if (saved) await this.saveData(saved);
    }

    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!saved?.statePath) {
      this.settings.statePath = await resolveDefaultStatePath(adapter);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Reinitialize data store with the new path
    this.initDataStore();
  }
}

const COLOR_SETTINGS: { name: string; key: keyof TtrpgUIToolkitSettings }[] = [
  { name: "Background primary", key: "colorBgPrimary" },
  { name: "Background secondary", key: "colorBgSecondary" },
  { name: "Background tertiary", key: "colorBgTertiary" },
  { name: "Background hover", key: "colorBgHover" },
  { name: "Background darker", key: "colorBgDarker" },
  { name: "Background group", key: "colorBgGroup" },
  { name: "Background proficient", key: "colorBgProficient" },

  { name: "Text primary", key: "colorTextPrimary" },
  { name: "Text secondary", key: "colorTextSecondary" },
  { name: "Text sublabel", key: "colorTextSublabel" },
  { name: "Text bright", key: "colorTextBright" },
  { name: "Text muted", key: "colorTextMuted" },
  { name: "Text group", key: "colorTextGroup" },

  { name: "Border primary", key: "colorBorderPrimary" },
  { name: "Border active", key: "colorBorderActive" },
  { name: "Border focus", key: "colorBorderFocus" },

  { name: "Accent teal", key: "colorAccentTeal" },
  { name: "Accent red", key: "colorAccentRed" },
  { name: "Accent purple", key: "colorAccentPurple" },
];

const COLOR_SETTING_KEYS = new Set<string>(COLOR_SETTINGS.map((c) => c.key));

class TtrpgSettingsTab extends PluginSettingTab {
  plugin: TtrpgUIToolkitPlugin;

  constructor(app: App, plugin: TtrpgUIToolkitPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // Declarative definitions rather than an imperative display(), so Obsidian
  // can index these for settings search. The base class ignores display()
  // entirely once this returns a non-empty array.
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "State file path",
        desc: "Relative path (from vault root) where the state file is stored. Interactive components save their state to this JSON file.",
        control: {
          type: "text",
          key: "statePath",
          placeholder: DEFAULT_SETTINGS.statePath,
        },
      },
      {
        type: "group",
        heading: "Styles",
        items: [
          {
            name: "Theme preset",
            desc: "Choose a predefined color theme. Selecting a theme will update all color values.",
            control: {
              type: "dropdown",
              key: "selectedTheme",
              options: Object.fromEntries(Object.entries(THEMES).map(([key, theme]) => [key, theme.name])),
            },
          },
          ...COLOR_SETTINGS.map(({ name, key }) => ({
            name,
            control: { type: "color" as const, key },
          })),
          {
            name: "Reset styles",
            // Rendered imperatively to keep the button affordance; an `action`
            // definition would make the whole row a click target instead.
            render: (setting: Setting) => {
              setting.addButton((b) =>
                b.setButtonText("Reset").onClick(() => {
                  void this.applyTheme("default");
                })
              );
            },
          },
        ],
      },
    ];
  }

  // getControlValue is not overridden: every control key above is also a
  // settings key, which is exactly what the default implementation reads.
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "selectedTheme") {
      await this.applyTheme(String(value));
      return;
    }

    // Every field on TtrpgUIToolkitSettings is a string, and the text and color
    // controls above are its only writers, so anything else is not ours.
    if (typeof value !== "string") return;

    this.plugin.settings[key as keyof TtrpgUIToolkitSettings] = value;
    await this.plugin.saveSettings();

    if (COLOR_SETTING_KEYS.has(key)) {
      this.plugin.applyColorSettings();
    }
  }

  private async applyTheme(themeKey: string): Promise<void> {
    const theme = THEMES[themeKey];
    if (!theme) return;

    this.plugin.settings.selectedTheme = themeKey;
    Object.assign(this.plugin.settings, theme.colors);
    await this.plugin.saveSettings();
    this.plugin.applyColorSettings();
    // The color controls read their values from settings, so the tab has to
    // re-render for the swatches to pick up the theme's palette.
    this.update();
  }
}
