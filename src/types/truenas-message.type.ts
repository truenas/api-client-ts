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
  error?: {
    error: number;
    errname: string;
    /**
     * `null` when the appliance has nothing to add.
     *
     * `rpc.py`'s generic arm sets `extra = None` for any exception it cannot
     * adapt — `MatchNotFound` from an empty `get`, for one — and only an
     * adapted error carries a list.
     */
    extra: (string | number)[] | null;
    reason: string;
  };
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
