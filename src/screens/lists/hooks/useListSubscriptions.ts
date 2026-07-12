import { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Item, ShoppingList } from '../../../models/types';
import ShoppingListManager from '../../../services/ShoppingListManager';
import ItemManager from '../../../services/ItemManager';

interface ListSubscriptionCallbacks {
  /** Eager work at (re)mount — fast local DB reads needed immediately. */
  onMount: () => void;
  /** Deferred expensive work after the navigation animation completes. */
  onAfterInteractions: () => void;
  /** WatermelonDB list observer emissions (Firebase or local edits). */
  onList: (list: ShoppingList) => void;
  /** WatermelonDB item observer emissions (Firebase or local edits). */
  onItems: (items: Item[]) => void;
  /** Unmount resets/flushes. */
  onCleanup: () => void;
}

/**
 * useListSubscriptions
 * Owns ListDetailScreen's subscription lifecycle for one listId:
 * WatermelonDB list/item observers, NetInfo connectivity, and the
 * InteractionManager deferral. Callbacks are read through a ref, so the
 * subscriptions are torn down/re-created only when listId (or enabled)
 * changes — never because a render produced new callback identities.
 */
export function useListSubscriptions(
  listId: string,
  enabled: boolean,
  callbacks: ListSubscriptionCallbacks
): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    callbacksRef.current.onMount();

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (mounted) {
        callbacksRef.current.onAfterInteractions();
      }
    });

    const unsubscribeList = ShoppingListManager.subscribeToSingleList(
      listId,
      (updatedList) => {
        if (!mounted || !updatedList) return;
        callbacksRef.current.onList(updatedList);
      }
    );

    const unsubscribeItems = ItemManager.subscribeToItemChanges(listId, (updatedItems) => {
      if (!mounted || !updatedItems) return;
      callbacksRef.current.onItems(updatedItems);
    });

    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (mounted) {
        setIsOnline(state.isConnected ?? false);
      }
    });

    return () => {
      mounted = false;
      interactionHandle.cancel();
      unsubscribeList();
      unsubscribeItems();
      unsubscribeNetInfo();
      callbacksRef.current.onCleanup();
    };
  }, [listId, enabled]);

  return { isOnline };
}
