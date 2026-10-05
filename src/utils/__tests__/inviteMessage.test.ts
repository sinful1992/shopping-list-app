import { Share } from 'react-native';
import { INVITE_LINK, buildInviteMessage, shareFamilyInvite } from '../inviteMessage';

describe('buildInviteMessage', () => {
  it('carries the landing join link and the exact join steps with the code', () => {
    const message = buildInviteMessage('A3F7K9M2');
    expect(message).toContain(INVITE_LINK);
    expect(message).toContain('tap Join, enter code A3F7K9M2 and tap Request to Join');
    expect(message).toContain("I'll approve you");
  });

  it('links to the landing page join section with the in-app-invite source', () => {
    expect(INVITE_LINK).toMatch(/^https:\/\/sinful1992\.github\.io\/familyshoppinglist-legal\/\?/);
    expect(INVITE_LINK).toContain('utm_source=in-app-invite');
    expect(INVITE_LINK.endsWith('#join')).toBe(true);
  });
});

describe('shareFamilyInvite', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the share sheet with the invite message and reports a share', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    await expect(shareFamilyInvite('A3F7K9M2')).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith({ message: buildInviteMessage('A3F7K9M2') });
  });

  it('reports false when the user closes the share sheet', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
    await expect(shareFamilyInvite('A3F7K9M2')).resolves.toBe(false);
  });
});
