# Quick Start

## Installation

Install TTRPG UI Toolkit from Obsidian's Community Plugins:

1. Open Obsidian Settings and go to **Community plugins**
2. Click **Browse** and search for "TTRPG UI Toolkit"
3. Click **Install**, then **Enable**

See [Installation](./installation.md) for more detail.

## Your First Character Sheet

Create a new note and add these components to get started:

````md
---
level: 1
proficiency_bonus: 2
---

```event-btns
items:
  - name: Short Rest
    value: short-rest
  - name: Long Rest
    value: long-rest
```

```healthpoints
state_key: my_character_hp
health: 28
hitdice:
  dice: d8
  value: 3
```

```ability
abilities:
  strength: 14
  dexterity: 16
  constitution: 13
  intelligence: 12
  wisdom: 10
  charisma: 8

proficiencies:
  - dexterity
  - intelligence
```

```skills
proficiencies:
  - stealth
  - investigation
  - perception

expertise:
  - stealth
```

```consumable
items:
  - label: "Level 1 Spells"
    state_key: my_character_spells_1
    uses: 3
    reset_on: "long-rest"
  - label: "Sneak Attack"
    state_key: my_character_sneak_attack
    uses: 1
    reset_on: ["short-rest", "long-rest"]
```
````

## What You Get

This basic setup gives you:

- **Ability Scores**: Interactive ability score display with saving throws
- **Skills**: Automatically calculated skill modifiers
- **Health Tracking**: Persistent HP tracking with hit dice
- **Resource Management**: Spell slots and abilities that reset with rests
- **Rest System**: Buttons to trigger rest events

## Important Concepts

### State Keys

Every component that tracks data needs a unique `state_key` across your vault. A good rule of
thumb is to prefix whatever keys you have with your character's name

- ❌ `level_1_spells`
- ✅ `din_level_1_spells`

### Indentation

Code blocks contain YAML. Indent nested values with spaces or tabs. Leading tabs are read as two spaces each, so a block indented with tabs works the same as one indented with spaces. Tabs inside values (for example in quoted text) are kept as written.

### File Scope

Events (like rest buttons) only affect components in the same file. This means each character sheet can have its own rest system without interfering with others.
