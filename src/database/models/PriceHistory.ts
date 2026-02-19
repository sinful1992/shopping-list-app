import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class PriceHistoryModel extends Model {
  static table = 'price_history';

  @field('item_name')            itemName!: string;
  @field('item_name_normalized') itemNameNormalized!: string;
  @field('price')                price!: number;
  @field('store_name')           storeName!: string | null;
  @field('list_id')              listId!: string | null;
  @field('recorded_at')          recordedAt!: number;
  @field('family_group_id')      familyGroupId!: string;
}
