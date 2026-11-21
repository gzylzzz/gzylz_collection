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
    const tables = [...doc.querySelectorAll("table")];
    const records = [];
    tables.forEach((table, tableNo) => {
      const rows = [...table.querySelectorAll("tr")].map(tr => [...tr.querySelectorAll("th,td")].map(td => clean(td.innerText || td.textContent)));
      if (rows.length < 2) return;
      const headerRow = rows.findIndex(row => row.some(cell => /show|production|master|cast|date/i.test(cell)));
      if (headerRow < 0) return;
      const headers = rows[headerRow];
      const indexes = {};
      Object.keys(aliases).forEach(key => indexes[key] = headerIndex(headers, aliases[key]));
      rows.slice(headerRow + 1).forEach((cells, rowNo) => {
        if (!cells.some(Boolean)) return;
        const get = key => indexes[key] >= 0 ? clean(cells[indexes[key]] || "") : "";
        const record = { _id:"doc-" + tableNo + "-" + rowNo, show:get("show"), production:get("production"), date:get("date"), master:get("master"), cast:get("cast"), notes:get("notes"), type:get("type"), tracking:get("tracking"), size:get("size"), gift:get("gift"), nft:get("nft"), mynotes:get("mynotes") };
        const context = table.parentElement?.innerText || "";
        const kindText = (context.slice(0, 500) + " " + table.innerText.slice(0, 100)).toLowerCase();
        record.kind = /video/.test(kindText) && !/audio/.test(kindText) ? "video" : "audio";
        if (record.show || record.production || record.master) records.push(record);
      });
    });
    return records;
  }
  function textFallback(doc) {
    const lines = [...doc.querySelectorAll("p,li")].map(el => clean(el.innerText || el.textContent)).filter(Boolean);
    const records = [];
    let kind = "audio";
    lines.forEach((line, i) => {
      if (/^videos?$/i.test(line)) { kind = "video"; return; }
      if (/^audios?$/i.test(line)) { kind = "audio"; return; }
      if (/^(wants|read me|trading rules|contact|contents)$/i.test(line)) return;
      if (/\|/.test(line) && line.split("|").length >= 3) {
        const parts = line.split("|").map(clean);
        records.push({_id:"line-"+i,kind,show:parts[0],production:parts[1]||"",date:parts[2]||"",master:parts[3]||"",cast:parts[4]||"",notes:parts[5]||"",type:parts[6]||"",tracking:parts[7]||"",size:parts[8]||"",gift:parts[9]||"",nft:parts[10]||"",mynotes:parts[11]||""});
      }
    });
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