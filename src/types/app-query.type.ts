export interface AppQuery {
  id: string;
  name: string;
  state: AppState;
  version: string;
  upgrade_available: boolean;
  metadata: {
    version: string;
    app_version: string;
    train: string;
    home: string;
    icon: string;
  };
  portals: Record<string, string>;
}

export enum AppState {
  Running = 'RUNNING',
  Stopped = 'STOPPED',
  Stopping = 'STOPPING',
  Deploying = 'DEPLOYING',
}
