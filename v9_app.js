const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const VS=['위험','주의','안전'];
const OUT_SVG='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 3h7v7M13 3 4 12"/></svg>';

/* ── 저장: 숨김 · 직접 분류 ─────────────────────────── */
let DB=null, HID=new Set(), OVR={};
const V=r=>OVR[r.id]||r.r;                     // 지금 판정(직접 옮긴 게 있으면 그것)
const keep=a=>a.filter(x=>!HID.has(x.id));
let wq=Promise.resolve();
function save(doc,data){
  if(!DB) return;
  wq=wq.then(()=>DB.doc(doc).set(data)).catch(()=>{
    $('#al-note').textContent='저장하지 못했습니다. 이 화면에서만 반영됩니다.';
  });
}
(async()=>{
  await null;
  try{ if(typeof claude!=='undefined'&&claude&&claude.use) DB=await claude.use('db'); }catch(_){ DB=null; }
  if(!DB){
    $('#al-note').textContent='이 화면에서 지운 것은 새로고침하면 돌아옵니다. 저장 공간에 연결되지 않았어요.';
    return;
  }
  document.documentElement.setAttribute('data-db','on');
  const apply=(doc,fn)=>{
    DB.doc(doc).get().then(s=>{ if(s.exists) fn(s.data()); }).catch(()=>{});
    try{ DB.doc(doc).onSnapshot(s=>{ if(s.exists) fn(s.data()); },()=>{}); }catch(_){}
  };
  apply('state/hidden',d=>{ HID=new Set(d.ids||[]); paintMemo(); paintAlarm(); });
  apply('state/verdicts',d=>{
    const next=d.map||{};
    const same=Object.keys(next).length===Object.keys(OVR).length&&Object.keys(next).every(k=>OVR[k]===next[k]);
    if(same) return;
    const changed=new Set([...Object.keys(next),...Object.keys(OVR)]);
    OVR=next; changed.forEach(updateRow); paintControls();
  });
})();
function setVerdict(id,v){
  if(v) OVR[id]=v; else delete OVR[id];
  save('state/verdicts',{map:{...OVR},at:new Date().toISOString()});
  updateRow(id); paintControls();
}
/* 판정 하나가 바뀌면 목록을 다시 그리지 않고 그 행만 고친다 — 펼친 상태 유지 */
function updateRow(id){
  const r=IBY[id]||SBY[id]||ABY[id]; if(!r) return;
  $$('.row[data-id="'+id+'"]').forEach(row=>{
    row.className=row.className.replace(/\bv-\S+/,'v-'+V(r));
    const b=row.querySelector('.badge'); if(b) b.outerHTML=badge(r);
    const bd=row.querySelector('.row-bd');
    if(bd){ if(row.hasAttribute('data-open')){ bd.innerHTML=(IBY[id]?infoBody:SBY[id]?spotBody:alarmBody)(r); } else bd.dataset.done=''; }
  });
  if(SBY[id]&&window.GMAP) GMAP.redraw();
}
function paintControls(){ paintTally(); paintInfoControls(); paintSpotControls(); }
function hide(ids){
  ids.forEach(i=>HID.add(i));
  save('state/hidden',{ids:[...HID],at:new Date().toISOString()});
  paintMemo(); paintAlarm();
}
function arm(btn,label,run){
  if(btn.classList.contains('arm')){ clearTimeout(btn._t); run(); return; }
  btn.classList.add('arm'); btn._txt=btn.textContent; btn.textContent=label;
  btn._t=setTimeout(()=>{ btn.classList.remove('arm'); btn.textContent=btn._txt; },3200);
}

