'use client';

import {
  useStoreActions,
  useStoreBrushMode,
  useStoreBrushSize,
  useStoreCurrentColor,
  useStoreLabel,
  useStoreViewport,
} from '@/hooks/use-store';
import {
  angleBetween,
  distanceBetween,
  getAnnotationTypeFromColor,
} from '@/lib/utils';
import { Sprite } from '@pixi/react';
import { nanoid } from 'nanoid';
import * as PIXI from 'pixi.js';
import React, { useEffect, useMemo, useRef } from 'react';

type AnnotationProps = {
  height: number;
  width: number;
};

const useCanvas = ({ height, width }: AnnotationProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let canvas = canvasRef.current;
    canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    canvasRef.current = canvas;

    return () => {
      canvas?.remove();
      canvasRef.current?.remove();
      canvasRef.current = null;
    };
  }, [height, width]);
  return canvasRef;
};

const Annotation = (props: AnnotationProps) => {
  const canvasRef = useCanvas({ height: props.height, width: props.width });

  const color = useStoreCurrentColor();
  const label = useStoreLabel();
  const brushMode = useStoreBrushMode();
  const { addAnnotation, removeAnnotation, setLabel } = useStoreActions();

  const canvas = canvasRef.current;
  const context = canvas?.getContext('2d');
  const sprite = useMemo(
    () => PIXI.Sprite.from(canvas ?? PIXI.Texture.EMPTY),
    [canvas],
  );

  useEffect(() => {
    if (!context) return;
    const img = new Image();
    img.src = label;
    img.onload = () => {
      context.clearRect(0, 0, props.width, props.height);
      context.drawImage(img, 0, 0);
      sprite.texture.update();
    };
  }, [label, context, sprite.texture, props.width, props.height]);

  const prevPosition = useRef<PIXI.Point | null>(null);
  const currPosition = useRef<PIXI.Point | null>(null);

  const brushSize = useStoreBrushSize();

  const viewport = useStoreViewport();

  const [isPainting, setIsPainting] = React.useState(false);

  useEffect(() => {
    const onPointerDown = (e: PIXI.FederatedPointerEvent) => {
      if (!context) return;
      context.fillStyle = color;
      if (e.pointerType === 'mouse') {
        // only draw on left click
        if (e.button !== 0) return;
      }
      // disable drag on mobile touch
      else if (e.pointerType === 'touch') {
        viewport?.plugins.pause('drag');
      }
      setIsPainting(true);
      const pos = viewport?.toWorld(e.global) ?? e.global;
      prevPosition.current = pos;

      const x = Math.round(prevPosition.current.x - brushSize / 2);
      const y = Math.round(prevPosition.current.y - brushSize / 2);
      if (brushMode === 'eraser') {
        context.clearRect(x, y, brushSize, brushSize);
        for (let i = 0; i < brushSize; i++) {
          for (let j = 0; j < brushSize; j++) {
            removeAnnotation({ x: x + i, y: y + j });
          }
        }
      } else if (brushMode === 'pen') {
        context.fillRect(x, y, brushSize, brushSize);
        addAnnotation({
          distance: -1,
          id: nanoid(),
          type: getAnnotationTypeFromColor(color),
          x,
          y,
        });
      }
      sprite.texture.update();
    };

    const onPointerMove = (e: PIXI.FederatedPointerEvent) => {
      const pos = viewport?.toWorld(e.global) ?? e.global;
      currPosition.current = pos;
      if (!context) return;
      if (!prevPosition.current) return;
      if (isPainting) {
        const dist = distanceBetween(
          prevPosition.current,
          currPosition.current,
        );
        const angle = angleBetween(prevPosition.current, currPosition.current);
        for (let i = 0; i < dist; i++) {
          const x = Math.round(
            prevPosition.current.x + Math.sin(angle) * i - brushSize / 2,
          );
          const y = Math.round(
            prevPosition.current.y + Math.cos(angle) * i - brushSize / 2,
          );
          if (brushMode === 'eraser') {
            context.clearRect(x, y, brushSize, brushSize);
            for (let i = 0; i < brushSize; i++) {
              for (let j = 0; j < brushSize; j++) {
                removeAnnotation({ x: x + i, y: y + j });
              }
            }
          } else if (brushMode === 'pen') {
            context.fillRect(x, y, brushSize, brushSize);
            addAnnotation({
              distance: -1,
              id: nanoid(),
              type: getAnnotationTypeFromColor(color),
              x,
              y,
            });
          }
        }
        sprite.texture.update();
        prevPosition.current = currPosition.current;
      }
    };

    const onPointerUp = (e: PIXI.FederatedPointerEvent) => {
      if (!canvas) return;
      viewport?.plugins.resume('drag');
      setIsPainting(false);
      setLabel(canvas.toDataURL());
    };
    viewport?.on('pointerdown', onPointerDown);
    viewport?.on('pointerup', onPointerUp);
    viewport?.on('pointermove', onPointerMove);
    return () => {
      viewport?.off('pointerdown', onPointerDown);
      viewport?.off('pointerup', onPointerUp);
      viewport?.off('pointermove', onPointerMove);
    };
  }, [
    addAnnotation,
    brushMode,
    brushSize,
    canvas,
    color,
    context,
    isPainting,
    props.height,
    props.width,
    removeAnnotation,
    setLabel,
    sprite.texture,
    viewport,
  ]);

  return (
    <Sprite blendMode={PIXI.BLEND_MODES.OVERLAY} texture={sprite.texture} />
  );
};

export default Annotation;
