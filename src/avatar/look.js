// Builds a player's character from their Boxity look (this player: main.js; others: remotePlayers.js),
// in the order the docs recommend:
//   1. a custom character (avatar.getCharacterFor): its own GLB replaces the whole body (same bones,
//      so the animator plays on it unchanged; no skin, body parts or proportion sliders on it);
//   2. the platform character kit (character.dress) from the outfit key: Boxity's one-file outfit,
//      every slot including item types added later;
//   3. the manual path (loader.js): skin, body parts and every accessory from the CDN.
// Never throws: the worst case is the plain base rig.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { dressCharacter, getCharacterFor } from '../bloxity.js'
import { loadBaseCharacter, loadCustomCharacter } from './character.js'
import { isEquipped } from './cdn.js'
import { applyProportions, attachEquippedAccessories } from './loader.js'

// look: { equipped, proportions, skinUrl, outfitKey }. stale(): true once the caller no longer
// wants this build (a newer one started): the build then stops and frees what it made.
export async function buildLook(look, stale = () => false) {
  const { equipped, proportions, skinUrl, outfitKey } = look ?? {}
  try {
    if (equipped && isEquipped(equipped.characterId)) {
      const ch = await getCharacterFor(equipped)
      const custom = ch?.glbUrl ? await loadCustomCharacter(ch.glbUrl) : null
      if (custom) return custom
    }
    const root = await loadBaseCharacter()
    if (stale()) return root
    const kit = outfitKey ? await dressCharacter(THREE, GLTFLoader, root, outfitKey) : null
    if (stale()) {
      kit?.dispose?.()
      return root
    }
    if (kit) root.userData.kit = kit
    else if (equipped) await attachEquippedAccessories(root, equipped, { skinTextureUrl: skinUrl || undefined })
    applyProportions(root, proportions ?? null)
    return root
  } catch (err) {
    console.warn('[look] building the character failed', err)
    return loadBaseCharacter()
  }
}

// Takes the kit's outfit off a character that is being thrown away.
export function disposeLook(root) {
  try {
    root?.userData?.kit?.dispose?.()
  } catch {
    // Already gone.
  }
}
