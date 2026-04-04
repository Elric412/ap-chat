export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const COMMON_PASSWORD_PATTERNS = [
  'password',
  '123456',
  'qwerty',
  'letmein',
  'admin',
  'welcome',
];

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password cannot contain repeated characters three or more times in a row');
  }

  const lowered = password.toLowerCase();
  if (COMMON_PASSWORD_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    errors.push('Password contains common or easily guessable patterns');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
