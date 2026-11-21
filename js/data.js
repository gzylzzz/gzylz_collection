(function () {
  const clean = value => String(value ?? "").replace(/\u00a0/g, " ").trim();
  const normalize = value => clean(value).toLowerCase().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
  const aliases = {
    show:["show","title","tital"], production:["production","venue"], date:["date","date (yyyy-mm-dd)","date (yyyy-mm)"],
    master:["master"], cast:["cast"], notes:["notes"], type:["type","file type"], tracking:["tracked/untracked","tracking"],
    size:["size"], gift:["gift / limited trade","gift","limited trade"], nft:["nft","nft except through master"],
    mynotes:["my notes"], kind:["kind","type of recording","format"]
  };
  function headerIndex(headers, names) { return headers.findIndex(h => names.includes(normalize(h))); }
  function tableRecords(doc) {
    const records = [];
    [...doc.querySelectorAll("table")].forEach((table, tableNo) => {
      const rows = [...table.querySelectorAll("tr")].map(tr => [...tr.querySelectorAll("th,td")].map(td => clean(td.innerText || td.textContent)));
      if (rows.length < 2) return;
      const headerRow = rows.findIndex(row => row.some(cell => /show|production|master|cast|date/i.test(cell)));
      if (headerRow < 0) return;
      const headers = rows[headerRow], indexes = {};
      Object.keys(aliases).forEach(key => indexes[key] = headerIndex(headers, aliases[key]));
      rows.slice(headerRow + 1).forEach((cells, rowNo) => {
        if (!cells.some(Boolean)) return;
        const get = key => indexes[key] >= 0 ? clean(cells[indexes[key]] || "") : "";
        const record = { _id:"table-"+tableNo+"-"+rowNo, kind:"audio", show:get("show"), production:get("production"), date:get("date"), master:get("master"), cast:get("cast"), notes:get("notes"), type:get("type"), tracking:get("tracking"), size:get("size"), gift:get("gift"), nft:get("nft"), mynotes:get("mynotes") };
        if (record.show || record.production || record.master) records.push(record);
      });
    });
    return records;
  }
  function parseMetadata(line) {
    if (!line.includes("|")) return null;
    const parts = line.split("|").map(clean).filter(Boolean);
    const dateIndex = parts.findIndex(part => /^(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])(?:[-/](?:0?[1-9]|[12]\d|3[01]))?(?:\s*\([^)]*\))?$/.test(part));
    if (dateIndex < 0) return null;
    const result = {production:"", date:parts[dateIndex], master:"", tracking:"", type:"", size:""};
    if (dateIndex > 0) result.production = parts.slice(0,dateIndex).join(" | ");
    const tail = parts.slice(dateIndex+1);
    const trackingRe = /^(tracked|untracked|tracked and untracked|tracked\/untracked)$/i;
    const typeRe = /\b(mp3|m4a|wav|aif|aiff|flac|vob|mp4|mov|mpeg|ts|avi|mkv|wmv|m4v|video|audio)\b/i;
    const sizeRe = /\b\d+(?:\.\d+)?\s*(?:kb|mb|gb|tb)\b/i;
    tail.forEach(part => {
      if (trackingRe.test(part)) result.tracking = part;
      else if (typeRe.test(part) && !result.type) result.type = part;
      else if (sizeRe.test(part) && !result.size) result.size = part;
      else if (!result.master) result.master = part;
      else result.master += " | " + part;
    });
    return result;
  }
  function textFallback(doc) {
    let lines = [...doc.querySelectorAll("p,li")].map(el => clean(el.innerText || el.textContent)).filter(Boolean);
    if (!lines.length) lines = clean(doc.body?.innerText || "").split(/\n+/).map(clean).filter(Boolean);
    lines = lines.filter(line => !/^<PARSED TEXT FOR PAGE:/i.test(line));
    const records = [];
    let kind = "audio";
    let currentShow = "";
    for (let i=0;i<lines.length;i++) {
      const line = lines[i];
      if (/^videos?$/i.test(line)) { kind="video"; currentShow=""; continue; }
      if (/^audios?$/i.test(line)) { kind="audio"; currentShow=""; continue; }
      const meta = parseMetadata(line);
      if (!meta) continue;

      // In this document a show heading is normally printed twice:
      // once as the centered heading and once as the entry's title.
      // Search only the text since the previous recording, so cast/notes
      // from the preceding item can never become the next item's title.
      let showCandidate = "";
      for (let j=i-1;j>0;j--) {
        if (parseMetadata(lines[j])) break;
        if (lines[j] === lines[j-1] && lines[j].length > 1) {
          showCandidate = lines[j];
          break;
        }
      }
      if (showCandidate) currentShow = showCandidate;
      const record = Object.assign(
        {_id:"paragraph-"+i,kind,show:currentShow},
        meta,
        {cast:"",notes:"",mynotes:"",gift:"",nft:""}
      );

      let next=i+1;
      if (next<lines.length && /^\([^)]*,[^)]*\)$/.test(lines[next])) {
        const fileLine=lines[next].replace(/^\(|\)$/g,"");
        const split=fileLine.split(",").map(clean);
        if (!record.type) record.type=split[0]||"";
        if (!record.size) record.size=split.slice(1).join(", ");
        next++;
      }
      const castLines=[], noteLines=[], myNoteLines=[];
      let textSection="cast";
      for (;next<lines.length;next++) {
        const value=lines[next];
        if (/^videos?$/i.test(value)||/^audios?$/i.test(value)||parseMetadata(value)) break;
        // The repeated next-show heading marks the end of this recording.
        if (next+1<lines.length && value.length>1 && value===lines[next+1]) break;
        if (/^never gift$/i.test(value)) {record.gift="Never Gift";continue;}
        if (/^only gift$/i.test(value)) {record.gift="Only Gift";continue;}
        if (/^nft(?: until .*)?$/i.test(value)) {record.nft=value;continue;}
        if (/^(my notes|my note):/i.test(value)) {textSection="mynotes";myNoteLines.push(value.replace(/^(my notes|my note):\s*/i,""));continue;}
        if (/^(notes?|master notes):/i.test(value)) {textSection="notes";noteLines.push(value.replace(/^(notes?|master notes):\s*/i,""));continue;}
        if (/^(limited trade|never to be sold|please do not)/i.test(value)) {record.gift=record.gift?record.gift+"; "+value:value;continue;}
        if (textSection==="mynotes") myNoteLines.push(value);
        else if (textSection==="notes") noteLines.push(value);
        else castLines.push(value);
      }
      record.cast=castLines.join("\n");
      record.notes=noteLines.join("\n");
      record.mynotes=myNoteLines.join("\n");
      if (record.show && (record.production || record.date || record.master)) records.push(record);
      i=next-1;
    }
    return records;
  }
  async function load() {
    const response = await fetch(window.GZYLZ_CONFIG.sourceUrl, {cache:"no-store"});
    if (!response.ok) throw new Error("Google Docs returned HTTP " + response.status);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    let records = tableRecords(doc);
    if (!records.length) records = textFallback(doc);
    if (!records.length) throw new Error("The published document loaded, but its layout could not be converted into catalogue entries yet.");
    return {records, title:doc.title || "", loadedAt:new Date()};
  }
  window.GZYLZ_DATA = {load, normalize};
})();