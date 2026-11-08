---
level: 5
spellcasting_ability: wisdom
---
# Embedded Sheet

Source note for [[Embeds]]. Open this note directly first and write down the
numbers, then compare them with the embeds.

## Abilities

```ability
abilities:
  strength: 18
  dexterity: 14
  constitution: 12
  intelligence: 10
  wisdom: 16
  charisma: 8
proficiencies:
  - strength
```

## Skills

```skills
proficiencies:
  - athletics
  - perception
```

## Spell

```spell-components
save: true
attack: true
```

## Health

```healthpoints
state_key: embedded_sheet_hp
health: "{{add 10 abilities.constitution}}"
```
