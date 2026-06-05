import { firebase } from '@react-native-firebase/app-check';
import CrashReporting from './CrashReporting';

/**
 * AppCheckService
 * Attests that requests come from our genuine, untampered app before Firebase
 * (RTDB, Storage) and — once enforced — the edge functions will serve them.
 *
 * Provider:
 *  - release builds → Play Integrity (Android) / App Attest (iOS)
 *  - __DEV__ builds → debug provider, so the AVD/emulator keeps working. Register
 *    the printed debug token in Firebase Console → App Check → Apps → Manage debug
 *    tokens (see RUNBOOK §9).
 *
 * MONITOR vs ENFORCE is a *console-side* decision, not code: this service only
 * makes attestation tokens flow. Leave each API UNENFORCED at first, watch the
 * App Check metrics until verified traffic dominates, then enforce per API. Do
 * NOT enforce at launch — an un-attested but legitimate client would be locked
 * out. See RUNBOOK §9 for the ramp.
 */
class AppCheckService {
  private initialized = false;

  /**
   * Initialize App Check (call once on app start, before Firebase traffic).
   * Resilient: a failure here must never block app startup — attestation simply
   * stays absent, which only matters once an API is enforced.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    try {
      const provider = firebase
        .appCheck()
        .newReactNativeFirebaseAppCheckProvider();

      provider.configure({
        android: {
          provider: __DEV__ ? 'debug' : 'playIntegrity',
        },
        apple: {
          provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
        },
      });

      await firebase.appCheck().initializeAppCheck({
        provider,
        isTokenAutoRefreshEnabled: true,
      });

      this.initialized = true;
    } catch (error) {
      CrashReporting.recordError(error as Error, 'AppCheckService initialize');
    }
  }
}

export default new AppCheckService();
