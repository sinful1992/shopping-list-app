import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class CategoryHistoryModel extends Model {
  static table = 'category_history';

  @field('family_group_id') familyGroupId!: string;
  @field('item_name_normalized') itemNameNormalized!: string;
  @field('category') category!: string;
  @field('usage_count') usageCount!: number;
  @field('last_used_at') lastUsedAt!: number;
  @readonly @date('created_at') createdAt!: number;
}
