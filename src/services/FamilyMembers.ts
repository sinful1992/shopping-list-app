import { getDatabase, ref, get } from '@react-native-firebase/database';
import { User } from '../models/types';
import CrashReporting from './CrashReporting';

export async function loadFamilyMembers(memberIds: string[]): Promise<User[]> {
  if (memberIds.length === 0) return [];

  const db = getDatabase();
  // allSettled, not all: a single unreadable member must cost one row, not
  // the whole list. A member admitted into memberIds whose own profile has
  // not caught up yet is exactly such a read.
  const results = await Promise.allSettled(
    memberIds.map(id => get(ref(db, `/users/${id}`)))
  );

  const members: User[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const member = result.value.val();
      // Older profiles may lack uid; the path id is the member's uid.
      if (member) members.push({ ...member, uid: member.uid ?? memberIds[i] });
    } else {
      CrashReporting.recordError(
        result.reason as Error,
        'loadFamilyMembers',
      );
    }
  });
  return members;
}

export function memberName(member: User): string {
  return member.displayName || member.role || member.email?.split('@')[0] || '';
}
