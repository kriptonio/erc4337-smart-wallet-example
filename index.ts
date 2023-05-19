import { SimpleAccountAPI } from '@account-abstraction/sdk';
import { deepHexlify } from '@account-abstraction/utils';
import { ethers } from 'ethers';
import { resolveProperties } from 'ethers/lib/utils';

// Create a random private key or read existing one from environment variable
const privateKey = process.env.OWNER_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey;
const bundlerRpcUrl = process.env.BUNDLER_RPC || '<your-bundler-rpc-here>';

async function main() {

  // Create a wallet instance from the private key
  const owner = new ethers.Wallet(privateKey);

  // Polygon Mumbai testnet RPC endpoint
  const provider = new ethers.providers.JsonRpcProvider(bundlerRpcUrl);

  // Entry point and factory addresses for Polygon Mumbai testnet
  const entryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
  const factoryAddress = '0x9406Cc6185a346906296840746125a0E44976454';

  const smartWallet = new SimpleAccountAPI({
    provider,
    entryPointAddress,
    owner,
    factoryAddress
  });
  console.log('wallet address', owner.address);

  const userOp = deepHexlify(await resolveProperties(
    await smartWallet.createSignedUserOp({
      target: await smartWallet.getAccountAddress(),
      value: 0,
      data: '0x',
    })
  ));

  const gasEstimate = await provider.send("eth_estimateUserOperationGas", [
    userOp,
    entryPointAddress,
  ]);

  userOp.preVerificationGas = gasEstimate.preVerificationGas;
  userOp.verificationGasLimit = gasEstimate.verificationGas;
  userOp.callGasLimit = gasEstimate.callGasLimit;

  const packedUserOp = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "bytes32",
    ],
    [
      userOp.sender,
      userOp.nonce,
      ethers.utils.keccak256(userOp.initCode),
      ethers.utils.keccak256(userOp.callData),
      userOp.callGasLimit,
      userOp.verificationGasLimit,
      userOp.preVerificationGas,
      userOp.maxFeePerGas,
      userOp.maxPriorityFeePerGas,
      ethers.utils.keccak256(userOp.paymasterAndData),
    ]
  );

  const packedSignFields = ethers.utils.defaultAbiCoder.encode(
    ["bytes32", "address", "uint256"],
    [ethers.utils.keccak256(packedUserOp), entryPointAddress, (await provider.getNetwork()).chainId]
  );

  const userOpHash = ethers.utils.keccak256(packedSignFields);
  userOp.signature = await owner.signMessage(ethers.utils.arrayify(userOpHash));

  const result = await provider.send("eth_sendUserOperation", [
    userOp,
    entryPointAddress,
  ]);

  console.log('waiting for transaction...');
  const details = await waitTransaction(result, provider, entryPointAddress);
  console.log(`transaction: ${details.transactionHash}`);
}

async function waitTransaction(userOpHash: string, provider: ethers.providers.JsonRpcProvider, entryPointAddress: string) {
  const waitIntervalMs = 1000;
  const block = await provider.getBlock("latest");
  const retryCount = 10;
  let currentRetry = 0;

  while (true) {
    // Retrieve the events
    const events = await provider.getLogs({
      address: entryPointAddress,
      topics: [ethers.utils.id('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)')],
      fromBlock: block.number - 10,
    });

    if (events.length > 0) {
      const event = events.find((e) => {
        return e.topics.includes(userOpHash);
      });

      if (event) {
        return event;
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, waitIntervalMs)
    );

    currentRetry++;

    if (currentRetry > retryCount) {
      throw new Error('Could not find trasaction receipt');
    }
  }
}

main().catch(console.error);