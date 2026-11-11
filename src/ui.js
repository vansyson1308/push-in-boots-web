// Menus: plain DOM over the game canvas. Every screen is rebuilt from the save when shown.
import { t, fmt, fmtTime, LANGS, getLang, KITTEN_NAMES } from './i18n.js';
import { save, persist, totalStars, totalKittens, totalSacks, stageRec, UP_MAX, UP_COST, JET_COST, today } from './save.js';
import { KITTENS } from './sim/sim.js';
import { rankFor, nextRankAt } from './stages.js';
import { JETS } from './render/view.js';
import { play as sfx } from './audio.js';
import { nameOf, drawCard, shareCard, downloadCard, challengeUrl } from './share.js';

const $ui = () => document.getElementById('ui');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const im = (n, cls = '') => `<img src="assets/ui/${n}.webp" alt="" class="${cls}" draggable="false">`;

function mount(html, cls, handlers) {
  const el = document.createElement('div');
  el.className = cls; el.innerHTML = html;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    sfx('ui_click', { vol: 0.6 });
    const fn = handlers[b.dataset.act];
    if (fn) fn(b, el);
  });
  return el;
}
export function screen(html, cls, handlers) {
  const el = mount(html, 'screen ' + (cls || ''), handlers);
  $ui().replaceChildren(el);
  return el;
}
export function modal(html, handlers, wide) {
  const el = mount(`<div class="panel">${html}</div>`, 'modal' + (wide ? ' wide' : ''), handlers);
  $ui().appendChild(el);
  return el;
}
export function clearUi() { $ui().replaceChildren(); }
export function closeModal(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

let toastTimer = 0;
export function toast(str, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = str; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// how many of the eleven named kittens have moved in, given the number of cages opened so far
export function kittensHome(app) {
  const n = totalKittens(), total = app.data.totalCages;
  let home = 0;
  for (let i = 0; i < KITTENS.length; i++) if (n >= 1 + Math.round((i * (total - 1)) / (KITTENS.length - 1))) home++;
  return home;
}
export function stageUnlocked(app, id) {
  const order = app.data.order, i = order.indexOf(id);
  if (i <= 0) return true;
  return stageRec(order[i - 1]).stars > 0 || (i >= 2 && stageRec(order[i - 2]).stars > 0);
}
const arenaOpen = () => stageRec('1-2').stars > 0;
const stars3 = (n, cls = '') => [0, 1, 2].map((i) => im(i < n ? 'star' : 'star_empty', cls + (i < n ? ' on' : ''))).join('');

// ---------------------------------------------------------------------------
export function showMap(app, focus) {
  const d = save.data, order = app.data.order, home = kittensHome(app);
  const cur = order.find((id) => stageUnlocked(app, id) && !stageRec(id).stars) || order[order.length - 1];
  const worlds = [1, 2, 3].map((w) => {
    const ids = order.filter((id) => app.data.stages[id].world === w);
    const open = stageUnlocked(app, ids[0]);
    const got = ids.reduce((n, id) => n + stageRec(id).stars, 0);
    const nodes = ids.map((id) => {
      const st = app.data.stages[id], r = stageRec(id), un = stageUnlocked(app, id);
      const disc = !un ? 'node_locked' : id === cur ? 'node_current' : 'node_done';
      const mark = !un ? '' : st.kind === 'boss' ? im('icon_skull') : `<b>${st.index}</b>`;
      return `<button class="node ${id === cur ? 'cur' : ''}" data-act="stage" data-id="${id}" ${un ? '' : 'disabled'} aria-label="${id}">
        <span class="disc" style="background-image:url(assets/ui/${disc}.webp)">${disc === 'node_locked' ? '' : mark}</span>
        <span class="stars">${un ? stars3(r.stars) : ''}</span>
        ${r.rank ? `<span class="rank">${r.rank}</span>` : ''}
      </button>`;
    }).join('');
    return `<section class="world ${open ? '' : 'locked'}" id="world-${w}">
      <div class="banner" style="background-image:url(assets/ui/chapter_${w}.webp)"><span>${t('world' + w)}</span><em class="chip">${im('star')}${got}/15</em></div>
      <div class="nodes">${nodes}</div></section>`;
  }).join('');
  const dl = d.daily, doneToday = dl.date === today();
  const lockTxt = `<small>${t('locked')} · 1-2</small>`;
  const kits = KITTENS.map((k, i) => im(k, 'kit' + (i < home ? '' : ' away'))).join('');
  const el = screen(`
    <div class="topbar">
      <h1>Push In Boots</h1>
      <span class="chip">${im('star')}${totalStars()}/45</span>
      <span class="chip">${im('coin')}${fmt(d.coins)}</span>
      <button class="round" data-act="settings" aria-label="${t('settings')}">${im('icon_gear')}</button>
    </div>
    <div class="scroll">
      <div class="hubrow">
        <button class="hub ${arenaOpen() ? '' : 'locked'}" data-act="daily">${im('icon_calendar')}<span><b>${t('daily')}</b>${arenaOpen() ? `<small>${doneToday ? t('daily_done', fmt(dl.score)) : '90s · ' + t('play')}</small>` : lockTxt}</span></button>
        <button class="hub gold ${arenaOpen() ? '' : 'locked'}" data-act="endless">${im('icon_skull')}<span><b>${t('endless')}</b>${arenaOpen() ? `<small>${t('best')}: ${fmt(d.endless.best)}</small>` : lockTxt}</span></button>
        <button class="hub green" data-act="shop">${im('icon_hammer')}<span><b>${t('shop')}</b><small>${t('upgrades')}</small></span></button>
        <button class="hub pink" data-act="album">${im('kitten_house')}<span><b>${t('kittens')}</b><small>${home}/11</small></span></button>
      </div>
      ${worlds}
      <div class="farm" data-act="album">${im('hero_sit_fence', 'hero')}${kits}
        <div class="cap"><b>${t('kittens_home', home, 11)}</b><br>${t('grain')}: ${totalSacks()}</div></div>
      <p class="center" style="color:rgba(255,243,214,.7);margin:1em 0 0">${t('credits')} · ${t('you_are', esc(nameOf(d.name)))}</p>
    </div>`, 'map', {
    stage: (b) => showStageCard(app, b.dataset.id),
    daily: () => (arenaOpen() ? showArenaCard(app, 'daily') : toast(t('locked') + ' · 1-2')),
    endless: () => (arenaOpen() ? showArenaCard(app, 'endless') : toast(t('locked') + ' · 1-2')),
    shop: () => showShop(app), album: () => showAlbum(app), settings: () => showSettings(app, false),
  });
  const target = el.querySelector('#world-' + app.data.stages[focus || cur].world);
  if (target && app.data.stages[focus || cur].world > 1) target.scrollIntoView({ block: 'center' });
  return el;
}

function objectives(app, id, res) {
  const st = app.data.stages[id], r = stageRec(id);
  const cages = new Set([...(r.cages || []), ...((res && res.kittens) || [])]).size;
  const score = Math.max(r.best || 0, res ? res.score : 0);
  const rows = [
    [r.stars > 0 || (res && res.outcome === 'win'), t('obj_clear'), ''],
    [cages >= st.cages, t('obj_kittens'), `${cages}/${st.cages}`],
    [score >= st.target, t('obj_score', fmt(st.target)), score ? fmt(score) : ''],
  ];
  return `<div class="objs">${rows.map((o) => `<div class="obj ${o[0] ? 'done' : ''}">${im(o[0] ? 'star' : 'star_empty')}<span>${o[1]}</span><em>${o[2]}</em></div>`).join('')}</div>`;
}

export function showStageCard(app, id) {
  const st = app.data.stages[id], r = stageRec(id);
  const m = modal(`
    <h2>${id} · ${t('world' + st.world)}</h2>
    <p class="center muted">${t('kind_' + st.kind)}${r.best ? ` · ${t('best')}: ${fmt(r.best)}${r.chain ? ' · ×' + r.chain : ''}` : ''}</p>
    ${objectives(app, id)}
    <div class="row" style="margin-top:.8em">
      <button class="btn plain" data-act="close">${t('back')}</button>
      <button class="btn green big" data-act="go">${t('play')}</button>
    </div>`, { close: (b, el) => closeModal(el), go: (b, el) => { closeModal(el); app.startStage(id); } });
  return m;
}

export function showArenaCard(app, mode, challenge) {
  const d = save.data, daily = mode === 'daily', counted = daily && d.daily.date !== today() && !challenge;
  const ch = challenge ? `<div class="news">${im('icon_ribbon')}<span><b>${t('challenge_from', esc(nameOf(challenge.name)))}</b><br>${t('challenge_beat', fmt(challenge.score), challenge.chain)}</span></div>` : '';
  return modal(`
    <h2>${t(mode)}</h2>
    ${ch}
    <p class="center">${t(daily ? 'daily_d' : 'endless_d')}</p>
    ${daily ? `<p class="center muted">${counted ? t('daily_first') : d.daily.date === today() ? t('daily_done', fmt(d.daily.score)) + ' · ' + t('daily_practice') : ''}${d.daily.streak > 1 ? ' · ' + t('streak', d.daily.streak) : ''}</p>`
      : `<p class="center muted">${t('best')}: ${fmt(d.endless.best)}${d.endless.chain ? ' · ×' + d.endless.chain : ''}</p>`}
    <div class="row" style="margin-top:.8em">
      <button class="btn plain" data-act="close">${t('back')}</button>
      <button class="btn green big" data-act="go">${challenge ? t('accept') : t('play')}</button>
    </div>`, { close: (b, el) => { closeModal(el); if (challenge) app.challenge = null; }, go: (b, el) => { closeModal(el); app.startArena(mode, challenge); } });
}

// ---------------------------------------------------------------------------
export function showPause(app) {
  const p = save.data.prefs, arena = app.play && app.play.sim.stage.arena;
  const sw = (k) => `<div class="toggle"><span>${t(k === 'autoFire' ? 'autofire' : k)}</span><button class="switch ${p[k] ? 'on' : ''}" data-act="tog" data-k="${k}" aria-label="${t(k === 'autoFire' ? 'autofire' : k)}"></button></div>`;
  return modal(`
    <h2>${t('paused')}</h2>
    ${app.play && !arena ? objectives(app, app.play.sim.stage.id) : ''}
    ${sw('sound')}${sw('music')}${sw('autoFire')}
    <div class="col" style="margin-top:.7em">
      <button class="btn green big" data-act="resume">${t('resume')}</button>
      <div class="row"><button class="btn plain" data-act="restart">${t('restart')}</button><button class="btn plain" data-act="quit">${t('quit')}</button>
        ${document.fullscreenEnabled || document.webkitFullscreenEnabled ? `<button class="btn plain small" data-act="full">${t('fullscreen')}</button>` : ''}</div>
    </div>`, {
    resume: (b, el) => { closeModal(el); app.resume(); },
    restart: (b, el) => { closeModal(el); app.restart(); },
    quit: (b, el) => { closeModal(el); app.quitToMap(); },
    full: () => app.toggleFullscreen(),
    tog: (b) => { p[b.dataset.k] = !p[b.dataset.k]; b.classList.toggle('on', p[b.dataset.k]); app.applyPrefs(); persist(); },
  });
}

export function showSettings(app) {
  const p = save.data.prefs;
  const sw = (k, label) => `<div class="toggle"><span>${t(label)}</span><button class="switch ${p[k] ? 'on' : ''}" data-act="tog" data-k="${k}" aria-label="${t(label)}"></button></div>`;
  const draw = () => `
    <h2>${t('settings')}</h2>
    ${sw('sound', 'sound')}${sw('music', 'music')}${sw('autoFire', 'autofire')}${sw('effects', 'effects')}${sw('haptics', 'haptics')}
    <div class="toggle"><span>${t('language')}</span><span class="row">${LANGS.map(([c, n]) => `<button class="btn small ${getLang() === c ? '' : 'plain'}" data-act="lang" data-l="${c}">${n}</button>`).join('')}</span></div>
    <p style="margin-top:.6em">${t('controls')}</p>
    <div class="keys"><b>A D / ← →</b><span>${t('k_move')}</span><b>SPACE / K / Z</b><span>${t('k_jump')}</span><b>J / X / 🖱</b><span>${t('k_spray')}</span>
      <b>W / S</b><span>${t('k_aim')}</span><b>L / C</b><span>${t('k_splash')}</span><b>ESC / P</b><span>${t('paused')}</span></div>
    <div class="row between" style="margin-top:1em"><button class="btn small red" data-act="reset">${t('reset')}</button>
      ${document.fullscreenEnabled || document.webkitFullscreenEnabled ? `<button class="btn small plain" data-act="full">${t('fullscreen')}</button>` : ''}
      <button class="btn" data-act="close">${t('close')}</button></div>`;
  const m = modal(draw(), {
    close: (b, el) => { closeModal(el); if (app.screen === 'map') showMap(app); },
    tog: (b) => { p[b.dataset.k] = !p[b.dataset.k]; b.classList.toggle('on', p[b.dataset.k]); app.applyPrefs(); persist(); },
    lang: (b, el) => { app.setLanguage(b.dataset.l); el.querySelector('.panel').innerHTML = draw(); },
    full: () => app.toggleFullscreen(),
    reset: (b, el) => { if (b.dataset.sure) { app.resetProgress(); closeModal(el); showMap(app); } else { b.dataset.sure = '1'; b.textContent = t('reset_ask') + ' ' + t('yes'); } },
  });
  return m;
}

// ---------------------------------------------------------------------------
export function showShop(app, tab = 'up') {
  const d = save.data, stars = totalStars(), kits = totalKittens();
  const body = () => {
    if (tab === 'up') {
      const icons = { pressure: 'pea_popper', tank: 'yarn_basket', heart: 'heart', magnet: 'coin' };
      return `<div class="grid">${Object.keys(UP_MAX).map((k) => {
        const lv = d.up[k], max = lv >= UP_MAX[k], cost = max ? 0 : UP_COST[k][lv];
        return `<div class="card">${im(icons[k], 'ic')}<b>${t('up_' + k)}</b><small>${t('up_' + k + '_d')}</small>
          <div class="pips">${Array.from({ length: UP_MAX[k] }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
          <button class="btn small ${max ? 'plain' : ''}" data-act="buy" data-k="${k}" ${max || d.coins < cost ? 'disabled' : ''}>${max ? t('maxed') : im('coin') + cost}</button></div>`;
      }).join('')}</div>`;
    }
    if (tab === 'jet') {
      return `<div class="grid">${Object.keys(JET_COST).map((k) => {
        const c = JET_COST[k], ok = c.free || (c.stars && stars >= c.stars) || (c.kittens && kits >= c.kittens), sel = d.jet === k;
        const need = c.free ? t('free') : c.stars ? t('need_stars_n', c.stars) : t('need_kittens', c.kittens);
        return `<div class="card ${sel ? 'sel' : ''} ${ok ? '' : 'lock'}"><span class="swatch" style="background:radial-gradient(circle at 35% 30%, ${JETS[k].core}, ${JETS[k].mid} 55%, ${JETS[k].edge})"></span><b>${t('jet_' + k)}</b>
          <small>${ok ? '&nbsp;' : im('lock', 'ic').replace('class="ic"', 'style="height:1.2em;vertical-align:middle"') + ' ' + need}</small>
          <button class="btn small ${sel ? 'plain' : ''}" data-act="jet" data-k="${k}" ${ok && !sel ? '' : 'disabled'}>${sel ? t('equipped') : t('use')}</button></div>`;
      }).join('')}</div>`;
    }
    const home = kittensHome(app);
    return `<p class="center">${t('buddy_d')}</p><div class="grid">
      <div class="card ${d.buddy ? '' : 'sel'}">${im('cage', 'ic')}<b>${t('buddy_none')}</b><button class="btn small ${d.buddy ? '' : 'plain'}" data-act="buddy" data-k="" ${d.buddy ? '' : 'disabled'}>${d.buddy ? t('use') : t('equipped')}</button></div>
      ${KITTENS.map((k, i) => i < home ? `<div class="card ${d.buddy === k ? 'sel' : ''}">${im(k, 'ic')}<b>${KITTEN_NAMES[k]}</b><small>${t('mood_' + k)}</small><button class="btn small ${d.buddy === k ? 'plain' : ''}" data-act="buddy" data-k="${k}" ${d.buddy === k ? 'disabled' : ''}>${d.buddy === k ? t('equipped') : t('use')}</button></div>`
        : `<div class="card lock">${im(k, 'ic').replace('class="ic"', 'class="ic" style="filter:brightness(0);opacity:.3"')}<b>${t('kitten_locked')}</b><small>&nbsp;</small></div>`).join('')}</div>`;
  };
  const draw = () => `
    <h2>${t('shop')} <span class="chip" style="font-size:.6em;vertical-align:middle">${im('coin')}${fmt(d.coins)}</span></h2>
    <div class="tabs">${[['up', 'upgrades'], ['jet', 'jets'], ['buddy', 'buddy']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab" data-k="${k}">${t(l)}</button>`).join('')}</div>
    ${body()}
    <div class="row" style="margin-top:.9em"><button class="btn" data-act="close">${t('close')}</button></div>`;
  const re = (el) => { el.querySelector('.panel').innerHTML = draw(); };
  return modal(draw(), {
    close: (b, el) => { closeModal(el); showMap(app); },
    tab: (b, el) => { tab = b.dataset.k; re(el); },
    buy: (b, el) => { const k = b.dataset.k, cost = UP_COST[k][d.up[k]]; if (d.coins >= cost && d.up[k] < UP_MAX[k]) { d.coins -= cost; d.up[k]++; persist(); sfx('power_up'); re(el); } },
    jet: (b, el) => { d.jet = b.dataset.k; persist(); re(el); },
    buddy: (b, el) => { d.buddy = b.dataset.k; persist(); if (d.buddy) sfx('meow'); re(el); },
  }, true);
}

export function showAlbum(app) {
  const home = kittensHome(app), n = totalKittens();
  return modal(`
    <h2>${t('album')}</h2>
    <p class="center">${t('kittens_home', home, 11)} · ${im('cage').replace('<img', '<img style="height:1.4em;vertical-align:middle"')} ${n}/${app.data.totalCages}</p>
    <div class="grid">${KITTENS.map((k, i) => i < home
    ? `<div class="card">${im(k, 'ic')}<b>${KITTEN_NAMES[k]}</b><small>${t('mood_' + k)}</small><small>${t('kitten_home')}</small></div>`
    : `<div class="card lock">${im(k, 'ic').replace('class="ic"', 'class="ic" style="filter:brightness(0);opacity:.3"')}<b>${t('kitten_locked')}</b><small>${im('cage').replace('<img', '<img style="height:1.2em;vertical-align:middle"')} ${1 + Math.round((i * (app.data.totalCages - 1)) / 10)}</small></div>`).join('')}</div>
    <div class="row" style="margin-top:.9em"><button class="btn" data-act="close">${t('close')}</button></div>`, { close: (b, el) => closeModal(el) }, true);
}

// ---------------------------------------------------------------------------
export function showResults(app, res, info) {
  const st = app.data.stages[res.stageId], r = stageRec(res.stageId), rank = rankFor(res.score, st.target);
  const cages = (r.cages || []).length, left = st.cages - cages;
  let hint;
  if (r.stars >= 3) { const nr = nextRankAt(res.score, st.target); hint = nr ? t('hint_rank', fmt(nr)) : t('hint_all'); }
  else if (left > 0) hint = t('next_star', t('hint_kittens', left));
  else hint = t('next_star', t('hint_score', fmt(Math.max(0, st.target - Math.max(r.best, res.score)))));
  const news = (info.news || []).map((n) => `<div class="news">${n.img ? im(n.img) : ''}<span>${esc(n.text)}</span></div>`).join('');
  const order = app.data.order, next = order[order.indexOf(res.stageId) + 1];
  return modal(`
    <h2>${t('stage_clear')} <small class="muted">${res.stageId}</small></h2>
    <div class="bigstars">${[0, 1, 2].map((i) => `<img src="assets/ui/${i < info.stars ? 'star' : 'star_empty'}.webp" alt="" class="${i < info.stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.22}s">`).join('')}</div>
    <div class="row"><span class="scorebig">${fmt(res.score)}</span><span class="rankbadge ${rank}">${rank}</span></div>
    ${info.newBest ? `<p class="center" style="color:#d0421e">${t('new_best')}</p>` : ''}
    <div class="statgrid">
      <span>${t('time')}</span><span>${fmtTime(res.time)}${res.timeBonus ? ' · +' + fmt(res.timeBonus) : ''}</span>
      <span>${t('chain')}</span><span>×${res.chain}</span>
      <span>${t('pushed')}</span><span>${res.pushed}${res.causes.dunked ? ` · ${res.causes.dunked} ${t('c_dunked').split(' ')[0].toLowerCase()}` : ''}</span>
      ${res.noKo ? `<span>${t('no_ko')}</span><span>+${fmt(res.noKo)}</span>` : `<span>${t('kos')}</span><span>${res.kos}</span>`}
      <span>${t('coins_earned')}</span><span>+${info.coins}</span>
    </div>
    ${objectives(app, res.stageId, res)}
    <div class="hint">${hint}</div>
    ${news}
    <div class="row" style="margin-top:.6em">
      <button class="btn plain small" data-act="map">${t('map')}</button>
      <button class="btn plain small" data-act="retry">${t('retry')}</button>
      <button class="btn blue small" data-act="share">${t('share')}</button>
      ${next && stageUnlocked(app, next) ? `<button class="btn green" data-act="next">${t('next')}</button>` : ''}
    </div>`, {
    map: (b, el) => { closeModal(el); app.toMap(res.stageId); },
    retry: (b, el) => { closeModal(el); app.startStage(res.stageId); },
    next: (b, el) => { closeModal(el); app.afterStage(res.stageId, next); },
    share: () => showShare(app, { mode: 's', key: res.stageId, score: res.score, chain: res.chain, pushed: res.pushed, time: res.time }),
  });
}

export function showArenaResults(app, res, info) {
  const daily = res.mode === 'daily', ch = info.challenge;
  const vs = ch ? `<div class="news">${im('icon_ribbon')}<span>${res.score > ch.score ? t('challenge_won', esc(nameOf(ch.name))) : t('challenge_lost', esc(nameOf(ch.name)), fmt(ch.score - res.score))}</span></div>` : '';
  return modal(`
    <h2>${t(res.mode)}</h2>
    <div class="scorebig">${fmt(res.score)}</div>
    ${info.newBest ? `<p class="center" style="color:#d0421e">${t('new_best')}</p>` : ''}
    <p class="center muted">${daily ? (info.counted ? t('daily_counted') : t('daily_practice')) + (save.data.daily.streak > 1 ? ' · ' + t('streak', save.data.daily.streak) : '') : t('best') + ': ' + fmt(save.data.endless.best)}</p>
    <div class="statgrid">
      <span>${t('chain')}</span><span>×${res.chain}</span>
      <span>${t('pushed')}</span><span>${res.pushed}</span>
      ${Object.entries(res.causes).filter(([k]) => k !== 'washed').map(([k, n]) => `<span>${t('c_' + k).replace(/ ×.*/, '')}</span><span>${n}</span>`).join('')}
      <span>${t('time')}</span><span>${fmtTime(res.time)}</span>
      <span>${t('coins_earned')}</span><span>+${info.coins}</span>
    </div>
    ${vs}
    <div class="row" style="margin-top:.6em">
      <button class="btn plain small" data-act="map">${t('map')}</button>
      <button class="btn plain small" data-act="retry">${t('retry')}</button>
      <button class="btn blue" data-act="share">${ch ? t('challenge') : t('share')}</button>
    </div>`, {
    map: (b, el) => { closeModal(el); app.toMap(); },
    retry: (b, el) => { closeModal(el); app.startArena(res.mode, null, info.seedKey); },
    share: () => showShare(app, { mode: daily ? 'd' : 'e', key: info.seedKey, score: res.score, chain: res.chain, pushed: res.pushed, time: daily ? 0 : res.time }),
  });
}

export function showShare(app, c) {
  const d = save.data;
  const data = { ...c, name: d.name, jet: d.jet, buddy: d.buddy };
  const url = challengeUrl(data);
  const key = c.mode === 'd' ? 'share_text_daily' : c.mode === 'e' ? 'share_text_endless' : 'share_text_story';
  const text = t(key, c.pushed, fmt(c.score), c.chain, c.mode === 'e' ? fmtTime(c.time) : c.key);
  const m = modal(`
    <h2>${t('challenge')}</h2>
    <canvas class="sharecard" width="1200" height="630"></canvas>
    <p class="center muted" style="font-size:.95em">${esc(text)}</p>
    <div class="row" style="margin-top:.6em">
      <button class="btn plain small" data-act="close">${t('close')}</button>
      <button class="btn plain small" data-act="save">${t('save_image')}</button>
      <button class="btn blue" data-act="share">${t('share')}</button>
    </div>`, {
    close: (b, el) => closeModal(el),
    save: (b, el) => downloadCard(el.querySelector('canvas')),
    share: async (b, el) => { const r = await shareCard(el.querySelector('canvas'), text, url); if (r === 'copied') toast(t('copied')); else if (r === 'failed') toast(url, 6000); },
  }, true);
  drawCard(m.querySelector('canvas'), data);
  return m;
}

export function showChallenge(app, ch) {
  if (ch.mode === 's') {
    return modal(`
      <h2>${t('challenge_from', esc(nameOf(ch.name)))}</h2>
      <p class="center">${ch.key} · ${t('challenge_beat', fmt(ch.score), ch.chain)}</p>
      <div class="row" style="margin-top:.8em"><button class="btn plain" data-act="close">${t('close')}</button>
      ${stageUnlocked(app, ch.key) ? `<button class="btn green big" data-act="go">${t('accept')}</button>` : `<span class="muted">${t('need_stars')}</span>`}</div>`,
    { close: (b, el) => { closeModal(el); app.challenge = null; }, go: (b, el) => { closeModal(el); app.startStage(ch.key); } });
  }
  return showArenaCard(app, ch.mode === 'd' ? 'daily' : 'endless', ch);
}

export function showStory(app, panels, done) {
  let i = 0;
  const draw = () => `<img src="assets/ui/${panels[i][0]}.webp" alt=""><p>${t(panels[i][1])}</p>
    <div class="row"><button class="btn plain small" data-act="skip">${t('skip')}</button><button class="btn green" data-act="next">${t('cont')}</button></div>`;
  const el = screen(draw(), 'story', {
    skip: () => done(),
    next: () => { i++; if (i >= panels.length) done(); else el.innerHTML = draw(); },
  });
  return el;
}
