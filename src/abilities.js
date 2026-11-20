// Abilities: the catalog (15 in 6 rarities), their icons, the Ability Spin rules and the
// local engine that runs them for guests / offline. Signed-in players spin on the server
// (backend src/abilities.ts mirrors ABILITY_SPIN, the ids and the rarity odds: a contract
// change goes in both projects). Gameplay effects live in hub/match.js (+ tablesim.js mods).
// Everything is bought with in-game cash only, never premium currency.

// --- rarities: roll chance in %, colours for the odds list, slot bars and reveals ---------------
export const ABILITY_RARITIES = [
  { id: 'common', name: 'Common', chance: 55, color: '#9aa1ad', dark: '#5f6672', light: '#c9ced6' },
  { id: 'uncommon', name: 'Uncommon', chance: 30, color: '#3fd468', dark: '#1d8a3a', light: '#8af0a6' },
  { id: 'rare', name: 'Rare', chance: 12, color: '#3d9bff', dark: '#1f5fc0', light: '#8cc6ff' },
  { id: 'epic', name: 'Epic', chance: 2, color: '#a55cff', dark: '#6a2fc0', light: '#cfa6ff' },
  { id: 'legendary', name: 'Legendary', chance: 0.67, color: '#ffbf1a', dark: '#c48400', light: '#ffe08a' },
  { id: 'mythic', name: 'Mythic', chance: 0.1, color: '#7f8fe0', dark: '#3b3f8a', light: '#c8b8ff', grad: 'linear-gradient(90deg,#5aa8e8,#8f78e0 50%,#c06ad8)' },
]
export const RARITY = Object.fromEntries(ABILITY_RARITIES.map((r, i) => [r.id, { ...r, rank: i }]))

// --- the catalog ----------------------------------------------------------------------------------
// color: the ability's own tint (guide lines, aura, banner). desc: the spin screen's subtitle and
// the match info card.
export const ABILITIES = [
  { id: 'eaglesEye', name: "Eagle's Eye", rarity: 'common', color: '#ffd23d', desc: 'See the future! Your next shot shows the exact path of the cue ball and every ball it sends rolling.' },
  { id: 'fireShot', name: 'Fire Shot', rarity: 'common', color: '#ff8a2a', desc: 'Your cue ball bursts into flames! Its aim lines run all the way to the cushions, and it flies at double power, scorching the cloth.' },
  { id: 'superBounce', name: 'Super Bounce', rarity: 'common', color: '#5cc8ff', desc: 'The cushions turn to rubber! For one shot every ball rebounds without losing any speed.' },
  { id: 'magnet', name: 'Magnet', rarity: 'uncommon', color: '#ff4f6a', desc: 'The pockets become magnets! For one shot they pull in any of your balls that roll close.' },
  { id: 'rewind', name: 'Rewind', rarity: 'uncommon', color: '#7cc4ff', desc: 'Missed? Rewind time! If your next shot pots nothing or fouls, the table rewinds and you shoot again.' },
  { id: 'portals', name: 'Portals', rarity: 'rare', color: '#8f6bff', desc: 'Two portals open on the table. Any ball that rolls into one pops out of the other at full speed.' },
  { id: 'lookOverThere', name: 'Look Over There!', rarity: 'rare', color: '#ffb02e', desc: "Distract your opponent! Their next shot goes wild while they're busy looking the other way." },
  { id: 'verity', name: 'Verity', rarity: 'rare', color: '#ffd84a', desc: 'The truth is revealed: your cue snaps to the best shot on the table and a golden line shows where it goes.' },
  { id: 'catchABall', name: 'Catch-a-Ball', rarity: 'epic', color: '#c98a4a', desc: 'A safety glove guards the pockets: your cue ball can’t scratch, and a ball of yours that stops near a pocket gets dropped in.' },
  { id: 'timeStop', name: 'Time Stop', rarity: 'epic', color: '#b0c4ff', desc: "Freeze your opponent's clock! After this shot it stays your turn, even if nothing drops (fouls still count)." },
  { id: 'chainLightning', name: 'Chain Lightning', rarity: 'epic', color: '#6ef0ff', desc: 'When your cue ball strikes, lightning arcs to up to three of your balls and zaps them toward the pockets.' },
  { id: 'steelBall', name: 'Steel Ball', rarity: 'legendary', color: '#9fe0b0', desc: 'Your cue ball turns to solid steel: three times heavier, it smashes through the rack like a wrecking ball.' },
  { id: 'blackFlash', name: 'Black Flash', rarity: 'legendary', color: '#ff3048', desc: 'A black flash! Your cue ball strikes with huge power and phases straight through any ball that isn’t yours.' },
  { id: 'blackHole', name: 'Black Hole', rarity: 'mythic', color: '#b46cff', desc: 'A black hole opens in the middle of the table and swallows every one of your balls that drifts too close.' },
  { id: 'guangdongTiger', name: 'Guangdong Tiger', rarity: 'mythic', color: '#ff9a1a', desc: 'Unleash the tiger! Your cue ball rampages off the cushions at full speed, and every ball of yours it strikes leaps for a pocket.' },
]
export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map((a) => [a.id, a]))
export const abilitiesOf = (rarity) => ABILITIES.filter((a) => a.rarity === rarity)

