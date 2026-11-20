// The cue catalog (78 cues in 10 groups), lucky blocks and their odds, and the painters:
// a 2D thumbnail per cue / block (canvas data URLs, cached) and the 3D look applied to a
// buildCue() group (props.js part order: bumper, butt, wrap, joint, shaft, ferrule, tip).
// Prices are in-game cash only (never premium currency).
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { mulberry32 } from './textures.js'

// --- Rarities: Index section order, colours, the Index "buy one" price and the sell-dupe value.
export const RARITIES = {
  common: { name: 'Common', color: '#9aa4b5', dark: '#5d6677', bg: ['#ffffff', '#e6eaf0'], price: 5000, sell: 1000 },
  uncommon: { name: 'Uncommon', color: '#3ccf6e', dark: '#1d8a45', bg: ['#effff4', '#cdf3da'], price: 10000, sell: 2000 },
  rare: { name: 'Rare', color: '#3d8bff', dark: '#1f56b8', bg: ['#f0f6ff', '#cfe0fb'], price: 25000, sell: 5000 },
  epic: { name: 'Epic', color: '#a45cff', dark: '#6a2fc0', bg: ['#f7f0ff', '#e0cdfa'], price: 100000, sell: 20000 },
  legendary: { name: 'Legendary', color: '#ffb31a', dark: '#c27800', bg: ['#fff9e8', '#fbe2a6'], sell: 75000 },
  mythic: { name: 'Mythic', color: '#ff5ec4', dark: '#a8237c', bg: ['#4d4a8f', '#8a6fc0'], sell: 250000, shiny: true },
  secret: { name: 'Secret', color: '#ff3b3b', dark: '#8a1010', bg: ['#2b2c3a', '#4a4b5e'], sell: 1000000, shiny: true },
  ranked: { name: 'Ranked', color: '#ff9f1a', dark: '#b85d00', bg: ['#fff6ea', '#ffe1bd'], sell: 2500 },
  exclusive: { name: 'Exclusive', color: '#1ec8b0', dark: '#0f7e70', bg: ['#ecfffb', '#c6f2ea'], sell: 2500 },
  unique: { name: 'Unique', color: '#ff6fb5', dark: '#b8307a', bg: ['#fff0f7', '#fbd3e6'], sell: 2500 },
}
export const RARITY_ORDER = Object.keys(RARITIES)
// Sorting "Rarest first": higher = rarer.
const RANK_OF = { common: 0, uncommon: 1, rare: 2, epic: 3, ranked: 3.5, exclusive: 3.6, unique: 3.7, legendary: 4, mythic: 5, secret: 6 }
export const rarityRank = (r) => RANK_OF[r] ?? 0

