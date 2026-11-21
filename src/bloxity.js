// The Bloxity (Legion) SDK facade. Every SDK call goes through here. Nothing
// here may throw when the SDK is missing: a blocked sdk.bloxity.io leaves the
// game fully playable on the default avatar and keyboard controls.
// Docs: https://docs.bloxity.io/#html5
import { GAME_SLUG, GAME_TITLE, SETTINGS, DEV_MODE, coerceSetting } from './config.js'

export function sdk() {
  if (DEV_MODE) return null
  return (typeof window !== 'undefined' && window.Legion && window.Legion.SDK) || null
}

// --- State --------------------------------------------------------------
export const settings = {}
for (const key of Object.keys(SETTINGS)) settings[key] = coerceSetting(key, SETTINGS[key].def)

// `user` is only written from onUserChanged (re-reading getUser()). `ready`
// flips once auth has settled so the signed-in avatar load isn't pre-empted.
export const authState = { ready: false, user: null, guest: null }

let latestEquipped = null
let latestProportions = null
const avatarListeners = new Set()
const proportionListeners = new Set()
const authListeners = new Set()
const settingListeners = new Set()
const respawnListeners = new Set()
const emoteListeners = new Set()
const chatListeners = new Set()
const breakListeners = new Set()
const envListeners = new Set()
const unsubscribers = []

function emit(listeners, ...args) {
  for (const fn of listeners) {
    try {
      fn(...args)
    } catch (err) {
      console.warn('[bloxity] listener threw', err)
    }
  }
}

// Fires on any customizer change (may fire twice: optimistic, then confirmed;
// keep handlers idempotent). Each returns an unsubscribe.
export function onAvatarChanged(fn) {
  avatarListeners.add(fn)
  return () => avatarListeners.delete(fn)
}
export function onProportionsChanged(fn) {
  proportionListeners.add(fn)
  return () => proportionListeners.delete(fn)
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  fn(authState)
  return () => authListeners.delete(fn)
}
// fn(key, value) on every change of a SETTINGS key (already coerced).
export function onSetting(fn) {
  settingListeners.add(fn)
  return () => settingListeners.delete(fn)
}
// The portal's own pause-menu "Respawn" button.
export function onRespawnRequest(fn) {
  respawnListeners.add(fn)
  return () => respawnListeners.delete(fn)
}
// Boxity's emote picker: fn(id) to play a catalogue emote (24-char id), fn('') to stop it.
export function onPortalEmote(fn) {
  emoteListeners.add(fn)
  return () => emoteListeners.delete(fn)
}
// Boxity chat in this player's room: fn({ userId, username, text, isGif, at, isLocalPlayer },
// bubbleText, seconds). Subscribing is the opt-in (Boxity only forwards chat to games that listen).
export function onChat(fn) {
  chatListeners.add(fn)
  return () => chatListeners.delete(fn)
}
// Ad breaks Boxity runs over the game: fn(true) when one starts (pause + mute), fn(false) when over.
export function onAdBreak(fn) {
  breakListeners.add(fn)
  return () => breakListeners.delete(fn)
}

// The told environment changed (an embedded game learns it from the portal handshake, after init).
export function onEnvironmentChanged(fn) {
  envListeners.add(fn)
  return () => envListeners.delete(fn)
}

// --- Environment ------------------------------------------------------------
// Where Boxity lives for this page (prod / stage / local), as the platform TOLD us: the SDK's
// environment(), else the page's injected window.BLOXITY_ENV, else prod. Never guessed from a URL.
const PROD_ENV = { env: 'prod', apiUrl: 'https://api.bloxity.io', playUrl: 'https://play.bloxity.io', portalUrl: 'https://bloxity.io', staticUrl: 'https://static.bloxity.io' }
export function environment() {
  try {
    const e = sdk()?.environment?.()
    if (e?.apiUrl) return e
  } catch {
    // Older SDK builds have no environment().
  }
  const told = typeof window !== 'undefined' ? window.BLOXITY_ENV : null
  return told?.apiUrl ? told : PROD_ENV
}
const trimSlash = (u) => String(u || '').replace(/\/$/, '')
export const apiUrl = () => trimSlash(environment().apiUrl)
export const staticUrl = () => trimSlash(environment().staticUrl)