// --- the Ability Spin -----------------------------------------------------------------------------
// One spin rolls a rarity by `chance`, then one of its abilities evenly. The result goes into the
// equipped slot (refused while that slot is locked). `pity`: after this many spins without an Epic
// or better, the next one is guaranteed one. Prices are cash (never premium currency).
export const ABILITY_SPIN = {
  default: 'fireShot', // every player starts with it in slot 1
  startSpins: 1, // a new player's first spin is free
  slots: 3,
  slotPrices: [0, 25000, 100000], // cash to unlock slot 2 / 3 (slot 1 is free)
  pity: 100,
  pityRarity: 'epic', // ...or better
  // Spin packs (the reference's premium packs, re-priced in cash, a little steep; bulk is cheaper).
  packs: [
    { n: 1, price: 10000 },
    { n: 5, price: 47500 },
    { n: 10, price: 90000 },
    { n: 50, price: 425000 },
  ],
  quickPack: 0, // the yellow "$10,000 - 1 spin" bar buys this pack and spins it at once
  // Codes (case-insensitive, once per account): spins granted.
  codes: { FREESPINS: 5, '120KLIKES': 3 },
  codeBanner: 'FREESPINS', // "Type FREESPINS for 5 free spins!"
  likesCode: '120KLIKES',
  nextCodeLikes: '140,000',
}
const PITY_RANK = RARITY[ABILITY_SPIN.pityRarity].rank

// Each ability's real chance in % (the rarity chances are normalised to 100).
const TOTAL = ABILITY_RARITIES.reduce((n, r) => n + r.chance, 0)
export function abilityChance(id) {
  const a = ABILITY_BY_ID[id]
  const r = RARITY[a.rarity]
  return (r.chance / TOTAL / abilitiesOf(a.rarity).length) * 100
}
export function formatChance(p) {
  if (p >= 10) return `${Math.round(p)}%`
  if (p >= 1) return `${p.toFixed(1)}%`
  return `${p.toFixed(2)}%`
}

// Rolls one ability. `forced` (pity): only Epic or better. rand() in [0, 1).
export function rollAbility(forced = false, rand = Math.random) {
  const pool = ABILITY_RARITIES.filter((r) => !forced || RARITY[r.id].rank >= PITY_RANK)
  const total = pool.reduce((n, r) => n + r.chance, 0)
  let x = rand() * total
  let rarity = pool[pool.length - 1]
  for (const r of pool) {
    if (x < r.chance) {
      rarity = r
      break
    }
    x -= r.chance
  }
  const list = abilitiesOf(rarity.id)
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}

// --- state + the rules (local engine; the server runs the same) -------------------------------------
// { slots: [id | ''] x3, unlocked: 1..3, locked: [bool] x3, equipped: slot index, spins, pity, codes: [CODE] }
export function freshAbilityState() {
  return { slots: [ABILITY_SPIN.default, '', ''], unlocked: 1, locked: [false, false, false], equipped: 0, spins: ABILITY_SPIN.startSpins, pity: 0, codes: [] }
}
export function normalizeAbilityState(raw) {
  const s = freshAbilityState()
  if (!raw || typeof raw !== 'object') return s
  const n = ABILITY_SPIN.slots
  s.unlocked = Math.max(1, Math.min(n, Math.floor(Number(raw.unlocked)) || 1))
  for (let i = 0; i < n; i++) {
    const id = raw.slots?.[i]
    s.slots[i] = i < s.unlocked && ABILITY_BY_ID[id] ? id : i === 0 ? ABILITY_SPIN.default : ''
    s.locked[i] = i < s.unlocked && raw.locked?.[i] === true
  }
  s.equipped = Math.max(0, Math.min(s.unlocked - 1, Math.floor(Number(raw.equipped)) || 0))
  s.spins = Math.max(0, Math.floor(Number(raw.spins)) || 0)
  s.pity = Math.max(0, Math.min(ABILITY_SPIN.pity - 1, Math.floor(Number(raw.pity)) || 0))
  s.codes = Array.isArray(raw.codes) ? raw.codes.filter((c) => typeof c === 'string').slice(0, 64) : []
  return s
}

