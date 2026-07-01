export interface PeriodicSnapshotTask {
  id: number;
  dataset: string;
  recursive: boolean;
  lifetime_value: number;
  lifetime_unit: string;
  enabled: boolean;
  exclude: string[];
  naming_schema: string;
  allow_empty: boolean;
  schedule: {
    minute: string;
    hour: string;
    dom: string;
    month: string;
    dow: string;
    begin: string;
    end: string;
  };
  state: string;
}

export interface PeriodicSnapshotTaskCreate {
  dataset: string;
  recursive: boolean;
  lifetime_value: number;
  lifetime_unit: string;
  naming_schema: string;
  schedule: {
    minute: string;
    hour: string;
    dom: string;
    month: string;
    dow: string;
  };
  enabled: boolean;
  exclude?: string[];
  allow_empty?: boolean;
}
