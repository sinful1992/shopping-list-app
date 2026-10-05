import { Share } from 'react-native';

// Landing page row `in-app-invite` in the team's growth/links.md. While the app is in closed testing
// the page's #join section walks the invitee through the tester opt-in; after launch the same page
// shows the Play badge, so this link does not need to change with the release.
export const INVITE_LINK =
  'https://sinful1992.github.io/familyshoppinglist-legal/?utm_source=in-app-invite&utm_medium=referral&utm_campaign=testers#join';

export function buildInviteMessage(invitationCode: string): string {
  return (
    'Join our family shopping list 🛒\n' +
    `Install Family Shopping List: ${INVITE_LINK}\n` +
    `Then sign up, tap Join, enter code ${invitationCode} and tap Request to Join. I'll approve you.`
  );
}

/** Opens the system share sheet. Resolves false when the user closes it without sharing. */
export async function shareFamilyInvite(invitationCode: string): Promise<boolean> {
  const result = await Share.share({ message: buildInviteMessage(invitationCode) });
  return result.action === Share.sharedAction;
}