// The ops mutate `s` and return { ok, reason? , ... }. Cash is the caller's business (spend first).
export const abilityOps = {
  spin(s, rand = Math.random) {
    if (s.locked[s.equipped]) return { ok: false, reason: 'locked' }
    if (s.spins < 1) return { ok: false, reason: 'none' }
    const forced = s.pity >= ABILITY_SPIN.pity - 1
    const a = rollAbility(forced, rand)
    s.spins--
    s.pity = RARITY[a.rarity].rank >= PITY_RANK ? 0 : s.pity + 1
    s.slots[s.equipped] = a.id
    return { ok: true, id: a.id, slot: s.equipped, forced }
  },
  buy(s, pack) {
    const p = ABILITY_SPIN.packs[pack]
    if (!p) return { ok: false, reason: 'pack' }
    s.spins += p.n
    return { ok: true, n: p.n }
  },
  redeem(s, raw) {
    const code = String(raw ?? '').trim().toUpperCase()
    const n = ABILITY_SPIN.codes[code]
    if (!n) return { ok: false, reason: 'invalid' }
    if (s.codes.includes(code)) return { ok: false, reason: 'used' }
    s.codes.push(code)
    s.spins += n
    return { ok: true, code, n }
  },
  equip(s, slot) {
    if (!(slot >= 0 && slot < s.unlocked)) return { ok: false, reason: 'slot' }
    s.equipped = slot
    return { ok: true }
  },
  lock(s, slot, on) {
    if (!(slot >= 0 && slot < s.unlocked)) return { ok: false, reason: 'slot' }
    s.locked[slot] = !!on
    return { ok: true }
  },
  // Unlocks the next slot (in order), empty and equipped so the next spin fills it.
  unlockSlot(s, slot) {
    if (slot !== s.unlocked || slot >= ABILITY_SPIN.slots) return { ok: false, reason: 'slot' }
    s.unlocked++
    s.slots[slot] = ''
    s.locked[slot] = false
    s.equipped = slot
    return { ok: true }
  },
}

