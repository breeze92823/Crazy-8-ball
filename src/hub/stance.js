// How a player holds the cue: in the right hand while walking around the hub, and leaning
// over the table with it level while aiming. Used for this player's avatar (main.js, match.js)
// and the other real players' (remotePlayers.js).
import { PLAYER_DIMS, RIG_HEIGHT } from '../config.js'
import { buildCue } from './props.js'

// Gives a character a cue in its right hand (rig units: the rig is scaled to metres).
export function attachCue(character) {
  const arm = character.nodes?.ArmR1
  if (!arm) return null
  const cue = buildCue()
  cue.scale.setScalar(RIG_HEIGHT / PLAYER_DIMS.height)
  cue.position.set(0, -2.15, 0.15)
  cue.rotation.set(-0.42, 0, 0.18)
  cue.children.forEach((c) => (c.position.y -= 0.32)) // grip a little up from the butt
  arm.add(cue)
  return cue
}

// Leaning over the table with the cue level: written over the animator's pose.
export function aimPose(character, k, stroke = 0) {
  const n = character.nodes
  if (!n || k <= 0) return
  if (n.Spine1) n.Spine1.rotation.x += 0.75 * k
  if (n.Neck1) n.Neck1.rotation.x -= 0.45 * k
  if (n.ArmR1) n.ArmR1.rotation.x += (-1.0 + stroke * 0.5 - n.ArmR1.rotation.x) * k
  if (n.ArmL1) n.ArmL1.rotation.x += (-1.45 - n.ArmL1.rotation.x) * k
  if (n.LegL1) n.LegL1.rotation.x += -0.35 * k
  if (n.LegR1) n.LegR1.rotation.x += 0.15 * k
}
