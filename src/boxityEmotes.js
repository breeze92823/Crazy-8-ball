// Boxity's emote catalogue ({apiUrl}/v1/avatar/emotes): the emotes players pick in Boxity's own
// emote picker (the game registered the 'emotes' feature in bloxity.js). Each is { id, name, clip:
// { len, loop, tracks } }; avatar/animator.js playClip() plays a clip on the standard rig. Fetched
// once; the ids are opaque 24-char strings and the catalogue grows without a game release, so
// nothing here is hardcoded. The game's own emotes (emotes.js) are separate and keep their ids.
import { DEV_MODE } from './config.js'
import { apiUrl, onEnvironmentChanged, sdk } from './bloxity.js'

const byId = new Map()
let loading = null
let from = '' // the API the catalogue came from
// Told a different environment after boot (stage / local): read that one's catalogue instead.
onEnvironmentChanged(() => {
  if (from && from !== apiUrl()) {
    loading = null
    loadEmoteCatalog()
  }
})

// Starts the one fetch (no-op without the SDK, e.g. dev mode). Never throws.
export function loadEmoteCatalog() {
  if (loading || DEV_MODE || !sdk()) return loading
  from = apiUrl()
  loading = fetch(`${from}/v1/avatar/emotes`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const list = Array.isArray(data) ? data : data?.emotes
      if (Array.isArray(list)) for (const e of list) if (e?.id && e.clip?.tracks) byId.set(String(e.id), e)
    })
    .catch((err) => console.info('[emotes] Boxity catalogue unavailable', err?.message ?? err))
  return loading
}

// The catalogue entry for `id`, or null (unknown ids are ignored, never an error).
export const boxityEmote = (id) => (id && byId.get(id)) || null
