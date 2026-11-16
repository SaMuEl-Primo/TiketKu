const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const PRICE = ethers.parseEther("0.1");
const CAP_BPS = 11000; // maksimum resale 110%

async function deployFixture() {
  const [admin, organizer, gate, buyer1, buyer2, stranger] = await ethers.getSigners();
  const ticket = await (await ethers.getContractFactory("EventTicket")).deploy();
  await ticket.grantRole(await ticket.ORGANIZER_ROLE(), organizer.address);
  await ticket.grantRole(await ticket.GATE_ROLE(), gate.address);
  const date = (await time.latest()) + 30 * 24 * 3600;
  return { ticket, admin, organizer, gate, buyer1, buyer2, stranger, date };
}

async function eventFixture() {
  const f = await deployFixture();
  await f.ticket.connect(f.organizer).createEvent("Konser A", PRICE, 2, CAP_BPS, f.date);
  return f;
}

async function boughtFixture() {
  const f = await eventFixture();
  await f.ticket.connect(f.buyer1).buyTicket(1, { value: PRICE });
  return f; // tokenId 1 milik buyer1
}

describe("EventTicket", () => {
  describe("createEvent", () => {
    it("organizer bisa membuat event", async () => {
      const { ticket, organizer, date } = await loadFixture(deployFixture);
      await expect(ticket.connect(organizer).createEvent("Konser A", PRICE, 100, CAP_BPS, date))
        .to.emit(ticket, "EventCreated").withArgs(1, organizer.address, PRICE, 100);
    });
    it("GAGAL: Buyer tidak bisa createEvent", async () => {
      const { ticket, buyer1, date } = await loadFixture(deployFixture);
      await expect(ticket.connect(buyer1).createEvent("X", PRICE, 10, CAP_BPS, date))
        .to.be.revertedWithCustomError(ticket, "AccessControlUnauthorizedAccount");
    });
    it("GAGAL: parameter tidak valid", async () => {
      const { ticket, organizer, date } = await loadFixture(deployFixture);
      const c = ticket.connect(organizer);
      await expect(c.createEvent("", PRICE, 10, CAP_BPS, date)).to.be.revertedWithCustomError(ticket, "InvalidParams");
      await expect(c.createEvent("X", 0, 10, CAP_BPS, date)).to.be.revertedWithCustomError(ticket, "InvalidParams");
      await expect(c.createEvent("X", PRICE, 0, CAP_BPS, date)).to.be.revertedWithCustomError(ticket, "InvalidParams");
      await expect(c.createEvent("X", PRICE, 10, 9000, date)).to.be.revertedWithCustomError(ticket, "InvalidParams");
      await expect(c.createEvent("X", PRICE, 10, CAP_BPS, 1)).to.be.revertedWithCustomError(ticket, "InvalidParams");
    });
  });

  describe("buyTicket", () => {
    it("buyer bisa membeli dan menerima NFT", async () => {
      const { ticket, buyer1 } = await loadFixture(eventFixture);
      await expect(ticket.connect(buyer1).buyTicket(1, { value: PRICE }))
        .to.emit(ticket, "TicketPurchased").withArgs(1, 1, buyer1.address);
      expect(await ticket.ownerOf(1)).to.equal(buyer1.address);
    });
    it("GAGAL: pembayaran salah", async () => {
      const { ticket, buyer1 } = await loadFixture(eventFixture);
      await expect(ticket.connect(buyer1).buyTicket(1, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(ticket, "WrongPayment");
    });
    it("GAGAL: event tidak ada", async () => {
      const { ticket, buyer1 } = await loadFixture(eventFixture);
      await expect(ticket.connect(buyer1).buyTicket(99, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "EventNotFound");
    });
    it("GAGAL: tiket habis", async () => {
      const { ticket, buyer1, buyer2, stranger } = await loadFixture(eventFixture);
      await ticket.connect(buyer1).buyTicket(1, { value: PRICE });
      await ticket.connect(buyer2).buyTicket(1, { value: PRICE });
      await expect(ticket.connect(stranger).buyTicket(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "SoldOut");
    });
  });

  describe("Anti-calo: _update", () => {
    it("GAGAL: transferFrom bebas ditolak", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer1).transferFrom(buyer1.address, buyer2.address, 1))
        .to.be.revertedWithCustomError(ticket, "TransferRestricted");
    });
    it("GAGAL: safeTransferFrom ditolak", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await expect(
        ticket.connect(buyer1)["safeTransferFrom(address,address,uint256)"](buyer1.address, buyer2.address, 1)
      ).to.be.revertedWithCustomError(ticket, "TransferRestricted");
    });
    it("GAGAL: transfer via approval ditolak", async () => {
      const { ticket, buyer1, buyer2, stranger } = await loadFixture(boughtFixture);
      await ticket.connect(buyer1).approve(stranger.address, 1);
      await expect(ticket.connect(stranger).transferFrom(buyer1.address, buyer2.address, 1))
        .to.be.revertedWithCustomError(ticket, "TransferRestricted");
    });
  });

  describe("Resale", () => {
    it("listing di batas maksimum diterima & buyResale memindahkan tiket", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      const cap = (PRICE * BigInt(CAP_BPS)) / 10000n;
      await expect(ticket.connect(buyer1).listForResale(1, cap)).to.emit(ticket, "TicketListed").withArgs(1, cap);
      await expect(ticket.connect(buyer2).buyResale(1, { value: cap }))
        .to.emit(ticket, "TicketResold").withArgs(1, buyer1.address, buyer2.address, cap);
      expect(await ticket.ownerOf(1)).to.equal(buyer2.address);
      expect(await ticket.pendingWithdrawals(buyer1.address)).to.equal(cap);
    });
    it("GAGAL: resale di atas batas ditolak", async () => {
      const { ticket, buyer1 } = await loadFixture(boughtFixture);
      const cap = (PRICE * BigInt(CAP_BPS)) / 10000n;
      await expect(ticket.connect(buyer1).listForResale(1, cap + 1n))
        .to.be.revertedWithCustomError(ticket, "PriceAboveCap");
    });
    it("GAGAL: non-owner tidak bisa listing", async () => {
      const { ticket, buyer2 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer2).listForResale(1, PRICE))
        .to.be.revertedWithCustomError(ticket, "NotTicketOwner");
    });
    it("GAGAL: buyResale tanpa listing / salah bayar", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer2).buyResale(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "NotListed");
      await ticket.connect(buyer1).listForResale(1, PRICE);
      await expect(ticket.connect(buyer2).buyResale(1, { value: PRICE + 1n }))
        .to.be.revertedWithCustomError(ticket, "WrongPayment");
    });
    it("cancelListing membatalkan penjualan", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await ticket.connect(buyer1).listForResale(1, PRICE);
      await ticket.connect(buyer1).cancelListing(1);
      await expect(ticket.connect(buyer2).buyResale(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "NotListed");
    });
  });

  describe("checkIn", () => {
    it("gate bisa check-in", async () => {
      const { ticket, gate, buyer1 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(gate).checkIn(1)).to.emit(ticket, "CheckedIn").withArgs(1, buyer1.address);
      expect((await ticket.tickets(1)).used).to.equal(true);
    });
    it("GAGAL: checkIn dua kali ditolak", async () => {
      const { ticket, gate } = await loadFixture(boughtFixture);
      await ticket.connect(gate).checkIn(1);
      await expect(ticket.connect(gate).checkIn(1)).to.be.revertedWithCustomError(ticket, "AlreadyUsed");
    });
    it("GAGAL: bukan gate / tiket tidak ada", async () => {
      const { ticket, gate, buyer1 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer1).checkIn(1))
        .to.be.revertedWithCustomError(ticket, "AccessControlUnauthorizedAccount");
      await expect(ticket.connect(gate).checkIn(99)).to.be.reverted;
    });
    it("GAGAL: tiket terpakai tidak bisa dijual ulang", async () => {
      const { ticket, gate, buyer1 } = await loadFixture(boughtFixture);
      await ticket.connect(gate).checkIn(1);
      await expect(ticket.connect(buyer1).listForResale(1, PRICE))
        .to.be.revertedWithCustomError(ticket, "AlreadyUsed");
    });
  });

  describe("withdraw", () => {
    it("organizer menarik hasil penjualan", async () => {
      const { ticket, organizer } = await loadFixture(boughtFixture);
      await expect(ticket.connect(organizer).withdraw()).to.changeEtherBalance(organizer, PRICE);
      expect(await ticket.pendingWithdrawals(organizer.address)).to.equal(0);
    });
    it("GAGAL: tidak ada saldo", async () => {
      const { ticket, stranger } = await loadFixture(boughtFixture);
      await expect(ticket.connect(stranger).withdraw())
        .to.be.revertedWithCustomError(ticket, "NothingToWithdraw");
    });
  });
});
