// Markdown-lite → HTML, dependency-free. Escape-then-markup: input is
// HTML-escaped FIRST, then markdown patterns are applied, so no raw HTML
// can ever pass through. Authors are admin-only (pages CMS), this is
// belt-and-braces. Supported: ## / ### headings, **bold**, *italic*,
// [text](https://url), "- " lists, blank line = paragraph break.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
      '<a href="$2" class="text-emerald-700 underline hover:text-emerald-900">$1</a>',
    );
}

export function renderMarkdown(md: string): string {
  const blocks = escapeHtml(md.replace(/\r\n/g, "\n")).split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) return "";
      if (lines.every((l) => l.startsWith("- "))) {
        const items = lines
          .map((l) => `<li>${inline(l.slice(2))}</li>`)
          .join("");
        return `<ul class="list-disc pl-5 space-y-1">${items}</ul>`;
      }
      return lines
        .map((line) => {
          if (line.startsWith("### ")) {
            return `<h3 class="text-base font-semibold mt-5 mb-1">${inline(line.slice(4))}</h3>`;
          }
          if (line.startsWith("## ")) {
            return `<h2 class="text-lg font-semibold mt-6 mb-2">${inline(line.slice(3))}</h2>`;
          }
          return `<p class="leading-relaxed">${inline(line)}</p>`;
        })
        .join("");
    })
    .filter(Boolean)
    .join("\n");
  return html;
}
