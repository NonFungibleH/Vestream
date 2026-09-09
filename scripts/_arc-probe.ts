// Verify the Arc chain wiring end to end: pool resolves, client connects,
// chain id matches, and the native currency is USDC/6 (not ETH/18).
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { makeFallbackClient, getRpcUrl } = await import("../src/lib/vesting/rpc");
  const { CHAIN_IDS, CHAIN_NAMES, TESTNET_CHAIN_IDS, EVM_CHAIN_IDS } = await import("../src/lib/vesting/types");

  for (const id of [CHAIN_IDS.ARC_TESTNET, CHAIN_IDS.ARC] as const) {
    const name = CHAIN_NAMES[id];
    const url  = getRpcUrl(id);
    const client = makeFallbackClient(id, { forLogs: true });
    let head = "unreachable", cid = "?";
    try {
      head = String(await client!.getBlockNumber());
      cid  = String(await client!.getChainId());
    } catch (e) { head = `unreachable (${(e as Error).message.split("\n")[0].slice(0, 50)})`; }
    const nc = client?.chain?.nativeCurrency;
    console.log(`${name} (${id}): rpc=${url} chainId=${cid} head=${head}`);
    console.log(`   nativeCurrency=${nc?.symbol}/${nc?.decimals}  testnet=${TESTNET_CHAIN_IDS.includes(id)}  evm=${EVM_CHAIN_IDS.includes(id)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