// --- Auth ---------------------------------------------------------------
// The SDK fires onUserChanged immediately with a null user, then again once the
// portal handshake answers; a null user only settles auth after a grace period.
const GUEST_SETTLE_MS = 2500
let settleTimer = null

function settleAuth() {
  settleTimer = null
  if (authState.ready) return
  authState.ready = true
  emit(authListeners, authState)
}

function onUser() {
  const SDK = sdk()
  const user = SDK ? SDK.auth.getUser() : null
  latestEquipped = null // a different account's equip event must not linger
  latestProportions = null

  if (user || authState.ready) {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = null
    authState.ready = true
  } else if (!settleTimer) {
    settleTimer = setTimeout(settleAuth, GUEST_SETTLE_MS)
  }
  authState.user = user
  try {
    authState.guest = user || typeof SDK.auth.getGuest !== 'function' ? null : SDK.auth.getGuest()
  } catch {
    authState.guest = null
  }
  emit(authListeners, authState)
}

// Name for the HUD badge.
export function displayName() {
  const u = authState.user
  if (u) return u.displayName || u.username || u.name || 'Player'
  const g = authState.guest
  if (g) return g.displayName || g.username || g.name || 'Guest'
  return sdk() ? 'Guest' : 'Offline'
}

// The player's Bloxity profile picture (user, else the guest's derived one) as an absolute
// http(s) URL, '' when there is none. Relative paths resolve against the CDN (staticUrl).
export function getPfp() {
  const raw = authState.user?.pfp || authState.guest?.pfp
  if (typeof raw !== 'string' || !raw) return ''
  try {
    const url = new URL(raw, staticUrl())
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// --- Init ---------------------------------------------------------------
let initialised = false

export function init() {
  if (initialised) return
  initialised = true

  const SDK = sdk()
  if (!SDK) {
    if (DEV_MODE) console.info('[bloxity] VITE_DEV_MODE=true: skipping SDK/CDN, running on the default avatar')
    else console.info('[bloxity] SDK not loaded: running offline on the default avatar')
    authState.ready = true
    emit(authListeners, authState)
    return
  }

  try {
    SDK.init({ gameSlug: GAME_SLUG })
    // Boxity's emote button only shows over games that register, as soon as init returns.
    SDK.game.registerFeature?.('emotes')
    // Leaderboards: declared right after init (docs.bloxity.io) and on their own, so a later SDK
    // call failing can never skip it. Declaring is what creates the board (game page Leaderboard,
    // trophy button); the game server reports the scores (backend boxity.ts BOARDS, same declaration).
    try {
      SDK.leaderboard?.define?.(LEADERBOARDS)
    } catch (err) {
      console.warn('[bloxity] leaderboard.define failed', err)
    }
    SDK.game.loadingStep(`Loading ${GAME_TITLE}`)
    const offEnv = SDK.onEnvironmentChanged?.((e) => emit(envListeners, e))
    if (typeof offEnv === 'function') unsubscribers.push(offEnv)

    for (const key of Object.keys(SETTINGS)) {
      const off = SDK.settings.listen(key, (raw) => {
        const next = coerceSetting(key, raw)
        if (settings[key] === next) return
        settings[key] = next
        emit(settingListeners, key, next)
      })
      if (typeof off === 'function') unsubscribers.push(off)
    }
    SDK.settings.triggerAll?.()

    unsubscribers.push(SDK.auth.onUserChanged(onUser))

    if (typeof SDK.avatar?.onAvatarChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onAvatarChanged((equipped) => {
          // The event payload wins over getEquipped(), which can lag the event.
          if (equipped && typeof equipped === 'object') latestEquipped = equipped
          emit(avatarListeners)
        }),
      )
    }
    if (typeof SDK.avatar?.onProportionsChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onProportionsChanged((proportions) => {
          if (proportions && typeof proportions === 'object') latestProportions = proportions
          emit(proportionListeners)
        }),
      )
    }

    unsubscribers.push(
      SDK.player.onEvent((event, data) => {
        if (event === 'respawn_request') emit(respawnListeners)
        else if (event === 'play_emote' && typeof data === 'string') emit(emoteListeners, data)
        else if (event === 'stop_emote') emit(emoteListeners, '')
        // The portal took the mouse (its menu opened over the game): let go of pointer lock too.
        else if (event === 'pointer_lock_changed' && data === false && document.pointerLockElement) document.exitPointerLock?.()
      }),
    )
    // Overhead chat bubbles (main.js draws them over the name tags).
    if (typeof SDK.chat?.onMessage === 'function') {
      unsubscribers.push(
        SDK.chat.onMessage((m) => {
          if (!m || typeof m !== 'object') return
          let text = ''
          try {
            text = SDK.chat.bubbleText(m)
          } catch {
            text = m.isGif ? 'sent a GIF' : String(m.text ?? '')
          }
          emit(chatListeners, m, text, Number(SDK.chat.bubbleSeconds) || 4)
        }),
      )
    }
    // Ad breaks (midrolls, rewarded): the game pauses and goes quiet while one plays.
    if (SDK.ads) {
      const a = SDK.ads.onBreakStart?.(() => emit(breakListeners, true))
      const b = SDK.ads.onBreakEnd?.(() => emit(breakListeners, false))
      for (const off of [a, b]) if (typeof off === 'function') unsubscribers.push(off)
      // Screen ads: the screens this game has. No title menu (the hub is the menu); gameplay
      // banners stay off (the owner's choice).
      SDK.ads.declareScreens?.({ lobby: {}, results: {}, panel: {}, gameplay: {} })
    }

    SDK.game.loadingStep('Building the island')
  } catch (err) {
    console.warn('[bloxity] init failed; running without the SDK', err)
    authState.ready = true
    emit(authListeners, authState)
  }
}

