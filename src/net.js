// Colyseus link to ../Crazy-8-ball-backend (room "world"), after Bowling Roll's net.js.
// Progress: on join the server answers `progress` (the saved doc -> hydrate), `noProgress`
// (new account, guest or no database: keep the current state and save it) or `serverError`
// (the save could not be read: never overwrite it). From then on snapshot() goes out as
// `saveProgress` whenever it changed (at most every NET.saveEvery s, and when the tab hides).
// The browser keeps a copy too (loaded at start, used whenever the server can't be reached).
// Free rewards are server-authoritative: Daily (`daily`, claimDaily / dailyUnlockAll), the
// 28-day Track (claimTrack) and Playtime gifts (`gifts`, claimGift). Without a server the same
// rules run here on the browser clock (rewardsLocal) so the game still plays offline / in dev.
// Never throws and never blocks play.
import { Client } from '@colyseus/sdk'
import { DAILY, DEV_MODE, ECONOMY, GIFTS, NET, SERVER_URL, TRACK } from './config.js'
import { changed, hydrate, save, setClock, setPersistHook, settle, snapshot } from './progress.js'
import { authState, canResolveServer, getPfp, launchRoomId, locateRoom, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'

// net.daily = { unlocked, claimed, nextAt, track: { days, claimed } }
// net.gifts = { secs, claimed, day, nextResetAt, at (performance.now() when secs was read) }
export const net = { room: null, connected: false, hydrated: false, daily: null, gifts: null }

// --- identity ------------------------------------------------------------------------
function storedId(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId('crazy-8-ball.guest', () => `guest-${rand()}`)
const DEV = DEV_MODE ? storedId('crazy-8-ball.dev', () => `dev-${rand()}`) : ''
function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
}
const isGuestId = (id) => id.startsWith('guest-')
export const hasServer = () => !!(SERVER_URL || canResolveServer())

// --- clock -----------------------------------------------------------------------------
let clockOffset = 0
export const serverNow = () => Date.now() + clockOffset
setClock(serverNow)
function keepClock(msg) {
  if (typeof msg?.serverTime === 'number') clockOffset = msg.serverTime - Date.now()
}

// --- browser save -----------------------------------------------------------------------
const LOCAL_SAVE = ECONOMY.storageKey
function localLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_SAVE) || 'null')
    if (!raw) return null
    delete raw.settings
    return raw
  } catch {
    return null
  }
}
let lastLocal = ''
function localSave() {
  try {
    const snap = JSON.stringify(snapshot())
    if (snap === lastLocal) return
    lastLocal = snap
    localStorage.setItem(LOCAL_SAVE, snap)
  } catch {
    // private mode / storage full: the page's progress only
  }
}

// --- saving -------------------------------------------------------------------------------
let lastSaved = ''
let savedAt = 0
let sentId = ''
let dirty = false
function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}
function serverSave() {
  if (!net.connected || !net.hydrated || isGuestId(sentId)) return
  const snap = JSON.stringify(snapshot())
  if (snap === lastSaved) return
  lastSaved = snap
  send('saveProgress', JSON.parse(snap))
}
export function saveNow() {
  savedAt = performance.now()
  dirty = false
  localSave()
  serverSave()
}
setPersistHook(() => (dirty = true))

// --- requests -------------------------------------------------------------------------------
const waiting = {}
// Generic request for other features: sends `type`, resolves with the first `answer` message
// ({ ok: false, reason: 'offline' | 'busy' | 'timeout' } without one). Register the answer type
// with onServer(answer, fn) or it is never resolved.
export function request(type, payload, answer) {
  return new Promise((resolve) => {
    if (!net.connected || !net.hydrated) return resolve(local[type]?.(payload) ?? { ok: false, reason: 'offline' })
    if (waiting[answer]) return resolve({ ok: false, reason: 'busy' })
    const timer = setTimeout(() => {
      delete waiting[answer]
      resolve({ ok: false, reason: 'timeout' })
    }, NET.requestTimeout * 1000)
    waiting[answer] = (msg) => {
      clearTimeout(timer)
      delete waiting[answer]
      resolve(msg)
    }
    send(type, payload)
  })
}
// { ok, day, reason?, ...daily view }
export const claimDaily = (day) => request('claimDaily', { day }, 'dailyResult')
export const unlockAllDaily = () => request('dailyUnlockAll', {}, 'dailyUnlockResult')
export const claimTrack = (i) => request('claimTrack', { i }, 'trackResult')
export const claimGift = (i) => request('claimGift', { i }, 'giftResult')
export function refreshDaily() {
  if (net.connected && net.hydrated) send('dailyRefresh', {})
  else local.roll()
}
// Seconds played today (the server's count plus the time since it was read).
export const giftSecs = () => (net.gifts ? net.gifts.secs + (performance.now() - net.gifts.at) / 1000 : 0)

