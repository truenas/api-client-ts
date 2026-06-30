export interface TrueNasMessage {
  id?: string;
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
    extra: (string | number)[];
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