// --- icons (SVG, viewBox 0 0 40 40, outlined like the rest of the HUD) ------------------------------
const O = 'stroke="#14163a" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"'
export const ABILITY_ICONS = {
  fireShot: `<svg viewBox="0 0 40 40"><path d="M20 2c2 7 12 10 12 22a12 12 0 0 1-24 0c0-6 4-10 6-12 0 4 2 6 4 6 0-6-2-11 2-16z" fill="#ff6a1a" ${O}/><path d="M20 20c2 3 6 5 6 9a6 6 0 0 1-12 0c0-3 2-5 6-9z" fill="#ffd43b"/><circle cx="28" cy="30" r="7" fill="#fff" ${O}/></svg>`,
  eaglesEye: `<svg viewBox="0 0 40 40"><path d="M3 20C9 10 31 10 37 20 31 30 9 30 3 20z" fill="#fff8e0" ${O}/><circle cx="20" cy="20" r="7.5" fill="#f2a516" ${O}/><circle cx="20" cy="20" r="3.2" fill="#14163a"/><circle cx="17.5" cy="17.5" r="1.6" fill="#fff"/><path d="M8 11l-3-4M32 11l3-4M20 8V3" ${O} fill="none"/></svg>`,
  superBounce: `<svg viewBox="0 0 40 40"><path d="M4 34h32" ${O} fill="none"/><path d="M8 30c2-10 6-14 8-16M32 30c-2-10-6-14-8-16" stroke="#5cc8ff" stroke-width="2.4" stroke-dasharray="2 3" fill="none"/><circle cx="20" cy="13" r="8.5" fill="#7b5cff" ${O}/><circle cx="17" cy="10" r="2.6" fill="#c9b8ff"/><path d="M13 31l3-4 4 4 4-4 3 4" stroke="#14163a" stroke-width="2.2" fill="none"/></svg>`,
  magnet: `<svg viewBox="0 0 40 40"><path d="M8 6h9v15a3 3 0 0 0 6 0V6h9v15a12.5 12.5 0 0 1-25 0z" fill="#ff4f6a" ${O}/><path d="M8 6h9v6H8zM23 6h9v6h-9z" fill="#4d8cff" ${O}/><path d="M33 31l3 3M36 26h3M30 35v3" ${O} fill="none"/></svg>`,
  rewind: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#e8f4ff" ${O}/><path d="M20 12l-9 8 9 8zM29 12l-9 8 9 8z" fill="#4dabf7" ${O}/></svg>`,
  portals: `<svg viewBox="0 0 40 40"><ellipse cx="13" cy="21" rx="9" ry="13" fill="#4d8cff" ${O}/><ellipse cx="13" cy="21" rx="5" ry="8.5" fill="#bde0ff"/><ellipse cx="27" cy="19" rx="9" ry="13" fill="#ff8a2a" ${O}/><ellipse cx="27" cy="19" rx="5" ry="8.5" fill="#ffd9a8"/><path d="M27 12c-3 3-3 11 0 14" stroke="#fff" stroke-width="1.6" fill="none"/></svg>`,
  lookOverThere: `<svg viewBox="0 0 40 40"><path d="M6 24c0-4 2-6 5-6h9l-2-4c-1-2 0-4 2-4 1 0 2 1 3 2l6 8h7v10h-8c-2 2-4 3-7 3h-9c-3 0-6-3-6-6z" fill="#ffd7a8" ${O}/><path d="M36 5l-6 6M36 5h-6M36 5v6" stroke="#ff5a2a" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`,
  verity: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#ffd23d" ${O}/><circle cx="20" cy="20" r="11" fill="#ffe680" stroke="#c48400" stroke-width="1.6"/><path d="M14 20.5l4 4 8-9" stroke="#14163a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="13" cy="12" r="2.4" fill="#fff" opacity=".8"/></svg>`,
  catchABall: `<svg viewBox="0 0 40 40"><path d="M7 22c-2-8 2-16 9-17 2 0 3 2 3 4l1-3c2-2 5-1 5 2v3c2-2 5-1 5 2v3c2-1 4 0 4 3 0 9-6 17-15 17-6 0-10-5-12-14z" fill="#c98a4a" ${O}/><circle cx="21" cy="22" r="7" fill="#fff" ${O}/><path d="M16 19c3 2 3 5 1 8M26 19c-3 2-3 5-1 8" stroke="#ff4f4f" stroke-width="1.5" fill="none"/></svg>`,
  timeStop: `<svg viewBox="0 0 40 40"><rect x="16" y="2" width="8" height="5" rx="1.5" fill="#b0b8c8" ${O}/><circle cx="20" cy="23" r="14" fill="#eef3ff" ${O}/><path d="M20 23V14M20 23l6 4" ${O} fill="none"/><path d="M31 9l3-3" ${O}/><circle cx="20" cy="23" r="2" fill="#14163a"/></svg>`,
  chainLightning: `<svg viewBox="0 0 40 40"><path d="M23 2L8 22h10l-4 16 18-22H21z" fill="#6ef0ff" ${O}/><path d="M21 9l-6 10h6" stroke="#fff" stroke-width="1.6" fill="none"/></svg>`,
  steelBall: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#3fbf6a" ${O}/><circle cx="20" cy="20" r="15" fill="url(#sb)"/><defs><radialGradient id="sb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e8fff0" stop-opacity=".95"/><stop offset=".35" stop-color="#7ee0a0" stop-opacity=".4"/><stop offset="1" stop-color="#0d5a2a" stop-opacity=".7"/></radialGradient></defs><ellipse cx="14" cy="13" rx="4" ry="2.6" fill="#fff" opacity=".9"/></svg>`,
  blackFlash: `<svg viewBox="0 0 40 40"><path d="M25 2L9 21h9l-6 17 19-22h-9l6-14z" fill="#1a1020" stroke="#ff3048" stroke-width="2.4" stroke-linejoin="round"/><path d="M4 30l7-3M33 9l5-2M31 30l6 2" stroke="#ff3048" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  blackHole: `<svg viewBox="0 0 40 40"><ellipse cx="20" cy="20" rx="18" ry="9" fill="none" stroke="#ff9ad8" stroke-width="3" transform="rotate(-20 20 20)"/><circle cx="20" cy="20" r="10" fill="#0b0716" stroke="#b46cff" stroke-width="2.6"/><path d="M8 26C14 30 28 28 33 16" stroke="#ffd0f0" stroke-width="2" fill="none" transform="rotate(-6 20 20)"/></svg>`,
  guangdongTiger: `<svg viewBox="0 0 40 40"><path d="M7 9l6 4M33 9l-6 4" ${O}/><path d="M6 6l7 5-1 3zM34 6l-7 5 1 3z" fill="#ff9a1a" ${O}/><path d="M20 8c9 0 15 6 15 15 0 8-7 14-15 14S5 31 5 23C5 14 11 8 20 8z" fill="#ff9a1a" ${O}/><path d="M20 9v6M13 11l2 5M27 11l-2 5M7 21l5 1M33 21l-5 1M8 28l5-2M32 28l-5-2" stroke="#14163a" stroke-width="2.2" stroke-linecap="round"/><path d="M13 30c3 3 11 3 14 0l-7-3z" fill="#fff4e0" ${O}/><circle cx="14.5" cy="21" r="2" fill="#14163a"/><circle cx="25.5" cy="21" r="2" fill="#14163a"/><path d="M18 26h4l-2 2z" fill="#14163a"/></svg>`,
}
export const abilityIcon = (id) => ABILITY_ICONS[id] ?? ABILITY_ICONS.fireShot