/* ── 집계 ── */
function counts(list){ const c={위험:0,주의:0,안전:0}; list.forEach(r=>{ c[V(r)]=(c[V(r)]||0)+1; }); return c; }
function paintTally(){
  const all=INFO.concat(SPOT,ALARM), c=counts(all), n=all.length;
  $('#tbar').innerHTML=VS.map(k=>c[k]?`<i class="t-${k}" style="flex:${c[k]}"></i>`:'').join('');
  $('#tbar').setAttribute('aria-label',VS.map(k=>`${k} ${c[k]}건`).join(', '));
  const moved=Object.keys(OVR).length;
  $('#tleg').innerHTML=VS.map(k=>`<li><button type="button" data-v="${k}"><i class="dot d-${k}"></i>${k} <b class="num">${c[k]}</b></button></li>`).join('')
    +`<li class="asof">${ASOF} 기준 · ${n}건${moved?` · 직접 옮긴 것 ${moved}건`:''}</li>`;
}
$('#tleg').addEventListener('click',e=>{
  const b=e.target.closest('button[data-v]'); if(!b) return;
  IS.r=b.dataset.v; goTab('info'); paintInfo(true);
  $('#p-info').scrollIntoView({block:'start'});
});

/* ── 탭 ── */
function goTab(p){
  $$('.tabs button').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.p===p)));
  $$('.pane').forEach(x=>x.toggleAttribute('data-on',x.id==='p-'+p));
  $('#wrap').classList.toggle('wide',p==='spot');
  if(p==='spot' && window.GMAP) GMAP.resize();
  try{ history.replaceState(null,'','#'+p); }catch(_){}
}
$$('.tabs button').forEach(b=>b.addEventListener('click',()=>{ goTab(b.dataset.p); window.scrollTo({top:0}); }));

/* ── 공통 조각 ── */
function badge(r){
  const v=V(r), mine=OVR[r.id];
  return `<span class="badge b-${v}">${v}${mine?'<span class="mine">직접</span>':''}</span>`;
}
const MARK={'🎬':'음성','🖼':'화면','🖼️':'화면','🔎':'조사','💬':'댓글','📝':'캡션'};
function proofHTML(ev){
  if(!ev) return '';
  const parts=ev.replace(/\s*\/\s*(?=🎬|🖼|🔎|💬|📝)/g,'\n').split(/\n|(?=🎬|🖼|🔎|💬|📝)/).map(s=>s.trim()).filter(Boolean);
  return parts.map(p=>{
    let k=''; for(const m in MARK){ if(p.startsWith(m)){ k=MARK[m]; p=p.slice(m.length).replace(/^️/,'').trim(); break; } }
    const h=esc(p).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
    return `<p>${k?`<span class="k">${k}</span>`:''}${h}</p>`;
  }).join('');
}
function decideHTML(r){
  if(r.r!=='주의') return '';
  const cur=OVR[r.id];
  if(cur) return `<div class="decide done"><p>1차 판정은 <b>주의</b>였고, 은규님이 <b>${cur}</b>으로 옮겼습니다.</p>
    <div class="acts"><button class="btn" type="button" data-set="">주의로 되돌리기</button></div></div>`;
  return `<div class="decide"><p><b>1차 판정 · 주의</b> — 확인할 게 남아 있는 항목입니다. 직접 보고 옮겨두면 목록과 집계에 반영돼요.</p>
    <div class="acts"><button class="btn to-위험" type="button" data-set="위험">위험으로 옮기기</button>
    <button class="btn to-안전" type="button" data-set="안전">안전으로 옮기기</button></div></div>`;
}
function footHTML(r){
  const tags=[r.c,...(r.f||[])].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('');
  return `<div class="foot">${tags}<span class="num">신뢰 ${r.cr}/5 · 활용 ${r.us}/5</span><span class="gap"></span>
    ${r.l?`<a class="out" href="${esc(r.l)}" target="_blank" rel="noopener">원본 보기 ${OUT_SVG}</a>`:''}</div>`;
}
function proofBlock(r){
  if(!r.ev) return '';
  const long=r.ev.length>520;
  return `<div class="sec"><h4>확인한 것</h4><div class="proof${long?' clamp':''}">${proofHTML(r.ev)}</div>
    ${long?'<button class="linkbtn more" type="button">전부 보기</button>':''}
    ${r.vb?`<p class="note">검증 범위 — ${esc(r.vb)}</p>`:''}</div>`;
}
function infoBody(r){
  let ds=r.ds||'';
  return decideHTML(r)
    +(ds?`<div class="sec"><h4>요약</h4><p>${esc(ds)}</p></div>`:'')
    +(r.nt?`<div class="sec"><h4>왜 이렇게 봤나</h4><p>${esc(r.nt)}</p></div>`:'')
    +proofBlock(r)+footHTML(r);
}
/* 행 펼치기 — 본문은 처음 열 때 만든다 */
function wireRows(root,find,body){
  root.onclick=e=>{
    const set=e.target.closest('[data-set]');
    if(set){ const id=set.closest('.row').dataset.id; setVerdict(id,set.dataset.set||null); return; }
    const more=e.target.closest('.more');
    if(more){ const p=more.previousElementSibling; p.classList.remove('clamp'); more.remove(); return; }
    const hd=e.target.closest('.row-hd'); if(!hd) return;
    const row=hd.parentElement, bd=row.querySelector('.row-bd'), open=!row.hasAttribute('data-open');
    if(open && !bd.dataset.done){ bd.innerHTML=body(find(row.dataset.id)); bd.dataset.done='1'; }
    row.toggleAttribute('data-open',open); bd.hidden=!open; hd.setAttribute('aria-expanded',String(open));
    if(row._onopen) row._onopen(open);
  };
}
function refreshOpen(root,find,body){
  root.querySelectorAll('.row[data-open] .row-bd').forEach(bd=>{ bd.innerHTML=body(find(bd.parentElement.dataset.id)); });
  root.querySelectorAll('.row:not([data-open]) .row-bd').forEach(bd=>{ bd.dataset.done=''; });
}

