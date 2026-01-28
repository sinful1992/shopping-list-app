/**
 * English translations for Family Shopping List
 * This is the default language
 */

export default {
  // Common
  common: {
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    done: 'Done',
    retry: 'Retry',
    ok: 'OK',
    yes: 'Yes',
    no: 'No',
    search: 'Search',
    close: 'Close',
  },

  // Navigation
  navigation: {
    lists: 'Shopping Lists',
    urgent: 'Urgent',
    history: 'History',
    analytics: 'Analytics',
    budget: 'Budget',
    subscription: 'Pro',
    settings: 'Settings',
  },

  // Auth
  auth: {
    login: 'Login',
    signUp: 'Sign Up',
    logout: 'Logout',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    forgotPassword: 'Forgot Password?',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
  },

  // Family Group
  familyGroup: {
    title: 'Family Group',
    create: 'Create Family Group',
    join: 'Join Family Group',
    invitationCode: 'Invitation Code',
    copyCode: 'Copy Code',
    members: 'Family Members',
    groupName: 'Group Name',
    role: 'Family Role',
    roles: {
      dad: 'Dad',
      mom: 'Mom',
      son: 'Son',
      daughter: 'Daughter',
      olderSon: 'Older Son',
      olderDaughter: 'Older Daughter',
      youngerSon: 'Younger Son',
      youngerDaughter: 'Younger Daughter',
    },
  },

  // Shopping Lists
  lists: {
    title: 'Shopping Lists',
    newList: 'New List',
    listName: 'List Name',
    noLists: 'No shopping lists yet',
    createFirst: 'Create your first shopping list!',
    items: 'items',
    completed: 'completed',
    startShopping: 'Start Shopping',
    finishShopping: 'Finish Shopping',
    deleteList: 'Delete List',
    deleteConfirm: 'Are you sure you want to delete this list?',
  },

  // Items
  items: {
    addItem: 'Add Item',
    itemName: 'Item Name',
    quantity: 'Quantity',
    price: 'Price',
    category: 'Category',
    noItems: 'No items in this list',
    addFirst: 'Add your first item!',
    checked: 'Checked',
    unchecked: 'Unchecked',
  },

  // Categories
  categories: {
    produce: 'Produce',
    dairy: 'Dairy',
    meat: 'Meat',
    bakery: 'Bakery',
    frozen: 'Frozen',
    beverages: 'Beverages',
    snacks: 'Snacks',
    household: 'Household',
    personal: 'Personal Care',
    other: 'Other',
  },

  // Urgent Items
  urgent: {
    title: 'Urgent Items',
    addUrgent: 'Add Urgent Item',
    noUrgent: 'No urgent items',
    resolved: 'Resolved',
    markResolved: 'Mark as Resolved',
  },

  // History
  history: {
    title: 'Shopping History',
    noHistory: 'No shopping history yet',
    completedOn: 'Completed on',
    total: 'Total',
    receipt: 'Receipt',
  },

  // Budget
  budget: {
    title: 'Budget',
    monthlyLimit: 'Monthly Limit',
    weeklyLimit: 'Weekly Limit',
    spent: 'Spent',
    remaining: 'Remaining',
    overBudget: 'Over Budget',
    onTrack: 'On Track',
    alerts: 'Budget Alerts',
  },

  // Analytics
  analytics: {
    title: 'Analytics',
    totalSpent: 'Total Spent',
    avgPerTrip: 'Avg per Trip',
    topCategories: 'Top Categories',
    spendingTrend: 'Spending Trend',
    last30Days: 'Last 30 Days',
    last90Days: 'Last 90 Days',
    lastYear: 'Last Year',
  },

  // Settings
  settings: {
    title: 'Settings',
    account: 'Account',
    appSettings: 'App Settings',
    hapticFeedback: 'Haptic Feedback',
    hapticDescription: 'Enable vibration feedback when checking items',
    legal: 'Legal',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    dangerZone: 'Danger Zone',
    deleteAccount: 'Delete Account',
    deleteWarning: 'Permanently delete your account and all data',
  },

  // Subscription
  subscription: {
    title: 'Pro Features',
    free: 'Free',
    premium: 'Premium',
    family: 'Family',
    upgrade: 'Upgrade to Pro',
    restore: 'Restore Purchases',
    manageSubscription: 'Manage Subscription',
  },

  // Errors
  errors: {
    networkError: 'Network error. Please check your connection.',
    authError: 'Authentication failed. Please try again.',
    syncError: 'Sync failed. Changes will be synced when online.',
    loadError: 'Failed to load data. Please try again.',
    saveError: 'Failed to save. Please try again.',
    deleteError: 'Failed to delete. Please try again.',
  },
};
