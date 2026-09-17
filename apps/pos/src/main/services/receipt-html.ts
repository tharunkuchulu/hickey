/**
 * Shared receipt page skeleton. Receipts are plain HTML + CSS sized for 58/80 mm rolls.
 * Monospace font and a fixed character width give the classic thermal look.
 * Bill/KOT bodies are built in Phase 2 (services/receipts/*.ts) and dropped into this shell.
 */
export function receiptDocument(body: string, paperWidthMm: 58 | 80, opts: { large?: boolean } = {}): string {
  // Printable width is a little less than the roll (driver margins vary by printer).
  const contentMm = paperWidthMm === 58 ? 48 : 72
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: ${contentMm}mm;
    padding: 2mm 1mm;
    font-family: "Courier New", Consolas, monospace;
    font-size: ${(paperWidthMm === 58 ? 10 : 11.5) * (opts.large ? 1.25 : 1)}px;
    line-height: 1.35;
    color: #000;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .lg { font-size: 1.35em; }
  .xl { font-size: 1.7em; }
  .rule { border-top: 1px dashed #000; margin: 3px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row > span:first-child { flex: 1 1 auto; word-break: break-word; }
  .row > span:nth-child(2) { flex: 0 0 auto; text-align: right; }
  .row > span:nth-child(3) { flex: 0 0 auto; text-align: right; white-space: nowrap; }
  .row.meta > span:first-child { white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 1px 0; vertical-align: top; }
  th { text-align: left; border-bottom: 1px dashed #000; }
  .num { text-align: right; white-space: nowrap; }
  .sub { font-size: 0.85em; color: #000; padding-left: 1ch; }
  thead th.num, td.num { padding-left: 4px; }
  .kot td.num { padding-right: 10px; width: 3ch; }
  .kot th.num { padding-right: 10px; }
</style></head><body>${body}</body></html>`
}
