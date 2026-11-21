// The player's progress (the server save; net.js loads / saves it) plus device settings
// (always in this browser). Every change goes through the actions here, which call
// changed(key) so the HUD / windows refresh.
//   cash, wins, streak, tutorialDone, ability (0..100), abilityHintDone
//   xp (ranked), rankClaimed (rank levels already paid out), tag (chat tag, "" = none)
//   cues { id: count }, cue (equipped id), bag [{ uid, kind, readyAt }], hotbar [uid], perks [id]
//   playtime (s)
import { BAG, BONUS, ECONOMY, RANKED, STARTER } from './config.js'
import { BLOCKS, CUE_BY_ID, DEFAULT_CUE, RARITIES, rollBlock, rollRarity } from './cues.js'

const SETTINGS_KEY = `${ECONOMY.storageKey}.settings`
const DEF_SETTINGS = { sfx: 0.8, music: 0.7, ambience: 0.8, piano: true, guide: true, tags: true, night: false }
const fresh = () => ({
  cash: ECONOMY.startCash, wins: 0, streak: 0, tutorialDone: false, ability: 0, abilityHintDone: false,
  xp: 0, rankClaimed: 0, tag: '', cues: { [DEFAULT_CUE]: 1 }, cue: DEFAULT_CUE, bag: [], hotbar: [], perks: [], playtime: 0,
})
const PROGRESS_KEYS = Object.keys(fresh())

export const save = { ...fresh(), settings: loadSettings() }

function loadSettings() {
  try {
    const own = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    // older builds kept settings inside the whole local save
    const legacy = JSON.parse(localStorage.getItem(ECONOMY.storageKey) || 'null')?.settings
    return { ...DEF_SETTINGS, ...legacy, ...own }
  } catch {
    return { ...DEF_SETTINGS }
  }
}

// --- change events ------------------------------------------------------------------------
const listeners = new Set()
export const onChange = (fn) => listeners.add(fn)
export function changed(key) {
  for (const fn of listeners) fn(key)
}
// net.js hooks in here to save soon after a change.
let persistHook = () => {}
export const setPersistHook = (fn) => (persistHook = fn)
export function persist() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(save.settings))
  } catch {
    // storage blocked: settings last the page
  }
  persistHook()
}
// The server's clock (net.js keeps it in step); timers (Time Gift) run on it.
let clock = () => Date.now()
export const setClock = (fn) => (clock = fn)
export const now = () => clock()

// --- save <-> server ------------------------------------------------------------------------
export function snapshot() {
  const out = {}
  for (const k of PROGRESS_KEYS) out[k] = save[k]
  return out
}
// Loads a saved doc over a fresh state (unknown / missing fields fall back to the defaults).
export function hydrate(doc) {
  const base = fresh()
  for (const k of PROGRESS_KEYS) save[k] = doc && doc[k] !== undefined ? doc[k] : base[k]
  normalize()
  changed('all')
}
function normalize() {
  const cues = {}
  for (const [id, n] of Object.entries(save.cues || {})) if (CUE_BY_ID[id] && n > 0) cues[id] = Math.floor(n)
  if (!Object.keys(cues).length) cues[DEFAULT_CUE] = 1
  save.cues = cues
  if (!cues[save.cue]) save.cue = Object.keys(cues)[0]
  save.bag = (Array.isArray(save.bag) ? save.bag : []).filter((b) => b && BLOCKS[b.kind] && typeof b.uid === 'string')
  const uids = new Set(save.bag.map((b) => b.uid))
  save.hotbar = [...new Set((save.hotbar || []).filter((u) => uids.has(u)))].slice(0, BAG.hotbar)
  save.perks = Array.isArray(save.perks) ? save.perks : []
  save.cash = Math.max(0, Number(save.cash) || 0)
  save.ability = Math.max(0, Math.min(100, Number(save.ability) || 0))
}
// Once per load (fresh account or a loaded save): one-off grants that depend on the save.
export function settle() {
  if (!save.perks.includes('timeGift')) {
    save.perks.push('timeGift')
    grantBlock('time', 1, now() + STARTER.timeGiftHours * 3600 * 1000)
  }
  if (save.tutorialDone && !save.perks.includes('starter')) grantStarter()
  // catch up rank rewards missed by an older build
  payRanks()
  changed('all')
}

// --- cash -----------------------------------------------------------------------------------
export function addCash(n) {
  save.cash = Math.max(0, save.cash + n)
  changed('cash')
  persist()
}
export function spend(n) {
  if (save.cash < n) return false
  addCash(-n)
  return true
}

