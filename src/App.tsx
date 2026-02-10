import { useState, useRef, useCallback, useEffect } from 'react';
import { FurnitureTemplate, PlacedFurniture, ScaleConfig, AppMode, ExportRect, SavedDesign } from './types';
import { furnitureCatalog, categories } from './data/furniture';
import { cn } from './utils/cn';

let instanceCounter = 0;
function genId() {
  return `inst_${Date.now()}_${instanceCounter++}`;
}

const STORAGE_KEY = 'floorplan-planner-designs';

// ─── localStorage helpers ───────────────────────────────────────────────────

function loadDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedDesign[];
  } catch {
    return [];
  }
}

function saveDesigns(designs: SavedDesign[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
  } catch (e) {
    console.warn('Failed to save designs to localStorage:', e);
  }
}

function generateThumbnail(
  floorplanImg: HTMLImageElement | null,
  placed: PlacedFurniture[],
  scale: ScaleConfig,
  canvasW: number,
  canvasH: number
): string {
  const thumbW = 320;
  const thumbH = 200;
  const canvas = document.createElement('canvas');
  canvas.width = thumbW;
  canvas.height = thumbH;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, thumbW, thumbH);

  const scaleX = thumbW / canvasW;
  const scaleY = thumbH / canvasH;
  const s = Math.min(scaleX, scaleY);
  const offX = (thumbW - canvasW * s) / 2;
  const offY = (thumbH - canvasH * s) / 2;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(s, s);

  if (floorplanImg) {
    ctx.drawImage(floorplanImg, 0, 0);
  }

  for (const p of placed) {
    const tmpl = furnitureCatalog.find((f) => f.id === p.templateId);
    if (!tmpl) continue;
    const wPx = tmpl.widthInches * scale.pixelsPerInch;
    const hPx = tmpl.depthInches * scale.pixelsPerInch;

    ctx.save();
    ctx.translate(p.x + wPx / 2, p.y + hPx / 2);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.scale(p.flippedX ? -1 : 1, p.flippedY ? -1 : 1);
    ctx.translate(-wPx / 2, -hPx / 2);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = tmpl.color;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(0, 0, wPx, hPx);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  ctx.restore();

  try {
    return canvas.toDataURL('image/png', 0.7);
  } catch {
    return '';
  }
}

// ─── Drawing helpers ────────────────────────────────────────────────────────

