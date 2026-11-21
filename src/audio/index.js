// Game audio, the one import the rest of the game uses. installAudio() once at
// boot (the context starts on the first gesture), setListener() every frame,
// at(x, z) for the gain/pan of a positional sound, sfx.<name>() for one-shots.
// Every button press anywhere gets its click here (one capture listener).
import { AUDIO } from '../config.js'
import { A, installAudio as installCore, isMuted, setMuted, setVolume, toggleMuted } from './core.js'
import * as sfx from './sfx.js'
import * as ambience from './ambience.js'
import * as music from './music.js'

export { sfx, setVolume, setMuted, isMuted, toggleMuted }
export const updateAmbience = ambience.update
export const updateMusic = music.update
export const audioReady = () => !!A.master

const listener = { x: 0, z: 0, yaw: 0 }
export function setListener(x, z, yaw) {
  listener.x = x
  listener.z = z
  listener.yaw = yaw
}
// Distance gain (full inside `near`, silent past `far`) and stereo pan from the camera's yaw.
export function at(x, z, near = AUDIO.near, far = AUDIO.far) {
  const dx = x - listener.x
  const dz = z - listener.z
  const d = Math.hypot(dx, dz)
  const k = Math.max(0, Math.min(1, 1 - (d - near) / (far - near)))
  // camera right vector for yaw: (cos, -sin)
  const pan = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / d)) : 0
  return { gain: k * k, pan, dist: d }
}

function onPress(e) {
  if (e.button > 0) return
  const b = e.target.closest?.('button, [role="button"]')
  if (!b || b.disabled || b.dataset.silent != null) return
  const pan = Math.max(-0.6, Math.min(0.6, (e.clientX / window.innerWidth - 0.5) * 1.2))
  if (b.classList.contains('touch-btn')) sfx.click(pan)
  else sfx.press(pan)
}

export function installAudio() {
  installCore()
  window.addEventListener('pointerdown', onPress, { capture: true, passive: true })
}
