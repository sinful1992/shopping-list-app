import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class SyncQueueModel extends Model {
  static table = 'sync_queue';

  @field('entity_type') entityType!: string;
  @field('entity_id') entityId!: string;
  @field('operation') operation!: string;
  @field('data') data!: string;
  @field('timestamp') timestamp!: number;
  @field('retry_count') retryCount!: number;
}
