import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class StoreLayoutModel extends Model {
  static table = 'store_layouts';

  @field('family_group_id') familyGroupId!: string;
  @field('store_name') storeName!: string;
  @field('category_order') categoryOrder!: string; // JSON string
  @field('created_by') createdBy!: string;
  @readonly @date('created_at') createdAt!: Date; // @date returns Date object
  @field('updated_at') updatedAt!: number;
  @field('sync_status') syncStatus!: string;
}