/* ── 정보 ── */
const IS={q:'',r:'',c:'',m:'',n:60};
const IBY=Object.fromEntries(INFO.map(r=>[r.id,r]));
function fillSelect(el,label,opts,val){
  el.innerHTML=`<option value="">${label}</option>`+opts.map(o=>`<option value="${esc(o.v)}"${o.v===val?' selected':''}>${esc(o.t)} ${o.n}</option>`).join('');
  el.classList.toggle('on',!!val);
}
function iMatch(r,skip){
  if(skip!=='c'&&IS.c&&r.c!==IS.c) return false;
  if(skip!=='m'&&IS.m&&r.m!==IS.m) return false;
  if(skip!=='r'&&IS.r&&V(r)!==IS.r) return false;
  if(IS.q){ const q=IS.q.toLowerCase();
    if(!(r.t+' '+r.v+' '+r.a+' '+r.c+' '+r.ds+' '+r.tt).toLowerCase().includes(q)) return false; }
  return true;
}
function chipsHTML(total,c,cur){
  return `<button class="chip" type="button" data-v="" aria-pressed="${!cur}">전체 <em class="num">${total}</em></button>`
    +VS.map(k=>`<button class="chip" type="button" data-v="${k}" aria-pressed="${cur===k}"><i class="dot d-${k}"></i>${k} <em class="num">${c[k]||0}</em></button>`).join('');
}
function infoRow(r){
  return `<article class="row v-${V(r)}" data-id="${r.id}">
    <button class="row-hd" type="button" aria-expanded="false">
      <span class="row-main"><span class="row-t">${esc(r.t)}</span>
        ${r.v?`<span class="row-v">${esc(r.v)}</span>`:''}
        <span class="row-m"><span>@${esc(r.a)}</span>${r.c?`<span>${esc(r.c)}</span>`:''}${r.d?`<span>${esc(r.d)}</span>`:''}</span></span>
      <span class="row-side">${badge(r)}<i class="chev"></i></span>
    </button><div class="row-bd" hidden></div></article>`;
}
function paintInfoControls(){
  const base=INFO.filter(r=>iMatch(r,'r'));
  $('#in-r').innerHTML=chipsHTML(base.length,counts(base),IS.r);
  const cc={},mc={};
  INFO.filter(r=>iMatch(r,'c')).forEach(r=>cc[r.c]=(cc[r.c]||0)+1);
  INFO.filter(r=>iMatch(r,'m')).forEach(r=>mc[r.m]=(mc[r.m]||0)+1);
  fillSelect($('#in-c'),'모든 분야',CATS.filter(c=>cc[c]).map(c=>({v:c,t:c,n:cc[c]})),IS.c);
  fillSelect($('#in-m'),'모든 달',MONS.filter(m=>mc[m]).map(m=>({v:m,t:m==='날짜 미상'?m:m+' 게시',n:mc[m]})),IS.m);
}
function paintInfo(reset){
  if(reset) IS.n=60;
  paintInfoControls();
  const rows=INFO.filter(r=>iMatch(r));
  const on=IS.q||IS.r||IS.c||IS.m;
  $('#in-hits').innerHTML=on?`<b class="num">${rows.length}</b>건 / 전체 ${INFO.length}건`:`전체 <b class="num">${INFO.length}</b>건 · 최근 올라온 순`;
  $('#in-reset').hidden=!on;
  const shown=rows.slice(0,IS.n);
  $('#in-list').innerHTML=shown.length?shown.map(infoRow).join('')
    :'<div class="void"><h4>맞는 항목이 없어요</h4><p>검색어를 줄이거나 분야·달 조건을 풀어보세요.</p></div>';
  $('#in-more').innerHTML=rows.length>IS.n?`<button class="btn" type="button" style="width:100%;margin-top:16px">${rows.length-IS.n}건 더 보기</button>`:'';
  $('#n-info').textContent=INFO.length;
}
wireRows($('#in-list'),id=>IBY[id],infoBody);
$('#in-more').addEventListener('click',()=>{ IS.n+=80; paintInfo(false); });
$('#in-r').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b) return; IS.r=b.dataset.v; paintInfo(true); });
$('#in-c').addEventListener('change',e=>{ IS.c=e.target.value; paintInfo(true); });
$('#in-m').addEventListener('change',e=>{ IS.m=e.target.value; paintInfo(true); });
let qt; $('#q').addEventListener('input',e=>{ clearTimeout(qt); qt=setTimeout(()=>{ IS.q=e.target.value.trim(); paintInfo(true); },140); });
$('#in-reset').addEventListener('click',()=>{ Object.assign(IS,{q:'',r:'',c:'',m:''}); $('#q').value=''; paintInfo(true); });

