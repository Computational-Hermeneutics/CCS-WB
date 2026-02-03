'use client';

import { X } from 'lucide-react';

interface SmartHintProps {
  message: string;
  onDismiss: () => void;
}

export function SmartHint({ message, onDismiss }: SmartHintProps) {
  return (
    <div className="fixed bottom-4 right-4 max-w-sm z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-blue-600 text-white rounded-lg shadow-xl p-4 pr-10 relative">
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 hover:bg-blue-700 rounded transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
        <p className="text-sm leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
