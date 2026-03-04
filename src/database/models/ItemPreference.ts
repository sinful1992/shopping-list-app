import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class ItemPreferenceModel extends Model {
  static table = 'item_preferences';

  @field('family_group_id') familyGroupId!: string;
  @field('item_name_normalized') itemNameNormalized!: string;
  @field('measurement_unit') measurementUnit!: string | null;
  @field('measurement_value') measurementValue!: number | null;
  @field('updated_at') updatedAt!: number;
  @field('created_at') createdAt!: number;
}
