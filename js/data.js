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
    const items = nodes.map(el => {
      const text = clean(el.innerText || el.textContent);
      const tag = el.tagName.toLowerCase();
      const style = (el.getAttribute("style") || "").toLowerCase();
      const bold = !!el.querySelector("b,strong") ||
        /font-weight\s*:\s*(bold|[6-9]00)/i.test(style) ||
        [...el.querySelectorAll("[style]")].some(child =>
          /font-weight\s*:\s*(bold|[6-9]00)/i.test(child.getAttribute("style") || "")
        );
      return {el,text,tag,bold,heading:/^h[1-3]$/.test(tag)};
    }).filter(item => item.text);

    // Some published Google Docs layouts flatten paragraphs. Keep a text-only
    // fallback, but never use arbitrary preceding cast/note text as a show name.
    const lines = items.length ? items : clean(doc.body?.innerText || "")
      .split(/\n+/).map(text => ({text:clean(text),tag:"p",bold:false,heading:false})).filter(x => x.text);

    const records = [];
    let kind = "audio";
    let currentShow = "";
    let inWants = false;

    const isSection = value => /^(audio|videos?|concerts?(?:\s*\(miscellaneous\))?)$/i.test(value);
    const isTitleBeforeEntry = index => {
      const item = lines[index];
      if (!item || item.heading || !item.text || isSection(item.text)) return false;
      for (let j=index+1;j<lines.length;j++) {
        if (!lines[j].text) continue;
        return !!parseMetadata(lines[j].text);
      }
      return false;
    };

    for (let i=0;i<lines.length;i++) {
      const item = lines[i];
      const line = item.text;

      if (/^wants$/i.test(line)) {
        inWants = true;
        currentShow = "";
        continue;
      }

      if (item.heading) {
        if (/^videos?$/i.test(line)) {
          kind = "video";
          currentShow = "";
        } else if (/^audios?$/i.test(line)) {
          kind = "audio";
          currentShow = "";
        } else if (/^concerts?(?:\s*\(miscellaneous\))?$/i.test(line)) {
          // Concert headings are category labels, not the title of every entry.
          kind = "audio";
          currentShow = "";
        } else {
          // Heading 2 tabs such as Les Misérables and The Phantom of the Opera
          // explicitly start a new show group.
          currentShow = line;
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

      // A bold title immediately followed by a dated metadata line is the
      // recording/show title, not part of the previous recording's notes.
      if (isTitleBeforeEntry(i)) {
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
      if (next < lines.length && /^\([^)]*,[^)]*\)$/.test(lines[next].text)) {
        const split = lines[next].text.replace(/^\(|\)$/g,"").split(",").map(clean);
        if (!record.type) record.type = split[0] || "";
        if (!record.size) record.size = split.slice(1).join(", ");
        next++;
      }

      const castLines = [], noteLines = [], myNoteLines = [];
      let textSection = "cast";
      for (;next<lines.length;next++) {
        const value = lines[next].text;

        // Stop at the next tab/section heading or the next recording entry.
        if (lines[next].heading || isSection(value) || parseMetadata(value)) break;
        if (isTitleBeforeEntry(next)) break;

        if (/^never gift\.?$/i.test(value)) { record.gift = "Never Gift"; continue; }
        if (/^only gift\.?$/i.test(value)) { record.gift = "Only Gift"; continue; }
        // NFT restriction lines may be marked with a bullet in the source document.
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