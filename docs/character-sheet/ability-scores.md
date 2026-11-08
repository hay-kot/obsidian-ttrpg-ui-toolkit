# Ability Scores

The `ability` block generates a 6-column grid of your ability scores and their saving throws. Fill in the code block with your abilities, proficiencies, and any bonuses that apply to either the ability scores themselves or their saving throws.

<AbilityCardsDemo />

## Example

````yaml
```ability
abilities:
  strength: 9
  dexterity: 14
  constitution: 14
  intelligence: 19
  wisdom: 12
  charisma: 10

bonuses:
  - name: Right of Power
    target: strength
    value: 2
    modifies: saving_throw  # Optional: defaults to saving_throw

proficiencies:
  - intelligence
  - wisdom
```
````

## Configuration

| Property         | Type   | Default  | Description                                                                               |
| ---------------- | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `abilities`      | Object | Required | Ability score values (strength, dexterity, constitution, intelligence, wisdom, charisma) |
| `bonuses`        | Array  | —        | List of bonuses to apply to ability scores or saving throws                              |
| `proficiencies`  | Array  | —        | List of abilities you are proficient in for saving throws                                |
| `advantage` †    | Object | —        | Map of abilities to booleans; a `true` value marks that saving throw with an up-chevron icon  |
| `disadvantage` † | Object | —        | Map of abilities to booleans; a `true` value marks that saving throw with a down-chevron icon  |

† Supports [dynamic content](/concepts/dynamic-content) templates

### Bonus Object

| Property   | Type   | Default        | Description                                         |
| ---------- | ------ | -------------- | --------------------------------------------------- |
| `name`     | String | Required       | Name of the bonus (for display purposes)            |
| `target`   | String | Required       | Which ability the bonus applies to                  |
| `value`    | Number | Required       | The bonus value to add                              |
| `modifies` | String | "saving_throw" | Either `"score"` or `"saving_throw"` |

## Advantage & Disadvantage

Highlight saving throws that currently have advantage or disadvantage. Keys accept the full ability name (`strength`) or its abbreviation (`str`). A `true` value marks the save with an up-chevron (advantage) or down-chevron (disadvantage) icon; hovering it shows a tooltip naming the ability and which one applies. A save flagged as both, or as neither, gets no indicator.

<AdvantageDemo block="ability" />

````yaml
```ability
abilities:
  strength: 15
  dexterity: 14
  constitution: 13
  intelligence: 12
  wisdom: 10
  charisma: 8

advantage:
  strength: true
  # Bind the value to frontmatter so a Meta Bind toggle can flip it live
  dexterity: "{{frontmatter.dexAdvantage}}"

disadvantage:
  wisdom: "{{frontmatter.wisDisadvantage}}"
```
````

Because the templated values read from frontmatter, a [Meta Bind](https://cwyther.gitbook.io/obsidian-meta-bind-plugin) toggle bound to `dexAdvantage` (etc.) updates the indicator the moment it changes.
