import { ethers } from 'ethers';
import { env } from './env.js';

// ABI minimal: backend hanya MEMBACA dari smart contract (EventTicket.sol).
const ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function events(uint256) view returns (string name, address organizer, uint256 price, uint256 maxSupply, uint256 sold, uint16 maxResaleBps, uint64 eventDate)',
];

export const provider = new ethers.JsonRpcProvider(env.rpcUrl);
export const contract = new ethers.Contract(env.contractAddress, ABI, provider);

// Harus sama dengan EventTicket.sol:
//   DEFAULT_ADMIN_ROLE = 0x00..00 (bawaan OpenZeppelin AccessControl)
//   ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE"), GATE_ROLE = keccak256("GATE_ROLE")
export const ROLES = {
  ADMIN: ethers.ZeroHash,
  ORGANIZER: ethers.id('ORGANIZER_ROLE'),
  GATE: ethers.id('GATE_ROLE'),
};

export const isAdmin = (address) => contract.hasRole(ROLES.ADMIN, address);
export const isOrganizer = (address) => contract.hasRole(ROLES.ORGANIZER, address);
export const isGate = (address) => contract.hasRole(ROLES.GATE, address);

// Alamat EO pemilik event (lowercase), atau null jika event tidak ada / sudah dihapus.
export async function getEventOrganizer(eventId) {
  const ev = await contract.events(eventId);
  return ev.organizer === ethers.ZeroAddress ? null : ev.organizer.toLowerCase();
}
