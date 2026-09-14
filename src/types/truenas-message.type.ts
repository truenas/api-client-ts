import type { TrueNasErrorFrame } from './api-error.type';

export interface TrueNasMessage {
  id?: string;
  /** JSON-RPC 2.0 protocol version, e.g. '2.0' (present on versioned-API messages). */
  jsonrpc?: string;
  msg?: string;
  version?: string;
  support?: string[];
  method?: string;
  result?: unknown;
  params?: unknown;
  name?: string;
  collection?: string;
  fields?: unknown;
  subs?: string[];
  /**
   * The JSON-RPC error object, with the TrueNAS payload under `data`.
   *
   * This used to declare `data`'s fields at the top level, which is the shape
   * the legacy `/websocket` endpoint sends. The versioned endpoint this client
   * connects to wraps them — `main.py` routes every `/api/{version}` to
   * `RpcWebSocketHandler`, and `rpc.py`'s `send_error` puts `code` and
   * `message` outside and the payload in `data`. Nothing here noticed, because
   * `getApiErrorMessage` reads a `reason` at either depth and answers with the
   * same string; a consumer branching on `code` or `data.errname` would have.
   */
  error?: TrueNasErrorFrame;
}

export interface TruenasInstallerMessage {
  id?: string;
  jsonrpc?: string;
  result?: unknown;
  method?: string;
  error?: {
    code: number;
    message: string;
  };
  params?: unknown;
}
