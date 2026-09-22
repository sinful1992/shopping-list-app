# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.47.0] - 2026-09-22

### Added
- **A receipt can be matched again from Receipt Details.** The match screen was only reachable straight after a scan, so a match that was skipped, interrupted or half-done could never be picked up again, and a receipt corrected afterwards in Receipt Details could not be re-applied. Receipt Details now has a **Match to list items** button whenever the receipt has lines, from both the Lists and the History tabs (the match screen is now registered in the History stack too). Because items that already have a price are matched too (1.42.3), running it again on a list that was already matched links lines to the items they priced, rather than offering to add them a second time.
- Receipt Details reloads when it regains focus, so corrections saved on the match screen show on return.

## [1.46.1] - 2026-09-22

### Changed
- **Items added from a receipt arrive filed and counted.** A receipt line added as a new item used to land with no category — dropped at the bottom of the list and outside every category breakdown — and with the line total as its price even when the line counted several units.
  - It now takes the category the family usually gives that name (`CategoryHistoryService.getSuggestedCategory`, as Frequently Bought already does).
  - A line counting a whole number of units above one ("4 x YOGHURT £3.00") becomes that many units at the per-unit price (£0.75), so the unit price is right and the total is unchanged. A weighed line stays one unit.
- `ItemManager.addItemsBatch` accepts `unitQty` and now sanitises `category` the way `addItem` does.

## [1.46.0] - 2026-09-22

### Added
- **A line the scan half-read can be fixed on the match screen.** A line with no price or no name used to say "No price read on this line" and offer nothing, so the item on it could not be priced, matched or added. The note is now a tap target that opens an inline field for the missing half (a decimal keypad for a price). Once the line has both, it becomes a normal line: it is offered to the matcher straight away against items no other line has claimed, and otherwise it can be matched by hand or added. The corrections are saved back into the receipt on Apply, so Receipt Details and the rest of the family see the fixed lines. If the only change is a correction, the button reads **Save corrections**.

### Fixed
- **An edit to a receipt's lines never reached the rest of the family.** `FirebaseSyncListener.hasListChanged` compared every list field except `receiptData`, so a change that touched only the lines was dropped on arrival. This already affected line edits made in Receipt Details. It now compares receipts through `sameReceiptData`, which ignores the differences a Firebase round trip introduces (dropped nulls and empty arrays, key order), so a real edit is applied and a round trip is not mistaken for one.

## [1.45.0] - 2026-09-22

### Added
- **Receipt savings are applied, shown and reconciled.** The OCR server prints each Clubcard or multi-buy saving against its line, and that line's price is the pre-saving figure. The app kept the savings but lost which line each belonged to, and no screen used them: items were priced at the shelf price, and the lines on the match screen did not add up to the TOTAL.
  - Each saving now keeps its line (`ReceiptDiscount.lineIndex`) and prints under it on the match screen. Items are priced at what was paid for them — in the list, in price history and in the new-item price.
  - A SAVINGS row sits under the TOTAL.
  - When the lines less their savings do not come to the printed total, the receipt says so ("Lines come to £X, £Y over the total. Check the prices above against the paper.") before a misread price is applied.
  - Receipts scanned before this change have savings without a line; they are placed on the first line printed with the same description.

## [1.44.0] - 2026-09-22

### Added
- **The receipt matcher remembers.** Matching "TESCO SEMI SKM MLK 2.272L" to "Milk" by hand used to be forgotten the moment you pressed Apply, so the same abbreviation needed the same manual match on every receipt. Applying now remembers, per family group:
  - A line matched by hand, or a fuzzy match you kept, is remembered as that item. On later receipts that line goes straight to the item before any fuzzy scoring, with no confidence percentage because it is not a guess. Two remembered lines may go to the same item.
  - A line added as a new item under a name you typed is remembered under that name. When it appears again and is not on the list, the add field starts with that name instead of the till text.
  - A remembered match you ignore, remove or change is forgotten, so a wrong one does not return on every receipt.
- Receipt text is keyed with case and spacing folded only (`receiptAliasKey`); names are compared singular/plural-insensitively.

### Changed
- Schema v16 adds the local `receipt_aliases` table (migration 15 → 16). It is device-local and not synced, and it is cleared with the rest of the local data on account deletion.

## [1.43.3] - 2026-09-22

### Performance
- **Analytics and History search queried the database once per list.** Four walks in `PriceHistoryService` (the price-history backfill, the legacy per-item history, the volatility chart and recent price extremes) and History search's item match each fetched a list's items inside a loop over every completed list, so their cost grew one query per trip in the household's history — for search, on every keystroke. They now fetch through `LocalStorageManager.getItemsGroupedByList`, one query per 500 lists, which returns each list's items in the same order as before. Search also only fetches items for lists whose name and store did not already match.
- `getItemsForLists` now chunks its ids at 500 to stay under SQLite's 999-variable limit. Price prediction and the Analytics service already passed it every completed list id in one call, which a long enough history would have pushed past that limit.

## [1.43.2] - 2026-09-22

### Fixed
- **A scanned list never knew which store it came from.** The receipt flow saved the till's merchant text to `merchantName` but never set `storeName`, which is the field price history, store layouts, the History store filter and the per-store comparison all read. Quick-scan lists in particular always had none, so every price recorded from them was store-less. A scan now sets the store when the list has none — the user's own spelling for that retailer if they have entered it before ("Tesco Extra"), otherwise its canonical name ("Sainsbury's", "Co-op"). The raw till header ("TESCO STORES 3452") is never used: an unrecognised merchant is only taken when it matches a store the user already entered. A store chosen by hand is never overwritten. This applies both to the first scan and to an OCR retry from Receipt Details.

### Changed
- Retailer detection moved from `ReceiptOCRService` into `src/utils/storeNames.ts`, with tests, next to the new resolver. `ReceiptOCRService.listPatchFor` is now the one place that decides which list fields a scan writes.

## [1.43.1] - 2026-09-22

### Fixed
- **Prices applied from a receipt never reached price history.** `PriceHistoryService.recordPrice` had one caller, the check-off toggle; the receipt match screen writes through the batch item methods, which skip it, and the one-shot backfill had long since run. So the most exact price source the app has — the till's own figures — never showed in Analytics, Smart Savings, store comparison or predictions. Applying a receipt now records each item it prices or ticks off.
- **One purchase could count twice.** Every price record got a fresh id, so checking an item off at £1.00 and then scanning a receipt that said £1.10 — or un-ticking and re-ticking it — added a second data point for the same purchase and skewed every average. Purchase records are now keyed by list and item (`item_{listId}_{itemId}`); a second write for the same purchase is a correction. Local saves update an existing record instead of skipping it, and the price-history listener also takes `child_changed`, so other devices receive the correction.

### Changed
- `ItemManager.recordPurchase(item)` holds the category-and-price recording that was inlined in `toggleItemChecked`; both the toggle and the receipt screen use it.

## [1.43.0] - 2026-09-22

### Added
- **Receipt matches can be changed, not just ignored.** Tapping the annotation under any matched line opens the picker as "Change match", with the current item ticked and a **Remove match** action that turns the line back into an unlisted one (addable, or matchable again). Before this, ignoring a wrong auto-match left both the line and the item stuck: neither returned to the unmatched pools, so the right pairing could not be made.
- **One item can take several receipt lines.** The picker now offers every list item, not only unmatched ones; an item already matched elsewhere says which line it is also on. The item's price is the lines' total spread over its units, so two separate "MILK £1.10" lines on a one-unit "Milk" record £2.20 paid. The annotation reads "2 lines" on each.
- Ignoring a match releases its item back to the "Not on this receipt" slip.

### Changed
- The grouping and write-planning behind Apply moved out of the screen into `src/utils/receiptLinks.ts`, with tests.

## [1.42.3] - 2026-09-22

### Fixed
- **An item that already had a price could not be matched to its receipt line.** The match screen only offered items with no price to the matcher, so anything priced while shopping — or carried over from an earlier list with its price — vanished from the screen entirely: never auto-matched, absent from the "Match to a list item" picker and from the "Not on this receipt" slip. When every item was priced the screen offered to add the whole shop to the list a second time. Every item is a candidate now. Where a match would change a price already on the item, the annotation shows `was £X`, and a fuzzy (under 100%) match of that kind starts ignored so the overwrite is the user's choice. Applying no longer writes an item whose price and checked state would not change.

## [1.42.2] - 2026-09-05