// --- Cues: [id, name, rarity, shaft, butt, wrap, accent, glow, pattern, deco]
// pattern: plain | stripe | spiral | dots | flame | rainbow | sparkle | gradient | scales | check
// deco (tip ornament on the thumbnail): blade | broom | trident | crown | star | wings | pumpkin | gem
const C = [
  ['classic', 'Classic Cue', 'common', '#e7cd98', '#6b3a22', '#1b1b20', '#c9a14a', null, 'plain'],
  ['midnight', 'Midnight Cue', 'common', '#9aa0aa', '#23262e', '#111216', '#5b6170', null, 'plain'],
  ['arctic', 'Arctic Cue', 'common', '#f2f5f8', '#cfd8e2', '#8e9cad', '#ffffff', null, 'plain'],
  ['cherry', 'Cherry Cue', 'common', '#a7a2a4', '#8a2b35', '#2a2326', '#d9566a', null, 'stripe'],
  ['carbon', 'Carbon Cue', 'common', '#8c9097', '#2c2f35', '#15171b', '#4a4f57', null, 'check'],
  ['heritage', 'Heritage Cue', 'common', '#f0dcb0', '#c9b48a', '#6e5636', '#efe2c4', null, 'plain'],
  ['monarch', 'Monarch Cue', 'common', '#8e939b', '#3a3d45', '#1f2126', '#c0c4cc', null, 'stripe'],
  ['cobalt', 'Cobalt Cue', 'common', '#8d97a8', '#3f5578', '#1e2a40', '#7fa2d8', null, 'plain'],

  ['gummy', 'Gummy Cue', 'uncommon', '#ffd0e8', '#ff8ac6', '#7be0c8', '#fff27a', null, 'stripe'],
  ['flare', 'Flare Cue', 'uncommon', '#ff9a6b', '#e2522b', '#3a1d14', '#ffd27a', null, 'flame'],
  ['hornet', 'Hornet Cue', 'uncommon', '#4a4636', '#2a2820', '#f4c430', '#f4c430', null, 'stripe'],
  ['venom', 'Venom Cue', 'uncommon', '#5a6b55', '#2f3a2d', '#1a221a', '#5fe36a', null, 'spiral'],
  ['lagoon', 'Lagoon Cue', 'uncommon', '#9fd9d6', '#2e8f9a', '#164a52', '#7ff0e4', null, 'gradient'],
  ['splice', 'Splice Cue', 'uncommon', '#a3a7b3', '#4d5a7a', '#1f2433', '#e8eef8', null, 'spiral'],
  ['cosmo', 'Cosmo Cue', 'uncommon', '#7b7aa6', '#3b2f73', '#17142e', '#b59cff', null, 'dots'],
  ['gilded', 'Gilded Cue', 'uncommon', '#f3e3b8', '#d4a64a', '#3b2d14', '#fff1b8', null, 'stripe'],
  ['pixel', 'Pixel Cue', 'uncommon', '#7f8fb8', '#2f9bd6', '#1a1f3a', '#ff5e9c', null, 'check'],

  ['honeycomb', 'Honeycomb Cue', 'rare', '#ffd27a', '#e69a18', '#5a3608', '#fff1a8', '#ffb31a', 'scales'],
  ['neon', 'Neon Cue', 'rare', '#d8c0ff', '#8b3dff', '#1a1030', '#ff5ec4', '#c06bff', 'stripe'],
  ['nature', 'Nature Cue', 'rare', '#cfe3a8', '#6aa14a', '#3b2a16', '#bff07a', '#9cff6a', 'spiral'],
  ['candyCane', 'Candy Cane Cue', 'rare', '#fff4f4', '#ffffff', '#e8323c', '#e8323c', null, 'spiral'],
  ['frostbite', 'Frostbite Cue', 'rare', '#e8f8ff', '#9ddcff', '#4a8fc7', '#ffffff', '#9ee6ff', 'sparkle'],
  ['plasma', 'Plasma Cue', 'rare', '#c4b8ff', '#5b3de0', '#1a1440', '#ff6bf0', '#9b7bff', 'spiral'],
  ['blaze', 'Blaze Cue', 'rare', '#ffc27a', '#d8401a', '#2a1208', '#ffdd55', '#ff7a1a', 'flame'],
  ['phantom', 'Phantom Cue', 'rare', '#d9fff4', '#7fe0c8', '#2a4a48', '#ffffff', '#7fffe0', 'gradient'],
  ['tidal', 'Tidal Cue', 'rare', '#bfe8ff', '#1f7fd6', '#0d2f5a', '#7fe0ff', '#4cc4ff', 'spiral'],
  ['sakura', 'Sakura Cue', 'rare', '#ffe8f0', '#ffb3cf', '#6b3a4a', '#ffffff', '#ff9ec4', 'dots'],
  ['circuit', 'Circuit Cue', 'rare', '#9fb0a8', '#1f3a2f', '#0d1a14', '#3dff8a', '#3dff8a', 'check'],
  ['coral', 'Coral Cue', 'rare', '#ffd7c4', '#ff7a5c', '#5a2a20', '#fff0e0', '#ff9a7a', 'scales'],
  ['volt', 'Volt Cue', 'rare', '#fff6b0', '#3a3a48', '#16161e', '#ffe53d', '#ffe53d', 'stripe'],
  ['mirage', 'Mirage Cue', 'rare', '#ffe8c4', '#e0a96a', '#5a3a20', '#7fd8ff', '#ffc27a', 'gradient'],

  ['void', 'Void Cue', 'epic', '#4b3f73', '#1a1030', '#08060f', '#9b6bff', '#8a4dff', 'sparkle'],
  ['shootingStar', 'Shooting Star Cue', 'epic', '#e8e4ff', '#3a2f8a', '#120e30', '#fff27a', '#fff27a', 'sparkle', 'star'],
  ['magma', 'Magma Cue', 'epic', '#6b4a3a', '#2a1410', '#120806', '#ff6a1a', '#ff5a1a', 'flame'],
  ['toxic', 'Toxic Cue', 'epic', '#c8f0a0', '#2a3a1a', '#101a08', '#7dff3d', '#7dff3d', 'spiral'],
  ['bloodMoon', 'Blood Moon Cue', 'epic', '#8a5a5a', '#5a0f14', '#1a0608', '#ff3d4a', '#ff2a3a', 'gradient'],
  ['prism', 'Prism Cue', 'epic', '#ffffff', '#e8eef8', '#9aa8c0', '#7fe0ff', '#ffffff', 'rainbow'],
  ['aurora', 'Aurora Cue', 'epic', '#bff0e8', '#1a5a6a', '#0a2030', '#7dffb0', '#5affd0', 'gradient'],
  ['disco', 'Disco Cue', 'epic', '#e8e8f0', '#b8bccc', '#3a3d4a', '#ff5ec4', '#ffffff', 'check'],
  ['galaxy', 'Galaxy Cue', 'epic', '#b8a8ff', '#2a1a6a', '#0a0620', '#ff9ef0', '#b08cff', 'sparkle'],
  ['cyber', 'Cyber Cue', 'epic', '#a8f0ff', '#14243a', '#060c18', '#3de8ff', '#3de8ff', 'check'],
  ['crystal', 'Crystal Cue', 'epic', '#f0f8ff', '#c8e8ff', '#6a8ab8', '#ffffff', '#c8f0ff', 'scales', 'gem'],
  ['tempest', 'Tempest Cue', 'epic', '#c8d0e0', '#3a4a6a', '#141a2a', '#a8c8ff', '#8ab4ff', 'spiral'],

  ['chroma', 'Chroma Cue', 'legendary', '#ffffff', '#2a2a3a', '#101018', '#ff5ec4', '#ffffff', 'rainbow'],
  ['thunderstrike', 'Thunderstrike Cue', 'legendary', '#d8ecff', '#1f4fa8', '#0a1838', '#7fd8ff', '#5ac8ff', 'stripe'],
  ['phoenix', 'Phoenix Cue', 'legendary', '#ffe08a', '#e04a1a', '#3a1008', '#ffd23d', '#ff8a1a', 'flame', 'wings'],
  ['kraken', 'Kraken Cue', 'legendary', '#a8e0f0', '#2a4a8a', '#0a1a3a', '#c06bff', '#5ab8ff', 'dots'],
  ['seraph', 'Seraph Cue', 'legendary', '#fffbe8', '#f0e0b0', '#b89a4a', '#ffffff', '#fff2b0', 'sparkle', 'wings'],
  ['infernal', 'Infernal Cue', 'legendary', '#8a4a3a', '#3a0a08', '#120404', '#ff3d1a', '#ff3d1a', 'flame'],
  ['clockwork', 'Clockwork Cue', 'legendary', '#c8b08a', '#5a4a3a', '#2a2018', '#e8c070', '#ffd27a', 'check'],
  ['cursedKatana', 'Cursed Katana', 'legendary', '#e8e8f0', '#4a1a3a', '#1a0814', '#ff6bd0', '#ff4ac0', 'scales', 'blade'],

  ['celestialDragon', 'Celestial Dragon Cue', 'mythic', '#e8f8ff', '#3a6ab8', '#10204a', '#ffe08a', '#9ee6ff', 'scales', 'wings'],
  ['kitsune', 'Kitsune Cue', 'mythic', '#fff0f8', '#c86ad8', '#3a1448', '#ffb3e8', '#ff9ef0', 'flame'],
  ['apex', 'Apex Cue', 'mythic', '#e8fff0', '#1a6a5a', '#082a24', '#ffb31a', '#3dffc8', 'spiral', 'gem'],
  ['executionersSword', "Executioner's Sword", 'mythic', '#fff8d0', '#3a2a10', '#140e04', '#ffe53d', '#ffe53d', 'stripe', 'blade'],

  ['eclipse', 'Eclipse Cue', 'secret', '#2a2a3a', '#0a0a10', '#000000', '#ffd27a', '#ffd27a', 'gradient', 'gem'],
  ['kingOfCues', 'King of Cues', 'secret', '#ffe8a8', '#c8301a', '#3a0a08', '#ffd23d', '#ff6a3d', 'rainbow', 'crown'],
  ['honored', 'Honored Cue', 'secret', '#e8f0ff', '#2a3a5a', '#0a1020', '#c8d8ff', '#a8c0ff', 'sparkle', 'star'],

  ['bronze', 'Bronze Cue', 'ranked', '#e0b48a', '#a8602a', '#3a1e0a', '#ffcf9a', null, 'stripe'],
  ['silver', 'Silver Cue', 'ranked', '#e8ecf0', '#9aa4b0', '#3a3f48', '#ffffff', null, 'stripe'],
  ['gold', 'Gold Cue', 'ranked', '#fff0b0', '#e0b030', '#4a3608', '#fff8d0', '#ffe080', 'stripe'],
  ['platinum', 'Platinum Cue', 'ranked', '#f0f4ff', '#b8c8e0', '#4a5a78', '#ffffff', '#d8e8ff', 'stripe'],
  ['diamond', 'Diamond Cue', 'ranked', '#e8fbff', '#5ad0e8', '#145a6a', '#ffffff', '#8af0ff', 'scales', 'gem'],
  ['expert', 'Expert Cue', 'ranked', '#ffd8d8', '#d0303a', '#3a0a0e', '#ffb0b0', '#ff5a6a', 'stripe'],
  ['veteran', 'Veteran Cue', 'ranked', '#d8f8d8', '#3a9a4a', '#0e3a16', '#c8ffb0', '#6aff8a', 'spiral'],
  ['master', 'Master Cue', 'ranked', '#efe0ff', '#7a3ad0', '#24104a', '#e0c0ff', '#b07aff', 'spiral'],
  ['grandmaster', 'Grandmaster Cue', 'ranked', '#fff4c8', '#2a2a30', '#0e0e12', '#ffd23d', '#ffd23d', 'stripe', 'crown'],
  ['legend', 'Legend Cue', 'ranked', '#ffffff', '#ff7ab8', '#3a1430', '#ffe08a', '#ffffff', 'rainbow', 'crown'],

  ['vip', 'VIP Cue', 'exclusive', '#fff4c8', '#1a1a20', '#0a0a0e', '#ffd23d', '#ffd23d', 'stripe', 'gem'],
  ['starter', 'Starter Cue', 'exclusive', '#e7cd98', '#2f7fe0', '#ffd23d', '#ffffff', null, 'plain'],
  ['eightBall', '8 Ball Cue', 'exclusive', '#c8ccd8', '#1a1a22', '#3a4a8a', '#ffffff', null, 'dots'],

  ['firework', 'Firework Cue', 'unique', '#fff0f8', '#3a2a6a', '#120a2a', '#ff5ec4', '#ffe53d', 'sparkle', 'star'],
  ['beta', 'Beta Cue', 'unique', '#d8e8ff', '#2a5ad8', '#0a1a4a', '#7fd8ff', '#5ac8ff', 'check'],
  ['jackOLantern', "Jack-o'-Lantern Cue", 'unique', '#ffd8a0', '#e8701a', '#1a3a10', '#ffd23d', '#ff9a1a', 'stripe', 'pumpkin'],
  ['pitchfork', 'Pitchfork Cue', 'unique', '#ffd0d0', '#c8202a', '#3a0808', '#ff6a6a', '#ff3d3d', 'plain', 'trident'],
  ['witchsBroom', "Witch's Broom", 'unique', '#d8c090', '#6a4a2a', '#3a2a5a', '#b08cff', null, 'spiral', 'broom'],
  ['halloweenSword', 'Halloween Sword', 'unique', '#e8d8ff', '#4a1a6a', '#1a0a2a', '#ff9a1a', '#b07aff', 'scales', 'blade'],
  ['divine', 'Divine Cue', 'unique', '#fffbe8', '#e8f0e0', '#8ab08a', '#ffe08a', '#fff2b0', 'sparkle', 'wings'],
]

