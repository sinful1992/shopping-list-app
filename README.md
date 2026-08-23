# Family Shopping List

A shared shopping list for a family, on the phones they already carry — plus a
record of what everything cost last time.

## 🧾 Why it exists

Two things kept going wrong at home.

The first was the paper. We would write the week's list out by hand, and then
either walk round the shop reading a scrunched-up bit of paper, or realise it
was still on the kitchen table. A list you left at home is no list at all. Phones
are the one thing everybody has on them, so the list belongs there: anyone in the
family can add to it during the week, and whoever ends up passing a shop already
knows exactly what is needed at home.

The second was prices. I could never remember what something had cost a while
back — whether this week's price was normal or whether it had quietly gone up.
So the app keeps the receipts: photograph one at the till, and the shop, date,
total and line items are read off it and filed against that trip. The answer to
"what did we pay for this last time" stops being a guess.

## 📱 What it does

**The list**
- Anyone in the family group adds to the same list from their own phone, and it
  shows up on everybody else's straight away
- Check items off as you go round the shop
- Works with no signal — the list lives on the phone and syncs when a connection
  comes back
- Flag something as urgent and the rest of the family gets a notification — for
  when you need it on today's trip, not next week's
- Join a family group with an invitation code

**The money**
- Photograph a receipt and it is read automatically: merchant, date, total, and
  the individual lines
- Shopping history keeps every completed trip together with its receipt
- Spending totals and budget analysis over whatever date range you pick

No feature is locked behind a subscription. The free tier is ad-supported —
scanning a receipt or raising an urgent item costs an ad first — and the premium
and family subscriptions remove the ads, family doing so for everyone in the
group.

## 🚦 Release status

**On Google Play, in closed testing.** The app is published to the Play Console
on a **closed testing track** — it is not publicly listed, does not appear in
Play Store search, and can only be installed by invited testers who have
accepted the opt-in. There is no open testing or production release, so a Play
Store link is of no use to anyone outside the tester list.

- **Package**: `com.familyshoppinglist.app`
- **Track**: closed testing (invite-only)
- **Platform**: Android only — there is no `ios/` project in this repository
- **Builds**: signed AAB/APK produced by GitHub Actions; see [.github/workflows](./.github/workflows)

## 🛠 Development

```bash
npm install
npm run android
```

A fresh clone will not build: `.env` and `android/app/google-services.json` are
gitignored, so they have to be copied in from a machine that already has them
(`.env.example` lists the keys). Everything else — the Firebase project, its
Auth/RTDB/Storage setup, the signing keystore — already exists and is not
something anyone sets up again.

Most of the behaviour lives in `src/services/`. `SyncEngine`,
`LocalStorageManager` and `ShoppingListManager` are the three to read first.

Scripts live in `package.json` (`test`, `lint`, `typecheck`, `knip`). Two things
that are not obvious from there:

- `npm run test:rules` runs the Realtime Database rules tests against the
  Firebase emulator, and needs **JDK 21+**.
- Git hooks enforce the gates: **pre-commit** runs the encoding check and the
  full jest suite, and refuses a `src/` change that has not bumped the version
  in `package.json`; **pre-push** runs knip, `tsc` and eslint — the same gates
  CI runs.

## 🔐 Security

- Firebase Security Rules enforce family group access control
- Firebase ID tokens verified server-side in Supabase edge functions
- Per-UID rate limiting on sensitive edge functions
- Offline data encrypted at rest (platform-provided)

## 📋 Documentation

- **[RUNBOOK.md](./RUNBOOK.md)** — deployment, backups, restores, key rotation, release testing
- **[CHANGELOG.md](./CHANGELOG.md)** — recent fixes and changes
- **[LICENSE](./LICENSE)** — proprietary licence terms
- **[docs/DESIGN_AUDIT.md](./docs/DESIGN_AUDIT.md)** — design system audit and its follow-up
- **[docs/DATA_SAFETY.md](./docs/DATA_SAFETY.md)** — Play Console data-safety declarations
- **[docs/store-layouts.md](./docs/store-layouts.md)** — per-store category order capture

## 📝 License

**Proprietary — all rights reserved.** See [LICENSE](./LICENSE). This is not open
source: being able to read the code grants no right to use, copy, modify or
distribute it. Third-party dependencies keep their own licences, and people who
install the published app are covered by the in-app Terms of Service in
[`src/legal/`](./src/legal), not by this repository licence.

## 📞 Support

Open an issue in the repository.
