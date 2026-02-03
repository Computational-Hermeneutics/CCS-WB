'use client';

import { useState, useEffect, useCallback } from 'react';

export type CCSCardType = 'welcome' | 'methods' | 'annotation-types' | 'hint';

interface CCSGuidanceState {
  // Visible cards
  visibleCards: Set<CCSCardType>;

  // Dismissed cards (won't show again this session)
  dismissedCards: Set<CCSCardType>;

  // Current hint message (if any)
  currentHint: string | null;

  // User activity tracking for smart hints
  lastActivityTime: number;
  annotationCount: number;
  hasOnlyTechnicalAnnotations: boolean;
}

export function useCCSGuidance(isLearnMethodsMode: boolean) {
  const [state, setState] = useState<CCSGuidanceState>({
    visibleCards: new Set(),
    dismissedCards: new Set(),
    currentHint: null,
    lastActivityTime: Date.now(),
    annotationCount: 0,
    hasOnlyTechnicalAnnotations: false
  });

  // Show welcome card when entering Learn Methods mode
  useEffect(() => {
    if (isLearnMethodsMode) {
      setState(prev => {
        // Only add welcome card if not already visible and not dismissed
        if (!prev.visibleCards.has('welcome') && !prev.dismissedCards.has('welcome')) {
          return {
            ...prev,
            visibleCards: new Set([...prev.visibleCards, 'welcome'])
          };
        }
        return prev;
      });
    }
  }, [isLearnMethodsMode]);

  // Show card
  const showCard = useCallback((cardType: CCSCardType) => {
    setState(prev => ({
      ...prev,
      visibleCards: new Set([...prev.visibleCards, cardType])
    }));
  }, []);

  // Dismiss card
  const dismissCard = useCallback((cardType: CCSCardType) => {
    setState(prev => {
      const newVisibleCards = new Set(prev.visibleCards);
      newVisibleCards.delete(cardType);

      return {
        ...prev,
        visibleCards: newVisibleCards,
        dismissedCards: new Set([...prev.dismissedCards, cardType])
      };
    });
  }, []);

  // Track user activity for smart hints
  const trackActivity = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastActivityTime: Date.now()
    }));
  }, []);

  // Update annotation metrics
  const updateAnnotationMetrics = useCallback((count: number, onlyTechnical: boolean) => {
    setState(prev => ({
      ...prev,
      annotationCount: count,
      hasOnlyTechnicalAnnotations: onlyTechnical
    }));
  }, []);

  // Show hint
  const showHint = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      currentHint: message
    }));
  }, []);

  // Dismiss hint
  const dismissHint = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentHint: null
    }));
  }, []);

  // Smart hint detection (runs periodically if in Learn Methods mode)
  useEffect(() => {
    if (!isLearnMethodsMode) return;

    const checkForHints = () => {
      setState(prev => {
        const timeSinceActivity = Date.now() - prev.lastActivityTime;
        const TWO_MINUTES = 2 * 60 * 1000;

        // Hint: User seems stuck (no activity for 2 minutes)
        if (timeSinceActivity > TWO_MINUTES && prev.annotationCount === 0 && !prev.currentHint) {
          return {
            ...prev,
            currentHint: "💡 Try adding an annotation to mark an interesting moment in the code. Click on a line number to get started."
          };
        }

        // Hint: User has only technical annotations (suggest expanding perspective)
        if (prev.annotationCount >= 3 && prev.hasOnlyTechnicalAnnotations && !prev.currentHint) {
          return {
            ...prev,
            currentHint: "📚 You've marked several technical details. Ready to explore their cultural or theoretical significance?"
          };
        }

        // Hint: User has good annotations but hasn't explored methods
        if (prev.annotationCount >= 5 && prev.dismissedCards.has('methods') && !prev.currentHint) {
          return {
            ...prev,
            currentHint: "📖 You're building a rich analysis! Consider reviewing the CCS Reading Methods for additional perspectives."
          };
        }

        return prev;
      });
    };

    const interval = setInterval(checkForHints, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [isLearnMethodsMode]);

  return {
    // State
    visibleCards: state.visibleCards,
    currentHint: state.currentHint,

    // Card actions
    showCard,
    dismissCard,

    // Activity tracking
    trackActivity,
    updateAnnotationMetrics,

    // Hint actions
    showHint,
    dismissHint
  };
}
