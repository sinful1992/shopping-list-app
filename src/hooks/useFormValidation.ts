import { useState, useCallback } from 'react';
import { ValidationResult } from '../utils/validation';

type ValidatorFn = (value: string) => ValidationResult;

interface ValidatorMap {
  [field: string]: ValidatorFn;
}

interface UseFormValidationReturn {
  errors: { [field: string]: string | null };
  validate: (field: string, value: string) => boolean;
  validateAll: (values: { [field: string]: string }) => boolean;
  clearError: (field: string) => void;
  clearAllErrors: () => void;
  setError: (field: string, error: string) => void;
  hasErrors: boolean;
}

/**
 * useFormValidation Hook
 *
 * Provides form validation with inline error display.
 * Pass a map of field names to validator functions.
 *
 * Usage:
 *   const { errors, validate, validateAll, clearError } = useFormValidation({
 *     email: validateEmail,
 *     password: validatePassword,
 *   });
 *
 *   // Validate on blur
 *   <TextInput onBlur={() => validate('email', email)} />
 *   {errors.email && <Text style={styles.error}>{errors.email}</Text>}
 *
 *   // Validate all on submit
 *   const handleSubmit = () => {
 *     if (validateAll({ email, password })) {
 *       // Submit form
 *     }
 *   };
 */
export function useFormValidation(validators: ValidatorMap): UseFormValidationReturn {
  const [errors, setErrors] = useState<{ [field: string]: string | null }>({});

  // Validate a single field
  const validate = useCallback((field: string, value: string): boolean => {
    const validator = validators[field];
    if (!validator) {
      return true;
    }

    const result = validator(value);

    setErrors(prev => ({
      ...prev,
      [field]: result.valid ? null : (result.error || 'Invalid value'),
    }));

    return result.valid;
  }, [validators]);

  // Validate all fields at once
  const validateAll = useCallback((values: { [field: string]: string }): boolean => {
    const newErrors: { [field: string]: string | null } = {};
    let allValid = true;

    for (const [field, validator] of Object.entries(validators)) {
      const value = values[field] || '';
      const result = validator(value);

      if (!result.valid) {
        allValid = false;
        newErrors[field] = result.error || 'Invalid value';
      } else {
        newErrors[field] = null;
      }
    }

    setErrors(newErrors);
    return allValid;
  }, [validators]);

  // Clear error for a specific field
  const clearError = useCallback((field: string) => {
    setErrors(prev => ({
      ...prev,
      [field]: null,
    }));
  }, []);

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Set error manually (for API errors)
  const setError = useCallback((field: string, error: string) => {
    setErrors(prev => ({
      ...prev,
      [field]: error,
    }));
  }, []);

  // Check if any errors exist
  const hasErrors = Object.values(errors).some(error => error !== null);

  return {
    errors,
    validate,
    validateAll,
    clearError,
    clearAllErrors,
    setError,
    hasErrors,
  };
}

export default useFormValidation;
