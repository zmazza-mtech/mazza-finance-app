import { useState } from 'react';
import { RecurringInstanceMenu } from './RecurringInstanceMenu';
import { OccurrenceEditModal, type EditableInstance } from './OccurrenceEditModal';
import { EditSeriesModal } from '@/components/recurring/EditSeriesModal';
import { useRecurring, useCreateOverride, useUpdateRecurring } from '@/hooks/useRecurring';

interface RecurringInstanceEditorProps {
  instance: EditableInstance;
  accountId: string;
  onClose: () => void;
}

/** Which of the two edits the user picked, and how far through it they are. */
type Step = 'choose' | 'occurrence' | 'confirm-all-future' | 'series';

/**
 * Drives the two edits a forecast instance offers, and owns the writes.
 *
 * "This occurrence" writes a single-instance override against the series and
 * date the row came from. "This and all future" edits the series itself —
 * `recurring_overrides` is keyed by one original date and cannot express a
 * span, and since a matched series' `next_date` has already advanced past
 * everything settled, editing the series only moves occurrences still ahead.
 *
 * Rendered only while an instance is being edited, so the recurring list is not
 * fetched on every calendar load for a control nobody opened.
 *
 * Both mutations invalidate the forecast, so the running balance reflects the
 * change without a manual refresh.
 */
export function RecurringInstanceEditor({
  instance,
  accountId,
  onClose,
}: RecurringInstanceEditorProps) {
  const [step, setStep] = useState<Step>('choose');

  const { data: allSeries = [] } = useRecurring(accountId);
  const createOverride = useCreateOverride(instance.recurringId);
  const updateRecurring = useUpdateRecurring(accountId);

  const series = allSeries.find((s) => s.id === instance.recurringId) ?? null;

  return (
    <>
      <RecurringInstanceMenu
        isOpen={step === 'choose'}
        onClose={onClose}
        onEditThis={() => setStep('occurrence')}
        onEditAllFuture={() => setStep('confirm-all-future')}
        showConfirm={step === 'confirm-all-future'}
        onConfirmAllFuture={() => setStep('series')}
        onCancelConfirm={onClose}
      />

      {step === 'occurrence' && (
        <OccurrenceEditModal
          instance={instance}
          isOpen
          onSave={(body) =>
            createOverride.mutate(
              { originalDate: instance.originalDate, body },
              { onSuccess: onClose },
            )
          }
          onCancel={onClose}
        />
      )}

      {step === 'series' && series && (
        <EditSeriesModal
          recurring={series}
          isOpen
          onSave={(id, body) => {
            if (!id) return;
            updateRecurring.mutate({ id, body }, { onSuccess: onClose });
          }}
          onClose={onClose}
        />
      )}
    </>
  );
}
