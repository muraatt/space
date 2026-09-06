import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile('assets/manifest.json', 'utf8'));
const newAssets = [
  {
    id: 'earth-day-8k',
    path: 'packages/client/public/textures/earth-day-8k.png',
    sourceUrl:
      'https://visibleearth.nasa.gov/images/57730/the-blue-marble-land-surface-ocean-color-and-sea-ice',
    downloadUrl: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png',
    author: 'NASA Goddard; Reto Stoeckli, Robert Simmon; MODIS teams',
    license: 'NASA media usage guidelines; US government imagery',
    licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    licenseFile: 'assets/licenses/earth-day-8k.txt',
  },
  {
    id: 'earth-clouds',
    path: 'packages/client/public/textures/earth-clouds.jpg',
    downloadUrl: 'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg',
  },
  {
    id: 'earth-night',
    path: 'packages/client/public/textures/earth-night.jpg',
    downloadUrl: 'https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg',
    usage: 'Retained source; current renderer uses 8K',
  },
  {
    id: 'earth-night-8k',
    path: 'packages/client/public/textures/earth-night-8k.jpg',
    downloadUrl: 'https://www.solarsystemscope.com/textures/download/8k_earth_nightmap.jpg',
  },
];
for (const a of newAssets) {
  if (!a.author)
    Object.assign(a, {
      author: 'Solar System Scope / INOVE; based on NASA data',
      sourceUrl: 'https://www.solarsystemscope.com/textures/',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      licenseFile: 'assets/licenses/solar-system-scope.txt',
    });
  a.sha256 = createHash('sha256')
    .update(await readFile(a.path))
    .digest('hex');
  a.downloadedAt = '2026-09-06';
  a.changes = 'None; original file preserved. Material and lighting applied at runtime.';
  const index = manifest.assets.findIndex((item) => item.id === a.id);
  if (index >= 0) manifest.assets[index] = a;
  else manifest.assets.push(a);
}
manifest.assets[0].usage = 'Retained source; current renderer uses NASA 8K';
await writeFile('assets/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
