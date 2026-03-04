import database from '@react-native-firebase/database';
import LocalStorageManager from './LocalStorageManager';
import { normalizeItemName } from '../utils/normalize';

const CATEGORY_DEFAULTS: Record<string, string> = {
  Dairy: 'ml',
  Beverages: 'ml',
  Meat: 'g',
  Fish: 'g',
  Pantry: 'g',
  Frozen: 'g',
};

const KEYWORD_OVERRIDES: Record<string, string> = {
  butter: 'g',
  cheese: 'g',
  yogurt: 'g',
  oil: 'ml',
};

class MeasurementService {
  getStaticDefault(itemName: string, category: string | null | undefined): { unit: string } | null {
    const normalized = normalizeItemName(itemName);
    if (KEYWORD_OVERRIDES[normalized]) {
      return { unit: KEYWORD_OVERRIDES[normalized] };
    }
    if (category && CATEGORY_DEFAULTS[category]) {
      return { unit: CATEGORY_DEFAULTS[category] };
    }
    return null;
  }

  async suggestMeasurement(
    familyGroupId: string,
    itemName: string,
    category: string | null | undefined
  ): Promise<{ unit: string; value: number | null } | null> {
    const normalized = normalizeItemName(itemName);

    const pref = await LocalStorageManager.getItemPreference(familyGroupId, normalized);
    if (pref && pref.measurementUnit) {
      return { unit: pref.measurementUnit, value: pref.measurementValue ?? null };
    }

    if (KEYWORD_OVERRIDES[normalized]) {
      return { unit: KEYWORD_OVERRIDES[normalized], value: null };
    }

    if (category && CATEGORY_DEFAULTS[category]) {
      return { unit: CATEGORY_DEFAULTS[category], value: null };
    }

    return null;
  }

  async savePreference(
    familyGroupId: string,
    itemName: string,
    unit: string | null,
    value: number | null
  ): Promise<void> {
    const normalized = normalizeItemName(itemName);

    if (unit === null) {
      await LocalStorageManager.deleteItemPreference(familyGroupId, normalized);
      await this.deleteFromFirebase(familyGroupId, normalized);
      return;
    }

    await LocalStorageManager.saveItemPreference(familyGroupId, normalized, unit, value);
    await this.saveToFirebase(familyGroupId, normalized, unit, value);
  }

  private async saveToFirebase(
    familyGroupId: string,
    normalized: string,
    unit: string,
    value: number | null
  ): Promise<void> {
    try {
      const key = normalized.replace(/[.#$[\]]/g, '_');
      const ref = database().ref(`/familyGroups/${familyGroupId}/itemPreferences/${key}`);
      await ref.set({ unit, value: value ?? null, updatedAt: Date.now() });
    } catch {
      // offline — local write succeeded, Firebase will sync when reconnected
    }
  }

  private async deleteFromFirebase(familyGroupId: string, normalized: string): Promise<void> {
    try {
      const key = normalized.replace(/[.#$[\]]/g, '_');
      const ref = database().ref(`/familyGroups/${familyGroupId}/itemPreferences/${key}`);
      await ref.remove();
    } catch {
      // offline — local delete succeeded
    }
  }
}

export default new MeasurementService();