### Fixed
- **Ignoring every match made the receipt claim it had found none.** The match screen'''s summary line branched on the accepted count, so rejecting all of them flipped it from "2 of 3 lines matched" to "3 lines · none matched yet" — which describes a failed scan rather than a scan the user overrode. It counts off the matches found, not the ones still accepted.
- **The per-line "Match to a list item" action was invisible to screen readers.** It is a `Text` with an `onPress`, which carries no role of its own; it now declares the button role and names the receipt line it would act on.

### Changed
- `ReconciledLine` takes its stylesheet and theme from the screen instead of calling `useTheme` and `StyleSheet.create` itself. It renders once per printed line and the eval corpus has a 36-line receipt, so building a stylesheet inside it meant 36 of them per render. `EmptyState` in the same file was already written this way.

## [1.42.1] - 2026-09-05

### Fixed
- **The tie glyph under each receipt line would have drawn a tofu box on Android.** The annotation row opened with U+21B3 set in `RECEIPT_FONT`, which resolves to plain `monospace` on Android — Droid Sans Mono, which has no such glyph. Every annotated line on the only platform this app ships to would have led with an empty box. Nothing in the toolchain can see this: tsc, eslint and the 270-test suite all passed on it. The glyph is gone; the annotation is tied to its line by an indent and a left rule, which cannot fail to render.

## [1.42.0] - 2026-09-05

### Changed
- **The receipt match screen now shows the receipt.** It sorted the scan into three buckets — matched, unmatched receipt items, unmatched list items — two of them collapsed behind chevrons. That taxonomy is the app's, not the user's: someone holding the paper receipt finds a line by where it sits on the roll, and the buckets destroyed exactly that ordering. The screen now renders the receipt in printed order on the same `ReceiptCard` paper as Receipt Details, with what each line resolved to written underneath it as an annotation. List items the till never printed have no line to sit beside, so they get a second slip below the total. Only one control is visible per line: a receipt with four icons per row stops reading as a receipt, so the trailing toggle carries the common action and the rarer "match to a list item" lives on the annotation text.

### Fixed
- **A line the matcher had discarded still offered to add itself.** `matchReceiptToList` only considers lines carrying both a price and a description, so a line missing either appears in neither the matches nor the unmatched list. Rendering the receipt in full brought those lines back on screen, where the add toggle would have looked live and then been dropped by `handleApply`, which looks the index up in `unmatchedReceipt` and returns null when it is absent. Those lines now print with no control and say which half was not read.

### Fixed
- **A malformed ID token answered with the decoder's own error text.** Probing the deployed proxy with `not.a.token` came back with a raw `Unexpected token ... is not valid JSON`, replacement characters and all: a three-segment string clears the shape check, then `atob` or `JSON.parse` throws and that message goes straight back as the 401 body. The status was always right and nothing sensitive escaped, so this is legibility rather than a hole. All three segments now decode inside one guard that answers `Malformed ID token`. The signature segment sat in the same position and is covered too. Every edge function carries this verification inlined — the Supabase bundler will not resolve a shared import — so the same defect was copy-pasted across all six, and all six are fixed.

## [1.41.2] - 2026-09-03

### Fixed
- **Nothing was deploying `ocr-proxy`.** The function was written and committed in 1.41.0 but never added to `deploy-supabase-functions.yml`, so the workflow shipped the other eight functions and left the one the app now depends on absent from the project. A rotation done against that state would have taken scanning down with no proxy to fall back to. It deploys from CI now, deliberately without `--no-verify-jwt` — every other function in that file carries the flag, and copying it here would have made the proxy reachable with no gateway auth at all, contradicting its own README. `supabase/config.toml` records the same `verify_jwt = true` so a deploy run by hand behaves identically.

## [1.41.1] - 2026-09-02

### Fixed
- **The proxy would have authenticated on a header Supabase can drop.** 1.41.0 sent the Firebase ID token to `ocr-proxy` as `X-Firebase-Token`, and the functions gateway is documented by users as stripping non-standard headers before the function runs. The unit tests could not have caught it: they mock `fetch`, so they assert what the client sends, never what survives the gateway. With an immediate cutover the first real exercise of that path would have been the moment older builds stopped working, so it is not a thing to find in production. The token now travels as an `idToken` multipart field, which cannot be stripped, and the header is kept only as a fallback.

### Changed
- The rotation runbook deploys against the currently live key and requires a real 200 through the proxy before anything is rotated. As written in 1.41.0 it set the new key first, which put the function's first end-to-end test at the same moment as the cutover, with no known-good state to fall back to.
- The 9MB body cap is now documented as a judgement against a community-reported limit rather than a published one — Supabase does not document the request size limit for edge functions.

## [1.41.0] - 2026-09-02

### Security
- **The OCR server's shared secret was compiled into the app, and this repo is public.** `ReceiptOCRService` held the key as a string constant and sent it as `X-OCR-Key` on every scan, so the value was readable three ways: by decompiling the APK, by reading the source on GitHub, or — easiest of all — by reading the 1.34.0 changelog entry that printed it in full. The header was only ever abuse deterrence rather than authentication, which the comment beside it said plainly, but a secret in a public repository does not deter anything.

  What it guarded is worth stating exactly, because it bounds the damage: `/ocr` takes an image and returns parsed JSON, touching no database and storing nothing. Anyone holding the key could spend the Space's compute, not read a receipt or reach an account. The realistic cost was scans queueing behind someone else's traffic.

  Scans now go through a new `ocr-proxy` edge function, which holds `OCR_SHARED_SECRET` in its own environment and admits a request on a verified Firebase ID token — the same inlined verification the notification functions use. Nothing secret ships in the bundle any more: pulling the APK apart yields no access that signing in does not already give. The key printed in the old changelog entry has been rotated and is dead; it stays redacted rather than purged, since rewriting a public repository's history does not recall a value that forks and caches already have.

  This is a coordinated change. The Space's secret is rotated at the same time, so a build older than this one gets a 401 on scan until it updates.

### Changed
- Gallery picks are capped at 4096px on the long edge. That is the same `MAX_LONG_EDGE` the OCR server downscales to before reading, so it costs no accuracy, and it keeps an uncropped phone photo inside the edge function's request-body limit, which is lower than the Space's own 15MB cap. The scanner path crops to the receipt and was already well under.
- A server URL set by hand in Settings still goes straight to that server, unproxied. That is the local-dev path, where the server runs without a secret and is not reachable from a deployed function anyway.

### Added
- Tests covering the request path: scans carry a Firebase token to the proxy, the retired key is never sent on any path, a stored URL override still reaches the dev server directly, and a signed-out scan fails with a readable message instead of a 401 from the network.
- Modular-API named exports (`getAuth`, `getIdToken`, `getIdTokenResult`) on the shared Firebase test mock, which only covered the legacy callable pattern and returned `undefined` for every modular import.

## [1.40.9] - 2026-08-27

### Fixed
- **The category pie could show two slices both labelled "Other".** The ring appends an "Other" slice for spend it cannot place — categories past the sixth, plus what a receipt carries that no item accounts for — but "Other" is also a real category, the one an uncategorised item lands in, and on this account it is the largest. When both existed the legend listed "Other" twice and React was handed two children with the same key. The remainder now joins the slice already there. Only reachable once the receipt total exceeds the itemised sum, which is why repairing the unhoisted totals in 1.40.8 surfaced it.

## [1.40.8] - 2026-08-27

### Fixed
- **Trips whose receipt total was never hoisted counted as £0 spend.** Schema v15 (2026-04-30) moved receipt totals out of the `receiptData` JSON into first-class columns and shipped a one-time repair for rows written before it — but the repair matched only rows whose `total_amount` was `NULL`, and the completion path it existed to repair stored `0` when the running total was not yet known. Every one of those rows was skipped, so the total stayed in the JSON where nothing reads it and the trip counted as costing nothing in Analytics, History and Budget alike. That is not a free shop: a trip with items checked off and priced was paid for. On the development account it was 13 completed trips holding £650.21 of receipts, against a headline that read £444.72 for the year.

  The repair now treats both `NULL` and `0` as "no total on the column yet", and runs under a new flag so it reaches devices where the v15 pass already recorded itself done. A total already present on the column is never rewritten. The same rows never got their merchant or currency hoisted either, and now do.

### Added
- Tests for the hoist, which shipped without any: a zero column and a null column are both repaired, a column that already holds a total is left alone, and the pass does not run twice.

## [1.40.7] - 2026-08-27

### Fixed
- **The item backfill added in 1.40.1 could hold up the whole Analytics screen.** It was awaited before the summary returned, so on a slow connection a screenful of figures that were already in hand sat behind the loading spinner waiting on items that were not. It gets three seconds now; fetches still in flight keep going and still save what they find, so running out of time costs a load, not the data.

### Added
- Tests for the backfill's fencing: a list that comes back empty is recorded as asked, a list whose fetch failed is not, and a single run is capped with the remainder picked up next time.

## [1.40.6] - 2026-08-27

### Fixed
- **Sunday was drawn off the edge of the "When You Shop" chart.** With `adjustToWidth`, gifted-charts sizes the bars from `parentWidth`, which defaults to the width of the whole screen rather than the width the chart was actually given — so it laid out a full screen's worth of bars inside a box 86dp narrower and the last one fell outside it. Seven bars made it obvious; the store chart was losing the right edge of its last bar to the same arithmetic. Both charts now say what width they are.

- **The trend's first and last x-axis labels were cut in half.** A label is centred on its point and `adjustToWidth` puts the first and last points exactly on the plot edges, so half of each label sat outside the box and was clipped: "27 Jul" rendered as "Jul" and "10 Aug" as "10 A". The trend sets its own spacing against a padded width, leaving room at both ends.

- **The "When You Shop" y-axis went up to 10 whatever the data.** With no `maxValue`, the axis came from the section count alone: ticks of 0/3/6/10 over trip counts of one and two, which left the bars in the bottom fifth of the chart. The scale is taken from the actual peak, with the step chosen first so every tick is a whole number of trips.

- **The pull-to-refresh spinner came to rest on top of the period filter.** Android settles it 64dp down less its own diameter, which put it over the 30/90/1Y row and covered the label saying which period was on screen — at the one moment the figures underneath were being replaced. It now tucks up against the tab bar and clears the filter.

## [1.40.5] - 2026-08-27

### Fixed
- **Smart Savings gave advice from prices of any age, and said nothing about it.** `getSmartSuggestions` passed no date to `getPriceHistory` at all, so "Potential savings per shop" and "Best at Lidl" were an unweighted all-time comparison — a store that was cheapest last winter presented as where to go for this week's shop. It sat directly beneath the item comparison chart, which does apply a window, so on an account whose prices are a few months old the two adjacent panels contradicted each other: one said "No purchases in this period" while the other quoted a saving from the same rows. The card now reads the last 90 days and says so under its title, and its empty state says the window rather than telling you to shop around when you already do.

  The window is opt-in — `getPriceHistory`, `getPriceByStore` and `getSmartSuggestions` all take an optional date and filter after the fetch — so the price stats, the volatility chart and the two live-shopping callers keep the all-time series they read today. The suggestions cache is keyed on the window as well as the family group; keyed on the group alone it would have served the first window's answer to every later one, and `clearSuggestionsCache` now clears every window a group has.

## [1.40.4] - 2026-08-27

### Fixed
- **The Items tab was a heading over nothing when there was nothing to show.** Every other pane on the screen says so — the pie has "No category data available", Volatile Prices has "Not enough price data yet" — but Most Purchased just rendered its title and subtitle above empty space, so an account with no priced items looked like a rendering failure.

## [1.40.3] - 2026-08-27

### Fixed
- **"Unknown" was the headline shop.** Trips completed without a store recorded are pooled under one bucket, and that bucket sorted by spend like any other — so on an account where most trips carry no store it led Store Breakdown, took a bar in Spend by Store, and wore the "Most visited" badge, reading like a shop called Unknown. The bucket has to stay in the breakdown or it stops adding up to the period total, so it stays: it is labelled "No store recorded", sorts last however much it holds, is out of the store bar chart, and can no longer win "Most visited" or be the summary's most frequent store.

- **"Smallest trips" was awarded to a store with no recorded spend.** The badge is a minimum over average spend per trip, so a shop visited once with nothing priced on the list won it at £0.00 — praise for the cheapest basket, given to the one with no basket. Stores with no spend are out of the running, and both badges need at least two candidates of their own now that each excludes a different set.

- **"1 trips".** Store Breakdown, and the trip and item counts under TOTAL SPENT, printed a plural regardless of the count.

## [1.40.2] - 2026-08-27

### Fixed
- **The spending trend drew a straight line across weeks you did not shop.** The series only ever held buckets that contained a trip, so three quiet weeks simply did not exist and the line joined the buckets either side of them: a steady decline drawn over what was actually one big shop followed by nothing. The x-axis was ordinal while it read as temporal. Weekly bucketing in 1.40.0 made it far likelier — a gap now only has to be days long to drop a bucket — and, because the series stopped at the last trip rather than at today, a period that ended quietly never showed the quiet part at all. Every bucket in the selected period is now on the chart, at zero where there was no trip, widened past the period if a trip falls outside it.

### Changed
- The trend labels every other bucket once there are more than eight, counting back from the most recent, so a year of monthly buckets does not stack thirteen labels on top of each other.

## [1.40.1] - 2026-08-27

### Fixed
- **Analytics showed no items at all on a device that did not run the shop.** The summary reads the local items table, and items only land there for a trip completed on this device or synced while it was listening. On a fresh install, or for any member who joined the group after the fact, the lists sync but their items do not — so spend, stores and the trend rendered normally while the category pie said "No category data available", Most Purchased was a heading over nothing, and the item count read zero. `HistoryDetailScreen` has fetched the missing items from Firebase per list since it hit the same wall; Analytics now does the same for the window it is showing.

  Kept away from the round-trip storm removed in 1.39.12: only lists with no local items are ever asked for, each list is asked at most once ever — the attempt is persisted, so changing period or pulling to refresh does not ask again — a single run is capped at forty lists, and a fetch that fails is not recorded as attempted, so going offline does not blank the item half permanently.

## [1.40.0] - 2026-08-26

### Added
- **Pull to refresh, and a refresh when the tab regains focus.** Analytics is a bottom-tab screen, so it stays mounted and only ever reloaded when the period changed. Finishing a shop and tapping Analytics showed the figures from before the trip until the app was restarted.

- **A "When You Shop" card on Overview**, trips by day of the week. The day-of-week counts came out of `getShoppingPatterns`, which had no callers; they are now part of the summary the screen already loads, so the card costs no extra query and the dead method is gone.

### Changed
- **The spending trend is bucketed by week over 30 days, by month beyond it.** Calendar months are the wrong unit for a 30-day window: it straddles two of them, so the chart was a two-point line pitting a handful of days against a full month — a cliff or a spike that moved with today's date rather than with spending. Worse, when every trip in the window happened to fall inside one calendar month there was a single point and the chart disappeared behind "not enough data". On the default tab, at the default period. Four or five weekly buckets are comparable to each other, and the subtitle now says which unit is on screen.

- **Opened tabs stay mounted.** Each tab was unmounted on the way out, so a trip from Prices to Overview and back cleared the selected item in the comparison card and refetched all three of its datasets. Tabs are still mounted lazily — an unopened Prices tab still costs nothing.

- **The period filter and the TOTAL SPENT block are hidden on the Prices tab**, which reads neither: the comparison card carries its own range chips, and two live period controls on one screen only ever disagree with each other.

- **The category pie adds up to the figure in the middle of it.** The centre printed the period total while the slices summed to something else — categories past the sixth were dropped from the ring, and a receipt carries spend that no item on the list accounts for. A single "Other" slice absorbs both, so the ring and the number inside it are the same quantity.

- **Most Purchased shows what an item costs.** Rows carry the per-unit average and, where a row covers more than one unit, the unit count — `averagePrice` was computed and never rendered. Names are shown as the user typed them rather than lowercased.

- **The store "Best avg" badge is now "Smallest trips".** It marks the lowest average spend per trip, which is the shop you nip into for milk, not the cheapest one — and on a tie every matching store used to be badged at once. Only one is now.

### Fixed
- **Frequently Bought could never offer more than ten items.** It sliced twenty off a list the summary had already capped at ten, then re-sorted it by the field it was already sorted on. It asks for twenty now.

### Performance
- Analytics chart data is memoised. It was rebuilt on every render — date formatting, per-store label truncation and all — and the store list recomputed a min and a max across every store inside the per-store loop, for each row.

## [1.39.13] - 2026-08-26

### Fixed
- **Analytics counted a six-pack as one item at one unit's price.** `Item.price` is per-unit app-wide — `ReceiptMatchScreen` divides a receipt line down to get it, and both the shopping running total and the History totals multiply it back up — but the analytics aggregation summed the bare price. Six eggs at £2.50 landed as £2.50. Category spend, top-item spend and the no-receipt-total fallback were all short by the quantity. Lists carrying a receipt total were unaffected in the headline figure, since that number comes off the receipt.

- **Things you decided not to buy were counted as bought.** Completing a trip leaves unchecked items on the list; `completeShoppingFast` only records how many there were. Those items keep whatever price was predicted or typed for them, and the aggregation's only filter was `price !== null` — so an item you walked past fed category spend, the top-item counts and the item tally. This is the same trap `shoppingStats` documents for the running total in v1.30.2, which analytics never got. Only checked, priced items count now.

- **The category percentages did not add up to 100.** They divided category spend, which is a sum of item prices, by the period total, which prefers receipt totals. The two are different numbers — a receipt carries spend no item on the list accounts for. Percentages are now taken against the itemised total, and that shortfall is reported separately as `unitemisedTotal`, clamped at zero because a till discount can put the items above the receipt.

- **A group with trips but no prices produced `NaN`.** The empty state only checks the trip count, so that input renders, and the divisions behind `averagePerTrip` and the store bar widths had no zero guard — a `NaN%` width reaches the layout. Every division in the aggregation goes through a guarded helper now.

### Changed
- Top items fold spellings together on `itemGroupKey`, so "avocado" and "avocados" are one row as they already are on the Prices tab. The row is labelled with the spelling used most — never the group key, which is a lookup value that would put "hummu" in a shopping list when added from Frequently Bought. `purchaseCount` still counts lists appeared on; a new `unitsPurchased` counts units, and `averagePrice` is now per unit.

## [1.39.12] - 2026-08-26

### Changed
- **The Analytics summary ran a database query per completed list, twice.** `getAnalyticsSummary` fetched each list's items in its main loop and then `calculateMonthlyTrend` fetched them all over again to compute the same list totals a second time. On a year of history that is hundreds of sequential round-trips for one screen. Both passes now share a single `getItemsForLists` call — the batch query that already existed and that `PricePredictionService` was already using.

  The arithmetic moves out of the service into `analyticsAggregation.buildAnalyticsSummary`, a pure function over the lists and their items, so it can be tested without standing up a database. The service keeps the I/O and nothing else. No numbers change in this release.

- `getBudgetPerformance` had no callers and covered ground the Budget tab already owns; removed.

## [1.39.11] - 2026-08-23

### Fixed
- **A live session with no profile behind it was permanent.** Sign-up creates the Firebase Auth account first and writes `/users/{uid}` second, so an interruption between the two leaves credentials that work and a profile that is not there — and a deletion interrupted after step 6 leaves exactly the same thing. Neither entry point could get out of it: `signIn` threw `User data not found` on every attempt for ever, and the app's own listener only ever reported a profile that *exists*, so the splash screen stayed up indefinitely with the auth listener firing normally against a valid user. No logout, no retry, no way to delete the account either, since deletion starts by reading the profile that is gone.

  A missing profile is now repaired rather than reported. `ensureUserProfile` writes the same record sign-up would have, as a **transaction** rather than a `set`, because it runs alongside the sign-up paths that write the profile themselves and the fuller record they write has to win — the updater aborts on any existing value. `signIn` repairs instead of throwing, `signInWithGoogle`'s new-user path now shares the same helper instead of a third copy of the literal, and the profile listener repairs once per sign-in and falls back to reporting no user, which at least lands the app on the sign-in screen, if the repair itself fails.

  The repair is suppressed while `deleteUserAccount` is running. Step 6 removes the profile deliberately, and recreating it there would strand a `/users` entry behind an account about to stop existing — the inverse of the bug.

## [1.39.10] - 2026-08-23

### Fixed
- **The same approval window was open on the joined branch, which 1.39.9 did not touch.** Approving a request only flips its `status` to `approved`, and completing the join never removes it, so the request that admitted an account is still on file for as long as the account exists — and it is still what authorises writing `memberIds/{uid}`. Deleting a joined account therefore had the identical race 1.39.9 closed for pending ones: the `memberIds` entry goes, a member acting on the stale request writes it back, step 6 removes the profile, and the entry is unremovable. The request is now removed first here too. Removing one that was never there is permitted for the account itself, so an account that created its group rather than joining one is unaffected.

- **The Google credential was revoked before the step that needed it.** Revoking the OAuth grant ran as step 9, immediately before the deletion — and the deletion's retry re-presents the credential minted during the preflight. Revoking first invalidates it, so every Google account would have skipped past the retry to the sign-out fallback the moment the retry was needed at all. The revoke now runs after the account is gone, which is where it belongs: it is a Google-side call and needs no Firebase session.

## [1.39.9] - 2026-08-23

### Fixed
- **A member approving at the wrong moment could still mint an unremovable phantom.** Raised by automated review of 1.39.6 and confirmed against the rules. That release split the pending-deletion cleanup into two writes, `memberIds` first, on the reasoning that dying between them should leave the recoverable leftover. But the join request is what *authorises* an approval — both the `.write` and the `.validate` on `memberIds/{uid}` require it to exist — so leaving it in place while the entry is removed keeps the approval window open across the gap. A member approving there writes the entry back, step 6 then removes the profile, and the entry becomes exactly the phantom member 1.39.5 hardened the rules against: its removal rule admits only the account itself, which no longer exists.

  The two removals are now the other way round. Taking the request down first shuts the window, since an approval with no request is denied outright. The cost is the case the original order was avoiding — dying in between can leave a `memberIds` entry — but that one is recoverable rather than permanent: the account is still alive at that point, so it can remove its own entry on the next attempt. A concurrent approval is not a rarity here, since it is precisely what a member staring at a stale pending request does.

## [1.39.8] - 2026-08-23

### Fixed
- **Deleting an account destroyed its data and then failed, leaving an account that could not load, log out or retry.** Firebase only accepts `user.delete()` shortly after a sign-in, and that call was the tenth of ten steps. Any deletion more than a few minutes after signing in — the common path, not an edge case — ran the nine destructive steps and was then refused with `auth/requires-recent-login`. The RTDB profile was gone, the auth account survived, and on relaunch the app sat on "Loading…" indefinitely: the profile listener only reports a profile that exists, there is no logout on a splash screen, and retrying is impossible because step 1 reads the `/users/{uid}` that step 6 already removed. Reproduced against production while verifying 1.39.7, with the exception in logcat.

  The preflight is now unconditional rather than guessed from `metadata.lastSignInTime`, whose window is undocumented — a wrong guess would reintroduce exactly this bug. Before anything is touched, `deleteUserAccount` reauthenticates: a Google account through the Google prompt, a password account through a new confirm-password modal in Settings. `getReauthMethod()` tells the screen which one to collect *before* the call, so the requirement is never discovered by throwing an error through two lossy layers — the `Failed to delete account:` wrapper and `sanitizeError`'s allowlist, which is what turned the original failure into "Something went wrong. Please try again." Google wins when both providers are linked, since it needs nothing typed. A prompt returning a different Google account is refused up front rather than after the data is gone, and backing out of it deletes nothing and reports no success.

  The tenth step keeps a bounded retry for the case the preflight cannot cover — the cleanup between them is many round-trips — presenting the credential it already holds rather than asking twice. If that still fails, the account is signed out before the error is raised, so the profile-less-but-authenticated state that hangs on "Loading…" is not reachable from here at all. Twelve tests cover the preflight, the two providers, cancellation, the wrong password, the retry and the sign-out fallback; the five existing deletion tests now pass a password, which is what the module requires of every caller.

## [1.39.7] - 2026-08-23

### Added
- **Unit tests for the membership flow, which had none.** Every change in 1.38.13 through 1.39.6 touched `submitJoinRequest`, `cancelJoinRequest`, `completeJoinAfterApproval`, `reconcilePendingMembership` or `deleteUserAccount`, and the suite stayed at exactly 182 tests throughout — because not one of those functions was covered, so rewriting `set` into a multi-path `update` could not break anything. Fourteen tests now assert the *shape* of those updates rather than merely that a write happened: the request paired with its pointer, the claim paired with the pointer's removal, and each of the three branches `deleteUserAccount` can take. The two covering 1.39.6 were confirmed to fail against the previous implementation and nothing else did.

  Worth recording for whoever writes the next one: `jest.config.js` maps every `@react-native-firebase/*` specifier onto a single stub file, so a `jest.mock` factory per package silently collides and only the last registered survives — auth appeared to be ignored while database worked. One factory carrying every export the module imports is the way around it. `@env` is synthesised by the dotenv babel plugin and needs `{ virtual: true }`.

## [1.39.6] - 2026-08-23

### Fixed
- **Deleting an account with a pending join request left the request behind.** The cleanup added in 1.39.1 sent both leftovers as one atomic update. For a request that was never approved there is no `memberIds` entry, the rule refuses to remove an entry that is not there, and the whole update was therefore denied — taking the join request leg down with it. The `.catch()` recorded the failure and the deletion carried on, so the group kept a pending request from an account that no longer existed, and a member approving it produced the phantom member that 1.39.5 now refuses outright. Confirmed against the emulator: the two-leg update is denied, the request on its own succeeds. The two removals are now independent, `memberIds` first — if the app dies between them an orphaned request remains, which a member can still reject, whereas the other order would leave an entry for an account about to stop existing that no one is permitted to remove. The denial on an absent entry is swallowed rather than recorded, since it is the expected case rather than a fault.

## [1.39.5] - 2026-08-23

### Fixed
- **A join request could outlive the account that filed it, and approving it minted a member nothing could remove.** An account can be deleted while its request is still on file — see 1.39.6 for the path that made this the common case rather than a rarity — and nothing stopped a member from approving it afterwards. That wrote a `memberIds` entry for a uid whose profile no longer exists: a permanent phantom member, because the rule permitting that entry's removal requires you to *be* that account, and it is gone. `memberIds/{uid}` now validates that the account still has a profile. The guard reads the pre-write state, so the two writes that legitimately create an entry are unaffected — group creation and approval both act on profiles that already exist — and both were verified to still pass, along with a new denial for the deleted-account case, which was confirmed to succeed without the guard.

## [1.39.4] - 2026-08-23

### Changed
- **Dropped an unreachable disjunct from the `memberIds` guard added in 1.39.3.** The new `.validate` accepted an entry that already existed, on the reasoning that re-writing a member's own entry should stay idempotent. Probing the rule showed that branch can never decide anything: every write that reaches `.validate` has already satisfied `.write`, which admits only the account itself — covered by the first disjunct — or an approver acting on a join request, covered by the third. An entry that exists but has neither is refused before `.validate` is consulted. Dead logic in a security predicate is worse than no logic, because the next reader takes it for a grant that exists, so it is gone. Behaviour is unchanged and the suite is unchanged at 42 assertions.

### Added
- **Two forgery variants the suite did not cover.** The 1.39.3 assertions send the group create and the profile claim as separate writes; the single multi-path update is the form an attacker would actually send, and the shape that defeated the `root`-based guard in 1.38.12, so it is now asserted in its own right. The second covers a write aimed at the `memberIds` map rather than at one entry under it — that node has no `.write` of its own, so it is refused by the absence of permission above it rather than by any rule naming it, which is precisely the kind of guarantee that disappears silently when a rule is added later.

## [1.39.3] - 2026-08-23

### Security
- **A member could read the profile of any account whose uid they knew.** The read rule on `/users/{uid}` gained a third disjunct in 1.38.13 deriving permission from `familyGroups/{myGroup}/memberIds`, on the reasoning that `memberIds` is the authoritative membership record everywhere else in these rules. It is — but nothing constrained who could appear in it at creation time. The group node's `.write` rule asks only that the creator is *among* the members, not that they are the only one, and RTDB stops consulting `.write` once a shallower path grants it, so the entry-level guard that demands a matching join request was never reached for a group arriving whole. Creating a group listing an arbitrary uid alongside your own and pointing your profile at it was therefore enough to read that account's email address, display name, role, group membership and terms acceptance, with no consent from it and nothing shown to it. Confirmed against the rules emulator rather than argued: the read succeeded, and the same read with the fabricated entry removed was denied.

  The uid is the only prerequisite, and normal use hands them out — every current and former co-member, every account that has filed a join request to a group you belong to, and every `createdBy` on a list or item you can read. An account that left a shared group could be re-added to a throwaway group and read indefinitely afterwards.

  Fixed at the point of forgery rather than at the read: `memberIds/{uid}` now carries a `.validate` requiring the entry to be your own, to already exist, or to be backed by a join request. `.validate` is evaluated at every level regardless of where write permission was granted, which is exactly what the ancestor-write path bypassed. The read disjunct is unchanged and the two-principal approval handshake is untouched — the four new assertions include the legitimate approval and a single-member create, both of which must keep working, and the two exploit assertions were verified to fail against the previous rules. Rules suite 40/40.

## [1.39.2] - 2026-08-23

### Fixed
- **A failed reconciliation attempt disabled reconciliation for the rest of the session.** The once-per-sign-in guard added in 1.39.0 was set before the attempt rather than after it, so a single failed read — and a stranded account is exactly the one likely to be offline — left the account on "Join or Create Family Group" until the app was restarted, which is the situation the reconciliation exists to end. The guard is now released when the attempt fails, so the next profile update retries.
- **The restored waiting screen could orphan an approval listener.** If a request was submitted while the mount-time `getCurrentUser()` read was still in flight, the restore overwrote the listener reference instead of replacing the listener, leaving the first one live and able to complete the join a second time.

## [1.39.1] - 2026-08-23

### Fixed
- **Deleting an account that had been approved but never joined left it in the group forever.** `deleteUserAccount` gates every piece of group cleanup on the account's own `familyGroupId`, which for such an account is still null — so the `memberIds` entry survived the deletion, and once `/users/{uid}` was gone the only account permitted to remove that entry no longer existed. The group was then left with a member id that resolves to nothing, which is precisely the state that blanked the member list before 1.38.13. Deletion now also clears the `memberIds` entry and the join request through the `pendingGroupId` pointer added in 1.39.0.

## [1.39.0] - 2026-08-23

### Added
- **A join request now survives the app closing.** Making someone a member takes two writes that no single account can perform: the approver writes `memberIds/{uid}`, and only the requester may write their own `/users/{uid}/familyGroupId`. The requester's half ran exclusively from a listener registered at the moment the request was submitted, so if that app was not sitting on the waiting screen when approval landed — closed, restarted, reinstalled — the membership never completed. Reproduced on device on 2026-08-23: the approved account signed back in to "Join or Create Family Group", and re-entering the invitation code was refused with "You are already a member of this family group", because it *was* in `memberIds`. There was no way back from inside the app. `submitJoinRequest` now writes `/users/{uid}/pendingGroupId` in the same update as the request itself — the request alone records no group the account can find afterwards — and a sign-in that sees a pointer with no `familyGroupId` checks `memberIds` (self-readable by rule) and finishes the join. The waiting screen is likewise restored from the pointer rather than from component state, so a restart mid-wait shows the request rather than an empty form, and cancelling clears request and pointer together.

## [1.38.13] - 2026-08-23

### Fixed
- **Approving a join request emptied the Family Members list for the whole group.** Found on a device run, not in the repository: after approving, Settings showed "Share your invitation code above to shop together" and all three real members were gone. Two writes are needed to make someone a member and no single account can perform both — the approver writes `memberIds/{uid}`, and only the requester may write their own `/users/{uid}/familyGroupId`. Between the two, the group holds a member whose profile still reads `familyGroupId: null`, and the read rule on `/users/{uid}` asked for the two profiles' `familyGroupId` to be *equal*, so that one profile was unreadable. `loadFamilyMembers` fetched every member with `Promise.all`, so the single denied read rejected the whole call, propagated out of `loadSettingsData` and left the member list at its initial empty value — with the outer `catch` swallowing the error, nothing pointed at the cause. Three changes, each of which would have prevented the blank list on its own: read access to a profile now also derives from `memberIds`, which is the authoritative membership record everywhere else in these rules; the member load uses `allSettled`, so an unreadable member costs one row rather than the list, and the rejection is recorded; and the join-request listener is registered *before* the member load, having previously been unreachable once the load threw. The rule change is added as a third disjunct rather than replacing the equality check — keying only on `memberIds` would newly deny a user who has `familyGroupId` set but no `memberIds` entry, the stranded case tracked since 1.38.10.
- **Correction to 1.38.9.** That entry justified leaving the join-request `displayName` unbound on the grounds that it "is null on both account-creation paths". It is not: `EmailSignUpScreen` requires a name and passes it to `signUp()`. The conclusion still holds — an unverified string should not be the identity line — but the reason given was wrong, and the two-line approval row is the common case rather than the edge one.

## [1.38.12] - 2026-08-22

### Fixed
- **Creating a family group was rejected by the rules, and had been since 2026-05-06.** Confirmed live, not just in the repository: the guard reached `master` on 2026-05-06 and every `master` build since has run the rules deploy. `createFamilyGroup` writes the group, the invitation and `/users/{uid}/familyGroupId` in one atomic update, and the third path was gated on the caller already appearing in the new group's `memberIds` — read through `root`, which is the state *before* the operation, so the group being created alongside it was not visible and the whole write was refused. Joining an existing group was unaffected, which is why it went unnoticed. The guard now also accepts the **resulting** state, reached with `newData.parent().parent()`, which does see the sibling paths of a multi-path update. That is a tighter fix than the escape hatch `invitations` uses for the same situation, which admits any group that does not exist yet: this one still requires membership, only in the state the write produces rather than the one it started from. The self-admit it appears to open — bundling `familyGroupId` and a `memberIds` entry into one update so the profile leg sees the membership it just fabricated — is refused by the `memberIds` rule, which admits a uid only against a join request the account itself filed. The `it.failing` marker left in place last version is now a passing assertion, and the phantom join the guard exists to stop has explicit denials for the first time.

## [1.38.11] - 2026-08-22

### Fixed
- **The rules test suite names the project it runs against.** `firebase emulators:exec` was relying on whatever default project the CLI could find, which on a developer machine is the one in the global firebase-tools config and in CI is nothing at all — there is no `.firebaserc` in the repository. The step would have failed to resolve a project before Jest ever started. It now passes `--project demo-shopping-rules` explicitly, matching the id the test environment uses; the `demo-` prefix is the reserved form that needs no credentials.

## [1.38.10] - 2026-08-22

### Changed
- **Leaving a family group now removes your `memberIds` entry in one place.** `memberIds` is the list every read permission on a group derives from, so a user who detaches from a group but keeps an entry in it would go on reading its lists, items, prices and store layouts. Deleting your account was the only code that removed one. This is not currently reachable — the detach path only runs once the group is already gone, and there is no leave-group or remove-member feature to create a live user detached from a live group — but the removal now lives in a single `removeSelfFromGroup` helper that both paths call, so the first feature that does detach a user cannot forget it. The helper lets failures propagate, and only the detach path ignores them — there, the group has already gone and the rule requires the entry to still exist, so a denial is the expected case. Account deletion must not ignore it: it goes on to remove the user record and the auth account, and a stranded `memberIds` entry for a uid that no longer exists could never be removed afterwards, since the rule permitting that write requires you to *be* that user.

## [1.38.9] - 2026-08-22

### Security
- **The approve/decline decision was based entirely on strings the requester chose.** A join request was validated for having a `displayName` and an `email`, never for either matching the account making it — and the approval row led with the display name. So a request could arrive labelled "Mum" and be approved on that basis. This matters more than it looks: the invitation code is about 2^40 and cannot be enumerated, which means the human approval *is* the second factor, and it was being shown unverified text. The `email` on a join request is now bound to the requester's verified token, checked per field rather than on the request as a whole — a check on the whole request would not re-run if only the email were overwritten afterwards, which is a two-write bypass. `submitJoinRequest` reads the email from the auth token instead of the user record, so the write matches the rule by construction. The display name is deliberately *not* bound: it is null on both account-creation paths, so binding it would couple two nullable values and verify nothing.
- **A member could fabricate a join request for any account and then approve it.** Writing `joinRequests/{uid}` was open to any member for any `uid`, and the rule admitting someone to `memberIds` asks only whether a request exists — so one member could manufacture the request and immediately satisfy the check, adding an account whose owner never asked to join and never consented. Request creation is now restricted to the account making the request; members may still write `status` on requests that already exist, which is what approving and rejecting do. The practical impact was limited — `users/{uid}/familyGroupId` still requires you to be that user, so the added account was never really pulled into the group and its own data stayed unreadable — but it inflated `memberIds`, which is the list every read permission on the group is derived from.

### Changed
- **The join-request row leads with the email address.** It used to show the display name in the primary line and the email underneath only when a display name existed — so the unverified string was prominent exactly when it was present, and the verified one was demoted. The email is now the identity line and the display name sits beneath it as a hint.

## [1.38.8] - 2026-08-22

### Security
- **Any member could delete an entire family group.** The rule authorizing the whole-group delete asked only whether the caller was a member, so one modified or compromised account could null `/familyGroups/{id}` and take every list, item, price record, store layout and category history with it, however many other people were in the group. The client only did this when the last member left, but that check ran on the device, which is not where an authorization decision can live. The permission is gone: a client may now create a group and nothing else. The one legitimate caller — deleting your own account as the last member — removes its own `memberIds` entry instead, retiring the invitation code first, since that write is itself only permitted while still a member. What is left behind is an unreadable, unjoinable node: `memberIds` disappears once empty and every read on the group is gated on having an entry in it. That is storage to sweep up, not data anyone can reach.

## [1.38.7] - 2026-08-22

### Added
- **`database.rules.json` has tests.** It is the sole authorization boundary for every family group's lists, items, prices and store layouts, it is ~8.5 KB of nested expressions, and it had no test of any kind — while `android-build.yml` deploys it to the live database on every push to `master`. The failure mode of a wrong rule is a locked-out user, not an exception someone catches. `npm run test:rules` now runs an allow/deny suite against the Firebase database emulator: group creation and the tier lockout, member and non-member reads, self-removal from `memberIds`, and the full join-request handshake including who may approve. It runs in CI on every push and pull request. These tests live under `jest.rules.config.js` rather than the main config, which uses the React Native preset and stubs `@react-native-firebase/*` — rules tests need the web SDK talking to a real emulator under Node — and they are excluded from the coverage ratchet, since they exercise a JSON rules file rather than any module under `src/`.

### Deferred (tracked, not yet applied)
- **Creating a family group is rejected by the rules, and has been since 2026-05-06.** The first thing the new suite found. `createFamilyGroup` writes the group, the invitation and `/users/{uid}/familyGroupId` in one atomic update; that third path is gated on the caller already appearing in the new group's `memberIds`, read through `root` — which is the state *before* the operation, so the group created in the same update is not visible yet and the whole write is refused. Joining an existing group is unaffected; only creating a new one. The `invitations` rule carries an explicit escape hatch for exactly this situation and the `users` rule does not. Recorded as a deliberate `it.failing` test rather than fixed here, so it stays visible and turns red the moment it starts passing. *Resolved in 1.38.12.*

## [1.38.6] - 2026-08-19

### Changed
- **The legal documents now name who you are contracting with.** Both read "we", "us" and "our" throughout without ever saying who that was — the Terms said the App "is owned by us" and called the agreement one "between you and Family Shopping List", which is the product, not a party. Both documents now name sinful1992: the Terms as the operator and the counterparty to the agreement, the Privacy Policy as the **data controller**, which is what the GDPR section needed and did not have. The same name is on `LICENSE`, so the three agree.
- **`CURRENT_TERMS_VERSION` is 2.** An acceptance record points at a version number, so the number has to move when the words do — otherwise a stored acceptance of version 1 refers to text that no longer exists. Every user re-accepts on next launch, which on a closed testing track is a handful of testers.

## [1.38.5] - 2026-08-19

### Added
- **A LICENSE file, because the claim of one had no file behind it.** The README had said "Proprietary - All rights reserved" since February and the repository contained no licence at all. Copyright exists without one — but with no file stating the terms, anyone with access to the code has to infer what they may do with it, and a line in a README is not where that belongs. `LICENSE` now says it explicitly — no right to use, copy, modify or distribute is granted by the code being readable; access given to a collaborator confers no ownership; third-party dependencies keep the licences their own authors granted; and end users of the published app are covered by the in-app Terms of Service in `src/legal/`, not by this file. `package.json` carries `"license": "UNLICENSED"` to match, which is the npm-registry marker for proprietary and pairs with the `private: true` that was already there.
- **A release-status section in the README.** The app is on Google Play but on a **closed testing** track: not publicly listed, not in search, installable only by invited testers who accepted the opt-in. Nothing in the repository said so, so the install instructions read as though anyone could get it. iOS is recorded as unreleased — the codebase builds, but nothing has been submitted.

### Changed
- The Play Store deployment step says "roll out to the closed testing track" rather than "submit for review", which is the step that actually applies at this stage.

## [1.38.4] - 2026-08-14

### Changed
- **The item sheet's buttons no longer sit flush on the navigation bar.** 1.38.3 got them out from under it, but padded by exactly the inset — and an inset is the line nothing may be drawn below, not spacing. The result was a sheet with 20dp of air on every edge except the bottom, where Delete/Cancel/Save landed right on the bar with their touch targets abutting its own. `ModalBottomSheet` now pads by the inset **plus** `SPACING.lg`, matching the footers' existing `paddingTop`, so the button row sits in a symmetric band. Applied in the sheet rather than in `useBottomInset`, whose other consumers — the FAB, Filter, Frequently Bought, Price History — are positioned against the bar deliberately and should not move.
- Delete on the Details sheet and Clear on the Size sheet take `RADIUS.large`, the radius Cancel and Save already used. Three pills in one row read as one control group; one of them at `RADIUS.medium` read as a slip.

## [1.38.3] - 2026-08-13

### Fixed
- **The 1.38.0 navigation-bar fix did nothing, and this makes it work.** `useSafeAreaInsets()` returns `bottom = 0` inside an RN `<Modal>` on Android: a modal is its own native window and the app-level `SafeAreaProvider` never measures it. Measured on a Pixel 6 AVD with 3-button navigation, the same hook returned **48 on the screen and 0 in the sheet rendered over it** — so every bottom sheet fell back to its floor and the buttons stayed under the navigation bar. `useBottomInset` now also considers `initialWindowMetrics`, a static snapshot taken before first render that the modal window cannot zero out, and `ModalBottomSheet` additionally nests its own `SafeAreaProvider` so its value stays live if the navigation mode changes. Verified on device: the Details footer moved up ~32dp and Delete/Cancel/Save now sit clear of the bar.
- The Android floor went back to 20, matching the literal it replaced. 1.38.0 had lowered it to 16, which was a 4dp regression on any device with no bar to clear.

## [1.38.2] - 2026-08-13

### Changed
- **The analytics category pie shows six slices, up from five.** Spend that used to fall in one `Pantry` slice now spreads across several, so a top-five cut had started hiding most of the basket. Six is every accent the theme defines; going wider needs new tokens in both palettes, which belongs with the palette work in `docs/DESIGN_AUDIT.md`. The slice count now reads `PIE_COLORS.length` rather than a second literal, so the two cannot drift apart and leave a slice drawn in the fallback grey.
- `docs/store-layouts.md` retabled for the new categories. Most now need one seed rather than several — the ones that needed several were precisely the ones that got split.

## [1.38.1] - 2026-08-13

### Added
- **Eleven more categories, splitting the four that sprawled.** Twelve buckets could not describe a real shop: fruit alone runs past one bay, and `docs/store-layouts.md` already recorded which categories its own seed items came back split across — Produce, Pantry, Beverages and Household. Those four are now Fruit / Vegetables / Salad & Herbs; Tins & Packets / Pasta & Rice / Cereals / Cooking & Condiments / Snacks & Sweets; Soft Drinks / Tea & Coffee / Alcohol; and Cleaning / Kitchen & Paper. Cheese and Deli & Chilled are new too, and `Dairy` keeps its id while its label widens to "Dairy & Eggs". **No migration**: `items.category` is a free-text string column and unknown values already resolved to null everywhere, so the change is additive. An id is permanent — it is what lands in `items.category`, in `category_history.category`, in `store_layouts.category_order`, and raw as an RTDB path segment in `CategoryHistoryService`, so renaming one would orphan all four. A test asserts no id contains `. # $ [ ] /`, which Firebase rejects in a key.

### Fixed
- **Categories missing from a saved store layout landed after `Other`.** `completeCategoryOrder` appended what an order left out, which was harmless when the canonical list never grew. Splitting the categories made it harmful: a layout saved beforehand holds only the old twelve, so all eleven new categories would have arrived below the catch-all bucket, at the far end of the shop walk, repairable only by tapping the up arrow once per position. Missing categories are now inserted after the nearest earlier category the stored order does contain — the stored order survives untouched, and a new category appears beside whichever one it was split from.

### Changed
- **The category picker scrolls and is grouped** into Fresh / Chilled & Frozen / Cupboard / Drinks / Household. Two columns of twenty-odd cells no longer fit under the sheet's `maxHeight`, and the footer has to stay reachable; the headings are there because a flat run of that many is a lot to scan. Retired categories are not offered — but an item still filed under one shows it under a "Currently" heading, so the selection is visible rather than reading as uncategorised.

## [1.38.0] - 2026-08-13

### Added
- **`useBottomInset`**, the one place that decides how much room the system navigation bar needs. Replaces a `Platform.OS === 'ios' ? 34 : 20` literal that had been copy-pasted into three files and forgotten in a fourth. It floors at the old value, so a device with nothing to clear is unaffected — which also covers the case where an RN `<Modal>`, being a separate Android window, reports a zero inset.

### Fixed
- **Modal buttons sat underneath the Android navigation bar.** The app enables edge-to-edge and targets SDK 36, so it draws under the transparent nav bar unconditionally, but every bottom-anchored sheet padded itself with a hardcoded 20 — less than half the ~48dp a 3-button nav bar occupies. Save, Cancel and Delete on the item Details/Price/Size sheets were partly or wholly untappable, as were the footers of Filter and Frequently Bought; Price History had no bottom padding at all. The floating action button had the same 20. All now measure the real inset. Same class of bug as the Settings screen fix in 1.36.x, generalised this time rather than patched in one place.

## [1.37.1] - 2026-08-03

### Removed
- **The Tesco store-layout preset, withdrawn before release.** 1.37.0 was never tagged or merged, so this removes the feature rather than deprecating it. The preset was a hardcoded category order matched on the store name — it never contacted Tesco and contained no Tesco data, just a guess at a generic UK superstore wearing Tesco's name. That is worse than no feature: it implies the app knows where things are in a shop it has never had data about. The order that would make this worthwhile is the per-store aisle order in Tesco's own app, which is reachable only by reading it manually — Tesco's Terms prohibit automated access to the site *and* the Clubcard app, "for any purpose", with no personal-use exception. `storeLayoutPresets.ts` and its tests are gone; `completeCategoryOrder` moved to `categoryOrder.ts`, which is what the module now honestly contains.

### Fixed
- **A category missing from a stored order made its items render nowhere.** (Kept from 1.37.0, independent of the preset.) The unchecked list is built by filtering `categoryOrder`, and the sibling branch that catches stragglers filters for keys that *aren't* known categories — so a known category absent from the order fell between the two and its items silently vanished. Reachable without any preset: `mapFirebaseStoreLayout` defaults `categoryOrder` to `[]`, so a layout synced from another device could empty the list. Orders now pass through `completeCategoryOrder`, which appends whatever they leave out.

## [1.37.0] - 2026-08-03 [WITHDRAWN — never released, see 1.37.1]

### Added
- **Store-layout presets, seeded with Tesco.** A list at a store with no saved `StoreLayout` fell back to `CategoryService`'s declaration order, which reflects nothing about walking a shop — Produce, Dairy, Meat, Fish, Bakery, Frozen… `getPresetCategoryOrder` now matches the store name (lowercased substring, so "Tesco Extra Watford" hits) against a preset table and returns that order instead, so a Tesco list opens roughly in aisle order before anyone touches it. Resolved at display time in `ListDetailScreen`, deliberately *not* inside `StoreLayoutService`: returning a synthetic layout would make `storeLayout` truthy and break the `isLayoutDirty`/Save gating that depends on it being null when nothing is persisted. A saved layout still wins, and the first manual reorder-and-save replaces the preset for good. The order is a starting guess at a generic UK Tesco superstore, not data from Tesco — it is one array literal to correct.

### Fixed
- **A category missing from a stored order made its items render nowhere.** The unchecked list is built by filtering `categoryOrder`, and the sibling branch that catches stragglers filters for keys that *aren't* known categories — so a known category absent from the order fell between the two and its items silently vanished. Reachable today without presets: `mapFirebaseStoreLayout` defaults `categoryOrder` to `[]`, so a layout synced from another device could empty the list. Orders now pass through `completeCategoryOrder`, which appends whatever they leave out. A test asserts each preset is an exact permutation of the twelve `CategoryType` values, which is what stops a typo in the table from reintroducing this.

## [1.36.17] - 2026-07-27

### Added
- **Tests for the late-landing Firebase write** introduced in 1.36.15 — an async race no device pass can exercise on demand and nothing else would catch if it broke. Covers all four outcomes: the write times out and a fallback is queued; it lands afterwards and the fallback is dropped, the record marked synced and the banner notified; it genuinely rejects and the fallback stands; it lands in time and nothing is queued. Note the module factories need `__esModule: true` or Babel's interop nests the mock under a second `default` and the singleton picks up an undefined `recordError`.

## [1.36.16] - 2026-07-27

### Changed
- **The sync banner no longer reads as a second store warning.** In `ListDetailScreen` it sits directly above the "No store selected" banner, and the two shared a tint (`yellowDim`) while disagreeing on geometry — one an inset rounded card with its own margins, the other full-bleed. Sync is now full-bleed with the same padding as its neighbour, tinted `blueSubtle` with a blue icon: informational and self-clearing, so it should not wear the warning colour. The Retry link picks up the underline the store banner's link already had. `blueDim` was the first pick and missed AA in the dark theme by 0.14 — `contrast.test.ts` now asserts both this pair and the body copy on it, since it asserts token pairs rather than call sites.

## [1.36.15] - 2026-07-27

### Fixed
- **Adding an item while the screen locked left the typed text in the field and a sync that never cleared.** `ItemManager.addItem` was the only write path that *awaited* `SyncEngine.pushChange` (`updateItem`, `addItemsBatch` and `updateItemsBatch` all fire-and-forget), so the input cleared only once the network write settled. Lock the phone mid-add and Doze freezes the JS timers, so the 30s `withTimeout` doesn't elapse in app time either — the item was already in the list, but the field still held its text on return. Now fire-and-forget, matching the rest of the file.
- **A timed-out push left a phantom "N changes not synced".** `withTimeout` rejecting does not cancel the Firebase write: RTDB keeps it in its outbox and lands it when connectivity returns. The queued fallback outlived the write that had already succeeded, so the banner reported a pending change indefinitely and the queue replayed the same payload on the next retry. `pushChange` now holds on to the write promise and, if it lands late, drops the queued fallback and marks the record synced. A genuine rejection leaves the queue entry alone.

## [1.36.14] - 2026-07-26

### Changed
- **Auth moved to the Firebase modular API** — the last of the four, across `AuthenticationModule`, `RevenueCatContext`, `UrgentItemManager`, `UsageTracker` and `useSettings`. No namespaced `@react-native-firebase` call remains in `src/` or `App.tsx`.
  - The **User object's methods are deprecated too**, not only the `auth()` accessor — verified in the SDK source, where the modular wrappers pass a sentinel argument that suppresses the warning. So `user.getIdToken()`, `getIdTokenResult()` and `updateProfile()` all had to move, which is how `useSettings` entered scope: it never imported from `@react-native-firebase/auth`, it just called a deprecated method on a user handed to it.
  - `getCurrentFirebaseUser()` now returns the modular `User` type, aliased to `FirebaseUser` because the app has its own `User` model.
  - Two behavioural details preserved deliberately. `GoogleAuthProvider.credential(idToken, accessToken)` keeps **both** arguments — the one-argument overload is what caused the v1.27.1 `accessToken cannot be empty` crash. And in `RevenueCatContext` the optional chain short-circuited the entire promise chain when signed out; that is now an explicit `if (currentUser)` guard rather than a call on `undefined`.

## [1.36.13] - 2026-07-26

### Changed
- **Messaging moved to the Firebase modular API**, in `NotificationManager` and `App.tsx`'s deep-link `linking` config. `messaging.AuthorizationStatus` becomes the package's named `AuthorizationStatus` export. Both listener registrations (`onMessage`, `onTokenRefresh`, `onNotificationOpenedApp`) still return their unsubscribe and it is still wired into the existing cleanup — a dropped one would leak a listener silently, with no warning and no failing test to catch it. The three `auth().currentUser?.getIdToken()` calls in this file went modular at the same time rather than leaving it half-migrated; each became an explicit `currentUser ? await getIdToken(currentUser) : undefined` so the signed-out case still yields `undefined` as the optional chain did.

## [1.36.12] - 2026-07-26

### Changed
- **Crashlytics and Analytics moved to the Firebase modular API.** `@react-native-firebase` v22 deprecated the namespaced form (`crashlytics().log(...)`), and every call fired two dev warnings — one for the `crashlytics()` accessor, one for the method. `database` and `storage` were already modular; this starts on the four that were not. 32 call sites across the two files. Imports that share a name with one of the wrapper class's own methods are aliased (`log as crashlyticsLog`), so a call reads as the SDK's rather than a recursive one. `getCrashlytics()`/`getAnalytics()` are called per method rather than once at module scope, so the instance stays as lazily created as the namespaced accessor was — calling them at import time would touch Firebase before app init.

## [1.36.11] - 2026-07-26

### Fixed
- **Bar charts printed raw floats as their top labels.** Found on the AVD verifying 1.36.7: the Lidl bar in Store Price Comparison read `1.4614285714285715`. `showValuesAsTopLabel` renders `value` with no formatting, so any average that does not divide cleanly — or any total that is a float sum of 2dp prices — surfaces in full. Latent before this batch; the grouping fix makes it likelier by averaging over more records. All three currency bar charts (Store Price Comparison, Spend by Store, and the price modal's Price by Store) now render the label through a `topLabelComponent` at 2dp. Verified on device: the same bar reads `1.46`, and Spend by Store's labels match the Store Breakdown figures below it. `VolatileItemsChart` already rounded its values and is unaffected.

### Changed
- The generation counter added in 1.36.9 is now a single global counter rather than one per family group. Per-group only defends groups that already have a cache entry — and `clearAllData`, the out-of-band path `clearPriceVariantCache` exists for, is exactly the case where the group being read may have none, so a read in flight during account deletion could still cache rows that had just been deleted. A global counter closes that, and costs only an in-flight read its caching when an unrelated group is written.

## [1.36.9] - 2026-07-26

### Fixed
- **The spelling-group cache could be stored stale.** `getPriceVariants` fetched the rows, then cached the map it built — with no check that a write hadn't landed in between. The sync listener streams price records in via `child_added` while Analytics is loading, so the window is reachable, and losing it means a newly synced spelling stays invisible for the rest of the session rather than until the next write. Writes now bump a per-family-group generation, and a read only caches a map whose generation still matches. Not unit-covered: the interleaving needs the write to commit *during* the read's fetch, which cannot be forced without injecting into the adapter — a test written for it passed with the guard removed, so it was dropped rather than left as false cover.

## [1.36.8] - 2026-07-26

### Fixed
- **The price picker's search stopped matching plurals.** Follow-up to 1.36.7: with one spelling per item in the list, typing "avocados" no longer found a stored "avocado", because `includes` is not symmetric — which spelling you could search by depended on which had more records, so it read as intermittent. The filter now falls back to comparing group keys.

### Added
- DB-level tests for the grouping, against real WatermelonDB: one picker entry per group, both spellings' rows gathered whichever is asked for, look-alikes kept apart, per-family-group scoping, and a spelling first seen after the group was cached. That last one is the only cover on the cache invalidation. `clearAllData` deletes price rows outside `HistoryStorage`, so it now clears that cache too.

## [1.36.7] - 2026-07-26

### Fixed
- **Price history treated singular and plural spellings as different items.** The Prices tab listed "avocado" and "avocados" as two entries, and selecting either showed only half that item's purchases — enough to skew every average and to show the single-store card when the item had in fact been bought at two. The split is in the data: `price_history` is keyed on `itemName.toLowerCase().trim()`, so each spelling is its own key. Rather than migrate the column, both reads now resolve through a stem key (`itemGroupKey`, reusing the receipt matcher's stemmer): `getPriceHistoryForItem` gathers every spelling in the group, `getDistinctTrackedItems` returns one entry per group with the most-recorded spelling as its label. Fixing the read path rather than the call sites means Smart Savings, the volatility chart and the in-list price modal are all covered without a signature change or a backfill, and a newly written "avocados" row folds into the group on the next read. The legacy completed-list path is stemmed the same way, so a fresh install behaves like an upgraded one. The key is a lookup value and not a word ("hummus" keys as "hummu"), so labels always come from a stored `itemName`. Note the `-ss` guard means "glass" and "glasses" are deliberately left apart.

## [1.36.6] - 2026-07-26

### Added
- **Encoding guard.** `scripts/check-encoding.js` fails the build on any U+FFFD in a tracked source file. A replacement character is decoding damage rather than text, and nothing else in the stack can see it — TypeScript checks types, knip checks reachability, ESLint sees an ordinary text node. Wired into CI and the pre-commit hook. Verified against the real 1.36.5 defect: it flags all three occurrences.
- **Knip now runs in CI.** It was already invoked by the `pre-push` hook, but had no npm script and no CI step — so it was enforced only locally, and only for people who have the hook installed and don't pass `--no-verify`. Added `npm run knip` and a CI step; a stale `ignoreDependencies` entry was removed so its output is clean. Note it works at module-export level, so it does not catch unused object properties such as StyleSheet keys — it had been running on every push throughout, and never saw the 21 dead styles removed in 1.36.4.

### Fixed
- `scripts/pre-commit.sh` had drifted out of sync with the installed hook — the versioned copy was still the original nine-line test runner while the live hook carried the version and changelog checks, so a fresh clone got none of them. The versioned copy is now the source of truth.

## [1.36.5] - 2026-07-26

### Fixed
- **Smart Savings rendered the replacement character instead of `£`.** All three prices on that card — the potential-savings total, each item's best price, and each saving — rendered a replacement character. The file had been saved in the wrong encoding by a tooling pass back in PR #28, so the pound signs were stored as U+FFFD rather than U+00A3. It is the only file in `src/` affected.

## [1.36.4] - 2026-07-26

### Changed
- Removed 21 dead style definitions from `ListDetailScreen.styles.ts` (114 lines) left behind by earlier refactors, and the three empty `card` styles the analytics rebuild left in `ItemStoreComparison`, `VolatileItemsChart` and `SmartSavingsCard`. No behaviour change.

## [1.36.3] - 2026-07-26

### Fixed
- **Five modal buttons were unreadable in dark mode and the wrong colour in light.** The confirm buttons in the store picker, price editor, size editor, details editor and filter sheet each pinned the dark theme's gradient (`#6EA8FE → #A78BFA`) instead of taking `gradient.buttonStart`/`buttonEnd`, *and* drew their label with `text.primary` instead of `text.onAccent`. In dark mode that is white on a light blue — **2.42:1**, measured on device at 7.28:1 after the fix. In light mode the button rendered in the dark theme's pale gradient, matching nothing else on the screen. This is the same defect 1.35.2 and 1.35.3 fixed elsewhere; these five call sites were missed because the sweep covered screens, not shared components.

## [1.36.2] - 2026-07-25

### Fixed
- **The selected time period is visible in dark mode.** 1.36.0's segmented control marked the active segment with a raised `background.secondary` surface — an iOS convention that assumes a light ground. Measured against the control's own container it comes to **1.06:1** in dark and 1.22:1 in light, and the shadow that would normally sell the lift is black at 20% on a near-black background. The selection rested entirely on 65%-white text becoming 100%-white. The active segment is now a solid accent fill with on-accent ink: 7.21:1 dark and 5.48:1 light against the container, with the label at 7.35:1 and 6.70:1. `glass.strong` was measured first and rejected at 1.43:1 — a "raised" surface does not exist on a near-black ground.
- **Switching tabs returns you to the top.** With the summary and period filter inside the scroll view, changing tab while scrolled down left the new tab starting mid-content with both scrolled off screen.
- Chart gridlines now use the same `border.strong` across all four charts on the screen; the two on the main screen were a step fainter than the two on the Prices tab.

## [1.36.1] - 2026-07-25

### Fixed
- **The cheapest-store bar is visible in light mode.** The price-comparison chart drew its bars with iOS systemGreen and systemBlue, pinned rather than themed. The green bar — which marks the cheapest store and is the point of the chart — measured **1.65:1** against the light card, well under the 3:1 a graphical object needs. Both bars now take theme accents, matching the same green/blue pairing the store breakdown already uses.
- **The spending-trend area fill follows the theme.** Its gradient was hardcoded to the dark theme's blue, so in light mode a pale wash sat under a dark blue line. It now derives from `accent.blue` with the alpha passed separately.
- Chart axis, rule and label colours in the price charts now use `border.strong` and `text.secondary` instead of hand-rolled light/dark ternaries, matching the charts on the main analytics screen.
- The History detail screen's loading spinner was pinned to iOS systemBlue and did not follow the theme.

## [1.36.0] - 2026-07-25

### Changed
- **The Analytics screen is one scrolling surface instead of two halves.** The period selector, the 2×2 stat grid and the tab bar were all siblings above the `ScrollView`, so roughly 341dp — about 45% of the screen — never moved, and the charts were read through the ~412dp window left over. Only the tab bar stays pinned now; everything else scrolls, which gives the content back around 290dp on every tab.
- **The four stat cards are now a till-roll total.** The grid's four tinted, bordered boxes carried the largest type on the screen (24px/700) — the frozen summary out-ranked the live charts it was summarising. In their place: the period total as a receipt total line, label left and figure right in the receipt mono, ruled above and below, with trips, average and item count as a single line of small print beneath it. Same four numbers, roughly a third of the height.
- **One framing level instead of five.** Bordered period pills inside a bordered tab bar above bordered tint cards above bordered content cards all stacked up in the top third. Chart sections lose their borders and fills and are separated by space; the period control becomes a segmented control whose active segment reads as a raised surface, so it no longer looks like a second tab bar. The total block's rules are now the only ruled element on the screen.
- **The tab bar's four emoji are Ionicons.** 📊🛒🏪💰 became `stats-chart` / `cart` / `storefront` / `pricetag`, matching the rest of the app after the 1.35.0 icon sweep; the active tab takes the filled variant so selection does not rest on the tint alone. All eight names were checked against the installed glyphmap.
- The Prices tab's three components (`ItemStoreComparison`, `VolatileItemsChart`, `SmartSavingsCard`) lose their own cards and margins, so that tab lines up with the rest of the screen instead of setting its own insets.

## [1.35.6] - 2026-07-25

### Changed
- `RECEIPT_FONT` moved from `ReceiptCard` to the theme tokens. It is a typographic token rather than a property of one component, and the analytics total is about to use it. No visual change.

## [1.35.5] - 2026-07-25

### Fixed
- **No hairline gap around the Done button in the expanded shopping panel.** 1.34.2 gave the button a transparent border so its box would match Cancel's; 1.35.4 made the gradient `flex: 1`, which does that job properly and left the border with nothing to do. Because a border insets a child, the gradient was sitting 1px in from every edge with the green panel showing through the gap, and Done's gradient was 2px smaller than Cancel's outline.

## [1.35.4] - 2026-07-25

### Fixed
- **The expanded shopping panel no longer fills the whole screen.** 1.34.2 gave the Done button's gradient `height: '100%'` to close a gap under it. Its parent is auto-height, so there was no definite box for the percentage to resolve against and it was measured against the available space instead: the gradient took the viewport, its parent grew to contain it, and the panel — with Cancel stretched alongside it — pushed the entire item list off screen. The gradient now uses `flex: 1`, which fills the height the row actually hands out.

## [1.35.3] - 2026-07-25

### Fixed
- **Alert buttons are readable.** Every default and destructive button in the app's alert dialog drew its label with the surface ink while sitting on a filled accent — white on the dark theme's light blue measured 2.4:1. They now use the on-accent ink, measuring ~7:1. This affects every alert in the app, so it was the widest-reaching instance of the problem fixed in 1.35.2.

## [1.35.2] - 2026-07-25

### Fixed
- **Text on filled gradient buttons is readable again.** The create-list modal's Create button used the surface ink instead of the on-accent ink, so it failed in both themes — measured 2.4:1 in light and 2.5:1 in dark, against a 3:1 floor. The same miss was on the lists FAB, the receipt apply button and two loading spinners. All now use the token that flips with the theme, measuring ~7:1.
- **Cancel is no longer taller than Create.** The Create button was padded twice — `padding: 0` does not override `paddingVertical`/`paddingHorizontal`, so the base style's padding survived and wrapped the gradient in an invisible shell. The row stretched Cancel to match it. Fixing the padding also removes the third of Create's touch target that sat outside the visible button.

## [1.35.1] - 2026-07-24

### Fixed
- Uneven spacing under the receipt warning banners, and the offline notice in shopping mode overflowing its row on a narrow screen — both introduced by moving those messages from emoji to icons in 1.35.0.

## [1.35.0] - 2026-07-24

### Changed
- **Text sizes now produce actual levels.** The app used 19 distinct font sizes against a scale defining 8, and 13/14/15/16/17 sat on adjacent rows — HomeScreen ran six sizes down a single card. Because 15-vs-14 isn't a perceptible difference, none of it read as hierarchy; it read as one flat band. Collapsed to 12 (meta) / 14 (body) / 16 (emphasis) / 20 (title) / 24 (screen title), with weight and colour carrying the rest. The item card was already doing this correctly and is unchanged. The display sizes above 24 — used for glyphs and hero numbers — are named in the scale now instead of being loose numbers.
- **Emoji no longer carry UI meaning.** The price trend was encoded as 📈/📉/➡️ with no text alternative for a screen reader — it's an arrow icon and a signed percentage now. The urgent-item button was labelled 🔥, which didn't say what it does and rendered differently across phone makers. Analytics' error and empty icons, and its 2×2 stat grid (which mixed a currency symbol, an emoji, a tilde and a hash), are consistent vector icons. Category emoji stay — those are content.
- **Empty screens say what to do next.** "No completed shopping trips", "No active urgent items", "No family members" and the rest were bare negations; each now states the situation and the next action.

## [1.34.2] - 2026-07-24

### Fixed
- **Cancel and Done line up again in the expanded shopping panel.** Making Cancel an outlined button in 1.33.4 changed its box by the width of its border, which left the Done button's gradient sitting short inside a taller row.
- **Long category names no longer crowd the item row.** Adding the category emoji in 1.33.4 widened a row that also carries the size and the add-size prompt; the label now truncates instead of pushing them off a narrow screen.

## [1.34.1] - 2026-07-24

### Fixed
- **Small icon buttons are easier to hit.** Back, the category reorder arrows, expand/collapse on the shopping bar, delete-list and Settings' copy/edit buttons all had touch targets around 26–32dp against Android's 48dp minimum. They now extend their tap area without moving anything on screen. The reorder arrows and delete-list were worst — one is a repeated fine-motor action, the other is destructive and was the smallest target in the app.
- **Prices line up in the seven places they didn't.** Urgent Items, the filter, frequently-bought, price edit, price history, the receipt preview and the size editor all rendered money without fixed-width digits, so columns of prices didn't align and totals jiggled as they changed. Price history was the worst case — a whole column of them.
- The back chevron and the category reorder arrows also used pinned iOS greys, so they didn't follow the theme.

## [1.34.0] - 2026-07-24

### Changed
- **One palette instead of five.** The app had accumulated four greens, five oranges, three reds and two yellows — iOS system colours, stray hexes and theme tokens sitting side by side, none of them noticeable alone but collectively why the app read as assembled rather than designed. Every one of them now comes from the theme, so colour follows light/dark consistently: History's "not purchased" markers, Settings' danger zone and join-request badges, Urgent Items' cards and action button, the receipt warning banners, the size editor's unit badges.
- **The spending pie no longer half-changes with the theme.** Three of its five colours flipped with the theme and two were pinned, so in light mode it came out three muted colours and two neon ones. All five are themed now, and ordered so red and green are never adjacent slices.
- **Dark red got lighter, light blue and purple got darker.** Each was too close to its own background to survive being drawn on a tint of itself.

### Fixed
- **Modal drag handles are visible in light theme.** All five bottom sheets drew the grab handle as 15% white, which is invisible on a white sheet.

## [1.33.5] - 2026-07-24

### Fixed
- **Text on filled buttons is readable in both themes.** Blue-filled buttons across the app — add item, view receipt, import, save budget, filter chips, retry, modal confirm — drew light text on a light-blue fill, measuring 2.4–3.7:1. Buttons now use the solid accent with a new on-accent ink that flips with the theme (dark ink on the dark theme's light accents, white on the light theme's dark ones). Same fix for the resolve/create buttons on Urgent Items, the receipt save button, the History delete button, the floating action button, and every sign-in button — the auth screens pinned a light gradient with white text on it, so the first screen of the app measured 2.42:1.
- **Logout no longer looks as dangerous as deleting your account.** Both were filled red with a coloured glow; logout is one tap to undo and is now a quiet outlined button, with filled red reserved for account deletion.
- **Secondary text on cards is readable.** The tertiary text colour measured 4.38:1 on cards in dark mode and 3.30:1 everywhere in light mode, despite the token comment promising it stayed readable at small sizes. The "+ add size" prompt on item rows also used the disabled/placeholder colour despite being tappable.
- **Status badges on list cards.** "Completed" sat as green text on a green tint on a green card — three layers, 3.67:1. Badges now use the subtle tint rather than the dim one, and the light theme's orange darkened a further step so the "Shopping" badge clears the bar too.

## [1.33.4] - 2026-07-24

### Fixed
- **Shopping mode is readable in dark theme again.** The in-store status bar drew itself with hardcoded iOS system colours that never followed the theme, while its text used the theme's primary ink — so on a dark phone the bar users actually shop from measured between 1.61:1 and 3.84:1 against WCAG's 4.5:1 minimum, worst of all the 11px budget badge. The bar now pins its own surfaces *and* its ink, so it reads identically in either theme; worst pair is 5.21:1. Cancel is an outlined button rather than white-on-a-white-scrim, which failed in both themes.
- **Category labels on item rows are readable in both themes.** The 12 category colours are a fixed Material palette that can't follow the theme, drawn as 11px text: 5 of 12 failed contrast in dark, 10 of 12 in light (Bakery at 2.16:1). Labels now use the theme's secondary text colour and show the category emoji, which carries the identity the colour was carrying. Category colours still tint cells and borders, where they're decorative. The size and details editors had the same defect and are fixed with them.
- **Analytics stat cards and rank medals are readable in light theme.** Their colours were pinned dark-theme hexes drawn on a 12% tint of themselves — "Items Bought" measured 1.21:1 and the gold medal 1.41:1, effectively invisible. Both now come from the theme, with a medal palette per theme.
- **Light-theme accent colours are a step darker.** They were light enough that accent-coloured text collapsed on a white card — prices, the number users open the app to read, measured 3.30:1.

### Added
- Contrast regression tests (`src/styles/__tests__/contrast.test.ts`) asserting every colour pair fixed above, since none of these are visible in a dark-only emulator pass.

## [1.33.3] - 2026-07-24

### Fixed
- **First tap on the app no longer crashes after it sat unused in the background.** When Android killed the process to reclaim memory, the next launch restored the activity from saved state — and react-native-screens deliberately refuses to restore its screen fragments (`IllegalStateException: Screen fragments should never be restored`), crashing that first launch; the second tap worked because the crash wiped the saved state. `MainActivity.onCreate` now passes `null` to `super.onCreate` (the documented react-native-screens fix) so React Native rebuilds the UI from scratch instead. Diagnosed from the on-device DropBox crash record.

## [1.33.2] - 2026-07-23

### Fixed
- **A second receipt-scanned notification now opens the right list.** History detail loaded its list only once on mount, but React Navigation reuses the already-open screen when a new deep link retargets it, so tapping a second notification while an earlier list was open stayed stuck on the first list. It now reloads whenever the target list changes. Found during on-device (AVD) validation of the 1.33.x quick-scan notification.

## [1.33.1] - 2026-07-22

### Added
- **Family members now get a push when a quick-scan purchase completes.** Applying a scanned receipt (camera-button flow) notifies the rest of the family group — "🧾 {name} just bought N items" with store and total — fire-and-forget, so a failed send never blocks the apply. Tapping the notification deep-links to the completed list in History (`familyshoppinglist://history/{listId}`) from both quit and background state; foreground messages keep showing the themed in-app alert. The notification-to-deep-link mapping moved to `src/utils/notificationDeepLink.ts` with unit tests, and payload list ids are validated as UUIDs before navigation.

## [1.33.0] - 2026-07-22

### Added
- **Server: `notify-receipt-scanned` edge function.** Sends a push notification to the rest of the family group when a member applies a quick-scanned receipt — "🧾 {name} just bought N items" with the store and total in the body, and the completed list's id in the data payload for deep-linking. Same hardening as `notify-shopping-started`: Firebase ID-token verification, caller-must-be-shopper check, group-membership check, per-user rate limit, stale-token cleanup. Auto-deployed via the existing edge-functions workflow.

## [1.32.4] - 2026-07-17

### Fixed
- **Skipping a quick-scan import now discards the list.** After confirming a scan, pressing Skip on the match screen (including the no-receipt-data / no-line-items states) left an empty active list with the receipt attached. In the quick-scan flow the list exists only for that receipt, so Skip now deletes it; the regular match-from-list flow is unaffected.

## [1.32.3] - 2026-07-17

### Fixed
- **Quick scan now completes the shopping trip.** Applying a scanned receipt added the items (checked) but left the list active, so a fully recognised receipt never reached History. Apply in the quick-scan flow now marks the list completed (with completer and receipt total already attached at confirm time).

## [1.32.2] - 2026-07-17

### Fixed
- **Cancelling a quick scan no longer leaves an empty list behind.** The camera button created the list before the camera even opened, so backing out of the capture (or a failed capture, or the ad gate) orphaned an empty list on Home. The list is now created only when the scanned receipt is confirmed.

## [1.32.1] - 2026-07-17

### Fixed
- **OCR confidence no longer shows 100% on arithmetically wrong parses.** Confidence was scored purely on field presence, so a parse with the wrong total (e.g. from a skewed photo shifting the price column) could still read "Confidence 100%". The score now mirrors the OCR server's completeness gate — line items net of discounts must sum to the printed total — and is capped at 50% ("please verify" territory) when the arithmetic doesn't hold.

## [1.32.0] - 2026-07-13

### Added
- **Check-off now animates in place.** Previously the checkmark pop played only after the card had already teleported to the Completed section (usually off-screen), so tapping a checkbox looked like the row just vanished. The card now flips to its checked look (checkmark pop, strikethrough, dim) immediately under your finger, and moves to Completed 400ms later. Unchecking stays instant. A rapid second tap during the animation is ignored (the toggle is already in flight). Follow-up TODO: soften the remaining section move with a layout transition.

## [1.31.1] - 2026-07-13

### Fixed
- **Checked items no longer replay the checkmark pop on remount.** The check animation ran in the card's mount effect, so every already-checked card re-popped whenever the Completed section rebuilt (re-entering the screen, sync updates). The animation now only plays on an actual check-state change.

## [1.31.0] - 2026-07-12

### Added
- **Notification taps now navigate to the Urgent tab.** Urgent-item pushes are routed through React Navigation's deep-linking config (`familyshoppinglist://urgent`), covering both quit-state and background taps. Foreground notifications show the themed in-app alert instead of the raw system alert.
- **Sync status banner on Home and List screens.** Unsynced offline edits are no longer invisible: the banner shows "N changes waiting to sync" while offline and "N changes not synced · Retry" once back online.
- **Accessibility pass.** Icon-only buttons across all screens gained labels, checkboxes announce their checked state, and modals are announced as modal to screen readers.

### Fixed
- **Offline no longer looks logged-out.** `getCurrentUser` falls back to the cached user when the network read fails (guarding against a stale cache from a different uid) and reports errors to Crashlytics instead of swallowing them.
- **Duplicate FCM listeners.** `initializeListeners` never unsubscribed, so effect re-runs stacked `onMessage` handlers; it now returns a cleanup.
- **Stale running total.** The shopping-mode total was computed against the previous price predictions; predictions are now passed explicitly.

### Changed
- **UserContext distributes the app's live user state** — screens read the user from context instead of issuing per-mount network reads (14 of 16 call sites migrated).
- **ListDetailScreen restructured** via four extracted hooks (`useShoppingMode`, `useListSubscriptions`, `useQuantityEditor`, `useListModals`); Firebase payload defaulting single-sourced in typed mappers; `getCategory` widened to `string` and `QueuedOperation` made a discriminated union.
- **Release builds strip unused resources** (`shrinkResources`).
- **CI workflow** runs typecheck, lint, and tests with a coverage gate on every push/PR.

## [1.30.4] - 2026-07-10

### Fixed
- **Settings screen bottom content hidden behind Android navigation buttons.** With edge-to-edge rendering (targetSdk 36) the app draws under the transparent system nav bar, but the settings ScrollView had no bottom safe-area inset — the Delete Account button and footer sat permanently behind the nav buttons. The scroll content now pads by the bottom inset. The Edit Name and OCR Server URL modals also gained `KeyboardAvoidingView`, so their input and Save/Cancel buttons stay visible while typing.

## [1.30.3] - 2026-07-10

### Fixed
- **Receipt match double-counted multi-quantity items.** Applying a receipt match wrote the receipt line **total** into `Item.price`, but `Item.price` is per-unit everywhere else (item cards, running total, and history all multiply by `unitQty`) — so an item with quantity 2 showed double its real cost. The match screen now derives a per-unit price when the list item's quantity is above 1: it prefers the receipt's unit price, falling back to dividing the line total by the receipt quantity (or the list quantity if the receipt has none). Single-quantity items are unchanged.

## [1.30.2] - 2026-07-10

### Fixed
- **Running total counted items you never bought.** The shopping-mode total summed *all* items, substituting a predicted price (from price history) for anything unpriced — so an unchecked leftover item (e.g. the original of a receipt line you added as a new item because matching failed) silently inflated the total past the printed receipt. The total now counts checked items only; predicted prices still fill in for checked items without a real price. This also fixes the stored trip total on "Done shopping", which previously baked in predicted prices of unbought items.

## [1.30.1] - 2026-07-10

### Changed
- **Batch item add/update no longer blocks on network sync.** `ItemManager.addItemsBatch`/`updateItemsBatch` now fire their per-item Firebase pushes in the background (same fire-and-forget pattern `updateItem` already used) instead of awaiting one round trip per item. Applying a long receipt (20+ items) previously held the "Apply/Done" spinner for the duration of ~30 sequentialish network writes; the screen now closes as soon as the local batch transaction lands. Failed pushes still land in the sync queue for retry, unchanged.

## [1.30.0] - 2026-07-10

### Added
- **Select all / Deselect all toggle for unmatched receipt items.** The receipt match screen's "Unmatched receipt items" section now has a bulk toggle at the top, so long receipts (20+ new items) no longer require tapping '+' on every row. Works from any entry point (previously only the Home-screen scan path pre-selected everything via `autoAddAll`).

## [1.29.14] - 2026-07-03

### Changed
- **Storage split complete — store-layouts extracted, LocalStorageManager is now a pure facade.** 6 store-layout methods + model mapper moved verbatim into `src/services/storage/storeLayouts.ts` (`StoreLayoutsStorage`). `LocalStorageManager` is down from 1,879 lines (pre-split) to 333: it owns the singleton DB handle, `executeTransaction`, `clearAllData`, and one-line delegations to 6 domain modules (`lists`, `items`, `syncQueue`, `urgentItems`, `history`, `storeLayouts`) sharing that handle. Zero call-site changes anywhere in the app; full suite 81/81 green. Pending AVD sync validation before merge to master.

## [1.29.13] - 2026-07-03

### Changed
- **Storage split step 6/6 (domains) — history extracted.** Category-history (5 methods + model mapper) and price-history (5 methods) moved verbatim into `src/services/storage/history.ts` (`HistoryStorage`). Existing `saveCategoryHistoryBatch` regression tests stay green against the unchanged facade API.

## [1.29.12] - 2026-07-03

### Changed
- **Storage split step 5/6 — urgent-items domain extracted.** 10 methods (urgent-item CRUD, batch upsert with `hasUrgentItemChanged` no-op guard, active/resolved observers) moved verbatim into `src/services/storage/urgentItems.ts` (`UrgentItemsStorage`). Facade API unchanged.

## [1.29.11] - 2026-07-03

### Changed
- **Storage split step 4/6 — sync-queue domain extracted.** `addToSyncQueue`/`getSyncQueue`/`removeFromSyncQueue`/`updateSyncQueueOperation`/`clearSyncQueue` + `markSyncedIfUnchanged` moved verbatim into `src/services/storage/syncQueue.ts` (`SyncQueueStorage`). Facade API unchanged; queue behavior pinned by the 1.29.7 characterization tests.

## [1.29.10] - 2026-07-03

### Changed
- **Storage split step 3/6 — items domain extracted.** 11 methods (item CRUD, `saveItemsBatch`/`saveItemsBatchUpsert`/`deleteItemsBatch`, `observeItemsForList`) moved verbatim into `src/services/storage/items.ts` (`ItemsStorage`). The upsert LWW guard + tombstone resurrection stay pinned by the 1.29.7 characterization tests, which run against the facade unchanged.

## [1.29.9] - 2026-07-03

### Changed
- **Storage split step 2/6 — lists domain extracted.** 15 methods (list CRUD, completed-list queries, receipt data, expenditure queries, `observeAllLists`/`observeList`) moved verbatim into `src/services/storage/lists.ts` (`ListsStorage`, shares the DB handle). `LocalStorageManager` delegates; public API unchanged.

## [1.29.8] - 2026-07-03

### Changed
- **Storage split step 1/6 — core extracted.** `src/services/storage/database.ts` now owns WatermelonDB construction (`createDatabase()`), and `src/services/storage/mappers.ts` owns the pure model↔type mappers (`applyListCreate/FullUpdate`, `applyItemCreate/FullUpdate`, `listModelToType`, `itemModelToType`, `urgentItemModelToType`, `hasListChanged`). `LocalStorageManager` API unchanged (−167 lines); behavior pinned by the 1.29.7 characterization tests.

## [1.29.7] - 2026-07-03

### Added
- Characterization tests for `LocalStorageManager`'s sync-critical paths (20 tests, in-memory LokiJS): `saveItemsBatchUpsert` last-write-wins guard (strictly-newer local record wins; equal timestamps apply the incoming write), tombstone resurrection after `deleteItem`/`deleteItemsBatch`, sync-queue FIFO ordering + corrupt-entry skipping + retry-field updates, and `markSyncedIfUnchanged` conditional marking. Written ahead of the storage-domain split so behavior is pinned before any code moves. Also pins a pre-existing quirk: `getItem` (`collection.find`) still serves a cached soft-deleted record while query-based reads exclude it.

## [1.29.6] - 2026-07-02

### Changed
- Extracted `CategoryItemList` + `DraggableItemRow` from `ListDetailScreen` into `src/components/CategoryItemList.tsx` (screen now 1,494 lines, from 1,627 at the start of this pass). Deeper decomposition (sync/observer hooks) deliberately deferred: the drag-reorder and sync paths are the app's twice-broken, device-validated hot spots and shouldn't be restructured without an AVD pass.

## [1.29.5] - 2026-07-02

### Changed
- `HomeScreen` renders lists with `FlatList` (virtualized) instead of `ScrollView` + `.map()`.

## [1.29.4] - 2026-07-02

### Changed
- `HomeScreen` no longer writes to Firebase RTDB directly — the "family group deleted" cleanup moved into `AuthenticationModule.clearFamilyGroupReference()`. It was the only place a screen bypassed the service layer.

## [1.29.3] - 2026-07-02

### Changed
- **`AnimatedItemCard` owns its styles.** The card took 16 style props from `ListDetailScreen` despite already having a theme hook; the styles moved inside (net −90 lines) and the checkbox ✓ became a themed Ionicons checkmark. `CategoryItemList` lost its now-unused `styles: any` prop.

## [1.29.2] - 2026-07-02

### Added
- **Receipt data now renders as a thermal receipt** — new `ReceiptCard` component with SVG serrated top/bottom edges, dashed rules (`ReceiptRule`), and monospaced "print" (`RECEIPT_FONT`: Menlo/monospace) for merchant, items and prices. The TOTAL moved below the item list behind a dashed rule, the way a till prints it. This is the app's signature visual — reserved for receipt/cost breakdowns.

## [1.29.1] - 2026-07-02

### Changed
- **UI control emoji replaced with Ionicons across 15 files** — close (✕), save/cancel (✔️/✖️), edit (✏️), delete (🗑), checkmarks, status-bar icons (🛒/🔒/✅/📡), expand chevrons (▼/▲), calendar (📅), camera (📷), receipt (📄), store (🏪), history/stats (📊), time (🕐), warning (⚠️ in ErrorBoundary), and the suggestion bulb (💡). Emoji render differently per Android vendor and can't take theme colors. **Deliberately kept as emoji (content, not controls):** category icons (🥬🥛…), role avatars, the urgent screen's 🔥 identity, notification message text, and inline-sentence emphasis (e.g. "⚠️ Low confidence…").

## [1.29.0] - 2026-07-02

### Added
- **Receipt scanning gets its own visible button** — a small camera FAB above the main one. Scanning was only reachable via an undiscoverable long-press with a permanent "Hold to scan receipt" hint caption; the hint is gone, the long-press still works, and the main FAB's `+` is now a real icon (optically centered) instead of a text glyph.

## [1.28.5] - 2026-07-02

### Changed
- **Dates unified to en-GB via a shared `src/utils/date.ts`** (`formatDateLong` "Tue, 1 Jul 2026", `formatDateShort` "01/07/2026", `formatDateTime`). Replaces en-US strings in HomeScreen list names/date button ("Jul 1" → "1 Jul"), the hand-rolled DD/MM/YYYY in HomeScreen, the device-locale-dependent dates in BudgetScreen/ReceiptViewScreen, and the analytics month labels.

## [1.28.4] - 2026-07-02

### Changed
- **List sync status is now a cloud icon instead of a bare colored dot** (`cloud-done` / `cloud-upload-outline` / `cloud-offline-outline`, themed via `theme.sync`). The dot communicated by color alone — colorblind-hostile and unexplained. `AnimatedListCard` takes `syncStatus` instead of a raw `syncColor`.

## [1.28.3] - 2026-07-02

### Changed
- **All money text now uses tabular (fixed-width) numerals** via a shared `NUMERIC` style token (`fontVariant: ['tabular-nums']`): item prices and totals in list/history/receipt/budget/analytics/subscription screens. Digit columns align vertically and totals no longer shift width as values change.

## [1.28.2] - 2026-07-02

### Changed
- **Raised secondary/tertiary text contrast.** Dark theme: secondary 45%→65% white, tertiary 30%→45%, dim 20%→25%; light theme: secondary 55%→70%, tertiary 40%→50%, dim 25%→30%. The old tertiary/dim values failed WCAG small-text contrast on the app backgrounds (e.g. the 11px FAB hint was near-invisible in bright light). `dim` is now documented as disabled/placeholder-only.

## [1.28.1] - 2026-07-02

### Fixed
- **Light theme showed dark-theme colors in several places.** Sync-status dot colors were hardcoded dark-theme hexes in `HomeScreen`; the completed-list card tint, shopping badge background, and `AnimatedItemCard` measurement colors were hardcoded rgba/hex too. Added semantic theme tokens (`theme.sync.synced/pending/failed`, `accent.greenSubtle`, `accent.orangeDim`) with proper light-theme values and switched all four call sites over. Removed dead `scanButton*` styles from `HomeScreen.styles`.

## [1.28.0] - 2026-07-02

### Added
- **Store detection now covers the full retailer set the OCR server recognises** (17 chains: Asda, Aldi, Morrisons, Waitrose, Costco, Iceland, Spar, Nisa, Booths, Budgens, Londis, One Stop, M&S added to the existing Tesco/Lidl/Sainsbury's/Co-op). Previously anything outside the original four collapsed to `'other'`. `ReceiptData['store']` widened to the new `ReceiptStoreSlug` union; the mapping mirrors `_KNOWN_RETAILERS` in the receipt-ocr repo.

## [1.27.3] - 2026-07-02

### Fixed
- **OCR server health check could hang forever.** RN's `fetch` has no default timeout, so a dead/unreachable OCR server left the settings-screen health probe spinning indefinitely. Now aborts after 10s.

### Changed
- OCR requests send an `X-OCR-Key` header. The server (receipt-ocr repo) enforces it only when its `OCR_SHARED_SECRET` env var is set to the matching value — set that secret on the HF Space to close the public `/ocr` endpoint to drive-by use. Until then the header is ignored and nothing changes. (The key this entry originally printed in full was rotated and retired in 1.41.0, which moved the secret server-side; it is left redacted here rather than rewritten out of history.)
- `currency` default extracted to a named `DEFAULT_CURRENCY` constant.

## [1.27.2] - 2026-07-02

### Fixed
- **"Try again" (retry OCR) failed for any receipt already uploaded to Cloud Storage.** `ImageStorageManager.uploadReceipt` overwrites the list's `receiptUrl` with the Storage path (`receipts/{group}/{list}/…jpg`), and `ReceiptOCRService.retryOCR` fed that path straight into the OCR upload as if it were a local file — the form part had nothing to read, so the request always failed. Retry now detects a Storage path and downloads the image back to the local cache (`storage writeToFile` → `CACHES_DIRECTORY/ocr-retry-{listId}.jpg`) before re-running OCR. Not reproducible on the AVD (free tier has no Storage bucket — receipt uploads are device-only), which is why it survived emulator validation.

## [1.27.1] - 2026-07-01

### Fixed
- **Google Sign-In failed on every attempt** with `[auth/unknown] Exception in HostFunction: accessToken cannot be empty`. `AuthenticationModule.signInWithGoogle` built the Firebase credential with `auth.GoogleAuthProvider.credential(idToken)` — no `accessToken`. RNFB's `OAuthCredential` resolves the native bridge's secret slot to `''` (empty string, not `null`) when `accessToken` is omitted (`OAuthCredential.ts` → `resolveOAuthBridgeFields`), and that empty string is passed straight to the native `GoogleAuthProvider.getCredential(idToken, accessToken)` call, which the current firebase-auth Android SDK rejects as empty rather than tolerating it. Fixed by fetching the real access token via `GoogleSignin.getTokens()` and passing both to the credential. **Device-validated on AVD** — Google Sign-In confirmed working end-to-end.

## [1.27.0] - 2026-06-30

### Changed
- **Upgraded React Native 0.85.2 → 0.86.0** and the `@react-native/*` toolchain in lockstep: `babel-preset`, `metro-config`, `eslint-config`, `typescript-config`, `gradle-plugin`, and `jest-preset` all → `^0.86.0`. `react` stays `19.2.3` (RN 0.86 peer is `^19.2.3`); `@react-native-community/cli*` stay `^20.2.0` (latest, RN-aligned).
  - **No native template changes required.** The official `rn-diff-purge` `0.85.2..0.86.0` upgrade-helper diff touches **only `package.json`** — every Android template file (`build.gradle`, `app/build.gradle`, `settings.gradle`, `gradle.properties`, `gradle-wrapper.properties`, `MainApplication.java`, `MainActivity.java`) is unchanged between the two releases, so the repo's native customizations were left untouched. The app stays on Java (template did not migrate to Kotlin) and on Gradle 8.13 / AGP 8.6.0 / Kotlin 2.1.20.
  - **Clean reinstall** regenerated `node_modules` + `package-lock.json` at 0.86.0 — this sidesteps the `@react-native/virtualized-lists@0.85.2` exact-pin that blocked an in-place bump (the blocker noted in 1.26.0's "Deferred" section). `@react-native/jest-preset` was **kept** (RN 0.86 template dropped it, but `jest.config.js` references `preset: '@react-native/jest-preset'` — removing it would break the suite).
  - **patch-package:** both patches re-apply cleanly against the 0.86 tree — `react-native-reorderable-list@0.18.0` ✔ and `react-native-svg@15.15.4` ✔ (both libs are version-pinned and unchanged by the RN bump).
  - **Peer-dep compatibility (verified, no coordinated bumps needed):** `react-native-reanimated@4.5.0` and `react-native-worklets@0.10.0` both declare `react-native: "0.83 - 0.86"` (0.86 is the upper bound, supported); `gesture-handler@2.32`, `@react-native-firebase/*@25`, `screens@4.25`, `safe-area-context@5.8`, `svg@15.15`, `reorderable-list@0.18` all accept RN 0.86.
  - **babel chain preserved:** `babel-plugin-react-compiler` (target 19) remains **first**, `react-native-worklets/plugin` remains **last** — unchanged by the babel-preset bump.
  - **JS gates green:** `tsc --noEmit` clean, **61/61** jest tests pass, `eslint .` 0 errors (11 pre-existing warnings).
  - **NOT device-validated** — pending owner AVD build (`assembleDebug`/`installDebug`), New-Arch launch check, logcat sweep, and drag-to-reorder re-test on `ListDetailScreen` (reanimated + native bump + compiler interaction).

## [1.26.1] - 2026-06-30

### Fixed
- **Deleted lists no longer reappear as stale "active" ghosts on devices that were offline at delete time.** `ShoppingListManager.deleteList` was soft-deleting locally (`status='deleted'`) but syncing the delete to Firebase as a **hard node removal** (`SyncEngine.pushChange('list', id, 'delete')` → `remove()`). A device that was closed/offline during the delete missed the live `onChildRemoved` event, and the cold-start list load is upsert-only — it cannot prune a locally-present list that is absent from the Firebase snapshot — so the deleted list lingered as an `active` ghost forever (e.g. one device showing 2 lists while another showed 1). Delete is now soft on Firebase too: it writes `status='deleted'` to the node (kept as a tombstone), mirroring `markListAsCompleted`, so every device — online or returning from offline — reconciles it on the next load. The `onChildRemoved` handler is retained for backward-compat with older clients still doing hard removes. Added a regression test asserting `deleteList` pushes an `update` (status=deleted) and never a hard `delete` op. (Surfaced during 1.26.0 device validation.)

## [1.26.0] - 2026-06-30

### Device validation (AVD, 2026-06-30) — React Compiler
React Compiler (1.26.0) was validated on a Pixel 6 AVD (Android 14 image). `installDebug` built and installed clean; the app launched on the New Architecture (Bridgeless ReactHost + Fabric JNI + TurboModule), Metro bundled all 2511 modules through the compiler transform without error, and the app ran the entire session on a single process with no crash/restart. A full logcat sweep was empty (no FATAL / native crash / worklet / reanimated error). Confirmed working at runtime under the compiler:
- **List reorder drag on `ListDetailScreen`** (highest-risk path) — long-press drag-to-reorder swapped two items in a category, then back again, both directions clean with no worklet/reanimated error. The reanimated-4.5 reorderable-list flow patched in 1.25.15 is unaffected by the stacked compiler memoization.
- **Home (Shopping Lists), `ListDetailScreen` (categorized + completed sections), Analytics (SVG stat cards / sub-tabs), and the item details + delete-confirm modals** all mount and render correctly.
- Pre-existing dev-only noise (RevenueCat test-key config error, RNFirebase namespaced-API deprecation warning) is unrelated to the compiler.


### Added
- **React Compiler enabled** (`babel-plugin-react-compiler@1.0.0`, exact-pinned) for automatic memoization across all components. Build-time only — no new runtime dependency: React 19.2.3 ships the compiler runtime (`react/compiler-runtime`), so no `react-compiler-runtime` polyfill is required.
  - **babel wiring:** added as the **first** plugin in `babel.config.js` with `{ target: '19' }`; `react-native-worklets/plugin` remains **last** (reanimated requirement). Verified the transform emits the `react/compiler-runtime` memo-cache for a sample component.
  - **Mode:** global (`'all'`) — the compiler attempts every component and conservatively **bails** (skips, leaving code untouched) on any it can't prove safe, so it cannot emit incorrect output.
  - **Readiness:** `react-compiler-healthcheck` compiled 30/30 sampled components, found **no incompatible libraries** (reanimated 4.5 / worklets 0.10 are compatible) and no StrictMode. A full pass of the `eslint-plugin-react-hooks@7` compiler diagnostics surfaced 55 advisory findings — all resolve to per-component bailouts, none to miscompilation. The 6 in the behavior-sensitive categories were reviewed: 4 `preserve-manual-memoization` are explicit "Compilation Skipped" (manual memo retained untouched), and 2 `purity` (`Date.now()`) trigger bailouts (one is in an async handler, not render). No source changes were required.
  - Verified at the JS layer: tsc clean, 60/60 tests, `eslint .` 0 errors. ✅ Device-validated on AVD 2026-06-30 (see "Device validation" above).

### Device validation (AVD, 2026-06-29)
The native-dependency batch (1.25.10–1.25.14) was validated on a Pixel 6 AVD (Android 16 image). `assembleDebug` + `installDebug` build clean, app launches on the New Architecture (Fabric), and a full logcat error sweep was empty (no FATAL / native crash / worklet error). Confirmed working at runtime:
- **firebase 25** — auth session restored, RTDB lists synced and rendered, crashlytics native crash handler initialized, analytics + crashlytics collection enabled.
- **reanimated 4.5 / worklets 0.10 / gesture-handler 2.32** — `ListDetailScreen` (host of the `react-native-reorderable-list` panGesture) mounts, scrolls, and re-renders cleanly. Manual drag-reorder testing **surfaced a real regression** under reanimated 4.5 (crash + cards left hidden) — **fixed via a library patch** in 1.25.15 below; reorder now works correctly (up/down, all rows, data persists). Worklet-driven UI otherwise healthy.
- **purchases 10.4** — SDK initializes, offerings API call returns 304 (auth/network OK), CustomerInfo cache works. The `[RevenueCat] Error fetching offerings` toast is a benign dashboard config message (Test Store key, no test products registered) — not a regression.
- **targetSdk 36 edge-to-edge** — status bar and bottom tab bar render correctly, no clipped/overlapping UI.
- Native minors (screens 4.25, safe-area 5.8, async-storage 3.1) — exercised implicitly by the rendered nav/list UI.

Not testable on the AVD (environmental, physical-device only): FCM push delivery, Firebase Storage (free-tier has no bucket), App Check attestation (needs console). These remain open.

### Deferred (tracked, not yet applied)
- **React Native 0.86 — deferred to a dedicated session.** The npm bump alone does not resolve cleanly: `@react-native/virtualized-lists@0.85.2` (a transitive dep of RN) pins `react-native@"0.85.2"` exactly, so 0.86 needs a clean `node_modules` reinstall, not an in-place bump. It also requires the native `android/` template diff (gradle plugin / build files via the RN upgrade-helper) plus a real build — none verifiable from the test suite. Highest blast radius of the pending upgrades; do it on its own branch with a build in the loop.
- **gesture-handler 3 — blocked upstream** (see 1.25.12): `react-native-reorderable-list@0.18.0` is not GH3-compatible.
- **`react-native-google-mobile-ads` 16.4 — blocked by project Kotlin version** (see 1.25.14): 16.4.0 pulls `play-services-ads 25.4.0`, compiled with Kotlin metadata 2.3.0, but the project is on Kotlin 2.1.20 → `:react-native-google-mobile-ads:compileDebugKotlin` fails. Revisit when the project's Kotlin is raised to 2.3.x (couples to the RN 0.86 upgrade).

## [1.25.16] - 2026-06-29

### Fixed
- **`brace-expansion` override broke ESLint (regression from 1.25.09 batch)** — the override had been pinned to an exact `5.0.6`, which forced an API-incompatible major into `@eslint/config-array`'s bundled `minimatch` (it calls the older `expand()` default-export signature). Result: `npx eslint .` crashed with `TypeError: expand is not a function`, failing the pre-push hook and the CI verify job's lint step. Reverted the override to `^2.0.2` (master's value) — still resolves the brace-expansion ReDoS (CVE-2025-5889, fixed in 2.0.2) and restores the export shape ESLint expects. Verified: `eslint .` exits 0 (0 errors), `npm audit` shows 0 high/0 critical (6 moderate dev-tooling, accepted), tsc clean, 60/60 tests.

## [1.25.15] - 2026-06-29

### Fixed
- **List item reorder broken under reanimated 4.5 (regression from 1.25.13)** — dragging an item to reorder it threw `TypeError: Cannot read property 'id' of undefined` (red box + surface reload), and dragging downward left cards hidden until the screen was remounted. Root cause traced via on-device debug logging: on drop, `react-native-reorderable-list@0.18.0`'s `withTiming` completion callback fires **twice** under reanimated 4.5 / worklets 0.10's worklet scheduling; the second fire runs with `draggedIndex` already reset to `-1`, so the library's internal `reorder(-1, …)` calls `markCells(-1, …)` → `keyExtractor(data[-1])` = `undefined`, corrupting cell animation bookkeeping. The data was always correct; only the library's animation state was left stuck (hence "remount heals it").
  - **Fix:** patched `react-native-reorderable-list@0.18.0` (`reorder()` now early-returns on a negative `fromIndex`/`toIndex`), persisted via `patch-package`. This keeps reanimated **4.5** (no revert) and is a one-line guard at the source of the spurious event. Verified on the Pixel 6 AVD: 3/3 drags log only valid reorders, zero `from=-1` fires, zero `undefined` keyExtractor calls, items stay visible and land in the correct order.
  - The repo's existing `react-native-reorderable-list` patch (the Android `Gesture.Simultaneous` duplicate-handler crash fix, commit 877fd01) was regenerated in patch-package 8's current format alongside this change; both hunks now live in one patch file. No behavior change to the Android fix.

## [1.25.14] - 2026-06-29

### Reverted
- **`react-native-google-mobile-ads` 16.4.0 → 16.3.3** (back to pre-1.25.10 version). The 16.4.0 bump dragged in `play-services-ads 25.4.0`, which is compiled with Kotlin metadata 2.3.0 while the project's Kotlin compiler is 2.1.20 — the Android build fails at `compileDebugKotlin` with "Module was compiled with an incompatible version of Kotlin". Surfaced only by an actual device build (passed tsc + tests). 16.3.3 is known-good and builds clean (`assembleDebug` SUCCESSFUL). See Deferred note above.

## [1.25.13] - 2026-06-28

### Changed
- **`react-native-reanimated` 4.3 → 4.5** with **`react-native-worklets` 0.8 → 0.10** (bumped together — reanimated 4.5 peer-requires worklets 0.10.x). Both dedupe cleanly across reanimated and reorderable-list; babel already wires `react-native-worklets/plugin`. tsc clean, 60 tests pass.
  - ⚠️ **NEEDS DEVICE VALIDATION** — native modules + worklets runtime. Verify reorder animations, charts, and any reanimated-driven UI on a device.

## [1.25.12] - 2026-06-28

### Changed
- **`react-native-gesture-handler` 2.31.1 → 2.32.0** (minor). tsc clean, 60 tests pass.
  - ⚠️ **NEEDS DEVICE VALIDATION** — native module.

### Notes
- **gesture-handler 3 deferred (blocked upstream).** v3 introduces an incompatible `PanGesture` type that clashes with `react-native-reorderable-list@0.18.0` (the app's list-reorder dependency, used in `ListDetailScreen`'s `panGesture` prop). 0.18.0 is the latest reorderable-list and is still built against gesture-handler 2; there is no GH3-compatible release. Revisit when reorderable-list ships GH3 support.

## [1.25.11] - 2026-06-28

### Changed
- **`@react-native-firebase/*` 24 → 25.1.0** (all 8 modules in lockstep: app, analytics, app-check, auth, crashlytics, database, messaging, storage; app-check kept exact-pinned). Typecheck is clean against the v25 typed API (no removed-API breakage at the JS layer) and all 60 tests pass.
  - ⚠️ **NEEDS DEVICE VALIDATION** — bumps the native Firebase Android SDK. Verify auth, RTDB sync, messaging/FCM, crashlytics, storage, and App Check attestation on an AVD/device before merging.

## [1.25.10] - 2026-06-28

### Changed
- **Native dependency minor/patch bumps** — `react-native-screens` 4.24→4.25.2, `react-native-safe-area-context` 5.7→5.8, `react-native-google-mobile-ads` 16.3.3→16.4, `react-native-purchases(-ui)` 10.0.1→10.4, `@react-native-async-storage/async-storage` 3.0.2→3.1.1. (`react-native-svg` held at 15.15.4 to keep its pinned patch valid.)
  - ⚠️ **NEEDS DEVICE VALIDATION** — native modules; verified at JS level (tsc + 60 tests) only. Run an AVD/device build before merging to master.

## [1.25.9] - 2026-06-28

### Changed
- **`targetSdkVersion` 35 → 36** (compileSdk was already 36) to get ahead of Google Play's API 36 targeting deadline (~Aug 2026). Opts into Android 16 behaviour changes (edge-to-edge enforcement, etc.) — requires on-device validation before release.
- **Renamed `patches/react-native-svg+15.15.0.patch` → `+15.15.4.patch`** to match the installed version. The patch content was already applying to 15.15.4; the stale filename only produced a version-mismatch warning on every install, now silenced.
- **`firebase-admin` 12 → 14** (Node maintenance scripts in `scripts/` only — not in the app bundle). Cleared part of the moderate-severity transitive tree.
- **`@babel/*` bumped to 7.29.7** (patch within babel 7). Held at babel 7 deliberately: `@react-native/babel-preset` depends on `@babel/core ^7.25.2` and dozens of `@babel/plugin-* ^7.x`, so babel 8 would break Metro transforms.
- **Pinned `brace-expansion` override to `5.0.6`** (was `^2.0.2`, which didn't cover the vulnerable 5.x line under `minimatch`). brace-expansion's API is a single stable `expand()` export, so forcing one version everywhere is safe. Cleared the brace-expansion DoS advisory.

### Security notes
- **Remaining audit advisories (26, all moderate, all dev/build-only): accepted risk.** Two roots remain — `js-yaml` 3.x (inside jest's `@istanbuljs/load-nyc-config` coverage tooling) and `uuid` <11.1.1 (inside `firebase-admin`'s internals). npm's only offered "fix" for each is a **destructive downgrade** (jest→25, firebase-admin→10), so they are intentionally not applied. Both are DoS-class and neither ships in the release APK. Net: 48 → 26, with the critical and all 11 highs eliminated.

## [1.25.8] - 2026-06-28

### Security
- **Cleared the critical and all high-severity dependency advisories** via `npm audit fix` (non-breaking). The critical (`shell-quote`) and 11 highs (`axios`, `ws`, `lodash`, `@grpc/grpc-js`, `node-forge`, `fast-xml-parser`/`fast-xml-builder`, `protobufjs`, `form-data`, `tmp`, `@babel/*`) all live in build/dev/CI tooling, not in the shipped APK. Vulnerability count dropped 48 → 29 (remaining are all in the `firebase-admin` tree, addressed by the 12→14 upgrade).

### Fixed
- **Test suite no longer breaks from a jest internal version skew.** `audit fix` bumped `jest-runtime` to 30.4.2, which calls `jest-mock`'s `clearMocksOnScope`; `@react-native/jest-preset` pinned a nested `jest-mock@29.7.0` lacking that API, failing all 5 suites. Added a `jest-mock ^30.4.1` override to align the tree.

### Changed
- **Bumped JS-only and dev-tooling dependencies to latest minor/patch** (no native modules touched, fully verified by typecheck + tests + lint): `@react-navigation/native` 7.2.2→7.3.4, `@react-navigation/bottom-tabs` 7.15.11→7.18.3, `@react-navigation/stack` 7.8.11→7.10.6, `@supabase/supabase-js` 2.105.1→2.108.2, `uuid` 14.0.0→14.0.1, `react-native-gifted-charts` 1.4.76→1.4.77, `prettier` 3.8.3→3.9.1, `knip` 6.15.0→6.22.0, `@types/node`, `@types/react`, `@react-native-community/cli(-platform-android)` 20.1.3→20.2.0.

## [1.25.7] - 2026-06-13

### Security
- **Resolved Supabase database-linter findings on `urgent_items` / `device_tokens`** (live DB had drifted from migration history — objects were created by hand in the dashboard and never captured in a committed migration). Migration `20260613000000_harden_supabase_linter_findings.sql` (idempotent):
  - **Dropped the permissive "for all users" RLS policies** on both tables. These granted `anon`/`authenticated` full `SELECT`/`INSERT`/`UPDATE`/`DELETE` with `USING(true)`. The `SELECT USING(true)` pair (which the linter hides) let any holder of the public anon key read **every family's** urgent items and **every device's** FCM token cross-tenant. The client never reaches these via PostgREST (urgent items sync over Firebase RTDB; edge functions use the service role), so removing them closes a real cross-tenant data exposure with no app impact.
  - **Dropped orphan `notify_urgent_item_created()`** — wired to no trigger, a weaker hand-created duplicate of `handle_new_urgent_item` (hardcoded project URL, forwarded the caller's own `Authorization` header instead of the service-role key). Clears its mutable-search_path and PUBLIC-executable findings at once.
  - **Pinned `search_path = ''`** on `handle_new_urgent_item` and `check_rate_limit` (bodies verified fully schema-qualified against the live definitions), and **revoked the default PUBLIC/anon/authenticated `EXECUTE`** on `handle_new_urgent_item` (the trigger still fires).
  - Root fix mirrored in `setup-urgent-items.sql` so a re-run cannot reintroduce any of it.

## [1.25.6] - 2026-06-09

### Changed
- **Removed dead `AuthenticationModule.joinFamilyGroup`** — zero callers (the live path is `submitJoinRequest` → member approval), and it wrote `memberIds` directly, which the current RTDB rules reject anyway. Deleting it removes a misleading second join path.
- **Gated production debug logging.** Unconditional `console.warn` calls that reached release logcat are now `__DEV__`-guarded (`RevenueCatContext` config/paywall/restore warnings, `useShoppingLists` group-consistency diagnostics, the two backfill failures, and `LocalStorageManager`'s corrupt-queue-entry skip). The one genuinely silent background failure — tier reconciliation — now routes to `CrashReporting.recordError` instead of a swallowed `console.warn`.

## [1.25.5] - 2026-06-09

### Fixed
- **Editable receipt prices no longer mangle zero / blank input.** `ReceiptViewScreen` parsed the total with `parseFloat(text) || null` (typing `0` saved `null`, so a £0 total was impossible) and line-item prices with `parseFloat(text) || 0` (clearing a price silently saved £0.00 instead of empty). Both now use the existing NaN-safe `sanitizePrice()` helper, which returns `null` for blank/invalid and preserves a genuine `0`.
- **`HistoryDetailScreen` total math uses `??` instead of `||`** for item-price defaults, so a stored `0` is no longer treated as falsy when summing list totals.

## [1.25.4] - 2026-06-09

### Fixed
- **`reconcile-subscription` no longer rejects every legitimate call.** It validated `familyGroupId` against a UUID regex, but family-group IDs are Firebase `push()` keys (e.g. `-NEb7Jk-qLmnOp12Q34R5`), never UUIDs — so every reconcile returned `400 Invalid familyGroupId format` and a paying user's tier never synced from RevenueCat to RTDB on cold-start. `familyGroupId` is only string-compared to the user's stored group at the ownership check (it's never a path segment), so the UUID check added no security. Replaced it with a light injection guard (length + no `/` or `..`), matching the sibling `upsert-urgent-item` function.

## [1.25.3] - 2026-06-06

### Fixed
- **Rollback scripts now derive the edge-function list from the target ref** (`scripts/rollback.sh` + `.ps1`). They hard-coded the current function set including `health`, so rolling back to a ref that predates a function (e.g. `health`, added in 1.25.0) would run `supabase functions deploy health` from a worktree where `supabase/functions/health` doesn't exist — and with `set -e` / `$ErrorActionPreference="Stop"` that aborted the rollback partway. Now each script lists `git ls-tree -d <ref>:supabase/functions`, deploying exactly the functions present in that ref. (Codex PR #36 P2.)

## [1.25.2] - 2026-06-06

### Changed
- **Tightened edge-function rate limits to real usage.** `upsert-urgent-item` 30→10/min: it's the single sync path for create *and* resolve, so the per-UID budget is shared — 10/min covers normal use (one tap-type-done = 1 call) and only rapid bulk-resolve of 10+ items in a minute trips it, which fails safe (resolves locally, syncs on retry). `notify-shopping-started` 20→5/min: each call pushes a notification to *every* family member, so a loose cap is notification-spam exposure, not just backend cost — nobody legitimately starts shopping 5+ times a minute. `reconcile-subscription` (5) and `register-device-token` (10) unchanged.

## [1.25.1] - 2026-06-06

### Changed
- **Removed dead `UsageTracker` numeric-limit code** — `canProcessOCR`, `incrementOCRCounter`, and `getRemainingUsage` had zero callers (OCR is ad-gated now), and the surviving comments falsely claimed "enforcement is in Cloud Functions" (no such function exists). Removed the three dead methods and corrected the class/method docs to state the truth: numeric caps are disabled on every tier (ad-based model), `canCreateList` always allows today and is a UX gate only, and there is no server-side count enforcement. No behavior change — `getUsageSummary` (subscription screen) and `canCreateList`/`incrementListCounter` (list create flow) are untouched.

### Notes
- **Backlog — family-member cap.** `TIER_FEATURES` advertises "Up to 10 Family Members" for the family tier; wiring `maxFamilyMembers` through is deferred (this pass was infra/security only). When implemented, enforce server-side at join-approval — either a maintained `memberCount` checked in the RTDB rule, or a join-approval edge function — not client-side.

## [1.25.0] - 2026-06-06

### Added
- **`health` edge function** — a public liveness probe for an external uptime monitor. Checks that both backends are reachable (Postgres via a trivial select, RTDB via an unauthenticated shallow probe) and returns 200 (`ok`) or 503 (`degraded`). Returns no data, and caches its result for 15s so a monitor (or abuser) can't add load. Added to the deploy workflow; RUNBOOK §6 lists it as a second monitor target alongside OCR.
- **One-command backend rollback** — `scripts/rollback.ps1` (+ `.sh`) redeploys the edge functions *and* RTDB rules from a known-good git ref via a throwaway git worktree (working tree untouched). Does not touch migrations (forward-only). Documented in RUNBOOK §3.

### Changed
- **RUNBOOK refresh** — §3 documents the rollback script; §6 adds the backend health endpoint; §7 rewritten to match reality; new §10 documents a quarterly secret-rotation schedule.

## [1.24.0] - 2026-06-06

### Added
- **App Check (device attestation) wired into the client** — added `@react-native-firebase/app-check` and `src/services/AppCheckService.ts`, initialized first in `App.tsx` so attestation tokens attach to subsequent Firebase traffic. Release builds use Play Integrity (Android) / App Attest (iOS); `__DEV__` uses the debug provider so the AVD keeps working. Init is resilient — a failure never blocks startup. **Enforcement is a console-side step handled outside this repo**, ramped one API at a time. Requires a native rebuild.

## [1.23.1] - 2026-06-06

### Fixed
- **RevenueCat webhook is now idempotent on retries** — RC re-delivers the same `event.id` on any non-2xx/blip. The webhook already ratcheted tier writes on `tierUpdatedAt` (a replay couldn't move a tier backward), but it re-did Firebase/RevenueCat work each time. It now claims the event id in a new `processed_webhook_events` ledger (RLS-deny, 30-day pg_cron sweep) before processing and **acks duplicates with 200 without reprocessing**; if processing throws, the claim is released so RC's retry re-runs. Fails open on any ledger error (the ratchet keeps a reprocess harmless). **Apply migration `20260606010000_add_processed_webhook_events.sql` before/with deploy.**

## [1.23.0] - 2026-06-06

### Added
- **Per-UID rate limiting on edge functions** — the one missing security control before a public release. A Postgres fixed-window counter (`rate_limit_buckets` + atomic `check_rate_limit()` RPC, RLS-deny, hourly pg_cron sweep) is checked post-auth, keyed on the verified Firebase uid, in `upsert-urgent-item` (30/min), `notify-shopping-started` (20/min), `register-device-token` (10/min), and `reconcile-subscription` (5/min). Over-limit returns 429 + `Retry-After`. The check **fails open** on any limiter error — it's abuse/cost protection layered on top of auth + membership, never the access boundary itself, so a limiter blip never denies a legit caller. **Apply migration `20260606000000_add_rate_limit_buckets.sql` before/with deploy** (functions degrade gracefully if it's missing).

## [1.22.5] - 2026-06-06

### Security
- **`reconcile-subscription` now verifies the caller** — the edge function previously authorized only by an ownership check (does this `appUserId` belong to this `familyGroupId`), leaving it callable by anyone who could guess a valid uid/group pair. It now requires a Firebase ID token, verifies the signature/claims inline (same pattern as `upsert-urgent-item`), and rejects unless the verified `uid === appUserId` (401/403). The client sends a fresh ID token with the reconcile call.
- **Removed the unused Google Cloud Vision API key from the build** — OCR has routed through a server-side function since the key was dropped from `ReceiptOCRProcessor` (v earlier), but `GOOGLE_CLOUD_VISION_API_KEY` was still injected into the APK/IPA build `.env` by CI and declared in `@env`. Removed the dead references from `android-build.yml`, `ios-build.yml`, `src/types/env.d.ts`, `setup-secrets.ps1`, and `.env.example` so the key never enters the client bundle env. (The GitHub secret can be deleted separately.)

## [1.22.4] - 2026-06-05

### Fixed
- **Family group join was impossible (`permission-denied`)** — `submitJoinRequest` read the whole `/familyGroups/$groupId` node, which RTDB rules restrict to existing members, so a prospective joiner was always denied before a request could be sent. The flow now reads only joiner-permitted paths: the group name comes from the world-readable invitation, and the "already a member" check reads the user's own `memberIds/$uid` entry. No security rules were changed. Validated end-to-end on device (submit → approve → auto-complete → navigate into group)

### Changed
- **Invitations now store `groupName`** — written in both `createFamilyGroup` and `ensureInvitationCode` so a joiner can show the group name on the waiting screen without reading the members-only group node. Invitations created before this release have no `groupName` and fall back to "your family group" (display-only; self-heals on the next invite-code regeneration)

## [1.22.3] - 2026-06-05

### Fixed
- **CI lint failure in `upsert-urgent-item`** — removed the unused `created_by` destructured from the request body; the body's `created_by` is intentionally never trusted (attribution uses the verified caller / stored value), so the binding was dead code tripping `no-unused-vars`

## [1.22.2] - 2026-06-05

### Added
- **Pre-push static-analysis gate** — `.git/hooks/pre-push` runs `knip` (dead code + unused deps), `tsc --noEmit` (type errors), and `eslint src/` (lint) before every push; any failure blocks the push (bypass with `git push --no-verify`)
- **`knip` dev dependency** — pinned locally so the pre-push hook runs offline and fast instead of fetching via `npx`; `knip.json` tuned to ignore React Native tooling false positives (`@env`, `metro-config`, gradle plugin, etc.)
- **Changelog enforcement** — pre-commit hook now blocks a `package.json` version bump unless `CHANGELOG.md` is also staged

### Changed
- **Rewrote `RUNBOOK.md` in plain language** — added a two-backend intro, clickable section index, and why-before-how explanations; no procedures, commands, or secrets changed

### Removed
- **Dead exports flagged by knip** — removed unused `PRODUCT_TIER_MAP` (`SubscriptionConfig.ts`), `OCRStatusType` + `OCRError` (`types.ts`), and `MainTabParamList` (`navigation.ts`); each had zero references
- **Unused `ReceiptOCRProcessor` service** — dead Google Cloud Vision code path; OCR has routed through `ReceiptOCRService` (self-hosted PaddleOCR) since v1.x
- **`react-native-fs` dependency** — last consumer removed alongside `ReceiptOCRProcessor`; file uploads now stream from URI via FormData
- **13 stale local-only doc files** — removed git-ignored, ~4-month-stale reference docs (`API_DOCUMENTATION`, `COMPONENT_DOCUMENTATION`, `DATABASE_SCHEMA`, `design`, setup guides, etc.); were never tracked in git

## [1.17.0] - 2026-04-12
### Added
- **In-camera OCR preview overlay** — receipt scan now auto-triggers OCR immediately after capture, showing parsed fields (merchant, date, total, item count, confidence) in a bottom overlay before the user confirms; supports retake during loading with fetch cancellation via AbortController; single atomic write on confirm saves both `receiptUrl` and `receiptData` together

### Fixed
- **Receipt data not syncing across devices** — `receiptData` writes from OCR processing, retry, and manual edits now route through `ShoppingListManager.updateList` (which sets `syncStatus: 'pending'` and triggers `SyncEngine.pushChange`); previously went through `LocalStorageManager.saveReceiptData` which bypassed sync entirely
- **Backfill for pre-fix receipt data** — one-shot migration marks orphan `receiptData` rows as `sync_status: 'pending'` so they sync on next launch; batched in a single WatermelonDB transaction, deferred via `InteractionManager.runAfterInteractions`, capped at 3 retry attempts

### Changed
- **Split `extractReceipt` from `processReceipt`** — new `extractReceipt(localFilePath, signal?)` method performs OCR without persisting, accepts `AbortSignal` for cancellation; `processReceipt` now delegates to `extractReceipt` then persists via `ShoppingListManager`; removed dead `RNFS.readFile` base64 read and `react-native-fs` import from `ReceiptOCRService`

## [1.16.0] - 2026-03-30
### Changed
- **Redesigned analytics screen** — added tab navigation (Overview, Items, Stores, Prices); replaced flat summary list with 2×2 colored stat grid; items tab now shows top 8 with gold/silver/bronze rank badges; stores tab has spend-proportion progress bars; price analytics (store comparison, volatile items, smart savings) moved to dedicated Prices tab; smaller pie chart with inline legend

## [1.15.1] - 2026-03-30
### Fixed
- **Analytics showing wrong spending totals** — store totals, overall spending, monthly trends, and budget comparisons now use `receiptData.totalAmount` (the actual receipt total) when available, falling back to summing individual item prices; previously only summed item prices which produced incorrect/zero totals when items lacked individual prices

## [1.15.0] - 2026-03-30
### Changed
- **Redesigned login & signup screens** — replaced inline email/password form with two clear buttons: "Sign in with Google" and "Sign in with Email"; email/password forms moved to dedicated `EmailLoginScreen` and `EmailSignUpScreen`; added multicolor Google logo SVG component
- **Improved auth error messages** — email/password login failure now suggests Google Sign-In if the user may have signed up with Google; Google Sign-In on an existing email/password account shows a clear "use email instead" message

## [1.14.1] - 2026-03-29
### Fixed
- **Stale FCM token cleanup** — notification Edge Functions (`notify-shopping-started`, `notify-urgent-item`) now delete device tokens that FCM reports as UNREGISTERED/NOT_FOUND; `clearToken()` called on sign-out and account deletion to remove server-side tokens; tightened App.tsx FCM registration useEffect dependency to `[user?.uid, user?.familyGroupId]` to prevent redundant re-registrations

## [1.14.0] - 2026-03-28
### Added
- **Google Sign-In** — users can now register and log in with their Google account on both LoginScreen and SignUpScreen; uses `@react-native-google-signin/google-signin` v16 with Firebase Auth credential linking; handles new users (creates RTDB record) and returning users (fetches existing record); `signOut()` and `deleteUserAccount()` revoke Google access; added `auth/account-exists-with-different-credential` error handling; requires Firebase Console setup (SHA-1 fingerprint + Google provider enabled) and `GOOGLE_WEB_CLIENT_ID` env variable

## [1.13.2] - 2026-03-26
### Performance
- **Complete WatermelonDB batching** — converted remaining sequential writes (`updateItemsBatch`, `clearSyncQueue`, `clearAllData`) to `prepareUpdate`/`prepareMarkAsDeleted` + `database.batch()`; added descriptive labels to all `database.write()` calls for easier debugging; added perf timing logs to batch methods

## [1.13.1] - 2026-03-26
### Fixed
- **Android edge-to-edge support (SDK 35)** — added `EdgeToEdge.enable()` in `MainActivity.java` with `androidx.activity:activity:1.9.0` dependency to handle Android 15 enforced edge-to-edge display and migrate away from deprecated `statusBarColor`/`navigationBarColor` APIs; set `StatusBar translucent={true}` with transparent background in `App.tsx`; wrapped 4 headerless auth screens (`LoginScreen`, `SignUpScreen`, `FamilyGroupScreen`, `TermsAcceptanceScreen`) in `SafeAreaView` to prevent content rendering behind system bars

## [1.13.0] - 2026-03-26
### Added
- **Shopping started push notification** — when a user starts shopping (selects a store), all other family members receive a push notification: "🛒 [Name] is shopping at [Store]"; new `notify-shopping-started` Supabase Edge Function sends FCM V1 notifications to family group device tokens; fire-and-forget from `ListDetailScreen` via `NotificationManager.notifyShoppingStarted()`

## [1.12.1] - 2026-03-20
### Performance
- **WatermelonDB batch write optimization** — converted 8 batch methods + 2 singular upsert methods in `LocalStorageManager` from sequential `await update()`/`await create()` to `prepareUpdate`/`prepareCreate` + `database.batch()`, collapsing N native bridge round-trips per write block down to 1; each method has a try/catch fallback that re-queries fresh models and falls back to individual writes if `batch()` fails; `deleteItemsBatch` uses `prepareMarkAsDeleted` + batch (no fallback — dirty model invariant); `saveList`/`saveItem` singular replaced try-find/catch-create with query-based upsert to avoid JS exception overhead on the create path

## [1.12.0] - 2026-03-19
### Removed
- **Automatic measurement assignment** — items no longer get auto-assigned measurement units (ml, g, kg, L) on add or category change; manual measurement editing via SizeEditModal is unchanged
- Deleted `MeasurementService.ts` and `normalize.ts` (unused utility)
- Removed Firebase item preferences sync listener (`startListeningToItemPreferences`/`stopListeningToItemPreferences`)
- Removed `ItemPreference` type and all `LocalStorageManager` item preference methods (`getItemPreference`, `saveItemPreference`, `saveItemPreferencesBatch`, `deleteItemPreference`)
- Removed suggestion chip UI from SizeEditModal

## [1.11.2] - 2026-03-18
### Fixed
- **Auth fires twice on cold start** — `onAuthStateChanged` fires twice (cached credential then server validation), tearing down and re-creating Firebase RTDB listeners each time; now tracks `lastProcessedUid` to skip duplicate setup and uses `latestFirebaseUser` mutable ref so the claims listener always calls `getIdToken` on the freshest instance
- **ListDetail double observer setup** — main useEffect depended on `[listId, currentUserId]`; when `currentUserId` resolved async, React tore down all observers and re-set them up; now depends only on `[listId]` with a `currentUserIdRef` for the observer callback and a dedicated effect for lock/mode state
- **Firebase initial load race (lists & items)** — `child_added` buffer + `once('value')` sentinel had a race where the sentinel fired before all `child_added` events arrived; replaced with `once('value')` as sole initial load path; `child_added` is a no-op until `once()` completes, then handles only genuinely new records
- **Lost quantity increments on rapid tap** — observer could overwrite in-flight optimistic values; added `optimisticQtyRef` that preserves user's intended quantity until DB confirms the value matches; added 300ms per-item debounce to coalesce rapid taps into a single WMDB+Firebase write, flushed on unmount

### Chores
- Removed race condition diagnostic logger (`raceConditionLogger.ts`) and all `[RACE]` log calls

## [1.11.1] - 2026-03-18
### Fixed
- **Crash: `NativeModule.RNDeviceInfo is null`** — `sp-react-native-in-app-updates` static import triggered native module resolution at JS load time before try/catch could catch it; replaced with `NativeModules.RNDeviceInfo` guard + dynamic `require()` inside try/catch so the app launches gracefully even if native module is unlinked
- **Predicted prices not showing on list open** — `loadPredictions` captured `list?.familyGroupId` from a stale render closure; with the writer queue clear (batching fix), the timing race became deterministic and the closure was always null; switched to `listFamilyGroupIdRef.current` which always reads the latest value

### Performance
- **197 queued WatermelonDB writers on startup** — all Firebase listeners (lists, urgent items, category history, item preferences, store layouts) each fired a separate `database.write()` per `child_added` event on attach; applied the buffered `child_added` + `once('value')` sentinel pattern so all initial records are batch-upserted in a single writer per listener

## [1.11.0] - 2026-03-15
### Added
- **In-app update prompt** — checks Google Play for available updates on app launch; shows "Update Available" popup; tapping "Update" opens the Play Store listing; silently degrades on non-Play-Store installs
- **Proguard rules for Play Core** — added keep rules for `com.google.android.play.**` to prevent release-build stripping
- **Security: 0 npm audit vulnerabilities** — added `underscore>=1.13.8` override (DoS via unbounded recursion), fixed `flatted<3.4.0` (DoS via unbounded recursion in parse)

## [1.10.5] - 2026-03-15
### Fixed
- **Crash on first open with category history data** — `snapshot.val()` returns `null` when a Firebase node is empty/deleted between event dispatch and processing; `Object.keys(null)` threw a TypeError in both `child_added` and `child_changed` callbacks in the category history listener; added `!categoriesForItem || typeof categoriesForItem !== 'object'` guard before the loop
- **$0.00 budget silently lost on sync** — `firebaseData.budget || null` coerced `0` to `null`; changed to `?? null` so a zero budget syncs correctly
- **$0.00 urgent item price silently lost on sync** — same `||` vs `??` bug in the urgent item mapper; `firebaseData.price ?? null` now preserves zero prices
- **WatermelonDB observer killed by JSON.parse throw** — `receiptData` and `categoryOrder` fields parsed with bare `JSON.parse`; an invalid value (e.g. empty string from WatermelonDB default on a non-optional column) throws and kills the observer; replaced both with `safeJsonParse<T>()` helper that returns a typed fallback on error
- **WatermelonDB setup errors silently swallowed** — `onSetUpError` callback was empty; now logs via `CrashReporting.recordError`; existing comment claiming Crashlytics requires JS init was wrong — the native SDK is always active

## [1.10.4] - 2026-03-12
### Fixed
- **SizeEditModal size value lost on split entry** — entering unit via pill then typing a number (or vice versa) saved `null` for the value (e.g. card showed "kg" instead of "1kg"); both pill→type and type→pill paths now capture the numeric value via `parseFloat` fallback

## [1.10.3] - 2026-03-11
### Performance
- **Fix 1 — Haptic ref cache:** `handleToggleItem` no longer calls `AsyncStorage.getItem('hapticFeedbackEnabled')` on every toggle; value is cached in `hapticEnabledRef` via `useFocusEffect`, refreshed each time the screen gains focus
- **Fix 2 — Batch DB write for drag reorder:** `LocalStorageManager.updateItemsBatch` now runs all N item updates in a single WatermelonDB transaction (was N separate transactions); `ItemManager.updateItemsBatch` fires sync pushes in parallel; `addItemsBatch`/`deleteItemsBatch` also parallelised
- **Fix 3 — addItem sort order:** Replaced full table scan (`getItemsForList` + reduce) with `Date.now()` as monotonically-increasing sort key; saves N DB rows loaded on every item add
- **Fix 4 — SyncEngine skip redundant reads:** `pushChange` accepts optional `data` param; callers thread their freshly-written data through, eliminating 1 DB read per create/update; delete no longer reads entity (data unused by `.remove()`)
- **Fix 5 — PricePredictionService N+1:** `calculatePredictions` now issues a single `getItemsForLists(listIds)` query instead of one `getItemsForList` per completed list
- **Fix 6 — Remove dead verify-find:** `saveList` post-write `find()` verify removed (WatermelonDB `find` throws on missing record, so the null guard was permanently unreachable)
- **Fix 7 — syncPendingChanges double queue read:** `processOperationQueue` returns `QueueProcessResult` with processed/deferred counts; `syncPendingChanges` uses those counts directly (1 queue read normal path, 0 reads busy path); `ListDetailScreen` now calls `syncPendingChanges` on connectivity restore

## [1.10.2] - 2026-03-11
### Fixed
- **SizeEditModal text field shows unit** — when an item had a unit but no value, the text input was pre-filled with the unit string (e.g. "g"); it now stays empty and the unit is reflected via the pill selection and badge only
- **SizeEditModal "Set g" save button** — save button incorrectly showed "Set g" when a unit was selected but no value was entered; it now shows "Done" unless both a value and unit are present

## [1.10.1] - 2026-03-10
### Style
- **Category label on item card** — category name shown below item name in category colour, inline with size badge
- **DetailsEditModal no autoFocus** — keyboard no longer opens on modal entry, category grid is fully visible; user taps name field explicitly to edit

## [1.9.1] - 2026-03-09
### Changed
- **Split ItemEditModal into 3 focused modals** — Replaced the monolithic `ItemEditModal` with purpose-built `PriceEditModal`, `SizeEditModal`, and `DetailsEditModal`, each opening only the fields relevant to the tapped zone on the card:
  - `PriceEditModal`: large £ price input, quick-fill chips from recent store history (up to 4), "View Price History" button that opens `PriceHistoryModal` as a sibling (no z-index stacking)
  - `SizeEditModal`: combined measurement input with live unit badge, smart suggestion chip, Volume/Weight pill groups, "Clear" footer button
  - `DetailsEditModal`: large auto-focused name input, 2-column category grid with per-category color selection, Delete button with confirmation
  - Shared `ModalBottomSheet` wrapper (gradient + handle bar) extracted to avoid duplication
  - `parseCombinedInput()` extracted to `src/utils/measurement.ts` (single source of truth)
  - `ListDetailScreen` uses discriminated union `activeModal` state instead of separate `editModalVisible` / `selectedItem` / `editModalFocusField`
  - Measurement auto-assign on category change moved to `handleDetailsSave` handler
  - `HistoryDetailScreen` swapped to `PriceEditModal` (was `ItemEditModal priceOnly`)

## [1.9.0] - 2026-03-08
### Style
- **Full app visual overhaul "Liquid Glass v2"** — Unified design system across all 37+ files on branch `ui/visual-overhaul-v2`:
  - New background palette: `#0D0D14` primary, `#1E1E2E` secondary, `#181825` tertiary
  - New accent palette: blue `#6EA8FE`, purple `#A78BFA` (replacing `#007AFF` / `#AF52DE`)
  - Glass surfaces: reduced to `rgba(255,255,255,0.03)` bg / `rgba(255,255,255,0.05)` border (was 0.08/0.12)
  - Text hierarchy: white primary, `rgba(255,255,255,0.45)` secondary, `rgba(255,255,255,0.3)` tertiary
  - All primary/confirm buttons: blue→purple LinearGradient (`#6EA8FE` → `#A78BFA`)
  - Bottom-sheet modals: gradient background + handle bar (40×4px pill)
  - Tab bar: new blue active tint, `rgba(13,13,20,0.95)` bg, border opacity 0.05
  - Navigation theme: updated `primary`, `background`, `card`, `border`, `notification`
  - RADIUS: large=14, xlarge=16, added modal=24
  - Added `COMMON_STYLES.label` (11px/700/uppercase), `modalHandle`, `modalHandleContainer`
  - Added `COLORS.gradient` token group
  - ItemEditModal: combined measurement input ("500ml"), grouped pills (Volume/Weight), suggestion chip
  - All screens/components updated: auth, history, analytics, settings, subscription, receipts, budget, urgent items

## [1.8.8] - 2026-03-07
### Performance
- **Stop CategoryItemList re-rendering on every keystroke** — Wrapped `handleToggleItem`, `handleItemTap`, and `handleCategoryDragEnd` in `useCallback([], [])`. Added `isListLockedRef` to avoid capturing `isListLocked` state in the `handleItemTap` closure, keeping all three deps arrays empty so `memo`-wrapped `CategoryItemList` instances no longer re-render when the "add item" input changes.

## [1.8.7] - 2026-03-07
### Fixed
- **App crash on category change** — Moving an item to a different category crashed the app because `NestedReorderableList` received an updated `data` prop that conflicted with its internal drag-state. Fixed by keying each `CategoryItemList` on the sorted set of item IDs in that category, so the reorderable list remounts cleanly when items join or leave.

## [1.8.6] - 2026-03-06
### Refactor
- **Style extraction** — Moved inline `StyleSheet` blocks out of `ListDetailScreen` (593 lines), `SettingsScreen` (376 lines), and `HomeScreen` (290 lines) into sibling `.styles.ts` files. No behaviour change.
- **Dead code removal** — Deleted `useListDetail` hook (289 lines) that was never imported by any screen, and removed it from the hooks barrel export.

## [1.8.5] - 2026-03-06
### Fixed
- **History tab highlight** — Tapping a list in History tab no longer switches the active tab highlight back to "Shopping Lists". History now has its own stack navigator, so navigation stays within the History tab.

## [1.8.4] - 2026-03-06
### Fixed
- **History items missing** — On a fresh install or new device, completed list items were never synced to local storage (items are only synced while a list is actively open). HistoryDetailScreen now falls back to a one-time Firebase fetch when local DB returns 0 items, and persists results locally so subsequent opens are instant.

## [1.8.3] - 2026-03-05
### Fixed
- **Empty items in HistoryDetailScreen** — Three compounding issues caused completed lists to show zero items:
  1. Ghost `child_removed` events (Firebase SDK reconnection) were trusted blindly, permanently deleting items from local WatermelonDB. Fix: verify item is actually gone from Firebase before deleting locally.
  2. `saveItemsBatchUpsert` failed to recover items after they were soft-deleted (`_status='deleted'`), hitting a SQLite unique constraint on `create()`. Fix: physically destroy stale deleted records before the upsert loop using `adapter.destroyDeletedRecords`.
  3. WatermelonDB observer in HistoryDetailScreen could overwrite seeded items with `[]` (race condition). Fix: removed the observer — completed list items are immutable; price edits already reload via `loadListDetails()`.

## [1.8.2] - 2026-03-05
### Fixed
- **Measurement auto-assign on category change** — Changing a category in ItemEditModal now auto-suggests the default measurement unit (e.g., Meat → g) when no unit is currently set. Explicit user choices are never overridden.

## [1.8.1] - 2026-03-05
### Fixed
- **HistoryDetailScreen infinite spinner** — Completed lists now display immediately. Two bugs combined to cause an infinite "Loading details..." spinner: (1) items fetched by `getListDetails()` were discarded instead of seeded into state; (2) the loading guard checked `items.length === 0` which was always true before the WatermelonDB subscription fired. Fix: seed items from the initial fetch (`setItems(details.items)`) and simplify the guard to `if (loading)`.

## [1.8.0] - 2026-03-04
### Added
- **Measurement unit recognition** — Items auto-assigned a measurement unit (ml, L, g, kg) based on category and keyword rules. Learned preferences are stored per item name per family and persist across sessions.
  - Static defaults: Dairy/Beverages → ml, Meat/Fish/Pantry/Frozen → g
  - Keyword overrides: butter/cheese/yogurt → g, oil → ml
  - Learned preferences stored in new `item_preferences` table (schema v14) and synced via Firebase
- **Measurement display on item cards** — Small muted label below item name shows measurement (e.g. "500ml", "g") when set
- **Measurement editing in item modal** — Pill buttons (ml | L | g | kg) + optional numeric amount input; changes are saved as learned preferences only on explicit user edit; clearing restores static defaults
- **Schema v14** — New `item_preferences` table; `measurement_unit` and `measurement_value` columns on `items`
- **Firebase sync** — Measurement fields synced across devices via existing item sync; item preferences synced inline via `/itemPreferences` node (same architecture as category history)
- **Frequent item add fix** — `handleAddFrequentItem` now runs full category + measurement lookup, matching manual add behavior

## [1.7.13] - 2026-03-04
### Fixed
- **Completed list: "Not Purchased (N)" section** — Unchecked items now appear under an amber "Not Purchased (N)" section header above the green "Purchased" section, replacing the old amber banner. Count is visible in the header.
- **Completed list: price-only editing** — Tapping an item in a completed list opens a "Set Price" modal (price input + View Price History only; name and category fields hidden). Firebase sync listener removed from `HistoryDetailScreen` — completed lists don't need real-time updates.

## [1.7.12] - 2026-03-01
### Changed
- **Tier restructure** — Free tier list cap removed; OCR restricted to premium+ (hard-blocked at 0). Premium repositioned as ad-free for the individual; family as ad-free for the whole group under one subscription. Rewarded-ad gate for urgent items unchanged. `TIER_FEATURES` rewritten for all tiers to reflect the new value proposition.
- **Dead code removal** — `canCreateUrgentItem()` and `incrementUrgentItemCounter()` removed from `UsageTracker` (never called). `canProcessOCR` handles `maxOCRPerMonth === 0` with a clear message instead of "You've used your 0 OCR scans this month."

## [1.7.11] - 2026-03-01
### Security
- **reconcile-subscription Edge Function** — Replaced client-side `subscriptionTier` write in `RevenueCatContext` with a server-side Edge Function. Family group ownership is verified via Firebase before the RevenueCat REST API is called for the authoritative entitlement check. Client can no longer forge tier by manipulating local SDK state. Function also acts as a startup re-validation sync.

## [1.7.10] - 2026-02-27
### Security
- **User data moved to EncryptedStorage** — `@user` cache in `AuthenticationModule` (email, uid, familyGroupId) now stored in `react-native-encrypted-storage` instead of plaintext `AsyncStorage`. All 6 write paths and both clear paths updated. `signOut` and `deleteUserAccount` also remove the legacy AsyncStorage entry on upgrade.

## [1.7.9] - 2026-02-27
### Security
- **npm dependency vulnerabilities resolved** — `npm audit fix` patched `axios` (DoS via `__proto__`), `ajv`, `js-yaml`, `node-forge`, `qs`. Added `overrides` in `package.json` to pin `fast-xml-parser >=5.3.8` (stack overflow / entity expansion) and `@babel/runtime@<7.26.10 → 7.26.10` (ReDoS in named capturing group transpilation) without touching parent package versions. Result: 0 vulnerabilities.

## [1.7.8] - 2026-02-27
### Fixed
- **`sanitizeError` allowlist — 3 missing entries** — `'Urgent item name is required'` (UrgentItemManager validation), `'No receipt found for this list'` (retryFailedOCR path), and `'Item not found'` (concurrent-delete edge case in ItemManager) were not covered by the v1.7.5 allowlist and silently degraded to the generic fallback message.

## [1.7.7] - 2026-02-27
### Security
- **Deep link `listId` validation** — `ListDetailScreen` validates `listId` as a UUID on mount and rejects invalid formats immediately. `loadListMetadata` verifies `list.familyGroupId === currentUser.familyGroupId` after fetching — a foreign `listId` from a crafted deep link is rejected with "Access Denied" before any subscription or data operation starts.

## [1.7.6] - 2026-02-27
### Security
- **FCM tokens moved to EncryptedStorage** — `@fcm_token` and `@fcm_token_data` in `NotificationManager` now use `react-native-encrypted-storage`. Migration in `getFCMToken()` moves the token from AsyncStorage on first access after upgrade — existing users continue receiving notifications without re-registering.

## [1.7.5] - 2026-02-27
### Security
- **Sanitize error messages at UI boundary** — Added `sanitizeError(error)` to `sanitize.ts` and applied it across all screen-level `showAlert` catch blocks. Raw Firebase/WatermelonDB/Supabase error details no longer reach the UI. An allowlist passes through known user-facing service messages unchanged.

## [1.7.4] - 2026-02-27
### Security
- **Remove Vision API key from client bundle** — Removed `apiKey` constructor param, `this.apiKey` field, and `process.env.GOOGLE_CLOUD_VISION_API_KEY` reference from `ReceiptOCRProcessor`. The field was unused — OCR already routes through `supabase.functions.invoke('process-ocr')`.

## [1.7.3] - 2026-02-27
### Security
- **Firebase rules: `createdAt` type validation** — `createdAt` must now be a positive number on `lists`, `familyGroups/urgentItems`, and top-level `urgentItems`. Follows the `priceHistory.recordedAt` pattern already in the rules.

## [1.7.2] - 2026-02-27
### Security
- **Unicode normalization in sanitizeText** — Added `.normalize('NFKC')` before `.trim()` to prevent homograph-style injection via look-alike Unicode characters.

## [1.7.1] - 2026-02-27
### Security
- **Block direct anon REST access to Supabase tables** — `urgent_items` and `device_tokens` no longer have any RLS policies for `anon` or `authenticated` roles. All client access is now routed through Edge Functions that use `service_role` server-side, so the exposed anon key cannot be used to read or write any data.
- **New Edge Function: `upsert-urgent-item`** — replaces direct REST POST to `/rest/v1/urgent_items` from `UrgentItemManager`.
- **New Edge Function: `register-device-token`** — replaces direct REST POST to `/rest/v1/device_tokens` from `NotificationManager`.
- **`UrgentItemManager`** — `syncToSupabase` now uses `supabase.functions.invoke('upsert-urgent-item')` instead of raw fetch with anon key.
- **`NotificationManager`** — `registerToken` now uses `supabase.functions.invoke('register-device-token')` instead of raw fetch with anon key.

## [1.7.0] - 2026-02-27
### Added
- **Unchecked items flow on completion** — "Done Shopping" now intercepts when items remain unchecked and presents three options:
  - **Full Shop** — complete normally; the history card shows an amber "X items not bought" indicator.
  - **Partial Shop** — complete the current list and carry unchecked items (with their categories) into a new active list with the same name. A loading overlay covers the async work; on `createList` failure the item names are listed so the user can re-add them manually.
  - **Cancel** — dismiss the dialog and return to shopping mode.
  - If all items are checked, the existing optimistic completion flow runs unchanged.
- **`unchecked_items_count` on completed lists** — stored in DB (schema v13, migration from v12), synced through Firebase, and used by HistoryScreen cards to display the amber indicator.
- **HistoryScreen amber indicator** — cards restructured to `flexDirection: column` with an inner row; an amber "X items not bought" line appears below the date/total row when `uncheckedItemsCount > 0`.
- **HistoryDetailScreen banner + title** — items section title changes to "Items (Y/Z bought)"; an amber banner appears above items when unchecked items exist.
- **`category` support in `addItemsBatch`** — items passed to the batch creator now carry their original category, so Partial Shop preserves category assignments.

### Changed
- DB schema bumped to v13 (`unchecked_items_count` column on `shopping_lists`, optional).

## [1.6.1] - 2026-02-26
### Fixed
- **Dead import cleanup** — Removed unused `AuthenticationModule` import from HistoryDetailScreen (leftover from pre-reactive price stats code).

## [1.6.0] - 2026-02-26
### Fixed
- **History detail shows 0 items after reinstall** — HistoryDetailScreen now subscribes to WatermelonDB item observer and starts a Firebase items listener, so items sync from Firebase on fresh installs. Price stats load reactively once items arrive. Removed item delete from history (items are immutable). Made `onDelete` optional in ItemEditModal.
- **Store picker Cancel behavior** — "Skip" button renamed to "Cancel" and now aborts entirely (just closes the modal) instead of proceeding with an empty store name that would lock the list.

### Added
- **Store Price Comparison dashboard** — New ItemStoreComparison component in Analytics tab. Select any tracked item to see a bar chart comparing prices across stores, with date range filter (30/90/365 days), avg/latest price toggle, per-store volatility indicators (Low/Med/High), and text-based insights (cheapest store, most stable, latest vs average delta).
- **Most Volatile Prices chart** — Bar chart of top 10 items with the biggest price swings across all purchase history.
- **Smart Savings card** — Shows potential savings per shop by identifying the cheapest store for each item bought from multiple stores, with total savings banner.
- **`getDistinctTrackedItems()`** — New LocalStorageManager method to query all unique items with price history.
- **`getAllTrackedItems()`** — New PriceHistoryService wrapper for tracked item retrieval.
- **Price Analytics section** — New section in AnalyticsScreen below spending charts, guarded by familyGroupId availability.

## [1.5.1] - 2026-02-25
### Fixed
- **Store banner position** — Store banner (no-store warning + change-store row) now renders above the add item input for better visibility.
- **Scroll blocked on item cards** — Pan gesture handler on `NestedReorderableList` captured all touch events immediately, blocking the outer `ScrollViewContainer` scroll. Extracted `CategoryItemList` component with `Gesture.Pan().activateAfterLongPress(250)` via `panGesture` prop — pan stays in WAITING state for 250ms, letting normal scrolls pass through. Removed ineffective `scrollEnabled={false}`.

### Added
- **Category reorder arrows** — Up/down chevron arrows on category headers (when list has a store and is not locked) allow reordering categories locally. A Save button appears in the title bar to persist the new order to the store layout.

## [1.5.0] - 2026-02-23
### Added
- **Change store button** — Lists with a store set (not locked, not completed) now show a row with the current store name and a "Change" link. Tapping it opens the store picker in banner mode, updating the store name without locking the list.

### Fixed
- **Gesture crash + scroll freeze on Android (regression from v1.4.6)** — `scrollable={true}` resolved the original crash but introduced a touch-freeze at scroll boundaries. Root cause: `scrollable` activated a nested autoscroll worklet that competed with the outer `ScrollView` at the same edge pixels. Fix: patched `react-native-reorderable-list@0.18.0` to unconditionally skip `Gesture.Simultaneous` on Android (the real fix for the duplicate handler tag crash), removed `scrollable={true}` from both `NestedReorderableList` instances, and pinned the library to `0.18.0` to prevent the patch being broken by an update.
- **Items loading one-by-one on first install** — The `.catch()` fallback in `startListeningToItems` attached `child_added` with `initialItemIds` still empty, so every item was written individually. New approach: attach `child_added` immediately on a filtered ref, buffer events until Firebase's `value` fires (guaranteed after all initial `child_added` events), then flush the buffer in one batch write. `child_changed` and `child_removed` also moved from the root ref to the filtered ref to avoid processing other lists' events.

## [1.4.6] - 2026-02-23
### Fixed
- **Gesture handler crash on Android with 2+ categories** — Opening a list with items in multiple categories crashed with `Handler with tag N already exists`. Root cause: `ScrollViewContainer` creates one `Gesture.Native()` instance and shares it via context; each `NestedReorderableList` was re-registering the same native gesture tag in its own `GestureDetector` → Android threw on the second registration. Fixed by adding `scrollable={true}` to both `NestedReorderableList` elements in `ListDetailScreen`, activating the library's built-in Android fast-path that skips including the shared outer gesture in `Gesture.Simultaneous`. Inner auto-scroll is a no-op in this layout anyway (lists are unconstrained height inside the outer `ScrollView`).

## [1.4.5] - 2026-02-22
### Fixed
- **VirtualizedList warning suppressed** — `react-native-reorderable-list` requires its own `FlatList` inside `Animated.ScrollView` as part of its drag-and-drop scroll coordination architecture. Suppressed the noisy Metro warning with `LogBox.ignoreLogs`.

## [1.4.4] - 2026-02-22
### Performance
- **Items now appear all at once when opening a list** — Firebase was firing `child_added` for every existing item individually, causing N WatermelonDB writes → N observer fires → N UI re-renders. Replaced with a `once('value')` bulk fetch followed by a single `saveItemsBatchUpsert()` write inside one `database.write()` transaction — one observer fire for all items.
- **`child_added` attached after batch completes** — Listener is now attached inside `.then()` so `initialItemIds` is fully populated before streaming begins, eliminating the race condition where initial items were double-processed.
- **Firebase server-side indexes** — Added `.indexOn: ["listId"]` on the `items` node and `.indexOn: ["recordedAt"]` on `priceHistory`. Without these, Firebase downloaded all items for the whole family group and filtered client-side. Now filtering runs on the server.

### Fixed
- **`quantity: 0` and `price: 0.00` silently dropped** — `firebaseData.quantity || null` and `firebaseData.price || null` treated `0` as falsy, writing `null` to the DB. Changed to `?? null` in `syncItemToLocal`.

## [1.4.3] - 2026-02-21
### Fixed
- **Drag not working** — Long-press on item cards was swallowed by nested `TouchableOpacity` components inside `AnimatedItemCard`. Fixed by passing the `drag()` function via render prop from `DraggableItemRow` into `AnimatedItemCard`, where it is applied as `onLongPress` directly on the content touchable. Drag now works reliably on the full item text/price area.
- **StoreLayoutEditor crash** — `ReorderableList` was imported as a named export but is only a default export in `react-native-reorderable-list@0.18.0`, causing a render crash that also corrupted gesture handler state for the whole screen.
- **`sortOrder=0` silently dropped** — `item.sortOrder || null` treated `0` as falsy, writing `null` to the DB for the first item in every category. Changed to `item.sortOrder ?? null` in `LocalStorageManager` and `FirebaseSyncListener`.
- **Items not sorted by drag order** — Observer was sorting items by `createdAt` instead of `sortOrder`, ignoring saved drag positions on next load. Fixed to sort by `sortOrder ?? createdAt`.
- **Firebase echo-back corrupting sort order** — After a drag, the local write triggered a Firebase `child_changed` event which was written back to local DB with stale data, overwriting the new `sortOrder`. Fixed by skipping sync writes where `existingItem.updatedAt > firebaseData.updatedAt`.

## [1.4.2] - 2026-02-21
### Fixed
- **CI build broken** — `react-native-reorderable-list` caused npm to silently upgrade `react-native-reanimated` from `3.10.0` → `3.19.5` in the lock file. Version `3.19.5` requires React Native 0.78+, breaking the Android CI build. Pinned reanimated to exactly `3.16.7` — which requires only RN 0.71+ and satisfies the `>=3.12.0` peer dependency of `react-native-reorderable-list`.

## [1.4.1] - 2026-02-21
### Fixed
- **Drag-and-drop wrong-item bug** — Migrated item drag-and-drop in `ListDetailScreen` and `StoreLayoutEditor` from `react-native-draggable-flatlist` to `react-native-reorderable-list`. The new library runs drag gestures on the UI thread via Reanimated worklets, eliminating the stale-closure bug that caused the wrong item to move.
- **Removed old drag library** — Uninstalled `react-native-draggable-flatlist`; no longer referenced anywhere.
- **react-native-reanimated pinned to 3.10.0** for compatibility with React Native 0.74.

## [1.4.0] - 2026-02-20
### Added
- **Store layout** — Save the physical aisle/category order for a store so the shopping list shows items grouped in the order you'll encounter them. Layouts are stored per store name and synced across family members via Firebase RTDB.
- **Layout toggle** — "Sort by store layout" / "Store layout active" toggle button on lists that have a store name. Layout is off by default; users opt in per list.
- **Store Layout Editor** — New screen to drag-and-drop the 12 predefined categories into store order. Long-press a row to drag.
- **Per-category item drag-and-drop** — Within each category group, items can be reordered by long-press drag. Order persists to local DB and syncs via Firebase.
- **Layout resets on store change** — Changing a list's store name automatically clears `layoutApplied`.
- **WatermelonDB schema v12** — New `store_layouts` table; `layout_applied` boolean column on `shopping_lists`.
- **Firebase rules** — `storeLayouts` node added under `familyGroups.$groupId` with member-only read/write and field validation.

## [1.3.0] - 2026-02-19
### Added
- **Permanent price history (cloud-synced)** — Price records are now stored in a dedicated `price_history` WatermelonDB table (schema v11) and mirrored to Firebase RTDB. History survives reinstall and phone changes.
- **Price recorded on check-off** — When an item with a non-null price is checked off, a record is written to both local DB and Firebase. Price records are per store (`storeName` from the shopping list).
- **Firebase bulk-then-stream sync** — On mount, all existing Firebase price records are fetched in one `once('value')` batch write. New records arriving from other devices are streamed via `child_added` filtered to post-session timestamps only (no re-download of history on foreground return).
- **One-time backfill** — On first launch after upgrade, all checked items with prices from completed local lists are back-filled into the new table and written to Firebase. Uses deterministic IDs (`backfill_<listId>_<itemId>`) — safe to re-run, duplicates are skipped.
- **Graceful upgrade window** — `getPriceHistory()` falls back to legacy completed-list reconstruction until the backfill flag is set, so price history screens never go blank during the upgrade.
- **WatermelonDB migration v10 → v11** — `createTable` migration adds the `price_history` table for existing installs.

## [1.2.3] - 2026-02-18
### Fixed
- **Consent dialog before login** — `AdMobProvider` was mounted outside the auth gate, causing the UMP consent dialog to appear on the login screen. Moved `AdMobProvider` inside the authenticated branch so it never mounts for unauthenticated users.
- **Thank-you alert fires immediately after login** — `AdConsentGate` mounted fresh after login but found `consentObtained=true` from the pre-login consent run and fired the alert instantly. Resolved by the same `AdMobProvider` relocation above.
- **Banner and interstitial ads never displaying** — Premature consent/loading race prevented ads from initialising. Fixed alongside the above; ads now initialise only after the user's tier is confirmed.
- **Ads race condition** — Added `setIsLoading(true)` at the start of `handleUser` in `RevenueCatContext` to keep `isLoading=true` for the entire async window while RevenueCat and Firebase resolve the user's tier.

## [1.2.2] - 2026-02-17
### Fixed
- `CustomAlert` background was semi-transparent; made it solid.
- Consent form re-triggered on every app foreground after first acceptance; added guard.
- Stale `showInterstitial` ref caused interstitial not to show.
- Ad shown on list completion even for premium users; added tier check.
- Empty-list guard missing before showing interstitial.
- App did not navigate back after list completion.

## [1.2.1] - 2026-02-16
### Fixed
- Urgent item Firebase sync failed with `permission-denied` — `createdAt` was a `Date` object; converted to `Number()` before writing.
- Supabase urgent item sync failed with `401 Invalid API key`.
- WatermelonDB observer did not fire when urgent item status changed from `active` to `resolved`; switched to broad query + JS filter.

## [1.2.0] - 2026-02-15
### Added
- Interstitial ad shown when opening a list (2-minute cooldown between shows).
- One-time "thank you for using the app" alert shown after consent is obtained.

## [1.1.1] - 2026-02-14
### Fixed
- Premium users were shown the UMP consent flow; skipped consent for premium tier.

## [1.1.0] - 2026-02-13
### Added
- AdMob banner and interstitial ads for free-tier users.
- UMP consent flow (GDPR) before showing ads.

## [1.0.1] - 2026-02-12
### Fixed
- Keyboard dismissed incorrectly on certain input fields.
- Error type cleanup across auth screens.

## [1.0.0] - 2026-02-11
### Added
- Initial Play Store release.
