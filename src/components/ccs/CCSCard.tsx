'use client';

import { useState } from 'react';
import { X, Minimize2, Maximize2 } from 'lucide-react';

interface CCSCardProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  defaultMinimized?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function CCSCard({
  title,
  icon,
  children,
  defaultMinimized = false,
  onDismiss,
  className = ''
}: CCSCardProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);

  return (
    <div className={`border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg bg-white dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? (
              <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <Minimize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          {children}
        </div>
      )}
    </div>
  );
}

interface CCSCardButtonProps {
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export function CCSCardButton({ onClick, variant = 'secondary', children }: CCSCardButtonProps) {
  const baseClasses = "px-3 py-1.5 rounded text-xs font-medium transition-colors";
  const variantClasses = variant === 'primary'
    ? "bg-blue-600 hover:bg-blue-700 text-white"
    : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300";

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses}`}
    >
      {children}
    </button>
  );
}
