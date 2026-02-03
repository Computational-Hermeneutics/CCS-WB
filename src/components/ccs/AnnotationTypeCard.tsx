'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CCSCard } from './CCSCard';
import { ANNOTATION_TYPE_GUIDES } from '@/lib/ccs-content';

interface AnnotationTypeCardProps {
  onDismiss: () => void;
  highlightType?: string; // Optionally highlight a specific type
}

export function AnnotationTypeCard({ onDismiss, highlightType }: AnnotationTypeCardProps) {
  const [expandedType, setExpandedType] = useState<string | null>(highlightType || null);

  const toggleType = (type: string) => {
    setExpandedType(expandedType === type ? null : type);
  };

  return (
    <CCSCard
      title="Annotation Type Guide"
      icon="📍"
      onDismiss={onDismiss}
      defaultMinimized={false}
      className="mb-4"
    >
      <p className="text-xs mb-3 text-gray-600 dark:text-gray-400">
        Choose annotation types strategically to mark different kinds of significance in code.
      </p>

      <div className="space-y-2">
        {ANNOTATION_TYPE_GUIDES.map((guide) => {
          const isHighlighted = highlightType === guide.type;

          return (
            <div
              key={guide.type}
              className={`border rounded ${
                isHighlighted
                  ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Type Header */}
              <button
                onClick={() => toggleType(guide.type)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors rounded"
              >
                <div className="flex items-center gap-2 text-left">
                  <span className="text-base">{guide.icon}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-xs">
                    {guide.type}
                  </span>
                </div>
                {expandedType === guide.type ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {/* Type Details */}
              {expandedType === guide.type && (
                <div className="px-3 py-3 space-y-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                  <p className="text-xs leading-relaxed">{guide.description}</p>

                  <div>
                    <p className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1">
                      When to use:
                    </p>
                    <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-400">
                      {guide.whenToUse}
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1">
                      Example questions:
                    </p>
                    <ul className="space-y-1 text-xs">
                      {guide.exampleQuestions.map((question, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-500 dark:text-blue-400 mt-0.5">•</span>
                          <span className="italic text-gray-700 dark:text-gray-400">{question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CCSCard>
  );
}
