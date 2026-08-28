/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 *
 * v25.10 is released and its API cannot change, so this directory is a record
 * rather than an output. The series also carries the `virt.*` namespace, which
 * no dump can reproduce: middleware deleted those models from every version
 * directory in b9c330ee94, so regenerating would silently delete them here too.
 *
 * `yarn generate:api` still generates the whole chain — later versions are
 * deltas against this one — but leaves files carrying this marker untouched.
 */

export const IpmiChassisIdentifyRequestVerb = {
  On: 'ON',
  Off: 'OFF',
} as const;
export type IpmiChassisIdentifyRequestVerb = (typeof IpmiChassisIdentifyRequestVerb)[keyof typeof IpmiChassisIdentifyRequestVerb];

export interface CertificateAddedEvent {
  id: number;
  fields: CertificateEntry;
}
export interface CertificateEntry {
  id: number;
  type: number;
  name: string;
  certificate: string | null;
  privatekey: string | null;
  CSR: string | null;
  acme_uri: string | null;
  domains_authenticators: {
    [k: string]: unknown;
  } | null;
  renew_days: number | null;
  acme: {
    [k: string]: unknown;
  } | null;
  add_to_trusted_store: boolean;
  root_path: string;
  certificate_path: string | null;
  privatekey_path: string | null;
  csr_path: string | null;
  cert_type: string;
  cert_type_existing: boolean;
  cert_type_CSR: boolean;
  cert_type_CA: boolean;
  chain_list: string[];
  key_length: number | null;
  key_type: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  organization: string | null;
  organizational_unit: string | null;
  common: string | null;
  san: string[] | null;
  email: string | null;
  DN: string | null;
  subject_name_hash: number | null;
  extensions: {
    [k: string]: unknown;
  };
  digest_algorithm: string | null;
  lifetime: number | null;
  from: string | null;
  until: string | null;
  serial: number | null;
  chain: boolean | null;
  fingerprint: string | null;
  expired: boolean | null;
  parsed: boolean;
}
export interface CertificateChangedEvent {
  id: number;
  fields: CertificateEntry;
}
export interface CertificateQueryResultItem {
  id?: number;
  type?: number;
  name?: string;
  certificate?: string | null;
  privatekey?: string | null;
  CSR?: string | null;
  acme_uri?: string | null;
  domains_authenticators?: {
    [k: string]: unknown;
  } | null;
  renew_days?: number | null;
  acme?: {
    [k: string]: unknown;
  } | null;
  add_to_trusted_store?: boolean;
  root_path?: string;
  certificate_path?: string | null;
  privatekey_path?: string | null;
  csr_path?: string | null;
  cert_type?: string;
  cert_type_existing?: boolean;
  cert_type_CSR?: boolean;
  cert_type_CA?: boolean;
  chain_list?: string[];
  key_length?: number | null;
  key_type?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  organization?: string | null;
  organizational_unit?: string | null;
  common?: string | null;
  san?: string[] | null;
  email?: string | null;
  DN?: string | null;
  subject_name_hash?: number | null;
  extensions?: {
    [k: string]: unknown;
  };
  digest_algorithm?: string | null;
  lifetime?: number | null;
  from?: string | null;
  until?: string | null;
  serial?: number | null;
  chain?: boolean | null;
  fingerprint?: string | null;
  expired?: boolean | null;
  parsed?: boolean;
}
export interface IpmiChassisIdentifyRequest {
  verb?: IpmiChassisIdentifyRequestVerb;
  apply_remote?: boolean;
}
export interface IpmiChassisInfoRequest {
  "query-remote"?: boolean;
}
