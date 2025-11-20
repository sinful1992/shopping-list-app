import AsyncStorage from '@react-native-async-storage/async-storage';
import BudgetTracker from './BudgetTracker';

/**
 * BudgetAlertService
 * Manages budget alerts and threshold checking
 * Supports monthly, weekly, and per-list budgets
 */

export type BudgetPeriod = 'weekly' | 'monthly';
export type AlertLevel = 'safe' | 'warning' | 'caution' | 'danger';

export interface BudgetSettings {
  monthlyLimit: number | null;
  weeklyLimit: number | null;
  enableAlerts: boolean;
}

export interface BudgetAlert {
  level: AlertLevel;
  percentage: number;
  spent: number;
  limit: number;
  remaining: number;
  message: string;
  exceeded: boolean;
}

class BudgetAlertService {
  private static instance: BudgetAlertService;

  private constructor() {}

  static getInstance(): BudgetAlertService {
    if (!BudgetAlertService.instance) {
      BudgetAlertService.instance = new BudgetAlertService();
    }
    return BudgetAlertService.instance;
  }

  /**
   * Get budget settings for a family group
   */
  async getBudgetSettings(familyGroupId: string): Promise<BudgetSettings> {
    try {
      const key = `budget_settings_${familyGroupId}`;
      const data = await AsyncStorage.getItem(key);

      if (data) {
        return JSON.parse(data);
      }

      // Default settings
      return {
        monthlyLimit: null,
        weeklyLimit: null,
        enableAlerts: true,
      };
    } catch (error) {
      console.error('Error getting budget settings:', error);
      return {
        monthlyLimit: null,
        weeklyLimit: null,
        enableAlerts: true,
      };
    }
  }

  /**
   * Save budget settings for a family group
   */
  async saveBudgetSettings(
    familyGroupId: string,
    settings: BudgetSettings
  ): Promise<void> {
    try {
      const key = `budget_settings_${familyGroupId}`;
      await AsyncStorage.setItem(key, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving budget settings:', error);
      throw error;
    }
  }

  /**
   * Check budget status for a specific period
   */
  async checkBudget(
    familyGroupId: string,
    period: BudgetPeriod
  ): Promise<BudgetAlert | null> {
    try {
      const settings = await this.getBudgetSettings(familyGroupId);

      if (!settings.enableAlerts) {
        return null;
      }

      // Get the limit for the specified period
      const limit = period === 'monthly'
        ? settings.monthlyLimit
        : settings.weeklyLimit;

      if (!limit || limit <= 0) {
        return null;
      }

      // Calculate days back based on period
      const daysBack = period === 'monthly' ? 30 : 7;
      const startDate = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
      const endDate = Date.now();

      // Get expenditure for the period
      const expenditure = await BudgetTracker.calculateExpenditureForDateRange(
        familyGroupId,
        startDate,
        endDate
      );

      const spent = expenditure.totalAmount;
      const percentage = (spent / limit) * 100;
      const remaining = limit - spent;
      const exceeded = spent > limit;

      // Determine alert level based on percentage
      let level: AlertLevel;
      if (percentage < 50) {
        level = 'safe';
      } else if (percentage < 75) {
        level = 'warning';
      } else if (percentage < 90) {
        level = 'caution';
      } else {
        level = 'danger';
      }

      // Generate message
      let message: string;
      if (exceeded) {
        message = `Budget exceeded by £${Math.abs(remaining).toFixed(2)}`;
      } else if (percentage >= 90) {
        message = `Only £${remaining.toFixed(2)} remaining (${Math.round(percentage)}% spent)`;
      } else if (percentage >= 75) {
        message = `£${remaining.toFixed(2)} remaining (${Math.round(percentage)}% spent)`;
      } else if (percentage >= 50) {
        message = `${Math.round(percentage)}% of ${period} budget spent`;
      } else {
        message = `£${remaining.toFixed(2)} remaining`;
      }

      return {
        level,
        percentage,
        spent,
        limit,
        remaining,
        message,
        exceeded,
      };
    } catch (error) {
      console.error('Error checking budget:', error);
      return null;
    }
  }

  /**
   * Get alert level color for UI
   */
  getAlertColor(level: AlertLevel): string {
    switch (level) {
      case 'safe':
        return '#30D158'; // Green
      case 'warning':
        return '#FFD60A'; // Yellow
      case 'caution':
        return '#FFB340'; // Orange
      case 'danger':
        return '#FF453A'; // Red
      default:
        return '#30D158';
    }
  }

  /**
   * Check if alert should be shown for current spending
   */
  shouldShowAlert(alert: BudgetAlert | null): boolean {
    if (!alert) return false;

    // Show alert if at 50% or above
    return alert.percentage >= 50;
  }

  /**
   * Get budget progress for display (0-100, capped at 100)
   */
  getBudgetProgress(spent: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min((spent / limit) * 100, 100);
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    return `£${amount.toFixed(2)}`;
  }

  /**
   * Get alert icon based on level
   */
  getAlertIcon(level: AlertLevel): string {
    switch (level) {
      case 'safe':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'caution':
        return '🟠';
      case 'danger':
        return '🚨';
      default:
        return '✅';
    }
  }

  /**
   * Check if budget is available for a period
   */
  async hasBudgetForPeriod(
    familyGroupId: string,
    period: BudgetPeriod
  ): Promise<boolean> {
    const settings = await this.getBudgetSettings(familyGroupId);
    const limit = period === 'monthly'
      ? settings.monthlyLimit
      : settings.weeklyLimit;
    return limit !== null && limit > 0;
  }

  /**
   * Clear budget settings (for testing or reset)
   */
  async clearBudgetSettings(familyGroupId: string): Promise<void> {
    try {
      const key = `budget_settings_${familyGroupId}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error clearing budget settings:', error);
      throw error;
    }
  }
}

export default BudgetAlertService.getInstance();
