/* ── 장소 지도 ─────────────────────────────────────────
   좌표: x=경도×1000, y=-메르카토르위도×1000. 화면 = 좌표×k + t.
   바탕(육지·경계)은 한 번 그리고 변환만 바꾼다. 핀·묶음·지명은 매번 화면 좌표로 다시 그린다.
   핀이 많아지면 화면 거리 기준으로 묶어서 숫자로 보여주고, 누르면 그 묶음으로 확대한다. */
window.GMAP=(function(){
  const el=$('#map'), world=$('#mworld'), over=$('#mover'), card=$('#mcard');
  const COL={'위험':'var(--risk)','주의':'var(--warn)','안전':'var(--safe)'};
  const KMIN=.018, KMAX=16;
  let W=0,H=0,k=.05,tx=0,ty=0, ITEMS=[], SEL=null, first=true, raf=0, viewT=0;

  world.innerHTML=MAPD.land.map(l=>`<path class="m-land${l.n==='Japan'?' jp':''}" d="${l.d}" vector-effect="non-scaling-stroke"/>`).join('')
    +`<path class="m-land kr" d="${MAPD.kr}" style="stroke:none"/>`
    +`<path class="m-muni" d="${MAPD.muni}" vector-effect="non-scaling-stroke"/>`
    +`<path class="m-prov" d="${MAPD.prov}" vector-effect="non-scaling-stroke"/>`
    +`<path class="m-land" d="${MAPD.coast}" style="fill:none" vector-effect="non-scaling-stroke"/>`;

  const lat=y=>{ const m=-y/1000*Math.PI/180; return (2*Math.atan(Math.exp(m))-Math.PI/2)*180/Math.PI; };
  const S=l=>[l.x*k+tx,l.y*k+ty];
  function clampView(){ k=Math.max(KMIN,Math.min(KMAX,k)); }
  function apply(){
    world.setAttribute('transform',`matrix(${k} 0 0 ${k} ${tx} ${ty})`);
    el.dataset.z=k<.11?'0':k<.7?'1':'2';
    scale();
    if(!raf) raf=requestAnimationFrame(()=>{ raf=0; draw(); });
    clearTimeout(viewT); viewT=setTimeout(()=>{ if(window.paintSpotList) paintSpotList(); regions(); },140);
  }
  function scale(){
    const cy=(H/2-ty)/k, kmpx=.11132*Math.cos(lat(cy)*Math.PI/180)/k;
    const nice=[.2,.5,1,2,5,10,20,50,100,200,500,1000];
    let v=nice[0]; for(const n of nice){ if(n/kmpx<=96) v=n; }
    const px=Math.round(v/kmpx);
    $('#mscale').innerHTML=`<span>${v<1?v*1000+'m':v+'km'}</span><i style="width:${px}px"></i>`;
  }
  function bounds(locs){
    let x0=1e12,y0=1e12,x1=-1e12,y1=-1e12;
    locs.forEach(l=>{ x0=Math.min(x0,l.x); y0=Math.min(y0,l.y); x1=Math.max(x1,l.x); y1=Math.max(y1,l.y); });
    return {x0,y0,x1,y1};
  }
  function target(b,pad){
    pad=pad==null?56:pad;
    const bw=Math.max(b.x1-b.x0,1), bh=Math.max(b.y1-b.y0,1);
    let kk=Math.min((W-pad*2)/bw,(H-pad*2)/bh);
    if(b.x1-b.x0<40&&b.y1-b.y0<40) kk=Math.min(kk,4);      // 한 점이면 동네 수준까지만
    kk=Math.max(KMIN,Math.min(KMAX,kk));
    return {k:kk,tx:W/2-kk*(b.x0+b.x1)/2,ty:H/2-kk*(b.y0+b.y1)/2};
  }
  let anim=0;
  function fly(t,dur){
    cancelAnimationFrame(anim);
    if(!dur||!W){ k=t.k; tx=t.tx; ty=t.ty; apply(); return; }
    const k0=k, c0=[(W/2-tx)/k,(H/2-ty)/k], c1=[(W/2-t.tx)/t.k,(H/2-t.ty)/t.k], t0=performance.now();
    const step=now=>{
      const p=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-p,3);
      k=Math.exp(Math.log(k0)+(Math.log(t.k)-Math.log(k0))*e);
      const cx=c0[0]+(c1[0]-c0[0])*e, cy=c0[1]+(c1[1]-c0[1])*e;
      tx=W/2-cx*k; ty=H/2-cy*k; apply();
      if(p<1) anim=requestAnimationFrame(step);
    };
    anim=requestAnimationFrame(step);
  }
  function zoomAt(x,y,f){
    const nk=Math.max(KMIN,Math.min(KMAX,k*f)); f=nk/k;
    tx=x-(x-tx)*f; ty=y-(y-ty)*f; k=nk; apply();
  }
  const allLocs=()=>ITEMS.flatMap(r=>r.locs);
  function fitAll(dur){ const L=allLocs(); if(L.length) fly(target(bounds(L)),dur); }

  /* ── 그리기 ── */
  const inV=(x,y,m)=>x>-m&&y>-m&&x<W+m&&y<H+m;
  const tw=t=>[...t].reduce((a,c)=>a+(c.charCodeAt(0)>0x2000?12.4:7),0);
  function hit(rects,r){ return rects.some(q=>r[0]<q[2]&&r[2]>q[0]&&r[1]<q[3]&&r[3]>q[1]); }
  function draw(){
    if(!W) return;
    const pts=[];
    // 프랜차이즈 매장은 그 항목을 골랐을 때만 전부 편다. 평소엔 대표 매장 하나만.
    ITEMS.forEach(r=>{
      const brand=r.chain&&r.unit==='매장', open=SEL&&SEL.id===r.id;
      r.locs.forEach((l,i)=>{
        if(brand&&!open&&i!==r.fi) return;
        const [x,y]=S(l); if(!inV(x,y,30)) return;
        pts.push({r,i,l,x,y,store:r.chain&&(!brand||open),rep:brand&&!open});
      });
    });
    const selPts=SEL?pts.filter(p=>p.r.id===SEL.id):[];
    const rest=pts.filter(p=>!SEL||p.r.id!==SEL.id);
    const sev={'위험':0,'주의':1,'안전':2};
    rest.sort((a,b)=>(a.store-b.store)||(sev[V(a.r)]-sev[V(b.r)]));
    const groups=[];
    for(const p of rest){
      let g=null;
      for(const q of groups){ if(Math.hypot(q.x-p.x,q.y-p.y)<(q.m.length>1?38:30)){ g=q; break; } }
      if(g){ g.m.push(p); g.x=(g.x*(g.m.length-1)+p.x)/g.m.length; g.y=(g.y*(g.m.length-1)+p.y)/g.m.length; }
      else groups.push({x:p.x,y:p.y,m:[p]});
    }
    const rects=[[0,H-44,150,H],[W-330,H-24,W,H],[W-56,0,W,140]]; let h='';   // 축척·출처·확대버튼 자리
    const pin=(p,isSel)=>{
      const v=V(p.r), rr=isSel?11:(p.store?6.5:8.5);
      const cls='pin'+(p.store?' store':'')+(p.r.en?' ended':'')+(isSel?' sel':'')+(SEL&&!isSel?' faded':'');
      rects.push([p.x-rr,p.y-rr,p.x+rr,p.y+rr]);
      return `<g class="${cls}" data-id="${p.r.id}" data-i="${p.i}">${isSel?`<circle class="ring" cx="${p.x}" cy="${p.y}" r="${rr+6}" stroke="${COL[v]}"/>`:''}`
        +`<circle class="c" cx="${p.x}" cy="${p.y}" r="${rr}" fill="${COL[v]}" stroke="${p.r.en?COL[v]:''}"/></g>`;
    };
    const singles=[];
    groups.forEach((g,gi)=>{
      if(g.m.length===1){ h+=pin(g.m[0],false); singles.push(g.m[0]); return; }
      const n=g.m.length, rr=13+Math.min(9,Math.log2(n)*3.2), rk=g.m.some(p=>V(p.r)==='위험');
      rects.push([g.x-rr,g.y-rr,g.x+rr,g.y+rr]);
      h+=`<g class="clu${SEL?' faded':''}" data-g="${gi}" role="button" aria-label="${n}곳 묶음, 눌러서 확대"><circle cx="${g.x}" cy="${g.y}" r="${rr}"/>`
        +(rk?`<circle class="rk" cx="${g.x+rr*.72}" cy="${g.y-rr*.72}" r="4.5"/>`:'')
        +`<text x="${g.x}" y="${g.y+4.4}">${n}</text></g>`;
    });
    selPts.forEach(p=>{ h+=pin(p,true); });
    GROUPS=groups;
    // 핀 이름 — 겹치지 않는 것만
    let lab='';
    const nameOf=p=>p.rep?spotName(p.r).replace(/\s*[—(].*$/,'')+' '+p.r.locs.length+'곳':p.store?p.l.n:spotName(p.r).replace(/\s*\(.*$/,'').slice(0,22);
    const cand=selPts.concat(singles.filter(p=>!p.store||p.r.unit==='장소'||k>2.5));
    cand.forEach(p=>{
      const t=(SEL&&p.r.id===SEL.id&&p.store&&SEL.i!=null&&p.i!==SEL.i&&selPts.length>6)?null:nameOf(p);
      if(!t) return;
      const w=tw(t), x=p.x+13, y=p.y+4.5, r=[x-2,y-12,x+w+2,y+4];
      if(r[2]>W-4||hit(rects,r)) return;
      rects.push(r); lab+=`<g class="pin${SEL&&p.r.id!==SEL.id?' faded':''}" data-id="${p.r.id}" data-i="${p.i}"><text x="${x}" y="${y}">${esc(t)}</text></g>`;
    });
    // 지명
    let geo='';
    const zmax=k<.11?0:k<.7?1:2;
    MAPD.labels.forEach(L=>{
      if(L.z>zmax) return;
      if(L.z===0&&k>.5) return;
      if(L.z===1&&!L.fx&&k>3.2) return;
      const x=L.x*k+tx, y=L.y*k+ty;
      if(!inV(x,y,-8)) return;
      const w=tw(L.t), r=[x-w/2-3,y-11,x+w/2+3,y+4];
      if(hit(rects,r)) return;
      rects.push(r); geo+=`<text class="ml z${L.z} onland" x="${x}" y="${y}">${esc(L.t)}</text>`;
    });
    over.innerHTML=geo+h+lab;
  }
  let GROUPS=[];

  /* ── 선택 ── */
  function select(id,i,flyTo){
    const r=ITEMS.find(x=>x.id===id)||SPOT.find(x=>x.id===id); if(!r) return;
    SEL={id,i:(i==null?null:i)};
    $$('#sp-list .row.hl').forEach(x=>x.classList.remove('hl'));
    const row=$('#sp-list .row[data-id="'+id+'"]'); if(row) row.classList.add('hl');
    const l=(i!=null&&r.locs[i])||null;
    card.hidden=false;
    card.innerHTML=`<span class="row-main"><span class="row-t">${esc(l&&r.chain?l.n:spotName(r))}</span>
      <span class="row-m">${r.chain&&l?`<span>${esc(spotName(r))}</span>`:''}<span class="kd">${esc(r.kd)}</span><span>${esc(l&&l.ad?l.ad:(r.ar||''))}</span>${r.en?'<span>종료</span>':''}</span></span>
      <span class="acts">${badge(r)}<button class="btn" type="button" data-more>자세히</button><button class="x" type="button" data-x aria-label="닫기">×</button></span>`;
    if(flyTo){
      if(l) fly(target({x0:l.x,y0:l.y,x1:l.x,y1:l.y}),420);
      else if(r.locs.length) fly(target(bounds(r.locs),70),420);
    } else draw();
  }
  function clear(){ SEL=null; card.hidden=true; $$('#sp-list .row.hl').forEach(x=>x.classList.remove('hl')); draw(); }
  card.addEventListener('pointerdown',e=>e.stopPropagation());
  card.addEventListener('click',e=>{
    if(e.target.closest('[data-x]')){ clear(); return; }
    if(e.target.closest('[data-more]')&&SEL){
      const id=SEL.id;
      let row=$('#sp-list .row[data-id="'+id+'"]');
      if(!row){ $('#sp-inview').checked=false; SS.inview=false; paintSpotList(); row=$('#sp-list .row[data-id="'+id+'"]'); }
      if(row){ if(!row.hasAttribute('data-open')) row.querySelector('.row-hd').click(); row.classList.add('hl');
        row.scrollIntoView({block:'start',behavior:'smooth'}); }
    }
  });

  /* ── 조작 ── */
  const P=new Map(); let start=null, moved=0, downT=null;
  const pos=e=>{ const b=el.getBoundingClientRect(); return [e.clientX-b.left,e.clientY-b.top]; };
  el.addEventListener('pointerdown',e=>{
    if(e.target.closest('.mctl,.mcard')) return;
    el.setPointerCapture(e.pointerId); P.set(e.pointerId,pos(e));
    moved=0; downT=e.target.closest('.pin,.clu');
    const a=[...P.values()];
    if(a.length===1) start={m:'pan',x:a[0][0],y:a[0][1],tx,ty};
    else if(a.length===2) start={m:'pinch',d:Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]),cx:(a[0][0]+a[1][0])/2,cy:(a[0][1]+a[1][1])/2,k,tx,ty};
    el.classList.add('drag');
  });
  el.addEventListener('pointermove',e=>{
    if(!P.has(e.pointerId)||!start) return;
    P.set(e.pointerId,pos(e)); const a=[...P.values()];
    if(start.m==='pan'&&a.length===1){
      const dx=a[0][0]-start.x, dy=a[0][1]-start.y; moved=Math.max(moved,Math.hypot(dx,dy));
      tx=start.tx+dx; ty=start.ty+dy; apply();
    } else if(start.m==='pinch'&&a.length===2){
      const d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]), cx=(a[0][0]+a[1][0])/2, cy=(a[0][1]+a[1][1])/2;
      const nk=Math.max(KMIN,Math.min(KMAX,start.k*d/start.d)), f=nk/start.k;
      k=nk; tx=cx-(start.cx-start.tx)*f; ty=cy-(start.cy-start.ty)*f; moved=99; apply();
    }
  });
  const up=e=>{
    if(!P.has(e.pointerId)) return;
    P.delete(e.pointerId);
    if(P.size===1){ const a=[...P.values()][0]; start={m:'pan',x:a[0],y:a[1],tx,ty}; return; }
    if(P.size) return;
    el.classList.remove('drag'); start=null;
    if(moved<6){
      if(downT&&downT.classList.contains('clu')){
        const g=GROUPS[+downT.dataset.g]; if(g){
          const L=g.m.map(p=>p.l), b=bounds(L);
          if(b.x1-b.x0<3&&b.y1-b.y0<3) select(g.m[0].r.id,g.m[0].i,false);
          else fly(target(b,70),380);
        }
      } else if(downT&&downT.classList.contains('pin')){
        const id=downT.dataset.id, i=+downT.dataset.i, r=SBY[id];
        select(id,r&&r.chain?i:null,false);
      } else if(SEL) clear();
    }
    downT=null;
  };
  el.addEventListener('pointerup',up); el.addEventListener('pointercancel',up);
  el.addEventListener('wheel',e=>{ e.preventDefault(); const [x,y]=pos(e); zoomAt(x,y,Math.exp(-e.deltaY*(e.ctrlKey?.01:.0022))); },{passive:false});
  el.addEventListener('dblclick',e=>{ if(e.target.closest('.mctl,.mcard')) return; const [x,y]=pos(e); cancelAnimationFrame(anim);
    const t={k:Math.min(KMAX,k*2)}; t.tx=x-(x-tx)*(t.k/k); t.ty=y-(y-ty)*(t.k/k); fly(t,260); });
  el.addEventListener('keydown',e=>{
    const m={'+':[1.5],'=':[1.5],'-':[1/1.5],'ArrowLeft':[1,60,0],'ArrowRight':[1,-60,0],'ArrowUp':[1,0,60],'ArrowDown':[1,0,-60]}[e.key];
    if(!m) return; e.preventDefault();
    if(m.length===1) zoomAt(W/2,H/2,m[0]); else { tx+=m[1]; ty+=m[2]; apply(); }
  });
  $('#zin').onclick=()=>{ const t={k:Math.min(KMAX,k*1.8)}; t.tx=W/2-(W/2-tx)*(t.k/k); t.ty=H/2-(H/2-ty)*(t.k/k); fly(t,240); };
  $('#zout').onclick=()=>{ const t={k:Math.max(KMIN,k/1.8)}; t.tx=W/2-(W/2-tx)*(t.k/k); t.ty=H/2-(H/2-ty)*(t.k/k); fly(t,240); };
  $('#zfit').onclick=()=>fitAll(420);

  /* ── 지역 바로가기 ── */
  function regions(){
    const c={}, locsBy={};
    ITEMS.forEach(r=>r.locs.forEach(l=>{ (locsBy[l.rg]=locsBy[l.rg]||[]).push(l); }));
    ITEMS.forEach(r=>new Set(r.locs.map(l=>l.rg)).forEach(g=>c[g]=(c[g]||0)+1));
    const order=Object.keys(c).sort((a,b)=>(a==='일본'||a==='해외')-(b==='일본'||b==='해외')||c[b]-c[a]);
    const html=`<button class="chip" type="button" data-rg="">전체</button>`
      +order.map(g=>`<button class="chip" type="button" data-rg="${esc(g)}">${esc(g)} <em class="num">${c[g]}</em></button>`).join('');
    const box=$('#regions'); if(box._h!==html){ box.innerHTML=html; box._h=html; }
    box._locs=locsBy;
  }
  $('#regions').addEventListener('click',e=>{
    const b=e.target.closest('.chip'); if(!b) return;
    const g=b.dataset.rg; if(!g){ fitAll(420); return; }
    const L=($('#regions')._locs||{})[g]; if(L&&L.length) fly(target(bounds(L),64),420);
  });

  function resize(){
    const w=el.clientWidth,h=el.clientHeight; if(!w||!h) return;
    if(W&&H){ tx+= (w-W)/2; ty+=(h-H)/2; }
    W=w; H=h;
    if(first&&ITEMS.length){ first=false; fitAll(0); } else apply();
  }
  try{ new ResizeObserver(resize).observe(el); }catch(_){ addEventListener('resize',resize); }

  function viewRect(){ return [(-tx)/k,(-ty)/k,(W-tx)/k,(H-ty)/k]; }
  function inViewFlags(r){ if(!W) return r.locs.map(()=>true); const [x0,y0,x1,y1]=viewRect(); return r.locs.map(l=>l.x>=x0&&l.x<=x1&&l.y>=y0&&l.y<=y1); }
  return {
    setItems(rows){ ITEMS=rows; if(SEL&&!rows.some(r=>r.id===SEL.id)) { SEL=null; card.hidden=true; }
      if(first&&W){ first=false; fitAll(0); } else { draw(); regions(); } },
    redraw(){ draw(); if(SEL){ const r=SBY[SEL.id]; const b=card.querySelector('.badge'); if(b&&r) b.outerHTML=badge(r); } },
    resize, select, selected:()=>SEL&&SEL.id,
    visibleCount(r){ return inViewFlags(r).filter(Boolean).length; }, inViewFlags,
  };
})();
paintSpot();
