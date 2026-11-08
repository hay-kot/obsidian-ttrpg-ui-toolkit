# Skills

The `skills` block automatically calculates your skill modifiers. It pulls from the first `abilities` block in your file and calculates scores based on those values. Supports proficiency, expertise, half proficiency, and arbitrary bonuses.

<SkillCardsDemo />

## Example

````yaml
```skills
proficiencies:
  - arcana
  - deception
  - history
  - insight
  - investigation
  - perception
  - stealth

bonuses:
  - name: Cloak of Elvenkind
    target: stealth
    value: 2

expertise:
  - investigation

half_proficiencies:
  - history
```
````

The skills block automatically displays all 18 D&D 5e skills: Acrobatics, Animal Handling, Arcana, Athletics, Deception, History, Insight, Intimidation, Investigation, Medicine, Nature, Perception, Performance, Persuasion, Religion, Sleight of Hand, Stealth, and Survival. Only skills listed in `proficiencies`, `expertise`, or `half_proficiencies` receive bonuses — the rest display with their base ability modifier.

## Configuration

| Property             | Type   | Default | Description                                                          |
| -------------------- | ------ | ------- | ------------------------------------------------------------------- |
| `proficiencies`      | Array  | —       | List of skills you are proficient in                                |
| `expertise`          | Array  | —       | List of skills you have expertise in (double proficiency)           |
| `half_proficiencies` | Array  | —       | List of skills you have half proficiency in                         |
| `bonuses`            | Array  | —       | List of bonuses to apply to specific skills                         |
| `advantage` †        | Object | —       | Map of skills to booleans; a `true` value marks that skill with an up-chevron icon |
| `disadvantage` †     | Object | —       | Map of skills to booleans; a `true` value marks that skill with a down-chevron icon |

† Supports [dynamic content](/concepts/dynamic-content) templates

### Bonus Object

| Property | Type   | Default  | Description                              |
| -------- | ------ | -------- | ---------------------------------------- |
| `name`   | String | Required | Name of the bonus (for display purposes) |
| `target` | String | Required | Which skill the bonus applies to         |
| `value`  | Number | Required | The bonus value to add                   |

## Advantage & Disadvantage

Highlight skills that currently have advantage or disadvantage. Keys are skill names matched against the full label, so multi-word skills are written with spaces (`sleight of hand`). A `true` value marks the skill with an up-chevron (advantage) or down-chevron (disadvantage) icon; hovering it shows a tooltip naming the skill and which one applies. A skill flagged as both, or as neither, gets no indicator.

<AdvantageDemo block="skills" />

````yaml
```skills
proficiencies:
  - perception
  - stealth

advantage:
  perception: true
  # Bind the value to frontmatter so a Meta Bind toggle can flip it live
  stealth: "{{frontmatter.stealthAdvantage}}"

disadvantage:
  athletics: "{{frontmatter.athleticsDisadvantage}}"
```
````

Because the templated values read from frontmatter, a [Meta Bind](https://cwyther.gitbook.io/obsidian-meta-bind-plugin) toggle bound to `stealthAdvantage` (etc.) updates the indicator the moment it changes.
