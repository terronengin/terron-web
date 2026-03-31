/**
 * Bölge adları + şehir ağırlıkları (yoğunluk).
 * İlçe/mahalle üretimi seed tarafında şehir adı + çeşitli eklerle çeşitlendirilir.
 */

export type TurkeyRegionName =
  | "Marmara"
  | "Ege"
  | "Akdeniz"
  | "İç Anadolu"
  | "Karadeniz"
  | "Doğu Anadolu"
  | "Güneydoğu Anadolu";

export type CitySeed = {
  city: string;
  region: TurkeyRegionName;
  /** Yaklaşık merkez [lat, lng] */
  center: [number, number];
  /** Yoğunluk ağırlığı (yüksek = daha çok arsa) */
  weight: number;
  /**
   * Sentetik noktayı denizden içeri çeker [Δlat, Δlng] (derece, küçük).
   * Kıyı illerinde merkez denize yakınsa kullanılır.
   */
  inlandBias?: [number, number];
};

/** 50+ il — yoğun iller yüksek weight */
export const TR_CITY_SEEDS: CitySeed[] = [
  { city: "İstanbul", region: "Marmara", center: [41.01, 28.98], weight: 22 },
  { city: "Ankara", region: "İç Anadolu", center: [39.93, 32.86], weight: 14 },
  { city: "İzmir", region: "Ege", center: [38.42, 27.13], weight: 14, inlandBias: [0.006, 0.055] },
  { city: "Bursa", region: "Marmara", center: [40.19, 29.06], weight: 10, inlandBias: [-0.032, 0.015] },
  { city: "Antalya", region: "Akdeniz", center: [36.89, 30.7], weight: 12 },
  { city: "Adana", region: "Akdeniz", center: [37.0, 35.32], weight: 8 },
  { city: "Konya", region: "İç Anadolu", center: [37.87, 32.48], weight: 9 },
  { city: "Gaziantep", region: "Güneydoğu Anadolu", center: [37.07, 37.38], weight: 8 },
  { city: "Mersin", region: "Akdeniz", center: [36.8, 34.64], weight: 8, inlandBias: [-0.032, 0.01] },
  { city: "Kocaeli", region: "Marmara", center: [40.77, 29.92], weight: 10, inlandBias: [0.02, -0.025] },
  { city: "Muğla", region: "Ege", center: [37.22, 28.37], weight: 11, inlandBias: [-0.02, 0.03] },
  { city: "Aydın", region: "Ege", center: [37.84, 27.85], weight: 9, inlandBias: [-0.015, 0.04] },
  { city: "Balıkesir", region: "Marmara", center: [39.65, 27.89], weight: 8, inlandBias: [-0.04, 0.02] },
  { city: "Kayseri", region: "İç Anadolu", center: [38.73, 35.48], weight: 8 },
  { city: "Samsun", region: "Karadeniz", center: [41.29, 36.33], weight: 8 },
  { city: "Trabzon", region: "Karadeniz", center: [41.0, 39.72], weight: 8 },
  { city: "Tekirdağ", region: "Marmara", center: [40.98, 27.52], weight: 7 },
  { city: "Sakarya", region: "Marmara", center: [40.78, 30.4], weight: 7 },
  { city: "Eskişehir", region: "İç Anadolu", center: [39.78, 30.52], weight: 7 },
  { city: "Denizli", region: "Ege", center: [37.78, 29.09], weight: 7 },
  { city: "Hatay", region: "Akdeniz", center: [36.2, 36.16], weight: 6, inlandBias: [-0.045, 0.02] },
  { city: "Manisa", region: "Ege", center: [38.61, 27.43], weight: 7 },
  { city: "Kahramanmaraş", region: "Akdeniz", center: [37.59, 36.93], weight: 6 },
  { city: "Van", region: "Doğu Anadolu", center: [38.5, 43.4], weight: 5 },
  { city: "Malatya", region: "Doğu Anadolu", center: [38.36, 38.31], weight: 5 },
  { city: "Erzurum", region: "Doğu Anadolu", center: [39.9, 41.27], weight: 5 },
  { city: "Elazığ", region: "Doğu Anadolu", center: [38.67, 39.22], weight: 4 },
  { city: "Diyarbakır", region: "Güneydoğu Anadolu", center: [37.91, 40.23], weight: 6 },
  { city: "Şanlıurfa", region: "Güneydoğu Anadolu", center: [37.17, 38.79], weight: 6 },
  { city: "Mardin", region: "Güneydoğu Anadolu", center: [37.31, 40.73], weight: 4 },
  { city: "Edirne", region: "Marmara", center: [41.68, 26.56], weight: 5 },
  { city: "Çanakkale", region: "Marmara", center: [40.16, 26.41], weight: 5 },
  { city: "Kırklareli", region: "Marmara", center: [41.73, 27.22], weight: 4 },
  { city: "Yalova", region: "Marmara", center: [40.65, 29.27], weight: 4, inlandBias: [0.028, -0.02] },
  { city: "Bilecik", region: "Marmara", center: [40.15, 29.98], weight: 4 },
  { city: "Uşak", region: "Ege", center: [38.68, 29.4], weight: 4 },
  { city: "Afyonkarahisar", region: "Ege", center: [38.76, 30.54], weight: 5 },
  { city: "Isparta", region: "Akdeniz", center: [37.76, 30.56], weight: 4 },
  { city: "Burdur", region: "Akdeniz", center: [37.72, 30.28], weight: 3 },
  { city: "Zonguldak", region: "Karadeniz", center: [41.45, 31.79], weight: 4 },
  { city: "Ordu", region: "Karadeniz", center: [40.99, 37.88], weight: 4 },
  { city: "Rize", region: "Karadeniz", center: [41.02, 40.52], weight: 3, inlandBias: [0.028, 0.01] },
  { city: "Artvin", region: "Karadeniz", center: [41.18, 41.82], weight: 3 },
  { city: "Kastamonu", region: "Karadeniz", center: [41.38, 33.78], weight: 4 },
  { city: "Sinop", region: "Karadeniz", center: [42.02, 35.16], weight: 3 },
  { city: "Sivas", region: "İç Anadolu", center: [39.75, 37.02], weight: 5 },
  { city: "Nevşehir", region: "İç Anadolu", center: [38.62, 34.71], weight: 4 },
  { city: "Kırşehir", region: "İç Anadolu", center: [39.15, 34.16], weight: 3 },
  { city: "Aksaray", region: "İç Anadolu", center: [38.37, 34.03], weight: 3 },
  { city: "Çorum", region: "Karadeniz", center: [40.55, 34.95], weight: 4 },
  { city: "Tokat", region: "Karadeniz", center: [40.31, 36.55], weight: 4 },
  { city: "Giresun", region: "Karadeniz", center: [40.91, 38.39], weight: 3, inlandBias: [0.028, 0.01] },
  { city: "Batman", region: "Güneydoğu Anadolu", center: [37.88, 41.13], weight: 4 },
  { city: "Siirt", region: "Güneydoğu Anadolu", center: [37.93, 41.95], weight: 3 },
  { city: "Ağrı", region: "Doğu Anadolu", center: [39.72, 43.05], weight: 3 },
  { city: "Erzincan", region: "Doğu Anadolu", center: [39.75, 39.49], weight: 3 },
  { city: "Kütahya", region: "Ege", center: [39.42, 29.98], weight: 4 },
];

