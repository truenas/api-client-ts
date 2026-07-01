import { TrueNasDate } from '@/types/truenas-date.type';

/**
 * alert level corresponds directly with IETF RFC 5424 minus the debug level.
 * see https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1
 * for levels and their descriptions.
 *
 * `AlertLevel` values are always CAPITALIZED.
 */
export enum AlertLevel {
  Emergency = 'EMERGENCY',
  Alert = 'ALERT',
  Critical = 'CRITICAL',
  Error = 'ERROR',
  Warning = 'WARNING',
  Notice = 'NOTICE',
  Info = 'INFO',
}

export interface Alert {
  uuid: string;
  source: string;
  args: string;
  node: string;
  datetime: TrueNasDate;
  last_occurrence: TrueNasDate;
  dismissed: boolean;
  text: string;
  id: string;
  level: AlertLevel;
  formatted: string;
  one_shot: boolean;
}
