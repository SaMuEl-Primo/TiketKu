// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EventTicket - tiket event NFT dengan fitur anti-calo
/// @notice Transfer bebas diblokir; perpindahan tiket hanya lewat resale
///         resmi dengan harga maksimum yang ditetapkan organizer.
contract EventTicket is ERC721, AccessControl, ReentrancyGuard {
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    bytes32 public constant GATE_ROLE = keccak256("GATE_ROLE");

    struct EventInfo {
        string name;
        address organizer;
        uint256 price;          // harga tiket (wei)
        uint256 maxSupply;
        uint256 sold;
        uint16 maxResaleBps;    // 10000 = 100% (tidak boleh di atas harga asli)
        uint64 eventDate;
    }

    struct Ticket {
        uint256 eventId;
        bool used;
    }

    uint256 public eventCount;
    uint256 public ticketCount;
    mapping(uint256 => EventInfo) public events;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => uint256) public listingPrice; // 0 = tidak dijual
    mapping(address => uint256) public pendingWithdrawals;

    bool private _resaleInProgress;

    error TransferRestricted();
    error InvalidParams();
    error EventNotFound();
    error SoldOut();
    error WrongPayment();
    error AlreadyUsed();
    error NotTicketOwner();
    error PriceAboveCap();
    error NotListed();
    error NothingToWithdraw();
    error TransferFailed();

    event EventCreated(uint256 indexed eventId, address indexed organizer, uint256 price, uint256 maxSupply);
    event TicketPurchased(uint256 indexed eventId, uint256 indexed tokenId, address indexed buyer);
    event TicketListed(uint256 indexed tokenId, uint256 price);
    event ListingCancelled(uint256 indexed tokenId);
    event TicketResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    event CheckedIn(uint256 indexed tokenId, address indexed attendee);
    event Withdrawn(address indexed account, uint256 amount);

    constructor() ERC721("EventTicket", "ETKT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ---------- Organizer ----------
    function createEvent(
        string calldata name,
        uint256 price,
        uint256 maxSupply,
        uint16 maxResaleBps,
        uint64 eventDate
    ) external onlyRole(ORGANIZER_ROLE) returns (uint256 eventId) {
        if (
            bytes(name).length == 0 || price == 0 || maxSupply == 0 ||
            maxResaleBps < 10000 || maxResaleBps > 20000 ||
            eventDate <= block.timestamp
        ) revert InvalidParams();

        eventId = ++eventCount;
        events[eventId] = EventInfo(name, msg.sender, price, maxSupply, 0, maxResaleBps, eventDate);
        emit EventCreated(eventId, msg.sender, price, maxSupply);
    }

    // ---------- Buyer: pembelian primer ----------
    function buyTicket(uint256 eventId) external payable nonReentrant returns (uint256 tokenId) {
        EventInfo storage ev = events[eventId];
        if (ev.organizer == address(0)) revert EventNotFound();
        if (ev.sold >= ev.maxSupply) revert SoldOut();
        if (msg.value != ev.price) revert WrongPayment();

        ev.sold++;
        tokenId = ++ticketCount;
        tickets[tokenId] = Ticket(eventId, false);
        pendingWithdrawals[ev.organizer] += msg.value;

        _mint(msg.sender, tokenId);
        emit TicketPurchased(eventId, tokenId, msg.sender);
    }

    // ---------- Resale terkontrol ----------
    function maxResalePrice(uint256 tokenId) public view returns (uint256) {
        EventInfo storage ev = events[tickets[tokenId].eventId];
        return (ev.price * ev.maxResaleBps) / 10000;
    }

    function listForResale(uint256 tokenId, uint256 price) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketOwner();
        if (tickets[tokenId].used) revert AlreadyUsed();
        if (price == 0) revert InvalidParams();
        if (price > maxResalePrice(tokenId)) revert PriceAboveCap();

        listingPrice[tokenId] = price;
        emit TicketListed(tokenId, price);
    }

    function cancelListing(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketOwner();
        if (listingPrice[tokenId] == 0) revert NotListed();
        delete listingPrice[tokenId];
        emit ListingCancelled(tokenId);
    }

    function buyResale(uint256 tokenId) external payable nonReentrant {
        uint256 price = listingPrice[tokenId];
        if (price == 0) revert NotListed();
        if (msg.value != price) revert WrongPayment();

        address seller = ownerOf(tokenId);
        delete listingPrice[tokenId];
        pendingWithdrawals[seller] += msg.value;

        _resaleInProgress = true;
        _transfer(seller, msg.sender, tokenId);
        _resaleInProgress = false;

        emit TicketResold(tokenId, seller, msg.sender, price);
    }

    // ---------- Check-in ----------
    function checkIn(uint256 tokenId) external onlyRole(GATE_ROLE) {
        address attendee = ownerOf(tokenId); // revert jika tiket tidak ada
        if (tickets[tokenId].used) revert AlreadyUsed();
        tickets[tokenId].used = true;
        delete listingPrice[tokenId];
        emit CheckedIn(tokenId, attendee);
    }

    // ---------- Penarikan dana (pull payment) ----------
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ---------- INTI ANTI-CALO ----------
    /// @dev Hanya mint (from == 0) atau transfer lewat buyResale yang lolos.
    ///      transferFrom / safeTransferFrom biasa selalu revert.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && !_resaleInProgress) revert TransferRestricted();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
