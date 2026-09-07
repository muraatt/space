export type ShipDefinitionId = 'KESTREL_LOGISTICS' | 'RAPTOR_COMBAT';
export type ShipRole = 'LOGISTICS' | 'COMBAT';
export type UpgradeSlot = 'PROPULSION' | 'CARGO' | 'SYSTEMS';

export interface ShipPerformance {
  dryMassKg: number;
  propellantCapacityKg: number;
  cargoCapacityKg: number;
  ammunitionCapacityKg: number;
  mainThrustN: number;
  translationThrustN: number;
  specificImpulseSeconds: number;
  durabilityRating: number;
  sensorScanTimeMultiplier: number;
  slots: Record<UpgradeSlot, number>;
}

export interface ShipDefinition {
  id: ShipDefinitionId;
  name: string;
  callsign: string;
  symbol: string;
  role: ShipRole;
  description: string;
  initialConditionPercent: number;
  initialPropellantKg: number;
  initialAmmunitionKg: number;
  base: ShipPerformance;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  priceCredits: number;
  slot: UpgradeSlot;
  compatibleShips: ShipDefinitionId[];
  moduleMassKg: number;
  effect: {
    propellantCapacityKg?: number;
    thrustMultiplier?: number;
    cargoCapacityKg?: number;
    sensorScanTimeMultiplier?: number;
  };
  effectLabel: string;
}

export const SHIP_DEFINITIONS: readonly ShipDefinition[] = Object.freeze([
  {
    id: 'KESTREL_LOGISTICS',
    name: 'Kestrel',
    callsign: 'ST—01',
    symbol: '▣',
    role: 'LOGISTICS',
    description: 'Geniş kargo hacimli yörünge servis aracı.',
    initialConditionPercent: 92,
    initialPropellantKg: 2000,
    initialAmmunitionKg: 0,
    base: {
      dryMassKg: 6000,
      propellantCapacityKg: 2000,
      cargoCapacityKg: 1200,
      ammunitionCapacityKg: 0,
      mainThrustN: 24000,
      translationThrustN: 8000,
      specificImpulseSeconds: 320,
      durabilityRating: 70,
      sensorScanTimeMultiplier: 1,
      slots: { PROPULSION: 2, CARGO: 1, SYSTEMS: 1 },
    },
  },
  {
    id: 'RAPTOR_COMBAT',
    name: 'Raptor',
    callsign: 'CT—02',
    symbol: '◆',
    role: 'COMBAT',
    description: 'Yüksek ivmeli devriye ve önleme platformu.',
    initialConditionPercent: 84,
    initialPropellantKg: 900,
    initialAmmunitionKg: 40,
    base: {
      dryMassKg: 5200,
      propellantCapacityKg: 1600,
      cargoCapacityKg: 250,
      ammunitionCapacityKg: 120,
      mainThrustN: 34000,
      translationThrustN: 12000,
      specificImpulseSeconds: 330,
      durabilityRating: 92,
      sensorScanTimeMultiplier: 1,
      slots: { PROPULSION: 2, CARGO: 0, SYSTEMS: 1 },
    },
  },
]);

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = Object.freeze([
  {
    id: 'extended-propellant-cell',
    name: 'Genişletilmiş Yakıt Hücresi',
    description: 'Servis menzilini büyüten ek kriyojenik tank.',
    priceCredits: 5400,
    slot: 'PROPULSION',
    compatibleShips: ['KESTREL_LOGISTICS', 'RAPTOR_COMBAT'],
    moduleMassKg: 90,
    effect: { propellantCapacityKg: 400 },
    effectLabel: '+400 kg yakıt kapasitesi',
  },
  {
    id: 'high-flow-injector',
    name: 'Yüksek Debili Enjektör',
    description: 'Ana ve yakın operasyon iticilerinin debisini artırır.',
    priceCredits: 6000,
    slot: 'PROPULSION',
    compatibleShips: ['KESTREL_LOGISTICS', 'RAPTOR_COMBAT'],
    moduleMassKg: 55,
    effect: { thrustMultiplier: 1.15 },
    effectLabel: '+%15 ana/yön itkisi',
  },
  {
    id: 'modular-cargo-rack',
    name: 'Modüler Kargo Rafı',
    description: 'Kestrel görev yükü sınırını genişletir.',
    priceCredits: 5000,
    slot: 'CARGO',
    compatibleShips: ['KESTREL_LOGISTICS'],
    moduleMassKg: 120,
    effect: { cargoCapacityKg: 500 },
    effectLabel: '+500 kg kargo kapasitesi',
  },
  {
    id: 'survey-sensor-array',
    name: 'Keşif Sensör Dizisi',
    description: 'Görev taramalarında gereken sabit kalma süresini azaltır.',
    priceCredits: 4700,
    slot: 'SYSTEMS',
    compatibleShips: ['KESTREL_LOGISTICS', 'RAPTOR_COMBAT'],
    moduleMassKg: 45,
    effect: { sensorScanTimeMultiplier: 0.65 },
    effectLabel: '%35 daha kısa keşif taraması',
  },
]);

export function shipDefinition(id: ShipDefinitionId) {
  const definition = SHIP_DEFINITIONS.find((item) => item.id === id);
  if (!definition) throw new RangeError(`Unknown ship definition: ${id}`);
  return definition;
}

export function shipPerformance(id: ShipDefinitionId, installedUpgradeIds: readonly string[]) {
  const base = shipDefinition(id).base,
    result: ShipPerformance = { ...base, slots: { ...base.slots } };
  for (const upgradeId of installedUpgradeIds) {
    const upgrade = UPGRADE_DEFINITIONS.find((item) => item.id === upgradeId);
    if (!upgrade || !upgrade.compatibleShips.includes(id)) continue;
    result.propellantCapacityKg += upgrade.effect.propellantCapacityKg ?? 0;
    result.cargoCapacityKg += upgrade.effect.cargoCapacityKg ?? 0;
    result.mainThrustN *= upgrade.effect.thrustMultiplier ?? 1;
    result.translationThrustN *= upgrade.effect.thrustMultiplier ?? 1;
    result.sensorScanTimeMultiplier *= upgrade.effect.sensorScanTimeMultiplier ?? 1;
  }
  return result;
}
