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
  aiEnabled?: boolean;
  isMinimized?: boolean; // Parent-controlled: hides panel to toolbar
  onMinimize?: (minimized: boolean) => void;
}

export function FloatingCCSPanel({
  isEnabled,
  annotationCount = 0,
  hasOnlyTechnicalAnnotations = false,
  onInvokeCCSSkill,
  aiEnabled = true,
  isMinimized = false,
  onMinimize
}: FloatingCCSPanelProps) {
  // Position state (only updated when drag ends)
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isCollapsed, setIsCollapsed] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ isDragging: false, startX: 0, startY: 0 });

  // Drag handlers using refs and direct DOM manipulation (no React re-renders during drag)
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;

      const newX = e.clientX - dragStateRef.current.startX;
      const newY = e.clientY - dragStateRef.current.startY;
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;

      const constrainedX = Math.max(0, Math.min(newX, maxX));
      const constrainedY = Math.max(0, Math.min(newY, maxY));

      // Update DOM directly during drag (no React re-render)
      panel.style.transform = `translate(${constrainedX}px, ${constrainedY}px)`;
    };

    const handleMouseUp = () => {
      if (!dragStateRef.current.isDragging) return;

      dragStateRef.current.isDragging = false;
      panel.style.cursor = 'default';

      // Extract final position from transform and update React state
      const transform = panel.style.transform;
      const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
      if (match) {
        setPosition({ x: parseFloat(match[1]), y: parseFloat(match[2]) });
      }

      // Clear transform so position state takes over
      panel.style.transform = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Don't render if not enabled
  if (!isEnabled) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      dragStateRef.current = {
        isDragging: true,
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top
      };

      panel.style.cursor = 'grabbing';
    }
  };

  const handleMinimizeClick = () => {
    if (isCollapsed) {
      // Expand content
      setIsCollapsed(false);
    } else {
      // Minimize to toolbar - just call parent immediately
      onMinimize?.(true);
    }
  };

  return (
    <div
      ref={panelRef}
      className={`fixed bg-popover border border-parchment rounded-lg shadow-xl z-40 transition-all duration-300 ${
        isMinimized ? 'opacity-0 scale-50 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isCollapsed ? '240px' : '420px',
        maxHeight: '80vh',
        transformOrigin: 'top right'
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
          onClick={handleMinimizeClick}
          className="p-1 hover:bg-cream rounded transition-colors"
          title={isCollapsed ? 'Expand content' : 'Minimize to toolbar'}
        >
          {isCollapsed ? (
            <Maximize2 className="w-3.5 h-3.5 text-slate-muted" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5 text-slate-muted" />
          )}
        </button>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="overflow-y-auto max-h-[calc(80vh-3rem)]">
          <CCSGuidancePanel
            isEnabled={isEnabled}
            annotationCount={annotationCount}
            hasOnlyTechnicalAnnotations={hasOnlyTechnicalAnnotations}
            onInvokeCCSSkill={onInvokeCCSSkill}
            aiEnabled={aiEnabled}
          />
        </div>
      )}
    </div>
  );
}
