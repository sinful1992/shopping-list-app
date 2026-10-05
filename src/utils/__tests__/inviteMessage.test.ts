import { Share } from 'react-native';
import { PLAY_STORE_LINK, PLAY_TESTING_LINK, buildInviteMessage, shareFamilyInvite } from '../inviteMessage';

describe('buildInviteMessage', () => {
  const message = buildInviteMessage('A3F7K9M2');

  it('uses the exact Play links from growth/links.md', () => {
    expect(PLAY_TESTING_LINK).toBe('https://play.google.com/apps/testing/com.familyshoppinglist.app');
    expect(PLAY_STORE_LINK).toBe('https://play.google.com/store/apps/details?id=com.familyshoppinglist.app');
  });

  it('puts each Play link on its own line, opt-in before install', () => {
    const lines = message.split('\n');
    expect(lines.indexOf(PLAY_TESTING_LINK)).toBeGreaterThan(-1);
    expect(lines.indexOf(PLAY_STORE_LINK)).toBeGreaterThan(lines.indexOf(PLAY_TESTING_LINK));
  });

  it('no longer links to the GitHub landing page', () => {
    expect(message).not.toContain('github.io');
    expect(message).not.toContain('utm_');
  });

  it('carries the join steps with the code exactly once', () => {
    expect(message).toContain('tap Join, enter code A3F7K9M2 and tap Request to Join');
    expect(message.split('A3F7K9M2')).toHaveLength(2);
    expect(message).toContain("I'll approve you");
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
