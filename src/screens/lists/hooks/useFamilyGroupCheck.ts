import { useEffect } from 'react';
import AuthenticationModule from '../../../services/AuthenticationModule';
import DatabaseMigration from '../../../services/DatabaseMigration';
import { sanitizeError } from '../../../utils/sanitize';
import type { useAlert } from '../../../contexts/AlertContext';

type ShowAlert = ReturnType<typeof useAlert>['showAlert'];

/**
 * Home's start-up check: the family group still exists (else the user is told
 * and the reference is cleared), and any local migration runs.
 *
 * Runs once per account and family. It used to run on every change of the
 * live user object, which is a fresh object on every profile write (each list
 * created bumps a usage counter), so every new list re-ran the check
 * (OPTIMISE P2, Fable audit task 137).
 */
export function useFamilyGroupCheck(uid: string | null, familyGroupId: string | null, showAlert: ShowAlert): void {
  useEffect(() => {
    if (!uid || !familyGroupId) return;
    let cancelled = false;

    (async () => {
      try {
        const groupExists = await AuthenticationModule.validateFamilyGroupExists(familyGroupId);
        if (cancelled) return;

        if (!groupExists) {
          showAlert(
            'Family Group Not Found',
            'Your family group no longer exists. Please create or join a new group.',
            [{ text: 'OK' }],
            { icon: 'warning' },
          );
          await AuthenticationModule.clearFamilyGroupReference(uid, familyGroupId);
          return;
        }

        const needsMigration = await DatabaseMigration.needsMigration(familyGroupId);
        if (needsMigration && !cancelled) {
          try {
            await DatabaseMigration.runAllMigrations(familyGroupId);
          } catch {
            showAlert(
              'Migration Notice',
              'Database migration in progress. Please restart the app if lists do not appear.',
              undefined,
              { icon: 'info' },
            );
          }
        }
      } catch (error: any) {
        if (!cancelled) showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      }
    })();

    return () => { cancelled = true; };
    // showAlert is stable from AlertContext; re-running on its identity would
    // bring back the repeated check this hook exists to stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, familyGroupId]);
}