export const CUES = C.map(([id, name, rarity, shaft, butt, wrap, accent, glow, pattern, deco]) => ({ id, name, rarity, shaft, butt, wrap, accent, glow, pattern, deco: deco ?? null }))
export const CUE_BY_ID = Object.fromEntries(CUES.map((c) => [c.id, c]))
export const cueById = (id) => CUE_BY_ID[id] ?? CUE_BY_ID.classic
export const DEFAULT_CUE = 'classic'
export const cuesOf = (rarity) => CUES.filter((c) => c.rarity === rarity)

// How a cue is obtained (Index detail text) for the groups lucky blocks never roll.
export const HOW = {
  ranked: (c) => `Reach ${c.name.replace(' Cue', '')} in Ranked`,
  exclusive: { vip: 'Buy it here for cash', starter: 'Finish your first match', eightBall: 'Win 8 matches (Bonus reward)' },
  unique: 'Limited event cue',
}
// Exclusive cues that can be bought outright from the Index (cash only).
export const CUE_PRICES = { vip: 250000 }

// --- Lucky blocks: rarity weights (%). `time` = the Time Gift: opens once its timer runs out.
export const BLOCKS = {
  mystery: { name: 'Mystery Lucky Block', colors: ['#ff4d6d', '#ffd23d', '#3dff8a', '#3db8ff', '#a45cff'], weights: { common: 55, uncommon: 26, rare: 12, epic: 5, legendary: 1.6, mythic: 0.35, secret: 0.05 } },
  uncommon: { name: 'Uncommon Lucky Block', colors: ['#3ccf6e'], weights: { uncommon: 70, rare: 22, epic: 6.5, legendary: 1.3, mythic: 0.18, secret: 0.02 } },
  rare: { name: 'Rare Lucky Block', colors: ['#3d8bff'], weights: { rare: 72, epic: 21, legendary: 5.5, mythic: 1.3, secret: 0.2 } },
  epic: { name: 'Epic Lucky Block', colors: ['#a45cff'], weights: { epic: 78, legendary: 18, mythic: 3.5, secret: 0.5 } },
  legendary: { name: 'Legendary Lucky Block', colors: ['#ffb31a'], weights: { legendary: 85, mythic: 13, secret: 2 } },
  time: { name: 'Time Gift', colors: ['#ffc83d'], weights: { rare: 50, epic: 35, legendary: 12, mythic: 2.6, secret: 0.4 }, gift: true },
}
export const blockOf = (kind) => BLOCKS[kind] ?? BLOCKS.mystery

