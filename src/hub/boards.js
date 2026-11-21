// The two leaderboards in front of the lounge: TOP PLAYERS (most wins) and TOP COUNTRIES (wins
// summed per country). Live data from the game server's `leaderboard` message (backend
// leaderboard.ts: sent after the save loads and every minute): { boards: { wins: [{ name, value,
// flag }] }, ranks: { wins }, countries: [{ flag, value }], country: { flag, rank, value } | null }.
// Until it arrives (or with no server) the boards say so instead of showing made-up standings.
import { CanvasTexture, SRGBColorSpace } from 'three'
import { COUNTRIES, paintBoard } from './paint.js'

const COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ffa94d', '#63e6be', '#f783ac']
// A stable dot colour per name.
function colorOf(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}
const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

export function createBoards(mats, playerFlag) {
  const textures = mats.map(() => null)
  let data = null // the last `leaderboard` message
  let myWins = 0
  function paint(i, canvas) {
    textures[i]?.dispose()
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    textures[i] = t
    mats[i].map = t
    mats[i].needsUpdate = true
  }
  function render() {
    const players = (data?.boards?.wins ?? []).map((r) => ({ name: String(r.name || 'Player'), flag: r.flag || '', wins: Math.floor(r.value) || 0, color: colorOf(String(r.name || '')) }))
    const countries = (data?.countries ?? []).map((r) => ({ flag: r.flag, name: COUNTRIES[r.flag] ?? r.flag, wins: Math.floor(r.value) || 0 }))
    const rank = data?.ranks?.wins
    const empty = data ? 'No wins yet. Be the first!' : 'Loading...'
    let you = 'Win matches to get on the board!'
    if (rank) you = `You: #${rank} with ${plural(myWins, 'win')}`
    else if (myWins > 0) you = `You: ${plural(myWins, 'win')}. Keep going!`
    paint(0, paintBoard('players', players, you, undefined, undefined, empty))
    const mine = data?.country
    const name = COUNTRIES[playerFlag] ?? playerFlag
    paint(1, paintBoard('countries', countries, mine ? `Your country #${mine.rank}  ${name}` : `${name}: win to put it on the board!`, undefined, undefined, empty))
  }
  render()
  document.fonts?.load?.('700 64px Fredoka').then(() => render()).catch(() => {})
  return {
    // the server's standings (net.js `leaderboard`)
    setData(msg, wins) {
      if (!msg || typeof msg !== 'object') return
      data = msg
      myWins = wins ?? myWins
      render()
    },
    // this player's wins changed (a match won): the footer follows at once, the rows with the next refresh
    addWin(total) {
      myWins = total
      render()
    },
  }
}
