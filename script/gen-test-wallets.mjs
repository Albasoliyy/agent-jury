// Generate FRESH testnet-only wallets for the Agent Jury testnet demo.
// TESTNET ONLY — these keys hold no real funds and must NEVER be used on
// mainnet or committed to any repo. Run once; the keys land in
// ~/workspace/agent-jury/.testnet-wallets.json (mode 600).
import { Wallet } from "/home/hatch/workspace/ethers-check/node_modules/ethers/lib.esm/index.js";
import { writeFileSync, chmodSync } from "node:fs";

const roles = ["deployer", "client", "worker", "juror0", "juror1", "juror2", "juror3", "juror4", "juror5", "juror6"];
const out = {};
for (const role of roles) {
  const w = Wallet.createRandom();
  out[role] = { address: w.address, privateKey: w.privateKey };
}
const path = "/home/hatch/workspace/agent-jury/.testnet-wallets.json";
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
chmodSync(path, 0o600);
console.log("Wrote", path, "(mode 600)");
for (const role of roles) console.log(role.padEnd(9), out[role].address);
