const fs = require("fs");
const path = require("path");
const { ethers, network, artifacts } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network : ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  const ticket = await (await ethers.getContractFactory("EventTicket")).deploy();
  await ticket.waitForDeployment();
  const address = await ticket.getAddress();
  const tx = ticket.deploymentTransaction();
  console.log(`EventTicket deployed: ${address}`);

  // Simpan alamat + ABI untuk backend & frontend
  const artifact = await artifacts.readArtifact("EventTicket");
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, `${network.name}.json`),
    JSON.stringify(
      {
        network: network.name,
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        contract: "EventTicket",
        address,
        deployer: deployer.address,
        txHash: tx.hash,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(dir, "EventTicket.abi.json"), JSON.stringify(artifact.abi, null, 2));
  console.log(`Tersimpan di deployments/${network.name}.json dan EventTicket.abi.json`);

  if (network.name === "sepolia") {
    console.log(`\nVerifikasi: npx hardhat verify --network sepolia ${address}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
