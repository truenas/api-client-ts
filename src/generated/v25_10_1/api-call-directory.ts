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

import type { ApiCallDirectory as PreviousApiCallDirectory } from '../v25_10_0/api-call-directory';

import type {
  QueryFilters,
  QueryOptions,
} from '../shared/query-types';

import type {
  StaticRouteEntry,
} from '../v25_10_0/api-types';
import type {
  SNMPEntry,
  SNMPUpdateArgs,
  SharingSMBEntry,
  SharingSMBQueryResultItem,
  SmbShareCreate,
  SmbShareUpdate,
  StaticRouteCreate,
  StaticRouteUpdate,
  StatusResult,
  VMDeviceVirtualSizeArgs,
} from './api-types';

/** Entries added or changed in this version (directly, or through a referenced type). */
export interface ApiCallDirectoryDelta {
  'docker.status': {
    params: [];
    response: StatusResult;
  };

  'sharing.smb.create': {
    params: [data: SmbShareCreate];
    response: SharingSMBEntry;
  };

  'sharing.smb.get_instance': {
    params: [id: number, options?: QueryOptions<SharingSMBEntry>];
    response: SharingSMBEntry;
  };

  'sharing.smb.query': {
    params: [filters?: QueryFilters<SharingSMBEntry>, options?: QueryOptions<SharingSMBEntry>];
    response: SharingSMBEntry[] | SharingSMBEntry | SharingSMBQueryResultItem[] | SharingSMBQueryResultItem | number;
    entity: SharingSMBEntry;
  };

  'sharing.smb.update': {
    params: [id: number, data: SmbShareUpdate];
    response: SharingSMBEntry;
  };

  'snmp.config': {
    params: [];
    response: SNMPEntry;
  };

  'snmp.update': {
    params: [snmp_update?: SNMPUpdateArgs];
    response: SNMPEntry;
  };

  'staticroute.create': {
    params: [data: StaticRouteCreate];
    response: StaticRouteEntry;
  };

  'staticroute.update': {
    params: [id: number, data: StaticRouteUpdate];
    response: StaticRouteEntry;
  };

  'vm.device.virtual_size': {
    params: [vm_virtual_size: VMDeviceVirtualSizeArgs];
    response: number;
  };
}

/** This version's surface: the previous version's, updated by the delta. */
export type ApiCallDirectory = Omit<PreviousApiCallDirectory, keyof ApiCallDirectoryDelta> & ApiCallDirectoryDelta;
