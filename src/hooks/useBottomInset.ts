import { Platform } from 'react-native';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';

/**
 * Bottom spacing that clears the system navigation bar.
 *
 * MainActivity calls EdgeToEdge.enable and the app targets SDK 36, so Android
 * draws content under the transparent nav bar whether we ask it to or not. A
 * 3-button nav bar is ~48dp, which is why the hardcoded 20 this replaces left
 * modal footers underneath it.
 *
 * Three sources, largest wins, because none is reliable alone:
 *
 * - `useSafeAreaInsets()` is live and correct on a screen, but returns 0 inside
 *   an RN <Modal> on Android. A modal is its own native window and the app-level
 *   provider never measures it. Measured on a Pixel 6 AVD with 3-button nav:
 *   48 on the screen, 0 in the sheet rendered over it. Padding by that 0 is the
 *   whole bug — every bottom sheet in the app reads its inset this way.
 * - `initialWindowMetrics` is a static snapshot taken before first render, so it
 *   is unaffected by the modal window and carries the real 48. It does not
 *   follow a runtime change of navigation mode, hence the live value above it.
 * - The floor keeps parity with the literal this replaced, so a device with
 *   nothing to clear is unchanged.
 */
export function useBottomInset(
  minimum: number = Platform.OS === 'ios' ? 34 : 20
): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0, minimum);
}
