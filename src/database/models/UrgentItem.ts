import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class UrgentItemModel extends Model {
  static table = 'urgent_items';

  @field('name') name!: string;
  @field('family_group_id') familyGroupId!: string;
  @field('created_by') createdBy!: string;
  @field('created_by_name') createdByName!: string;
  @readonly @date('created_at') createdAt!: Date;
  @field('resolved_by') resolvedBy!: string | null;
  @field('resolved_by_name') resolvedByName!: string | null;
  @field('resolved_at') resolvedAt!: number | null;
  @field('price') price!: number | null;
  @field('status') status!: string;
  @field('sync_status') syncStatus!: string;
}
