import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class ItemModel extends Model {
  static table = 'items';

  @field('list_id') listId!: string;
  @field('name') name!: string;
  @field('quantity') quantity!: string | null;
  @field('price') price!: number | null;
  @field('checked') checked!: boolean;
  @field('created_by') createdBy!: string;
  @readonly @date('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
  // syncStatus is inherited from Model base class
  @field('category') category!: string | null; // Sprint 6: Category organization
  @field('sort_order') sortOrder!: number | null; // Sprint 6: Drag-and-drop reordering
}
