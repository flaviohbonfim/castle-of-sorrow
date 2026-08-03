export type SubweaponId = "dagger" | "axe";

export interface SubweaponDef {
  id: SubweaponId;
  name: string;
  heartCost: number;
  power: number; // added to STR scaling in damage calc
}

export const SUBWEAPONS: Record<SubweaponId, SubweaponDef> = {
  dagger: { id: "dagger", name: "Dagger", heartCost: 1, power: 6 },
  axe: { id: "axe", name: "Axe", heartCost: 2, power: 10 },
};
