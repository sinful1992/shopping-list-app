# Data Safety Form Reference

Reference for completing the Google Play Console Data Safety form.

## Data Collection & Sharing

| Category | Data Type | Collected | Shared With | Purpose |
|----------|-----------|-----------|-------------|---------|
| Personal info | Email address | Yes | No | Account management |
| Personal info | Name | Yes | No | App functionality |
| Financial info | Purchase history | Yes | RevenueCat | Subscription management |
| Financial info | Other (prices, budgets) | Yes | No | App functionality |
| App activity | App interactions | Yes | Firebase Analytics | Analytics |
| App info & perf | Crash logs | Yes | Firebase Crashlytics | App stability |
| App info & perf | Diagnostics | Yes | Firebase Crashlytics | App stability |
| Device IDs | Device identifiers | Yes | Firebase | Analytics, notifications |
| Device IDs | Advertising ID (AD_ID) | Yes | Google AdMob | Advertising, analytics, fraud prevention |
| Location | Approximate location (from IP) | Yes | Google AdMob | Advertising, analytics, fraud prevention |
| App activity | App interactions (ad views, taps) | Yes | Google AdMob | Advertising, analytics, fraud prevention |
| App info & perf | Diagnostics (ads SDK) | Yes | Google AdMob | Analytics, fraud prevention |
| Photos | Receipt photos (optional) | Yes | No (service providers: Firebase Storage, Supabase ocr-proxy, Hugging Face OCR) | App functionality |

## Additional Declarations

- **Data encrypted in transit**: Yes
- **Users can request data deletion**: Yes (Settings > Danger Zone > Delete Account)
- **App targets children**: No
- **Contains ads**: Yes (rewarded ads, free tier only; UMP consent in the UK/EEA)

AdMob rows follow Google's disclosure guide: https://developers.google.com/admob/android/privacy/play-data-disclosure
