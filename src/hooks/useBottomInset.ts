import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom spacing that clears the system navigation bar.
 *
 * MainActivity calls EdgeToEdge.enable and the app targets SDK 36, so Android
 * draws content under the transparent nav bar whether we ask it to or not. A
 * 3-button nav bar is ~48dp, which is why the hardcoded 20 this replaces left
 * modal footers underneath it.
 *
 * The floor matters: inside an RN <Modal> Android renders a separate window and
 * the inset can read 0, so a bare insets.bottom would regress spacing below
 * what we had before. Same shape as the tab bar in App.tsx.
 */
export function useBottomInset(
  minimum: number = Platform.OS === 'ios' ? 34 : 16
): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, minimum);
}