function setDaily(d) {
  if (!d || !Array.isArray(d.claimed)) return
  keepClock(d)
  net.daily = { unlocked: d.unlocked, claimed: d.claimed, nextAt: d.nextAt, track: d.track ?? { days: 0, claimed: [] } }
  changed('daily')
}
function setGifts(g) {
  if (!g || !Array.isArray(g.claimed)) return
  keepClock(g)
  net.gifts = { secs: g.secs, claimed: g.claimed, day: g.day, nextResetAt: g.nextResetAt, at: performance.now() }
  changed('gifts')
}

// --- offline rules (mirror backend daily.ts / gifts.ts on the browser clock) ------------------
const DAY_MS = 86_400_000
const utcDay = (ms = Date.now()) => Math.floor(ms / DAY_MS)
const REWARDS_KEY = 'crazy-8-ball.rewards'
const local = (() => {
  let s = { day: 0, last: -1, claimed: [], trackDays: 0, trackClaimed: [], giftDay: -1, giftSecs: 0, giftsClaimed: [] }
  try {
    s = { ...s, ...JSON.parse(localStorage.getItem(REWARDS_KEY) || '{}') }
  } catch {
    // defaults
  }
  const store = () => {
    try {
      localStorage.setItem(REWARDS_KEY, JSON.stringify(s))
    } catch {
      // page only
    }
  }
  const view = () => ({ unlocked: s.day, claimed: [...s.claimed], nextAt: (utcDay() + 1) * DAY_MS, serverTime: Date.now(), track: { days: s.trackDays, claimed: [...s.trackClaimed] } })
  const giftView = () => ({ secs: s.giftSecs, claimed: [...s.giftsClaimed], day: s.giftDay, nextResetAt: (utcDay() + 1) * DAY_MS, serverTime: Date.now() })
  const L = {
    roll() {
      const today = utcDay()
      if (s.last < today) {
        if (s.day === 0 || s.claimed.length >= DAILY.days.length) {
          s.day = 1
          s.claimed = []
        } else s.day = Math.min(DAILY.days.length, s.day + 1)
        s.last = today
      }
      if (s.giftDay !== today) {
        s.giftDay = today
        s.giftSecs = 0
        s.giftsClaimed = []
      }
      store()
      setDaily(view())
      setGifts(giftView())
    },
    tick(dt) {
      if (s.giftDay !== utcDay()) L.roll()
      s.giftSecs += dt
    },
    claimDaily({ day }) {
      L.roll()
      if (!Number.isInteger(day) || day < 0 || day >= s.day || s.claimed.includes(day)) return { ok: false, day, reason: 'locked', ...view() }
      s.claimed.push(day)
      if (s.trackClaimed.length >= TRACK.milestones.length) {
        s.trackDays = 0
        s.trackClaimed = []
      }
      s.trackDays = Math.min(TRACK.days, s.trackDays + 1)
      store()
      setDaily(view())
      return { ok: true, day, ...view() }
    },
    dailyUnlockAll() {
      if (s.day >= DAILY.days.length) return { ok: false, reason: 'done', ...view() }
      s.day = DAILY.days.length
      store()
      setDaily(view())
      return { ok: true, ...view() }
    },
    claimTrack({ i }) {
      const m = TRACK.milestones[i]
      if (!m || s.trackDays < m.day) return { ok: false, i, reason: 'locked', ...view() }
      if (s.trackClaimed.includes(i)) return { ok: false, i, reason: 'claimed', ...view() }
      s.trackClaimed.push(i)
      store()
      setDaily(view())
      return { ok: true, i, ...view() }
    },
    claimGift({ i }) {
      const g = GIFTS[i]
      if (!g) return { ok: false, i, reason: 'locked', ...giftView() }
      if (s.giftsClaimed.includes(i)) return { ok: false, i, reason: 'claimed', ...giftView() }
      if (s.giftSecs < g.min * 60) return { ok: false, i, reason: 'locked', ...giftView() }
      s.giftsClaimed.push(i)
      store()
      setGifts(giftView())
      return { ok: true, i, ...giftView() }
    },
    save: store,
  }
  return L
})()

