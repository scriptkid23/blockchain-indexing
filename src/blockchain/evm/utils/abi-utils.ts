import { ethers } from 'ethers';

/**
 * Utility functions for working with ABI and event signatures
 */
export class AbiUtils {
  /**
   * Extract event signatures from ABI
   * @param abi - Contract ABI array
   * @returns Array of event signatures (keccak256 hashes)
   */
  static extractEventSignatures(abi: any[]): string[] {
    const eventSignatures: string[] = [];

    for (const item of abi) {
      if (item.type === 'event') {
        const signature = this.getEventSignature(item);
        eventSignatures.push(signature);
      }
    }

    return eventSignatures;
  }

  /**
   * Get event signature hash from event ABI
   * @param eventAbi - Event ABI object
   * @returns Event signature hash (0x...)
   */
  static getEventSignature(eventAbi: any): string {
    // Build the canonical event signature string
    const inputs = eventAbi.inputs || [];
    const inputTypes = inputs.map((input: any) => input.type).join(',');
    const signature = `${eventAbi.name}(${inputTypes})`;

    // Calculate keccak256 hash
    return ethers.id(signature);
  }

  /**
   * Get event signature from event declaration string
   * @param eventDeclaration - Event declaration string (e.g., "Transfer(address,address,uint256)")
   * @returns Event signature hash
   */
  static getEventSignatureFromDeclaration(eventDeclaration: string): string {
    return ethers.id(eventDeclaration);
  }

  /**
   * Get event name from signature hash (reverse lookup)
   * @param signatureHash - Event signature hash
   * @param abi - Contract ABI array
   * @returns Event name or null if not found
   */
  static getEventNameFromSignature(
    signatureHash: string,
    abi: any[]
  ): string | null {
    for (const item of abi) {
      if (item.type === 'event') {
        const signature = this.getEventSignature(item);
        if (signature === signatureHash) {
          return item.name;
        }
      }
    }
    return null;
  }

  /**
   * Get event ABI from signature hash
   * @param signatureHash - Event signature hash
   * @param abi - Contract ABI array
   * @returns Event ABI object or null if not found
   */
  static getEventAbiFromSignature(
    signatureHash: string,
    abi: any[]
  ): any | null {
    for (const item of abi) {
      if (item.type === 'event') {
        const signature = this.getEventSignature(item);
        if (signature === signatureHash) {
          return item;
        }
      }
    }
    return null;
  }

  /**
   * Validate if an event signature is valid
   * @param signatureHash - Event signature hash to validate
   * @returns true if valid format
   */
  static isValidEventSignature(signatureHash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(signatureHash);
  }

}
