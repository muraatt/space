# ADR 0002 — WebGPU, fallback ve düzenlenebilir varlık

Durum: kabul, O1. Three.js WebGPURenderer + ortak TSL/Node materyalleri kullanılır. Otomatik WebGL2 fallback ve açık backend URL seçimi doğrulanır. Ayrı iki elle yazılmış shader/render engine sürdürülmez. WebGPU tek zorunlu yol yapılmaz. Yüksek performans adaptörü tercih olarak istenir; gerçek seçim raporlanır.

ECI double konum önce origin'den çıkarılır; yakın metre ve uzak kilometre pass'leri ortak kamera bakışı kullanır. Tek dev Float32 dünya sahnesi yerine bu yaklaşım gemi ölçeği hassasiyetini korur. Atmosfer teğet ışın irtifasına bağlı sürekli optik yaklaşımdır; tam hacimsel scattering/weather O1 maliyetini artırdığı için seçilmedi.

İlk gemi kod ve recipe'den üretilir: kaynak düzenlenebilir, ücretli asset ve Blender deneyimi gerekmez. Kaynak/manifest ve yerel dokular saklanır. Blender/glTF+LOD hattı iki araç üretimi O3 ve final kalite O6'da; STL gibi materyal/scene bilgisini kaybeden dağıtım formatı ana kaynak olmaz. AI raster görseli düzenlenebilir 3D gövde yerine kullanılmaz. Kod öncesi SVG art-direction kaynak ve PNG inceleme kanıtı vardır.
