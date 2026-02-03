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
      const timeSinceActivity = Date.now() - state.lastActivityTime;
      const TWO_MINUTES = 2 * 60 * 1000;

      // Hint: User seems stuck (no activity for 2 minutes)
      if (timeSinceActivity > TWO_MINUTES && state.annotationCount === 0) {
        showHint("💡 Try adding an annotation to mark an interesting moment in the code. Click on a line number to get started.");
        return;
      }

      // Hint: User has only technical annotations (suggest expanding perspective)
      if (state.annotationCount >= 3 && state.hasOnlyTechnicalAnnotations) {
        showHint("📚 You've marked several technical details. Ready to explore their cultural or theoretical significance?");
        return;
      }

      // Hint: User has good annotations but hasn't explored methods
      if (state.annotationCount >= 5 && state.dismissedCards.has('methods')) {
        showHint("📖 You're building a rich analysis! Consider reviewing the CCS Reading Methods for additional perspectives.");
        return;
      }
    };

    const interval = setInterval(checkForHints, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [isLearnMethodsMode, state, showHint]);

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
