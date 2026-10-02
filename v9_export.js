/* ── 옵시디언 볼트 내보내기 ─────────────────────────────
   지금 화면 상태(직접 옮긴 판정·지운 항목 반영)를 그대로 .md 묶음으로 만든다. */
(function(){
  const btn=$('#exp'), msg=$('#expmsg');
  const TAB={spot:'1_Spot',info:'2_Information',memo:'3_Sticky',alarm:'4_Alarm'};
  const yq=v=>'"'+String(v==null?'':v).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,' ')+'"';
  const safe=s=>String(s||'').replace(/[\\/:*?"<>|#^\[\]]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'untitled';
  const tagify=s=>String(s||'').replace(/[^\w가-힣]/g,'');

  function noteMD(r,tp){
    const tab=TAB[tp], v=V(r), L=['---'];
    L.push('탭: '+yq(tab.slice(2)),'제목: '+yq(r.t),'계정: '+yq(r.a),'업로드: '+(r.di||'""'),
      '대분류: '+yq(r.c),'소분류: '+yq(r.sub),'위험도: '+yq(v));
    if(OVR[r.id]) L.push('1차판정: '+yq(r.r),'직접분류: true');
    L.push('신뢰도: '+(r.cr||0),'활용도: '+(r.us||0),'검증: '+yq(r.vb),
      '플래그: ['+(r.f||[]).map(yq).join(', ')+']','링크: '+yq(r.l));
    if(tp==='alarm'&&r.al){ if(r.al.due) L.push('마감: '+r.al.due); L.push('마감상태: '+yq(r.al.st)); }
    if(tp==='spot'){ L.push('종류: '+yq(r.kd)); if(r.locs[0]&&!r.chain) L.push('좌표: ['+r.locs[0].lat+', '+r.locs[0].lon+']'); if(r.en) L.push('종료: true'); }
    L.push('tags: ['+['거름망',tab.slice(2),tagify(r.c),tagify(r.sub),'판정/'+v].filter(Boolean).join(', ')+']','---','');
    L.push('# '+r.t,'');
    if(r.v) L.push('**'+r.v+'**','');
    if(r.ds) L.push(r.ds,'');
    if(tp==='alarm'&&r.al&&(r.al.due||r.al.how)){
      L.push('> [!warning] 마감','> '+(r.al.due||'미정')+' '+(r.al.time||'')+' ('+r.al.st+')');
      if(r.al.how) L.push('> 방법: '+r.al.how); if(r.al.cond) L.push('> 내용: '+r.al.cond); if(r.al.link) L.push('> 공식: '+r.al.link);
      L.push('');
    }
    if(tp==='spot'){
      L.push('> [!tip] 장소');
      if(r.loc) L.push('> - 위치: '+r.loc); if(r.ev2) L.push('> - 기간: '+r.ev2.start+' ~ '+r.ev2.end+' '+(r.ev2.days||'')+' '+(r.ev2.time||''));
      if(r.pr) L.push('> - 가격: '+r.pr); if(r.rs) L.push('> - 조사: '+r.rs); if(r.cm) L.push('> - 댓글: '+r.cm);
      (r.src||[]).forEach(s=>L.push('> - 출처: ['+s[0]+']('+s[1]+')'));
      if(r.chain){ L.push('>','> 매장 '+r.locs.length+'곳'); r.locs.forEach(l=>L.push('> - '+l.n+' — '+l.ad)); }
      L.push('');
    }
    L.push('> [!info] 판정','> **'+v+'**'+(OVR[r.id]?' (1차 '+r.r+' → 직접 분류)':'')+' · 신뢰 '+(r.cr||0)+'/5 · 활용 '+(r.us||0)+'/5'+((r.f||[]).length?' · '+r.f.join(' · '):''),'');
    if(r.nt){ L.push('> [!note] 왜 이렇게 봤나'); r.nt.split('\n').forEach(x=>L.push('> '+x)); L.push(''); }
    if(r.ev){ L.push('> [!quote]- 확인한 것'); r.ev.split('\n').forEach(x=>L.push('> '+x)); L.push(''); }
    if(r.l) L.push('[원본 보기]('+r.l+')');
    const dir=tab+'/'+(tp==='info'?safe(r.c||'기타')+'/':'');
    return {path:dir+safe(r.t)+'-'+String(r.a||'x').replace(/[^\w.]/g,'')+'.md',md:L.join('\n')+'\n'};
  }
  function memoMD(s){
    const when=(s.at||'').replace('T',' ');
    return {path:'3_Sticky/'+when.replace(/[: ]/g,'-').slice(0,16)+'-'+safe(s.txt.slice(0,20))+'.md',
      md:['---','탭: "Sticky"','보낸시각: '+yq(when),'tags: [거름망, Sticky]','---','',s.txt,''].join('\n')};
  }
  function homeMD(n){
    const q=(title,body)=>['## '+title,'','```dataview',...body,'```',''];
    return ['# 거름망 정리함','','인스타 DM으로 받은 콘텐츠를 검증해서 네 갈래로 나눠 둔 곳. 현재 '+n+'건. '+ASOF+' 기준.','',
      '> [!tip] 표가 코드로만 보이면 Dataview 플러그인을 켤 것.','',
      ...q('위험',['TABLE WITHOUT ID file.link AS "항목", 업로드 AS "올라온 날", 계정 AS "계정"','FROM #거름망','WHERE 위험도 = "위험"','SORT 업로드 DESC']),
      ...q('직접 분류한 것',['TABLE WITHOUT ID file.link AS "항목", 1차판정 AS "1차", 위험도 AS "지금"','FROM #거름망','WHERE 직접분류']),
      ...q('마감 있는 것',['TABLE WITHOUT ID file.link AS "항목", 마감 AS "마감", 마감상태 AS "상태"','FROM #Alarm','SORT 마감 ASC']),
      ...q('장소',['TABLE WITHOUT ID file.link AS "장소", 종류 AS "종류", 위험도 AS "판정"','FROM #Spot']),
      ...q('최근 올라온 것',['TABLE WITHOUT ID file.link AS "항목", 업로드 AS "올라온 날", 대분류 AS "분야", 위험도 AS "판정"','FROM #거름망','WHERE 업로드','SORT 업로드 DESC','LIMIT 40']),
      ...q('분야별',['TABLE WITHOUT ID 대분류 AS "분야", length(rows) AS "건수"','FROM #거름망','GROUP BY 대분류','SORT length(rows) DESC']),
    ].join('\n');
  }
  btn.addEventListener('click',async()=>{
    btn.disabled=true; msg.textContent='만드는 중…';
    try{
      if(typeof JSZip==='undefined') throw new Error('압축 도구를 불러오지 못했어요');
      const zip=new JSZip(), seen={};
      const put=n=>{ let p=n.path,i=2; while(seen[p]) p=n.path.replace(/\.md$/,'-'+(i++)+'.md'); seen[p]=1; zip.file(p,n.md); };
      SPOT.forEach(r=>put(noteMD(r,'spot'))); INFO.forEach(r=>put(noteMD(r,'info')));
      keep(ALARM).forEach(r=>put(noteMD(r,'alarm'))); keep(STICKY).forEach(s=>put(memoMD(s)));
      const n=Object.keys(seen).length; zip.file('HOME.md',homeMD(n));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      const fn='거름망_볼트_'+new Date().toISOString().slice(0,10)+'.zip';
      let dl=null; try{ if(typeof claude!=='undefined'&&claude&&claude.use) dl=await claude.use('downloads'); }catch(_){}
      if(dl){ await dl.save({filename:fn,data:blob}); msg.textContent=n+'개 노트 · 저장 창을 확인하세요'; }
      else{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fn; document.body.appendChild(a); a.click();
        setTimeout(()=>{a.remove();URL.revokeObjectURL(a.href)},2000); msg.textContent=n+'개 노트 · 내려받기 시작'; }
    }catch(e){ msg.textContent='실패 — '+(e&&e.message||e); }
    btn.disabled=false;
  });
})();
