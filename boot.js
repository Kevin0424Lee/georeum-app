/* 거름망 앱 — 시작: 익명 로그인 → 인스타 연결 확인 → 내 정리함 불러오기 → v9 화면 실행 */
(() => {
const C = window.GR_CONFIG;
const sb = supabase.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true } });
window.SB = sb;
const $ = s => document.querySelector(s);
const kst = d => new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(0, 16);   // 'YYYY-MM-DDTHH:MM'

function gate(state, extra) {
  const g = $('#gate'); g.hidden = false; $('#wrap').hidden = true;
  g.dataset.state = state;
  if (state === 'error') $('#g-err').textContent = extra || '';
}

async function start() {
  let { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return gate('error', '로그인하지 못했어요. 잠시 뒤 다시 열어 주세요. (' + error.message + ')');
    session = data.session;
  }
  ME = session.user.id;
  const st = await status();
  if (!st || !st.ig) return linkScreen(st);
  await openBox(st);
}
let ME = null;

async function status() {
  const { data, error } = await sb.rpc('my_status');
  if (error) { gate('error', error.message); return null; }
  return data || {};
}

/* ── 연결 화면: 6자리 코드를 DM으로 보내면 1시간 안에 연결 ── */
async function linkScreen(st) {
  let code = st && st.code;
  if (!code) {
    const { data, error } = await sb.rpc('new_link_code');
    if (error) return gate('error', error.message);
    code = data;
  }
  $('#g-code').textContent = code.replace(/(\d{3})(\d{3})/, '$1 $2');
  gate('link');
  $('#g-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(code); $('#g-copy').textContent = '복사했어요'; }
    catch (_) { const r = document.createRange(); r.selectNodeContents($('#g-code')); getSelection().removeAllRanges(); getSelection().addRange(r); }
  };
  $('#g-new').onclick = async () => { const { data } = await sb.rpc('new_link_code'); if (data) { code = data; $('#g-code').textContent = code.replace(/(\d{3})(\d{3})/, '$1 $2'); } };
  // 연결되면 바로 넘어간다: 내 프로필 변화를 실시간으로 듣고, 혹시 몰라 1분마다도 확인
  const go = async () => { const s = await status(); if (s && s.ig) { clearInterval(t); ch.unsubscribe(); openBox(s); } };
  const ch = sb.channel('me').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.' + ME }, go).subscribe();
  const t = setInterval(go, 60e3);
}

/* ── 내 정리함 ── */
async function all(q) {               // 1000줄 넘어도 다 가져온다
  const out = []; let from = 0;
  for (;;) { const { data, error } = await q().range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}

async function openBox(st) {
  gate('loading');
  let items, memos, mapd;
  try {
    [items, memos, mapd] = await Promise.all([
      all(() => sb.from('user_items').select('post_code,sent_at,override,hidden,posts(view,type,status)').order('sent_at', { ascending: false })),
      all(() => sb.from('memos').select('id,body,sent_at,hidden').order('sent_at', { ascending: false })),
      fetch('map.json').then(r => r.json()),
    ]);
  } catch (e) { return gate('error', '정리함을 불러오지 못했어요. (' + (e.message || e) + ')'); }

  const INFO = [], SPOT = [], ALARM = [], OVR = {}, HID = [];
  let waiting = 0;
  for (const it of items) {
    const p = it.posts; if (!p || !p.view) { waiting++; continue; }   // 아직 검증 중
    const r = p.view;
    (p.type === 'spot' ? SPOT : p.type === 'alarm' ? ALARM : INFO).push(r);
    if (it.override) OVR[r.id] = it.override;
    if (it.hidden) HID.push(r.id);
  }
  const STICKY = memos.map(m => ({ id: 'm' + m.id, txt: m.body, at: kst(m.sent_at), fl: '', X: { pd: kst(m.sent_at).slice(0, 10) } }));
  memos.forEach(m => { if (m.hidden) HID.push('m' + m.id); });

  // 정렬·목록 값은 v9_data.py와 같은 규칙
  const today = new Date(kst(Date.now()).slice(0, 10));
  const akey = r => { const a = r.al || {};
    if (a.st === 'active' && a.due) { const d = Math.round((new Date(a.due) - today) / 864e5); return [0, d >= 0 ? d : 9999, '']; }
    if (a.st === 'rolling' || a.st === 'unknown') return [1, 0, ''];
    return [2, 0, a.due || '']; };
  const cmp = (x, y) => { for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; };
  ALARM.sort((a, b) => cmp(akey(a), akey(b)));
  INFO.sort((a, b) => (b.di || '0000').localeCompare(a.di || '0000'));
  SPOT.sort((a, b) => cmp([+a.en, +!(a.locs || []).length, -(+(a.di || '0').replace(/-/g, ''))], [+b.en, +!(b.locs || []).length, -(+(b.di || '0').replace(/-/g, ''))]));
  const byCount = (arr, k) => { const c = {}; arr.forEach(r => { if (r[k]) c[r[k]] = (c[r[k]] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a]); };
  const pm = {}; INFO.forEach(r => { pm[r.m] = (pm[r.m] || '') > r.pm ? pm[r.m] : r.pm; });

  Object.assign(window, {
    INFO, SPOT, ALARM, STICKY, MAPD: mapd,
    CATS: byCount(INFO, 'c'), KINDS: byCount(SPOT, 'kd'), MONS: Object.keys(pm).sort((a, b) => pm[b].localeCompare(pm[a])),
    ASOF: `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`,
  });
  window.claude = { use: async name => name === 'db' ? makeDB(OVR, HID) : null };   // v9 화면의 저장 자리를 Supabase로

  $('#who').textContent = '@' + st.ig;
  if (waiting) { $('#waiting').hidden = false; $('#waiting').textContent = `검증 중 ${waiting}건 · 끝나면 자동으로 들어와요`; }
  if (!INFO.length && !SPOT.length && !ALARM.length && !STICKY.length) $('#empty').hidden = false;
  if (st.admin) await load('admin.js');
  $('#gate').hidden = true; $('#wrap').hidden = false;
  for (const f of ['v9_app.js', 'v9_map.js', 'v9_export.js']) await load(f);
  listen();
}

function load(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src + '?v=' + C.ver; s.onload = ok; s.onerror = () => no(new Error(src)); document.body.appendChild(s); }); }