function drawFurnitureShape(
  ctx: CanvasRenderingContext2D,
  tmpl: FurnitureTemplate,
  wPx: number,
  hPx: number,
  opacity = 0.85
) {
  ctx.globalAlpha = opacity;
  ctx.fillStyle = tmpl.color;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;

  if (tmpl.shape === 'rect') {
    ctx.beginPath();
    ctx.rect(0, 0, wPx, hPx);
    ctx.fill();
    ctx.stroke();
  } else if (tmpl.shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(wPx / 2, hPx / 2, wPx / 2, hPx / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (tmpl.shape === 'L') {
    const cwPx = ((tmpl.cutoutWidthInches ?? 0) / tmpl.widthInches) * wPx;
    const chPx = ((tmpl.cutoutDepthInches ?? 0) / tmpl.depthInches) * hPx;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wPx, 0);
    ctx.lineTo(wPx, hPx - chPx);
    ctx.lineTo(wPx - cwPx, hPx - chPx);
    ctx.lineTo(wPx - cwPx, hPx);
    ctx.lineTo(0, hPx);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (tmpl.shape === 'U') {
    const cwPx = ((tmpl.cutoutWidthInches ?? 0) / tmpl.widthInches) * wPx;
    const chPx = ((tmpl.cutoutDepthInches ?? 0) / tmpl.depthInches) * hPx;
    const sideW = (wPx - cwPx) / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wPx, 0);
    ctx.lineTo(wPx, hPx);
    ctx.lineTo(wPx - sideW, hPx);
    ctx.lineTo(wPx - sideW, chPx);
    ctx.lineTo(sideW, chPx);
    ctx.lineTo(sideW, hPx);
    ctx.lineTo(0, hPx);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  tmpl: FurnitureTemplate,
  wPx: number,
  hPx: number,
  rotation: number = 0,
  flippedX: boolean = false,
  flippedY: boolean = false
) {
  const fontSize = Math.max(9, Math.min(14, Math.min(wPx, hPx) * 0.18));
  ctx.save();

  let cx = wPx / 2;
  const cy = hPx / 2;
  if (tmpl.shape === 'L') {
    cx = (wPx - (((tmpl.cutoutWidthInches ?? 0) / tmpl.widthInches) * wPx)) / 2;
  }

  ctx.translate(cx, cy);
  ctx.scale(flippedX ? -1 : 1, flippedY ? -1 : 1);
  ctx.rotate((-rotation * Math.PI) / 180);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  const nameY = -fontSize * 0.6;
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeText(tmpl.name, 0, nameY);
  ctx.fillStyle = '#fff';
  ctx.fillText(tmpl.name, 0, nameY);

  const dimY = fontSize * 0.5;
  ctx.font = `bold ${fontSize * 0.85}px Inter, system-ui, sans-serif`;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 3.5;
  ctx.strokeText(`${tmpl.widthInches}"×${tmpl.depthInches}"`, 0, dimY);
  ctx.fillStyle = '#e5e5e5';
  ctx.fillText(`${tmpl.widthInches}"×${tmpl.depthInches}"`, 0, dimY);

  ctx.restore();
}

// ─── Main App ────────────────────────────────────────────────────────────────

export function App() {
  const [floorplanImg, setFloorplanImg] = useState<HTMLImageElement | null>(null);
  const [floorplanDataUrl, setFloorplanDataUrl] = useState<string>('');
  const [scale, setScale] = useState<ScaleConfig>({ pixelsPerInch: 4, isCalibrated: false });
  const [placed, setPlaced] = useState<PlacedFurniture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>('select');
  const [activeFurniture, setActiveFurniture] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showDimensions, setShowDimensions] = useState(true);

  // Saved designs
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [showDesignsPanel, setShowDesignsPanel] = useState(false);
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
  const [designName, setDesignName] = useState('Untitled Design');
  const [hasUploaded, setHasUploaded] = useState(false);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & zoom
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Drag state
  const dragRef = useRef<{
    isDragging: boolean;
    instanceId: string | null;
    startMouseX: number;
    startMouseY: number;
    startObjX: number;
    startObjY: number;
  }>({ isDragging: false, instanceId: null, startMouseX: 0, startMouseY: 0, startObjX: 0, startObjY: 0 });

  // Pan state
  const panRef = useRef<{
    isPanning: boolean;
    startMouseX: number;
    startMouseY: number;
    startOffsetX: number;
    startOffsetY: number;
  }>({ isPanning: false, startMouseX: 0, startMouseY: 0, startOffsetX: 0, startOffsetY: 0 });

  // Calibration state
  const calibRef = useRef<{
    step: number;
    p1: { x: number; y: number } | null;
    p2: { x: number; y: number } | null;
  }>({ step: 0, p1: null, p2: null });
  const [calibStep, setCalibStep] = useState(0);
  const [calibP1, setCalibP1] = useState<{ x: number; y: number } | null>(null);
  const [calibP2, setCalibP2] = useState<{ x: number; y: number } | null>(null);
  const [calibInches, setCalibInches] = useState('120');

  // Export rect state
  const exportRef = useRef<{
    isDrawing: boolean;
    startX: number;
    startY: number;
  }>({ isDrawing: false, startX: 0, startY: 0 });
  const [exportRect, setExportRect] = useState<ExportRect | null>(null);

  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });

  // ─── Load saved designs on mount ─────────────────────────────────────────

  useEffect(() => {
    const designs = loadDesigns();
    setSavedDesigns(designs);
    if (designs.length > 0) {
      setShowDesignsPanel(true);
    }
  }, []);

  // ─── Auto-save (debounced) ────────────────────────────────────────────────

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasUploaded || !floorplanDataUrl) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      const thumb = generateThumbnail(floorplanImg, placed, scale, canvasSize.width, canvasSize.height);

      const design: SavedDesign = {
        id: currentDesignId || `design_${Date.now()}`,
        name: designName,
        savedAt: Date.now(),
        thumbnailDataUrl: thumb,
        floorplanDataUrl: floorplanDataUrl,
        placed: placed,
        scale: scale,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      };

      if (!currentDesignId) {
        setCurrentDesignId(design.id);
      }

      setSavedDesigns((prev) => {
        const existing = prev.findIndex((d) => d.id === design.id);
        let updated: SavedDesign[];
        if (existing >= 0) {
          updated = [...prev];
          updated[existing] = design;
        } else {
          updated = [design, ...prev];
        }
        saveDesigns(updated);
        return updated;
      });
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [placed, scale, floorplanDataUrl, canvasSize, hasUploaded, currentDesignId, designName, floorplanImg]);

  // ─── Load a saved design ─────────────────────────────────────────────────

  const loadDesign = useCallback((design: SavedDesign) => {
    const img = new Image();
    img.onload = () => {
      setFloorplanImg(img);
      setFloorplanDataUrl(design.floorplanDataUrl);
      setPlaced(design.placed);
      setScale(design.scale);
      setCanvasSize({ width: design.canvasWidth, height: design.canvasHeight });
      setCurrentDesignId(design.id);
      setDesignName(design.name);
      setHasUploaded(true);
      setShowDesignsPanel(false);
      setSelectedId(null);
      setViewOffset({ x: 0, y: 0 });

      const container = containerRef.current;
      if (container) {
        const fitZoom = Math.min(
          (container.clientWidth - 40) / img.width,
          (container.clientHeight - 40) / img.height,
          1
        );
        setZoomLevel(Math.max(0.1, fitZoom));
      }
    };
    img.src = design.floorplanDataUrl;
  }, []);

  // ─── Delete a saved design ────────────────────────────────────────────────

  const deleteDesign = useCallback((designId: string) => {
    setSavedDesigns((prev) => {
      const updated = prev.filter((d) => d.id !== designId);
      saveDesigns(updated);
      return updated;
    });
    if (currentDesignId === designId) {
      setCurrentDesignId(null);
    }
  }, [currentDesignId]);

  // ─── New design ────────────────────────────────────────────────────────────

  const startNewDesign = useCallback(() => {
    setFloorplanImg(null);
    setFloorplanDataUrl('');
    setPlaced([]);
    setScale({ pixelsPerInch: 4, isCalibrated: false });
    setCanvasSize({ width: 1200, height: 800 });
    setCurrentDesignId(null);
    setDesignName('Untitled Design');
    setHasUploaded(false);
    setSelectedId(null);
    setViewOffset({ x: 0, y: 0 });
    setZoomLevel(1);
    setShowDesignsPanel(false);
    setMode('select');
  }, []);

  // ─── Upload handler ──────────────────────────────────────────────────────

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setFloorplanImg(img);
        setFloorplanDataUrl(dataUrl);
        setCanvasSize({ width: img.width, height: img.height });
        setViewOffset({ x: 0, y: 0 });
        setHasUploaded(true);
        setShowDesignsPanel(false);

        // Create new design ID if not already editing one
        if (!currentDesignId) {
          const newId = `design_${Date.now()}`;
          setCurrentDesignId(newId);
          setDesignName(file.name.replace(/\.[^.]+$/, '') || 'Untitled Design');
        }

        const container = containerRef.current;
        if (container) {
          const fitZoom = Math.min(
            (container.clientWidth - 40) / img.width,
            (container.clientHeight - 40) / img.height,
            1
          );
          setZoomLevel(Math.max(0.1, fitZoom));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [currentDesignId]);

  // ─── World <-> Screen coordinate transforms ──────────────────────────────

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      return {
        x: (sx - viewOffset.x) / zoomLevel,
        y: (sy - viewOffset.y) / zoomLevel,
      };
    },
    [viewOffset, zoomLevel]
  );

  // ─── Hit test ─────────────────────────────────────────────────────────────

  const hitTest = useCallback(
    (wx: number, wy: number): string | null => {
      for (let i = placed.length - 1; i >= 0; i--) {
        const p = placed[i];
        const tmpl = furnitureCatalog.find((f) => f.id === p.templateId);
        if (!tmpl) continue;
        const wPx = tmpl.widthInches * scale.pixelsPerInch;
        const hPx = tmpl.depthInches * scale.pixelsPerInch;

        const rad = (p.rotation * Math.PI) / 180;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        const cx = p.x + wPx / 2;
        const cy = p.y + hPx / 2;
        const dx = wx - cx;
        const dy = wy - cy;
        const localX = dx * cos - dy * sin + wPx / 2;
        const localY = dx * sin + dy * cos + hPx / 2;

        if (localX >= 0 && localX <= wPx && localY >= 0 && localY <= hPx) {
          return p.instanceId;
        }
      }
      return null;
    },
    [placed, scale]
  );

  // ─── Mouse handlers ──────────────────────────────────────────────────────

  const getCanvasMousePos = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pos = getCanvasMousePos(e);
      const world = screenToWorld(pos.x, pos.y);

      if (mode === 'calibrate') {
        if (calibRef.current.step === 0) {
          calibRef.current.p1 = { x: world.x, y: world.y };
          calibRef.current.step = 1;
          setCalibStep(1);
          setCalibP1({ x: world.x, y: world.y });
          setCalibP2(null);
        } else if (calibRef.current.step === 1) {
          calibRef.current.p2 = { x: world.x, y: world.y };
          calibRef.current.step = 2;
          setCalibStep(2);
          setCalibP2({ x: world.x, y: world.y });
        }
        return;
      }

      if (mode === 'export') {
        exportRef.current = {
          isDrawing: true,
          startX: world.x,
          startY: world.y,
        };
        setExportRect({ x: world.x, y: world.y, width: 0, height: 0 });
        return;
      }

      if (mode === 'place' && activeFurniture) {
        const tmpl = furnitureCatalog.find((f) => f.id === activeFurniture);
        if (!tmpl) return;
        const wPx = tmpl.widthInches * scale.pixelsPerInch;
        const hPx = tmpl.depthInches * scale.pixelsPerInch;
        const newItem: PlacedFurniture = {
          instanceId: genId(),
          templateId: activeFurniture,
          x: world.x - wPx / 2,
          y: world.y - hPx / 2,
          rotation: 0,
          flippedX: false,
          flippedY: false,
        };
        setPlaced((prev) => [...prev, newItem]);
        setSelectedId(newItem.instanceId);
        setMode('select');
        setActiveFurniture(null);
        return;
      }

      if (mode === 'select') {
        const hitId = hitTest(world.x, world.y);
        if (hitId) {
          setSelectedId(hitId);
          const item = placed.find((p) => p.instanceId === hitId);
          if (item) {
            dragRef.current = {
              isDragging: true,
              instanceId: hitId,
              startMouseX: world.x,
              startMouseY: world.y,
              startObjX: item.x,
              startObjY: item.y,
            };
          }
        } else {
          setSelectedId(null);
          panRef.current = {
            isPanning: true,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startOffsetX: viewOffset.x,
            startOffsetY: viewOffset.y,
          };
        }
      }
    },
    [mode, activeFurniture, scale, placed, hitTest, screenToWorld, getCanvasMousePos, viewOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragRef.current.isDragging && dragRef.current.instanceId) {
        const pos = getCanvasMousePos(e);
        const world = screenToWorld(pos.x, pos.y);
        const dx = world.x - dragRef.current.startMouseX;
        const dy = world.y - dragRef.current.startMouseY;
        setPlaced((prev) =>
          prev.map((p) =>
            p.instanceId === dragRef.current.instanceId
              ? { ...p, x: dragRef.current.startObjX + dx, y: dragRef.current.startObjY + dy }
              : p
          )
        );
      }

      if (panRef.current.isPanning) {
        const dx = e.clientX - panRef.current.startMouseX;
        const dy = e.clientY - panRef.current.startMouseY;
        setViewOffset({
          x: panRef.current.startOffsetX + dx,
          y: panRef.current.startOffsetY + dy,
        });
      }

      if (mode === 'export' && exportRef.current.isDrawing) {
        const pos = getCanvasMousePos(e);
        const world = screenToWorld(pos.x, pos.y);
        setExportRect({
          x: Math.min(exportRef.current.startX, world.x),
          y: Math.min(exportRef.current.startY, world.y),
          width: Math.abs(world.x - exportRef.current.startX),
          height: Math.abs(world.y - exportRef.current.startY),
        });
      }
    },
    [getCanvasMousePos, screenToWorld, mode]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current.isDragging = false;
    dragRef.current.instanceId = null;
    panRef.current.isPanning = false;

    if (mode === 'export') {
      exportRef.current.isDrawing = false;
    }
  }, [mode]);

  // ─── Zoom with wheel ─────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const pos = getCanvasMousePos(e);
      const worldBefore = screenToWorld(pos.x, pos.y);

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.05, Math.min(10, zoomLevel * factor));

      const newOffsetX = pos.x - worldBefore.x * newZoom;
      const newOffsetY = pos.y - worldBefore.y * newZoom;

      setZoomLevel(newZoom);
      setViewOffset({ x: newOffsetX, y: newOffsetY });
    },
    [zoomLevel, getCanvasMousePos, screenToWorld]
  );

  // ─── Keyboard controls ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setPlaced((prev) => prev.filter((p) => p.instanceId !== selectedId));
        setSelectedId(null);
      }
      if (e.key === 'r' || e.key === 'R') {
        setPlaced((prev) =>
          prev.map((p) =>
            p.instanceId === selectedId ? { ...p, rotation: (p.rotation + 90) % 360 } : p
          )
        );
      }
      if (e.key === 'f' || e.key === 'F') {
        setPlaced((prev) =>
          prev.map((p) =>
            p.instanceId === selectedId ? { ...p, flippedX: !p.flippedX } : p
          )
        );
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setMode('select');
        setActiveFurniture(null);
        setExportRect(null);
        calibRef.current = { step: 0, p1: null, p2: null };
        setCalibStep(0);
        setCalibP1(null);
        setCalibP2(null);
      }
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
        const item = placed.find((p) => p.instanceId === selectedId);
        if (item) {
          const tmpl = furnitureCatalog.find((f) => f.id === item.templateId);
          const offset = tmpl ? tmpl.widthInches * scale.pixelsPerInch * 0.2 : 20;
          const newItem: PlacedFurniture = {
            ...item,
            instanceId: genId(),
            x: item.x + offset,
            y: item.y + offset,
          };
          setPlaced((prev) => [...prev, newItem]);
          setSelectedId(newItem.instanceId);
        }
      }

      if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 12 : 1; // 12 inches vs 1 inch
        const moveAmount = step * (scale.pixelsPerInch || 4);

        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -moveAmount;
        if (e.key === 'ArrowDown') dy = moveAmount;
        if (e.key === 'ArrowLeft') dx = -moveAmount;
        if (e.key === 'ArrowRight') dx = moveAmount;

        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          setPlaced((prev) =>
            prev.map((p) =>
              p.instanceId === selectedId ? { ...p, x: p.x + dx, y: p.y + dy } : p
            )
          );
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, placed, scale]);

  // ─── Canvas rendering ────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, displayW, displayH);

    ctx.save();
    ctx.translate(viewOffset.x, viewOffset.y);
    ctx.scale(zoomLevel, zoomLevel);

    if (floorplanImg) {
      ctx.drawImage(floorplanImg, 0, 0);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 0.5;
      const gridSize = 50;
      for (let x = 0; x <= canvasSize.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasSize.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvasSize.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasSize.width, y);
        ctx.stroke();
      }
    }

    for (const p of placed) {
      const tmpl = furnitureCatalog.find((f) => f.id === p.templateId);
      if (!tmpl) continue;
      const wPx = tmpl.widthInches * scale.pixelsPerInch;
      const hPx = tmpl.depthInches * scale.pixelsPerInch;

      ctx.save();
      ctx.translate(p.x + wPx / 2, p.y + hPx / 2);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.scale(p.flippedX ? -1 : 1, p.flippedY ? -1 : 1);
      ctx.translate(-wPx / 2, -hPx / 2);

      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      drawFurnitureShape(ctx, tmpl, wPx, hPx, p.instanceId === selectedId ? 0.95 : 0.8);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      if (showDimensions) {
        drawLabel(ctx, tmpl, wPx, hPx, p.rotation, p.flippedX, p.flippedY);
      }

      if (p.instanceId === selectedId) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3 / zoomLevel;
        ctx.setLineDash([6 / zoomLevel, 4 / zoomLevel]);
        ctx.strokeRect(-4, -4, wPx + 8, hPx + 8);
        ctx.setLineDash([]);

        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(wPx / 2, -16, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    }

    // Calibration line and dots
    if (mode === 'calibrate' && calibP1) {
      const p1 = calibP1;
      const p2 = calibP2;
      const dotRadius = 8 / zoomLevel;
      const lineW = 3 / zoomLevel;

      if (p2) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = lineW;
        ctx.setLineDash([8 / zoomLevel, 4 / zoomLevel]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const distPx = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        const labelFontSize = Math.max(12, 16 / zoomLevel);
        ctx.font = `bold ${labelFontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3 / zoomLevel;
        ctx.lineJoin = 'round';
        ctx.strokeText(`${Math.round(distPx)} px`, midX, midY - 8 / zoomLevel);
        ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.round(distPx)} px`, midX, midY - 8 / zoomLevel);
      }

      ctx.beginPath();
      ctx.arc(p1.x, p1.y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5 / zoomLevel;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / zoomLevel;
      ctx.beginPath();
      ctx.moveTo(p1.x - dotRadius * 1.5, p1.y);
      ctx.lineTo(p1.x + dotRadius * 1.5, p1.y);
      ctx.moveTo(p1.x, p1.y - dotRadius * 1.5);
      ctx.lineTo(p1.x, p1.y + dotRadius * 1.5);
      ctx.stroke();

      if (p2) {
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5 / zoomLevel;
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 / zoomLevel;
        ctx.beginPath();
        ctx.moveTo(p2.x - dotRadius * 1.5, p2.y);
        ctx.lineTo(p2.x + dotRadius * 1.5, p2.y);
        ctx.moveTo(p2.x, p2.y - dotRadius * 1.5);
        ctx.lineTo(p2.x, p2.y + dotRadius * 1.5);
        ctx.stroke();
      }
    }

    // Export rectangle
    if (exportRect) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2 / zoomLevel;
      ctx.setLineDash([6 / zoomLevel, 4 / zoomLevel]);
      ctx.strokeRect(exportRect.x, exportRect.y, exportRect.width, exportRect.height);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fillRect(exportRect.x, exportRect.y, exportRect.width, exportRect.height);
    }

    ctx.restore();

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Zoom: ${(zoomLevel * 100).toFixed(0)}% | Scale: ${scale.pixelsPerInch.toFixed(2)} px/in${scale.isCalibrated ? ' ✓' : ''} | Mode: ${mode}`,
      12,
      displayH - 12
    );
  }, [floorplanImg, placed, selectedId, scale, viewOffset, zoomLevel, canvasSize, mode, exportRect, showDimensions, calibStep, calibP1, calibP2]);

  useEffect(() => {
    const id = requestAnimationFrame(render);
    return () => cancelAnimationFrame(id);
  }, [render]);

  // ─── Calibration finish ───────────────────────────────────────────────────

  const finishCalibration = useCallback(() => {
    const p1 = calibRef.current.p1;
    const p2 = calibRef.current.p2;
    if (!p1 || !p2) return;
    const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const inches = parseFloat(calibInches);
    if (inches > 0 && dist > 0) {
      setScale({ pixelsPerInch: dist / inches, isCalibrated: true });
    }
    calibRef.current = { step: 0, p1: null, p2: null };
    setCalibStep(0);
    setCalibP1(null);
    setCalibP2(null);
    setMode('select');
  }, [calibInches]);

  // ─── Export handler ───────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (!exportRect || exportRect.width < 5 || exportRect.height < 5) return;

    const exportCanvas = document.createElement('canvas');
    const exportScale = 2;
    exportCanvas.width = exportRect.width * exportScale;
    exportCanvas.height = exportRect.height * exportScale;
    const ctx = exportCanvas.getContext('2d')!;
    ctx.scale(exportScale, exportScale);
    ctx.translate(-exportRect.x, -exportRect.y);

    if (floorplanImg) {
      ctx.drawImage(floorplanImg, 0, 0);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(exportRect.x, exportRect.y, exportRect.width, exportRect.height);
    }

    for (const p of placed) {
      const tmpl = furnitureCatalog.find((f) => f.id === p.templateId);
      if (!tmpl) continue;
      const wPx = tmpl.widthInches * scale.pixelsPerInch;
      const hPx = tmpl.depthInches * scale.pixelsPerInch;

      ctx.save();
      ctx.translate(p.x + wPx / 2, p.y + hPx / 2);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.scale(p.flippedX ? -1 : 1, p.flippedY ? -1 : 1);
      ctx.translate(-wPx / 2, -hPx / 2);

      drawFurnitureShape(ctx, tmpl, wPx, hPx, 0.9);
      drawLabel(ctx, tmpl, wPx, hPx, p.rotation, p.flippedX, p.flippedY);

      ctx.restore();
    }

    try {
      const dataUrl = exportCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `floorplan-export-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
      try {
        const dataUrl = exportCanvas.toDataURL('image/png');
        window.open(dataUrl, '_blank');
      } catch {
        alert('Export failed. The floorplan image may have CORS restrictions.');
      }
    }
  }, [exportRect, floorplanImg, placed, scale]);

  // ─── Filtered furniture ───────────────────────────────────────────────────

  const filteredFurniture = furnitureCatalog.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = !activeCategory || f.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  const groupedFurniture: Record<string, FurnitureTemplate[]> = {};
  for (const f of filteredFurniture) {
    if (!groupedFurniture[f.category]) groupedFurniture[f.category] = [];
    groupedFurniture[f.category].push(f);
  }

  const selectedItem = placed.find((p) => p.instanceId === selectedId);
  const selectedTemplate = selectedItem ? furnitureCatalog.find((f) => f.id === selectedItem.templateId) : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100 text-sm select-none">
      {/* ─── Saved Designs Modal ────────────────────────────────────────────── */}
      {showDesignsPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-blue-600">
              <div>
                <h2 className="text-xl font-bold text-white">Your Designs</h2>
                <p className="text-indigo-200 text-xs mt-0.5">{savedDesigns.length} saved design{savedDesigns.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={startNewDesign}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New Design
                </button>
                <button
                  onClick={() => setShowDesignsPanel(false)}
                  className="p-2 hover:bg-white/20 text-white rounded-lg transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Design cards */}
            <div className="flex-1 overflow-y-auto p-6">
              {savedDesigns.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-20 h-20 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-600 text-lg">No saved designs yet</h3>
                  <p className="text-gray-400 text-sm mt-1">Upload a floorplan to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {savedDesigns.map((design) => (
                    <div
                      key={design.id}
                      className={cn(
                        "group border rounded-xl overflow-hidden hover:shadow-lg transition cursor-pointer",
                        currentDesignId === design.id ? "ring-2 ring-indigo-500 border-indigo-300" : "border-gray-200 hover:border-indigo-300"
                      )}
                      onClick={() => loadDesign(design)}
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
                        {design.thumbnailDataUrl ? (
                          <img
                            src={design.thumbnailDataUrl}
                            alt={design.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-gray-300">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {currentDesignId === design.id && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
                            CURRENT
                          </div>
                        )}
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${design.name}"?`)) {
                              deleteDesign(design.id);
                            }
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      {/* Info */}
                      <div className="p-3">
                        <p className="font-semibold text-gray-800 text-xs truncate">{design.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-gray-400">
                            {design.placed.length} item{design.placed.length !== 1 ? 's' : ''}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {new Date(design.savedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Left sidebar - Furniture palette */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col shadow-lg">
        {/* Logo */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-blue-600">
          <h1 className="text-white font-bold text-lg tracking-tight flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            FloorPlan Planner
          </h1>
          <p className="text-indigo-200 text-xs mt-0.5">Drag & drop furniture placement</p>
        </div>

        {/* Upload + Saved designs */}
        <div className="px-3 py-3 border-b border-gray-100 space-y-2">
          <label className="flex items-center justify-center gap-2 cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-lg py-2.5 px-3 transition border border-indigo-200 border-dashed">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {floorplanImg ? 'Change Floorplan' : 'Upload Floorplan'}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
          {savedDesigns.length > 0 && (
            <button
              onClick={() => setShowDesignsPanel(true)}
              className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-medium rounded-lg py-2 px-3 transition border border-gray-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Saved Designs ({savedDesigns.length})
            </button>
          )}
        </div>

        {/* Auto-save indicator + design name */}
        {hasUploaded && (
          <div className="px-3 py-2 border-b border-gray-100 bg-green-50/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-700 font-medium">Auto-saving</span>
            </div>
            <input
              type="text"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              className="w-full mt-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 text-gray-700 font-medium"
              placeholder="Design name..."
            />
          </div>
        )}

        {/* Tools */}
        <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Tools</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => { setMode('select'); setActiveFurniture(null); setExportRect(null); }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition',
                mode === 'select'
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              Select
            </button>
            <button
              onClick={() => {
                setMode('calibrate');
                calibRef.current = { step: 0, p1: null, p2: null };
                setCalibStep(0);
                setCalibP1(null);
                setCalibP2(null);
                setExportRect(null);
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition',
                mode === 'calibrate'
                  ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Calibrate
            </button>
            <button
              onClick={() => { setMode('export'); setExportRect(null); }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition',
                mode === 'export'
                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <button
              onClick={() => setShowDimensions(!showDimensions)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition',
                showDimensions
                  ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Labels
            </button>
          </div>
        </div>

        {/* Calibration panel */}
        {mode === 'calibrate' && (
          <div className="px-3 py-3 border-b border-gray-100 bg-red-50 space-y-2">
            <p className="text-xs font-semibold text-red-800">📏 Scale Calibration</p>
            {calibStep === 0 && <p className="text-xs text-red-600">Click the first point of a known distance on the floorplan.</p>}
            {calibStep === 1 && <p className="text-xs text-red-600">Click the second point of the known distance.</p>}
            {calibStep === 2 && (
              <div className="space-y-2">
                <p className="text-xs text-red-600">Enter the real-world distance in inches:</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={calibInches}
                    onChange={(e) => setCalibInches(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded border border-red-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="Inches"
                    min="1"
                  />
                  <button
                    onClick={finishCalibration}
                    className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition"
                  >
                    Apply
                  </button>
                </div>
                <p className="text-[10px] text-red-400">Common: Door = 36", Room 10ft = 120"</p>
              </div>
            )}
          </div>
        )}

        {/* Export panel */}
        {mode === 'export' && (
          <div className="px-3 py-3 border-b border-gray-100 bg-emerald-50 space-y-2">
            <p className="text-xs font-semibold text-emerald-800">📐 Export Region</p>
            {!exportRect || exportRect.width < 5 ? (
              <p className="text-xs text-emerald-600">Click and drag on the canvas to select a rectangle region to export.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-emerald-600">
                  Region: {Math.round(exportRect.width)}×{Math.round(exportRect.height)} px
                  {scale.isCalibrated && (
                    <span className="ml-1">
                      ({(exportRect.width / scale.pixelsPerInch / 12).toFixed(1)}×
                      {(exportRect.height / scale.pixelsPerInch / 12).toFixed(1)} ft)
                    </span>
                  )}
                </p>
                <button
                  onClick={handleExport}
                  className="w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PNG
                </button>
                <button
                  onClick={() => setExportRect(null)}
                  className="w-full px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search furniture..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              'px-2 py-1 rounded-md text-[10px] font-medium transition',
              !activeCategory ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={cn(
                'px-2 py-1 rounded-md text-[10px] font-medium transition',
                activeCategory === cat
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Furniture list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {Object.entries(groupedFurniture).map(([category, items]) => (
            <div key={category}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">{category}</p>
              <div className="space-y-0.5">
                {items.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => {
                      setActiveFurniture(tmpl.id);
                      setMode('place');
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition text-left group',
                      activeFurniture === tmpl.id
                        ? 'bg-indigo-100 ring-1 ring-indigo-300'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <div
                      className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center border border-gray-200"
                      style={{ backgroundColor: tmpl.color + '30' }}
                    >
                      <span className="text-sm">{tmpl.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{tmpl.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {tmpl.widthInches}"×{tmpl.depthInches}"
                        <span className="ml-1">
                          ({(tmpl.widthInches / 12).toFixed(1)}×{(tmpl.depthInches / 12).toFixed(1)} ft)
                        </span>
                      </p>
                    </div>
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: tmpl.color }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Center - Canvas */}
      <div className="flex-1 flex flex-col relative">
        {/* Top toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setZoomLevel(Math.max(0.05, zoomLevel / 1.2))}
              className="p-1.5 rounded-md hover:bg-white text-gray-600 transition"
              title="Zoom Out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
            <span className="text-xs font-medium text-gray-600 w-12 text-center">{(zoomLevel * 100).toFixed(0)}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(10, zoomLevel * 1.2))}
              className="p-1.5 rounded-md hover:bg-white text-gray-600 transition"
              title="Zoom In"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => {
                const container = containerRef.current;
                if (container && floorplanImg) {
                  const fitZoom = Math.min(
                    (container.clientWidth - 40) / floorplanImg.width,
                    (container.clientHeight - 40) / floorplanImg.height,
                    1
                  );
                  setZoomLevel(fitZoom);
                  setViewOffset({ x: 20, y: 20 });
                }
              }}
              className="p-1.5 rounded-md hover:bg-white text-gray-600 transition"
              title="Fit to View"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>

          <div className="h-5 w-px bg-gray-200" />

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={cn('px-2 py-1 rounded', scale.isCalibrated ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>
              {scale.isCalibrated ? `✓ ${scale.pixelsPerInch.toFixed(2)} px/in` : '⚠ Not calibrated'}
            </span>
          </div>

          <div className="flex-1" />

          {mode === 'place' && activeFurniture && (
            <div className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-medium">
              <span>Click on canvas to place: {furnitureCatalog.find(f => f.id === activeFurniture)?.name}</span>
              <button onClick={() => { setMode('select'); setActiveFurniture(null); }} className="text-indigo-400 hover:text-indigo-600">✕</button>
            </div>
          )}
          {mode === 'calibrate' && (
            <div className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-medium">
              📏 Calibrating - click two points of a known distance
            </div>
          )}
          {mode === 'export' && (
            <div className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium">
              📐 Export - drag to select region
            </div>
          )}

          <div className="h-5 w-px bg-gray-200" />
          <span className="text-[10px] text-gray-400">{placed.length} items</span>
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          style={{
            cursor:
              mode === 'place'
                ? 'crosshair'
                : mode === 'calibrate'
                  ? 'crosshair'
                  : mode === 'export'
                    ? 'crosshair'
                    : dragRef.current.isDragging
                      ? 'grabbing'
                      : 'default',
          }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />

          {/* Empty state */}
          {!floorplanImg && placed.length === 0 && !showDesignsPanel && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-3 bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-gray-200">
                <div className="w-16 h-16 mx-auto bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Upload a Floorplan</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs">
                    Upload a floorplan image, calibrate the scale, then drag and drop furniture to plan your space.
                  </p>
                </div>
                <div className="text-[10px] text-gray-400 space-y-0.5">
                  <p>1. Upload floorplan image</p>
                  <p>2. Calibrate scale (click two known points)</p>
                  <p>3. Place furniture from the sidebar</p>
                  <p>4. Export a region as PNG</p>
                </div>
                {savedDesigns.length > 0 && (
                  <button
                    onClick={() => setShowDesignsPanel(true)}
                    className="pointer-events-auto mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
                  >
                    Open Saved Designs ({savedDesigns.length})
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar - Properties */}
      <div className="w-64 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col shadow-lg">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-bold text-gray-800 text-sm">Properties</h2>
        </div>

        {selectedItem && selectedTemplate ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                  style={{ backgroundColor: selectedTemplate.color + '30' }}
                >
                  {selectedTemplate.icon}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-xs">{selectedTemplate.name}</p>
                  <p className="text-[10px] text-gray-400">{selectedTemplate.category}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Dimensions</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">Width:</span>
                    <span className="ml-1 font-medium text-gray-700">{selectedTemplate.widthInches}"</span>
                    <span className="text-gray-400 ml-0.5">({(selectedTemplate.widthInches / 12).toFixed(1)}ft)</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Depth:</span>
                    <span className="ml-1 font-medium text-gray-700">{selectedTemplate.depthInches}"</span>
                    <span className="text-gray-400 ml-0.5">({(selectedTemplate.depthInches / 12).toFixed(1)}ft)</span>
                  </div>
                </div>
                {selectedTemplate.shape !== 'rect' && selectedTemplate.shape !== 'circle' && (
                  <p className="text-[10px] text-gray-400">Shape: {selectedTemplate.shape.toUpperCase()}-shaped</p>
                )}
              </div>
            </div>

            <div className="px-4 py-3 border-b border-gray-100 space-y-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Transform</p>

              <div className="space-y-1">
                <label className="text-xs text-gray-600">Rotation: {selectedItem.rotation}°</label>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="15"
                  value={selectedItem.rotation}
                  onChange={(e) => {
                    const rot = parseInt(e.target.value);
                    setPlaced((prev) =>
                      prev.map((p) => (p.instanceId === selectedId ? { ...p, rotation: rot } : p))
                    );
                  }}
                  className="w-full accent-indigo-500"
                />
                <div className="flex gap-1">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      onClick={() =>
                        setPlaced((prev) =>
                          prev.map((p) =>
                            p.instanceId === selectedId ? { ...p, rotation: deg } : p
                          )
                        )
                      }
                      className={cn(
                        'flex-1 py-1 text-[10px] rounded font-medium transition',
                        selectedItem.rotation === deg
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      )}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setPlaced((prev) =>
                      prev.map((p) =>
                        p.instanceId === selectedId ? { ...p, flippedX: !p.flippedX } : p
                      )
                    )
                  }
                  className={cn(
                    'flex-1 py-2 text-xs rounded-lg font-medium transition',
                    selectedItem.flippedX
                      ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  )}
                >
                  ↔ Flip H
                </button>
                <button
                  onClick={() =>
                    setPlaced((prev) =>
                      prev.map((p) =>
                        p.instanceId === selectedId ? { ...p, flippedY: !p.flippedY } : p
                      )
                    )
                  }
                  className={cn(
                    'flex-1 py-2 text-xs rounded-lg font-medium transition',
                    selectedItem.flippedY
                      ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  )}
                >
                  ↕ Flip V
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-600">Position</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedItem.x)}
                      onChange={(e) => {
                        const x = parseFloat(e.target.value) || 0;
                        setPlaced((prev) =>
                          prev.map((p) => (p.instanceId === selectedId ? { ...p, x } : p))
                        );
                      }}
                      className="w-full px-2 py-1 rounded border border-gray-200 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedItem.y)}
                      onChange={(e) => {
                        const y = parseFloat(e.target.value) || 0;
                        setPlaced((prev) =>
                          prev.map((p) => (p.instanceId === selectedId ? { ...p, y } : p))
                        );
                      }}
                      className="w-full px-2 py-1 rounded border border-gray-200 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Actions</p>
              <button
                onClick={() => {
                  const item = placed.find((p) => p.instanceId === selectedId);
                  if (item) {
                    const tmpl = furnitureCatalog.find((f) => f.id === item.templateId);
                    const offset = tmpl ? tmpl.widthInches * scale.pixelsPerInch * 0.2 : 20;
                    const newItem: PlacedFurniture = {
                      ...item,
                      instanceId: genId(),
                      x: item.x + offset,
                      y: item.y + offset,
                    };
                    setPlaced((prev) => [...prev, newItem]);
                    setSelectedId(newItem.instanceId);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Duplicate (D)
              </button>
              <button
                onClick={() => {
                  setPlaced((prev) => {
                    const idx = prev.findIndex((p) => p.instanceId === selectedId);
                    if (idx < prev.length - 1) {
                      const newArr = [...prev];
                      [newArr[idx], newArr[idx + 1]] = [newArr[idx + 1], newArr[idx]];
                      return newArr;
                    }
                    return prev;
                  });
                }}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
                Bring Forward
              </button>
              <button
                onClick={() => {
                  setPlaced((prev) => {
                    const idx = prev.findIndex((p) => p.instanceId === selectedId);
                    if (idx > 0) {
                      const newArr = [...prev];
                      [newArr[idx], newArr[idx - 1]] = [newArr[idx - 1], newArr[idx]];
                      return newArr;
                    }
                    return prev;
                  });
                }}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                Send Backward
              </button>
              <button
                onClick={() => {
                  setPlaced((prev) => prev.filter((p) => p.instanceId !== selectedId));
                  setSelectedId(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete (Del)
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-4 flex-1">
              <div className="text-center text-gray-400 py-6">
                <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs">Select a furniture item to see its properties</p>
              </div>

              <div className="space-y-2 mt-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Keyboard Shortcuts</p>
                <div className="space-y-1.5">
                  {[
                    ['R', 'Rotate 90°'],
                    ['F', 'Flip horizontal'],
                    ['D', 'Duplicate item'],
                    ['Del', 'Delete item'],
                    ['Esc', 'Cancel / Deselect'],
                    ['Scroll', 'Zoom in/out'],
                    ['Drag bg', 'Pan view'],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-center gap-2">
                      <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-600 border border-gray-200 min-w-[32px] text-center">
                        {key}
                      </kbd>
                      <span className="text-[11px] text-gray-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {placed.length > 0 && (
              <div className="border-t border-gray-100">
                <div className="px-4 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Placed Items ({placed.length})
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-0.5">
                  {placed.map((p) => {
                    const tmpl = furnitureCatalog.find((f) => f.id === p.templateId);
                    if (!tmpl) return null;
                    return (
                      <button
                        key={p.instanceId}
                        onClick={() => { setSelectedId(p.instanceId); setMode('select'); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition',
                          selectedId === p.instanceId
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'hover:bg-gray-50 text-gray-600'
                        )}
                      >
                        <span>{tmpl.icon}</span>
                        <span className="truncate flex-1">{tmpl.name}</span>
                        <span className="text-[10px] text-gray-400">{p.rotation}°</span>
                      </button>
                    );
                  })}
                </div>
                <div className="px-3 pb-2">
                  <button
                    onClick={() => {
                      if (confirm('Remove all placed furniture?')) {
                        setPlaced([]);
                        setSelectedId(null);
                      }
                    }}
                    className="w-full py-1.5 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
