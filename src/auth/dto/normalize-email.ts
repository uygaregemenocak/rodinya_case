import type { TransformFnParams } from 'class-transformer';

export function normalizeEmail({ value }: TransformFnParams) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim().toLowerCase();
}
