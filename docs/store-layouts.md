# Store layouts — captured by hand

Per-store walk order for the app's categories, read off each retailer's own
in-store list and typed in here.

Captured manually and deliberately. Tesco's Terms define "the Site" as the
website *and* the Clubcard app, and prohibit automated access to either "for any
purpose" without written consent — with no personal-use exception. Reading your
own app and typing the result in is entirely outside that. A script is not.
Nothing in this directory should ever be filled in by a scraper.

## How to capture a store

1. In the retailer's app, pick the store, then build an in-store list from the
   seed basket below — one item per category, chosen to sit unambiguously in a
   single aisle.
2. Let the app sort the list by aisle for that store.
3. Read the seed items back in the order they now appear. That order *is* the
   category order — the seed item stands in for its category.
4. Record it under "Captured stores" using the template.

Two things to watch:

- **Two seeds in one aisle**: their relative order is arbitrary. Pick whichever
  you actually reach first when walking; it only has to be right for you.
- **`Other` never gets a seed.** It's the app's catch-all for uncategorised
  items, so it has no shelf. Put it last unless you have a reason not to.

## Seed basket

One seed per category is usually enough now. The categories that used to need
several — Produce, Pantry, Beverages, Household — were the ones whose seeds came
back split across distant aisles, and in 1.38.0 they were split up for exactly
that reason. Where a category still sprawls, sample it at more than one point.

Scale it to the shop: a small Express is fine on one seed per category, a 20+
aisle Extra wants the lot. Swap anything for an equivalent you'd genuinely buy.

| Category             | Seeds                                  | Watch for                                            |
| -------------------- | -------------------------------------- | ---------------------------------------------------- |
| Fruit                | Bananas · apples                       | Loose vs pre-packed can be separate bays             |
| Vegetables           | Potatoes · carrots                     | —                                                    |
| Salad & Herbs        | Bagged salad · fresh basil             | Herbs sit with the veg in some stores, the salad in others |
| Bakery               | White loaf · croissants                | In-store bakery vs the ambient cake/biscuit aisle    |
| Dairy & Eggs         | Milk · yoghurt · butter · eggs         | Eggs frequently sit off the chilled wall             |
| Cheese               | Cheddar · brie                         | Blocks by the milk, specials on a deli counter       |
| Deli & Chilled       | Bacon · sliced ham · houmous           | Often its own counter, away from raw meat            |
| Meat                 | Chicken breasts · beef mince           | —                                                    |
| Fish                 | Salmon fillets                         | Counter vs chiller — usually one place either way    |
| Frozen               | Frozen peas · ice cream · frozen pizza | Freezer runs span several aisles                     |
| Tins & Packets       | Baked beans · tinned tomatoes          | —                                                    |
| Pasta & Rice         | Spaghetti · basmati rice               | Sometimes shelved with the world foods               |
| Cereals              | Cornflakes · porridge oats             | —                                                    |
| Cooking & Condiments | Cooking oil · ketchup · dried oregano  | Herbs and spices are often their own bay             |
| Snacks & Sweets      | Crisps · chocolate · biscuits          | Biscuits often sit nearer the ambient cakes          |
| Soft Drinks          | Cola · squash                          | —                                                    |
| Tea & Coffee         | Teabags · ground coffee                | Rarely anywhere near the soft drinks                 |
| Alcohol              | Wine · lager                           | Sometimes walled off with its own till               |
| Cleaning             | Washing-up liquid · laundry detergent  | —                                                    |
| Kitchen & Paper      | Bin bags · kitchen roll                | Distinct from cleaning in most large stores          |
| Personal Care        | Shampoo · toothpaste · deodorant       | —                                                    |
| Medicine             | Paracetamol · plasters                 | Pharmacy counter, usually far from toiletries        |
| Other                | *(no seed)*                            | Catch-all, has no shelf                              |

The four retired categories — Produce, Pantry, Beverages, Household — still exist
so items filed under them before the split keep working, but they need no seed:
nothing new can be filed under them, and they drain as items get re-edited.

Where a category's seeds still come back split across distant aisles, note it —
that's a real limit of the model, not a mistake in the capture.

## Captured stores

*(none yet)*

### Template — copy per store

```
#### <Retailer> — <branch>
Captured: <YYYY-MM-DD>  ·  Source: <retailer> app, in-store list, aisle-sorted

 1. <Category>
 2. ...
23. Other

Notes: <anything that surprised you — split sections, a category with no
       obvious single home, seeds that shared an aisle>
```

## What happens to these

Nothing automatic yet. Today the app learns a store's order only when someone
reorders the categories on a list and taps Save, which writes a `StoreLayout`
keyed on `(storeName, familyGroupId)`.

Two known gaps if these get wired in:

- `storeName` is free text, so every Tesco shares one `StoreLayout`. Recording a
  second Tesco branch here needs a separate branch field first — **not** branch
  baked into `storeName`, which is also the join key for price history and would
  orphan it (`PriceHistoryService`, `AnalyticsService`, the cheaper-elsewhere
  badge in `CategoryItemList`).
- Any order reaching the UI must name every category, retired ones included. One
  missing renders its items nowhere; `completeCategoryOrder` in
  `src/services/categoryOrder.ts` guards this, and anything reading from this
  file should keep going through it. A capture written against an older category
  list is still usable — `completeCategoryOrder` slots anything it omits in
  beside that category's siblings rather than dumping it after `Other`.
