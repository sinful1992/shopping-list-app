import { Share } from 'react-native';

// Row `in-app-invite` in the team's growth/links.md. While the app is in closed testing, Play shows the
// store page only to accounts that have opted in on the testing page first.
export const PLAY_TESTING_LINK = 'https://play.google.com/apps/testing/com.familyshoppinglist.app';
export const PLAY_STORE_LINK = 'https://play.google.com/store/apps/details?id=com.familyshoppinglist.app';

export function buildInviteMessage(invitationCode: string): string {
  return (
    'Join our family shopping list 🛒\n' +
    `1. Become a tester (skip if you already are):\n${PLAY_TESTING_LINK}\n` +
    `2. Install from Google Play:\n${PLAY_STORE_LINK}\n` +
    `3. Sign up, tap Join, enter code ${invitationCode} and tap Request to Join. I'll approve you.`
  );
}

/** Opens the system share sheet. Resolves false when the user closes it without sharing. */
export async function shareFamilyInvite(invitationCode: string): Promise<boolean> {
  const result = await Share.share({ message: buildInviteMessage(invitationCode) });
  return result.action === Share.sharedAction;
}
