/**
 * Privacy Policy for Family Shopping List
 * Last updated: February 2026
 */

export const PRIVACY_POLICY_URL = 'https://sinful1992.github.io/familyshoppinglist-legal/privacy.html';

export const PRIVACY_POLICY_CONTENT = `
# Privacy Policy for Family Shopping List

**Last Updated: February 2026**

## Introduction

Family Shopping List ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.

## Information We Collect

### Information You Provide
- **Account Information**: Email address, display name, and family role when you create an account
- **Shopping Data**: Shopping lists, items, prices, and categories you create
- **Receipt Images**: Photos of receipts you upload for record-keeping
- **Family Group Data**: Information about your family group membership

### Information Collected Automatically
- **Device Information**: Device type, operating system, and unique device identifiers
- **Usage Data**: How you interact with the app, features used, and timestamps
- **Crash Reports**: Technical data when the app experiences errors (via Firebase Crashlytics)

## How We Use Your Information

We use your information to:
- Provide and maintain the shopping list service
- Sync your shopping lists across family members in real-time
- Process and store receipt images
- Track spending and provide budget analytics
- Send notifications about urgent items and shopping updates
- Improve our services and fix technical issues
- Process subscription payments

## Third-Party Services

We use the following third-party services:

### Firebase (Google)
- **Authentication**: Secure sign-in and account management
- **Realtime Database**: Real-time sync of shopping lists between family members
- **Cloud Storage**: Storing receipt images securely
- **Crashlytics**: Monitoring app stability and fixing crashes
- **Analytics**: Understanding how the app is used to improve features

Firebase Privacy Policy: https://firebase.google.com/support/privacy

### Supabase
- **Push Notifications**: Delivering urgent item alerts to family members
- Device tokens are stored securely to enable notifications

Supabase Privacy Policy: https://supabase.com/privacy

### RevenueCat
- **Subscription Management**: Processing in-app purchases and subscriptions
- Your purchase history (subscription status, purchase dates, product identifiers) is shared with RevenueCat to manage your subscription
- We do not store your payment card details; payment processing is handled by Google Play

RevenueCat Privacy Policy: https://www.revenuecat.com/privacy

## Camera and Photo Access

We request camera access to:
- Capture receipt photos after shopping trips
- Receipt images are stored in Firebase Cloud Storage and linked to your shopping lists
- You can delete receipt images at any time

## Data Sharing Within Family Groups

When you join a family group:
- Your display name and role are visible to other family members
- Shopping lists and items are shared with all group members
- Your shopping activity (items checked, lists completed) is visible to the group

## Data Retention

- **Account Data**: Retained while your account is active
- **Shopping Lists**: Active lists retained indefinitely; completed lists archived for history
- **Receipt Images**: Stored until you delete them or delete your account
- **Analytics Data**: Aggregated and anonymized data may be retained indefinitely

## Your Rights

You have the right to:
- **Access**: View all data we have about you
- **Delete**: Delete your account and all associated data
- **Export**: Request a copy of your data (contact support)
- **Correct**: Update your profile information at any time

To delete your account, go to Settings > Danger Zone > Delete Account. This permanently removes:
- Your user profile
- All shopping lists you created
- All items you added
- All receipt images
- Your family group membership

## Data Security

We implement security measures including:
- Encrypted data transmission (HTTPS/TLS)
- Secure authentication via Firebase Auth
- Access controls limiting data visibility to family group members
- Regular security updates

## Children's Privacy

Family Shopping List is not intended for children under 13. We do not knowingly collect information from children under 13. If you believe we have collected such information, please contact us.

## Changes to This Policy

We may update this Privacy Policy periodically. We will notify you of significant changes through the app or via email.

## Contact Us

For privacy-related questions or concerns:
- Email: privacy@familyshoppinglist.app
- In-app: Settings > Contact Support

## Legal Basis for Processing (GDPR)

For users in the European Economic Area, we process your data based on:
- **Contract**: To provide the shopping list service
- **Consent**: For optional features like notifications
- **Legitimate Interest**: To improve our services and prevent fraud
`;

export default PRIVACY_POLICY_CONTENT;