/* v9 화면이 쓰는 저장 자리(doc get/set/onSnapshot)를 user_items·memos에 연결 */
function makeDB(OVR0, HID0) {
  const state = { 'state/verdicts': { map: { ...OVR0 } }, 'state/hidden': { ids: [...HID0] } };
  const subs = { 'state/verdicts': [], 'state/hidden': [] };
  const snap = k => ({ exists: true, data: () => JSON.parse(JSON.stringify(state[k])) });
  window.__grPush = (k, fn) => { fn(state[k]); subs[k].forEach(cb => cb(snap(k))); };
  return { doc: k => ({
    get: async () => snap(k),
    onSnapshot: (cb) => { subs[k].push(cb); return () => {}; },
    set: async (d) => {
      if (k === 'state/verdicts') {
        const before = state[k].map, after = d.map || {};
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const id of keys) if (before[id] !== after[id]) {
          const { error } = await sb.from('user_items').update({ override: after[id] || null }).eq('user_id', ME).eq('post_code', id);
          if (error) throw error;
        }
        state[k] = { map: { ...after } };
      } else {
        const before = new Set(state[k].ids), after = new Set(d.ids || []);
        for (const id of after) if (!before.has(id)) {
          const q = id.startsWith('m') && /^m\d+$/.test(id)
            ? sb.from('memos').update({ hidden: true }).eq('id', +id.slice(1))
            : sb.from('user_items').update({ hidden: true }).eq('user_id', ME).eq('post_code', id);
          const { error } = await q; if (error) throw error;
        }
        state[k] = { ids: [...after] };
      }
    },
  }) };
}

/* 다른 기기에서 옮긴 판정은 바로 반영, 새로 검증된 항목은 알림 띠로 */
function listen() {
  let fresh = 0;
  const bump = () => { fresh++; const b = $('#fresh'); b.hidden = false; b.querySelector('span').textContent = `새로 검증된 항목 ${fresh}건`; };
  sb.channel('box')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_items', filter: 'user_id=eq.' + ME }, bump)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memos', filter: 'user_id=eq.' + ME }, bump)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, bump)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_items', filter: 'user_id=eq.' + ME }, ({ new: n }) => {
      window.__grPush && window.__grPush('state/verdicts', s => { if (n.override) s.map[n.post_code] = n.override; else delete s.map[n.post_code]; });
      if (n.hidden) window.__grPush && window.__grPush('state/hidden', s => { if (!s.ids.includes(n.post_code)) s.ids.push(n.post_code); });
    })
    .subscribe();
  $('#fresh button').onclick = () => location.reload();
}

$('#g-retry').onclick = () => location.reload();
start().catch(e => gate('error', e.message || String(e)));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