export function loadingStep(text) {
  try {
    sdk()?.game.loadingStep(text)
  } catch {
    // Non-fatal.
  }
}

let announcedFirstFrame = false

// Call once the scene has rendered: tells the portal loading is done.
export function notifyFirstFrame() {
  if (announcedFirstFrame) return
  announcedFirstFrame = true
  const SDK = sdk()
  if (!SDK) return
  try {
    SDK.game.loadingEnd()
    SDK.game.gameplayStart()
  } catch {
    // Non-fatal.
  }
}

export function teardown() {
  for (const off of unsubscribers.splice(0)) {
    try {
      off()
    } catch {
      // Tearing down anyway.
    }
  }
  try {
    sdk()?.game.gameplayEnd()
  } catch {
    // Non-fatal.
  }
}

// --- Screen ads, rewarded ads -------------------------------------------------
// Tell Boxity which screen is showing: 'lobby' | 'results' | 'panel' | 'gameplay' ('' = none).
// Repeats are ignored; one screen shows at a time.
let screenNow = null
export function adScreen(type) {
  if (type === screenNow) return
  screenNow = type
  try {
    const ads = sdk()?.ads
    if (!ads) return
    if (type) ads.screen?.(type)
    else ads.hideScreen?.()
  } catch {
    // Cosmetic.
  }
}
export function rewardedAvailable() {
  try {
    return !!sdk()?.ads?.isAvailable?.()
  } catch {
    return false
  }
}
// { status: 'completed' | 'skipped' | 'no-fill' | 'blocked' | 'error' | 'denied' | 'disabled', rewardToken? }
export async function showRewarded(placement) {
  try {
    return (await sdk()?.ads?.showRewarded?.(placement)) ?? { status: 'disabled' }
  } catch {
    return { status: 'error' }
  }
}

// --- Boards, friend toasts, settings refresh -------------------------------------
// The leaderboards (the backend reports them; ids are permanent once created).
export const LEADERBOARDS = [{ id: 'wins', label: 'Wins', order: 'desc', mode: 'best', format: 'compact', reset: 'none' }]
// "Alex joined you" toasts (Boxity only shows them for friends): `already` = they were in the room
// when this player arrived.
export function reportPlayer(username, already) {
  if (!username) return
  try {
    const g = sdk()?.game
    if (already) g?.playerInRoom?.(username)
    else g?.playerJoined?.(username)
  } catch {
    // Cosmetic.
  }
}
// Re-fire every settings listener once the game's systems exist (audio, HUD).
export function triggerSettings() {
  try {
    sdk()?.settings?.triggerAll?.()
  } catch {
    // Non-fatal.
  }
}

