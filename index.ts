import { ethers } from 'ethers';
import { Client, Presets } from "userop";

// Create a random private key or read existing one from environment variable
const privateKey = process.env.OWNER_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey;
const bundlerRpcUrl = process.env.BUNDLER_RPC || '<your-bundler-rpc-here>';

async function main() {
  // Create a wallet instance from the private key
  const owner = new ethers.Wallet(privateKey);

  // Entry point and factory addresses for Polygon Mumbai testnet
  const entryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
  const factoryAddress = '0x9406Cc6185a346906296840746125a0E44976454';

  const smartAccount = await Presets.Builder.SimpleAccount.init(
    owner,
    bundlerRpcUrl,
    {
      entryPoint: entryPointAddress,
      factory: factoryAddress,
    }
  );
  console.log('smart wallet address', smartAccount.getSender());

  const client = await Client.init(bundlerRpcUrl, {
    entryPoint: entryPointAddress,
  });

  const result = await client.sendUserOperation(
    smartAccount.execute(smartAccount.getSender(), 0, "0x"),
  );

  const event = await result.wait();
  console.log(`Transaction hash: ${event?.transactionHash}`);
}

main().catch(console.error);