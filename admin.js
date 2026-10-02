/* 거름망 앱 — 관리자: 인스타 게시 승인 대기열 (승인하면 10분 안에 공식 API로 올라간다) */
(() => {
const sb = window.SB, C = window.GR_CONFIG;
const q = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PUB = C.url + '/storage/v1/object/public/social/';
const ST = { draft: '승인 대기', approved: '승인됨 · 올라갈 차례', publishing: '올리는 중', published: '올라감', failed: '실패', rejected: '반려' };
const KIND = { carousel: '캐러셀', image: '사진', reel: '릴스', text: '글' };
const fmt = d => d ? new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

q('.tabs').insertAdjacentHTML('beforeend', '<button role="tab" data-p="admin" aria-selected="false">게시 <span id="n-admin" class="num"></span></button>');
q('#p-alarm').insertAdjacentHTML('afterend', `
<section class="pane" id="p-admin">
  <div class="result" style="margin-top:0"><span id="ad-hits"></span></div>
  <p class="note">Claude가 만든 초안이에요. <b>승인</b>을 누르면 10분 안에 @georeum.mang에 올라가고, 시각을 정하면 그때 올라가요.</p>
  <div class="adq" id="ad-list"></div>
</section>`);

let rows = [];
async function load() {
  const { data, error } = await sb.from('social_posts').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { q('#ad-list').innerHTML = `<p class="note">불러오지 못했어요: ${esc(error.message)}</p>`; return; }
  rows = data; paint();
}
function paint() {
  const wait = rows.filter(r => r.status === 'draft').length;
  q('#n-admin').textContent = wait || '';
  q('#ad-hits').textContent = rows.length ? `초안 ${wait}건 · 전체 ${rows.length}건` : '아직 초안이 없어요';
  q('#ad-list').innerHTML = rows.map(card).join('');
}
function card(r) {
  const media = (r.media || []).map((m, i) => {
    const u = m.path.startsWith('http') ? m.path : PUB + m.path;
    return /\.(mp4|mov)$/i.test(m.path) || m.type === 'video'
      ? `<video src="${esc(u)}" muted playsinline preload="metadata" controls></video>`
      : `<img src="${esc(u)}" alt="${i + 1}번째 장" loading="lazy">`;
  }).join('');
  const can = ['draft', 'failed', 'rejected'].includes(r.status);
  const when = r.scheduled_at ? `예약 ${fmt(r.scheduled_at)}` : '';
  return `<article class="adc" data-id="${r.id}" data-st="${r.status}">
    <div class="adc-media">${media}</div>
    <div class="adc-bd">
      <div class="adc-meta"><span class="adst st-${r.status}">${ST[r.status] || r.status}</span>
        <span>${KIND[r.kind] || r.kind} ${(r.media || []).length}장</span><span>${fmt(r.created_at)} 작성</span>${when ? `<span>${when}</span>` : ''}</div>
      ${r.note ? `<p class="adc-note">${esc(r.note)}</p>` : ''}
      <p class="adc-cap">${esc(r.caption)}</p>
      ${r.error ? `<p class="adc-err">실패 이유: ${esc(r.error)}</p>` : ''}
      ${r.permalink ? `<a class="linkbtn" href="${esc(r.permalink)}" target="_blank" rel="noopener">인스타에서 보기</a>` : ''}
      ${can ? `<div class="adc-act">
        <button class="btn btn-pri" data-a="ok" type="button">${r.status === 'failed' ? '다시 올리기' : '승인'}</button>
        <label class="adc-when">시각 정하기 <input type="datetime-local" data-a="at"></label>
        ${r.status === 'draft' ? '<button class="btn" data-a="no" type="button">반려</button>' : ''}
      </div>` : ''}
    </div>
  </article>`;
}
q('#ad-list').addEventListener('click', async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const c = b.closest('.adc'), id = +c.dataset.id;
  // 한 번 더 눌러야 실행 (실수로 공개 게시되지 않게)
  if (!b.classList.contains('arm')) { b.classList.add('arm'); b._t = b.textContent; b.textContent = b.dataset.a === 'ok' ? '한 번 더 누르면 올라가요' : '한 번 더 누르면 반려'; setTimeout(() => { b.classList.remove('arm'); b.textContent = b._t; }, 3500); return; }
  b.disabled = true;
  if (b.dataset.a === 'ok') {
    const at = c.querySelector('[data-a="at"]').value;
    const { error } = await sb.rpc('approve_post', { p_id: id, p_at: at ? new Date(at).toISOString() : null });
    if (error) alertIn(c, error.message);
  } else {
    const { error } = await sb.from('social_posts').update({ status: 'rejected' }).eq('id', id);
    if (error) alertIn(c, error.message);
  }
  load();
});
const alertIn = (c, m) => c.querySelector('.adc-bd').insertAdjacentHTML('beforeend', `<p class="adc-err">${esc(m)}</p>`);

sb.channel('social').on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, load).subscribe();
load();
})();
