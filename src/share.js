// Share cards and challenge links. There is no server: a challenge is a friendly claim carried
// in the URL, every field is validated, and names come from a word list (never free text).
import { t, fmt, fmtTime, getLang } from './i18n.js';
import { BLASTER_ORDER } from './sim/tune.js';

const ADJ = { en: ['Brave', 'Sneaky', 'Soggy', 'Mighty', 'Sleepy', 'Lucky', 'Dizzy', 'Fluffy', 'Speedy', 'Grumpy', 'Jolly', 'Wobbly', 'Daring', 'Cosy', 'Zippy', 'Noble'],
  vi: ['Gan Dạ', 'Lén Lút', 'Ướt Nhẹp', 'Oai Hùng', 'Mê Ngủ', 'May Mắn', 'Chóng Mặt', 'Bông Xù', 'Tốc Độ', 'Cau Có', 'Vui Vẻ', 'Lắc Lư', 'Liều Lĩnh', 'Ấm Áp', 'Nhanh Nhảu', 'Cao Quý'] };
const ANI = { en: ['Otter', 'Badger', 'Sparrow', 'Tabby', 'Duckling', 'Hedgehog', 'Fox', 'Piglet', 'Heron', 'Beaver', 'Rooster', 'Lamb', 'Owl', 'Pony', 'Goose', 'Toad'],
  vi: ['Rái Cá', 'Lửng', 'Chim Sẻ', 'Mèo Mướp', 'Vịt Con', 'Nhím', 'Cáo', 'Heo Con', 'Diệc', 'Hải Ly', 'Gà Trống', 'Cừu Non', 'Cú Mèo', 'Ngựa Con', 'Ngỗng', 'Cóc'] };
export function nameOf(idx) {
  const l = getLang() === 'vi' ? 'vi' : 'en', a = ADJ[l][Math.abs(idx) % 16], b = ANI[l][Math.floor(Math.abs(idx) / 16) % 16];
  return l === 'vi' ? `${b} ${a}` : `${a} ${b}`;
}

const JETS = ['blue', 'pink', 'lime', 'gold', 'ice'];
const int = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };

// mode: d = daily (key is yyyymmdd), e = endless (key is a seed), s = story (key is a stage like 2-3)
export function encodeChallenge(c) {
  return [1, c.mode, String(c.key).replace(/[^0-9-]/g, ''), Math.round(c.score), c.chain | 0, c.pushed | 0, c.name | 0, Math.max(0, JETS.indexOf(c.jet))].join('.');
}
export function decodeChallenge(str) {
  if (typeof str !== 'string' || str.length > 80) return null;
  const p = str.split('.');
  if (p.length !== 8 || p[0] !== '1' || !['d', 'e', 's'].includes(p[1])) return null;
  const key = p[2];
  if (p[1] === 'd' && !/^20\d{6}$/.test(key)) return null;
  if (p[1] === 'e' && !/^\d{1,10}$/.test(key)) return null;
  if (p[1] === 's' && !/^[1-3]-[1-5]$/.test(key)) return null;
  return { mode: p[1], key, score: int(p[3], 0, 9999999), chain: int(p[4], 0, 999), pushed: int(p[5], 0, 9999), name: int(p[6], 0, 999999), jet: JETS[int(p[7], 0, JETS.length - 1)] };
}
export function challengeUrl(c) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('c', encodeChallenge(c));
  return u.toString();
}

function img(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

// 1200 x 630: the size chat apps and social sites preview best
export async function drawCard(cv, d) {
  cv.width = 1200; cv.height = 630;
  const ctx = cv.getContext('2d');
  const [bg, logo, hero, kit] = await Promise.all([img('assets/ui/keyart.jpg'), img('assets/ui/logo.webp'), img('assets/ui/hero_photo_pose.webp'), d.buddy ? img(`assets/ui/${d.buddy}.webp`) : null]);
  if (bg) { const s = Math.max(1200 / bg.width, 630 / bg.height); ctx.drawImage(bg, (1200 - bg.width * s) / 2, (630 - bg.height * s) * 0.3, bg.width * s, bg.height * s); }
  const g = ctx.createLinearGradient(0, 0, 0, 630); g.addColorStop(0, 'rgba(30,60,120,.35)'); g.addColorStop(1, 'rgba(43,29,22,.9)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = 'rgba(255,243,214,.96)'; ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.roundRect(470, 150, 690, 400, 40); ctx.fill(); ctx.stroke();
  if (logo) ctx.drawImage(logo, 40, 24, 400, 400 * logo.height / logo.width);
  if (hero) ctx.drawImage(hero, 120, 245, 260, 260 * hero.height / hero.width);
  if (kit) ctx.drawImage(kit, 330, 470, 110, 110 * kit.height / kit.width);
  const F = (px) => `800 ${px}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const head = d.mode === 'd' ? `${t('daily')} · ${d.key.slice(6, 8)}/${d.key.slice(4, 6)}` : d.mode === 'e' ? t('endless') : `${t('story')} ${d.key}`;
  ctx.font = F(40); ctx.fillStyle = '#6b3d1c'; ctx.fillText(head, 815, 198);
  ctx.font = F(120); ctx.lineWidth = 16; ctx.strokeStyle = '#3a2414'; ctx.strokeText(fmt(d.score), 815, 295); ctx.fillStyle = '#ffc93c'; ctx.fillText(fmt(d.score), 815, 295);
  ctx.font = F(38); ctx.fillStyle = '#3a2414';
  const stats = [[t('chain'), '×' + d.chain], [t('pushed'), String(d.pushed)]];
  if (d.time) stats.push([t('time'), fmtTime(d.time)]);
  stats.forEach((s, i) => { const x = 815 + (i - (stats.length - 1) / 2) * 215; ctx.font = F(26); ctx.fillStyle = '#8a5a30'; ctx.fillText(s[0], x, 385); ctx.font = F(48); ctx.fillStyle = '#3a2414'; ctx.fillText(s[1], x, 428); });
  ctx.font = F(34); ctx.fillStyle = '#7a52d6'; ctx.fillText(nameOf(d.name), 815, 500);
  ctx.font = F(46); ctx.lineWidth = 10; ctx.strokeStyle = '#3a2414'; ctx.strokeText(t('card_beat'), 815, 590); ctx.fillStyle = '#fff3d6'; ctx.fillText(t('card_beat'), 815, 590);
  ctx.font = F(22); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,243,214,.9)'; ctx.fillText(t('tagline'), 30, 606, 410);
}

export async function shareCard(cv, text, url) {
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  const file = blob && typeof File !== 'undefined' ? new File([blob], 'push-in-boots.png', { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text + ' ' + url }); return 'shared'; }
    if (navigator.share) { await navigator.share({ text, url }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  try { await navigator.clipboard.writeText(text + ' ' + url); return 'copied'; } catch (e) { return 'failed'; }
}
export function downloadCard(cv) {
  cv.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'push-in-boots.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}
void BLASTER_ORDER;
