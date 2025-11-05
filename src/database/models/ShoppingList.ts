import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class ShoppingListModel extends Model {
  static table = 'shopping_lists';

  @field('name') name!: string;
  @field('family_group_id') familyGroupId!: string;
  @field('created_by') createdBy!: string;
  @readonly @date('created_at') createdAt!: number;
  @field('status') status!: string;
  @field('completed_at') completedAt!: number | null;
  @field('receipt_url') receiptUrl!: string | null;
  @field('receipt_data') receiptData!: string | null;
  @field('sync_status') syncStatus!: string;
}