export const DISTRICT_SUFFIXES = [
  "Merkez",
  "Kuzey",
  "Sanayi",
  "Yeni Yerleşim",
  "Bahçelievler",
  "Organize",
  "Sahil",
  "Yukarı",
];

/** Sentetik ilçe adından (örn. "İstanbul Merkez") ek indeksi — harita/seed ile hizalı */
export function syntheticDistrictIndexFromLabel(district: string, city: string): number {
  const prefix = `${city.trim()} `;
  if (!district.startsWith(prefix)) return 0;
  const suf = district.slice(prefix.length);
  const i = DISTRICT_SUFFIXES.indexOf(suf);
  return i >= 0 ? i : 0;
}
const NH_SUFFIXES = [
  "Mah.",
  "Yolu",
  "Konutları",
  "Sitesi",
  "Bölgesi",
  "Koru",
  "Vadisi",
];

export function syntheticDistrict(city: string, i: number): string {
  return `${city} ${DISTRICT_SUFFIXES[i % DISTRICT_SUFFIXES.length]}`;
}

/** Admin seçimi için ilçe etiketleri (seed ile aynı üretim kuralı). */
export function listDistrictOptionsForCity(cityName: string): string[] {
  const c = cityName.trim();
  return Array.from({ length: DISTRICT_SUFFIXES.length }, (_, i) => syntheticDistrict(c, i));
}

export function findCitySeedByName(cityName: string): CitySeed | undefined {
  const t = cityName.trim();
  return TR_CITY_SEEDS.find((x) => x.city === t);
}

export function syntheticNeighborhood(district: string, i: number): string {
  return `${district.split(" ")[0] ?? "Bölge"} ${String.fromCharCode(65 + (i % 6))} ${NH_SUFFIXES[i % NH_SUFFIXES.length]}`;
}

export function totalWeight(): number {
  return TR_CITY_SEEDS.reduce((s, c) => s + c.weight, 0);
}
