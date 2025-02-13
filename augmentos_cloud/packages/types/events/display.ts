import type { Layout } from "../layout/layout";
import type { WebSocketMessage } from "../websocket/common";

export interface DisplayRequest extends WebSocketMessage {
    view: "main" | string;
    type: 'display_event'; // not gonna make this match so we don't have to change it everywhere. maybe theres a better way to manage enums in typescript so we can leverage them.
    layout: Layout;
    timestamp: Date;
    packageName: "system" | string;
    durationMs?: number;
}

export type DisplayHistory = DisplayRequest[];

export interface DashboardCard {
  layoutType: 'dashboard_card';
  timeDateAndBattery: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
}

export type Layout = DashboardCard;
