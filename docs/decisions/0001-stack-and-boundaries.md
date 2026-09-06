# ADR 0001 — TS monorepo ve bağımlılık sınırları

Durum: kabul, O1. pnpm workspaces + TypeScript; Vite, React DOM, Three.js, Node/WS, Zod, Vitest ve Playwright. Kurulu kesin sürümler package.json/pnpm-lock.yaml'dedir.

Python simülasyon/backend adayı kullanıcının geçmişine uygundur ancak browser ve authoritative model arasında ikinci dil/sözleşme/replay maliyeti doğurur. Ağır engine/export hattı tarayıcı ve düzenlenebilir hızlı iterasyon için gereksiz başlangıç yüküdür. Saf TS simulation aynı modelin otoriter ve tahmin tüketicilerini destekler. React sadece DOM'u yönetir; renderer React component lifecycle'ına her frame bağlı olmaz. Scene graph için ayrı React-Three-Fiber katmanı şu aşamada eklenmez.

shared runtime schema/units/config; simulation saf durum geçişi; server command/clock/persistence; client input/render/UI; test-tools senaryo ve kanıt sahibidir. Dairesel bağımlılık ve client authoritative state yazımı kabul edilmez. Alternatifler gelecek oturumu baştan yazma gerekçesi olmaz; sınır değişirse yeni ADR gerekir.
