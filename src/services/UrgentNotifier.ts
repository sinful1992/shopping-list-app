import { v4 as uuidv4 } from 'uuid';
import { getAuth, getIdToken } from '@react-native-firebase/auth';
import { Item } from '../models/types';
import AuthenticationModule from './AuthenticationModule';
import CrashReporting from './CrashReporting';
import supabase from './SupabaseClient';

/**
 * Tells the rest of the family that an item was marked urgent. The
 * upsert-urgent-item function stores the row, and the database webhook on
 * that table sends the push (notify-urgent-item). That trigger fires on
 * INSERT only, so every time an item turns urgent gets a row of its own;
 * reusing the item's id would make a second marking silent.
 *
 * Fire-and-forget: a failed push never blocks or undoes the urgent flag.
 */
export function notifyItemUrgent(item: Item): void {
  send(item).catch(error => {
    CrashReporting.recordError(error as Error, 'UrgentNotifier.notifyItemUrgent');
  });
}

async function send(item: Item): Promise<void> {
  const authUser = getAuth().currentUser;
  if (!authUser) return;
  const user = await AuthenticationModule.getCurrentUser();
  if (!user?.familyGroupId) return;

  const { error } = await supabase.functions.invoke('upsert-urgent-item', {
    body: {
      idToken: await getIdToken(authUser),
      id: uuidv4(),
      name: item.name,
      family_group_id: user.familyGroupId,
      created_by: authUser.uid,
      created_by_name: user.displayName || 'Someone',
      created_at: Date.now(),
      status: 'active',
    },
  });
  if (error) throw error;
}
