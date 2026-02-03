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
  isMinimized?: boolean;
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
  const [position, setPosition] = useState({ x: 20, y: 80 }); // Initial position (top-right area)
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); // Local collapse state for content
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Event handlers - defined as regular functions
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !panelRef.current) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Constrain to viewport
    const maxX = window.innerWidth - panelRef.current.offsetWidth;
    const maxY = window.innerHeight - panelRef.current.offsetHeight;

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

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

  // Set up global mouse event listeners for dragging
  // Only set up/tear down when isDragging changes, not on every mouse move
  useEffect(() => {
    if (!isDragging) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  // Don't render if not enabled
  if (!isEnabled) return null;

  return (
    <div
      ref={panelRef}
      className={`fixed bg-popover border border-parchment rounded-lg shadow-xl z-40 transition-all duration-300 ${
        isAnimating ? 'opacity-0 scale-50' : 'opacity-100 scale-100'
      } ${isMinimized ? 'hidden' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isCollapsed ? '240px' : '420px',
        maxHeight: '80vh',
        cursor: isDragging ? 'grabbing' : 'default',
        transformOrigin: 'top right' // Shrink toward top-right (toolbar area)
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
          onClick={() => {
            if (isCollapsed) {
              setIsCollapsed(false);
            } else {
              // Minimize to toolbar - trigger animation and then call parent
              setIsAnimating(true);
              setTimeout(() => {
                onMinimize?.(true);
                setIsAnimating(false);
              }, 300); // Match animation duration
            }
          }}
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
