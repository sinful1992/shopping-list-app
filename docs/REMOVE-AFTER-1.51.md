# Remove after 1.51 is on Play

1.51.1 removed the Urgent tab and the standalone urgent items (444b83a); urgent is now a flag on a list
item. Play still ships 1.47.18, which reads and writes the old `/urgentItems` tree, so these pieces stay
until every active install is on 1.51 or later. Then delete them in one change.

## Delete once 1.51+ is the only live version

| What | Where | Why it stays for now |
|------|-------|----------------------|
| `urgentItems` rules | `database.rules.json` (`"urgentItems"` block) | 1.47.18 reads and writes `/urgentItems/{familyGroupId}` |
| `/urgentItems` clean-up on leave / delete account | `src/services/AuthenticationModule.ts` (query on `/urgentItems/${familyGroupId}`, `createdBy == uid`) | removes rows 1.47.18 users created; harmless and needed while those rows can still be written |
| The `/urgentItems` data itself | Firebase RTDB | Delete the tree after the rules are gone (a manual console or admin-script step, needs USER's yes) |

## Not dead: keep

- `supabase/functions/upsert-urgent-item` and `notify-urgent-item`: the 1.51 flag sends its family push
  through them (`src/services/UrgentNotifier.ts` calls `upsert-urgent-item`; the table trigger calls
  `notify-urgent-item`).
- `supabase/setup-urgent-items.sql`: creates the `urgent_items` table and the trigger behind that push.
- `usageCounters.urgentItemsCreated`: `database.rules.json` requires the field on every usage-counter
  write (`__tests__/rules/helpers.js` seeds it), so clients must keep sending it.
- WatermelonDB migrations, including v17 that drops the local `urgent_items` table.
