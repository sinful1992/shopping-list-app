import { useEffect } from 'react';
import { Linking } from 'react-native';
import SpInAppUpdates from 'sp-react-native-in-app-updates';
import { AlertButton } from '../components/CustomAlert';

const PLAY_STORE_URL = 'market://details?id=com.familyshoppinglist.app';

type ShowAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: { icon?: 'error' | 'success' | 'warning' | 'info' | 'confirm' }
) => void;

export function useInAppUpdate(showAlert: ShowAlert) {
  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const inAppUpdates = new SpInAppUpdates(false);
        const result = await inAppUpdates.checkNeedsUpdate();
        if (result.shouldUpdate) {
          showAlert(
            'Update Available',
            'A new version of the app is available on the Play Store.',
            [
              { text: 'Not Now', style: 'cancel' },
              {
                text: 'Update',
                style: 'default',
                onPress: () => {
                  Linking.openURL(PLAY_STORE_URL);
                },
              },
            ],
            { icon: 'info' }
          );
        }
      } catch {
        // Silently fail — update check should never block the app
      }
    };

    checkForUpdate();
  }, [showAlert]);
}
