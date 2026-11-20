// The hub's DOM HUD: tutorial line, settings, players list, skip-tutorial,
// cash + streak, a Leave button while on a pad, and the world-anchored layers
// (name tags, the floating table card, popups) projected from 3D every frame.
import { Vector3 } from 'three'
import './hud.css'
import { flagDataUrl } from './paint.js'

const SVG = {
  gear: '<svg viewBox="0 0 24 24"><path fill="#e8eef8" stroke="#14163a" stroke-width="1.6" d="M10.3 2h3.4l.5 2.6 1.8.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.8 2.6.5v3.4l-2.6.5-.8 1.8 1.5 2.2-2.4 2.4-2.2-1.5-1.8.8-.5 2.6h-3.4l-.5-2.6-1.8-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.8L2 13.7v-3.4l2.6-.5.8-1.8-1.5-2.2 2.4-2.4 2.2 1.5 1.8-.8z"/><circle cx="12" cy="12" r="3.4" fill="#5b6b8c" stroke="#14163a" stroke-width="1.4"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M5 9l7 7 7-7" fill="none" stroke="#14163a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cash: '<svg viewBox="0 0 64 64"><g stroke="#14163a" stroke-width="2.5" stroke-linejoin="round"><path d="M6 34l30-14 22 12-30 14z" fill="#2f9e44"/><path d="M6 28l30-14 22 12-30 14z" fill="#51cf66"/><path d="M6 22l30-14 22 12-30 14z" fill="#8ce99a"/><ellipse cx="32" cy="20" rx="7" ry="4" fill="#2f9e44" stroke-width="2"/></g></svg>',
  flame: '<svg viewBox="0 0 20 24"><path d="M10 1c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" fill="#ff922b" stroke="#14163a" stroke-width="1.5"/><path d="M10 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-5z" fill="#ffd43b"/></svg>',
  crown: '<svg viewBox="0 0 26 22"><path d="M2 6l6 5 5-9 5 9 6-5-2 13H4z" fill="#ffd23d" stroke="#14163a" stroke-width="2" stroke-linejoin="round"/></svg>',
  people: '<svg viewBox="0 0 26 26"><g fill="#4dabf7" stroke="#14163a" stroke-width="1.8"><circle cx="17" cy="8" r="4"/><path d="M10 22c0-5 3-8 7-8s7 3 7 8z"/><circle cx="9" cy="10" r="4.4"/><path d="M1 24c0-5.5 3.5-8.5 8-8.5s8 3 8 8.5z"/></g></svg>',
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

export function createHud({ settings, onSetting, onSkip, onLeave }) {
  const root = el('div')
  root.id = 'hud'
  document.body.appendChild(root)

  // --- tutorial line ---
  const tut = el('div', 'hud-tut hud-outline', 'Join a table!')
  root.append(tut)

  // --- top right ---
  const tr = el('div', 'hud-tr')
  const row = el('div', 'hud-row')
  const gear = el('button', 'hud-gear hud-outline', `${SVG.gear}<span>Settings</span>`)
  gear.setAttribute('aria-label', 'Settings')
  const players = el('div', 'hud-players')
  const pill = el('button', 'hud-pill', `<span class="hud-outline pc">Players (1)</span>${SVG.chev}`)
  const list = el('div', 'hud-list')
  players.append(pill, list)
  row.append(gear, players)
  const skip = el('button', 'hud-skip hud-outline', 'Skip tutorial')
  tr.append(row, skip)
  root.append(tr)
  pill.addEventListener('click', () => players.classList.toggle('open'))
  skip.addEventListener('click', () => onSkip())

  // --- cash + streak ---
  const bl = el('div', 'hud-bl')
  const cash = el('div', 'hud-cash', `${SVG.cash}<span class="hud-outline">$0</span>`)
  const streak = el('div', 'hud-streak hud-outline hidden', `${SVG.flame}<span>0</span>`)
  bl.append(streak, cash)
  root.append(bl)

  const leave = el('button', 'hud-leave hud-outline hidden', 'Leave table')
  leave.addEventListener('click', () => onLeave())
  root.append(leave)

  // --- world layers ---
  const world = el('div', 'hud-world')
  root.append(world)
  const card = el('div', 'hud-card hidden')
  card.innerHTML = `<div class="card-title hud-outline">1v1</div><div class="card-host hud-outline">${SVG.crown}<span></span></div><div class="card-row"><span class="hud-outline">${SVG.people}<b>0/2</b></span><span class="card-mode hud-outline"><i></i>Classic</span></div><div class="card-status hud-outline">WAITING</div>`
  world.append(card)
  const toast = el('div', 'hud-toast hud-outline')
  root.append(toast)

  // --- settings window ---
  const modal = el('div', 'hud-modal')
  const win = el('div', 'hud-win')
  win.innerHTML = '<h2 class="hud-outline">Settings</h2>'
  const rows = [
    ['sfx', 'Sound effects', 'range'],
    ['ambience', 'Rooftop ambience', 'range'],
    ['piano', 'Lounge piano', 'switch'],
    ['guide', 'Guide arrow', 'switch'],
    ['tags', 'Name tags', 'switch'],
    ['night', 'Night mode', 'switch'],
  ]
  for (const [key, text, type] of rows) {
    const r = el('div', 'hud-set')
    r.append(el('span', '', text))
    if (type === 'range') {
      const input = el('input')
      input.type = 'range'
      input.min = 0
      input.max = 1
      input.step = 0.05
      input.value = settings[key]
      input.addEventListener('input', () => onSetting(key, Number(input.value)))
      r.append(input)
    } else {
      const b = el('button', `hud-switch${settings[key] ? ' on' : ''}`)
      b.setAttribute('aria-label', text)
      b.addEventListener('click', () => {
        const on = !b.classList.contains('on')
        b.classList.toggle('on', on)
        onSetting(key, on)
      })
      r.append(b)
    }
    win.append(r)
  }
  const close = el('button', 'hud-close hud-outline', 'Close')
  win.append(close, el('div', 'hud-keys', 'WASD move · Shift run · Space jump · Mouse look · Wheel zoom<br>V first person · N day/night · R respawn'))
  modal.append(win)
  root.append(modal)
  const setOpen = (open) => {
    modal.classList.toggle('open', open)
    onSetting('_modal', open)
  }
  gear.addEventListener('click', () => setOpen(true))
  close.addEventListener('click', () => setOpen(false))
  modal.addEventListener('pointerdown', (e) => {
    if (e.target === modal) setOpen(false)
  })

  // --- name tags ---
  const tags = new Map() // entity -> { el, streakEl }
  function tagFor(e) {
    let t = tags.get(e)
    if (!t) {
      const d = el('div', 'tag')
      d.innerHTML = `<div class="tag-streak hud-outline hidden">${SVG.flame}<span></span></div><div class="tag-row"><span class="tag-badge ${e.rank >= 8 ? 'r8' : e.rank >= 5 ? 'r5' : ''}"><i>${e.rank}</i></span><span class="hud-outline nm">${esc(e.name)}</span><img class="tag-flag" alt="" src="${flagDataUrl(e.flag)}"></div>`
      world.append(d)
      t = { el: d, streakEl: d.querySelector('.tag-streak'), num: d.querySelector('.tag-streak span'), last: -1 }
      tags.set(e, t)
    }
    return t
  }

  // --- popups ---
  const popups = []
  function popup(text, pos, color = '#ffd23d', size = 1) {
    const d = el('div', 'popup hud-outline', esc(text))
    d.style.color = color
    world.append(d)
    popups.push({ el: d, pos: pos.clone(), t: 0, size })
  }

  const v = new Vector3()
  let W = window.innerWidth
  let H = window.innerHeight
  window.addEventListener('resize', () => {
    W = window.innerWidth
    H = window.innerHeight
  })
  function project(p, camera) {
    v.copy(p).project(camera)
    if (v.z > 1 || v.z < -1) return null
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]
  }
  const head = new Vector3()

  let lastCash = null
  let lastStreak = -1
  let lastPlayers = ''
  let tutText = null
  let toastTimer = 0
  return {
    setReservedTop(px) {
      root.style.setProperty('--reserved-top', `${px}px`)
    },
    setTutorial(text) {
      if (text === tutText) return
      tutText = text
      tut.classList.toggle('hidden', !text)
      if (text) {
        tut.textContent = text
        tut.classList.remove('pop')
        void tut.offsetWidth
        tut.classList.add('pop')
      }
    },
    showSkip(on) {
      skip.classList.toggle('hidden', !on)
    },
    showLeave(on, text = 'Leave table') {
      leave.classList.toggle('hidden', !on)
      leave.textContent = text
    },
    setCash(n) {
      if (n === lastCash) return
      const bumped = lastCash !== null
      lastCash = n
      cash.querySelector('span').textContent = `$${n.toLocaleString('en-US')}`
      if (bumped) {
        cash.classList.remove('bump')
        void cash.offsetWidth
        cash.classList.add('bump')
      }
    },
    setStreak(n) {
      if (n === lastStreak) return
      lastStreak = n
      streak.classList.toggle('hidden', n <= 0)
      streak.querySelector('span').textContent = n
    },
    setPlayers(entities, me) {
      const sorted = [...entities].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
      const key = sorted.map((e) => `${e.name}${e.wins}`).join('|')
      if (key === lastPlayers) return
      lastPlayers = key
      pill.querySelector('.pc').textContent = `Players (${entities.length})`
      list.innerHTML = sorted.map((e) => `<div class="hud-li${e === me ? ' me' : ''}"><span class="dot" style="background:${e.color}"></span><span class="nm">${esc(e.name)}</span><img alt="" src="${flagDataUrl(e.flag)}"><span class="w">${e.wins}</span></div>`).join('')
    },
    toast(text, sub = '', seconds = 2.2) {
      toast.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`
      toast.classList.remove('show')
      void toast.offsetWidth
      toast.classList.add('show')
      toastTimer = seconds
    },
    popup,
    isModalOpen: () => modal.classList.contains('open'),
    // per frame: tags for entities, the card for `cardTable` (info object), popups
    update(dt, camera, entities, cardInfo, showTags) {
      if (toastTimer > 0) {
        toastTimer -= dt
        if (toastTimer <= 0) toast.classList.remove('show')
      }
      for (const e of entities) {
        const t = tagFor(e)
        head.set(e.x, (e.y ?? 0) + 2.35, e.z)
        const d = camera.position.distanceTo(head)
        const s = showTags && !e.hidden && d < 48 ? project(head, camera) : null
        if (!s) {
          t.el.style.display = 'none'
          continue
        }
        t.el.style.display = ''
        const k = Math.max(0.42, Math.min(1.05, 11 / d))
        t.el.style.transform = `translate(-50%, -100%) translate(${s[0]}px, ${s[1]}px) scale(${k})`
        t.el.style.zIndex = String(1000 - Math.round(d))
        if (t.last !== e.streak) {
          t.last = e.streak
          t.streakEl.classList.toggle('hidden', !(e.streak > 0))
          t.num.textContent = e.streak
        }
      }
      // table card
      if (cardInfo) {
        const s = project(cardInfo.pos, camera)
        if (s) {
          card.classList.remove('hidden')
          const d = camera.position.distanceTo(cardInfo.pos)
          const k = Math.max(0.5, Math.min(1, 12 / d))
          card.style.transform = `translate(-50%, -100%) translate(${s[0]}px, ${s[1]}px) scale(${k})`
          const key = JSON.stringify([cardInfo.title, cardInfo.host, cardInfo.count, cardInfo.status])
          if (card.dataset.key !== key) {
            card.dataset.key = key
            card.querySelector('.card-title').textContent = cardInfo.title
            const host = card.querySelector('.card-host')
            host.classList.toggle('hidden', !cardInfo.host)
            host.querySelector('span').textContent = cardInfo.host ?? ''
            card.querySelector('.card-row b').textContent = cardInfo.count
            const st = card.querySelector('.card-status')
            st.className = `card-status hud-outline ${cardInfo.status?.cls ?? 'hidden'}`
            st.textContent = cardInfo.status?.text ?? ''
          }
        } else card.classList.add('hidden')
      } else card.classList.add('hidden')
      // popups rise and fade
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i]
        p.t += dt
        p.pos.y += dt * 0.8
        const s = project(p.pos, camera)
        if (p.t > 1.6 || !s) {
          p.el.remove()
          popups.splice(i, 1)
          continue
        }
        const grow = p.t < 0.15 ? 0.4 + (p.t / 0.15) * 0.8 : 1.2 - Math.min(0.2, (p.t - 0.15) * 0.6)
        const d = camera.position.distanceTo(p.pos)
        const k = Math.max(0.5, Math.min(1.3, 14 / d)) * grow * p.size
        p.el.style.transform = `translate(-50%, -50%) translate(${s[0]}px, ${s[1]}px) scale(${k}) rotate(-4deg)`
        p.el.style.opacity = String(Math.min(1, (1.6 - p.t) * 2))
      }
    },
  }
}
