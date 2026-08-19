/**
 * Legal Documents Index
 * Export all legal document content and URLs
 */

export { PRIVACY_POLICY_CONTENT } from './PrivacyPolicy';
export { TERMS_OF_SERVICE_CONTENT } from './TermsOfService';

// Bumped whenever the wording of either document changes: an acceptance record
// points at a version, so the version has to move when the words do. Raising it
// makes every user re-accept on next launch.
export const CURRENT_TERMS_VERSION = 2;
