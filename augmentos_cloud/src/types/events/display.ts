// src/types/events/display.ts
import { WebSocketMessage } from '../websocket/common';

export interface TextWall {
  layoutType: 'text_wall';
  text: string;
}

export interface DoubleTextWall {
  layoutType: 'double_text_wall';
  topText: string;
  bottomText: string;
}

export interface TextRows {
  layoutType: 'text_rows';
  text: string[];
}

export interface TextLine {
  layoutType: 'text_line';
  text: string;
}

export interface ReferenceCard {
  layoutType: 'reference_card';
  title: string;
  text: string;
}

export type Layout = TextWall | TextRows | TextLine | ReferenceCard;

export type DisplayHistory = {
  layout: Layout;
  timestamp: Date;
  durationInMilliseconds: number;
}[];

export interface DisplayEvent extends WebSocketMessage {
  type: 'display_event';
  layout: Layout;
  durationMs?: number;
  packageName?: string;
}

export interface DashboardDisplayEvent extends WebSocketMessage {
  type: 'dashboard_display_event';
  layout: Layout;
}