// --- Identity for the game server -------------------------------------------------
// The player's Boxity JWT ('' for guests / no SDK): the server verifies it (backend boxity.ts).
export function getToken() {
  try {
    return sdk()?.auth?.getToken?.() || ''
  } catch {
    return ''
  }
}

// --- Avatar accessors (null when the SDK is unavailable or the call throws) ---
export function getEquippedAvatar() {
  if (latestEquipped) return latestEquipped
  try {
    return sdk()?.avatar.getEquipped() ?? null
  } catch {
    return null
  }
}

// { height, shoulderWidth, armLength, legOffsetX, torsoScaleX, neckHeight,
// headScale }, normalised around 1.0; loader.js applyProportions() consumes it.
export function getProportions() {
  try {
    const current = sdk()?.avatar.getProportions()
    return latestProportions ? { ...current, ...latestProportions } : current ?? null
  } catch {
    return latestProportions
  }
}

// The look as one key (every slot, a custom character, the proportions), for other players.
export function getOutfitKey() {
  try {
    return sdk()?.avatar?.getOutfitKey?.() || ''
  } catch {
    return ''
  }
}
// The platform character kit (three.js): dresses `root` (a player.glb clone) in the look `outfitKey`.
// Resolves the handle, or null when the kit is off / can't draw it (then the manual path draws it).
export async function dressCharacter(THREE, GLTFLoader, root, outfitKey) {
  try {
    const kit = sdk()?.character
    if (!kit?.dress || !outfitKey || (kit.canDress && !kit.canDress(outfitKey))) return null
    return (await kit.dress({ THREE, GLTFLoader, root, outfitKey, proportions: 'game' })) || null
  } catch (err) {
    console.warn('[bloxity] character kit failed', err)
    return null
  }
}
// The custom character an equipped set wears ({ glbUrl, ... }), or null.
export async function getCharacterFor(equipped) {
  try {
    const a = sdk()?.avatar
    if (!a || !equipped) return null
    return (await (a.getCharacterFor ? a.getCharacterFor(equipped) : a.getCharacter?.())) || null
  } catch {
    return null
  }
}
// The bone-attached accessory slots ({ field, bone, mirrorBone?, origin, ... }) and a worn
// accessory's { mesh, texture } URLs, from the SDK's registry ([] / null without it).
export function accessorySlots() {
  try {
    const s = sdk()?.avatar?.getAccessorySlots?.()
    return Array.isArray(s) ? s : []
  } catch {
    return []
  }
}
export function accessoryUrls(field, id) {
  try {
    return sdk()?.avatar?.getAccessoryUrls?.(field, id) || null
  } catch {
    return null
  }
}
// Another player's skin with their face, shirt and pants drawn on, or null.
export function getSkinTextureUrlFor(equipped) {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrlFor?.(equipped)
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

// Skin texture URL with the worn face, shirt and pants already drawn on.
export function getSkinTextureUrl() {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrl?.()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

export const canCustomize = () => typeof sdk()?.avatar?.toggleCustomizer === 'function'

// Opens / closes the portal's avatar editor; edits come back through onAvatarChanged.
export function toggleCustomizer() {
  try {
    sdk()?.avatar.toggleCustomizer()
  } catch {
    // Ignore.
  }
}

// --- Game server ------------------------------------------------------
// Bloxity hosting has no fixed socket URL: the matchmaker picks a pod with room (or wakes one) and
// the SDK returns its endpoint (the dev channel reaches the dev backend, prod the prod one). Each
// endpoint is pinned to one pod, so net.js builds a new Client per resolve.
export function canResolveServer() {
  try {
    return typeof sdk()?.net?.resolveEndpoint === 'function'
  } catch {
    return false
  }
}
// { endpoint, relayRoomId }: relayRoomId is the matchmaker relay pinning the pod (the endpoint is
// {playUrl}/v1/ws/<relayRoomId>). Rejects (net.js retries with backoff) when the matchmaker can't answer.
export async function resolveServerEndpoint(userId) {
  const { endpoint, roomId, cold } = await sdk().net.resolveEndpoint(GAME_SLUG, userId ? { userId } : undefined)
  if (cold) console.info('[net] waking up a server...')
  return { endpoint, relayRoomId: roomId }
}

// The ?roomId= the page was opened with: the game page's Open Rooms Join button (a bare Colyseus
// room id) or a friend invite (what updateRoom() reported: "<relayRoomId>~<colyseusRoomId>").
export function launchRoomId() {
  try {
    return new URLSearchParams(location.search).get('roomId') || ''
  } catch {
    return ''
  }
}

// Where a launch room lives: { endpoint, roomId, relayRoomId }, or null when it is gone, full or
// can't be found. A bare id needs the matchmaker's cross-pod directory (a plain joinById through
// any relay would usually land on another pod); a relay~room id is joined through its relay.
export async function locateRoom(id) {
  const playUrl = (() => {
    try {
      return sdk()?.environment?.()?.playUrl
    } catch {
      return '' // Older SDK builds have no environment().
    }
  })()
  if (!playUrl || !id) return null
  const base = playUrl.replace(/\/$/, '')
  const [relay, roomId] = id.includes('~') ? id.split('~', 2) : ['', id]
  if (relay) return { endpoint: `${base.replace(/^http/i, 'ws')}/v1/ws/${encodeURIComponent(relay)}`, roomId, relayRoomId: relay }
  const res = await fetch(`${base}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
  const rooms = res.ok ? (await res.json())?.rooms ?? [] : []
  const r = rooms.find((r) => r.colyseusRoomId === roomId && !r.locked && r.players < r.maxPlayers)
  return r ? { endpoint: r.joinUrl, roomId: r.colyseusRoomId, relayRoomId: r.relayRoomId } : null
}

// Reports the room this player is in ('' = not in a joinable room), so the portal's friend invites
// land in it.
export function updateRoom(roomId) {
  try {
    sdk()?.game?.updateRoom?.(roomId)
  } catch {
    // Ignore.
  }
}

// --- Portal -----------------------------------------------------------
export function showMenu() {
  try {
    sdk()?.portal.showMenu(true)
  } catch {
    // Ignore.
  }
}

// Where Boxity draws its own controls over the game: the toolbar in the top-left corner and
// the chat feed under it, as [{ id, left, top, width, height }] in CSS px. fn runs now and on
// every change (resize, toolbar change). Without the SDK (dev mode, blocked CDN) it gets the
// default footprint the SDK itself assumes until the portal reports, so the HUD is laid out
// the same everywhere. Returns an unsubscribe.
export function onReservedAreas(fn) {
  try {
    const off = sdk()?.ui?.onReservedAreasChange?.((areas) => fn(Array.isArray(areas) ? areas : []))
    if (typeof off === 'function') return off
  } catch {
    // Fall back to the estimate below.
  }
  const update = () => fn(estimatedReservedAreas(window.innerWidth, window.innerHeight))
  window.addEventListener('resize', update)
  update()
  return () => window.removeEventListener('resize', update)
}

// The SDK's estimate (legion-sdk ui.estimatedAreas): an 8 px margin round one row of buttons,
// the whole width on narrow phones, and the chat feed under it.
function estimatedReservedAreas(w, h) {
  const compact = w < 640 || h <= 500
  const toolbarHeight = 16 + (w < 640 ? 32 : w < 768 ? 40 : 44)
  const chatWidth = compact ? Math.min(w * 0.7, 260) : Math.min(w * 0.8, 360)
  return [
    { id: 'toolbar', left: 0, top: 0, width: Math.min(w, w < 480 ? w : 330), height: toolbarHeight },
    { id: 'chat', left: 0, top: toolbarHeight, width: Math.round(chatWidth + 8), height: compact ? 140 : 180 },
  ]
}

export function requestFullscreen(on) {
  try {
    const SDK = sdk()
    if (!SDK) return
    if (on) SDK.portal.requestFullscreen()
    else SDK.portal.exitFullscreen()
  } catch {
    // Ignore.
  }
}
