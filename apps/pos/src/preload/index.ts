import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcReq, IpcRes } from '../main/ipc/contract'

/** Single typed entry point. Usage in renderer: `window.hickey.invoke('menu:snapshot')`. */
function invoke<C extends IpcChannel>(channel: C, req?: IpcReq<C>): Promise<IpcRes<C>> {
  return ipcRenderer.invoke(channel, req)
}

const api = {
  invoke,
  /** Subscribe to push events from main (sync status, print status). Returns an unsubscribe fn. */
  on(channel: `event:${string}`, listener: (payload: unknown) => void): () => void {
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.off(channel, wrapped)
  }
}

export type HickeyApi = typeof api

contextBridge.exposeInMainWorld('hickey', api)
