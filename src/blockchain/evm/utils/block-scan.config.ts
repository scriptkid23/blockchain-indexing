/**
 * Block scan configuration for EVM block scan listener
 * These values can be overridden via environment variables
 */
export const BLOCK_SCAN_CONFIG = {
  scanIntervalMs: parseInt(
    process.env.SCAN_INTERVAL_MS || '5000',
    10,
  ),
  blocksPerScan: parseInt(
    process.env.BLOCKS_PER_SCAN || '100',
    10,
  ),
  maxRetries: parseInt(
    process.env.RPC_MAX_RETRIES || '3',
    10,
  ),
  retryDelay: parseInt(
    process.env.RPC_RETRY_DELAY || '1000',
    10,
  ),
} as const;
