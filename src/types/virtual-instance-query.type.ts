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
