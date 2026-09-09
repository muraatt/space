import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG, type MissionInstance } from '@orbital/shared';
import { generateManeuverPlan, length, sub } from '@orbital/simulation';
import { FileIdentityRepository } from './identity/file-identity-repository';
import { SharedSandbox, DISCONNECT_GRACE_MS } from './shared-sandbox';
import { RegistrationLimiter, registrationSource } from './net/registration-limiter';
import { World } from './world';

describe('canonical pass 2 runtime and value invariants', () => {
  const directories: string[] = [];
  afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
  async function setup(clock = () => CONFIG.epochMs) {
    const directory = await mkdtemp(join(tmpdir(), 'orbital-pass2-runtime-')); directories.push(directory);
    const repository = new FileIdentityRepository(join(directory, 'identity.json'));
    return { repository, sandbox: new SharedSandbox(repository, () => {}, clock) };
  }
  it('CAN-022: slots 0..40 are coplanar and produce viable AEGIS candidates', async () => {
    const { sandbox } = await setup();
    for (let slot = 0; slot <= 40; slot++) {
      const pilot = await sandbox.register(`SPAWN_${slot}`, `credential-${slot}`), world = pilot.runtime.world;
      const plan = generateManeuverPlan(world.state.ship, world.stationManeuverTarget(world.state.station.id)!);
      expect(world.state.ship.position[1], `slot ${slot}`).toBe(0);
      expect(plan.candidates.length, `slot ${slot}: ${JSON.stringify(plan)}`).toBeGreaterThan(0);
    }
  }, 30_000);
  it('CAN-009: delayed join, offline freeze and rebuilt authority use the same station epoch', async () => {
    let now = CONFIG.epochMs;
    const { sandbox, repository } = await setup(() => now), a = await sandbox.register('EPOCH_A', 'a');
    sandbox.connect(a.runtime);
    for (let i = 0; i < 1800; i++) { now += CONFIG.fixedDt * 1000; sandbox.tick(i); }
    const b = await sandbox.register('EPOCH_B', 'b'); sandbox.connect(b.runtime); sandbox.prepareSnapshots();
    expect(a.runtime.world.state.station).toEqual(b.runtime.world.state.station);
    expect(length(sub(a.runtime.world.state.station.position, b.runtime.world.state.station.position))).toBe(0);
    sandbox.disconnect(a.runtime); now += 30_000; sandbox.tick(2000); sandbox.prepareSnapshots();
    await sandbox.flush();
    const resumed = (await new SharedSandbox(repository, undefined, () => now).resume('a'))!;
    expect(resumed.runtime.world.state.station.position).toEqual(b.runtime.world.state.station.position);
  });
  it('CAN-021/025: snapshots copy connected pilots only; eviction waits for durability and resumes safely', async () => {
    let now = CONFIG.epochMs;
    const { sandbox, repository } = await setup(() => now), all = [];
    for (let i = 0; i < 50; i++) all.push(await sandbox.register(`HISTORY_${i}`, `key-${i}`));
    const [a, b] = all; sandbox.connect(a.runtime); sandbox.connect(b.runtime);
    sandbox.prepareSnapshots();
    expect(a.runtime.world.state.remotePlayers).toHaveLength(1);
    expect(b.runtime.world.state.remotePlayers).toHaveLength(1);
    expect(all.slice(2).every(pilot => pilot.runtime.world.state.remotePlayers.length === 0)).toBe(true);
    now += DISCONNECT_GRACE_MS - 1; await sandbox.evictInactive(); expect(sandbox.runtimeCount()).toBe(50);
    const save = vi.spyOn(repository, 'saveShip'); save.mockRejectedValueOnce(new Error('unavailable'));
    now++; await sandbox.evictInactive(); expect(sandbox.runtimeCount()).toBe(3);
    await sandbox.evictInactive(); expect(sandbox.runtimeCount()).toBe(2);
    expect((await sandbox.resume('key-49'))!.runtime.world.state.ship.id).toBe(all[49].record.shipId);
    sandbox.disconnect(b.runtime); sandbox.prepareSnapshots();
    expect(a.runtime.world.state.remotePlayers).toHaveLength(0);
    await sandbox.flush();
  });
  it('CAN-021: limits peer attempts and bounded source table, then permits cooldown retry', () => {
    let now = 0; const limiter = new RegistrationLimiter(() => now);
    for (let i = 0; i < 10; i++) expect(limiter.allow('peer')).toBe(true);
    expect(limiter.allow('peer')).toBe(false);
    for (let i = 0; i < 1023; i++) expect(limiter.allow(`peer-${i}`)).toBe(true);
    expect(limiter.allow('new-peer')).toBe(false);
    now = 600_000; expect(limiter.allow('peer')).toBe(true);
    process.env.TRUST_PROXY = '';
    expect(registrationSource('10.0.0.1', '203.0.113.8')).toBe('10.0.0.1');
    process.env.TRUST_PROXY = '1';
    expect(registrationSource('10.0.0.1', '203.0.113.8, 10.0.0.2')).toBe('203.0.113.8');
    delete process.env.TRUST_PROXY;
  });
  it('CAN-023: low-fuel Kestrel self-destruction cannot mint propellant or ammunition', () => {
    const world = new World(); world.reset('low_fuel');
    const fuel = world.state.ship.mass.propellantKg, credits = world.state.profile.credits;
    world.receivePlayerDamage('fatal', 1000, 1);
    expect(world.claimReplacement('insurance', 2).ok).toBe(true);
    expect(world.state.ship.definitionId).toBe('KESTREL_LOGISTICS');
    expect(world.state.ship.mass.propellantKg).toBeLessThanOrEqual(fuel);
    expect(world.state.ship.mass.ammunitionKg).toBe(0);
    expect(world.state.profile.credits).toBeLessThanOrEqual(credits);
  });
  it.each(['CARGO', 'RECONNAISSANCE', 'INTERCEPT', 'BOUNTY'] as const)('CAN-005/006: %s failure never rewards or exhausts its template across repeated attempts', type => {
    const world = new World(); world.reset('bounty_sandbox'); world.chooseFaction('AURORA');
    const base: MissionInstance = { id: `base-${type}`, type, title: type, briefing: '', factionId: 'AURORA', status: 'AVAILABLE',
      destination: { id: 'destination', name: 'destination', altitudeKm: 450, toleranceM: 1000,
        target: { kind: 'NEAR_RENDEZVOUS_STATE', state: { position: world.state.station.position, velocity: world.state.station.velocity } } },
      reward: { credits: 100, reputation: 1 }, estimatedEtaSeconds: 1, difficulty: 'BAŞLANGIÇ', reachable: true,
      cargo: type === 'CARGO' ? { id: 'cargo', name: 'cargo', massKg: 1, delivered: false } : undefined,
      recon: type === 'RECONNAISSANCE' ? { requiredSeconds: 1, progressSeconds: 0, scanning: false } : undefined,
      bounty: type === 'BOUNTY' ? { targetId: 'bounty-target-scout-01', targetLabel: 'Scout', targetClass: 'SCOUT', threat: 'LOW',
        acquired: false, neutralized: false, rewardIssued: false, estimatedDeltaVMps: 1, estimatedPropellantKg: 1 } : undefined };
    const attempts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      world.state.docking.phase = 'DOCKED'; world.state.docking.selectedStationId = world.state.station.id;
      expect(world.setMissionOffers([structuredClone(base)]).ok).toBe(true);
      const offer = world.state.missions.find(m => m.status === 'AVAILABLE')!;
      expect(offer.templateId).toBe(base.id); expect(attempts.has(offer.id)).toBe(false); attempts.add(offer.id);
      expect(world.acceptMission(offer.id, i).ok).toBe(true);
      const before = world.state.profile.credits;
      world.receivePlayerDamage(`fatal-${i}`, 1000, i);
      expect(offer.status).toBe('FAILED'); expect(world.state.profile.activeMissionId).toBeUndefined();
      expect(world.deliverCargo(offer.id, 'cargo', 'destination', i).ok).toBe(false);
      expect(world.startScan(offer.id, 'destination').ok).toBe(false);
      expect(world.state.profile.credits).toBe(before);
      expect(world.claimReplacement(`recover-${i}`, i).ok).toBe(true);
      expect(world.state.missions.length).toBeLessThanOrEqual(33);
    }
  });
});
