import { StyleSheet } from 'react-native';
import { Theme, RADIUS, NUMERIC, STATUS_BAR } from '../../styles/theme';

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: theme.glass.medium,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.medium,
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text.primary,
    flex: 1,
  },
  titleInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: theme.text.primary,
    backgroundColor: theme.glass.medium,
    padding: 10,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  titleSaveButton: {
    backgroundColor: theme.accent.green,
    padding: 10,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: theme.accent.greenDim,
  },
  titleCancelButton: {
    backgroundColor: theme.accent.redSubtle,
    padding: 10,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: theme.accent.redDim,
  },
  addItemContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: theme.glass.medium,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  input: {
    flex: 1,
    backgroundColor: theme.glass.subtle,
    padding: 12,
    borderRadius: RADIUS.large,
    marginRight: 10,
    borderWidth: 1,
    borderColor: theme.border.medium,
    color: theme.text.primary,
  },
  addButton: {
    backgroundColor: theme.accent.blue,
    padding: 10,
    borderRadius: RADIUS.medium,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
  },
  addButtonText: {
    color: theme.text.onAccent,
    fontWeight: '600',
  },
  frequentItemsButton: {
    backgroundColor: theme.glass.medium,
    padding: 10,
    borderRadius: RADIUS.medium,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border.medium,
    marginRight: 10,
    minWidth: 44,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: theme.text.secondary,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 24,
    paddingBottom: 8,
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  categoryArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  arrowButton: {
    padding: 4,
  },
  saveLayoutButton: {
    backgroundColor: theme.accent.blueSubtle,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.small,
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
  },
  saveLayoutButtonDisabled: {
    opacity: 0.5,
  },
  saveLayoutText: {
    fontSize: 14,
    color: theme.accent.blue,
    fontWeight: '600',
  },
  listScrollContainer: {
    flex: 1,
  },
  flatListContent: {
    paddingBottom: 100,
  },
  listFooter: {
    paddingHorizontal: 10,
    paddingTop: 20,
    paddingBottom: 20,
  },
  viewReceiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent.blue,
    padding: 16,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
    gap: 10,
    marginBottom: 10,
  },
  viewReceiptIcon: {
    fontSize: 20,
  },
  viewReceiptText: {
    color: theme.text.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  attachPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.glass.subtle,
    padding: 16,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: theme.border.medium,
    gap: 10,
  },
  attachPhotoButtonDisabled: {
    opacity: 0.5,
  },
  attachPhotoIcon: {
    fontSize: 20,
  },
  attachPhotoText: {
    color: theme.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  smartStatusBar: {
    borderBottomWidth: 1,
    minHeight: 40,
  },
  statusShopping: {
    backgroundColor: STATUS_BAR.shopping,
    borderBottomColor: STATUS_BAR.shoppingBorder,
  },
  statusLocked: {
    backgroundColor: STATUS_BAR.locked,
    borderBottomColor: STATUS_BAR.lockedBorder,
  },
  statusCompleted: {
    backgroundColor: STATUS_BAR.completed,
    borderBottomColor: STATUS_BAR.completedBorder,
  },
  statusContentCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIcon: {
    fontSize: 16,
  },
  statusTextCompact: {
    color: STATUS_BAR.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  budgetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 4,
  },
  budgetBadgeWarning: {
    backgroundColor: STATUS_BAR.budgetWarning,
  },
  budgetBadgeOver: {
    backgroundColor: STATUS_BAR.budgetOver,
  },
  budgetBadgeText: {
    ...NUMERIC,
    color: STATUS_BAR.ink,
    fontSize: 12,
    fontWeight: 'bold',
  },
  expandButton: {
    padding: 4,
  },
  doneButtonCompact: {
    backgroundColor: STATUS_BAR.scrim,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  doneButtonText: {
    color: STATUS_BAR.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  statusContentExpanded: {
    padding: 16,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  expandedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Same row, but on the right of a space-between row against a "Status:"
  // label, so it has to give way rather than overflow on a narrow screen.
  expandedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  expandedTitle: {
    color: STATUS_BAR.ink,
    fontSize: 16,
    fontWeight: 'bold',
  },
  collapseButton: {
    padding: 4,
  },
  expandedStats: {
    gap: 8,
    marginBottom: 12,
  },
  expandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandedLabel: {
    color: STATUS_BAR.inkMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  expandedValue: {
    color: STATUS_BAR.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  textOk: {
    color: STATUS_BAR.ink,
  },
  textWarning: {
    color: STATUS_BAR.inkWarning,
    flexShrink: 1,
  },
  textOver: {
    color: STATUS_BAR.inkOver,
  },
  expandedButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  // Outlined, not a white scrim: white-on-white-over-green never passed in
  // either theme, and an outline reads as the secondary action it is.
  cancelButtonExpanded: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: STATUS_BAR.ink,
    padding: 12,
    borderRadius: RADIUS.small,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: STATUS_BAR.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  // No border: the gradient is this button's only child and fills it, so a
  // border would inset the gradient by 1px and show the panel through the gap.
  doneButtonExpanded: {
    flex: 1,
    borderRadius: RADIUS.small,
    overflow: 'hidden',
  },
  // Sits on the blue→purple gradient, not on the status bar, so it takes the
  // theme's on-accent ink rather than the pinned bar ink.
  gradientDoneButtonText: {
    color: theme.text.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  storeWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.accent.yellowDim,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.accent.yellowDim,
  },
  storeWarningText: {
    flex: 1,
    fontSize: 12,
    color: theme.accent.yellow,
  },
  storeWarningLink: {
    fontSize: 12,
    color: theme.accent.blue,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginLeft: 8,
  },
  changeStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  changeStoreLabel: {
    flex: 1,
    fontSize: 12,
    color: theme.text.secondary,
  },
  changeStoreLink: {
    fontSize: 12,
    color: theme.accent.blue,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginLeft: 8,
  },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.overlay.dark,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  gradientDoneButton: {
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 12,
    width: '100%' as const,
    // flex, not height: '100%'. The parent's height is auto, so a percentage
    // height has no definite box to resolve against and Yoga measures it
    // against the available space instead — the gradient claimed the whole
    // viewport, its parent grew to contain it, and the row (and the status
    // bar with it) filled the screen. flex: 1 fills the height the row's
    // stretch actually hands out, which Cancel's intrinsic height sets.
    flex: 1,
  },
});

export default createStyles;
