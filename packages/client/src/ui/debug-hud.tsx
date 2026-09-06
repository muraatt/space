import type { GameRenderer } from '../render/renderer';
import type { WorldState, ServerMetrics } from '@orbital/shared';
export function DebugHud({
  metrics,
  state,
  server,
}: {
  metrics: ReturnType<GameRenderer['metrics']> | null;
  state?: WorldState;
  server?: ServerMetrics;
}) {
  if (!metrics) return null;
  return (
    <section className="debug-panel" aria-label="Debug telemetri">
      <div className="eyebrow">CANLI ÖLÇÜM / GELİŞTİRME</div>
      <dl>
        <dt>Grafik yolu</dt>
        <dd>{metrics.backend}</dd>
        <dt>FPS / p95</dt>
        <dd>
          {metrics.fps.toFixed(0)} / {metrics.p95Ms.toFixed(1)} ms
        </dd>
        <dt>Draw call / üçgen</dt>
        <dd>
          {metrics.drawCalls} / {metrics.triangles.toLocaleString('tr-TR')}
        </dd>
        <dt>Sunucu tick / p95</dt>
        <dd>
          {server?.tickMs.toFixed(3)} / {server?.tickP95Ms.toFixed(3)} ms
        </dd>
        <dt>Tick / son komut</dt>
        <dd>
          {state?.tick} / {state?.lastInputSeq}
        </dd>
        <dt>Reddedilen komut</dt>
        <dd>{server?.rejectedCommands ?? 0}</dd>
        <dt>Kayıt</dt>
        <dd>Bellek · Oturum 1</dd>
      </dl>
      <p className="fine">Gerçek backend ölçümü. Referans GPU kabulü ayrıca raporlanır.</p>
    </section>
  );
}
