/**
 * Cache configuration for EVM block scan listener
 * These values can be overridden via environment variables
 */
export const CACHE_CONFIG = {
  receipt: {
    maxSize: parseInt(
      process.env.RECEIPT_CACHE_MAX_SIZE || '3000',
      10,
    ),
    keepSize: parseInt(
      process.env.RECEIPT_CACHE_KEEP_SIZE || '1500',
      10,
    ),
  },
  block: {
    maxSize: parseInt(
      process.env.BLOCK_CACHE_MAX_SIZE || '2000',
      10,
    ),
    keepSize: parseInt(
      process.env.BLOCK_CACHE_KEEP_SIZE || '1000',
      10,
    ),
  },
} as const;
