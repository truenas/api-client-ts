/**
 * NOT-IN-DUMP: hand-written because the generated types cannot supply this.
 * Params for `virt.instance.stop`/`restart` — see
 * {@link ./virtual-instance-query.type.ts} for why `virt.*` is missing from
 * the dump.
 */
export interface VirtualizationStopParams {
  timeout?: number;
  force: boolean;
  force_after_timeout?: boolean;
}
