/**
 * NOT-IN-DUMP: hand-written because the generated types cannot supply this.
 *
 * `virt.instance.*` is a real, public v25.10 API, but it is absent from every
 * version of the `middlewared --dump-api` output: the dump builds each
 * version's method roster from the *dumping* checkout's plugins, and the
 * `virt` plugin was deleted upstream (replaced by `container`) before the dump
 * was taken — so it vanished retroactively from v25.04/v25.10 too.
 *
 * Keep hand-written until the dump is pinned per released version. The
 * v25.10 client's ops call these through the `callUnsafe` escape hatches.
 */

import { AppState } from '@/types/app-query.type';

export interface VirtualInstanceQuery {
  id: string;
  name: string;
  type: VirtualInstanceType;
  status: AppState;
  autostart: boolean;
  cpu: string;
  memory: number;
  image: {
    description: string;
  };
}

export enum VirtualInstanceType {
  Container = 'CONTAINER',
  Vm = 'VM',
}
