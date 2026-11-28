# Initiative Tracker

The `initiative` component tracks combat encounters by managing initiative order, AC, and optionally HP for each combatant. The tracker automatically sorts combatants by initiative rolls and provides controls to move through combat order.

<InitiativeDemo />

## Example

### Basic

For single creatures or grouped creatures that share a single HP pool:

````yaml
```initiative
state_key: forest_encounter
items:
  - name: Thordak (Fighter)
    ac: 18
    hp: 45
    link: thordak-character-sheet
  - name: Elf Wizard
    ac: 15
    hp: 28
    link: wizard-npc
  - name: Goblin Warriors (x3)
    ac: 14
    hp: 21
```
````

### Monster Groups

For groups of monsters with individual HP tracking:

````yaml
```initiative
state_key: dungeon_encounter
items:
  - name: Party Fighter
    ac: 18
    hp: 45
  - name: Goblin Squad
    ac: 14
    hp:
      Goblin 1: 12
      Goblin 2: 12
      Goblin 3: 12
  - name: Skeleton Archers
    ac: 13
    hp:
      Archer 1: 10
      Archer 2: 10
```
````

### Consumables

Track limited-use abilities that reset between rounds, such as legendary actions or lair actions.

````yaml
```initiative
state_key: dragon_encounter
items:
  - name: Ancient Red Dragon
    ac: 22
    hp: 546
  - name: Fighter
    ac: 18
    hp: 45
  - name: Wizard
    ac: 15
    hp: 28
consumables:
  - label: Legendary Actions
    state_key: dragon_legendary
    uses: 3
    reset_on_round: true
  - label: Lair Actions
    state_key: dragon_lair
    uses: 1
    reset_on_round: true
```
````

## Configuration

| Property      | Type   | Default  | Description                        |
| ------------- | ------ | -------- | ---------------------------------- |
| `state_key`   | String | Required | Unique identifier for state storage |
| `items`       | Array  | Required | List of combatants                 |
| `consumables` | Array  | —        | Tracked consumables                |

### Item Object

| Property | Type          | Default  | Description                                    |
| -------- | ------------- | -------- | ---------------------------------------------- |
| `name`   | String        | Required | Name of the combatant                          |
| `ac`     | Number        | Required | Armor Class                                    |
| `hp`     | Number/Object | —        | Hit points (single value or object for groups) |
| `link`   | String        | —        | Link to character sheet or notes               |

::: info Duplicate Names
Giving each combatant a unique name is still recommended (for example `Goblin A` and `Goblin B`), or use a single item with per-creature HP as shown in [Monster Groups](#monster-groups). Duplicate names are handled as a fallback so that items do not share state by accident.

Each combatant's initiative and HP are saved under its name. When several items share a name, the first one keeps the plain name and each later one gets a numeric suffix based on how many items with that name come before it (for example `Goblin`, `Goblin_1`, `Goblin_2`). Combatants with unique names are not affected.

With duplicate names, saved state follows that order. If you reorder duplicate-named items, or remove one from the middle, the saved initiative and HP stay with the position, so they can move to a different combatant. Unique names avoid this.
:::

### HP Options

**Single HP Pool:**
```yaml
hp: 25
```

**Individual HP Tracking:**
```yaml
hp:
  Creature 1: 12
  Creature 2: 12
  Creature 3: 8
```

### Consumable Object

| Property         | Type    | Default  | Description                                     |
| ---------------- | ------- | -------- | ----------------------------------------------- |
| `label`          | String  | Required | Display name for the consumable                 |
| `state_key`      | String  | Required | Unique identifier for state storage             |
| `uses`           | Number  | Required | Maximum number of uses                          |
| `reset_on_round` | Boolean | false    | Whether to reset when round advances            |

::: info State Key Scope
Consumable `state_key` values only need to be unique within the initiative component itself, not globally.
:::
