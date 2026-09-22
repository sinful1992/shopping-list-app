import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** A receipt line's text the family has confirmed means a given item. */
export class ReceiptAliasModel extends Model {
  static table = 'receipt_aliases';

  @field('family_group_id') familyGroupId!: string;
  @field('receipt_key') receiptKey!: string;
  @field('item_name') itemName!: string;
  @field('use_count') useCount!: number;
  @field('updated_at') updatedAt!: number;
}