function pickRarity(weights, rand) {
  const entries = Object.entries(weights)
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of entries) if ((r -= w) <= 0) return k
  return entries[0][0]
}
const pickOf = (list, rand) => list[Math.floor(rand() * list.length)]
// A random cue id from a lucky block, or from one rarity (the Index's buy button).
export const rollBlock = (kind, rand = Math.random) => pickOf(cuesOf(pickRarity(blockOf(kind).weights, rand)), rand).id
export const rollRarity = (rarity, rand = Math.random) => pickOf(cuesOf(rarity), rand).id
// Chance (%) of a cue from a Mystery Lucky Block (0 for cues blocks never roll).
export function chanceOf(id) {
  const c = cueById(id)
  const w = BLOCKS.mystery.weights
  const total = Object.values(w).reduce((s, x) => s + x, 0)
  return w[c.rarity] ? (w[c.rarity] / total / cuesOf(c.rarity).length) * 100 : 0
}
export function fmtChance(p) {
  if (p >= 1) return `${p.toFixed(p >= 10 ? 0 : 1)}%`
  if (p >= 0.01) return `${p.toFixed(2)}%`
  return `1 in ${Math.round(100 / p).toLocaleString('en-US')}`
}

// --- 2D painters ---------------------------------------------------------------------
function patternFill(ctx, c, x, y, w, h, seed = 1) {
  const rand = mulberry32(seed)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = c.butt
  ctx.fillRect(x, y, w, h)
  const a = c.accent
  switch (c.pattern) {
    case 'stripe':
      ctx.fillStyle = a
      for (let i = 0; i < 4; i++) ctx.fillRect(x, y + h * (0.15 + i * 0.22), w, h * 0.05)
      break
    case 'spiral':
      ctx.fillStyle = a
      for (let i = -4; i < 12; i++) {
        ctx.beginPath()
        ctx.moveTo(x, y + i * h * 0.12)
        ctx.lineTo(x + w, y + i * h * 0.12 + h * 0.08)
        ctx.lineTo(x + w, y + i * h * 0.12 + h * 0.13)
        ctx.lineTo(x, y + i * h * 0.12 + h * 0.05)
        ctx.fill()
      }
      break
    case 'dots':
      ctx.fillStyle = a
      for (let i = 0; i < 26; i++) {
        ctx.beginPath()
        ctx.arc(x + rand() * w, y + rand() * h, w * (0.08 + rand() * 0.1), 0, 7)
        ctx.fill()
      }
      break
    case 'check':
      ctx.fillStyle = a
      for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) ctx.fillRect(x + (j * w) / 2, y + (i * h) / 20, w / 2, h / 20)
      break
    case 'flame': {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, a)
      g.addColorStop(0.5, c.butt)
      g.addColorStop(1, c.wrap)
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
      ctx.fillStyle = a
      for (let i = 0; i < 7; i++) {
        const fx = x + rand() * w
        ctx.beginPath()
        ctx.moveTo(fx - w * 0.3, y + h)
        ctx.quadraticCurveTo(fx, y + h * (0.2 + rand() * 0.3), fx + w * 0.3, y + h)
        ctx.fill()
      }
      break
    }
    case 'rainbow': {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      ;['#ff4d6d', '#ffb31a', '#ffe53d', '#3dff8a', '#3db8ff', '#a45cff', '#ff5ec4'].forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col))
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
      break
    }
    case 'gradient': {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, a)
      g.addColorStop(1, c.butt)
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
      break
    }
    case 'sparkle':
      ctx.fillStyle = a
      for (let i = 0; i < 22; i++) {
        const sx = x + rand() * w
        const sy = y + rand() * h
        const s = w * (0.06 + rand() * 0.12)
        ctx.beginPath()
        ctx.moveTo(sx, sy - s * 2)
        ctx.lineTo(sx + s * 0.5, sy)
        ctx.lineTo(sx, sy + s * 2)
        ctx.lineTo(sx - s * 0.5, sy)
        ctx.fill()
      }
      break
    case 'scales':
      ctx.strokeStyle = a
      ctx.lineWidth = Math.max(1, w * 0.08)
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 3; j++) {
          ctx.beginPath()
          ctx.arc(x + (j - (i % 2) * 0.5) * w * 0.5 + w * 0.25, y + (i * h) / 16, w * 0.28, 0, Math.PI)
          ctx.stroke()
        }
      break
  }
  ctx.restore()
}

