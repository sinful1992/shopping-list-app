import { useEffect, useRef } from 'react';
import SpInAppUpdates, {
  IAUUpdateKind,
  AndroidInstallStatus,
  StatusUpdateEvent,
} from 'sp-react-native-in-app-updates';
import { AlertButton } from '../components/CustomAlert';

type ShowAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: { icon?: 'error' | 'success' | 'warning' | 'info' | 'confirm' }
) => void;

export function useInAppUpdate(showAlert: ShowAlert) {
  const updaterRef = useRef<SpInAppUpdates | null>(null);

  useEffect(() => {
    const inAppUpdates = new SpInAppUpdates(false);
    updaterRef.current = inAppUpdates;

    const onStatusUpdate = (event: StatusUpdateEvent) => {
      if (event.status === AndroidInstallStatus.DOWNLOADED) {
        showAlert(
          'Update Ready',
          'A new version has been downloaded. Restart the app to apply the update.',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart',
              style: 'default',
              onPress: () => {
                inAppUpdates.installUpdate();
              },
            },
          ],
          { icon: 'info' }
        );
      }
    };

    const checkForUpdate = async () => {
      try {
        const result = await inAppUpdates.checkNeedsUpdate();
        if (result.shouldUpdate) {
          inAppUpdates.addStatusUpdateListener(onStatusUpdate);
          await inAppUpdates.startUpdate({
            updateType: IAUUpdateKind.FLEXIBLE,
          });
        }
      } catch {
        // Silently fail — update check should never block the app
      }
    };

    checkForUpdate();

    return () => {
      try {
        inAppUpdates.removeStatusUpdateListener(onStatusUpdate);
      } catch {
        // Listener may not have been added if update wasn't available
      }
    };
  }, [showAlert]);
}
