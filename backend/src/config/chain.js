import { ethers } from 'ethers';
import { env } from './env.js';

// ABI minimal: backend hanya MEMBACA dari smart contract.
const ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function events(uint256) view returns (uint256 eventId, string metadataURI, uint256 price, uint256 maxSupply, uint256 maxPerWallet, uint256 maxResalePrice, uint256 eventDate, uint256 minted, uint8 status, address organizer)',
];

export const provider = new ethers.JsonRpcProvider(env.rpcUrl);
export const contract = new ethers.Contract(env.contractAddress, ABI, provider);

// Harus sama dengan konstanta di TiketKu.sol:
//   ADMIN_ROLE = keccak256("ADMIN"), EVENT_ORGANIZER_ROLE = keccak256("EVENT_ORGANIZER")
export const ROLES = {
  ADMIN: ethers.id('ADMIN'),
  ORGANIZER: ethers.id('EVENT_ORGANIZER'),
};

export const isAdmin = (address) => contract.hasRole(ROLES.ADMIN, address);
export const isOrganizer = (address) => contract.hasRole(ROLES.ORGANIZER, address);

// Alamat EO pemilik event (lowercase), atau null jika event tidak ada di blockchain.
export async function getEventOrganizer(eventId) {
  const ev = await contract.events(eventId);
  return ev.organizer === ethers.ZeroAddress ? null : ev.organizer.toLowerCase();
}
