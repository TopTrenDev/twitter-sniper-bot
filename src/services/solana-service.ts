import {
  Connection,
  VersionedTransaction,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import bs58 from "bs58";
import axios from "axios";
import { JupiterAPI } from "./jupiter-api";
import {
  INPUT_MINT,
  MIN_TIP_AMOUNT,
  ASTRALANE_URL,
  ASTRALANE_API_KEY,
} from "../config/environment";
import { PurchaseResult, AstralaneResponse } from "../types";

const TIP = new PublicKey("astra4uejePWneqNaJKuFFA8oonqCE1sqF6b45kDMZm");

export class SolanaService {
  private connection: Connection;
  private buyer: Keypair;

  constructor(rpcUrl: string, privateKey: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.buyer = Keypair.fromSecretKey(bs58.decode(privateKey));
  }

  private deserializeInstruction(instruction: any): TransactionInstruction {
    const keys = instruction.accounts.map((key: any) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }));

    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: keys,
      data: Buffer.from(instruction.data, "base64"),
    });
  }

  private async getAddressLookupTableAccounts(
    keys: string[]
  ): Promise<AddressLookupTableAccount[]> {
    const addressLookupTableAccountInfos =
      await this.connection.getMultipleAccountsInfo(
        keys.map((key) => new PublicKey(key))
      );

    return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
      const addressLookupTableAddress = keys[index];
      if (accountInfo) {
        const addressLookupTableAccount = new AddressLookupTableAccount({
          key: new PublicKey(addressLookupTableAddress),
          state: AddressLookupTableAccount.deserialize(accountInfo.data),
        });
        acc.push(addressLookupTableAccount);
      }
      return acc;
    }, new Array<AddressLookupTableAccount>());
  }

  private async sendTxTipped(
    ixs: TransactionInstruction[],
    addressLookupTableAccounts: AddressLookupTableAccount[]
  ): Promise<AstralaneResponse> {
    // Add TIP instruction
    const tipIx = SystemProgram.transfer({
      fromPubkey: this.buyer.publicKey,
      toPubkey: TIP,
      lamports: MIN_TIP_AMOUNT,
    });

    ixs.push(tipIx);

    // Fetch recent blockhash
    const blockhash = await this.connection.getLatestBlockhash();

    // Create transaction
    const messageV0 = new TransactionMessage({
      payerKey: this.buyer.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: ixs,
    }).compileToV0Message(addressLookupTableAccounts);

    const tx = new VersionedTransaction(messageV0);
    tx.sign([this.buyer]);

    // Serialize and encode transaction to base64
    const serialized = tx.serialize();
    const encodedTx = Buffer.from(serialized).toString("base64");

    console.log(
      "The length of the serialized transaction is:",
      serialized.length
    );

    // Send transaction to Astralane endpoint
    const response = await axios.post(
      ASTRALANE_URL!,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          encodedTx,
          {
            encoding: "base64",
            skipPreflight: true,
          },
          true, // MEV-protect enabled
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          api_key: ASTRALANE_API_KEY!,
        },
      }
    );

    return response.data;
  }

  async executeTokenPurchase(
    tokenCA: string,
    amountInSOL: number
  ): Promise<PurchaseResult | false> {
    // Validate amount
    if (isNaN(amountInSOL) || amountInSOL <= 0) {
      console.error(
        `❌ Invalid amount: ${amountInSOL} SOL. Must be a positive number.`
      );
      return false;
    }

    try {
      console.log(`🚀 Executing token purchase for CA: ${tokenCA}`);
      console.log(`💰 Amount: ${amountInSOL} SOL`);

      const amountIn = Math.floor(amountInSOL * 1e9).toString(); // Convert SOL to lamports

      // Test RPC connection first
      console.log("🔍 Testing RPC connection...");
      const slot = await this.connection.getSlot();
      console.log("✅ RPC connection working, current slot:", slot);

      // Get Jupiter quote
      const quote = await JupiterAPI.getQuote(INPUT_MINT, tokenCA, amountIn);

      // Check if we have a valid quote
      if (!quote || !quote.outAmount) {
        console.error("❌ No valid quote received");
        return false;
      }

      console.log(`✅ Quote received: ${quote.outAmount} output tokens`);

      // Build swap transaction
      const instructions = await JupiterAPI.buildSwapInstructions(
        quote,
        this.buyer.publicKey.toBase58()
      );

      const {
        computeBudgetInstructions,
        setupInstructions,
        swapInstruction: swapInstructionPayload,
        cleanupInstruction: cleanupInstructionPayload,
        addressLookupTableAddresses,
      } = instructions;

      const swapInstructions: TransactionInstruction[] = [
        ...computeBudgetInstructions.map((instruction: any) =>
          this.deserializeInstruction(instruction)
        ),
        ...setupInstructions.map((instruction: any) =>
          this.deserializeInstruction(instruction)
        ),
        this.deserializeInstruction(swapInstructionPayload),
        this.deserializeInstruction(cleanupInstructionPayload),
      ];

      const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
      addressLookupTableAccounts.push(
        ...(await this.getAddressLookupTableAccounts(
          addressLookupTableAddresses
        ))
      );

      // Send via Astralane
      const astralaneResponse = await this.sendTxTipped(
        swapInstructions,
        addressLookupTableAccounts
      );

      if (astralaneResponse.result) {
        console.log("🎉 Token purchase executed successfully via Astralane!");
        console.log("📋 Transaction ID:", astralaneResponse.result);

        return {
          tokenCA: tokenCA,
          amountInSOL: amountInSOL,
          timestamp: new Date().toISOString(),
          buyTxId: astralaneResponse.result,
        };
      } else {
        console.error(
          "❌ Astralane transaction failed:",
          astralaneResponse.error
        );
        return false;
      }
    } catch (error) {
      console.error("❌ Error during token purchase:", error);
      return false;
    }
  }
}