const thumbs = new Map()
// A diagonal cue on a transparent square (bottom-left butt, top-right tip).
export function cueThumb(id, size = 160) {
  const key = `${id}|${size}`
  if (thumbs.has(key)) return thumbs.get(key)
  const c = cueById(id)
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')
  const L = size * 1.18
  ctx.translate(size * 0.14, size * 0.88)
  ctx.rotate(-Math.PI / 4.2)
  // cue along +x from 0 to L, centred on y = 0, butt radius r0 -> tip r1
  const r0 = size * 0.045
  const r1 = size * 0.018
  const seg = (a, b, fill, ra, rb) => {
    ctx.beginPath()
    ctx.moveTo(a * L, -ra)
    ctx.lineTo(b * L, -rb)
    ctx.lineTo(b * L, rb)
    ctx.lineTo(a * L, ra)
    ctx.closePath()
    if (typeof fill === 'function') {
      ctx.save()
      ctx.clip()
      fill(a * L, b * L)
      ctx.restore()
    } else {
      ctx.fillStyle = fill
      ctx.fill()
    }
  }
  const rAt = (t) => r0 + (r1 - r0) * t
  if (c.glow) {
    ctx.shadowColor = c.glow
    ctx.shadowBlur = size * 0.09
  }
  // outline pass
  ctx.fillStyle = '#14163a'
  ctx.beginPath()
  ctx.moveTo(-3, -r0 - 3)
  ctx.lineTo(L + 3, -r1 - 2)
  ctx.lineTo(L + 3, r1 + 2)
  ctx.lineTo(-3, r0 + 3)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  seg(0, 0.02, '#111', rAt(0), rAt(0.02))
  seg(0.02, 0.3, (a, b) => {
    ctx.save()
    ctx.translate(a, 0)
    ctx.rotate(-Math.PI / 2)
    patternFill(ctx, c, -r0, 0, r0 * 2, b - a, c.id.length * 7)
    ctx.restore()
  }, rAt(0.02), rAt(0.3))
  seg(0.3, 0.46, c.wrap, rAt(0.3), rAt(0.46))
  seg(0.46, 0.475, c.accent, rAt(0.46), rAt(0.475))
  seg(0.475, 0.985, c.shaft, rAt(0.475), rAt(0.985))
  seg(0.985, 1, '#2f5fd0', rAt(0.985), r1)
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(0.02 * L, -r0 * 0.6, 0.95 * L, r0 * 0.25)
  drawDeco(ctx, c, L, size)
  const url = cv.toDataURL()
  thumbs.set(key, url)
  return url
}

