import type { Discipline } from "./metrics";
/** Curated coaching references, not complete descriptions or rankings of these athletes. */
export const styleReferences = [
  {
    id: "muhammad-ali",
    name: "Muhammad Ali",
    discipline: "boxing",
    patterns: "Jab-led range management and lateral movement.",
  },
  {
    id: "floyd-mayweather",
    name: "Floyd Mayweather Jr.",
    discipline: "boxing",
    patterns:
      "Defensive positioning, guard variation, and counterpunch setups.",
  },
  {
    id: "manny-pacquiao",
    name: "Manny Pacquiao",
    discipline: "boxing",
    patterns:
      "Angled entries and multi-punch attacks followed by a change of position.",
  },
  {
    id: "canelo-alvarez",
    name: "Canelo Álvarez",
    discipline: "boxing",
    patterns:
      "Compact positioning and deliberate body-to-head punch selection.",
  },
  {
    id: "dmitry-bivol",
    name: "Dmitry Bivol",
    discipline: "boxing",
    patterns: "Jab-led combinations with disciplined entries and exits.",
  },
  {
    id: "oleksandr-usyk",
    name: "Oleksandr Usyk",
    discipline: "boxing",
    patterns: "Lateral angle changes, feints, and range transitions.",
  },
  {
    id: "giorgio-petrosyan",
    name: "Giorgio Petrosyan",
    discipline: "kickboxing",
    patterns:
      "Controlled range, defensive positioning, and counterattacking opportunities.",
  },
  {
    id: "ernesto-hoost",
    name: "Ernesto Hoost",
    discipline: "kickboxing",
    patterns:
      "Layered punch-to-kick combinations and target changes, subject to the applicable ruleset.",
  },
  {
    id: "buakaw",
    name: "Buakaw Banchamek",
    discipline: "kickboxing",
    patterns:
      "Body-kick setups, forward pressure, and balanced recovery, subject to the applicable ruleset.",
  },
] as const;
export type StyleReferenceId = (typeof styleReferences)[number]["id"];
export const referenceIds = styleReferences.map((r) => r.id) as [
  StyleReferenceId,
  ...StyleReferenceId[],
];
export function referenceFor(id: string) {
  return styleReferences.find((r) => r.id === id);
}
export function referencesFor(discipline: Discipline) {
  return styleReferences.filter((r) => r.discipline === discipline);
}