// --- extra server -> client messages (other features) ------------------------------------------
// onServer(type, fn): fn(msg) for every `type` message; also resolves request()s waiting on it.
const extra = new Map()
export function onServer(type, fn) {
  extra.set(type, fn)
  if (net.room) bindExtra(net.room, type, fn)
}
function bindExtra(room, type, fn) {
  room.onMessage(type, (m) => {
    fn?.(m)
    waiting[type]?.(m)
  })
}
export const sendServer = (type, payload) => net.connected && send(type, payload)

// --- connection ---------------------------------------------------------------------------
let loadedId = ''
function attach(room) {
  net.room = room
  net.connected = true
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    keepClock(doc)
    // a reconnect under the same identity: this tab is newer than the save, push it instead
    if (loadedId === sentId || !doc) return saveNow()
    loadedId = sentId
    hydrate(doc)
    settle()
    saveNow()
  })
  room.onMessage('noProgress', (msg) => {
    net.hydrated = true
    keepClock(msg)
    loadedId = sentId
    lastSaved = ''
    settle()
    saveNow()
  })
  room.onMessage('serverError', () => {
    net.hydrated = false
    console.warn('[net] the server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('daily', setDaily)
  room.onMessage('gifts', setGifts)
  for (const answer of ['dailyResult', 'dailyUnlockResult', 'trackResult']) {
    room.onMessage(answer, (r) => {
      setDaily(r)
      waiting[answer]?.(r)
    })
  }
  room.onMessage('giftResult', (r) => {
    setGifts(r)
    waiting.giftResult?.(r)
  })
  for (const [type, fn] of extra) bindExtra(room, type, fn)
  // messages this client doesn't use yet
  for (const m of ['leaderboard', 'spins', 'spinResult']) room.onMessage(m, () => {})
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    updateRoom('')
    local.roll() // offline rules until the server is back
    setTimeout(connect, NET.rejoin * 1000)
  })
}

async function joinAnyRoom(options) {
  const launch = launchRoomId()
  if (launch && !SERVER_URL) {
    try {
      const at = await locateRoom(launch)
      if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
    } catch {
      // gone or full: matchmake instead
    }
  }
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(options.userId) ? undefined : options.userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry
let onlineSince = 0
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const options = { ...id, pfp: getPfp(), loadout: { cue: save.cue, tag: save.tag } }
    const { room, relay } = await joinAnyRoom(options)
    retryIn = NET.retry
    onlineSince = performance.now()
    attach(room)
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); playing on the browser save`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

let sentLoadout = ''
let lastTick = performance.now()
setInterval(() => {
  const t = performance.now()
  const dt = (t - lastTick) / 1000
  lastTick = t
  if (!document.hidden) save.playtime += dt
  if (!net.connected) local.tick(dt)
  else if (onlineSince && net.gifts && Date.now() + clockOffset >= net.gifts.nextResetAt) refreshDaily()
  if (net.connected) {
    const l = JSON.stringify({ cue: save.cue, tag: save.tag })
    if (l !== sentLoadout) send('loadout', JSON.parse((sentLoadout = l)))
  }
  if (!document.hidden && (dirty || performance.now() - savedAt >= NET.saveEvery * 1000) && performance.now() - savedAt >= 1000) saveNow()
}, 1000)
setInterval(() => local.save(), 15000)

export function initNet() {
  // the browser save first: played on until (or unless) the server answers
  const stored = localLoad()
  if (stored) hydrate(stored)
  settle()
  local.roll()
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
  if (!hasServer()) return console.info('[net] no server configured; progress is kept in this browser')
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp() })
    serverSave() // under the old identity before switching
    net.hydrated = false
    sentId = id.userId
    send('identify', { ...id, pfp: getPfp() })
  })
  // dev mode has no Bloxity auth: connect right away
  if (DEV_MODE) connect()
}
