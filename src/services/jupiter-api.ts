import fetch from "node-fetch";
import { JUPITER_API_BASE, SLIPPAGE_BPS } from "../config/environment";
import { JupiterQuote, JupiterSwapInstructions } from "../types";

export class JupiterAPI {
  static async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string
  ): Promise<JupiterQuote> {
    console.log("🔄 Getting Jupiter quote...");
    console.log(
      `Input: ${amount} lamports of ${inputMint} (${
        parseInt(amount) / 1e9
      } SOL)`
    );
    console.log(`Output: ${outputMint}`);
    console.log(`Slippage: ${SLIPPAGE_BPS} bps`);

    // Validate amount parameter
    const amountInt = parseInt(amount);
    if (isNaN(amountInt) || amountInt <= 0) {
      throw new Error(
        `Invalid amount parameter: ${amount}. Must be a positive integer.`
      );
    }

    try {
      const url = `${JUPITER_API_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInt}&slippageBps=${SLIPPAGE_BPS}`;

      const response = await fetch(url, {
        // @ts-ignore - timeout is supported in node-fetch
        timeout: 30000,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Jupiter API error:", errorText);
        throw new Error(
          `Jupiter API failed: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as JupiterQuote;
      console.log("✅ Quote received successfully");
      console.log(`Quote: ${data.outAmount} output tokens`);
      return data;
    } catch (error: any) {
      console.error("❌ Quote error:", error.message);
      throw error;
    }
  }

  static async buildSwapInstructions(
    quote: JupiterQuote,
    userPublicKey: string
  ): Promise<JupiterSwapInstructions> {
    console.log("🔨 Building Jupiter swap transaction...");

    try {
      const url = `${JUPITER_API_BASE}/swap-instructions`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Jupiter API swap error:", errorText);
        throw new Error(
          `Jupiter API swap failed: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as JupiterSwapInstructions;
      console.log("✅ Swap transaction built successfully");
      return data;
    } catch (error: any) {
      console.error("❌ Swap transaction build error:", error.message);
      throw error;
    }
  }
}
