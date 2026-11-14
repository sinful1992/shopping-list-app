import { Share } from 'react-native';
import { INVITE_LINK, PLAY_STORE_LINK, buildInviteMessage, shareFamilyInvite } from '../inviteMessage';

describe('buildInviteMessage', () => {
  it('carries the landing join link and the exact join steps with the code', () => {
    const message = buildInviteMessage('A3F7K9M2');
    expect(message).toContain(INVITE_LINK);
    expect(message).toContain('tap Join, enter code A3F7K9M2 and tap Request to Join');
    expect(message).toContain("I'll approve you");
  });

  it('leads with the Google Play store link, the web page after it as the option (USER #11676)', () => {
    expect(PLAY_STORE_LINK).toBe('https://play.google.com/store/apps/details?id=com.familyshoppinglist.app');
    const lines = buildInviteMessage('A3F7K9M2').split('\n');
    const play = lines.findIndex(l => l.endsWith(PLAY_STORE_LINK));
    const page = lines.findIndex(l => l.endsWith(INVITE_LINK));
    expect(play).toBe(1);
    expect(lines[play]).toContain('Google Play');
    expect(page).toBe(play + 1);
    expect(lines[page]).toMatch(/^Or read about the app first: /);
    expect(lines[lines.length - 1]).toContain('enter code A3F7K9M2');
  });

  it('keeps each link alone at the end of its line, so chat apps make it tappable', () => {
    const message = buildInviteMessage('X');
    expect(message).toContain(PLAY_STORE_LINK + '\n');
    expect(message).toContain(INVITE_LINK + '\n');
    expect(message.split(PLAY_STORE_LINK).length).toBe(2);
  });

  it('handles an empty code without dropping the links', () => {
    const message = buildInviteMessage('');
    expect(message).toContain(PLAY_STORE_LINK);
    expect(message).toContain(INVITE_LINK);
    expect(message).toContain('enter code  and tap');
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
