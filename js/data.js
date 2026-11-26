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
    const datePattern = /^(?:(?:19|20)\d{2}(?:\s*[-/]\s*(?:(?:19|20)\d{2}|0?[1-9]|1[0-2])(?:\s*[-/]\s*(?:0?[1-9]|[12]\d|3[01]))?)?|(?:19|20)\d{2}\s*[-/]\s*(?:19|20)\d{2})(?:\s*\([^)]*\))?$/;
    const dateIndex = parts.findIndex(part => datePattern.test(part));
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
    const nodes = [...doc.querySelectorAll("h1,h2,h3,p,li")];
    const lines = nodes.map(el => {
      const text = clean(el.innerText || el.textContent);
      const tag = el.tagName.toLowerCase();
      return {text, tag, showHeading:tag === "h2"};
    }).filter(item => item.text);

    const sourceLines = lines.length ? lines : clean(doc.body?.innerText || "")
      .split(/\n+/).map(text => ({text:clean(text),tag:"p",showHeading:false})).filter(item => item.text);
    const hasShowHeadings = sourceLines.some(item => item.showHeading);

    const records = [];
    let kind = "audio";
    let currentShow = "";
    let inWants = false;

    const isSection = value => /^(audio|videos?|concerts(?:\s*\(miscellaneous\))?)$/i.test(clean(value));
    const isAudioCount = value => /^\d+\s+audios?$/i.test(clean(value));
    const isFileLine = value => /^\([^)]*,[^)]*\)$/.test(clean(value)) &&
      /\b(mp3|m4a|wav|aif|aiff|flac|vob|mp4|mov|mpeg|ts|avi|mkv|wmv|m4v)\b/i.test(value);

    const isPlainTitleBeforeEntry = index => {
      const item = sourceLines[index];
      if (!item || hasShowHeadings || item.showHeading || /^h[13]$/.test(item.tag) || isSection(item.text) || isAudioCount(item.text) || parseMetadata(item.text)) return false;
      for (let j=index+1;j<sourceLines.length;j++) {
        if (isAudioCount(sourceLines[j].text)) return false;
        if (!sourceLines[j].text) continue;
        return !!parseMetadata(sourceLines[j].text);
      }
      return false;
    };

    for (let i=0;i<sourceLines.length;i++) {
      const item = sourceLines[i];
      const line = item.text;

      if (/^wants$/i.test(line)) {
        inWants = true;
        currentShow = "";
        continue;
      }

      if (item.showHeading) {
        if (/^videos?$/i.test(line)) {
          kind = "video";
          currentShow = "";
        } else if (/^audios?$/i.test(line) || /^concerts(?:\s*\(miscellaneous\))?$/i.test(line)) {
          kind = "audio";
          currentShow = "";
        } else {
          currentShow = line;
          inWants = false;
        }
        continue;
      }

      if (isSection(line)) {
        kind = /^videos?$/i.test(line) ? "video" : "audio";
        currentShow = "";
        inWants = false;
        continue;
      }
      if (inWants) continue;
      if (isAudioCount(line)) continue;

      if (isPlainTitleBeforeEntry(i)) {
        currentShow = line;
        continue;
      }

      const meta = parseMetadata(line);
      if (!meta) continue;

      const record = Object.assign(
        {_id:"paragraph-"+i,kind,show:currentShow},
        meta,
        {cast:"",notes:"",mynotes:"",gift:"",nft:""}
      );

      let next = i + 1;
      if (next < sourceLines.length && isFileLine(sourceLines[next].text)) {
        const split = sourceLines[next].text.replace(/^\(|\)$/g,"").split(",").map(clean);
        if (!record.type) record.type = split[0] || "";
        if (!record.size) record.size = split.slice(1).join(", ");
        next++;
      }

      const castLines = [], noteLines = [], myNoteLines = [];
      let textSection = "cast";

      for (;next<sourceLines.length;next++) {
        const value = sourceLines[next].text;

        if (sourceLines[next].showHeading || isSection(value) || isAudioCount(value) || parseMetadata(value)) break;
        if (isPlainTitleBeforeEntry(next)) break;

        if (/^never gift\.?$/i.test(value)) { record.gift = "Never Gift"; continue; }
        if (/^only gift\.?$/i.test(value)) { record.gift = "Only Gift"; continue; }

        const nftLine = value.replace(/^[●•▪︎◦*-]+\s*/, "").trim();
        if (/^nft(?:\s+(?:except\s+through\s+master|until\b.*))?$/i.test(nftLine)) {
          record.nft = nftLine;
          continue;
        }
        if (/^(my notes|my note):/i.test(value)) {
          textSection = "mynotes";
          myNoteLines.push(value.replace(/^(my notes|my note):\s*/i,""));
          continue;
        }
        if (/^(notes?|master notes):/i.test(value)) {
          textSection = "notes";
          noteLines.push(value.replace(/^(notes?|master notes):\s*/i,""));
          continue;
        }
        if (/^(limited trade|never to be sold|please do not)/i.test(value)) {
          record.gift = record.gift ? record.gift + "; " + value : value;
          continue;
        }

        if (textSection === "mynotes") myNoteLines.push(value);
        else if (textSection === "notes") noteLines.push(value);
        else castLines.push(value);
      }

      record.cast = castLines.join("\n");
      record.notes = noteLines.join("\n");
      record.mynotes = myNoteLines.join("\n");
      if (record.show && (record.production || record.date || record.master)) records.push(record);
      i = next - 1;
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