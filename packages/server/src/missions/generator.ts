import {
  CONFIG,
  type FactionId,
  type ManeuverPlanResult,
  type ManeuverTarget,
  type MissionInstance,
} from '@orbital/shared';

export const MISSION_TARGETS = {
  cargo: {
    kind: 'CIRCULAR_ORBIT',
    radiusM: CONFIG.earthRadius + 450_000,
    phaseAheadRad: 0.02,
  } satisfies ManeuverTarget,
  reconnaissance: {
    kind: 'CIRCULAR_ORBIT',
    radiusM: CONFIG.earthRadius + 800_000,
    phaseAheadRad: 0.13179322079005384,
  } satisfies ManeuverTarget,
  interception: {
    kind: 'CIRCULAR_ORBIT',
    radiusM: CONFIG.earthRadius + 400_000,
    phaseAheadRad: 0.3,
  } satisfies ManeuverTarget,
};

const bestEta = (plan: ManeuverPlanResult) =>
  plan.candidates.length ? Math.min(...plan.candidates.map((candidate) => candidate.etaSeconds)) : undefined;

export function generateMissionPool(
  factionId: FactionId,
  cargoPlan: ManeuverPlanResult,
  reconnaissancePlan: ManeuverPlanResult,
  currentAltitudeKm = CONFIG.initialAltitude / 1000,
  cargoCapacityKg = Number.POSITIVE_INFINITY,
  interceptionPlan?: ManeuverPlanResult,
): MissionInstance[] {
  const cargoEta =
      Math.abs(currentAltitudeKm - 450) * 1000 <= CONFIG.missionOrbitToleranceM ? 0 : bestEta(cargoPlan),
    reconEta =
      Math.abs(currentAltitudeKm - 800) * 1000 <= CONFIG.missionOrbitToleranceM
        ? 0
        : bestEta(reconnaissancePlan),
    missions: MissionInstance[] = [];
  if (cargoEta !== undefined && cargoCapacityKg >= CONFIG.cargoMissionMassKg)
    missions.push({
      id: `cargo-${factionId.toLowerCase()}-450-01`,
      type: 'CARGO',
      title: 'Denetim halkasına yedek parça',
      briefing: 'Basınç valflerini 450 km denetim halkasındaki bakım ekibine ulaştır.',
      factionId,
      status: 'AVAILABLE',
      destination: {
        id: 'inspection-ring-450',
        name: 'Denetim Halkası · 450 km',
        altitudeKm: 450,
        toleranceM: CONFIG.missionOrbitToleranceM,
        target: MISSION_TARGETS.cargo,
      },
      reward: {
        credits: CONFIG.cargoMissionRewardCredits,
        reputation: CONFIG.cargoMissionRewardReputation,
      },
      estimatedEtaSeconds: cargoEta,
      difficulty: 'BAŞLANGIÇ',
      reachable: true,
      cargo: {
        id: `cargo-parts-${factionId.toLowerCase()}-450-01`,
        name: 'Yedek basınç valfleri',
        massKg: CONFIG.cargoMissionMassKg,
        delivered: false,
      },
    });
  const firstCargo = missions.find((mission) => mission.type === 'CARGO');
  if (firstCargo)
    missions.push({
      ...structuredClone(firstCargo),
      id: `cargo-${factionId.toLowerCase()}-450-02`,
      title: 'Denetim halkasına kalibrasyon seti',
      briefing: 'İkinci bakım vardiyasının sensör kalibrasyon setini denetim halkasına teslim et.',
      cargo: {
        id: `cargo-calibration-${factionId.toLowerCase()}-450-02`,
        name: 'Sensör kalibrasyon seti',
        massKg: CONFIG.cargoMissionMassKg,
        delivered: false,
      },
    });
  if (reconEta !== undefined)
    missions.push({
      id: `recon-${factionId.toLowerCase()}-800-01`,
      type: 'RECONNAISSANCE',
      title: 'A-800 sinyal taraması',
      briefing: 'Servis halkasındaki parazit kaynağını beş saniyelik sabit taramayla doğrula.',
      factionId,
      status: 'AVAILABLE',
      destination: {
        id: 'service-ring-800',
        name: 'Servis Halkası A-800',
        altitudeKm: 800,
        toleranceM: CONFIG.missionOrbitToleranceM,
        target: MISSION_TARGETS.reconnaissance,
      },
      reward: {
        credits: CONFIG.reconMissionRewardCredits,
        reputation: CONFIG.reconMissionRewardReputation,
      },
      estimatedEtaSeconds: reconEta,
      difficulty: 'STANDART',
      reachable: true,
      recon: { requiredSeconds: CONFIG.reconScanSeconds, progressSeconds: 0, scanning: false },
    });
  const interceptEta = interceptionPlan ? bestEta(interceptionPlan) : undefined;
  if (interceptEta !== undefined)
    missions.push({
      id: `intercept-${factionId.toLowerCase()}-relay-01`,
      type: 'INTERCEPT',
      title: 'Kimliksiz röle teması',
      briefing: '400 km halkasındaki kimliksiz röleyle buluş ve transponder imzasını doğrula.',
      factionId,
      status: 'AVAILABLE',
      destination: {
        id: 'relay-contact-400',
        name: 'Röle Teması R-17 · 400 km',
        altitudeKm: 400,
        toleranceM: CONFIG.missionOrbitToleranceM,
        target: MISSION_TARGETS.interception,
      },
      reward: {
        credits: CONFIG.interceptRewardCredits,
        reputation: CONFIG.interceptRewardReputation,
      },
      estimatedEtaSeconds: interceptEta,
      difficulty: 'STANDART',
      reachable: true,
      intercept: { targetId: 'relay-r17', targetLabel: 'Kimliksiz Röle R-17', identified: false },
    });
  return missions;
}
