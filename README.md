@ -0,0 +1,111 @@
# TiketKu

[![Build Status](https://github.com/SaMuEl-Primo/TiketKu/actions/workflows/ci.yml/badge.svg)](https://github.com/SaMuEl-Primo/TiketKu/actions)
[![Coverage Status](https://coveralls.io/repos/github/SaMuEl-Primo/TiketKu/badge.svg?branch=main)](https://coveralls.io/github/SaMuEl-Primo/TiketKu?branch=main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Project overview
TiketKu is a decentralized event‑ticketing dApp built on Ethereum Sepolia. It prevents counterfeiting, scalping, unauthorized transfers, and duplicate check‑ins through an on‑chain ERC‑721 ticket system.

## Architecture diagram
```mermaid
flowchart TD
    subgraph Contract
        C[TiketKu.sol]
    end
    subgraph Backend
        B[Express API]
        DB[(MongoDB Atlas)]
        SI[SIWE Auth]
    end
    subgraph Frontend
        F[Next.js (TS)]
        M[MetaMask]
    end
    C --> B
    B --> DB
    B --> SI
    F --> M
    F --> B
```

## Installation & setup
```bash
# Clone repo
git clone https://github.com/SaMuEl-Primo/TiketKu.git
cd TiketKu

# Install all workspaces
npm run install-all   # installs contracts, backend, frontend
```

### Contracts
```bash
cd contracts
npm install
npx hardhat compile
```

### Backend
```bash
cd ../backend
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, RPC_URL
npm install
npm run dev   # starts Express server
```

### Frontend
```bash
cd ../frontend
cp .env.example .env   # set NEXT_PUBLIC_RPC_URL, CONTRACT_ADDRESS
npm install
npm run dev   # starts Next.js dev server
```

## Usage examples
- **Deploy contract**:
  ```bash
  cd contracts
  npx hardhat run scripts/deploy.js --network sepolia
  ```
- **Create an event (via backend)**:
  ```http
  POST /api/events
  {
    "metadataURI": "ipfs://Qm...",
    "price": "0.01",
    "maxSupply": 100,
    "maxPerWallet": 5,
    "maxResalePrice": "0.05",
    "eventDate": 1735689600
  }
  ```
- **Buy a ticket (frontend)**: Connect MetaMask, select an event, click *Buy* – transaction is sent to the contract.

## Testing instructions
```bash
# Contract unit tests
cd contracts
npm test

# Backend tests (if added later)
cd ../backend
npm test

# Frontend tests (React Testing Library / Cypress)
cd ../frontend
npm test
```

## Security notes
- All state‑changing functions are protected by OpenZeppelin `AccessControl`, `Pausable`, and `ReentrancyGuard`.
- No secrets are stored in the repo; use `.env` files for private keys, JWT secret, and MongoDB credentials.
- Follow the **Security** doc in `docs/security.md` for detailed threat model and recommended audits (Slither, MythX, etc.).

## Contribution guidelines
1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Ensure all tests pass (`npm run test`).
4. Open a Pull Request with a clear description.
5. Follow the code style defined in `.eslintrc` (if added) and run `npm run lint` before committing.
