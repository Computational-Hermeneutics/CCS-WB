'use client';

import React from 'react';
import { WelcomeCard } from './WelcomeCard';
import { MethodCard } from './MethodCard';
import { AnnotationTypeCard } from './AnnotationTypeCard';
import { SmartHint } from './SmartHint';
import { useCCSGuidance } from '@/hooks/useCCSGuidance';
import type { CCSMethod } from '@/lib/ccs-content';

interface CCSGuidancePanelProps {
  isEnabled: boolean; // Only show when in Learn Methods mode
  annotationCount?: number;
  hasOnlyTechnicalAnnotations?: boolean;
  onInvokeCCSSkill?: (method: CCSMethod) => void;
}

export function CCSGuidancePanel({
  isEnabled,
  annotationCount = 0,
  hasOnlyTechnicalAnnotations = false,
  onInvokeCCSSkill
}: CCSGuidancePanelProps) {
  const {
    visibleCards,
    currentHint,
    showCard,
    dismissCard,
    trackActivity,
    updateAnnotationMetrics,
    dismissHint
  } = useCCSGuidance(isEnabled);

  // Update annotation metrics when they change
  React.useEffect(() => {
    updateAnnotationMetrics(annotationCount, hasOnlyTechnicalAnnotations);
  }, [annotationCount, hasOnlyTechnicalAnnotations, updateAnnotationMetrics]);

  // Don't render anything if not enabled
  if (!isEnabled) return null;

  const handleLearnMore = () => {
    // Could show a more detailed introduction or invoke CCS skill for overview
    dismissCard('welcome');
    showCard('methods');
  };

  const handleGuideMe = (method: CCSMethod) => {
    if (onInvokeCCSSkill) {
      onInvokeCCSSkill(method);
    }
    trackActivity();
  };

  return (
    <>
      {/* Cards container - appears at top of chat panel */}
      <div className="px-3 py-3 space-y-3 border-b border-parchment bg-cream/20">
        {visibleCards.has('welcome') && (
          <WelcomeCard
            onDismiss={() => dismissCard('welcome')}
            onLearnMore={handleLearnMore}
          />
        )}

        {visibleCards.has('methods') && (
          <MethodCard
            onDismiss={() => dismissCard('methods')}
            onGuideMe={handleGuideMe}
          />
        )}

        {visibleCards.has('annotation-types') && (
          <AnnotationTypeCard
            onDismiss={() => dismissCard('annotation-types')}
          />
        )}

        {/* Quick access buttons to show dismissed cards */}
        {!visibleCards.has('welcome') && !visibleCards.has('methods') && !visibleCards.has('annotation-types') && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => showCard('methods')}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              📖 Show Methods
            </button>
            <button
              onClick={() => showCard('annotation-types')}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              📍 Annotation Guide
            </button>
          </div>
        )}
      </div>

      {/* Smart hints - appear as floating notifications */}
      {currentHint && (
        <SmartHint
          message={currentHint}
          onDismiss={dismissHint}
        />
      )}
    </>
  );
}
