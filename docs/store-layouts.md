# Store layouts — captured by hand

Per-store walk order for the app's 12 categories, read off each retailer's own
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

One per category. Swap any item for an equivalent you'd genuinely buy — what
matters is that it lands in one obvious aisle, not what it is.

| Category      | Seed item          | Why this one                                  |
| ------------- | ------------------ | --------------------------------------------- |
| Produce       | Bananas            | Always in fresh fruit & veg                    |
| Bakery        | White bread loaf   | In-store bakery, not the ambient cake aisle    |
| Dairy         | Semi-skimmed milk  | Chilled wall                                   |
| Meat          | Chicken breasts    | Fresh meat, not frozen or deli                 |
| Fish          | Salmon fillets     | Fresh fish counter/chiller                     |
| Frozen        | Frozen peas        | Unambiguously a freezer aisle                  |
| Pantry        | Baked beans        | Centre ambient aisle                           |
| Beverages     | Cola or squash     | Ambient drinks — avoid juice, often chilled    |
| Household     | Washing-up liquid  | Cleaning aisle                                 |
| Personal Care | Shampoo            | Toiletries                                     |
| Medicine      | Paracetamol        | Pharmacy counter — often far from toiletries   |
| Other         | *(no seed)*        | Catch-all, has no shelf                        |

## Captured stores

*(none yet)*

### Template — copy per store

```
#### <Retailer> — <branch>
Captured: <YYYY-MM-DD>  ·  Source: <retailer> app, in-store list, aisle-sorted

 1. <Category>
 2. ...
12. Other

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
- Any order reaching the UI must name all 12 categories. One missing renders its
  items nowhere; `completeCategoryOrder` in `src/services/categoryOrder.ts`
  guards this, and anything reading from this file should keep going through it.
