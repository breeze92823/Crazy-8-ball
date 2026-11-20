// The EMOTE button (bottom right) and its Emotes panel: a grid of emote tiles (silhouettes of each
// emote's pose, rendered once from the real rig), a star per tile to favourite it (favourites sort
// first, kept in this browser), and a footer naming the selected emote with the Avatar Shop button
// (the Bloxity avatar editor, when the portal offers one). Tapping a tile plays it (main.js sends
// it through the roster so the others see it). B toggles the panel; it hides during a match.
import { MeshBasicMaterial, PerspectiveCamera, Scene, Color, WebGLRenderTarget } from 'three'
import './emotemenu.css'
import { EMOTES, EMOTE_BY_ID } from '../emotes.js'
import { loadBaseCharacter } from '../avatar/character.js'
import { PlayerRig, PoseBuffer } from '../avatar/rig.js'
import * as bloxity from '../bloxity.js'
import { sfx } from '../audio/index.js'

const FAVS_KEY = 'crazy-8-ball.emoteFavs'
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// A blocky figure mid-dance: the button and panel icon.
const FIGURE = `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#14163a" stroke-width="3" stroke-linejoin="round">
<rect x="22" y="22" width="20" height="20" rx="3" fill="#36b9ff" transform="rotate(-8 32 32)"/>
<rect x="24" y="4" width="16" height="15" rx="3" fill="#ffd23d" transform="rotate(-12 32 12)"/>
<rect x="6" y="10" width="9" height="20" rx="3" fill="#ff5d73" transform="rotate(-40 10 20)"/>
<rect x="46" y="24" width="9" height="20" rx="3" fill="#ff5d73" transform="rotate(35 50 34)"/>
<rect x="20" y="42" width="10" height="18" rx="3" fill="#3dd16b" transform="rotate(14 25 50)"/>
<rect x="35" y="42" width="10" height="18" rx="3" fill="#3dd16b" transform="rotate(-24 40 50)"/>
</g><path d="M56 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" stroke="#14163a" stroke-width="1.5"/></svg>`
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" stroke-width="2" stroke-linejoin="round"/></svg>'
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>'

function loadFavs() {
  try {
    const v = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]')
    return Array.isArray(v) ? v.filter((id) => EMOTE_BY_ID[id]) : []
  } catch {
    return []
  }
}

// Each emote's silhouette at its `thumb` moment, rendered once off-screen with the main renderer.
async function renderThumbs(renderer, size = 144) {
  const char = await loadBaseCharacter()
  const scene = new Scene()
  scene.add(char)
  scene.overrideMaterial = new MeshBasicMaterial({ color: 0x0c0e1f })
  const rig = new PlayerRig(char)
  const pose = new PoseBuffer()
  const cam = new PerspectiveCamera(30, 1, 0.1, 40)
  cam.position.set(0, 1.12, 6.2)
  cam.lookAt(0, 1.12, 0)
  const rt = new WebGLRenderTarget(size, size)
  const px = new Uint8Array(size * size * 4)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const prevTarget = renderer.getRenderTarget()
  const prevColor = renderer.getClearColor(new Color())
  const prevAlpha = renderer.getClearAlpha()
  const prevShadows = renderer.shadowMap.autoUpdate
  renderer.shadowMap.autoUpdate = false
  const out = {}
  try {
    for (const e of EMOTES) {
      pose.reset()
      const spin = e.pose(pose, e.thumb) || 0
      rig.applyPose(pose)
      char.position.y = pose.bobY
      char.rotation.set(0, Math.atan2(Math.sin(spin), Math.cos(spin)), 0)
      renderer.setRenderTarget(rt)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.render(scene, cam)
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, px)
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4) // GL rows are bottom-up
      ctx.putImageData(img, 0, 0)
      out[e.id] = canvas.toDataURL()
    }
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.setClearColor(prevColor, prevAlpha)
    renderer.shadowMap.autoUpdate = prevShadows
    rt.dispose()
    scene.overrideMaterial.dispose()
  }
  return out
}