function drawDeco(ctx, c, L, size) {
  if (!c.deco) return
  const s = size * 0.11
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#14163a'
  ctx.lineWidth = Math.max(1.5, size * 0.015)
  ctx.fillStyle = c.glow || c.accent
  if (c.glow) {
    ctx.shadowColor = c.glow
    ctx.shadowBlur = size * 0.08
  }
  const tipX = L * 0.92
  const p = new Path2D()
  if (c.deco === 'blade') {
    p.moveTo(L * 0.5, -s * 0.45)
    p.lineTo(L * 1.02, -s * 0.15)
    p.lineTo(L * 1.06, 0)
    p.lineTo(L * 1.02, s * 0.15)
    p.lineTo(L * 0.5, s * 0.45)
    p.closePath()
    ctx.fillStyle = '#eef2fa'
    ctx.fill(p)
    ctx.stroke(p)
    ctx.fillStyle = c.accent
    ctx.fillRect(L * 0.47, -s * 0.9, s * 0.35, s * 1.8)
    ctx.strokeRect(L * 0.47, -s * 0.9, s * 0.35, s * 1.8)
  } else if (c.deco === 'broom') {
    p.moveTo(L * 0.84, -s * 0.25)
    p.lineTo(L * 1.04, -s * 0.9)
    p.lineTo(L * 1.06, s * 0.9)
    p.lineTo(L * 0.84, s * 0.25)
    p.closePath()
    ctx.fillStyle = '#e8b85a'
    ctx.fill(p)
    ctx.stroke(p)
  } else if (c.deco === 'trident') {
    for (const dy of [-0.7, 0, 0.7]) {
      ctx.beginPath()
      ctx.moveTo(L * 0.88, dy * s * 0.4)
      ctx.lineTo(L * 1.02, dy * s)
      ctx.lineTo(L * 0.97, dy * s)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.fillRect(L * 0.86, -s * 0.8, s * 0.25, s * 1.6)
  } else if (c.deco === 'wings') {
    for (const dir of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(L * 0.42, 0)
      ctx.quadraticCurveTo(L * 0.36, dir * s * 2.2, L * 0.22, dir * s * 2.1)
      ctx.quadraticCurveTo(L * 0.3, dir * s * 1.1, L * 0.3, dir * s * 0.3)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  } else {
    // star / crown / pumpkin / gem: an ornament at the joint
    const x = c.deco === 'star' ? tipX : L * 0.47
    ctx.beginPath()
    if (c.deco === 'star') {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.45 : s
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2
        ctx.lineTo(x + Math.cos(a) * r, Math.sin(a) * r)
      }
    } else if (c.deco === 'crown') {
      ctx.moveTo(x - s, s * 0.6)
      ctx.lineTo(x - s, -s * 0.7)
      ctx.lineTo(x - s * 0.4, -s * 0.1)
      ctx.lineTo(x, -s * 0.9)
      ctx.lineTo(x + s * 0.4, -s * 0.1)
      ctx.lineTo(x + s, -s * 0.7)
      ctx.lineTo(x + s, s * 0.6)
      ctx.fillStyle = '#ffd23d'
    } else if (c.deco === 'pumpkin') {
      ctx.ellipse(x, 0, s * 1.1, s * 0.9, 0, 0, 7)
      ctx.fillStyle = '#ff8a1a'
    } else {
      ctx.moveTo(x, -s)
      ctx.lineTo(x + s * 0.7, 0)
      ctx.lineTo(x, s)
      ctx.lineTo(x - s * 0.7, 0)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

// A lucky block: an isometric cube with "?" faces (a gift box with a clock for the Time Gift).
export function blockThumb(kind, size = 128) {
  const key = `block|${kind}|${size}`
  if (thumbs.has(key)) return thumbs.get(key)
  const b = blockOf(kind)
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')
  const cx = size / 2
  const s = size * 0.36
  const top = [[cx, size * 0.12], [cx + s, size * 0.12 + s * 0.55], [cx, size * 0.12 + s * 1.1], [cx - s, size * 0.12 + s * 0.55]]
  const left = [top[3], top[2], [cx, top[2][1] + s * 1.15], [cx - s, top[3][1] + s * 1.15]]
  const right = [top[2], top[1], [cx + s, top[1][1] + s * 1.15], [cx, top[2][1] + s * 1.15]]
  const cols = b.colors
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16)
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`
  }
  const face = (pts, k, i) => {
    ctx.beginPath()
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    if (cols.length > 1) {
      const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1])
      cols.forEach((c, j) => g.addColorStop(j / (cols.length - 1), shade(cols[(j + i) % cols.length], k)))
      ctx.fillStyle = g
    } else ctx.fillStyle = shade(cols[0], k)
    ctx.fill()
    ctx.lineWidth = size * 0.03
    ctx.strokeStyle = '#14163a'
    ctx.stroke()
  }
  face(left, 0.78, 1)
  face(right, 0.6, 2)
  face(top, 1.08, 0)
  ctx.font = `700 ${size * 0.3}px Fredoka, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = size * 0.035
  ctx.strokeStyle = '#14163a'
  ctx.fillStyle = '#fff'
  if (b.gift) {
    // ribbon + clock
    ctx.fillStyle = '#ff4d6d'
    ctx.fillRect(cx - size * 0.04, top[0][1] + s * 0.2, size * 0.08, s * 2)
    ctx.beginPath()
    ctx.arc(cx, size * 0.6, size * 0.16, 0, 7)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, size * 0.6)
    ctx.lineTo(cx, size * 0.5)
    ctx.moveTo(cx, size * 0.6)
    ctx.lineTo(cx + size * 0.07, size * 0.63)
    ctx.stroke()
  } else {
    for (const [pts, k] of [[left, -1], [right, 1]]) {
      const mx = (pts[0][0] + pts[2][0]) / 2
      const my = (pts[0][1] + pts[2][1]) / 2
      ctx.save()
      ctx.translate(mx, my)
      ctx.transform(1, k * 0.55, 0, 1, 0, 0)
      ctx.strokeText('?', 0, 0)
      ctx.fillText('?', 0, 0)
      ctx.restore()
    }
  }
  const url = cv.toDataURL()
  thumbs.set(key, url)
  return url
}

// --- 3D look ---------------------------------------------------------------------------
const mats = new Map()
function buttTexture(c) {
  const cv = document.createElement('canvas')
  cv.width = 32
  cv.height = 256
  const ctx = cv.getContext('2d')
  // the texture runs around the butt (u) and along it (v): paint the pattern down the strip
  patternFill(ctx, c, 0, 0, 32, 256, c.id.length * 7)
  const tex = new CanvasTexture(cv)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  return tex
}
// Materials for buildCue()'s seven parts, per cue id (cached: a cue is restyled, never rebuilt).
export function cueMaterials(id) {
  if (mats.has(id)) return mats.get(id)
  const c = cueById(id)
  const glow = (col, k) => (c.glow ? { emissive: col, emissiveIntensity: k } : {})
  const list = [
    new MeshStandardMaterial({ color: '#141418', roughness: 0.6 }),
    new MeshStandardMaterial({ color: '#ffffff', map: buttTexture(c), roughness: 0.4, metalness: 0.05, ...glow(c.glow, 0.25) }),
    new MeshStandardMaterial({ color: c.wrap, roughness: 0.75, ...glow(c.glow, 0.35) }),
    new MeshStandardMaterial({ color: c.accent, roughness: 0.3, metalness: 0.6, ...glow(c.glow, 0.8) }),
    new MeshStandardMaterial({ color: c.shaft, roughness: 0.45, ...glow(c.glow, 0.12) }),
    new MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.3 }),
    new MeshStandardMaterial({ color: '#2f5fd0', roughness: 0.9 }),
  ]
  mats.set(id, list)
  return list
}
// Restyles a buildCue() group in place.
export function applyCueLook(group, id) {
  if (!group || group.userData.look === id) return
  group.userData.look = id
  const list = cueMaterials(id)
  group.children.forEach((m, i) => {
    if (list[i]) m.material = list[i]
  })
}
