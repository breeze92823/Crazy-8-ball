// The two leaderboards in front of the lounge: top players and top countries.
// Seeded sample standings (there is no server yet); the player's own country
// row and rank update as they win.
import { CanvasTexture, SRGBColorSpace } from 'three'
import { mulberry32 } from '../textures.js'
import { COUNTRIES, paintBoard } from './paint.js'

const NAMES = ['GlassCannon_ace', 'velvetcue', 'Kai_breaks', 'nova.shots', 'TopSpinTia', 'rookie_rafa', 'masse_mo', 'SnookSquad', 'cozybanker', 'J4ckpot_J', 'liltwist', 'OrbitOllie']
const COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ffa94d', '#63e6be', '#f783ac']

export function createBoards(mats, playerFlag) {
  const rand = mulberry32(8)
  const flags = Object.keys(COUNTRIES)
  const players = NAMES.slice(0, 10).map((name, i) => ({ name, flag: flags[Math.floor(rand() * flags.length)], wins: Math.round(1570 - i * 52 - rand() * 40), color: COLORS[i % COLORS.length] }))
  const countries = ['BR', 'PH', 'US', 'ID', 'TH', 'MY', 'MX', 'GB', 'IN', 'VN', 'DE', 'FR', 'CA', 'ES', 'JP', 'KR', 'PL', 'TR', 'IT', 'LK'].map((code, i) => ({ flag: code, name: COUNTRIES[code], wins: Math.round(2823341 * Math.pow(0.72, i) * (0.9 + rand() * 0.2)) }))
  countries.sort((a, b) => b.wins - a.wins)
  const textures = mats.map(() => null)
  function paint(i, canvas) {
    textures[i]?.dispose()
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    textures[i] = t
    mats[i].map = t
    mats[i].needsUpdate = true
  }
  function render(playerWins = 0) {
    const mine = countries.find((c) => c.flag === playerFlag)
    const rank = mine ? countries.indexOf(mine) + 1 : countries.length + 1
    paint(0, paintBoard('players', players, playerWins ? `You: ${playerWins} wins. Keep going!` : 'Win matches to get on the board!'))
    paint(1, paintBoard('countries', countries, `Your country  #${rank}  ${COUNTRIES[playerFlag] ?? ''}`))
  }
  render()
  document.fonts?.load?.('700 64px Fredoka').then(() => render()).catch(() => {})
  return {
    // a win adds to the player's country and re-sorts
    addWin(total) {
      const mine = countries.find((c) => c.flag === playerFlag)
      if (mine) mine.wins += 1
      countries.sort((a, b) => b.wins - a.wins)
      render(total)
    },
  }
}
