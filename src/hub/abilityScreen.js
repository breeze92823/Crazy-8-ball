// The Ability Spin screen. Laid over the hub with the camera turned to face the player:
//   left   - ability slots (equip, lock, buy a NEW SLOT with cash)
//   top    - CURRENT ABILITY: name, icon and what it does (the reel spins here)
//   middle - code box (FREESPINS / 120KLIKES), SPIN + spins left
//   right  - Odds by rarity (expandable), pity counter, spin packs and the "$10,000 - 1 spin" bar
// Every price is cash (never premium currency). The rules + server calls live in abilityStore.js.
// Portrait phones stack the panels; the Odds list becomes a sheet behind an "Odds" button.
import './abilityScreen.css'
import { ABILITIES, ABILITY_BY_ID, ABILITY_RARITIES, ABILITY_SPIN, RARITY, abilitiesOf, abilityChance, abilityIcon, formatChance } from '../abilities.js'
import * as asfx from '../audio/abilitySfx.js'
import { sfx } from '../audio/index.js'
import { save, onChange } from '../progress.js'
import { setMoveLock } from '../input.js'
import { player } from '../player.js'
import { Vector3 } from 'three'
import { buySpins, equipSlot, isBusy, lockSlot, mode, onAbilities, redeemCode, spinAbility, state, unlockSlot } from './abilityStore.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`
const short = (n) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1000 ? `$${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : `$${n}`)
const SVG = {
  plus: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#e9eef7" stroke="#8a95ab" stroke-width="3"/><path d="M20 11v18M11 20h18" stroke="#8a95ab" stroke-width="5" stroke-linecap="round"/></svg>',
  lockOn: '<svg viewBox="0 0 24 28"><path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke="#14163a" stroke-width="3.4"/><path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke="#c9cfdb" stroke-width="1.6"/><rect x="2" y="12" width="20" height="14" rx="3" fill="#ffc21a" stroke="#14163a" stroke-width="2.4"/><circle cx="12" cy="19" r="2.2" fill="#14163a"/></svg>',
  lockOff: '<svg viewBox="0 0 24 28"><path d="M6 12V8a6 6 0 0 1 11-3" fill="none" stroke="#14163a" stroke-width="3.4"/><path d="M6 12V8a6 6 0 0 1 11-3" fill="none" stroke="#c9cfdb" stroke-width="1.6"/><rect x="2" y="12" width="20" height="14" rx="3" fill="#dfe5ef" stroke="#14163a" stroke-width="2.4"/><circle cx="12" cy="19" r="2.2" fill="#14163a"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spin: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#ffd23d" stroke="#14163a" stroke-width="2.6"/><path d="M28 12a11 11 0 1 0 3 9" fill="none" stroke="#14163a" stroke-width="3" stroke-linecap="round"/><path d="M31 8v6h-6" fill="none" stroke="#14163a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 13l-5 8h5l-2 7 6-9h-5z" fill="#fff" stroke="#14163a" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cash: '<svg viewBox="0 0 64 64"><g stroke="#14163a" stroke-width="2.5" stroke-linejoin="round"><path d="M6 34l30-14 22 12-30 14z" fill="#2f9e44"/><path d="M6 28l30-14 22 12-30 14z" fill="#51cf66"/><path d="M6 22l30-14 22 12-30 14z" fill="#8ce99a"/><ellipse cx="32" cy="20" rx="7" ry="4" fill="#2f9e44" stroke-width="2"/></g></svg>',
  token: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff" stroke="#14163a" stroke-width="2.4"/><circle cx="12" cy="12" r="4" fill="#14163a"/></svg>',
}
const REASON = {
  none: 'No spins left! Buy some or redeem a code.',
  locked: 'This slot is locked! Unlock it or equip another slot to spin.',
  cash: 'Not enough cash!',
  invalid: "That code doesn't exist.",
  used: 'You already used that code.',
  offline: 'Reconnecting to the server... try again in a moment.',
  timeout: 'The server took too long. Try again!',
  busy: 'One moment...',
  slot: 'Unlock the slots in order.',
  loading: 'Still loading your save...',
  save: "Couldn't save that. Try again!",
  guest: 'Sign in to keep your abilities!',
  pack: 'That pack is gone.',
}

export function createAbilityScreen({ onOpen, onClose } = {}) {
  const root = document.createElement('div')
  root.className = 'ab-root'
  root.innerHTML = `
    <div class="ab-screen hidden" role="dialog" aria-label="Abilities">
      <div class="ab-slots"></div>
      <div class="ab-head">
        <div class="ab-cur ab-o">CURRENT ABILITY:</div>
        <div class="ab-title"><span class="ic"></span><h1 class="nm"></h1></div>
        <p class="ab-desc ab-o"></p>
        <div class="ab-rar"></div>
      </div>
      <div class="ab-hint ab-o">Type <b>${ABILITY_SPIN.codeBanner}</b> for ${ABILITY_SPIN.codes[ABILITY_SPIN.codeBanner]} free spins!</div>
      <div class="ab-codes ab-panel">
        <div class="msg ab-o">USE CODE <b>${ABILITY_SPIN.likesCode}</b> FOR FREE SPINS</div>
        <div class="msg sub ab-o">NEXT CODE AT <b>${ABILITY_SPIN.nextCodeLikes}</b> LIKES</div>
        <form class="row"><input type="text" maxlength="24" placeholder="Enter code" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code"><button type="submit" class="redeem ab-o">Redeem</button></form>
      </div>
      <div class="ab-spin">
        <button class="ab-spinbtn"><span class="ic">${SVG.spin}</span><span class="t ab-o">SPIN</span></button>
        <div class="ab-left ab-o">Spins left: <b>0</b></div>
      </div>
      <button class="ab-oddsbtn ab-o">Odds</button>
      <div class="ab-odds ab-panel">
        <h2 class="ab-o">Odds</h2>
        <button class="ab-oddsclose" aria-label="Close odds">✕</button>
        <div class="list"></div>
        <div class="ab-pity"><div class="fill"></div><span class="ab-o"></span></div>
      </div>
      <div class="ab-shop ab-panel">
        <div class="cash">${SVG.cash}<span class="ab-o"></span></div>
        <div class="packs"></div>
        <button class="ab-quick"><span class="ic">${SVG.cash}</span><span class="t ab-o"></span></button>
      </div>
      <button class="ab-back ab-o">${SVG.back}<span>Back</span></button>
      <div class="ab-toast ab-o"></div>
      <div class="ab-reveal hidden"><div class="rays"></div><div class="card"><div class="rr ab-o"></div><div class="ic"></div><div class="nm ab-o"></div><div class="new ab-o">EQUIPPED!</div></div></div>
    </div>`
  document.body.appendChild(root)
  // The entry button joins the hub's left button stack (menus.js .mn-side) when there is one.
  const entry = document.createElement('button')
  entry.setAttribute('aria-label', 'Abilities')
  entry.innerHTML = '<span class="ic"></span><span class="t mo ab-o">Abilities</span><i class="ab-badge hidden">0</i>'
  const stack = document.querySelector('.mn .mn-side')
  if (stack) {
    entry.className = 'mn-sbtn ab-entry-s'
    stack.prepend(entry)
  } else {
    entry.className = 'ab-entry'
    root.prepend(entry)
  }
  const $ = (s) => root.querySelector(s)
  const screen = $('.ab-screen')
  const els = {
    entry,
    badge: entry.querySelector('.ab-badge'),
    slots: $('.ab-slots'),
    head: $('.ab-head'),
    titleIc: $('.ab-title .ic'),
    titleNm: $('.ab-title .nm'),
    desc: $('.ab-desc'),
    rar: $('.ab-rar'),
    input: $('.ab-codes input'),
    spinBtn: $('.ab-spinbtn'),
    left: $('.ab-left b'),
    odds: $('.ab-odds'),
    list: $('.ab-odds .list'),
    pity: $('.ab-pity'),
    cash: $('.ab-shop .cash span'),
    packs: $('.ab-shop .packs'),
    quick: $('.ab-quick'),
    toast: $('.ab-toast'),
    reveal: $('.ab-reveal'),
  }
  entry.querySelector('.ic').innerHTML = abilityIcon('fireShot')

  // --- odds list (built once; rows open / close) ---
  const open = new Set()
  els.list.innerHTML = ABILITY_RARITIES.map(
    (r) => `<div class="grp" data-r="${r.id}" style="--c:${r.color};--d:${r.dark};--g:${r.grad ?? `linear-gradient(180deg,${r.light},${r.color} 55%,${r.dark})`}">
      <button class="hd"><span class="ab-o">${r.name} ${formatChance(r.chance)}</span>${SVG.chev}</button>
      <div class="rows">${abilitiesOf(r.id).map((a) => `<div class="row"><span class="ic">${abilityIcon(a.id)}</span><span class="n">${esc(a.name)}</span><b>${formatChance(abilityChance(a.id))}</b></div>`).join('')}</div>
    </div>`,
  ).join('')
  els.list.querySelectorAll('.grp').forEach((g) =>
    g.querySelector('.hd').addEventListener('click', () => {
      const r = g.dataset.r
      if (open.has(r)) open.delete(r)
      else open.add(r)
      g.classList.toggle('open', open.has(r))
    }),
  )
  $('.ab-oddsbtn').addEventListener('click', () => els.odds.classList.add('sheet'))
  $('.ab-oddsclose').addEventListener('click', () => els.odds.classList.remove('sheet'))

  // --- packs ---
  els.packs.innerHTML = ABILITY_SPIN.packs.map((p, i) => `<button class="pack" data-i="${i}"><span class="ab-o">Buy ${p.n}</span><b class="ab-o">${short(p.price)}</b></button>`).join('')
  const quick = ABILITY_SPIN.packs[ABILITY_SPIN.quickPack]
  els.quick.querySelector('.t').textContent = `${money(quick.price)} - ${quick.n} spin${quick.n > 1 ? 's' : ''}`

  // --- toast ---
  let toastTimer = 0
  function toast(text, kind = '') {
    els.toast.textContent = text
    els.toast.className = `ab-toast ab-o show ${kind}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400)
  }
  function fail(r) {
    asfx.error()
    let text = REASON[r?.reason] ?? 'Something went wrong. Try again!'
    if (r?.reason === 'cash' && r.price) text = `Not enough cash! You need ${money(r.price)}.`
    toast(text, 'bad')
    if (r?.reason === 'none') pulse($('.ab-shop'))
  }
  function pulse(el) {
    el.classList.remove('pulse')
    void el.offsetWidth
    el.classList.add('pulse')
  }

  // --- render ---
  let spinning = false
  let shownId = null // the ability name shown in the head (the reel overrides it while spinning)
  function setHead(id) {
    const a = ABILITY_BY_ID[id]
    shownId = id
    const r = a ? RARITY[a.rarity] : null
    els.titleIc.innerHTML = a ? abilityIcon(id) : SVG.plus
    els.titleNm.textContent = a ? a.name.toUpperCase() : 'NO ABILITY'
    fitTitle()
    els.desc.textContent = a ? a.desc : 'This slot is empty. Spin to get an ability!'
    els.rar.textContent = r ? r.name : ''
    els.head.style.setProperty('--c', r?.color ?? '#9aa1ad')
    els.head.style.setProperty('--d', r?.dark ?? '#5f6672')
    els.rar.style.background = r?.grad ?? (r ? r.color : 'transparent')
  }
  // the big name shrinks to fit between the side panels
  function fitTitle() {
    const nm = els.titleNm
    nm.style.fontSize = ''
    if (!isOpen || nm.scrollWidth <= nm.clientWidth + 1) return
    nm.style.fontSize = `${(parseFloat(getComputedStyle(nm).fontSize) * nm.clientWidth) / nm.scrollWidth}px`
  }
  window.addEventListener('resize', () => isOpen && fitTitle())
  function render() {
    const s = state()
    // slots (held while the reel spins, so the answer isn't spoiled)
    if (!spinning) renderSlots(s)
    // head
    if (!spinning) setHead(s.slots[s.equipped])
    els.left.textContent = s.spins
    els.spinBtn.classList.toggle('empty', s.spins < 1)
    els.spinBtn.classList.toggle('lockedslot', !!s.locked[s.equipped])
    els.badge.textContent = s.spins > 99 ? '99+' : String(s.spins)
    els.badge.classList.toggle('hidden', s.spins < 1)
    if (!spinning) entry.querySelector('.ic').innerHTML = abilityIcon(s.slots[s.equipped] || 'fireShot')
    // pity (held while spinning too)
    if (spinning) return renderCash()
    const k = s.pity / ABILITY_SPIN.pity
    els.pity.querySelector('.fill').style.width = `${k * 100}%`
    els.pity.querySelector('span').innerHTML = `Pity: ${s.pity} / ${ABILITY_SPIN.pity} · <b style="color:${RARITY[ABILITY_SPIN.pityRarity].color}">${RARITY[ABILITY_SPIN.pityRarity].name}</b> or better`
    renderCash()
    screen.classList.toggle('offline', mode() === 'offline')
    $('.ab-hint').classList.toggle('hidden', s.codes.includes(ABILITY_SPIN.codeBanner))
  }
  function renderSlots(s) {
    let html = ''
    for (let i = 0; i < ABILITY_SPIN.slots; i++) {
      if (i < s.unlocked) {
        const id = s.slots[i]
        const a = ABILITY_BY_ID[id]
        const r = a ? RARITY[a.rarity] : null
        const eq = i === s.equipped
        html += `<div class="slot${eq ? ' eq' : ''}${a ? '' : ' empty'}" style="--c:${r?.color ?? '#c9cfdb'};--g:${r?.grad ?? (r ? r.color : '#c9cfdb')}">
          <div class="top"><span class="ic">${a ? abilityIcon(id) : SVG.plus}</span><div class="nm"><span class="ab-o">${a ? esc(a.name) : 'Empty'}</span><i class="bar"></i></div>
          <button class="lk${s.locked[i] ? ' on' : ''}" data-lock="${i}" aria-label="${s.locked[i] ? 'Unlock slot' : 'Lock slot'}">${s.locked[i] ? SVG.lockOn : SVG.lockOff}</button></div>
          <button class="eqb ab-o" data-eq="${i}">${eq ? 'EQUIPPED' : 'EQUIP'}</button></div>`
      } else {
        const next = i === s.unlocked
        html += `<button class="slot new${next ? '' : ' far'}" data-buy="${i}"><span class="plus">${SVG.plus}</span><span class="t ab-o">NEW SLOT</span><b class="p ab-o">${next ? short(ABILITY_SPIN.slotPrices[i]) : `Unlock slot ${i} first`}</b></button>`
      }
    }
    els.slots.innerHTML = html
  }
  function renderCash() {
    els.cash.textContent = money(save.cash)
    els.packs.querySelectorAll('.pack').forEach((b) => b.classList.toggle('poor', save.cash < ABILITY_SPIN.packs[b.dataset.i].price))
    els.quick.classList.toggle('poor', save.cash < quick.price)
  }
  onAbilities(render)
  onChange((key) => {
    if (key === 'cash' || key === 'all') renderCash()
  })

  // --- slot actions ---
  els.slots.addEventListener('click', async (e) => {
    if (spinning) return
    const lk = e.target.closest('[data-lock]')
    const eq = e.target.closest('[data-eq]')
    const nb = e.target.closest('[data-buy]')
    if (lk) {
      const i = +lk.dataset.lock
      const on = !state().locked[i]
      const r = await lockSlot(i, on)
      if (!r.ok) return fail(r)
      asfx.lock(on)
      toast(on ? 'Slot locked: spins won’t replace it.' : 'Slot unlocked.')
    } else if (eq) {
      const i = +eq.dataset.eq
      if (i === state().equipped) return
      const r = await equipSlot(i)
      if (!r.ok) return fail(r)
      asfx.equip()
    } else if (nb) {
      const i = +nb.dataset.buy
      if (i !== state().unlocked) return fail({ reason: 'slot' })
      const price = ABILITY_SPIN.slotPrices[i]
      const r = await unlockSlot(i)
      if (!r.ok) return fail({ ...r, price })
      asfx.buy()
      toast(`Slot ${i + 1} unlocked! Spin to fill it.`, 'good')
    }
  })

  // --- codes ---
  $('.ab-codes form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const code = els.input.value.trim()
    if (!code || spinning) return
    const r = await redeemCode(code)
    if (!r.ok) return fail(r)
    els.input.value = ''
    els.input.blur()
    asfx.redeem()
    toast(`Code redeemed! +${r.n} spin${r.n > 1 ? 's' : ''}`, 'good')
    pulse($('.ab-spin'))
  })

  // --- buying spins ---
  els.packs.addEventListener('click', async (e) => {
    const b = e.target.closest('.pack')
    if (!b || spinning) return
    const p = ABILITY_SPIN.packs[+b.dataset.i]
    const r = await buySpins(+b.dataset.i)
    if (!r.ok) return fail({ ...r, price: p.price })
    asfx.buy()
    toast(`+${p.n} spin${p.n > 1 ? 's' : ''}!`, 'good')
    pulse($('.ab-spin'))
  })
  els.quick.addEventListener('click', async () => {
    if (spinning) return
    if (state().locked[state().equipped]) return fail({ reason: 'locked' })
    const r = await buySpins(ABILITY_SPIN.quickPack)
    if (!r.ok) return fail({ ...r, price: quick.price })
    asfx.buy()
    doSpin()
  })

  // --- the spin: the reel runs while the server answers, then settles on the result ---
  els.spinBtn.addEventListener('click', () => doSpin())
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  async function doSpin() {
    if (spinning || isBusy()) return
    const s = state()
    if (s.locked[s.equipped]) return fail({ reason: 'locked' })
    if (s.spins < 1) return fail({ reason: 'none' })
    spinning = true
    screen.classList.add('spinning')
    // reel: fast cycling while waiting on the answer
    let answer = null
    const ask = spinAbility().then((r) => (answer = r))
    let i = Math.floor(Math.random() * ABILITIES.length)
    const t0 = performance.now()
    while (!answer || performance.now() - t0 < 700) {
      i = (i + 1 + Math.floor(Math.random() * 3)) % ABILITIES.length
      reelTo(ABILITIES[i].id)
      asfx.reelTick(0)
      await sleep(70)
      if (performance.now() - t0 > 12000) break
    }
    await ask
    if (!answer?.ok) {
      spinning = false
      screen.classList.remove('spinning')
      render()
      return fail(answer)
    }
    // settle: slowing ticks, then the result
    const steps = 9
    for (let k = 0; k < steps; k++) {
      const id = k === steps - 1 ? answer.id : ABILITIES[(i = (i + 1 + Math.floor(Math.random() * 4)) % ABILITIES.length)].id
      reelTo(id)
      asfx.reelTick(k / steps)
      await sleep(80 + k * k * 9)
    }
    spinning = false
    screen.classList.remove('spinning')
    revealResult(answer.id, answer.forced)
    render()
  }
  function reelTo(id) {
    setHead(id)
    els.titleNm.classList.remove('tick')
    void els.titleNm.offsetWidth
    els.titleNm.classList.add('tick')
  }
  let revealTimer = 0
  function revealResult(id, forced) {
    const a = ABILITY_BY_ID[id]
    const r = RARITY[a.rarity]
    asfx.reveal(r.rank)
    els.head.classList.remove('flash')
    void els.head.offsetWidth
    els.head.classList.add('flash')
    // the bigger reveal card for Rare and up
    if (r.rank >= 2) {
      const rv = els.reveal
      rv.style.setProperty('--c', r.color)
      rv.style.setProperty('--g', r.grad ?? r.color)
      rv.querySelector('.rr').textContent = `${forced ? 'PITY! ' : ''}${r.name.toUpperCase()}!`
      rv.querySelector('.ic').innerHTML = abilityIcon(id)
      rv.querySelector('.nm').textContent = a.name
      rv.className = `ab-reveal r${r.rank}`
      clearTimeout(revealTimer)
      revealTimer = setTimeout(() => rv.classList.add('hidden'), 2600)
    } else toast(`You got ${a.name}!`, 'good')
    onReveal?.(r.rank)
  }
  els.reveal.addEventListener('click', () => els.reveal.classList.add('hidden'))

  // --- open / close ---
  let isOpen = false
  let onReveal = null
  function setOpen(on) {
    if (on === isOpen) return
    if (!on && spinning) return
    isOpen = on
    screen.classList.toggle('hidden', !on)
    document.body.classList.toggle('ab-open', on)
    els.odds.classList.remove('sheet')
    sfx.panel(on)
    setMoveLock(on)
    cam.fresh = true
    if (on) {
      render()
      onOpen?.()
    } else {
      els.input.blur()
      els.reveal.classList.add('hidden')
      onClose?.()
    }
  }
  els.entry.addEventListener('click', () => setOpen(true))
  $('.ab-back').addEventListener('click', () => setOpen(false))
  window.addEventListener('keydown', (e) => {
    if (isOpen && e.code === 'Escape' && !(e.target instanceof HTMLInputElement)) setOpen(false)
  })
  render()

  // Camera while open: in front of the player, face on, the character centred between the panels.
  const cam = { fresh: true, pos: new Vector3(), look: new Vector3(), goal: new Vector3(), at: new Vector3() }
  function frameCamera(camera, dt) {
    const p = player.renderPosition
    const f = player.facing
    const portrait = window.innerHeight > window.innerWidth
    const dist = portrait ? 3.4 : 2.7
    cam.goal.set(p.x + Math.sin(f) * dist, p.y + 1.45, p.z + Math.cos(f) * dist)
    cam.at.set(p.x, p.y + (portrait ? 1.0 : 1.12), p.z)
    if (cam.fresh) {
      cam.fresh = false
      cam.pos.copy(camera.position)
      camera.getWorldDirection(cam.look).multiplyScalar(4).add(camera.position)
    }
    const k = 1 - Math.exp(-5 * dt)
    cam.pos.lerp(cam.goal, k)
    cam.look.lerp(cam.at, k)
    camera.position.copy(cam.pos)
    camera.lookAt(cam.look)
  }

  return {
    frameCamera,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => isOpen,
    // hide the entry button while a match / another window has the screen
    setEntryVisible(on) {
      els.entry.classList.toggle('gone', !on)
    },
    onReveal: (fn) => (onReveal = fn),
    toast,
  }
}
