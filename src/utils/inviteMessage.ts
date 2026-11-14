import { Share } from 'react-native';

// Google Play store page (team growth/links.md, row in-app-invite). The invite leads with it
// (USER #11676, task 157): the invitee installs from Play.
export const PLAY_STORE_LINK = 'https://play.google.com/store/apps/details?id=com.familyshoppinglist.app';

// Landing page row `in-app-invite` in the team's growth/links.md, offered as the option to read
// more first. While the app is in closed testing its #join section walks the invitee through the
// tester opt-in; after launch the same page shows the Play badge.
export const INVITE_LINK =
  'https://sinful1992.github.io/familyshoppinglist-legal/?utm_source=in-app-invite&utm_medium=referral&utm_campaign=testers#join';

export function buildInviteMessage(invitationCode: string): string {
  return (
    'Join our family shopping list 🛒\n' +
    `Get Family Shopping List on Google Play: ${PLAY_STORE_LINK}\n` +
    `Or read about the app first: ${INVITE_LINK}\n` +
    `Then sign up, tap Join, enter code ${invitationCode} and tap Request to Join. I'll approve you.`
  );
}

/** Opens the system share sheet. Resolves false when the user closes it without sharing. */
export async function shareFamilyInvite(invitationCode: string): Promise<boolean> {
  const result = await Share.share({ message: buildInviteMessage(invitationCode) });
  return result.action === Share.sharedAction;
}