// --- cues -----------------------------------------------------------------------------------
export const owned = (id) => (save.cues[id] ?? 0) > 0
export function grantCue(id) {
  if (!CUE_BY_ID[id]) return null
  const isNew = !owned(id)
  save.cues[id] = (save.cues[id] ?? 0) + 1
  changed('cues')
  persist()
  return { kind: 'cue', id, isNew }
}
export function equipCue(id) {
  if (!owned(id) || save.cue === id) return
  save.cue = id
  changed('cue')
  persist()
}
// Duplicates = every copy past the first; the equipped one always keeps a copy.
export function dupeValue() {
  let v = 0
  for (const [id, n] of Object.entries(save.cues)) if (n > 1) v += (n - 1) * RARITIES[CUE_BY_ID[id].rarity].sell
  return v
}
export function sellDupes() {
  const v = dupeValue()
  if (!v) return 0
  for (const id of Object.keys(save.cues)) save.cues[id] = Math.min(1, save.cues[id])
  changed('cues')
  addCash(v)
  return v
}
// The Index's buy button: a random cue of one rarity, for cash.
export function buyRarity(rarity) {
  const price = RARITIES[rarity]?.price
  if (!price || !spend(price)) return null
  return grantCue(rollRarity(rarity))
}
export function buyCue(id, price) {
  if (owned(id) || !spend(price)) return null
  return grantCue(id)
}
function grantStarter() {
  save.perks.push('starter')
  return grantCue(STARTER.cue)
}
// After the first match.
export function tutorialFinished() {
  if (save.perks.includes('starter')) return null
  const r = grantStarter()
  persist()
  return r
}
export const bonusReady = () => save.wins >= BONUS.wins && !save.perks.includes('bonus')
export function claimBonus() {
  if (!bonusReady()) return null
  save.perks.push('bonus')
  return grantCue(BONUS.cue)
}

// --- lucky blocks (bag + hotbar) ---------------------------------------------------------------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
export function grantBlock(kind, n = 1, readyAt = 0) {
  if (!BLOCKS[kind]) return null
  for (let i = 0; i < n && save.bag.length < BAG.max; i++) {
    const b = { uid: uid(), kind, readyAt: Math.round(readyAt) }
    save.bag.push(b)
    if (save.hotbar.length < BAG.hotbar) save.hotbar.push(b.uid)
  }
  changed('bag')
  persist()
  return { kind: 'block', block: kind, n }
}
export const blockReady = (b) => !b.readyAt || b.readyAt <= now()
// Opens a block from the bag: { cue result } or null (missing / still on its timer).
export function openBlock(id) {
  const i = save.bag.findIndex((b) => b.uid === id)
  if (i < 0 || !blockReady(save.bag[i])) return null
  const [b] = save.bag.splice(i, 1)
  save.hotbar = save.hotbar.filter((u) => u !== id)
  changed('bag')
  return { block: b.kind, ...grantCue(rollBlock(b.kind)) }
}
// Hotbar: put a bag block in the first free slot (or swap out the last one).
export function toHotbar(id) {
  if (save.hotbar.includes(id)) return
  if (save.hotbar.length >= BAG.hotbar) save.hotbar.pop()
  save.hotbar.push(id)
  changed('bag')
  persist()
}
export function fromHotbar(id) {
  save.hotbar = save.hotbar.filter((u) => u !== id)
  changed('bag')
  persist()
}

// --- rewards (daily / track / playtime / ranks) ----------------------------------------------------
// reward: { cash } | { block, n } | { cue } | { ability } | { tag }. Returns what was granted.
export function grantReward(r) {
  const out = []
  if (r.cash) {
    addCash(r.cash)
    out.push({ kind: 'cash', n: r.cash })
  }
  if (r.block) out.push(grantBlock(r.block, r.n ?? 1))
  if (r.cue) out.push(grantCue(r.cue))
  if (r.ability) {
    save.ability = 100
    changed('ability')
    out.push({ kind: 'ability' })
  }
  if (r.tag) {
    save.tag = r.tag
    changed('tag')
    out.push({ kind: 'tag', tag: r.tag })
  }
  persist()
  return out.filter(Boolean)
}

// --- ranked ---------------------------------------------------------------------------------
// Every division in order: { tier, div, name, need (xp for this step), at (total xp), reward }.
export const LEVELS = (() => {
  const out = []
  let at = 0
  for (const tier of RANKED.tiers) {
    const n = tier.divisions ?? 5
    for (let d = 1; d <= n; d++) {
      at += tier.xp
      const first = d === 1
      out.push({
        tier, div: d, name: n > 1 ? `${tier.name} ${d}` : tier.name, need: tier.xp, at,
        reward: first ? { cash: tier.cash, block: tier.block, n: 1, tag: tier.name.toUpperCase(), cue: tier.id } : { cash: tier.cash },
      })
    }
  }
  return out
})()
// { level (index of the current division, -1 = unranked), next (the division being worked on or null), into, need }
export function rankOf(xp = save.xp) {
  let level = -1
  while (level + 1 < LEVELS.length && xp >= LEVELS[level + 1].at) level++
  const next = LEVELS[level + 1] ?? null
  const from = level >= 0 ? LEVELS[level].at : 0
  return { level, cur: LEVELS[level] ?? null, next, into: next ? xp - from : 0, need: next ? next.need : 0 }
}
export const xpForWin = (streak) => RANKED.winXp + Math.min(RANKED.streakXpMax, RANKED.streakXp * Math.max(0, streak - 1))
// Pays every division reached but not yet paid; returns [{ level, granted }].
function payRanks() {
  const { level } = rankOf()
  const paid = []
  while (save.rankClaimed <= level) {
    const L = LEVELS[save.rankClaimed]
    save.rankClaimed++
    paid.push({ level: L, granted: grantReward(L.reward) })
  }
  if (paid.length) changed('rank')
  return paid
}
export function addXp(n) {
  if (n <= 0) return []
  save.xp += n
  const paid = payRanks()
  changed('xp')
  persist()
  return paid
}
