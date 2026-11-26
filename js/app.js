(function () {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let records = [], selected = new Map(), searchFilter = "all";
  const fields = [["Production","production"],["Date","date"],["Master","master"],["Cast","cast"],["Notes","notes"],["My Notes","mynotes"]];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const truthy = value => /^(true|yes|y|✓)$/i.test(String(value || "").trim());
  const hasNftRestriction = value => {
    const text = String(value || "").trim();
    return !!text && !/^(false|no|none|n)$/i.test(text);
  };
  const isVideo = r => r.kind === "video";
  const showName = r => r.show || "Untitled recording";
  const searchable = r => Object.values(r).join(" ").toLowerCase();
  function status(message, state="") { const el=$("#source-status"); el.className="source-status "+state; el.innerHTML="<i></i>"+esc(message); }
  function groupByTitle(list) {
    const map = new Map();
    list.forEach(r => { const key=showName(r); if(!map.has(key)) map.set(key,[]); map.get(key).push(r); });
    const sortTitle = title => title.replace(/^the\s+/i, "").trim();
    return [...map.entries()].sort((a,b)=>{
      const byMainTitle = sortTitle(a[0]).localeCompare(sortTitle(b[0]),undefined,{sensitivity:"base"});
      return byMainTitle || a[0].localeCompare(b[0],undefined,{sensitivity:"base"});
    });
  }
  function detailHTML(r) {
    const lines=fields.filter(([,key])=>r[key]).map(([label,key])=>'<div class="detail"><strong>'+label+':</strong> '+esc(r[key]).replace(/\n/g,"<br>")+'</div>').join("");
    const tags=[r.type,r.tracking,r.size,hasNftRestriction(r.nft)?(r.nft === "true" ? "NFT restricted" : r.nft):"",r.gift].filter(Boolean);
    return '<div class="record-details" hidden>'+lines+(tags.length?'<div class="tags">'+tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join("")+'</div>':"")+'</div>';
  }
  function recordHTML(r) {
    const meta=[r.production,r.date,r.master].filter(Boolean).join(" · ");
    const checked=selected.has(r._id)?"checked":"";
    return '<article class="record"><div class="record-row"><input class="record-check" type="checkbox" data-select="'+esc(r._id)+'" '+checked+' '+disabled+'><button class="record-main" data-open-record><span class="record-title">'+esc(showName(r))+'</span><span class="record-sub">'+esc(meta)+'</span></button><button class="record-open" data-open-record aria-label="Show details">⌄</button></div>'+detailHTML(r)+'</article>';
  }
  function listHTML(list) {
    if(!list.length) return '<div class="empty">No recordings found.</div>';
    return groupByTitle(list).map(([title,items],i)=>'<section class="group"><div class="group-head"><button class="group-toggle" data-toggle-group>'+esc(title)+'</button><span class="group-count">'+items.length+'</span><span class="group-chevron">⌄</span></div><div class="group-body" hidden>'+items.map(recordHTML).join("")+'</div></section>').join("");
  }
  function updateCounts() {
    const audio=records.filter(r=>!isVideo(r)), video=records.filter(isVideo);
    $("#audio-total").textContent=audio.length; $("#video-total").textContent=video.length;
    $("#show-total").textContent=new Set(records.map(showName)).size;
    $("#audio-subtitle").textContent=audio.length+" recordings · "+groupByTitle(audio).length+" show titles";
    $("#video-subtitle").textContent=video.length+" recordings · "+groupByTitle(video).length+" show titles";
  }
  function renderAll() {
    const audio=records.filter(r=>!isVideo(r)), video=records.filter(isVideo);
    $("#audio-list").innerHTML=listHTML(audio); $("#video-list").innerHTML=listHTML(video);
    runSearch();
  }
  function runSearch() {
    const query=$("#search-input").value.trim().toLowerCase();
    const source=records.filter(r=>searchFilter==="all"||(searchFilter==="video"?isVideo(r):!isVideo(r)));
    const matches=query?source.filter(r=>searchable(r).toLowerCase().includes(query)):[];
    $("#search-summary").textContent=query?matches.length+" matching recordings":"";
    $("#search-results").innerHTML=query?listHTML(matches):"";
  }
  function showView(name) {
    $$(".view").forEach(v=>v.classList.toggle("active",v.id===name+"-view"));
    $$(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
    if(name==="home") window.scrollTo({top:0,behavior:"smooth"});
  }
  async function refresh() {
    status("Loading the published list…");
    try {
      const result=await window.GZYLZ_DATA.load();
      records=result.records;
      updateCounts(); renderAll();
      status("List loaded", "ok");
      $("#updated-at").textContent="Fetched "+result.loadedAt.toLocaleString();
    } catch(error) {
      status("Could not load the list", "error");
      $("#updated-at").textContent=error.message;
      $("#audio-list").innerHTML=$("#video-list").innerHTML='<div class="empty">'+esc(error.message)+'</div>';
      $("#search-results").innerHTML='<div class="empty">The source could not be read. If this is a CORS restriction, we will connect a small Google Apps Script endpoint next.</div>';
    }
  }
  function selectVisible(kind) {
    const query=(kind==="audio"?$("#audio-search").value:$("#video-search").value).trim().toLowerCase();
    records.filter(r=>(kind==="video")===isVideo(r)&&(!query||searchable(r).toLowerCase().includes(query)))
      .forEach(r=>selected.set(r._id,r));
    updateSelection();
  }
  function updateSelection() {
    $("#selection-count").textContent=selected.size;
    $("#selection-items").innerHTML=selected.size?[...selected.values()].map(r=>'<div class="selected-item"><span><b>['+(isVideo(r)?"Video":"Audio")+']</b> '+esc(showName(r))+' — '+esc([r.production,r.date,r.master].filter(Boolean).join(" · "))+'</span><button data-remove="'+esc(r._id)+'">Remove</button></div>').join(""):'<div class="empty">Nothing selected yet.</div>';
    $$("[data-select]").forEach(input=>input.checked=selected.has(input.dataset.select));
  }
  document.addEventListener("click",event=>{
    const view=event.target.closest("[data-view]"); if(view){showView(view.dataset.view);return;}
    if(event.target.closest("#refresh-button")){refresh();return;}
    if(event.target.closest("#open-selection")){$("#selection-dialog").showModal();updateSelection();return;}
    if(event.target.closest("#close-selection")){$("#selection-dialog").close();return;}
    const remove=event.target.closest("[data-remove]");if(remove){selected.delete(remove.dataset.remove);updateSelection();return;}
    const group=event.target.closest("[data-toggle-group]");if(group){const body=group.closest(".group").querySelector(".group-body");body.hidden=!body.hidden;group.closest(".group").classList.toggle("open",!body.hidden);return;}
    const recordButton=event.target.closest("[data-open-record]");if(recordButton){const details=recordButton.closest(".record").querySelector(".record-details");details.hidden=!details.hidden;return;}
    const expand=event.target.closest("[data-expand]");
    if(expand){
      const roots=expand.dataset.expand==="all"?["#audio-list","#video-list"]:[expand.dataset.expand==="audio"?"#audio-list":"#video-list"];
      const bodies=roots.flatMap(root=>$$(root+" .group-body"));
      const open=bodies.some(b=>b.hidden);
      bodies.forEach(b=>{b.hidden=!open;b.closest(".group").classList.toggle("open",open);});
      expand.textContent=open?(expand.dataset.expand==="all"?"Collapse all":"Collapse all groups"):(expand.dataset.expand==="all"?"Expand all":"Expand all groups");
      return;
    }
    const selectAll=event.target.closest("[data-select-all]");
    if(selectAll){selectVisible(selectAll.dataset.selectAll);return;}
    const chip=event.target.closest("[data-filter]");if(chip){searchFilter=chip.dataset.filter;$$("[data-filter]").forEach(c=>c.classList.toggle("active",c===chip));runSearch();}
  });
  document.addEventListener("change",event=>{
    const input=event.target.closest("[data-select]");if(!input)return;
    const row=records.find(r=>r._id===input.dataset.select);if(input.checked&&row)selected.set(row._id,row);else selected.delete(input.dataset.select);updateSelection();
  });
  $("#search-input").addEventListener("input",runSearch);
  $("#audio-search").addEventListener("input",e=>{$("#audio-list").innerHTML=listHTML(records.filter(r=>!isVideo(r)&&searchable(r).toLowerCase().includes(e.target.value.toLowerCase())));});
  $("#video-search").addEventListener("input",e=>{$("#video-list").innerHTML=listHTML(records.filter(r=>isVideo(r)&&searchable(r).toLowerCase().includes(e.target.value.toLowerCase())));});
  $("#clear-selection").addEventListener("click",()=>{selected.clear();updateSelection();});
  $("#copy-selection").addEventListener("click",async()=>{
    const sections=["audio","video"].map(kind=>{
      const rows=[...selected.values()].filter(r=>(kind==="video")===isVideo(r));
      const lines=rows.map(r=>{
        const parts=[showName(r),r.production,r.date,r.master];
        if(kind==="video") parts.push(r.type,r.size);
        const nft=hasNftRestriction(r.nft)?" [NFT: "+(r.nft==="true"?"restricted":r.nft)+"]":"";
        return parts.filter(Boolean).join(" | ")+nft;
      });
      return lines.length?"["+kind.toUpperCase()+"]\n"+lines.join("\n\n"):"";
    }).filter(Boolean);
    try{await navigator.clipboard.writeText(sections.join("\n\n"));$("#copy-feedback").textContent="Copied!";}catch(e){$("#copy-feedback").textContent="Clipboard access is unavailable in this browser.";}
  });
  refresh();
})();