// Generates data/timetable.json and data/profiles.json with a seeded RNG,
// so re-running gives the same data. Run: npm run gen:data
import fs from "node:fs";

let seed = 20261010;
function rand() {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const weighted = <T,>(xs: [T, number][]) => {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[xs.length - 1][0];
};

// ---------- timetable ----------
const ARTISTS = [
  "Velvet Harbour", "The Saltwater Kids", "Mira Okafor", "Lowlight Parade", "Kestrel & Bloom", "Neon Tidewater",
  "Juniper Rae", "Static Orchard", "The Paper Moons", "Ilse Varga", "Copperline", "Hollow Gold", "Sable Coast",
  "Ruby Kowalczyk", "Glasshouse Choir", "Dune Theory", "Port Phillip Social", "Ari Tanaka", "The Midnight Ferry",
  "Wren Collective", "Bluestone Echo", "Ochre Sun", "Pale Satellites", "Tamsin Hale", "Riverbend Trio",
  "Lantern Club", "Second Summer", "Northcote Nights", "Indigo Rail", "Fable Street", "Moss & Marrow",
  "Kai Delacroix", "The Long Weekend", "Silver Gull", "Brightwater", "Yarra Static", "Coastal Drift", "Halcyon Days",
  "Polly Arden", "Southerly Buster", "Tin Roof Radio", "Cassia Moon", "The Late Trams", "Echo Valley", "Marlo Fenn",
  "Sunday Analog", "Gumleaf Disco", "Opal Hours", "Harbourlights", "Fern Gully Five", "Lumen Twins", "Ivy Cartwright",
  "Low Tide Club", "Golden Mile", "Arcadia Rose", "The Quiet Loud", "Night Bus Home", "Solenne", "Prism Bay", "Westgate",
];
const STAGES = [
  { id: "river_stage", name: "River Stage" },
  { id: "lawn_stage", name: "Lawn Stage" },
  { id: "tent_stage", name: "Tent Stage" },
];
const DAYS = ["Fri", "Sat", "Sun"];
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const sets: { id: string; day: string; stage_id: string; artist: string; start: string; end: string; headliner?: boolean }[] = [];
let a = 0;
for (const day of DAYS) {
  for (const stage of STAGES) {
    // 7 sets per stage per day = 63 sets, ~60 artists (a few play twice)
    const slots = [
      [14 * 60, 14 * 60 + 45], [15 * 60 + 15, 16 * 60], [16 * 60 + 30, 17 * 60 + 20], [17 * 60 + 50, 18 * 60 + 45],
      [19 * 60 + 15, 20 * 60 + 15], [20 * 60 + 45, 21 * 60 + 45], [21 * 60 + 15, 22 * 60 + 30],
    ];
    if (stage.id !== "river_stage") slots[6] = [22 * 60 + 15, 23 * 60]; // smaller stages finish later
    if (stage.id === "river_stage") slots[5] = [20 * 60, 20 * 60 + 50];
    slots.forEach(([s, e], i) => {
      sets.push({
        id: `set_${day.toLowerCase()}_${stage.id.split("_")[0]}_${i + 1}`,
        day,
        stage_id: stage.id,
        artist: ARTISTS[a++ % ARTISTS.length],
        start: fmt(s),
        end: fmt(e),
        ...(stage.id === "river_stage" && i === 6 ? { headliner: true } : {}),
      });
    });
  }
}
fs.writeFileSync(
  "data/timetable.json",
  JSON.stringify({ _note: "Fictional artists. River Stage headliner ends 22:30 each night.", stages: STAGES, days: DAYS, sets }, null, 2),
);

// ---------- profiles ----------
type Profile = {
  id: string;
  name: string;
  age: number;
  lang: string;
  home: { mode: "train"; line: string } | { mode: "shuttle"; booking: string } | { mode: "pickup"; zone: string; contact: string };
  access: { wheelchair: boolean; step_free: boolean; low_vision: boolean; sensory: boolean };
  under_18: boolean;
  first_timer: boolean;
  medical_flag: string | null;
  group: { id: string; size: number } | null;
  location_at_end: string;
  must_see: string[];
  weight: number; // how many real attendees this profile stands for (heroes = 1)
  hero?: boolean;
  notes?: string;
};

const heroes: Profile[] = [
  {
    id: "mei_19", name: "Mei", age: 19, lang: "zh", hero: true, weight: 1,
    home: { mode: "train", line: "Sandringham" },
    access: { wheelchair: false, step_free: false, low_vision: false, sensory: false },
    under_18: false, first_timer: true, medical_flag: null,
    group: { id: "grp_mei", size: 4 }, location_at_end: "river_stage",
    must_see: sets.filter((s) => s.day === "Sat" && s.headliner).map((s) => s.id),
    notes: "International student; English slow under stress. Often separated from friends near the food trucks. Phone battery low by night.",
  },
  {
    id: "tom_70", name: "Tom", age: 70, lang: "en", hero: true, weight: 1,
    home: { mode: "shuttle", booking: "shuttle_acc_2245" },
    access: { wheelchair: true, step_free: true, low_vision: false, sensory: false },
    under_18: false, first_timer: false, medical_flag: null,
    group: null, location_at_end: "accessible_platform",
    must_see: sets.filter((s) => s.day === "Sat" && s.headliner).map((s) => s.id),
    notes: "Wheelchair user. Needs a covered, step-free exit. Booked on the 22:45 accessible shuttle.",
  },
  {
    id: "jake_16", name: "Jake", age: 16, lang: "en", hero: true, weight: 1,
    home: { mode: "pickup", zone: "pickup_zone_1", contact: "parent" },
    access: { wheelchair: false, step_free: false, low_vision: false, sensory: false },
    under_18: true, first_timer: true, medical_flag: null,
    group: null, location_at_end: "lawn_stage",
    must_see: [],
    notes: "First festival. Parent picking him up at Pickup Zone 1; parent's mobile on file for SMS updates.",
  },
];

const FIRST = ["Alex", "Sam", "Priya", "Linh", "Omar", "Chloe", "Ravi", "Zoe", "Hiro", "Ana", "Ben", "Fatima", "Jordan", "Nina", "Marco", "Aisha", "Leo", "Grace", "Minh", "Sofia", "Kofi", "Ella", "Yusuf", "Mia", "Dev", "Hana", "Tariq", "Ruby", "Jun", "Isla"];
const LANGS: [string, number][] = [["en", 70], ["zh", 8], ["vi", 5], ["ar", 3], ["hi", 4], ["es", 3], ["ko", 3], ["it", 2], ["el", 2]];
const LINES: [string, number][] = [["Sandringham", 14], ["Frankston", 16], ["Belgrave", 10], ["Lilydale", 10], ["Craigieburn", 12], ["Werribee", 12], ["Hurstbridge", 8], ["Pakenham", 18]];
const LOCS: [string, number][] = [["river_stage", 60], ["lawn_stage", 22], ["tent_stage", 18]];

const generated: Profile[] = [];
for (let i = 0; i < 200; i++) {
  const age = weighted<number>([[16, 6], [17, 6], [19, 18], [22, 22], [26, 18], [31, 12], [38, 8], [47, 5], [58, 3], [68, 2]]) + Math.floor(rand() * 3);
  const under18 = age < 18;
  const wheelchair = rand() < 0.03;
  const step_free = wheelchair || rand() < 0.02;
  const mode = under18 ? weighted<string>([["pickup", 70], ["train", 30]]) : step_free ? weighted<string>([["train", 55], ["shuttle", 30], ["pickup", 15]]) : weighted<string>([["train", 68], ["shuttle", 10], ["pickup", 22]]);
  const home: Profile["home"] =
    mode === "train" ? { mode: "train", line: weighted(LINES) }
    : mode === "shuttle" ? { mode: "shuttle", booking: step_free ? weighted([["shuttle_acc_2245", 80], ["shuttle_acc_2320", 20]]) : weighted([["shuttle_gen_2250", 70], ["shuttle_gen_2330", 30]]) }
    : { mode: "pickup", zone: weighted([["pickup_zone_1", 55], ["pickup_zone_2", 35], ["pickup_zone_3", 10]]), contact: under18 ? "parent" : pick(["friend", "partner", "family"]) };
  const groupSize = weighted<number>([[1, 15], [2, 30], [3, 20], [4, 20], [6, 15]]);
  generated.push({
    id: `p_${String(i + 1).padStart(3, "0")}`,
    name: pick(FIRST),
    age,
    lang: weighted(LANGS),
    home,
    access: { wheelchair, step_free, low_vision: rand() < 0.02, sensory: rand() < 0.04 },
    under_18: under18,
    first_timer: rand() < 0.35,
    medical_flag: rand() < 0.03 ? pick(["type 1 diabetes", "epilepsy", "heart condition", "asthma"]) : null,
    group: groupSize > 1 ? { id: `grp_${i + 1}`, size: groupSize } : null,
    location_at_end: step_free && rand() < 0.6 ? "accessible_platform" : weighted(LOCS),
    must_see: [pick(sets.filter((s) => s.day === "Sat")).id],
    // Each generated profile is a cohort of similar attendees. Step-free cohorts are
    // smaller so the overall rate stays ~2-3% of a 15,000 crowd.
    weight: step_free ? 20 + Math.floor(rand() * 21) : 60 + Math.floor(rand() * 41),
  });
}

const profiles = [...heroes, ...generated];
fs.writeFileSync("data/profiles.json", JSON.stringify({ _note: "3 hero personas + 200 generated cohorts. weight = attendees each profile represents.", profiles }, null, 2));

const total = profiles.reduce((s, p) => s + p.weight, 0);
const sf = profiles.filter((p) => p.access.step_free);
console.log(`sets: ${sets.length}, profiles: ${profiles.length}, people represented: ${total}`);
console.log(`step-free people: ${sf.reduce((s, p) => s + p.weight, 0)} (${sf.length} profiles)`);
console.log(`  of whom need transport (not pickup): ${sf.filter((p) => p.home.mode !== "pickup").reduce((s, p) => s + p.weight, 0)}`);
