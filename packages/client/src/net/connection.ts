import {
  CONFIG,
  type Controls,
  type ManeuverCandidateType,
  type ManeuverPlanResult,
  type ManeuverTarget,
  type Snapshot,
  type ServerMessage,
} from '@orbital/shared';
export class Connection {
  socket?: WebSocket;
  snapshot?: Snapshot;
  status = 'Bağlanıyor';
  rttMs = 0;
  receivedAt = 0;
  lastError = '';
  bytesIn = 0;
  bytesOut = 0;
  seq = 0;
  planId = '';
  plan?: ManeuverPlanResult;
  planPending = false;
  lastManeuverAck = '';
  lastMissionAck = '';
  lastEconomyAck = '';
  lastCombatAck = '';
  missionPending = false;
  maneuverCommandActive = false;
  private requestSequence = 0;
  private pingTimer?: ReturnType<typeof setInterval>;
  private disposed = false;
  connect(scene: string, resume = false) {
    clearInterval(this.pingTimer);
    this.socket?.close();
    this.status = 'Bağlanıyor';
    this.lastError = '';
    this.planPending = false;
    this.missionPending = false;
    this.maneuverCommandActive = false;
    this.plan = undefined;
    this.snapshot = undefined;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/socket?scene=${encodeURIComponent(scene)}${resume ? '&resume=1' : ''}`);
    this.socket = ws;
    ws.onopen = () => {
      if (this.socket !== ws || this.disposed) return;
      this.status = 'Bağlı';
      this.pingTimer = setInterval(() => this.send({ type: 'ping', sentAt: performance.now() }), 1000);
    };
    ws.onmessage = (event) => {
      if (this.socket !== ws || this.disposed) return;
      this.bytesIn += event.data.length;
      const data = JSON.parse(event.data) as ServerMessage;
      if (data.type === 'snapshot') {
        this.snapshot = data;
        this.receivedAt = performance.now();
        this.seq = Math.max(this.seq, data.state.lastInputSeq + 1);
        const maneuverStatus = data.state.maneuver?.status;
        if (maneuverStatus && ['COMPLETE', 'CANCELLED', 'FAILED'].includes(maneuverStatus))
          this.maneuverCommandActive = false;
      }
      if (data.type === 'pong') this.rttMs = Math.max(0, performance.now() - data.sentAt);
      if (data.type === 'maneuver_plan' && data.requestId === this.planId) {
        this.plan = data.result;
        this.planPending = false;
      }
      if (data.type === 'maneuver_ack') this.lastManeuverAck = `${data.action}:${data.executionId}`;
      if (data.type === 'mission_ack') {
        this.lastMissionAck = `${data.action}:${data.missionId ?? ''}`;
        this.missionPending = false;
      }
      if (data.type === 'economy_ack') this.lastEconomyAck = `${data.action}:${data.transactionId}`;
      if (data.type === 'combat_ack') this.lastCombatAck = `${data.action}:${data.commandId}`;
      if (data.type === 'error') {
        this.lastError = data.code;
        this.planPending = false;
        this.missionPending = false;
        // Only the optimistic request lock is released. An accepted maneuver
        // remains locked by its authoritative snapshot phase below.
        this.maneuverCommandActive = false;
      }
    };
    ws.onclose = (event) => {
      if (this.socket !== ws) return;
      this.status = this.disposed
        ? 'Kapalı'
        : event.code === 4001
          ? 'Kumanda başka sekmede'
          : 'Bağlantı kesildi';
      this.lastError = this.status;
      clearInterval(this.pingTimer);
      this.planPending = false;
      this.missionPending = false;
      this.maneuverCommandActive = false;
    };
    ws.onerror = () => {
      if (this.socket !== ws) return;
      this.status = 'Sunucuya erişilemiyor';
    };
  }
  send(value: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify(value);
      this.bytesOut += msg.length;
      this.socket.send(msg);
      return true;
    }
    this.lastError = 'NOT_CONNECTED';
    this.planPending = false;
    this.missionPending = false;
    this.maneuverCommandActive = false;
    return false;
  }
  input(c: Controls) {
    if (!this.snapshot) return;
    this.send({ type: 'input', version: 1, shipId: this.activeShipId(), seq: this.seq++, ...c });
  }
  private activeShipId() {
    return this.snapshot?.state.profile.activeShipId ?? CONFIG.shipId;
  }
  private transactionId(action: string) {
    return `${action}-${Date.now().toString(36)}-${++this.requestSequence}`;
  }
  requestPlan(target: ManeuverTarget) {
    this.planId = `plan-${Date.now().toString(36)}-${++this.requestSequence}`;
    this.plan = undefined;
    this.planPending = true;
    this.lastError = '';
    this.send({
      type: 'plan_maneuver',
      version: 1,
      shipId: this.activeShipId(),
      requestId: this.planId,
      target,
    });
  }
  execute(candidateType: ManeuverCandidateType) {
    this.lastError = '';
    this.maneuverCommandActive = true;
    this.send({
      type: 'execute_maneuver',
      version: 1,
      shipId: this.activeShipId(),
      planId: this.planId,
      candidateType,
    });
  }
  cancel(executionId: string) {
    this.lastError = '';
    this.send({
      type: 'cancel_maneuver',
      version: 1,
      shipId: this.activeShipId(),
      executionId,
    });
  }
  chooseFaction(factionId: 'AURORA' | 'VANGUARD') {
    this.lastError = '';
    this.send({ type: 'choose_faction', version: 1, shipId: this.activeShipId(), factionId });
  }
  requestMissions() {
    this.lastError = '';
    this.missionPending = true;
    this.send({ type: 'request_missions', version: 1, shipId: this.activeShipId() });
  }
  acceptMission(missionId: string) {
    this.lastError = '';
    this.send({ type: 'accept_mission', version: 1, shipId: this.activeShipId(), missionId });
  }
  deliverCargo(missionId: string, cargoId: string, destinationId: string) {
    this.lastError = '';
    this.send({
      type: 'deliver_cargo',
      version: 1,
      shipId: this.activeShipId(),
      missionId,
      cargoId,
      destinationId,
    });
  }
  startScan(missionId: string, destinationId: string) {
    this.lastError = '';
    this.send({ type: 'start_scan', version: 1, shipId: this.activeShipId(), missionId, destinationId });
  }
  identifyTarget(missionId: string, destinationId: string) {
    this.lastError = '';
    this.send({
      type: 'identify_target',
      version: 1,
      shipId: this.activeShipId(),
      missionId,
      destinationId,
    });
  }
  selectCombatTarget(targetId: string) {
    this.lastError = '';
    this.send({
      type: 'select_target',
      version: 1,
      shipId: this.activeShipId(),
      targetId,
      commandId: this.transactionId('target'),
    });
  }
  clearCombatTarget() {
    this.lastError = '';
    this.send({
      type: 'clear_target',
      version: 1,
      shipId: this.activeShipId(),
      commandId: this.transactionId('clear-target'),
    });
  }
  fireLaser() {
    this.lastError = '';
    this.send({
      type: 'fire_laser',
      version: 1,
      shipId: this.activeShipId(),
      commandId: this.transactionId('laser'),
    });
  }
  fireMissile() {
    this.lastError = '';
    this.send({
      type: 'fire_missile',
      version: 1,
      shipId: this.activeShipId(),
      commandId: this.transactionId('missile'),
    });
  }
  activateCountermeasure() {
    this.lastError = '';
    this.send({
      type: 'activate_countermeasure',
      version: 1,
      shipId: this.activeShipId(),
      commandId: this.transactionId('countermeasure'),
    });
  }
  claimReplacement() {
    this.lastError = '';
    this.send({
      type: 'claim_replacement',
      version: 1,
      shipId: this.activeShipId(),
      transactionId: this.transactionId('recovery'),
    });
  }
  abandonMission(missionId: string) {
    this.lastError = '';
    this.send({ type: 'abandon_mission', version: 1, shipId: this.activeShipId(), missionId });
  }
  selectShip(targetShipId: string) {
    this.lastError = '';
    this.send({
      type: 'select_ship',
      version: 1,
      shipId: this.activeShipId(),
      targetShipId,
      transactionId: this.transactionId('ship'),
    });
  }
  buyFuel(amountKg: number) {
    this.lastError = '';
    this.send({
      type: 'buy_fuel',
      version: 1,
      shipId: this.activeShipId(),
      amountKg,
      transactionId: this.transactionId('fuel'),
    });
  }
  repairShip() {
    this.lastError = '';
    this.send({
      type: 'repair_ship',
      version: 1,
      shipId: this.activeShipId(),
      transactionId: this.transactionId('repair'),
    });
  }
  buyAmmunition(amountKg: number) {
    this.lastError = '';
    this.send({
      type: 'buy_ammunition',
      version: 1,
      shipId: this.activeShipId(),
      amountKg,
      transactionId: this.transactionId('ammo'),
    });
  }
  installUpgrade(upgradeId: string) {
    this.lastError = '';
    this.send({
      type: 'install_upgrade',
      version: 1,
      shipId: this.activeShipId(),
      upgradeId,
      transactionId: this.transactionId('upgrade'),
    });
  }
  flightInputAllowed() {
    const status = this.snapshot?.state.maneuver?.status;
    return (
      this.status === 'Bağlı' && !!this.snapshot &&
      !this.snapshot?.state.combat.playerDestroyed &&
      !this.maneuverCommandActive &&
      (!status || !['PLANNED', 'EXECUTING_BURN', 'COASTING', 'ARRIVAL_BURN'].includes(status))
    );
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.pingTimer);
    this.socket?.close();
  }
}
