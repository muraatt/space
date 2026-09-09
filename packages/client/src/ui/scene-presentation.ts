import type { SceneId } from '@orbital/shared';

const copy: Partial<Record<SceneId, readonly [string, string, string]>> = {
  orbit_night: ['DÜNYA GÖLGESİ', 'Gece vardiyası', 'Güneş hattının ötesinde. Seyir ışıkları etkin.'],
  cargo_mission: ['DENETİM HALKASI', 'Denetim halkası varışı', '450 kilometrede. Görev kontrolü teslimat için bağlantıda.'],
  intercept: ['NORMAL BÖLGE · GÖREV TEMASI', 'R-17 önleme hattı', 'Hedefi tanımla; ateş yetkisi sunucudan gelir.'],
  missile_hit: ['ÇEKİŞMELİ BÖLGE · DARBE TESTİ', 'Füze darbe testi', 'Gelen darbeyi ve alt sistem kaybını gözle.'],
  bounty_sandbox: ['AEGIS OPERATIONS', 'Paylaşılan görev alanı', 'Ortak AEGIS çevresinde otoriter uçuş ve operasyon bağlantısı etkin.'],
};

export function scenePresentation(requested: SceneId, authoritative: SceneId | undefined, identityMode: boolean) {
  const scene = authoritative ?? requested,
    [eyebrow, title, description] = copy[scene] ?? [
      'ALÇAK DÜNYA YÖRÜNGESİ',
      'Sessizliğin üzerinde',
      '400 kilometre yukarıda. Her hareketin bir karşılığı var.',
    ];
  return { scene, eyebrow, title, description, canSelectScene: !identityMode };
}
