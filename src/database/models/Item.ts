import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class ItemModel extends Model {
  static table = 'items';

  @field('list_id') listId!: string;
  @field('name') name!: string;
  @field('quantity') quantity!: string | null;
  @field('checked') checked!: boolean;
  @field('created_by') createdBy!: string;
  @readonly @date('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
  @field('sync_status') syncStatus!: string;
}
