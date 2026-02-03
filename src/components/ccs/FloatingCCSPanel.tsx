'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GripVertical, Minimize2, Maximize2 } from 'lucide-react';
import { CCSGuidancePanel } from './CCSGuidancePanel';
import type { CCSMethod } from '@/lib/ccs-content';

interface FloatingCCSPanelProps {
  isEnabled: boolean;
  annotationCount?: number;
  hasOnlyTechnicalAnnotations?: boolean;
  onInvokeCCSSkill?: (method: CCSMethod) => void;
}

export function FloatingCCSPanel({
  isEnabled,
  annotationCount = 0,
  hasOnlyTechnicalAnnotations = false,
  onInvokeCCSSkill
}: FloatingCCSPanelProps) {
  const [position, setPosition] = useState({ x: 20, y: 80 }); // Initial position (top-right area)
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Don't render if not enabled
  if (!isEnabled) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start drag if clicking on the drag handle area (not buttons)
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      setIsDragging(true);
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && panelRef.current) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Constrain to viewport
      const maxX = window.innerWidth - panelRef.current.offsetWidth;
      const maxY = window.innerHeight - panelRef.current.offsetHeight;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Set up global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  return (
    <div
      ref={panelRef}
      className="fixed bg-popover border border-parchment rounded-lg shadow-xl z-40"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isMinimized ? '240px' : '420px',
        maxHeight: '80vh',
        cursor: isDragging ? 'grabbing' : 'default'
      }}
    >
      {/* Drag handle header */}
      <div
        data-drag-handle
        className="flex items-center justify-between px-3 py-2 border-b border-parchment bg-cream/50 rounded-t-lg cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-slate-muted" />
          <span className="font-sans text-xs font-semibold text-ink">CCS Methods Guide</span>
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 hover:bg-cream rounded transition-colors"
          title={isMinimized ? 'Expand' : 'Minimize'}
        >
          {isMinimized ? (
            <Maximize2 className="w-3.5 h-3.5 text-slate-muted" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5 text-slate-muted" />
          )}
        </button>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="overflow-y-auto max-h-[calc(80vh-3rem)]">
          <CCSGuidancePanel
            isEnabled={isEnabled}
            annotationCount={annotationCount}
            hasOnlyTechnicalAnnotations={hasOnlyTechnicalAnnotations}
            onInvokeCCSSkill={onInvokeCCSSkill}
          />
        </div>
      )}
    </div>
  );
}
