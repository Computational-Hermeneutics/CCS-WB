'use client';

import { CCSCard, CCSCardButton } from './CCSCard';
import { LEARN_METHODS_WELCOME } from '@/lib/ccs-content';

interface WelcomeCardProps {
  onDismiss: () => void;
  onLearnMore?: () => void;
}

export function WelcomeCard({ onDismiss, onLearnMore }: WelcomeCardProps) {
  return (
    <CCSCard
      title={LEARN_METHODS_WELCOME.title}
      icon={LEARN_METHODS_WELCOME.icon}
      onDismiss={onDismiss}
      className="mb-4"
    >
      <div className="space-y-4">
        <p className="leading-relaxed">{LEARN_METHODS_WELCOME.content}</p>

        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Getting Started:</p>
          <ul className="space-y-1.5 ml-4">
            {LEARN_METHODS_WELCOME.gettingStarted.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-blue-500 dark:text-blue-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
          <p className="text-xs text-blue-900 dark:text-blue-100">
            <span className="font-semibold">💡 Tip:</span> {LEARN_METHODS_WELCOME.tip}
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          {onLearnMore && (
            <CCSCardButton onClick={onLearnMore} variant="primary">
              Tell me more about CCS
            </CCSCardButton>
          )}
          <CCSCardButton onClick={onDismiss}>
            Got it
          </CCSCardButton>
        </div>
      </div>
    </CCSCard>
  );
}
