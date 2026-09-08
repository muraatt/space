import {
  CONFIG,
  UPGRADE_DEFINITIONS,
  neutralControls,
  shipDefinition,
  shipPerformance,
  type ManeuverCandidate,
  type ManeuverExecutionState,
  type FactionId,
  type MissionInstance,
  type SceneId,
  type ServerMetrics,
  type Vec3,
  type CombatEventType,
  type CombatRegion,
  type CombatTargetState,
  type CombatModuleId,
  type MissileState,
} from '@orbital/shared';
import {
  availableDeltaV,
  cross,
  add,
  integrate,
  initialWorld,
  length,
  normalize,
  orientationForBodyMinusZ,
  propagateKepler,
  scale,
  step,
  sub,
  lineOfSightClear,
  segmentSphereHit,
  stepGuidedMissile,
  withinFiringArc,
  totalMassKg,
} from '@orbital/simulation';
import { MemoryRepository } from './persistence/memory-repository';
export class World {
  state = initialWorld();
  paused = false;
  lastInputAt = 0;
  rejectedCommands = 0;
  private times: number[] = [];
  private repository = new MemoryRepository();
  private combatCommand(commandId: string) {
    if (this.state.combat.processedCommandIds.includes(commandId))
      return { ok: false as const, code: 'DUPLICATE_COMBAT_COMMAND' };
    this.state.combat.processedCommandIds.push(commandId);
    if (this.state.combat.processedCommandIds.length > 256) this.state.combat.processedCommandIds.shift();
    return { ok: true as const };
  }
  private combatEvent(
    type: CombatEventType,
    atMs: number,
    message: string,
    detail: { sourceId?: string; targetId?: string; value?: number } = {},
  ) {
    const combat = this.state.combat;
    combat.events.push({ id: `combat-event-${++combat.sequence}`, type, atMs, message, ...detail });
    if (combat.events.length > 40) combat.events.shift();
  }
  private currentIntercept() {
    const mission = this.state.missions.find((item) => item.id === this.state.profile.activeMissionId);
    return mission?.type === 'INTERCEPT' && mission.status === 'ACTIVE' ? mission : undefined;
  }
  private combatPermission(target: CombatTargetState) {
    if (this.state.combat.region === 'SAFE') return { ok: false as const, code: 'COMBAT_FORBIDDEN_SAFE' };
    if (this.state.combat.region === 'CONTESTED') return { ok: true as const };
    const mission = this.currentIntercept();
    if (
      !mission?.intercept?.identified ||
      !mission.intercept.combatAuthorized ||
      mission.intercept.targetId !== target.id
    )
      return { ok: false as const, code: 'COMBAT_PERMISSION_REQUIRED' };
    return { ok: true as const };
  }
  private refreshCombatContacts() {
    for (const contact of this.state.combat.contacts) {
      contact.rangeM = length(sub(contact.position, this.state.ship.position));
      contact.lineOfSight = lineOfSightClear(this.state.ship.position, contact.position, contact.occluded);
      contact.engagementAllowed = contact.eligible && !contact.destroyed && this.combatPermission(contact).ok;
    }
  }
  setCombatRegion(region: CombatRegion) {
    this.state.combat.region = region;
    this.refreshCombatContacts();
  }
  selectCombatTarget(targetId: string, commandId: string, nowMs: number) {
    const unique = this.combatCommand(commandId);
    if (!unique.ok) return unique;
    if (this.state.combat.playerDestroyed) return { ok: false as const, code: 'SHIP_DESTROYED' };
    if (targetId === this.state.ship.id) return { ok: false as const, code: 'SELF_TARGET' };
    const target = this.state.combat.contacts.find((item) => item.id === targetId);
    if (!target) return { ok: false as const, code: 'UNKNOWN_TARGET' };
    if (target.destroyed || !target.eligible) return { ok: false as const, code: 'TARGET_INELIGIBLE' };
    const permission = this.combatPermission(target);
    if (!permission.ok) return permission;
    this.state.combat.selectedTargetId = target.id;
    this.combatEvent('TARGET_SELECTED', nowMs, `${target.label} hedeflendi.`, { targetId });
    this.refreshCombatContacts();
    return { ok: true as const };
  }
  clearCombatTarget(commandId: string, nowMs: number) {
    const unique = this.combatCommand(commandId);
    if (!unique.ok) return unique;
    this.state.combat.selectedTargetId = undefined;
    this.combatEvent('TARGET_CLEARED', nowMs, 'Hedef seçimi temizlendi.');
    return { ok: true as const };
  }
  private weaponTarget(rangeM: number) {
    const target = this.state.combat.contacts.find((item) => item.id === this.state.combat.selectedTargetId);
    if (!target) return { ok: false as const, code: 'NO_TARGET' };
    if (target.destroyed || !target.eligible) return { ok: false as const, code: 'TARGET_INELIGIBLE' };
    const permission = this.combatPermission(target);
    if (!permission.ok) return permission;
    if (target.rangeM > rangeM) return { ok: false as const, code: 'TARGET_OUT_OF_RANGE' };
    if (!target.lineOfSight) return { ok: false as const, code: 'NO_LINE_OF_SIGHT' };
    if (!withinFiringArc(this.state.ship.position, this.state.ship.orientation, target.position))
      return { ok: false as const, code: 'TARGET_OUTSIDE_ARC' };
    return { ok: true as const, target };
  }
  private tagCombat(nowMs: number) {
    this.state.combat.combatTagUntilMs = Math.max(
      this.state.combat.combatTagUntilMs,
      nowMs + CONFIG.combatTagDurationMs,
    );
  }
  private rejectLaser(code: string, nowMs: number) {
    this.combatEvent('LASER_REJECTED', nowMs, `Lazer atışı reddedildi: ${code}.`);
    return { ok: false as const, code };
  }
  private applyTargetDamage(damageId: string, target: CombatTargetState, amount: number, nowMs: number) {
    if (this.state.combat.processedDamageIds.includes(damageId))
      return { ok: false as const, code: 'DUPLICATE_DAMAGE' };
    this.state.combat.processedDamageIds.push(damageId);
    if (this.state.combat.processedDamageIds.length > 256) this.state.combat.processedDamageIds.shift();
    target.health = Math.max(0, target.health - amount);
    this.tagCombat(nowMs);
    this.combatEvent('DAMAGE_APPLIED', nowMs, `${target.label}: ${amount} gövde hasarı.`, {
      targetId: target.id,
      value: amount,
    });
    const mission = this.currentIntercept();
    if (mission?.intercept?.targetId === target.id && mission.intercept.identified) {
      mission.intercept.damageDealt = Math.min(
        mission.intercept.damageRequired,
        mission.intercept.damageDealt + amount,
      );
    }
    if (target.health <= 0) this.destroyTarget(target, nowMs);
    return { ok: true as const };
  }
  private updateDamageConsequences() {
    const modules = this.state.combat.modules,
      base = shipPerformance(this.state.ship.definitionId, this.state.ship.installedUpgradeIds),
      engineScale = 0.35 + 0.65 * (modules.ENGINE.condition / 100);
    this.state.ship.performance = {
      ...base,
      slots: { ...base.slots },
      mainThrustN: base.mainThrustN * engineScale,
      translationThrustN: base.translationThrustN * engineScale,
    };
    modules.ENGINE.consequence = `İtki %${Math.round(engineScale * 100)}`;
    modules.FUEL.consequence = `Yakıt bütünlüğü %${Math.round(modules.FUEL.condition)}`;
    modules.POWER.consequence = `Lazer dolumu %${Math.max(20, Math.round(modules.POWER.condition))}`;
    modules.WEAPON.consequence =
      modules.WEAPON.condition < 25
        ? 'Lazer ve füze çevrimi devre dışı'
        : `Silah verimi %${Math.round(50 + modules.WEAPON.condition / 2)}`;
  }
  private applyModuleDamage(damageId: string, amount: number, nowMs: number) {
    const ids: CombatModuleId[] = ['ENGINE', 'FUEL', 'POWER', 'WEAPON'],
      id = ids[(this.state.combat.processedDamageIds.length - 1) % ids.length],
      module = this.state.combat.modules[id],
      applied = Math.min(module.condition, amount * CONFIG.moduleDamageMultiplier);
    module.condition = Math.max(0, module.condition - applied);
    if (id === 'FUEL') {
      const lost = Math.min(this.state.ship.mass.propellantKg, amount * 2);
      this.state.ship.mass.propellantKg = Math.max(0, this.state.ship.mass.propellantKg - lost);
      this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    }
    this.updateDamageConsequences();
    this.combatEvent('MODULE_DAMAGED', nowMs, `${id} sistemi %${module.condition.toFixed(0)} kondisyona düştü.`, {
      targetId: this.state.ship.id,
      value: module.condition,
    });
    return id;
  }
  receivePlayerDamage(damageId: string, amount: number, nowMs: number) {
    if (this.state.combat.processedDamageIds.includes(damageId))
      return { ok: false as const, code: 'DUPLICATE_DAMAGE' };
    if (this.state.combat.playerDestroyed) return { ok: false as const, code: 'SHIP_DESTROYED' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false as const, code: 'INVALID_DAMAGE' };
    this.state.combat.processedDamageIds.push(damageId);
    this.state.combat.playerHull = Math.max(0, this.state.combat.playerHull - amount);
    this.state.ship.conditionPercent = this.state.combat.playerHull;
    this.applyModuleDamage(damageId, amount, nowMs);
    this.tagCombat(nowMs);
    this.combatEvent('DAMAGE_APPLIED', nowMs, `Araç ${amount} gövde hasarı aldı.`, {
      targetId: this.state.ship.id,
      value: amount,
    });
    if (this.state.combat.playerHull <= 0) this.destroyPlayer(nowMs);
    return { ok: true as const };
  }
  private destroyTarget(target: CombatTargetState, nowMs: number) {
    if (target.destroyed) return { ok: false as const, code: 'DUPLICATE_DESTRUCTION' };
    target.destroyed = true;
    target.eligible = false;
    target.engagementAllowed = false;
    this.state.combat.selectedTargetId = undefined;
    this.state.combat.bot.mode = 'DESTROYED';
    this.combatEvent('SHIP_DESTROYED', nowMs, `${target.label} imha edildi.`, { targetId: target.id });
    const mission = this.currentIntercept();
    if (mission?.intercept?.targetId === target.id && mission.intercept.identified) {
      mission.intercept.neutralized = true;
      this.completeMission(mission, nowMs);
    }
    return { ok: true as const };
  }
  private destroyPlayer(nowMs: number) {
    const combat = this.state.combat;
    if (combat.playerDestroyed) return { ok: false as const, code: 'DUPLICATE_DESTRUCTION' };
    combat.playerDestroyed = true;
    this.state.controls = neutralControls();
    if (this.state.maneuver && !['COMPLETE', 'CANCELLED', 'FAILED'].includes(this.state.maneuver.status)) {
      this.state.maneuver.status = 'FAILED';
      this.state.maneuver.failureReason = 'SHIP_DESTROYED';
      this.state.maneuver.completedAtMs = nowMs;
    }
    const lost = this.state.ship,
      wreck = {
        id: `wreck-${++combat.sequence}`,
        shipId: lost.id,
        definitionId: lost.definitionId,
        createdAtMs: nowMs,
        cargoLostKg: lost.mass.cargoKg,
        ammunitionLostKg: lost.mass.ammunitionKg,
        upgradeIdsLost: [...lost.installedUpgradeIds],
      };
    combat.wrecks.push(wreck);
    combat.missiles.forEach((missile) => {
      if (missile.targetId === lost.id && missile.status === 'ACTIVE') missile.status = 'EXPIRED';
    });
    const mission = this.currentIntercept();
    if (mission) {
      mission.status = 'FAILED';
      mission.failedAtMs = nowMs;
      this.state.profile.activeMissionId = undefined;
    }
    this.state.hangar.ships = this.state.hangar.ships.filter((ship) => ship.id !== lost.id);
    this.state.profile.ownedShipIds = this.state.profile.ownedShipIds.filter((id) => id !== lost.id);
    combat.recovery = {
      status: 'PENDING',
      lostShipId: lost.id,
      lostDefinitionId: lost.definitionId,
      covered: true,
      deductibleCredits: lost.definitionId === 'RAPTOR_COMBAT' ? CONFIG.raptorInsuranceDeductibleCredits : 0,
      wreckId: wreck.id,
    };
    this.combatEvent('SHIP_DESTROYED', nowMs, `${lost.id} kaybedildi.`, { targetId: lost.id });
    this.combatEvent('WRECK_CREATED', nowMs, `${wreck.id} kayıp kaydı oluşturuldu.`, { targetId: wreck.id });
    return { ok: true as const };
  }
  fireLaser(commandId: string, nowMs: number) {
    const unique = this.combatCommand(commandId);
    if (!unique.ok) return this.rejectLaser(unique.code, nowMs);
    if (this.state.combat.playerDestroyed) return this.rejectLaser('SHIP_DESTROYED', nowMs);
    if (this.state.combat.modules.WEAPON.condition < 25) return this.rejectLaser('WEAPON_OFFLINE', nowMs);
    this.refreshCombatContacts();
    const valid = this.weaponTarget(CONFIG.laserRangeM);
    if (!valid.ok) return this.rejectLaser(valid.code, nowMs);
    const combat = this.state.combat;
    if (nowMs < combat.laserCooldownUntilMs) return this.rejectLaser('LASER_COOLDOWN', nowMs);
    if (combat.laserEnergy < CONFIG.laserEnergyCost) return this.rejectLaser('LASER_ENERGY_LOW', nowMs);
    if (combat.laserHeat + CONFIG.laserHeatPerShot > 100)
      return this.rejectLaser('LASER_OVERHEAT', nowMs);
    combat.laserEnergy -= CONFIG.laserEnergyCost;
    combat.laserHeat += CONFIG.laserHeatPerShot;
    combat.laserCooldownUntilMs = nowMs + CONFIG.laserCooldownMs;
    this.tagCombat(nowMs);
    this.combatEvent('LASER_FIRED', nowMs, 'Lazer atışı kabul edildi.', {
      sourceId: this.state.ship.id,
      targetId: valid.target.id,
    });
    this.combatEvent('ENERGY_CHANGED', nowMs, 'Lazer enerji rezervi güncellendi.', {
      sourceId: this.state.ship.id,
      value: combat.laserEnergy,
    });
    this.combatEvent('HEAT_CHANGED', nowMs, 'Lazer ısı seviyesi güncellendi.', {
      sourceId: this.state.ship.id,
      value: combat.laserHeat,
    });
    this.combatEvent('LASER_HIT', nowMs, 'Lazer hedefe isabet etti.', {
      sourceId: this.state.ship.id,
      targetId: valid.target.id,
      value: CONFIG.laserDamage * (0.5 + this.state.combat.modules.WEAPON.condition / 200),
    });
    this.applyTargetDamage(
      `laser:${commandId}`,
      valid.target,
      CONFIG.laserDamage * (0.5 + this.state.combat.modules.WEAPON.condition / 200),
      nowMs,
    );
    return { ok: true as const, hit: true as const };
  }
  private missileState(
    id: string,
    sourceId: string,
    targetId: string,
    sourcePosition: Vec3,
    sourceVelocity: Vec3,
    targetPosition: Vec3,
    damage: number,
  ): MissileState {
    const direction = normalize(sub(targetPosition, sourcePosition));
    return {
      id,
      sourceId,
      targetId,
      position: [...sourcePosition],
      previousPosition: [...sourcePosition],
      velocity: add(sourceVelocity, scale(direction, CONFIG.missileLaunchSpeedMps)),
      remainingPropulsionSeconds: CONFIG.missilePropulsionSeconds,
      remainingLifetimeSeconds: CONFIG.missileLifetimeSeconds,
      damage,
      status: 'ACTIVE',
    };
  }
  fireMissile(commandId: string, nowMs: number) {
    const unique = this.combatCommand(commandId);
    if (!unique.ok) return unique;
    if (this.state.combat.playerDestroyed) return { ok: false as const, code: 'SHIP_DESTROYED' };
    if (this.state.combat.modules.WEAPON.condition < 25)
      return { ok: false as const, code: 'WEAPON_OFFLINE' };
    this.refreshCombatContacts();
    const valid = this.weaponTarget(8_000);
    if (!valid.ok) return valid;
    if (nowMs < this.state.combat.missileCooldownUntilMs)
      return { ok: false as const, code: 'MISSILE_COOLDOWN' };
    if (this.state.ship.mass.ammunitionKg < CONFIG.missileMassKg)
      return { ok: false as const, code: 'MISSILE_AMMUNITION_LOW' };
    const id = `missile-player-${++this.state.combat.sequence}`;
    this.state.ship.mass.ammunitionKg -= CONFIG.missileMassKg;
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.state.combat.missileCooldownUntilMs = nowMs + CONFIG.missileCooldownMs;
    this.state.combat.missiles.push(
      this.missileState(
        id,
        this.state.ship.id,
        valid.target.id,
        this.state.ship.position,
        this.state.ship.velocity,
        valid.target.position,
        CONFIG.missileDamage,
      ),
    );
    this.tagCombat(nowMs);
    this.combatEvent('MISSILE_LAUNCHED', nowMs, 'Güdümlü füze fırlatıldı.', {
      sourceId: this.state.ship.id,
      targetId: valid.target.id,
    });
    return { ok: true as const, missileId: id };
  }
  private launchIncomingMissile(nowMs: number, target: CombatTargetState) {
    const bot = this.state.combat.bot;
    if (bot.missileAmmunitionKg < CONFIG.missileMassKg || nowMs < bot.missileCooldownUntilMs) return;
    bot.missileAmmunitionKg -= CONFIG.missileMassKg;
    bot.missileCooldownUntilMs = nowMs + CONFIG.botMissileCooldownMs;
    this.state.combat.scriptedIncomingLaunched = true;
    const id = `missile-incoming-${++this.state.combat.sequence}`;
    this.state.combat.missiles.push(
      this.missileState(
        id,
        target.id,
        this.state.ship.id,
        target.position,
        target.velocity,
        this.state.ship.position,
        18,
      ),
    );
    this.combatEvent('MISSILE_LAUNCHED', nowMs, 'GELEN FÜZE: R-17 ateş açtı.', {
      sourceId: target.id,
      targetId: this.state.ship.id,
    });
  }
  activateCountermeasure(commandId: string, nowMs: number) {
    const unique = this.combatCommand(commandId);
    if (!unique.ok) return unique;
    if (this.state.combat.playerDestroyed) return { ok: false as const, code: 'SHIP_DESTROYED' };
    const combat = this.state.combat;
    if (nowMs < combat.countermeasureCooldownUntilMs)
      return { ok: false as const, code: 'COUNTERMEASURE_COOLDOWN' };
    if (combat.countermeasureCharges <= 0) return { ok: false as const, code: 'COUNTERMEASURE_EMPTY' };
    combat.countermeasureCharges--;
    combat.countermeasureCooldownUntilMs = nowMs + CONFIG.countermeasureCooldownMs;
    const incoming = combat.missiles
      .filter(
        (missile) =>
          missile.status === 'ACTIVE' &&
          missile.targetId === this.state.ship.id &&
          length(sub(missile.position, this.state.ship.position)) <= CONFIG.countermeasureRangeM,
      )
      .sort(
        (a, b) =>
          length(sub(a.position, this.state.ship.position)) -
          length(sub(b.position, this.state.ship.position)),
      )[0];
    if (incoming) {
      incoming.status = 'DECOYED';
      this.combatEvent('COUNTERMEASURE_SUCCESS', nowMs, 'Karşı tedbir gelen füzeyi saptırdı.', {
        targetId: incoming.id,
      });
      return { ok: true as const, success: true as const };
    }
    this.combatEvent('COUNTERMEASURE_FAILED', nowMs, 'Karşı tedbir hedef bulamadı.');
    return { ok: true as const, success: false as const };
  }
  private syncActiveShipRecord() {
    const index = this.state.hangar.ships.findIndex((ship) => ship.id === this.state.profile.activeShipId);
    if (index >= 0) this.state.hangar.ships[index] = structuredClone(this.state.ship);
  }
  private transactionAvailable(transactionId: string) {
    if (this.state.hangar.processedTransactionIds.includes(transactionId))
      return { ok: false as const, code: 'DUPLICATE_TRANSACTION' };
    return { ok: true as const };
  }
  private rememberTransaction(transactionId: string) {
    this.state.hangar.processedTransactionIds.push(transactionId);
    if (this.state.hangar.processedTransactionIds.length > 256)
      this.state.hangar.processedTransactionIds.shift();
  }
  private hangarAvailable() {
    if (this.state.combat.playerDestroyed) return { ok: false as const, code: 'SHIP_DESTROYED' };
    if (this.state.profile.activeMissionId) return { ok: false as const, code: 'MISSION_ACTIVE' };
    if (
      this.state.maneuver &&
      ['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(this.state.maneuver.status)
    )
      return { ok: false as const, code: 'MANEUVER_ACTIVE' };
    const altitudeM = length(this.state.ship.position) - CONFIG.earthRadius;
    if (![400_000, 450_000, 800_000].some((value) => Math.abs(value - altitudeM) <= 25_000))
      return { ok: false as const, code: 'SERVICE_UNAVAILABLE' };
    return { ok: true as const };
  }
  private charge(cost: number) {
    if (!Number.isInteger(cost) || cost < 0) return { ok: false as const, code: 'INVALID_PRICE' };
    if (this.state.profile.credits < cost) return { ok: false as const, code: 'INSUFFICIENT_CREDITS' };
    this.state.profile.credits -= cost;
    return { ok: true as const };
  }
  selectShip(targetShipId: string, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    if (!this.state.profile.ownedShipIds.includes(targetShipId))
      return { ok: false as const, code: 'SHIP_NOT_OWNED' };
    if (targetShipId === this.state.profile.activeShipId)
      return { ok: false as const, code: 'SHIP_ALREADY_ACTIVE' };
    const target = this.state.hangar.ships.find((ship) => ship.id === targetShipId);
    if (!target) return { ok: false as const, code: 'UNKNOWN_SHIP' };
    const dockState = {
      position: [...this.state.ship.position] as Vec3,
      velocity: [...this.state.ship.velocity] as Vec3,
      orientation: [...this.state.ship.orientation] as [number, number, number, number],
    };
    this.syncActiveShipRecord();
    this.state.ship = structuredClone(target);
    this.state.ship.position = dockState.position;
    this.state.ship.velocity = dockState.velocity;
    this.state.ship.orientation = dockState.orientation;
    this.state.ship.angularVelocity = [0, 0, 0];
    this.state.profile.activeShipId = targetShipId;
    this.state.controls = neutralControls();
    this.state.maneuver = undefined;
    this.resetDamageState();
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost: 0 };
  }
  buyFuel(amountKg: number, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    if (!Number.isFinite(amountKg) || amountKg <= 0) return { ok: false as const, code: 'INVALID_AMOUNT' };
    if (
      this.state.ship.mass.propellantKg + amountKg >
      this.state.ship.performance.propellantCapacityKg + 1e-9
    )
      return { ok: false as const, code: 'FUEL_OVERFILL' };
    const cost = Math.ceil(amountKg * CONFIG.fuelCreditsPerKg),
      charged = this.charge(cost);
    if (!charged.ok) return charged;
    this.state.ship.mass.propellantKg += amountKg;
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost };
  }
  repairShip(transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    const moduleMissing = Object.values(this.state.combat.modules).reduce(
        (sum, module) => sum + (100 - module.condition),
        0,
      ) / 4,
      missing = Math.max(100 - this.state.ship.conditionPercent, moduleMissing);
    if (missing <= 1e-9) return { ok: false as const, code: 'NO_REPAIR_NEEDED' };
    const cost = Math.ceil(missing * CONFIG.repairCreditsPerPercent),
      charged = this.charge(cost);
    if (!charged.ok) return charged;
    this.state.ship.conditionPercent = 100;
    this.state.combat.playerHull = 100;
    this.resetDamageState();
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost };
  }
  private resetDamageState() {
    this.state.combat.playerDestroyed = false;
    for (const module of Object.values(this.state.combat.modules)) module.condition = 100;
    this.updateDamageConsequences();
  }
  claimReplacement(transactionId: string, nowMs: number) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const recovery = this.state.combat.recovery;
    if (!recovery || recovery.status !== 'PENDING')
      return { ok: false as const, code: 'NO_RECOVERY_PENDING' };
    const sameShipAffordable = this.state.profile.credits >= recovery.deductibleCredits,
      definitionId =
        recovery.lostDefinitionId === 'RAPTOR_COMBAT' && !sameShipAffordable
          ? ('KESTREL_LOGISTICS' as const)
          : (recovery.lostDefinitionId as 'KESTREL_LOGISTICS' | 'RAPTOR_COMBAT'),
      cost = definitionId === recovery.lostDefinitionId ? recovery.deductibleCredits : 0,
      charged = this.charge(cost);
    if (!charged.ok) return charged;
    const definition = shipDefinition(definitionId),
      performance = shipPerformance(definitionId, []),
      replacementId = `${definitionId === 'RAPTOR_COMBAT' ? 'raptor' : 'kestrel'}-replacement-${++this.state.combat.sequence}`,
      replacement = {
        id: replacementId,
        definitionId,
        position: [...this.state.ship.position] as Vec3,
        velocity: [...this.state.ship.velocity] as Vec3,
        orientation: [...this.state.ship.orientation] as [number, number, number, number],
        angularVelocity: [0, 0, 0] as Vec3,
        massKg: 0,
        mass: {
          dryKg: performance.dryMassKg,
          modulesKg: 0,
          cargoKg: 0,
          ammunitionKg: 0,
          propellantKg: definition.initialPropellantKg,
        },
        performance,
        conditionPercent: 100,
        installedUpgradeIds: [],
      };
    replacement.massKg = totalMassKg(replacement.mass);
    this.state.ship = replacement;
    this.state.hangar.ships.push(structuredClone(replacement));
    this.state.profile.ownedShipIds.push(replacementId);
    this.state.profile.activeShipId = replacementId;
    recovery.status = 'CLAIMED';
    recovery.transactionId = transactionId;
    recovery.replacementShipId = replacementId;
    this.state.combat.playerHull = 100;
    this.state.combat.laserEnergy = 100;
    this.state.combat.laserHeat = 0;
    this.state.combat.countermeasureCharges = CONFIG.countermeasureCharges;
    this.resetDamageState();
    this.rememberTransaction(transactionId);
    this.combatEvent('RECOVERY_COMPLETED', nowMs, `${replacementId} sigorta kapsamında teslim edildi.`, {
      targetId: replacementId,
      value: cost,
    });
    this.syncActiveShipRecord();
    return { ok: true as const, cost, replacementShipId: replacementId };
  }
  buyAmmunition(amountKg: number, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    const capacity = this.state.ship.performance.ammunitionCapacityKg;
    if (capacity <= 0) return { ok: false as const, code: 'AMMUNITION_INCOMPATIBLE' };
    if (!Number.isFinite(amountKg) || amountKg <= 0) return { ok: false as const, code: 'INVALID_AMOUNT' };
    if (this.state.ship.mass.ammunitionKg + amountKg > capacity + 1e-9)
      return { ok: false as const, code: 'AMMUNITION_OVERFILL' };
    const cost = Math.ceil(amountKg * CONFIG.ammunitionCreditsPerKg),
      charged = this.charge(cost);
    if (!charged.ok) return charged;
    this.state.ship.mass.ammunitionKg += amountKg;
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost };
  }
  installUpgrade(upgradeId: string, transactionId: string) {
    const unique = this.transactionAvailable(transactionId);
    if (!unique.ok) return unique;
    const allowed = this.hangarAvailable();
    if (!allowed.ok) return allowed;
    const upgrade = UPGRADE_DEFINITIONS.find((item) => item.id === upgradeId);
    if (!upgrade) return { ok: false as const, code: 'UNKNOWN_UPGRADE' };
    if (this.state.ship.installedUpgradeIds.includes(upgradeId))
      return { ok: false as const, code: 'UPGRADE_ALREADY_INSTALLED' };
    if (!upgrade.compatibleShips.includes(this.state.ship.definitionId))
      return { ok: false as const, code: 'UPGRADE_INCOMPATIBLE' };
    const usedSlots = this.state.ship.installedUpgradeIds.filter(
      (id) => UPGRADE_DEFINITIONS.find((item) => item.id === id)?.slot === upgrade.slot,
    ).length;
    if (usedSlots >= this.state.ship.performance.slots[upgrade.slot])
      return { ok: false as const, code: 'UPGRADE_SLOT_FULL' };
    const charged = this.charge(upgrade.priceCredits);
    if (!charged.ok) return charged;
    this.state.ship.installedUpgradeIds.push(upgrade.id);
    this.state.ship.mass.modulesKg += upgrade.moduleMassKg;
    this.state.ship.performance = shipPerformance(
      this.state.ship.definitionId,
      this.state.ship.installedUpgradeIds,
    );
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    this.rememberTransaction(transactionId);
    return { ok: true as const, cost: upgrade.priceCredits };
  }
  chooseFaction(factionId: FactionId) {
    if (this.state.profile.factionId && this.state.profile.factionId !== factionId)
      return { ok: false as const, code: 'FACTION_LOCKED' };
    this.state.profile.factionId = factionId;
    return { ok: true as const };
  }
  setMissionOffers(missions: MissionInstance[]) {
    if (!this.state.profile.factionId) return { ok: false as const, code: 'FACTION_REQUIRED' };
    if (this.state.profile.activeMissionId) return { ok: false as const, code: 'MISSION_ACTIVE' };
    const historical = this.state.missions.filter((mission) =>
      ['COMPLETED', 'FAILED'].includes(mission.status),
    );
    this.state.missions = [
      ...historical,
      ...missions.filter((offer) => !historical.some((mission) => mission.id === offer.id)),
    ];
    return { ok: true as const };
  }
  acceptMission(missionId: string, nowMs: number) {
    if (!this.state.profile.factionId) return { ok: false as const, code: 'FACTION_REQUIRED' };
    if (this.state.profile.activeMissionId) return { ok: false as const, code: 'MISSION_ACTIVE' };
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'AVAILABLE') return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (!mission.reachable) return { ok: false as const, code: 'MISSION_UNREACHABLE' };
    if (mission.factionId !== this.state.profile.factionId)
      return { ok: false as const, code: 'MISSION_AFFILIATION' };
    if (
      mission.cargo &&
      this.state.ship.mass.cargoKg + mission.cargo.massKg > this.state.ship.performance.cargoCapacityKg
    )
      return { ok: false as const, code: 'CARGO_CAPACITY' };
    mission.status = 'ACCEPTED';
    mission.acceptedAtMs = nowMs;
    this.state.profile.activeMissionId = mission.id;
    if (mission.cargo) {
      this.state.ship.mass.cargoKg += mission.cargo.massKg;
      this.state.ship.massKg = totalMassKg(this.state.ship.mass);
      this.syncActiveShipRecord();
    }
    return { ok: true as const };
  }
  private atDestination(mission: MissionInstance) {
    return (
      Math.abs(
        length(this.state.ship.position) - (CONFIG.earthRadius + mission.destination.altitudeKm * 1000),
      ) <= mission.destination.toleranceM
    );
  }
  private completeMission(mission: MissionInstance, nowMs: number) {
    if (mission.status !== 'ACTIVE') return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    mission.status = 'COMPLETED';
    mission.completedAtMs = nowMs;
    this.state.profile.credits += mission.reward.credits;
    this.state.profile.reputation += mission.reward.reputation;
    this.state.profile.activeMissionId = undefined;
    return { ok: true as const };
  }
  deliverCargo(missionId: string, cargoId: string, destinationId: string, nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'ACTIVE') return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.type !== 'CARGO' || !mission.cargo) return { ok: false as const, code: 'INVALID_CARGO' };
    if (mission.cargo.id !== cargoId || mission.cargo.delivered)
      return { ok: false as const, code: 'INVALID_CARGO' };
    if (mission.destination.id !== destinationId) return { ok: false as const, code: 'WRONG_DESTINATION' };
    if (!this.atDestination(mission)) return { ok: false as const, code: 'NOT_AT_DESTINATION' };
    mission.cargo.delivered = true;
    this.state.ship.mass.cargoKg = Math.max(0, this.state.ship.mass.cargoKg - mission.cargo.massKg);
    this.state.ship.massKg = totalMassKg(this.state.ship.mass);
    this.syncActiveShipRecord();
    return this.completeMission(mission, nowMs);
  }
  startScan(missionId: string, destinationId: string) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'ACTIVE' || mission.type !== 'RECONNAISSANCE' || !mission.recon)
      return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.destination.id !== destinationId) return { ok: false as const, code: 'WRONG_DESTINATION' };
    if (!this.atDestination(mission)) return { ok: false as const, code: 'SCAN_UNAVAILABLE' };
    mission.recon.scanning = true;
    return { ok: true as const };
  }
  identifyTarget(missionId: string, destinationId: string, nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) return { ok: false as const, code: 'UNKNOWN_MISSION' };
    if (mission.status !== 'ACTIVE' || mission.type !== 'INTERCEPT' || !mission.intercept)
      return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.destination.id !== destinationId) return { ok: false as const, code: 'WRONG_DESTINATION' };
    if (!this.atDestination(mission)) return { ok: false as const, code: 'IDENTIFY_UNAVAILABLE' };
    if (mission.intercept.identified) return { ok: false as const, code: 'TARGET_ALREADY_IDENTIFIED' };
    mission.intercept.identified = true;
    mission.intercept.combatAuthorized = true;
    const target = this.state.combat.contacts.find((item) => item.id === mission.intercept!.targetId);
    if (!target) return { ok: false as const, code: 'UNKNOWN_TARGET' };
    target.eligible = true;
    this.combatEvent('COMBAT_PERMISSION_GRANTED', nowMs, 'Görev ateş yetkisi verildi.', {
      targetId: target.id,
    });
    this.launchIncomingMissile(nowMs, target);
    this.refreshCombatContacts();
    return { ok: true as const };
  }
  abandonMission(missionId: string, nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission || !['ACCEPTED', 'ACTIVE'].includes(mission.status))
      return { ok: false as const, code: 'INVALID_MISSION_STATE' };
    if (mission.cargo && !mission.cargo.delivered) {
      this.state.ship.mass.cargoKg = Math.max(0, this.state.ship.mass.cargoKg - mission.cargo.massKg);
      this.state.ship.massKg = totalMassKg(this.state.ship.mass);
      this.syncActiveShipRecord();
    }
    mission.status = 'FAILED';
    mission.failedAtMs = nowMs;
    this.state.profile.activeMissionId = undefined;
    return { ok: true as const };
  }
  private advanceMission(nowMs: number) {
    const mission = this.state.missions.find((item) => item.id === this.state.profile.activeMissionId);
    if (!mission) return;
    if (mission.status === 'ACCEPTED') mission.status = 'ACTIVE';
    if (mission.status !== 'ACTIVE' || mission.type !== 'RECONNAISSANCE' || !mission.recon?.scanning) return;
    if (!this.atDestination(mission)) {
      mission.recon.scanning = false;
      mission.recon.progressSeconds = 0;
      return;
    }
    mission.recon.progressSeconds = Math.min(
      mission.recon.requiredSeconds,
      mission.recon.progressSeconds + CONFIG.fixedDt / this.state.ship.performance.sensorScanTimeMultiplier,
    );
    if (mission.recon.progressSeconds >= mission.recon.requiredSeconds) this.completeMission(mission, nowMs);
  }
  private advanceCombat(nowMs: number) {
    const combat = this.state.combat,
      dt = CONFIG.fixedDt;
    combat.serverNowMs = nowMs;
    const powerScale = Math.max(0.2, combat.modules.POWER.condition / 100),
      energyCap = 25 + 0.75 * combat.modules.POWER.condition;
    combat.laserEnergy = Math.min(
      energyCap,
      combat.laserEnergy + CONFIG.laserEnergyRechargePerSecond * powerScale * dt,
    );
    combat.laserHeat = Math.max(0, combat.laserHeat - CONFIG.laserHeatDissipationPerSecond * dt);
    this.advanceBot(nowMs);
    for (const contact of combat.contacts) {
      const motion = integrate(contact.position, contact.velocity, [0, 0, 0], dt);
      contact.position = motion.position;
      contact.velocity = motion.velocity;
    }
    this.refreshCombatContacts();
    for (let index = 0; index < combat.missiles.length; index++) {
      const missile = combat.missiles[index];
      if (missile.status !== 'ACTIVE') continue;
      const target =
        missile.targetId === this.state.ship.id
          ? { position: this.state.ship.position, radiusM: 12 }
          : combat.contacts.find((item) => item.id === missile.targetId);
      if (!target) {
        missile.status = 'EXPIRED';
        this.combatEvent('MISSILE_EXPIRED', nowMs, 'Füze hedef referansını kaybetti.', {
          targetId: missile.id,
        });
        continue;
      }
      const advanced = stepGuidedMissile(missile, target.position, dt);
      combat.missiles[index] = advanced;
      if (advanced.status === 'EXPIRED') {
        this.combatEvent('MISSILE_EXPIRED', nowMs, 'Füze ömrünü tamamladı.', { targetId: advanced.id });
        continue;
      }
      if (
        !segmentSphereHit(
          advanced.previousPosition,
          advanced.position,
          target.position,
          target.radiusM + CONFIG.missileFuseRadiusM,
        )
      )
        continue;
      advanced.status = 'HIT';
      this.combatEvent('MISSILE_HIT', nowMs, 'Füze hedefe isabet etti.', {
        sourceId: advanced.sourceId,
        targetId: advanced.targetId,
        value: advanced.damage,
      });
      if (advanced.targetId === this.state.ship.id)
        this.receivePlayerDamage(`missile:${advanced.id}`, advanced.damage, nowMs);
      else {
        const contact = combat.contacts.find((item) => item.id === advanced.targetId);
        if (contact) this.applyTargetDamage(`missile:${advanced.id}`, contact, advanced.damage, nowMs);
      }
    }
    if (combat.missiles.length > 48)
      combat.missiles = combat.missiles.filter((missile) => missile.status === 'ACTIVE').slice(-48);
  }
  private advanceBot(nowMs: number) {
    const combat = this.state.combat,
      bot = combat.bot,
      target = combat.contacts[0];
    if (!target || target.destroyed) {
      bot.mode = 'DESTROYED';
      return;
    }
    if (combat.playerDestroyed) return;
    const allowed = target.engagementAllowed || combat.region === 'CONTESTED';
    if (!allowed) {
      bot.mode = 'PATROL';
      return;
    }
    bot.laserEnergy = Math.min(100, bot.laserEnergy + 14 * CONFIG.fixedDt);
    if (nowMs >= bot.nextDecisionAtMs) {
      bot.mode = bot.mode === 'ATTACK' ? 'REPOSITION' : 'ATTACK';
      bot.nextDecisionAtMs = nowMs + (bot.mode === 'ATTACK' ? 2800 : 900);
    }
    if (bot.mode === 'REPOSITION') {
      target.velocity[1] = this.state.ship.velocity[1] + Math.sin(nowMs / 1000) * 2;
      return;
    }
    if (bot.mode !== 'ATTACK' || target.rangeM > CONFIG.laserRangeM) return;
    if (nowMs >= bot.missileCooldownUntilMs) this.launchIncomingMissile(nowMs, target);
    if (nowMs >= bot.laserCooldownUntilMs && bot.laserEnergy >= CONFIG.laserEnergyCost) {
      bot.laserEnergy -= CONFIG.laserEnergyCost;
      bot.laserCooldownUntilMs = nowMs + CONFIG.botLaserCooldownMs;
      this.combatEvent('LASER_FIRED', nowMs, 'R-17 lazer ateşi açtı.', {
        sourceId: target.id,
        targetId: this.state.ship.id,
      });
      this.combatEvent('LASER_HIT', nowMs, 'R-17 lazeri araca isabet etti.', {
        sourceId: target.id,
        targetId: this.state.ship.id,
        value: CONFIG.botLaserDamage,
      });
      this.receivePlayerDamage(`bot-laser:${++combat.sequence}`, CONFIG.botLaserDamage, nowMs);
    }
  }
  reset(scene: SceneId, paused = false, seed = 4401) {
    this.state = initialWorld(scene, seed);
    this.paused = paused;
    this.lastInputAt = 0;
    this.repository.write(this.state);
    this.refreshCombatContacts();
  }
  startManeuver(planId: string, candidate: ManeuverCandidate, nowMs: number) {
    if (this.state.combat.playerDestroyed) return { ok: false as const, code: 'SHIP_DESTROYED' };
    if (
      this.state.maneuver &&
      ['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(this.state.maneuver.status)
    )
      return { ok: false as const, code: 'MANEUVER_ACTIVE' };
    if (
      candidate.estimatedDeltaVMps >
      availableDeltaV(this.state.ship.mass, this.state.ship.performance.specificImpulseSeconds) + 1e-6
    )
      return { ok: false as const, code: 'INSUFFICIENT_DELTA_V' };
    const firstBurn = candidate.burns[0];
    if (!firstBurn) return { ok: false as const, code: 'INVALID_PLAN' };
    const executionId = `${planId}:${candidate.type}`,
      waiting = firstBurn.offsetSeconds > 0.05,
      maneuver: ManeuverExecutionState = {
        executionId,
        planId,
        candidate,
        status: waiting ? 'COASTING' : 'EXECUTING_BURN',
        startedAtMs: nowMs,
        updatedAtMs: nowMs,
        nextEventAtMs: waiting ? nowMs + firstBurn.offsetSeconds * 1000 : undefined,
        activeBurnIndex: waiting ? undefined : 0,
        burnElapsedSeconds: 0,
        coastAnchor: waiting
          ? {
              atMs: nowMs,
              state: { position: [...this.state.ship.position], velocity: [...this.state.ship.velocity] },
              mass: { ...this.state.ship.mass },
            }
          : undefined,
      };
    this.state.controls = neutralControls();
    this.state.maneuver = maneuver;
    return { ok: true as const, executionId };
  }
  cancelManeuver(executionId: string, nowMs: number) {
    const maneuver = this.state.maneuver;
    if (!maneuver || maneuver.executionId !== executionId)
      return { ok: false as const, code: 'UNKNOWN_EXECUTION' };
    if (!['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(maneuver.status))
      return { ok: false as const, code: 'MANEUVER_NOT_ACTIVE' };
    if (maneuver.status === 'COASTING') this.advanceCoast(nowMs);
    this.state.controls = neutralControls();
    maneuver.status = 'CANCELLED';
    maneuver.updatedAtMs = nowMs;
    maneuver.completedAtMs = nowMs;
    maneuver.nextEventAtMs = undefined;
    maneuver.coastAnchor = undefined;
    return { ok: true as const, executionId };
  }
  private advanceCoast(nowMs: number) {
    const maneuver = this.state.maneuver,
      anchor = maneuver?.coastAnchor;
    if (!maneuver || !anchor) return;
    const sampleAt = Math.min(nowMs, maneuver.nextEventAtMs ?? nowMs),
      propagated = propagateKepler(anchor.state, Math.max(0, (sampleAt - anchor.atMs) / 1000));
    this.state.ship.position = propagated.position;
    this.state.ship.velocity = propagated.velocity;
    this.state.ship.mass = { ...anchor.mass };
    this.state.ship.massKg = totalMassKg(anchor.mass);
    maneuver.updatedAtMs = sampleAt;
  }
  private beginBurn(index: number, nowMs: number) {
    const maneuver = this.state.maneuver;
    if (!maneuver) return;
    maneuver.activeBurnIndex = index;
    maneuver.burnElapsedSeconds = 0;
    maneuver.status = index === 0 ? 'EXECUTING_BURN' : 'ARRIVAL_BURN';
    maneuver.updatedAtMs = nowMs;
    maneuver.nextEventAtMs = undefined;
    maneuver.coastAnchor = undefined;
  }
  private burnDirection(candidate: ManeuverCandidate, burnIndex: number): Vec3 {
    const burn = candidate.burns[burnIndex],
      ship = this.state.ship,
      normal = normalize(cross(ship.position, ship.velocity)),
      prograde = normalize(cross(normal, ship.position));
    if (burn.steering === 'PROGRADE') return prograde;
    if (burn.steering === 'RETROGRADE') return scale(prograde, -1);
    const targetRadius = length(candidate.expectedFinalState.position),
      desired = scale(prograde, Math.sqrt(CONFIG.earthMu / targetRadius));
    return normalize(sub(desired, ship.velocity));
  }
  private advanceManeuver(nowMs: number) {
    const maneuver = this.state.maneuver;
    if (!maneuver) return false;
    if (maneuver.status === 'COASTING') {
      this.advanceCoast(nowMs);
      if (nowMs >= (maneuver.nextEventAtMs ?? Infinity)) {
        const nextIndex = maneuver.activeBurnIndex === 0 ? 1 : 0;
        this.beginBurn(nextIndex, nowMs);
      }
      return true;
    }
    if (!['EXECUTING_BURN', 'ARRIVAL_BURN'].includes(maneuver.status)) return false;
    const burnIndex = maneuver.activeBurnIndex ?? 0,
      burn = maneuver.candidate.burns[burnIndex];
    if (!burn) {
      maneuver.status = 'FAILED';
      maneuver.failureReason = 'MISSING_BURN';
      maneuver.completedAtMs = nowMs;
      return true;
    }
    this.state.ship.orientation = orientationForBodyMinusZ(this.burnDirection(maneuver.candidate, burnIndex));
    this.state.ship.angularVelocity = [0, 0, 0];
    this.state.controls = { translation: [0, 0, -1], rotation: [0, 0, 0] };
    this.state = step(this.state);
    const active = this.state.maneuver!;
    active.burnElapsedSeconds += CONFIG.fixedDt;
    active.updatedAtMs = nowMs;
    if (active.burnElapsedSeconds + 1e-9 < burn.durationSeconds) return true;
    this.state.controls = neutralControls();
    if (burnIndex + 1 < active.candidate.burns.length) {
      active.status = 'COASTING';
      active.activeBurnIndex = burnIndex;
      active.burnElapsedSeconds = 0;
      active.coastAnchor = {
        atMs: nowMs,
        state: { position: [...this.state.ship.position], velocity: [...this.state.ship.velocity] },
        mass: { ...this.state.ship.mass },
      };
      active.nextEventAtMs = active.startedAtMs + active.candidate.burns[burnIndex + 1].offsetSeconds * 1000;
    } else {
      active.status = 'COMPLETE';
      active.completedAtMs = nowMs;
      active.nextEventAtMs = undefined;
      active.coastAnchor = undefined;
    }
    return true;
  }
  tick(now: number, nowMs = Date.now()) {
    if (this.paused) return;
    const start = performance.now();
    if (!this.state.combat.playerDestroyed && !this.advanceManeuver(nowMs)) {
      if (now - this.lastInputAt > CONFIG.inputTimeoutMs) this.state.controls = neutralControls();
      this.state = step(this.state);
    } else if (this.state.combat.playerDestroyed) {
      this.state.controls = neutralControls();
    }
    this.advanceMission(nowMs);
    this.advanceCombat(nowMs);
    this.syncActiveShipRecord();
    this.times.push(performance.now() - start);
    if (this.times.length > 3600) this.times.shift();
    if (this.state.tick % 60 === 0) this.repository.write(this.state);
  }
  metrics(backlogMs = 0): ServerMetrics {
    const a = [...this.times].sort((x, y) => x - y),
      p = (n: number) => a[Math.min(a.length - 1, Math.floor(a.length * n))] ?? 0;
    return {
      tickMs: this.times.at(-1) ?? 0,
      tickP95Ms: p(0.95),
      tickP99Ms: p(0.99),
      backlogMs,
      rejectedCommands: this.rejectedCommands,
    };
  }
}
