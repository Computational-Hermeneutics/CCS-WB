'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { CCSCard, CCSCardButton } from './CCSCard';
import { CCS_METHODS, type CCSMethod } from '@/lib/ccs-content';

interface MethodCardProps {
  onDismiss: () => void;
  onGuideMe?: (method: CCSMethod) => void;
}

export function MethodCard({ onDismiss, onGuideMe }: MethodCardProps) {
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);

  const toggleMethod = (methodId: string) => {
    setExpandedMethod(expandedMethod === methodId ? null : methodId);
  };

  return (
    <CCSCard
      title="CCS Reading Methods"
      icon="📖"
      onDismiss={onDismiss}
      defaultMinimized={false}
      className="mb-4"
    >
      <div className="space-y-2">
        {CCS_METHODS.map((method, index) => (
          <div key={method.id} className="border border-gray-200 dark:border-gray-700 rounded">
            {/* Method Header */}
            <button
              onClick={() => toggleMethod(method.id)}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors rounded"
            >
              <div className="flex items-center gap-2 text-left">
                <span className="font-semibold text-gray-900 dark:text-gray-100 text-xs">
                  {index + 1}. {method.name}
                </span>
              </div>
              {expandedMethod === method.id ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {/* Method Details */}
            {expandedMethod === method.id && (
              <div className="px-3 py-3 space-y-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                <p className="text-xs leading-relaxed italic text-gray-700 dark:text-gray-400">
                  {method.shortDescription}
                </p>

                <div>
                  <p className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1">
                    Definition:
                  </p>
                  <p className="text-xs leading-relaxed">{method.definition}</p>
                </div>

                <div>
                  <p className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1">
                    Key Questions:
                  </p>
                  <ul className="space-y-1 text-xs">
                    {method.keyQuestions.map((question, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-500 dark:text-blue-400 mt-0.5">•</span>
                        <span>{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1">
                    Suggested Readings:
                  </p>
                  <ul className="space-y-1 text-xs">
                    {method.suggestedReadings.map((reading, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <BookOpen className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <span className="italic">{reading.title}</span>
                          {' — '}
                          <span className="text-gray-600 dark:text-gray-400">
                            {reading.author}
                            {reading.year && ` (${reading.year})`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {method.exampleSample && (
                  <div className="pt-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-semibold">Example Sample:</span> {method.exampleSample}
                  </div>
                )}

                {onGuideMe && (
                  <div className="pt-2">
                    <CCSCardButton onClick={() => onGuideMe(method)} variant="primary">
                      Guide me through this method
                    </CCSCardButton>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </CCSCard>
  );
}
