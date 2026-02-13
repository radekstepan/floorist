export interface FurnitureTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  widthInches: number;
  depthInches: number;
  shape: 'rect' | 'circle' | 'L' | 'U';
  cutoutWidthInches?: number;
  cutoutDepthInches?: number;
  url?: string;
  manualNub?: boolean;
}

export interface PlacedFurniture {
  instanceId: string;
  templateId: string;
  x: number;
  y: number;
  rotation: number;
  flippedX: boolean;
  flippedY: boolean;
  color?: string;
}

export interface ScaleConfig {
  pixelsPerInch: number;
  isCalibrated: boolean;
}

export type AppMode = 'select' | 'place' | 'calibrate' | 'export';

export interface ExportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedDesign {
  id: string;
  name: string;
  savedAt: number;
  thumbnailDataUrl: string;
  floorplanDataUrl: string;
  placed: PlacedFurniture[];
  scale: ScaleConfig;
  canvasWidth: number;
  canvasHeight: number;
  exportRects?: ExportRect[];
  viewOffset?: { x: number; y: number };
  zoomLevel?: number;
}