export function createEmoteMenu({ renderer, onPlay, onOpen }) {
  const root = document.createElement('div')
  root.id = 'emote-ui'
  root.innerHTML = `
<div class="em-panel" role="dialog" aria-label="Emotes">
  <div class="em-head"><span class="em-ico">${FIGURE}</span><h2 class="hud-outline">EMOTES</h2><button class="em-x" aria-label="Close">${CLOSE}</button></div>
  <div class="em-grid"></div>
  <div class="em-foot"><span class="em-sel"><b></b><small></small></span><button class="em-shop">Avatar Shop</button></div>
</div>
<button class="em-btn" aria-label="Emotes (B)"><span class="em-ico">${FIGURE}</span><span class="hud-outline">EMOTE</span></button>`
  document.body.appendChild(root)
  const panel = root.querySelector('.em-panel')
  const grid = root.querySelector('.em-grid')
  const btn = root.querySelector('.em-btn')
  const shop = root.querySelector('.em-shop')
  const selName = root.querySelector('.em-sel b')
  const selKind = root.querySelector('.em-sel small')

  let favs = loadFavs()
  let thumbs = null
  let thumbsPending = false
  let selected = EMOTES[0]
  let playing = null
  let shown = true
  const tiles = new Map() // id -> tile element

  for (const e of EMOTES) {
    const t = document.createElement('button')
    t.className = 'em-tile'
    t.dataset.id = e.id
    t.innerHTML = `<span class="em-pic"></span><span class="em-nm hud-outline">${esc(e.name)}</span><span class="em-star" role="button" aria-label="Favourite ${esc(e.name)}">${STAR}</span>`
    tiles.set(e.id, t)
  }
  function order() {
    const list = [...EMOTES].sort((a, b) => (favs.includes(b.id) ? 1 : 0) - (favs.includes(a.id) ? 1 : 0))
    for (const e of list) {
      const t = tiles.get(e.id)
      t.classList.toggle('fav', favs.includes(e.id))
      grid.append(t)
    }
  }
  order()
  function select(e) {
    selected = e
    selName.textContent = e.name
    selKind.textContent = `${e.kind} · ${e.loop ? 'loops until you move' : 'one-shot'}`
  }
  select(selected)

  function ensureThumbs() {
    if (thumbs || thumbsPending) return
    thumbsPending = true
    renderThumbs(renderer)
      .then((t) => {
        thumbs = t
        for (const [id, el] of tiles) el.querySelector('.em-pic').style.backgroundImage = `url(${t[id]})`
      })
      .catch((err) => console.warn('[emotes] thumbnails failed', err))
      .finally(() => (thumbsPending = false))
  }

  function setOpen(open) {
    if (open === root.classList.contains('open')) return
    if (open && !shown) return
    root.classList.toggle('open', open)
    if (open) {
      ensureThumbs()
      if (document.pointerLockElement) document.exitPointerLock?.()
      shop.hidden = !bloxity.canCustomize()
    }
    sfx.panel(open)
    onOpen?.(open)
  }

  btn.addEventListener('click', () => setOpen(!root.classList.contains('open')))
  root.querySelector('.em-x').addEventListener('click', () => setOpen(false))
  shop.addEventListener('click', () => {
    sfx.click()
    bloxity.toggleCustomizer()
  })
  grid.addEventListener('click', (ev) => {
    const tile = ev.target.closest('.em-tile')
    if (!tile) return
    const e = EMOTE_BY_ID[tile.dataset.id]
    if (ev.target.closest('.em-star')) {
      favs = favs.includes(e.id) ? favs.filter((id) => id !== e.id) : [...favs, e.id]
      try {
        localStorage.setItem(FAVS_KEY, JSON.stringify(favs))
      } catch {
        // this page only
      }
      sfx.toggle(favs.includes(e.id))
      order()
      return
    }
    select(e)
    sfx.press()
    onPlay(e)
  })
  // a tap or click anywhere else in the game closes it
  document.addEventListener('pointerdown', (ev) => {
    if (root.classList.contains('open') && !root.contains(ev.target) && ev.target === renderer.domElement) setOpen(false)
  })

  return {
    toggle: () => setOpen(!root.classList.contains('open')),
    close: () => setOpen(false),
    isOpen: () => root.classList.contains('open'),
    // the button (and panel) only in the hub
    setVisible(on) {
      if (on === shown) return
      shown = on
      root.classList.toggle('hidden', !on)
      if (!on) setOpen(false)
    },
    // the player's emote playing now (null = none): its tile glows
    setPlaying(id) {
      if (id === playing) return
      tiles.get(playing)?.classList.remove('playing')
      playing = id
      tiles.get(id)?.classList.add('playing')
    },
  }
}
