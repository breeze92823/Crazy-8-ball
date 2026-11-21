// The hub's windows (DOM): Cues (My Cues + Index), Free Reward (Daily, Playtime, Track, Bonus),
// Ranked, the Bag + hotbar of lucky blocks, and the reveal card (block opened, rank up, rewards).
// Left-side buttons open the windows; the hotbar sits at the bottom centre. All state comes
// from progress.js (save + actions); daily / track / playtime claims go through net.js (server
// authoritative) before the reward is granted here. Prices are cash only.
import './menus.css'
import { BONUS, DAILY, GIFTS, RANKED, TRACK, BAG } from '../config.js'
import {
  BLOCKS, CUES, CUE_PRICES, HOW, RARITIES, RARITY_ORDER, blockOf, blockThumb, chanceOf, cueById, cueThumb, cuesOf, fmtChance, rarityRank,
} from '../cues.js'
import {
  LEVELS, addCash, blockReady, bonusReady, buyCue, buyRarity, claimBonus, dupeValue, equipCue, fromHotbar, grantReward, now, onChange, openBlock, owned, rankOf,
  save, sellDupes, spend, toHotbar,
} from '../progress.js'
import { claimDaily, claimGift, claimTrack, giftSecs, net, refreshDaily, unlockAllDaily } from '../net.js'
import { sfx } from '../audio/index.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`
function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// --- icons ---------------------------------------------------------------------------------
const I = {
  cue: '<svg viewBox="0 0 32 32"><path d="M5 28L27 5" stroke="#14163a" stroke-width="7" stroke-linecap="round"/><path d="M5 28L27 5" stroke="#e7cd98" stroke-width="3.6" stroke-linecap="round"/><path d="M5 28l8-8" stroke="#5a2f1c" stroke-width="3.8" stroke-linecap="round"/><path d="M24 22l1.6 3 3 1.6-3 1.6-1.6 3-1.6-3-3-1.6 3-1.6z" fill="#ffd23d" stroke="#14163a" stroke-width="1.2"/></svg>',
  book: '<svg viewBox="0 0 32 32"><rect x="5" y="3" width="22" height="26" rx="3" fill="#3ccf6e" stroke="#14163a" stroke-width="2.4"/><rect x="9" y="7" width="14" height="18" rx="2" fill="#effff4" stroke="#14163a" stroke-width="1.6"/><path d="M12 21l8-11" stroke="#14163a" stroke-width="3" stroke-linecap="round"/><path d="M12 21l8-11" stroke="#e7cd98" stroke-width="1.4" stroke-linecap="round"/></svg>',
  gift: '<svg viewBox="0 0 32 32"><rect x="4" y="13" width="24" height="16" rx="2" fill="#ff5a6a" stroke="#14163a" stroke-width="2.2"/><rect x="2.5" y="9" width="27" height="6" rx="2" fill="#ff8a95" stroke="#14163a" stroke-width="2.2"/><rect x="14" y="9" width="4" height="20" fill="#ffd23d" stroke="#14163a" stroke-width="1.6"/><path d="M16 9c-3-6-9-6-8-2 1 3 8 2 8 2zm0 0c3-6 9-6 8-2-1 3-8 2-8 2z" fill="#ffd23d" stroke="#14163a" stroke-width="1.8"/></svg>',
  trophy: '<svg viewBox="0 0 32 32"><path d="M9 4h14v7a7 7 0 0 1-14 0z" fill="#ffd23d" stroke="#14163a" stroke-width="2.2"/><path d="M9 7H4c0 5 3 7 6 7M23 7h5c0 5-3 7-6 7" fill="none" stroke="#14163a" stroke-width="2.2"/><rect x="13" y="17" width="6" height="6" fill="#e0a810" stroke="#14163a" stroke-width="2"/><rect x="8" y="23" width="16" height="5" rx="1.5" fill="#ffd23d" stroke="#14163a" stroke-width="2.2"/><path d="M16 7l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#fff"/></svg>',
  bag: '<svg viewBox="0 0 32 32"><path d="M8 11h16l2 17H6z" fill="#ff9a3d" stroke="#14163a" stroke-width="2.2" stroke-linejoin="round"/><path d="M11 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="#14163a" stroke-width="2.4"/><rect x="11" y="17" width="10" height="6" rx="2" fill="#ffc27a" stroke="#14163a" stroke-width="1.8"/></svg>',
  cash: '<svg viewBox="0 0 64 64"><g stroke="#14163a" stroke-width="2.5" stroke-linejoin="round"><path d="M6 34l30-14 22 12-30 14z" fill="#2f9e44"/><path d="M6 28l30-14 22 12-30 14z" fill="#51cf66"/><path d="M6 22l30-14 22 12-30 14z" fill="#8ce99a"/><ellipse cx="32" cy="20" rx="7" ry="4" fill="#2f9e44" stroke-width="2"/></g></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff" stroke="#14163a" stroke-width="2"/><path d="M12 7v10M7 12h10" stroke="#14163a" stroke-width="3" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5" fill="none" stroke="#14163a" stroke-width="2.6"/><path d="M15 15l6 6" stroke="#14163a" stroke-width="2.8" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 28"><path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke="#14163a" stroke-width="4.2"/><path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke="#c9ced8" stroke-width="2"/><rect x="2.5" y="11" width="19" height="15" rx="3.5" fill="#ffc83d" stroke="#14163a" stroke-width="2.2"/><circle cx="12" cy="17.5" r="2.2" fill="#14163a"/><rect x="11" y="18" width="2" height="4" fill="#14163a"/></svg>',
  sort: '<svg viewBox="0 0 32 32"><g stroke="#14163a" stroke-width="2.4" stroke-linecap="round"><path d="M5 9h22M5 16h22M5 23h22"/></g><circle cx="12" cy="9" r="3.2" fill="#4dabf7" stroke="#14163a" stroke-width="2"/><circle cx="21" cy="16" r="3.2" fill="#ff6b6b" stroke="#14163a" stroke-width="2"/><circle cx="10" cy="23" r="3.2" fill="#3ccf6e" stroke="#14163a" stroke-width="2"/></svg>',
  tag: '<svg viewBox="0 0 32 32"><path d="M4 6a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13l-6 6v-6a3 3 0 0 1-3-3z" fill="#4dabf7" stroke="#14163a" stroke-width="2.2"/><path d="M10 10h12M10 15h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
  calendar: '<svg viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="22" rx="3" fill="#fff" stroke="#14163a" stroke-width="2.2"/><path d="M4 9a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v4H4z" fill="#ff5a6a" stroke="#14163a" stroke-width="2.2"/><g fill="#3ccf6e"><rect x="8" y="16" width="4" height="4" rx="1"/><rect x="14" y="16" width="4" height="4" rx="1"/><rect x="20" y="16" width="4" height="4" rx="1"/><rect x="8" y="22" width="4" height="3" rx="1"/></g></svg>',
  watch: '<svg viewBox="0 0 32 32"><circle cx="16" cy="18" r="11" fill="#fff" stroke="#14163a" stroke-width="2.4"/><circle cx="16" cy="18" r="8" fill="#4dabf7" opacity=".25"/><path d="M16 18V11M16 18l5 3" stroke="#14163a" stroke-width="2.4" stroke-linecap="round"/><rect x="13" y="3" width="6" height="4" rx="1.5" fill="#4dabf7" stroke="#14163a" stroke-width="2"/></svg>',
  star: '<svg viewBox="0 0 32 32"><path d="M16 3l3.8 7.8 8.5 1.2-6.2 6 1.5 8.5L16 22.4l-7.6 4.1 1.5-8.5-6.2-6 8.5-1.2z" fill="#ffd23d" stroke="#14163a" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  bolt: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="#ffd23d" stroke="#14163a" stroke-width="2.4"/><path d="M18 5l-9 13h6l-2 9 9-13h-6z" fill="#fff" stroke="#14163a" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  arrowL: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowR: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}
const rarityVars = (r) => {
  const R = RARITIES[r]
  return `--c:${R.color};--d:${R.dark};--b1:${R.bg[0]};--b2:${R.bg[1]}`
}

// A rank badge: shield in the tier colours with an 8-ball; wings from Platinum, a crown from Expert.
export function rankBadge(tierIndex, size = 96) {
  if (tierIndex < 0) {
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><path d="M50 4l40 23v46L50 96 10 73V27z" fill="#e8ecf2" stroke="#14163a" stroke-width="5"/><path d="M50 14l31 18v36L50 86 19 68V32z" fill="#c9d0dc" stroke="#7a8496" stroke-width="2.5"/><circle cx="50" cy="50" r="22" fill="#15151c" stroke="#14163a" stroke-width="3"/><circle cx="50" cy="50" r="11" fill="#fff"/><text x="50" y="55" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="15" fill="#15151c">8</text></svg>`
  }
  const t = RANKED.tiers[tierIndex]
  const wings = tierIndex >= 3
  const crown = tierIndex >= 5
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}">
    ${wings ? `<path d="M22 34L4 26l6 22 10 10zM78 34l18-8-6 22-10 10z" fill="${t.color}" stroke="#14163a" stroke-width="3.5" stroke-linejoin="round"/>` : ''}
    ${crown ? `<path d="M30 22l4-14 9 8 7-11 7 11 9-8 4 14z" fill="${tierIndex >= 8 ? '#ffd23d' : t.color}" stroke="#14163a" stroke-width="3.5" stroke-linejoin="round"/>` : ''}
    <path d="M50 14l32 12v28c0 20-16 32-32 40C34 86 18 74 18 54V26z" fill="${t.color}" stroke="#14163a" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M50 22l24 9v22c0 15-12 25-24 31-12-6-24-16-24-31V31z" fill="${t.dark}" opacity=".55"/>
    <circle cx="50" cy="50" r="18" fill="#15151c" stroke="#14163a" stroke-width="3"/><circle cx="50" cy="50" r="9" fill="#fff"/>
    <text x="50" y="54.5" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="12" fill="#15151c">8</text>
    <path d="M50 74l3 6-3 6-3-6z" fill="#fff" stroke="#14163a" stroke-width="1.5"/></svg>`
}

// A reward tile's picture + label.
function rewardArt(r) {
  if (r.cash) return { img: `<span class="rw-cash">${I.cash}${r.ability ? `<i class="rw-plus">${I.bolt}</i>` : ''}</span>`, label: r.ability ? `${money(r.cash)} + Ability` : money(r.cash) }
  if (r.block) return { img: `<img src="${blockThumb(r.block)}" alt="">`, label: `${r.n > 1 ? `${r.n}x ` : ''}${blockOf(r.block).name.replace(' Lucky Block', '')}` }
  if (r.cue) return { img: `<img src="${cueThumb(r.cue)}" alt="">`, label: cueById(r.cue).name }
  if (r.tag) return { img: `<span class="rw-ico">${I.tag}</span>`, label: `[${r.tag}]` }
  if (r.ability) return { img: `<span class="rw-ico">${I.bolt}</span>`, label: 'Full Ability' }
  return { img: '', label: '' }
}

export function createMenus({ onOpen, inMatch }) {
  const root = el('div', 'mn')
  document.body.appendChild(root)

  // --- side buttons -------------------------------------------------------------------------
  const side = el('div', 'mn-side')
  const sideBtn = (key, icon, label) => {
    const b = el('button', 'mn-sbtn', `${icon}<span class="mo">${label}</span><i class="mn-dot hidden">!</i>`)
    b.addEventListener('click', () => open(key))
    side.append(b)
    return b
  }
  const sb = { cues: sideBtn('cues', I.cue, 'Cues'), rewards: sideBtn('rewards', I.gift, 'Rewards'), ranked: sideBtn('ranked', I.trophy, 'Ranked') }
  root.append(side)

  // --- window shell ---------------------------------------------------------------------------
  const overlay = el('div', 'mn-ov')
  const win = el('div', 'mn-win')
  const head = el('div', 'mn-head')
  const title = el('div', 'mn-title')
  const collected = el('div', 'mn-coll', `<span class="ico">${I.book}</span><div><b class="mo">COLLECTED</b><span class="mo n">0 / ${CUES.length}</span></div><div class="bar"><i></i></div>`)
  const cashPill = el('div', 'mn-cash', `<span class="ico">${I.cash}</span><b class="mo">$0</b>`)
  const plus = el('button', 'mn-plus', I.plus)
  plus.setAttribute('aria-label', 'Free rewards')
  plus.addEventListener('click', () => open('rewards'))
  cashPill.append(plus)
  const closeBtn = el('button', 'mn-x', I.close)
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.addEventListener('click', () => close())
  head.append(title, collected, el('div', 'mn-fill'), cashPill, closeBtn)
  const body = el('div', 'mn-body')
  const tabs = el('div', 'mn-tabs')
  win.append(head, body)
  const frame = el('div', 'mn-frame')
  frame.append(win, tabs)
  overlay.append(frame)
  root.append(overlay)
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) close()
  })

  let current = null // 'cues' | 'index' | 'rewards' | 'ranked' | 'bag'
  function setTabs(list, active) {
    tabs.innerHTML = ''
    tabs.classList.toggle('hidden', !list.length)
    for (const t of list) {
      const b = el('button', `mn-tab${t.key === active ? ' on' : ''}`, `${t.icon}<span class="mo">${t.label}</span>${t.sub ? `<small class="mo">${t.sub}</small>` : ''}<i class="mn-dot hidden">!</i>`)
      b.dataset.key = t.key
      b.addEventListener('click', () => t.go())
      tabs.append(b)
    }
  }
  function open(key) {
    if (inMatch?.() && key !== 'reveal') return
    current = key
    overlay.classList.add('open')
    root.classList.add('win-open')
    fitHotbar()
    win.className = `mn-win w-${key}`
    collected.classList.toggle('hidden', key !== 'cues' && key !== 'index')
    if (document.pointerLockElement) document.exitPointerLock?.()
    sfx.panel(true)
    onOpen?.(true)
    render()
  }
  function close() {
    if (!current) return
    current = null
    overlay.classList.remove('open')
    root.classList.remove('win-open')
    fitHotbar()
    sfx.panel(false)
    onOpen?.(false)
  }
  function render() {
    if (current === 'cues') renderMyCues()
    else if (current === 'index') renderIndex()
    else if (current === 'rewards') renderRewards()
    else if (current === 'ranked') renderRanked()
    else if (current === 'bag') renderBag()
    refreshHead()
  }
  function refreshHead() {
    cashPill.querySelector('b').textContent = money(save.cash)
    const n = CUES.filter((c) => owned(c.id)).length
    collected.querySelector('.n').textContent = `${n} / ${CUES.length}`
    collected.querySelector('.bar i').style.width = `${Math.max(4, (n / CUES.length) * 100)}%`
  }
  const setTitle = (icon, text) => (title.innerHTML = `<span class="ico">${icon}</span><h2 class="mo">${text}</h2>`)

  // --- cue card -------------------------------------------------------------------------------
  function cueCard(c, { lockedLook = false, count = 0, equipped = false, selected = false } = {}) {
    const R = RARITIES[c.rarity]
    return `<button class="cc r-${c.rarity}${lockedLook ? ' locked' : ''}${selected ? ' sel' : ''}${R.shiny ? ' shiny' : ''}" data-id="${c.id}" style="${rarityVars(c.rarity)}">
      <img src="${cueThumb(c.id)}" alt="" loading="lazy">
      ${equipped ? '<span class="cc-eq mo">Equipped</span>' : ''}${count > 1 ? `<span class="cc-n mo">x${count}</span>` : ''}
      ${lockedLook ? `<span class="cc-lock">${I.lock}</span>` : ''}
      <span class="cc-name mo">${esc(c.name)}</span><span class="cc-rar mo">${R.name.toUpperCase()}</span></button>`
  }

  // --- My Cues ------------------------------------------------------------------------------------
  let sortMode = 'rarest' // rarest | newest | name
  let search = ''
  const SORTS = { rarest: 'Rarest first', name: 'A to Z', common: 'Commonest first' }
  function cuesTabs(active) {
    setTabs([
      { key: 'cues', icon: I.cue, label: 'My Cues', go: () => open('cues') },
      { key: 'index', icon: I.book, label: 'Index', go: () => open('index') },
      ...(active === 'cues'
        ? [
            { key: 'sort', icon: I.sort, label: 'Sort', sub: SORTS[sortMode], go: () => { const k = Object.keys(SORTS); sortMode = k[(k.indexOf(sortMode) + 1) % k.length]; sfx.click(); render() } },
            { key: 'sell', icon: I.cash.replace('viewBox="0 0 64 64"', 'viewBox="0 0 64 56"'), label: 'Sell dupes', sub: money(dupeValue()), go: doSell },
          ]
        : []),
    ], active)
  }
  function doSell() {
    const v = sellDupes()
    if (v) {
      sfx.cash(4)
      toast(`Sold duplicates for ${money(v)}`)
    } else toast('No duplicates to sell')
    render()
  }
  function searchBox(onInput) {
    const box = el('label', 'mn-search', `${I.search}<input type="text" placeholder="Search cues" maxlength="24" enterkeyhint="search">`)
    const input = box.querySelector('input')
    input.value = search
    input.addEventListener('input', () => {
      search = input.value.trim().toLowerCase()
      onInput()
    })
    return box
  }
  function renderMyCues() {
    setTitle(I.cue, 'Cues')
    cuesTabs('cues')
    body.innerHTML = ''
    const wrap = el('div', 'mc')
    const grid = el('div', 'cc-grid')
    const fill = () => {
      const list = CUES.filter((c) => owned(c.id) && (!search || c.name.toLowerCase().includes(search)))
      list.sort((a, b) => (sortMode === 'name' ? a.name.localeCompare(b.name) : (sortMode === 'rarest' ? 1 : -1) * (rarityRank(b.rarity) - rarityRank(a.rarity)) || a.name.localeCompare(b.name)))
      list.sort((a, b) => (b.id === save.cue) - (a.id === save.cue))
      grid.innerHTML = list.map((c) => cueCard(c, { count: save.cues[c.id], equipped: c.id === save.cue })).join('') || '<p class="mn-empty">No cues match.</p>'
    }
    wrap.append(searchBox(fill), grid)
    body.append(wrap)
    fill()
    grid.addEventListener('click', (e) => {
      const id = e.target.closest('.cc')?.dataset.id
      if (!id || id === save.cue) return
      equipCue(id)
      sfx.toggle(true)
      fill()
    })
  }

  // --- Index ------------------------------------------------------------------------------------------
  let selected = 'classic'
  function renderIndex() {
    setTitle(I.book, 'Index')
    cuesTabs('index')
    body.innerHTML = ''
    const wrap = el('div', 'ix')
    const list = el('div', 'ix-list')
    const detail = el('div', 'ix-detail')
    const sections = el('div', 'ix-secs')
    list.append(searchBox(() => fill()), sections)
    wrap.append(list, detail)
    body.append(wrap)
    const fill = () => {
      sections.innerHTML = RARITY_ORDER.map((r) => {
        const R = RARITIES[r]
        const all = cuesOf(r)
        const shown = all.filter((c) => !search || c.name.toLowerCase().includes(search))
        if (!shown.length) return ''
        const have = all.filter((c) => owned(c.id)).length
        return `<section class="ix-sec" style="${rarityVars(r)}"><header><h3 class="mo">${R.name}</h3><span class="cnt">${have} / ${all.length}</span>
          ${R.price ? `<button class="ix-buy${save.cash < R.price ? ' poor' : ''}" data-rarity="${r}" title="Buy a random ${R.name} cue">${I.cash}<b class="mo">${money(R.price)}</b></button>` : ''}</header>
          <div class="cc-grid">${shown.map((c) => cueCard(c, { lockedLook: !owned(c.id), selected: c.id === selected })).join('')}</div></section>`
      }).join('') || '<p class="mn-empty">No cues match.</p>'
    }
    const showDetail = () => {
      const c = cueById(selected)
      const R = RARITIES[c.rarity]
      const have = owned(c.id)
      const chance = chanceOf(c.id)
      let how = ''
      if (chance) how = `<b class="ch">${fmtChance(chance)}</b> chance`
      else if (c.rarity === 'ranked') how = HOW.ranked(c)
      else if (c.rarity === 'exclusive') how = HOW.exclusive[c.id]
      else how = HOW.unique
      let action = ''
      if (have && c.id === save.cue) action = '<button class="mn-btn gray" disabled>Equipped</button>'
      else if (have) action = '<button class="mn-btn green" data-act="equip">Equip</button>'
      else if (CUE_PRICES[c.id]) action = `<button class="mn-btn green" data-act="buy">${I.cash}<span>${money(CUE_PRICES[c.id])}</span></button>`
      detail.innerHTML = `<div class="ix-big cc${have ? '' : ' locked'}${R.shiny ? ' shiny' : ''}" style="${rarityVars(c.rarity)}"><img src="${cueThumb(c.id, 320)}" alt=""><span class="cc-name mo">${esc(c.name)}</span><span class="cc-rar mo">${R.name.toUpperCase()}</span>${have ? '' : `<span class="cc-lock">${I.lock}</span>`}</div>
        <h3 class="mo">${esc(c.name)}</h3><div class="rar mo" style="color:${R.color}">${R.name}</div>
        <p class="st">${have ? `In your collection${save.cues[c.id] > 1 ? ` (x${save.cues[c.id]})` : ''}` : 'Not collected yet'}</p><p class="how">${how}</p>${action}`
    }
    fill()
    showDetail()
    sections.addEventListener('click', (e) => {
      const buy = e.target.closest('.ix-buy')
      if (buy) {
        const r = buy.dataset.rarity
        const res = buyRarity(r)
        if (!res) return toast(`You need ${money(RARITIES[r].price)}`), sfx.click()
        sfx.cash(2)
        selected = res.id
        reveal({ title: 'NEW CUE!', cues: [res], pool: cuesOf(r).map((c) => c.id) })
        fill()
        showDetail()
        refreshHead()
        return
      }
      const id = e.target.closest('.cc')?.dataset.id
      if (!id) return
      selected = id
      sfx.click()
      sections.querySelectorAll('.cc.sel').forEach((n) => n.classList.remove('sel'))
      e.target.closest('.cc').classList.add('sel')
      showDetail()
      detail.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    })
    detail.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act
      if (act === 'equip') {
        equipCue(selected)
        sfx.toggle(true)
      } else if (act === 'buy') {
        const res = buyCue(selected, CUE_PRICES[selected])
        if (!res) return toast(`You need ${money(CUE_PRICES[selected])}`)
        sfx.cash(3)
        reveal({ title: 'NEW CUE!', cues: [res] })
        fill()
      }
      showDetail()
      refreshHead()
    })
  }

  // --- Free Reward --------------------------------------------------------------------------------------
  function rewardsTabs(active) {
    const go = (key) => () => {
      rewardsFocus = key
      const s = body.querySelector(`[data-sec="${key}"]`)
      s?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      tabs.querySelectorAll('.mn-tab').forEach((t) => t.classList.toggle('on', t.dataset.key === key))
    }
    setTabs([
      { key: 'bonus', icon: I.star, label: 'Bonus', go: go('bonus') },
      { key: 'daily', icon: I.calendar, label: 'Daily', go: go('daily') },
      { key: 'playtime', icon: I.watch, label: 'Playtime', go: go('playtime') },
      { key: 'track', icon: I.trophy, label: 'Track', go: go('track') },
    ], active)
    updateDots()
  }
  let rewardsFocus = 'daily'
  const tile = (r, extra = '') => {
    const a = rewardArt(r)
    return `<div class="rw ${extra}">${a.img}<b class="mo">${esc(a.label)}</b></div>`
  }
  function renderRewards() {
    setTitle(I.gift, 'Free Reward')
    rewardsTabs(rewardsFocus)
    const d = net.daily ?? { unlocked: 0, claimed: [], nextAt: 0, track: { days: 0, claimed: [] } }
    const g = net.gifts ?? { claimed: [] }
    const secs = giftSecs()
    const dayCard = (r, i) => {
      const claimed = d.claimed.includes(i)
      const unlocked = i < d.unlocked
      const btn = claimed ? `<button class="mn-btn gray" disabled>${I.check}<span>Claimed</span></button>` : unlocked ? `<button class="mn-btn green" data-daily="${i}">Claim!</button>` : `<button class="mn-btn gray" disabled>${I.lock}<span>Locked</span></button>`
      return `<div class="dd d${i + 1}${unlocked && !claimed ? ' ready' : ''}${claimed ? ' done' : ''}"><h4 class="mo">DAY ${i + 1}</h4>${r.badge ? `<span class="badge mo">${r.badge}</span>` : ''}${tile(r, i === 6 ? 'big' : '')}${btn}</div>`
    }
    const allUnlocked = d.unlocked >= DAILY.days.length
    const giftCard = (gf, i) => {
      const claimed = g.claimed.includes(i)
      const left = gf.min * 60 - secs
      const prev = i === 0 || secs >= GIFTS[i - 1].min * 60 || g.claimed.includes(i - 1)
      const btn = claimed ? `<button class="mn-btn gray" disabled>${I.check}</button>` : left <= 0 ? `<button class="mn-btn green" data-gift="${i}">Claim!</button>` : prev ? `<button class="mn-btn white" disabled>${I.watch}<span class="gt" data-left="${i}">${fmtTime(left * 1000)}</span></button>` : `<button class="mn-btn gray" disabled>${I.lock}</button>`
      return `<div class="gc${left <= 0 && !claimed ? ' ready' : ''}"><h4 class="mo">${gf.min} min</h4>${tile(gf)}${btn}</div>`
    }
    const tr = d.track
    const trackNodes = TRACK.milestones.map((m, i) => {
      const reached = tr.days >= m.day
      const claimed = tr.claimed.includes(i)
      const pos = (m.day / TRACK.days) * 100
      return `<div class="tn${reached ? ' on' : ''}${claimed ? ' done' : ''}" style="left:${pos}%">${tile(m)}<span class="dot">${claimed ? I.check : ''}</span><b class="mo">Day ${m.day}</b>${reached && !claimed ? `<button class="mn-btn green sm" data-track="${i}">Claim!</button>` : ''}</div>`
    }).join('')
    const bonusN = Math.min(save.wins, BONUS.wins)
    const bonusDone = save.perks.includes('bonus')
    body.innerHTML = `<div class="rwd">
      <section data-sec="daily"><div class="sh"><span class="mo">DAILY</span></div><div class="pill mo">FIRST WEEK ${I.watch}<span class="dl" data-next="${d.nextAt}">${d.nextAt ? fmtTime(d.nextAt - now()) : '--'}</span></div>
        <div class="dgrid">${DAILY.days.map(dayCard).join('')}</div>
        <div class="dfoot"><p class="mo">Claim 7 days to win the ${esc(cueById(DAILY.days[6].cue).name)}!</p>${allUnlocked ? '' : `<button class="mn-btn green wide" data-unlockall>Unlock all ${I.cash}<span>${money(DAILY.unlockAllPrice)}</span></button>`}</div></section>
      <section data-sec="playtime"><div class="sh"><span class="mo">PLAYTIME</span></div><div class="pill mo">TODAY'S GIFTS</div><div class="ggrid">${GIFTS.map(giftCard).join('')}</div></section>
      <section data-sec="track"><div class="sh"><span class="mo">TRACK</span></div><div class="pill mo">DAY ${tr.days} OF ${TRACK.days}</div>
        <div class="track"><div class="line"><i style="width:${(tr.days / TRACK.days) * 100}%"></i></div><span class="t0"></span>${trackNodes}</div><p class="note">Every day you claim counts, even after a missed day.</p></section>
      <section data-sec="bonus"><div class="sh"><span class="mo">BONUS</span></div><div class="bonus">${tile({ cue: BONUS.cue }, 'big')}<div><h4 class="mo">Win ${BONUS.wins} matches</h4><div class="xbar"><i style="width:${(bonusN / BONUS.wins) * 100}%"></i><span class="mo">${bonusN} / ${BONUS.wins}</span></div>
        ${bonusDone ? `<button class="mn-btn gray" disabled>${I.check}<span>Claimed</span></button>` : bonusReady() ? '<button class="mn-btn green" data-bonus>Claim!</button>' : `<button class="mn-btn gray" disabled>${I.lock}<span>Locked</span></button>`}</div></div></section>
    </div>`
    if (!net.daily) refreshDaily()
  }
  async function claimWith(promise, reward, btn) {
    if (btn) btn.disabled = true
    const r = await promise
    if (!r.ok) {
      toast(r.reason === 'offline' || r.reason === 'timeout' ? 'Not connected, try again' : r.reason === 'claimed' ? 'Already claimed' : 'Not ready yet')
      if (current === 'rewards') renderRewards()
      return
    }
    sfx.cash(3)
    const got = grantReward(reward)
    reveal({ title: 'REWARD!', items: got })
    if (current === 'rewards') renderRewards()
  }
  body.addEventListener('click', (e) => {
    if (current !== 'rewards') return
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.daily != null) claimWith(claimDaily(+b.dataset.daily), DAILY.days[+b.dataset.daily], b)
    else if (b.dataset.gift != null) claimWith(claimGift(+b.dataset.gift), GIFTS[+b.dataset.gift], b)
    else if (b.dataset.track != null) claimWith(claimTrack(+b.dataset.track), TRACK.milestones[+b.dataset.track], b)
    else if (b.hasAttribute('data-bonus')) {
      const res = claimBonus()
      if (res) reveal({ title: 'BONUS!', cues: [res] })
      renderRewards()
    } else if (b.hasAttribute('data-unlockall')) unlockAll(b)
  })
  async function unlockAll(b) {
    const price = DAILY.unlockAllPrice
    if (!spend(price)) return toast(`You need ${money(price)}`)
    b.disabled = true
    const r = await unlockAllDaily()
    if (!r.ok) {
      addCash(price) // refund
      toast(r.reason === 'done' ? 'All days are unlocked already' : 'Not connected, try again')
    } else {
      sfx.cash(4)
      toast('Every day this week is unlocked!')
    }
    if (current === 'rewards') renderRewards()
  }

  // --- Ranked ----------------------------------------------------------------------------------------
  let rankPage = 0
  let rankSel = null // LEVELS index shown in the rewards panel
  function renderRanked() {
    setTitle(I.trophy, 'Ranked')
    setTabs([], null)
    const rk = rankOf()
    const tiers = RANKED.tiers
    const curTier = rk.cur ? tiers.indexOf(rk.cur.tier) : -1
    const nextTier = rk.next ? tiers.indexOf(rk.next.tier) : -1
    if (rankSel == null) rankSel = Math.min(LEVELS.length - 1, rk.level + 1)
    const per = window.innerWidth < 640 ? 2 : window.innerWidth < 980 ? 3 : 4
    rankPage = Math.max(0, Math.min(tiers.length - per, rankPage))
    const cards = tiers.map((t, i) => {
      const n = t.divisions ?? 5
      const reached = LEVELS.filter((L) => L.tier === t && save.xp >= L.at).length
      const dots = Array.from({ length: n }, (_, d) => `<i class="${d < reached ? 'on' : ''}"></i>`).join('')
      const isNext = i === nextTier && reached === 0
      const selT = LEVELS[rankSel]?.tier === t
      return `<button class="rk${reached ? ' got' : ''}${isNext ? ' next' : ''}${selT ? ' sel' : ''}${i === curTier ? ' cur' : ''}" data-tier="${i}">${isNext ? '<span class="nx mo">Next Rank</span>' : ''}${rankBadge(i, 104)}<b class="mo">${t.name}</b>${t.sub ? `<em class="mo">${t.sub}</em>` : ''}<span class="dots">${dots}</span></button>`
    }).join('')
    const L = LEVELS[rankSel]
    const rewardTiles = L ? [L.reward.cash && { cash: L.reward.cash }, L.reward.block && { block: L.reward.block, n: 1 }, L.reward.tag && { tag: L.reward.tag }, L.reward.cue && { cue: L.reward.cue }].filter(Boolean) : []
    const paid = rankSel < save.rankClaimed
    body.innerHTML = `<div class="rnk">
      <div class="car"><button class="arr" data-arr="-1" ${rankPage <= 0 ? 'disabled' : ''}>${I.arrowL}</button><div class="vp"><div class="strip" style="--per:${per};transform:translateX(${(-rankPage * 100) / per}%)">${cards}</div></div><button class="arr" data-arr="1" ${rankPage >= tiers.length - per ? 'disabled' : ''}>${I.arrowR}</button></div>
      <div class="low"><div class="me">${rankBadge(curTier, 120)}<div><h3 class="mo">${rk.cur ? rk.cur.name : 'Unranked'}</h3><small>Current Rank</small>
        ${rk.next ? `<div class="xbar"><i style="width:${(rk.into / rk.need) * 100}%"></i></div><span class="xp">${rk.into} / ${rk.need} XP</span>
        <div class="nxt">${I.arrowR}<b class="mo">Next: ${rk.next.name}</b><span class="mo">+${money(rk.next.reward.cash)}</span></div>` : '<p class="mo">Top rank reached!</p>'}
        <p class="hint">Win matches to earn XP</p></div></div>
      <div class="rws"><h3 class="mo">Rewards for ${L ? L.name : ''}${paid ? ' ✓' : ''}</h3><div class="rgrid">${rewardTiles.map((r) => tile(r, paid ? 'done' : '')).join('')}</div>
        <div class="divs">${L ? LEVELS.filter((x) => x.tier === L.tier).map((x) => `<button class="${LEVELS.indexOf(x) === rankSel ? 'on' : ''}${save.xp >= x.at ? ' got' : ''}" data-lvl="${LEVELS.indexOf(x)}">${x.div}</button>`).join('') : ''}</div></div></div></div>`
  }
  body.addEventListener('click', (e) => {
    if (current !== 'ranked') return
    const arr = e.target.closest('[data-arr]')
    if (arr) {
      rankPage += +arr.dataset.arr
      sfx.click()
      return renderRanked()
    }
    const t = e.target.closest('[data-tier]')
    if (t) {
      const tier = RANKED.tiers[+t.dataset.tier]
      rankSel = LEVELS.findIndex((L) => L.tier === tier)
      sfx.click()
      return renderRanked()
    }
    const lv = e.target.closest('[data-lvl]')
    if (lv) {
      rankSel = +lv.dataset.lvl
      sfx.click()
      renderRanked()
    }
  })

  // --- Bag + hotbar -------------------------------------------------------------------------------------
  const hotbar = el('div', 'mn-hot')
  root.append(hotbar)
  const slot = (b, i) => {
    const ready = blockReady(b)
    return `<button class="hs${ready ? ' ready' : ''}" data-uid="${b.uid}"><i class="k mo">${i + 1}</i><img src="${blockThumb(b.kind, 96)}" alt="">${ready ? '<span class="op mo">OPEN</span>' : `<span class="tm mo" data-ready="${b.readyAt}">${fmtTime(b.readyAt - now())}</span>`}</button>`
  }
  function renderHotbar() {
    const items = save.hotbar.map((u) => save.bag.find((b) => b.uid === u)).filter(Boolean)
    hotbar.innerHTML = items.map(slot).join('') + `<button class="hs bagb" aria-label="Bag">${I.bag}${save.bag.length ? `<i class="cnt">${save.bag.length}</i>` : ''}</button>`
    document.body.classList.add('has-hotbar')
    requestAnimationFrame(fitHotbar)
  }

  // Keeps the hotbar clear of the rest of the HUD. The touch jump / run / cam cluster can't move, so
  // the slots shrink to fit beside it, or the bar lifts above it when even small slots don't fit
  // (portrait phones). The cash pill (left), EMOTE (right) and the lobby bar / Leave (centre) can
  // move, so they get pushed above the bar via body vars (hud.css, emotemenu.css) when they'd overlap.
  const fitVals = {}
  const setVar = (node, k, v) => {
    if (fitVals[k] === v) return
    fitVals[k] = v
    node.style.setProperty(k, v)
  }
  function fitHotbar() {
    const bs = document.body
    const n = hotbar.children.length
    if (!n || root.classList.contains('in-match') || root.classList.contains('win-open')) {
      for (const k of ['--hot-top', '--hot-push-l', '--hot-push-r']) setVar(bs, k, '0px')
      return
    }
    const vw = innerWidth
    const vh = innerHeight
    const vmin = Math.min(vw, vh)
    const touch = bs.classList.contains('touch-ui')
    const edge = Math.min(20, Math.max(10, vmin * 0.02))
    const pref = Math.min(72, Math.max(56, vmin * 0.08))
    const MIN = 44 // tap target
    const blocks = [...hotbar.children].filter((b) => !b.classList.contains('bagb'))
    const box = (sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect()
      return r && r.width ? r : null
    }
    // how far in from its own side of the screen a box reaches
    const reach = (r) => (r.left + r.right < vw ? r.right : vw - r.left)
    // slot size for a centred bar of k blocks + the bag that keeps `inset` px clear on both sides
    const size = (inset, k, g) => Math.floor(Math.min(pref, (vw - 2 * inset - k * g) / (k + 1)))
    // how many blocks still fit at MIN
    const most = (inset, g) => Math.max(0, Math.min(blocks.length, Math.floor((vw - 2 * inset + g) / (MIN + g)) - 1))
    const base = vh - hotbar.getBoundingClientRect().bottom - (parseFloat(fitVals['--hot-lift']) || 0)
    const cluster = touch ? box('.touch-cluster') : null
    const cash = box('#hud .hud-bl')
    const emote = box('#emote-ui:not(.hidden) .em-btn')
    const fixedIn = Math.max(edge, cluster ? reach(cluster) + 10 : 0)
    // on desktop the cash pill and EMOTE share the bottom row with the bar; on touch they sit higher
    const side = touch ? [] : [cash, emote].filter(Boolean)
    let gap = touch ? 6 : 8
    let k = blocks.length
    let s = size(Math.max(fixedIn, ...side.map((r) => reach(r) + 10)), k, gap)
    let lift = 0
    let pushAll = false
    if (s < Math.min(pref, 50)) {
      // too tight beside everything: keep only the fixed controls clear and push the movable HUD up
      s = size(fixedIn, k, gap)
      if (s < MIN && cluster && vh > vw) {
        // portrait phone, no room beside the touch controls: go full width just above them
        lift = Math.max(0, vh - cluster.top + 8 - base)
        gap = 5
        k = Math.min(k, most(edge, gap))
        s = size(edge, k, gap)
        pushAll = true
      } else if (s < MIN) {
        // short landscape: stay on the bottom row and show only the blocks that fit (the rest are in the Bag)
        k = most(fixedIn, gap)
        s = size(fixedIn, k, gap)
      }
    }
    blocks.forEach((b, i) => b.classList.toggle('off', i >= k))
    const w = (k + 1) * s + k * gap
    const top = Math.round(base + lift + s + 16) // room for the ready pulse and the coin hanging under the cash pill
    const hits = (r) => r && (pushAll || (!touch && r.right > (vw - w) / 2 - 6 && r.left < (vw + w) / 2 + 6))
    setVar(hotbar, '--hs', `${s}px`)
    setVar(hotbar, '--hot-gap', `${gap}px`)
    setVar(hotbar, '--hot-lift', `${Math.round(lift)}px`)
    setVar(bs, '--hot-top', `${top}px`)
    setVar(bs, '--hot-push-l', hits(cash) ? `${top}px` : '0px')
    setVar(bs, '--hot-push-r', hits(emote) ? `${top}px` : '0px')
  }
  addEventListener('resize', fitHotbar)
  new MutationObserver(fitHotbar).observe(document.body, { attributes: true, attributeFilter: ['class'] })
  hotbar.addEventListener('click', (e) => {
    const b = e.target.closest('.hs')
    if (!b) return
    if (b.classList.contains('bagb')) return current === 'bag' ? close() : open('bag')
    tryOpen(b.dataset.uid)
  })
  function tryOpen(id) {
    const b = save.bag.find((x) => x.uid === id)
    if (!b) return
    if (!blockReady(b)) {
      sfx.click()
      return toast(`${blockOf(b.kind).name} opens in ${fmtTime(b.readyAt - now())}`)
    }
    const kind = b.kind
    const res = openBlock(id)
    if (!res) return
    sfx.press()
    reveal({ title: blockOf(kind).name.toUpperCase(), cues: [res], pool: Object.keys(blockOf(kind).weights).flatMap((r) => cuesOf(r).map((c) => c.id)) })
    if (current === 'bag') renderBag()
  }
  function renderBag() {
    setTitle(I.bag, 'Bag')
    setTabs([], null)
    body.innerHTML = `<div class="bagw"><div class="bgrid">${save.bag.map((b) => {
      const ready = blockReady(b)
      const inBar = save.hotbar.includes(b.uid)
      return `<div class="bi${ready ? ' ready' : ''}"><img src="${blockThumb(b.kind, 96)}" alt=""><b class="mo">${esc(blockOf(b.kind).name.replace(' Lucky Block', ''))}</b>
        ${ready ? `<button class="mn-btn green sm" data-open="${b.uid}">Open</button>` : `<span class="tm mo" data-ready="${b.readyAt}">${fmtTime(b.readyAt - now())}</span>`}
        <button class="pin${inBar ? ' on' : ''}" data-pin="${b.uid}">${inBar ? 'On hotbar' : 'To hotbar'}</button></div>`
    }).join('') || '<p class="mn-empty">Your bag is empty. Win lucky blocks from Free Rewards and Ranked!</p>'}</div>
      <p class="note">Tap a block to open it, or put it on your hotbar (${BAG.hotbar} slots, keys 1-${BAG.hotbar}).</p></div>`
  }
  body.addEventListener('click', (e) => {
    if (current !== 'bag') return
    const o = e.target.closest('[data-open]')
    if (o) return tryOpen(o.dataset.open)
    const p = e.target.closest('[data-pin]')
    if (p) {
      const id = p.dataset.pin
      save.hotbar.includes(id) ? fromHotbar(id) : toHotbar(id)
      sfx.toggle(save.hotbar.includes(id))
      renderBag()
    }
  })
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || inMatch?.() || e.repeat) return
    const n = Number(e.key)
    if (n >= 1 && n <= BAG.hotbar && save.hotbar[n - 1]) tryOpen(save.hotbar[n - 1])
  })

  // --- reveal card ------------------------------------------------------------------------------------
  // reveal({ title, cues: [{ id, isNew }], pool?: ids to spin through, items?: granted list, rank? })
  const rv = el('div', 'mn-rv')
  root.append(rv)
  const queue = []
  let revealing = false
  function reveal(opts) {
    queue.push(opts)
    if (!revealing) nextReveal()
  }
  function nextReveal() {
    const o = queue.shift()
    if (!o) {
      revealing = false
      rv.classList.remove('open')
      return
    }
    revealing = true
    rv.classList.add('open')
    const cues = o.cues ?? (o.items ?? []).filter((x) => x.kind === 'cue')
    const others = (o.items ?? []).filter((x) => x.kind !== 'cue')
    const main = cues[0]
    const spin = main && o.pool?.length > 1
    const card = (id, cls = '') => {
      const c = cueById(id)
      return `<div class="cc big ${cls}${RARITIES[c.rarity].shiny ? ' shiny' : ''}" style="${rarityVars(c.rarity)}"><img src="${cueThumb(id, 240)}" alt=""><span class="cc-name mo">${esc(c.name)}</span><span class="cc-rar mo">${RARITIES[c.rarity].name.toUpperCase()}</span></div>`
    }
    const tiles = others.map((x) => tile(x.kind === 'cash' ? { cash: x.n } : x.kind === 'block' ? { block: x.block, n: x.n } : x.kind === 'tag' ? { tag: x.tag } : { ability: true })).join('')
    rv.innerHTML = `<div class="rv-card">${o.rank != null ? rankBadge(o.rank, 120) : ''}<h2 class="mo">${esc(o.title)}</h2>
      ${main ? `<div class="rv-spin">${spin ? '<div class="reel"></div>' : card(main.id, 'land')}</div>` : ''}
      ${main ? `<p class="rv-new mo ${main.isNew ? 'new' : ''}">${main.isNew ? 'NEW!' : 'Duplicate (sell it in My Cues)'}</p>` : ''}
      ${cues.slice(1).map((c) => card(c.id, 'small')).join('')}
      ${tiles ? `<div class="rgrid">${tiles}</div>` : ''}
      <div class="rv-btns">${main && main.id !== save.cue ? '<button class="mn-btn green" data-eq>Equip</button>' : ''}<button class="mn-btn blue" data-ok>OK</button></div></div>`
    if (spin) {
      const reel = rv.querySelector('.reel')
      const seq = Array.from({ length: 26 }, () => o.pool[Math.floor(Math.random() * o.pool.length)])
      seq.push(main.id)
      reel.innerHTML = seq.map((id, i) => card(id, i === seq.length - 1 ? 'land' : '')).join('')
      const cards = reel.children
      let i = 0
      const step = () => {
        for (const c of cards) c.style.display = 'none'
        cards[i].style.display = ''
        if (i === seq.length - 1) {
          cards[i].classList.add('pop')
          sfx.breakerPicked()
          if (main.isNew) sfx.win()
          return
        }
        sfx.rouletteTick(i / seq.length)
        i++
        setTimeout(step, 40 + Math.pow(i / seq.length, 3) * 380)
      }
      step()
    } else if (main) sfx.sparkle(0.08)
    rv.querySelector('[data-eq]')?.addEventListener('click', () => {
      equipCue(main.id)
      sfx.toggle(true)
      nextReveal()
    })
    rv.querySelector('[data-ok]').addEventListener('click', () => {
      sfx.click()
      nextReveal()
    })
  }
  // Rank-ups after a match: [{ level, granted }]
  function rankUps(paid) {
    for (const p of paid) reveal({ title: `RANK UP! ${p.level.name}`, rank: RANKED.tiers.indexOf(p.level.tier), items: p.granted })
  }

  // --- toast --------------------------------------------------------------------------------------
  const tst = el('div', 'mn-toast mo')
  root.append(tst)
  let tstTimer = 0
  function toast(text) {
    tst.textContent = text
    tst.classList.remove('show')
    void tst.offsetWidth
    tst.classList.add('show')
    tstTimer = 2.4
  }

  // --- "!" dots: something to claim ------------------------------------------------------------------
  function updateDots() {
    const d = net.daily
    const dailyReady = !!d && d.claimed.length < d.unlocked
    const trackReady = !!d && TRACK.milestones.some((m, i) => d.track.days >= m.day && !d.track.claimed.includes(i))
    const secs = giftSecs()
    const giftReady = !!net.gifts && GIFTS.some((g, i) => secs >= g.min * 60 && !net.gifts.claimed.includes(i))
    const bonus = bonusReady()
    sb.rewards.querySelector('.mn-dot').classList.toggle('hidden', !(dailyReady || trackReady || giftReady || bonus))
    const dupes = dupeValue() > 0
    sb.cues.querySelector('.mn-dot').classList.toggle('hidden', !dupes)
    const tabDot = (key, on) => tabs.querySelector(`[data-key="${key}"] .mn-dot`)?.classList.toggle('hidden', !on)
    tabDot('daily', dailyReady)
    tabDot('track', trackReady)
    tabDot('playtime', giftReady)
    tabDot('bonus', bonus)
    tabDot('sell', dupes)
  }

  onChange((key) => {
    if (key === 'bag' || key === 'all') renderHotbar()
    if (!current) return
    if (key === 'cash') refreshHead()
    else if (key === 'daily' || key === 'gifts') current === 'rewards' && renderRewards()
    else if (key === 'cues' || key === 'all') refreshHead()
    else if (key === 'bag' && current === 'bag') renderBag()
  })
  renderHotbar()

  let tickAcc = 0
  let wasMatch = false
  return {
    open,
    close,
    reveal,
    rankUps,
    toast,
    isOpen: () => !!current || revealing,
    update(dt) {
      if (tstTimer > 0 && (tstTimer -= dt) <= 0) tst.classList.remove('show')
      const m = !!inMatch?.()
      if (m !== wasMatch) {
        wasMatch = m
        root.classList.toggle('in-match', m)
        fitHotbar()
        if (m) close()
      }
      tickAcc += dt
      if (tickAcc < 0.5) return
      tickAcc = 0
      updateDots()
      fitHotbar() // the cash pill grows with the balance; EMOTE / touch controls come and go
      // live countdowns
      const t = now()
      root.querySelectorAll('[data-ready]').forEach((n) => {
        const left = +n.dataset.ready - t
        if (left <= 0) n.closest('.hs, .bi') && (renderHotbar(), current === 'bag' && renderBag())
        else n.textContent = fmtTime(left)
      })
      if (current === 'rewards') {
        const secs = giftSecs()
        let flip = false
        body.querySelectorAll('[data-left]').forEach((n) => {
          const left = GIFTS[+n.dataset.left].min * 60 - secs
          if (left <= 0) flip = true
          else n.textContent = fmtTime(left * 1000)
        })
        const dl = body.querySelector('[data-next]')
        if (dl && +dl.dataset.next) {
          const left = +dl.dataset.next - t
          if (left <= 0) refreshDaily()
          dl.textContent = fmtTime(left)
        }
        if (flip) renderRewards()
      }
    },
  }
}
