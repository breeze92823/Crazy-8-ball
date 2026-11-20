// The player's abilities (slots, spins, pity, redeemed codes) and every Ability Spin action.
// Signed-in players: the server owns this state (backend abilities.ts). It sends `abilities` after
// the save loads (a view, or { local: true } for a guest) and answers each action with
// `abilityResult` { ok, action, reason?, ..., state }. Guests and offline play run the same rules
// here (abilities.js abilityOps) on a copy kept in this browser.
// Cash stays client-side like the rest of the save: an action that costs cash spends it first and
// refunds it when the answer is not ok.
import { ABILITY_SPIN, abilityOps, freshAbilityState, normalizeAbilityState } from '../abilities.js'
import { net, onServer, request } from '../net.js'
import { addCash, spend } from '../progress.js'

const LOCAL_KEY = 'crazy-8-ball.abilities'
function loadLocal() {
  try {
    return normalizeAbilityState(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null') ?? freshAbilityState())
  } catch {
    return freshAbilityState()
  }
}
function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local))
  } catch {
    // storage blocked: this page only
  }
}

let local = loadLocal()
let server = null // the server's view while it owns this player's abilities
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())

onServer('abilities', (v) => {
  server = v && !v.local ? normalizeAbilityState(v) : null
  emit()
})
onServer('abilityResult', (r) => {
  if (r?.state) {
    server = normalizeAbilityState(r.state)
    emit()
  }
})

// 'server' (the server decides), 'offline' (the server's state, but it can't be reached right now:
// look, don't touch) or 'local' (this browser decides).
export function mode() {
  if (!server) return 'local'
  return net.connected && net.hydrated ? 'server' : 'offline'
}
export const state = () => server ?? local
export const equippedId = () => {
  const s = state()
  return s.slots[s.equipped] || ''
}
export const onAbilities = (fn) => listeners.add(fn)

let busy = false
async function act(action, payload, op) {
  if (busy) return { ok: false, reason: 'busy' }
  const m = mode()
  if (m === 'offline') return { ok: false, reason: 'offline' }
  if (m === 'local') {
    const r = op(local)
    if (r.ok) {
      saveLocal()
      emit()
    }
    return { ...r, action }
  }
  busy = true
  try {
    const r = await request(action, payload, 'abilityResult')
    return { ...r, action }
  } finally {
    busy = false
    emit()
  }
}
// Spends `price` cash around an action; refunds it unless the action went through.
async function paid(price, run) {
  if (!spend(price)) return { ok: false, reason: 'cash' }
  const r = await run()
  if (!r.ok) addCash(price)
  return r
}

export const isBusy = () => busy
export const spinAbility = () => act('abilitySpin', {}, (s) => abilityOps.spin(s))
export function buySpins(pack) {
  const p = ABILITY_SPIN.packs[pack]
  if (!p) return Promise.resolve({ ok: false, reason: 'pack' })
  return paid(p.price, () => act('abilityBuy', { pack }, (s) => abilityOps.buy(s, pack)))
}
export const redeemCode = (code) => act('abilityRedeem', { code }, (s) => abilityOps.redeem(s, code))
export const equipSlot = (slot) => act('abilityEquip', { slot }, (s) => abilityOps.equip(s, slot))
export const lockSlot = (slot, locked) => act('abilityLock', { slot, locked }, (s) => abilityOps.lock(s, slot, locked))
export function unlockSlot(slot) {
  const price = ABILITY_SPIN.slotPrices[slot]
  if (price == null) return Promise.resolve({ ok: false, reason: 'slot' })
  return paid(price, () => act('abilityUnlockSlot', { slot }, (s) => abilityOps.unlockSlot(s, slot)))
}
