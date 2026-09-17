import type { IpcChannel, IpcReq, IpcRes } from '../../../main/ipc/contract'

/** Thin wrapper so screens never touch window.hickey directly (easier to mock in tests). */
export function invoke<C extends IpcChannel>(channel: C, req?: IpcReq<C>): Promise<IpcRes<C>> {
  return window.hickey.invoke(channel, req)
}

export function onEvent(channel: `event:${string}`, listener: (payload: unknown) => void): () => void {
  return window.hickey.on(channel, listener)
}
