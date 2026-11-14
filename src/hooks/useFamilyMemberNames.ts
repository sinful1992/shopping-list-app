import { useEffect, useState } from 'react';
import AuthenticationModule from '../services/AuthenticationModule';
import CrashReporting from '../services/CrashReporting';
import { loadFamilyMembers, memberName } from '../services/FamilyMembers';

/** uid → name for the family group's current members. Empty until loaded, or when offline. */
export function useFamilyMemberNames(familyGroupId: string | null, currentUid: string | null): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!familyGroupId || !currentUid) {
      setNames(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const group = await AuthenticationModule.getUserFamilyGroup(currentUid);
        const members = await loadFamilyMembers(Object.keys(group?.memberIds ?? {}));
        if (!cancelled) setNames(new Map(members.map(m => [m.uid, memberName(m)])));
      } catch (error) {
        CrashReporting.recordError(error as Error, 'useFamilyMemberNames');
      }
    })();
    return () => { cancelled = true; };
  }, [familyGroupId, currentUid]);

  return names;
}
