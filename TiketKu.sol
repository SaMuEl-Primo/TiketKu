// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title TiketKu
 * @dev ERC-721 ticketing system with role based access control and security safeguards.
 */
contract TiketKu is ERC721Enumerable, AccessControl, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant EVENT_ORGANIZER_ROLE = keccak256("EVENT_ORGANIZER");
    bytes32 public constant GATE_STAFF_ROLE = keccak256("GATE_STAFF");

    // Event status
    enum EventStatus { Active, Cancelled, Completed }

    struct EventInfo {
        uint256 eventId;
        string metadataURI;
        uint256 price; // in wei
        uint256 maxSupply;
        uint256 maxPerWallet;
        uint256 maxResalePrice;
        uint256 eventDate; // timestamp
        uint256 minted;
        EventStatus status;
        address organizer;
    }

    struct TicketInfo {
        uint256 tokenId;
        uint256 eventId;
        bool isUsed; // check‑in flag
        uint256 resalePrice; // 0 if not listed
        address reseller; // address that listed for resale
    }

    // Mappings
    mapping(uint256 => EventInfo) public events; // eventId => info
    uint256 public nextEventId;
    mapping(uint256 => TicketInfo) public tickets; // tokenId => info
    mapping(address => mapping(uint256 => uint256)) public walletPurchases; // wallet => eventId => count
    // Gate staff per event
    mapping(uint256 => mapping(address => bool)) public gateStaff;

    // Events for off‑chain indexing
    event EventCreated(uint256 indexed eventId, address indexed organizer);
    event EventUpdated(uint256 indexed eventId);
    event EventCancelled(uint256 indexed eventId);
    event TicketPurchased(address indexed buyer, uint256 indexed eventId, uint256 quantity);
    event TicketListed(uint256 indexed tokenId, uint256 price, address indexed seller);
    event TicketResale(address indexed buyer, uint256 indexed tokenId, uint256 price);
    event TicketCheckedIn(uint256 indexed tokenId, address indexed staff);
    event RefundClaimed(address indexed owner, uint256 indexed tokenId, uint256 amount);
    event FundsWithdrawn(address indexed organizer, uint256 indexed eventId, uint256 amount);

    // Custom errors for gas‑efficiency
    error Unauthorized();
    error InvalidEvent();
    error EventNotActive();
    error EventCancelled();
    error EventCompleted();
    error ExceedsSupply();
    error ExceedsWalletLimit();
    error InsufficientPayment();
    error TicketNotOwned();
    error TicketAlreadyListed();
    error TicketAlreadyUsed();
    error PriceExceedsMax();
    error RefundNotAvailable();
    error AlreadyRefunded();
    error NotOrganizer();
    error NotGateStaff();
    error InvalidSignature();
    error TransferNotAllowed();

    constructor() ERC721("TiketKu Ticket", "TKU") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
    }

    // -------------------------- Role management --------------------------
    function verifyOrganizer(address organizer) external onlyRole(ADMIN_ROLE) {
        grantRole(EVENT_ORGANIZER_ROLE, organizer);
    }

    function assignGateStaff(uint256 eventId, address staff) external {
        // Only the event organizer can assign gate staff for their event
        if (events[eventId].organizer != msg.sender) revert Unauthorized();
        gateStaff[eventId][staff] = true;
        grantRole(GATE_STAFF_ROLE, staff);
    }

    // -------------------------- Pausable --------------------------
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // -------------------------- Event lifecycle --------------------------
    function createEvent(
        string calldata metadataURI,
        uint256 price,
        uint256 maxSupply,
        uint256 maxPerWallet,
        uint256 maxResalePrice,
        uint256 eventDate
    ) external onlyRole(EVENT_ORGANIZER_ROLE) {
        uint256 eventId = ++nextEventId;
        events[eventId] = EventInfo({
            eventId: eventId,
            metadataURI: metadataURI,
            price: price,
            maxSupply: maxSupply,
            maxPerWallet: maxPerWallet,
            maxResalePrice: maxResalePrice,
            eventDate: eventDate,
            minted: 0,
            status: EventStatus.Active,
            organizer: msg.sender
        });
        emit EventCreated(eventId, msg.sender);
    }

    function updateEvent(
        uint256 eventId,
        string calldata metadataURI,
        uint256 eventDate
    ) external {
        EventInfo storage ev = events[eventId];
        if (ev.organizer != msg.sender) revert Unauthorized();
        if (block.timestamp >= ev.eventDate) revert EventCompleted();
        if (ev.status != EventStatus.Active) revert EventNotActive();
        ev.metadataURI = metadataURI;
        ev.eventDate = eventDate;
        emit EventUpdated(eventId);
    }

    function cancelEvent(uint256 eventId) external {
        EventInfo storage ev = events[eventId];
        if (ev.organizer != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) revert Unauthorized();
        ev.status = EventStatus.Cancelled;
        emit EventCancelled(eventId);
    }

    function getEvent(uint256 eventId) external view returns (EventInfo memory) {
        if (events[eventId].eventId == 0) revert InvalidEvent();
        return events[eventId];
    }

    // -------------------------- Ticket purchase --------------------------
    function buyTicket(uint256 eventId, uint256 quantity) external payable whenNotPaused nonReentrant {
        EventInfo storage ev = events[eventId];
        if (ev.eventId == 0) revert InvalidEvent();
        if (ev.status != EventStatus.Active) revert EventNotActive();
        if (block.timestamp >= ev.eventDate) revert EventCompleted();
        if (ev.minted + quantity > ev.maxSupply) revert ExceedsSupply();
        uint256 walletCount = walletPurchases[msg.sender][eventId];
        if (walletCount + quantity > ev.maxPerWallet) revert ExceedsWalletLimit();
        uint256 totalPrice = ev.price * quantity;
        if (msg.value < totalPrice) revert InsufficientPayment();
        // Mint tickets
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = totalSupply() + 1;
            _safeMint(msg.sender, tokenId);
            tickets[tokenId] = TicketInfo({
                tokenId: tokenId,
                eventId: eventId,
                isUsed: false,
                resalePrice: 0,
                reseller: address(0)
            });
        }
        ev.minted += quantity;
        walletPurchases[msg.sender][eventId] = walletCount + quantity;
        // Refund excess ETH if any
        if (msg.value > totalPrice) {
            payable(msg.sender).transfer(msg.value - totalPrice);
        }
        emit TicketPurchased(msg.sender, eventId, quantity);
    }

    // -------------------------- Resale --------------------------
    function listForResale(uint256 tokenId, uint256 resalePrice) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        TicketInfo storage t = tickets[tokenId];
        if (t.isUsed) revert TicketAlreadyUsed();
        if (resalePrice > events[t.eventId].maxResalePrice) revert PriceExceedsMax();
        if (t.resalePrice != 0) revert TicketAlreadyListed();
        t.resalePrice = resalePrice;
        t.reseller = msg.sender;
        emit TicketListed(tokenId, resalePrice, msg.sender);
    }

    function buyResaleTicket(uint256 tokenId) external payable nonReentrant {
        TicketInfo storage t = tickets[tokenId];
        if (t.resalePrice == 0) revert TransferNotAllowed();
        if (msg.value < t.resalePrice) revert InsufficientPayment();
        address seller = t.reseller;
        // Transfer NFT
        _safeTransfer(seller, msg.sender, tokenId, "");
        // Pay seller
        payable(seller).transfer(t.resalePrice);
        // Clear resale info
        t.resalePrice = 0;
        t.reseller = address(0);
        emit TicketResale(msg.sender, tokenId, t.resalePrice);
    }

    // -------------------------- Check‑in --------------------------
    function checkIn(uint256 tokenId, bytes calldata signature) external {
        TicketInfo storage t = tickets[tokenId];
        if (t.isUsed) revert TicketAlreadyUsed();
        // Verify gate staff role for the event
        if (!gateStaff[t.eventId][msg.sender]) revert NotGateStaff();
        // Verify signature of ticket owner over tokenId, eventId, and contract address
        address owner = ownerOf(tokenId);
        bytes32 hash = keccak256(abi.encodePacked(tokenId, t.eventId, address(this)));
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        if (recovered != owner) revert InvalidSignature();
        // Mark used
        t.isUsed = true;
        emit TicketCheckedIn(tokenId, msg.sender);
    }

    // -------------------------- Refund --------------------------
    function claimRefund(uint256 tokenId) external nonReentrant {
        TicketInfo storage t = tickets[tokenId];
        EventInfo storage ev = events[t.eventId];
        if (ev.status != EventStatus.Cancelled) revert RefundNotAvailable();
        if (ownerOf(tokenId) != msg.sender) revert TicketNotOwned();
        if (t.isUsed) revert TicketAlreadyUsed(); // used tickets cannot be refunded
        // Burn NFT
        _burn(tokenId);
        // Refund price (original price stored per event)
        uint256 amount = ev.price;
        payable(msg.sender).transfer(amount);
        emit RefundClaimed(msg.sender, tokenId, amount);
    }

    // -------------------------- Withdraw --------------------------
    function withdrawFunds(uint256 eventId) external nonReentrant {
        EventInfo storage ev = events[eventId];
        if (ev.organizer != msg.sender) revert NotOrganizer();
        if (ev.status == EventStatus.Cancelled) revert EventCancelled();
        if (block.timestamp < ev.eventDate) revert EventNotActive(); // allow only after event date
        // Compute contract balance for the event (simplified: all ether collected for this event)
        uint256 balance = address(this).balance; // In a real implementation track per‑event balances.
        payable(msg.sender).transfer(balance);
        ev.status = EventStatus.Completed;
        emit FundsWithdrawn(msg.sender, eventId, balance);
    }

    // -------------------------- Transfer restriction --------------------------
    function _update(address from, address to, uint256 tokenId, address operator) internal override {
        // Allow mint (from == address(0))
        // Allow official resale (handled via buyResaleTicket which calls _safeTransfer)
        // Allow burn (to == address(0))
        // Disallow any other direct transfers
        if (from != address(0) && to != address(0)) {
            // If not a resale, block
            TicketInfo storage t = tickets[tokenId];
            if (t.resalePrice == 0) revert TransferNotAllowed();
        }
        super._update(from, to, tokenId, operator);
    }

    // -------------------------- Overrides --------------------------
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal
        whenNotPaused
        override(ERC721Enumerable, ERC721)
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    // Receive ETH
    receive() external payable {}
    fallback() external payable {}
}
