/**
 * Printing. Driver A (default) renders receipt HTML in a hidden window and prints it
 * silently through the installed Windows printer driver. Works with any thermal printer
 * that has a driver, needs no native modules, and the driver handles the paper cut.
 *
 * Driver B (raw ESC/POS over LAN 9100 / Windows spooler) is added in Phase 2 for
 * cash-drawer kick and faster prints; it plugs into the same `printHtml`/`printRaw` surface.
 */
import type { AppSettings } from '@hickey/shared'
import { formatReceiptDateTime } from '@hickey/shared'
import { BrowserWindow } from 'electron'
import { receiptDocument } from './receipt-html'

const MICRONS_PER_PX = 25400 / 96 // CSS px at 96 dpi -> microns

export interface PrintJob {
  html: string
  copies?: number
}

export async function printHtml(job: PrintJob, settings: AppSettings): Promise<void> {
  const widthMm = settings.receipt.paperWidthMm
  const deviceName = settings.printer.windowsPrinterName || undefined

  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, offscreen: false }
  })

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(job.html))
    // Measure the rendered height so the driver does not feed a whole A4 of blank paper.
    const heightPx = (await win.webContents.executeJavaScript('document.documentElement.scrollHeight')) as number
    const pageSize = {
      width: Math.round(widthMm * 1000),
      height: Math.round(Math.max(heightPx + 24, 200) * MICRONS_PER_PX)
    }

    for (let i = 0; i < (job.copies ?? 1); i++) {
      await new Promise<void>((resolve, reject) => {
        win.webContents.print(
          {
            silent: true,
            printBackground: false,
            deviceName,
            margins: { marginType: 'none' },
            pageSize,
            copies: 1
          },
          (success, failureReason) => (success ? resolve() : reject(new Error(failureReason || 'Print failed')))
        )
      })
    }
  } finally {
    win.destroy()
  }
}

export async function testPrint(settings: AppSettings): Promise<void> {
  const body = `
    <div class="center bold lg">${escapeHtml(settings.cafe.name || 'Hickey POS')}</div>
    <div class="center">Printer test</div>
    <div class="rule"></div>
    <div>${escapeHtml(formatReceiptDateTime(new Date()))}</div>
    <div>Printer: ${escapeHtml(settings.printer.windowsPrinterName || '(default)')}</div>
    <div>Paper: ${settings.receipt.paperWidthMm} mm</div>
    <div class="rule"></div>
    <div class="row"><span>Filter Coffee x 2</span><span>50.00</span></div>
    <div class="row bold"><span>TOTAL</span><span>50.00</span></div>
    <div class="rule"></div>
    <div class="center">If you can read this, printing works.</div>
  `
  await printHtml({ html: receiptDocument(body, settings.receipt.paperWidthMm) }, settings)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
