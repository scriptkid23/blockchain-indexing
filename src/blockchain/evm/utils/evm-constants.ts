import { ethers } from 'ethers';

// Standard ERC20 ABI - minimal version
export const ERC20_ABI = [
  // Read functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  
  // Write functions
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// USDT specific ABI (extends ERC20 with USDT-specific functions)
export const USDT_ABI = [
  // Standard ERC20 functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint256)', // Note: USDT returns uint256, not uint8
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  
  // USDT specific functions
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function deprecated() view returns (bool)',
  'function upgradedAddress() view returns (address)',
  'function getBlackListStatus(address) view returns (bool)',
  'function isBlackListed(address) view returns (bool)',
  'function basisPointsRate() view returns (uint256)',
  'function maximumFee() view returns (uint256)',
  
  // Admin functions
  'function pause()',
  'function unpause()',
  'function deprecate(address _upgradedAddress)',
  'function addBlackList(address _evilUser)',
  'function removeBlackList(address _clearedUser)',
  'function destroyBlackFunds(address _blackListedUser)',
  'function issue(uint256 amount)',
  'function redeem(uint256 amount)',
  'function setParams(uint256 newBasisPoints, uint256 newMaxFee)',
  
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Issue(uint256 amount)',
  'event Redeem(uint256 amount)',
  'event Deprecate(address newAddress)',
  'event DestroyedBlackFunds(address _blackListedUser, uint256 _balance)',
  'event AddedBlackList(address _user)',
  'event RemovedBlackList(address _user)',
  'event Pause()',
  'event Unpause()',
  'event Params(uint256 feeBasisPoints, uint256 maxFee)',
];

// Common ERC20 Event Names (simple string names)
export const ERC20_EVENTS = {
  TRANSFER: 'Transfer',
  APPROVAL: 'Approval',
} as const;

// USDT specific event names
export const USDT_EVENTS = {
  ...ERC20_EVENTS,
  ISSUE: 'Issue',
  REDEEM: 'Redeem',
  DEPRECATE: 'Deprecate',
  DESTROY_BLACK_FUNDS: 'DestroyedBlackFunds',
  ADDED_BLACK_LIST: 'AddedBlackList',
  REMOVED_BLACK_LIST: 'RemovedBlackList',
  PAUSE: 'Pause',
  UNPAUSE: 'Unpause',
  PARAMS: 'Params',
} as const;

// Contract type mapping
export const CONTRACT_TYPES = {
  ERC20: 'erc20',
  USDT: 'usdt',
} as const;

/**
 * Get ABI by contract type/symbol
 */
export function getABI(contractType: string): string[] {
  switch (contractType.toLowerCase()) {
    case 'usdt':
      return USDT_ABI;
    case 'erc20':
    default:
      return ERC20_ABI;
  }
}

/**
 * Get supported events by contract type
 */
export function getSupportedEvents(contractType: string): string[] {
  switch (contractType.toLowerCase()) {
    case 'usdt':
      return Object.values(USDT_EVENTS);
    case 'erc20':
    default:
      return Object.values(ERC20_EVENTS);
  }
}

/**
 * Check if an event is supported for a contract type
 */
export function isSupportedEvent(eventName: string, contractType: string): boolean {
  const supportedEvents = getSupportedEvents(contractType);
  return supportedEvents.includes(eventName);
}

/**
 * Get event signature hash from event name using ethers.js
 */
export function getEventSignatureHash(eventName: string, abi: string[]): string | null {
  try {
    const iface = new ethers.Interface(abi);
    const event = iface.getEvent(eventName);
    return event ? event.topicHash : null;
  } catch (error) {
    return null;
  }
}

/**
 * Get event name from signature hash using ethers.js
 */
export function getEventNameFromHash(signatureHash: string, abi: string[]): string | null {
  try {
    const iface = new ethers.Interface(abi);
    
    // Try to find the event by topic hash
    for (const fragment of iface.fragments) {
      if (fragment.type === 'event') {
        const eventFragment = fragment as ethers.EventFragment;
        if (eventFragment.topicHash === signatureHash) {
          return eventFragment.name;
        }
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Create contract instance with ABI
 */
export function createContractInstance(
  address: string,
  contractType: string,
  provider: ethers.Provider | ethers.Signer
): ethers.Contract {
  const abi = getABI(contractType);
  return new ethers.Contract(address, abi, provider);
}

/**
 * Parse event log using contract interface
 */
export function parseEventLog(
  log: ethers.Log,
  contractType: string
): ethers.LogDescription | null {
  try {
    const abi = getABI(contractType);
    const iface = new ethers.Interface(abi);
    return iface.parseLog(log);
  } catch (error) {
    return null;
  }
}

/**
 * Utility to sleep for specified milliseconds
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(
  amount: string | bigint,
  decimals: number,
  maxDecimals: number = 6
): string {
  try {
    const value = typeof amount === 'string' ? BigInt(amount) : amount;
    const divisor = BigInt(10 ** decimals);
    const formatted = Number((value * BigInt(1000000)) / divisor) / 1000000;
    
    return formatted.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals,
    });
  } catch (error) {
    return amount.toString();
  }
}

/**
 * Check if transfer amount is considered large
 */
export function isLargeTransfer(
  amount: string | bigint,
  decimals: number,
  isStablecoin: boolean = false
): boolean {
  try {
    const value = typeof amount === 'string' ? BigInt(amount) : amount;
    const divisor = BigInt(10 ** decimals);
    const tokenAmount = Number(value) / Number(divisor);
    
    // Different thresholds for different token types
    if (isStablecoin) {
      return tokenAmount >= 100_000; // 100k for stablecoins
    }
    
    return tokenAmount >= 1_000_000; // 1M for other tokens
  } catch (error) {
    return false;
  }
} 