/* ── 장소 ── */
const SS={r:'',kd:'',live:false,inview:true};
const SBY=Object.fromEntries(SPOT.map(r=>[r.id,r]));
function sMatch(r,skip){
  if(skip!=='r'&&SS.r&&V(r)!==SS.r) return false;
  if(skip!=='kd'&&SS.kd&&r.kd!==SS.kd) return false;
  if(SS.live&&r.en) return false;
  return true;
}
function spotName(r){ return r.t.replace(/\s*[(（][^)）]*[)）]\s*$/,'').replace(/\s+—\s+.*$/,'').trim()||r.t; }
function spotRow(r){
  const vis=window.GMAP?GMAP.visibleCount(r):r.locs.length;
  const ev=r.ev2;
  const meta=[`<span class="kd">${esc(r.kd)}</span>`,
    r.chain?`<span>${r.unit} ${r.locs.length}곳${SS.inview&&vis<r.locs.length?` · 지도 안 ${vis}곳`:''}</span>`:(r.ar?`<span>${esc(r.ar)}</span>`:''),
    ev?`<span>${esc(ev.start.slice(5).replace('-','/'))}~${esc(ev.end.slice(5).replace('-','/'))}</span>`:'',
    r.en?'<span>종료</span>':''].join('');
  return `<article class="row v-${V(r)}${r.en?' ended':''}" data-id="${r.id}">
    <button class="row-hd" type="button" aria-expanded="false">
      <span class="row-main"><span class="row-t">${esc(spotName(r))}</span>
        ${r.v?`<span class="row-v">${esc(r.v)}</span>`:''}
        <span class="row-m">${meta}</span></span>
      <span class="row-side">${badge(r)}<i class="chev"></i></span>
    </button><div class="row-bd" hidden></div></article>`;
}
function spotBody(r){
  const f=[];
  if(r.loc) f.push(['위치',r.loc]);
  if(r.ev2) f.push(['기간',`${r.ev2.start} ~ ${r.ev2.end} · ${r.ev2.days||''} ${r.ev2.time||''}`.trim()]);
  if(r.pr) f.push(['가격',r.pr]);
  if(r.rs) f.push(['조사',r.rs]);
  let stores='';
  if(r.chain){
    const inv=window.GMAP?GMAP.inViewFlags(r):r.locs.map(()=>true);
    const order=r.locs.map((l,i)=>({l,i,v:inv[i]})).sort((a,b)=>(b.v-a.v)||a.l.n.localeCompare(b.l.n,'ko'));
    stores=`<div class="sec"><h4>${r.unit} ${r.locs.length}곳${inv.some(x=>!x)?` · 지도에 보이는 ${inv.filter(Boolean).length}곳이 위`:''}</h4>
      <ul class="stores">${order.map(({l,i,v})=>`<li data-store="${i}" class="${v?'inview':''}"><b>${esc(l.n)}</b><span>${esc(l.ad)}${l.ap?' · 위치 근사':''}</span></li>`).join('')}</ul></div>`;
  }
  const src=(r.src||[]).map(s=>`<a class="out" href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])} ${OUT_SVG}</a>`).join(' ');
  return decideHTML(r)
    +(f.length?`<dl class="facts">${f.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:'')
    +(r.nt?`<div class="sec"><h4>왜 이렇게 봤나</h4><p>${esc(r.nt)}</p></div>`:'')
    +(r.cm?`<div class="sec"><h4>댓글에서</h4><p class="soft">${esc(r.cm)}</p></div>`:'')
    +stores
    +proofBlock(r)
    +(src?`<div class="foot" style="gap:12px">${src}</div>`:'')
    +footHTML(r)
    +(r.locs.length?`<div class="foot"><button class="btn" type="button" data-fly="${r.id}">지도에서 보기</button></div>`:'');
}
function paintSpotControls(){
  const base=SPOT.filter(r=>sMatch(r,'r'));
  $('#sp-r').innerHTML=chipsHTML(base.length,counts(base),SS.r);
  const kc={}; SPOT.filter(r=>sMatch(r,'kd')).forEach(r=>kc[r.kd]=(kc[r.kd]||0)+1);
  fillSelect($('#sp-kd'),'모든 종류',KINDS.filter(k=>kc[k]).map(k=>({v:k,t:k,n:kc[k]})),SS.kd);
}
function paintSpot(){
  paintSpotControls();
  const rows=SPOT.filter(r=>sMatch(r));
  if(window.GMAP) GMAP.setItems(rows);
  paintSpotList();
  $('#n-spot').textContent=SPOT.length;
}
function paintSpotList(){
  const rows=SPOT.filter(r=>sMatch(r));
  const withLoc=rows.filter(r=>r.locs.length), noLoc=rows.filter(r=>!r.locs.length);
  const shown=SS.inview&&window.GMAP?withLoc.filter(r=>GMAP.visibleCount(r)>0):withLoc;
  const openIds=new Set($$('#sp-list .row[data-open]').map(x=>x.dataset.id));
  $('#sp-hits').innerHTML=SS.inview?`지도 안 <b class="num">${shown.length}</b>곳 · 조건에 맞는 ${rows.length}곳`
    :`<b class="num">${rows.length}</b>곳${rows.length<SPOT.length?` / 전체 ${SPOT.length}곳`:''}`;
  let h=shown.map(spotRow).join('');
  if(!shown.length) h=`<div class="void"><h4>${rows.length?'지도에 보이는 곳이 없어요':'맞는 장소가 없어요'}</h4><p>${rows.length?'지도를 움직이거나 축소해보세요. 아래 지역 버튼으로 바로 갈 수도 있어요.':'판정이나 종류 조건을 풀어보세요.'}</p></div>`;
  if(noLoc.length) h+=`<p class="noloc-h">위치를 특정하지 못한 곳 ${noLoc.length}</p>`+noLoc.map(spotRow).join('');
  $('#sp-list').innerHTML=h;
  openIds.forEach(id=>{ const row=$('#sp-list .row[data-id="'+id+'"]'); if(row) row.querySelector('.row-hd').click(); });
  const sel=window.GMAP&&GMAP.selected(); if(sel){ const row=$('#sp-list .row[data-id="'+sel+'"]'); if(row) row.classList.add('hl'); }
}
wireRows($('#sp-list'),id=>SBY[id],spotBody);
$('#sp-list').addEventListener('click',e=>{
  const fly=e.target.closest('[data-fly]'); if(fly){ GMAP.select(fly.dataset.fly,null,true); $('#map').scrollIntoView({block:'nearest',behavior:'smooth'}); return; }
  const st=e.target.closest('[data-store]'); if(st){ const id=st.closest('.row').dataset.id; GMAP.select(id,+st.dataset.store,true); $('#map').scrollIntoView({block:'nearest',behavior:'smooth'}); }
},true);
$('#sp-r').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b) return; SS.r=b.dataset.v; paintSpot(); });
$('#sp-kd').addEventListener('change',e=>{ SS.kd=e.target.value; paintSpot(); });
$('#sp-live').addEventListener('change',e=>{ SS.live=e.target.checked; paintSpot(); });
$('#sp-inview').addEventListener('change',e=>{ SS.inview=e.target.checked; paintSpotList(); });

/* ── 메모 ── */
const LINKY=/(https?:\/\/[^\s]+)/g;
function linky(s){ return esc(s).replace(LINKY,m=>`<a href="${m}" target="_blank" rel="noopener">${m.replace(/^https?:\/\/(www\.)?/,'').slice(0,60)}</a>`); }
function fmtAt(at){ if(!at) return ''; const [d,t]=at.split('T'); const [y,m,dd]=d.split('-'); return `${+m}월 ${+dd}일 ${t||''}`.trim(); }
function paintMemo(){
  const rows=keep(STICKY);
  $('#n-memo').textContent=rows.length;
  $('#mm-hits').innerHTML=rows.length?`<b class="num">${rows.length}</b>건 · 최근 보낸 순`:'';
  $('#mm-list').innerHTML=rows.length?rows.map(s=>`<div class="memo" data-id="${s.id}">
      <p class="memo-t">${linky(s.txt)}</p>
      <div class="memo-f"><span class="memo-d">${esc(fmtAt(s.at))}</span><button class="del" type="button">떼기</button></div></div>`).join('')
    :'<div class="void" style="grid-column:1/-1"><h4>메모가 없어요</h4><p>DM으로 글을 보내면 여기 붙습니다.</p></div>';
}
$('#mm-list').addEventListener('click',e=>{ const b=e.target.closest('.del'); if(!b) return; arm(b,'뗄까요?',()=>hide([b.closest('.memo').dataset.id])); });

/* ── 일정 ── */
const ABY=Object.fromEntries(ALARM.map(r=>[r.id,r]));
const dleft=d=>d?Math.ceil((new Date(d+'T23:59:59+09:00')-new Date())/864e5):null;
function isPast(a){ if(a.al.st==='closed') return true; const d=dleft(a.al.due); return d!==null&&d<0; }
function alarmBody(a){
  const al=a.al, f=[];
  if(al.due) f.push(['마감',`${al.due} ${al.time||''}`.trim()]);
  const same=(x,y)=>x&&y&&(x===y||x.slice(0,40)===y.slice(0,40));
  if(al.how&&al.how!=='-'&&!same(al.how,a.nt)&&!same(al.how,a.ds)) f.push(['방법',al.how]);
  if(al.cond&&!same(al.cond,a.ds)&&!same(al.cond,a.nt)) f.push(['내용',al.cond]);
  if(al.src&&!same(al.src,a.vb)) f.push(['근거',al.src]);
  const links=(al.link?`<a class="out" href="${esc(al.link)}" target="_blank" rel="noopener">공식 페이지 ${OUT_SVG}</a>`:'');
  return decideHTML(a)+(f.length?`<dl class="facts">${f.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:'')
    +(a.ds?`<div class="sec"><h4>요약</h4><p>${esc(a.ds)}</p></div>`:'')
    +(a.nt?`<div class="sec"><h4>왜 이렇게 봤나</h4><p>${esc(a.nt)}</p></div>`:'')
    +proofBlock(a)+(links?`<div class="foot">${links}</div>`:'')+footHTML(a);
}
function paintAlarm(){
  const rows=keep(ALARM);
  $('#n-alarm').textContent=rows.length;
  const past=rows.filter(isPast).length;
  $('#al-hits').innerHTML=rows.length?`<b class="num">${rows.length}</b>건${past?` · 지난 것 ${past}건`:''}`:'';
  $('#al-bulk').hidden=!past;
  $('#al-list').innerHTML=rows.length?rows.map(a=>{
    const al=a.al,d=dleft(al.due); let cls='',n='',s='';
    if(al.st==='closed'||(d!==null&&d<0)){ cls='past'; n='마감'; s=al.due?al.due.slice(5).replace('-','/'):''; }
    else if(al.st==='rolling'){ cls='tbd'; n='수시'; }
    else if(al.st==='unknown'||d===null){ cls='tbd'; n='미정'; }
    else { n=d===0?'오늘':'D-'+d; s=al.due.slice(5).replace('-','/'); if(d<=7) cls='soon'; }
    return `<article class="row due ${cls} v-${V(a)}" data-id="${a.id}">
      <div class="dday">${n}${s?`<small>${s}</small>`:''}</div>
      <button class="row-hd opener" type="button" aria-expanded="false" style="margin:0;width:auto;padding:0">
        <span class="row-t">${esc(a.t)}</span>${a.v?`<span class="row-v">${esc(a.v)}</span>`:''}
        <span class="row-m"><span>@${esc(a.a)}</span>${a.c?`<span>${esc(a.c)}</span>`:''}</span></button>
      <div class="row-side">${badge(a)}<button class="del" type="button">삭제</button></div>
      <div class="row-bd" hidden></div></article>`; }).join('')
    :'<div class="void"><h4>일정이 없어요</h4><p>마감이 있는 모집·지원금·행사를 보내면 남은 날짜와 신청 방법이 여기 실립니다.</p></div>';
}
wireRows($('#al-list'),id=>ABY[id],alarmBody);
$('#al-list').addEventListener('click',e=>{ const b=e.target.closest('.del'); if(!b) return; e.stopPropagation(); arm(b,'지울까요?',()=>hide([b.closest('.row').dataset.id])); },true);
$('#al-bulk').addEventListener('click',e=>arm(e.currentTarget,'정말 모두 지울까요?',()=>hide(keep(ALARM).filter(isPast).map(a=>a.id))));


/* 시작 */
paintTally(); paintInfo(true); paintMemo(); paintAlarm();
{ const h=(location.hash||'').slice(1); if(['spot','info','memo','alarm','admin'].includes(h)&&document.getElementById('p-'+h)) goTab(h); else goTab('spot'); }
