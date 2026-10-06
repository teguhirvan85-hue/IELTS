// Small Markdown subset for lesson pages: ## and ### headings, paragraphs, - and 1. lists,
// > quotes, | tables |, ::: boxes (tip, trap, example) and inline **bold**, *italic*,
// `code` and [links](/path). The source is escaped first, so only these become HTML.

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inline(s) {
  return escape(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((\/[^\s)]*|https:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

const BLOCK_START = /^(#{2,3}\s|:::|\||>|- |\d+\.\s)/;

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  const take = (test) => {
    const block = [];
    while (i < lines.length && test(lines[i])) block.push(lines[i++]);
    return block;
  };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) {
      i++;
    } else if ((m = line.match(/^(#{2,3})\s+(.*)$/))) {
      const level = m[1].length;
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      i++;
    } else if ((m = line.match(/^:::\s*([a-z]+)(?:\s+(.*))?$/))) {
      i++;
      const body = take((l) => !/^:::\s*$/.test(l));
      i++;
      const title = m[2] ? `<p class="box-title">${inline(m[2])}</p>` : "";
      out.push(`<div class="box box-${m[1]}">${title}${renderMarkdown(body.join("\n"))}</div>`);
    } else if (line.startsWith("|")) {
      const rows = take((l) => l.startsWith("|")).filter((l) => !/^\|[\s:|-]+\|?$/.test(l));
      const cells = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const [head, ...body] = rows.map(cells);
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      );
    } else if (line.startsWith(">")) {
      const body = take((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(body.join("\n"))}</blockquote>`);
    } else if (/^- /.test(line)) {
      const items = take((l) => /^- /.test(l) || /^ {2,}\S/.test(l));
      out.push(`<ul>${joinItems(items, /^- /).map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
    } else if (/^\d+\.\s/.test(line)) {
      const items = take((l) => /^\d+\.\s/.test(l) || /^ {2,}\S/.test(l));
      out.push(`<ol>${joinItems(items, /^\d+\.\s/).map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
    } else {
      const para = take((l) => l.trim() && !BLOCK_START.test(l));
      // A stray marker line (":::" without an opening box) is shown as plain text.
      if (!para.length) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

// List items may wrap onto indented continuation lines.
function joinItems(lines, marker) {
  const items = [];
  for (const l of lines) {
    if (marker.test(l)) items.push(l.replace(marker, ""));
    else items[items.length - 1] += " " + l.trim();
  }
  return items;
}
