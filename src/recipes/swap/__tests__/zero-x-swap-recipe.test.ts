import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { ZeroXSwapRecipe } from '../zero-x-swap-recipe';
import { BigNumber } from 'ethers';
import { RecipeERC20Info, RecipeInput } from '../../../models/export-models';
import { NETWORK_CONFIG, NetworkName } from '@railgun-community/shared-models';
import { initCookbook } from '../../../init';
import { ZeroXQuote, ZeroXSwapQuoteData } from '../../../api/zero-x';
import Sinon, { SinonStub } from 'sinon';

chai.use(chaiAsPromised);
const { expect } = chai;

const spender = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const sellTokenAddress =
  NETWORK_CONFIG[NetworkName.Ethereum].baseToken.wrappedAddress;
const buyTokenAddress = '0xe76C6c83af64e4C60245D8C7dE953DF673a7A33D';

const sellToken: RecipeERC20Info = {
  tokenAddress: sellTokenAddress,
  isBaseToken: false,
};

const buyToken: RecipeERC20Info = {
  tokenAddress: buyTokenAddress,
};

const slippagePercentage = 0.01;

const quote: ZeroXSwapQuoteData = {
  sellTokenValue: '10000',
  spender,
  populatedTransaction: {
    to: '0x1234',
    value: BigNumber.from(0),
    data: '0x5678',
  },
  buyERC20Amount: {
    tokenAddress: buyTokenAddress,
    amount: BigNumber.from('500'),
  },
  minimumBuyAmount: BigNumber.from('495'),

  // base token - 0x's filler address
  sellTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',

  // Unused
  price: BigNumber.from(0),
  guaranteedPrice: BigNumber.from(0),
  slippagePercentage,
};

let stub0xQuote: SinonStub;

describe('zero-x-swap-recipe', () => {
  before(() => {
    initCookbook('25', '25');
    stub0xQuote = Sinon.stub(ZeroXQuote, 'getSwapQuote').resolves(quote);
  });

  after(() => {
    stub0xQuote.resetBehavior();
  });

  it('Should create zero-x-swap-recipe with amount', async () => {
    const recipe = new ZeroXSwapRecipe(sellToken, buyToken, slippagePercentage);

    const recipeInput: RecipeInput = {
      networkName: NetworkName.Ethereum,
      unshieldERC20Amounts: [
        {
          tokenAddress: sellTokenAddress,
          isBaseToken: false,
          amount: BigNumber.from('12000'),
        },
      ],
      unshieldNFTs: [],
    };
    const output = await recipe.getRecipeOutput(recipeInput);

    expect(output.stepOutputs.length).to.equal(4);

    expect(output.stepOutputs[0]).to.deep.equal({
      name: 'Unshield',
      description: 'Unshield ERC20s and NFTs from private RAILGUN balance.',
      feeERC20AmountRecipients: [
        {
          amount: BigNumber.from('30'),
          recipient: 'RAILGUN Unshield Fee',
          tokenAddress: sellTokenAddress,
        },
      ],
      outputERC20Amounts: [
        {
          tokenAddress: sellTokenAddress,
          expectedBalance: BigNumber.from('11970'),
          minBalance: BigNumber.from('11970'),
          approvedSpender: undefined,
          isBaseToken: false,
        },
      ],
      outputNFTs: [],
      populatedTransactions: [],
      spentERC20Amounts: [],
      spentNFTs: [],
    });

    expect(output.stepOutputs[1]).to.deep.equal({
      name: 'Approve ERC20 Spender',
      description: 'Approves ERC20 for spender contract.',
      feeERC20AmountRecipients: [],
      outputERC20Amounts: [
        {
          approvedSpender: spender,
          expectedBalance: BigNumber.from('11970'),
          minBalance: BigNumber.from('11970'),
          tokenAddress: sellTokenAddress,
          isBaseToken: false,
        },
      ],
      outputNFTs: [],
      populatedTransactions: [
        {
          data: '0x095ea7b3000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000000002ec2',
          to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        },
      ],
      spentERC20Amounts: [],
      spentNFTs: [],
    });

    expect(output.stepOutputs[2]).to.deep.equal({
      name: '0x Exchange Swap',
      description: 'Swaps two ERC20 tokens using 0x Exchange DEX Aggregator.',
      feeERC20AmountRecipients: [],
      outputERC20Amounts: [
        {
          approvedSpender: undefined,
          expectedBalance: BigNumber.from('500'),
          minBalance: BigNumber.from('495'),
          tokenAddress: buyTokenAddress,
          isBaseToken: undefined,
        },
        {
          approvedSpender: spender,
          expectedBalance: BigNumber.from('1970'),
          minBalance: BigNumber.from('1970'),
          tokenAddress: sellTokenAddress,
          isBaseToken: false,
        },
      ],
      outputNFTs: [],
      populatedTransactions: [
        {
          data: '0x5678',
          to: '0x1234',
          value: BigNumber.from(0),
        },
      ],
      spentERC20Amounts: [
        {
          amount: BigNumber.from('10000'),
          isBaseToken: false,
          tokenAddress: sellTokenAddress,
          recipient: '0x Exchange',
        },
      ],
      spentNFTs: [],
    });

    expect(output.stepOutputs[3]).to.deep.equal({
      name: 'Shield',
      description: 'Shield ERC20s and NFTs into private RAILGUN balance.',
      feeERC20AmountRecipients: [
        {
          amount: BigNumber.from('1'),
          recipient: 'RAILGUN Shield Fee',
          tokenAddress: buyTokenAddress,
        },
        {
          amount: BigNumber.from('4'),
          recipient: 'RAILGUN Shield Fee',
          tokenAddress: sellTokenAddress,
        },
      ],
      outputERC20Amounts: [
        {
          approvedSpender: undefined,
          expectedBalance: BigNumber.from('499'),
          minBalance: BigNumber.from('499'),
          tokenAddress: buyTokenAddress,
          isBaseToken: undefined,
        },
        {
          approvedSpender: spender,
          expectedBalance: BigNumber.from('1966'),
          minBalance: BigNumber.from('1966'),
          tokenAddress: sellTokenAddress,
          isBaseToken: false,
        },
      ],
      outputNFTs: [],
      populatedTransactions: [],
      spentERC20Amounts: [],
      spentNFTs: [],
    });

    expect(output.shieldERC20Addresses).to.deep.equal([
      sellTokenAddress,
      buyTokenAddress,
    ]);

    expect(output.shieldNFTs).to.deep.equal([]);

    const populatedTransactionsFlattened = output.stepOutputs.flatMap(
      stepOutput => stepOutput.populatedTransactions,
    );
    expect(output.populatedTransactions).to.deep.equal(
      populatedTransactionsFlattened,
    );

    expect(output.feeERC20AmountRecipients).to.deep.equal([
      {
        amountString: '30',
        recipientAddress: 'RAILGUN Unshield Fee',
        tokenAddress: sellTokenAddress,
      },
      {
        amountString: '1',
        recipientAddress: 'RAILGUN Shield Fee',
        tokenAddress: buyTokenAddress,
      },
      {
        amountString: '4',
        recipientAddress: 'RAILGUN Shield Fee',
        tokenAddress: sellTokenAddress,
      },
    ]);
  });

  it('Should test zero-x-swap-recipe error cases', async () => {
    const recipe = new ZeroXSwapRecipe(sellToken, buyToken, slippagePercentage);

    // No matching erc20 inputs
    const recipeInputNoMatch: RecipeInput = {
      networkName: NetworkName.Ethereum,
      unshieldERC20Amounts: [
        {
          tokenAddress: '0x1234',
          amount: BigNumber.from('12000'),
        },
      ],
      unshieldNFTs: [],
    };
    await expect(recipe.getRecipeOutput(recipeInputNoMatch)).to.be.rejectedWith(
      'Swap Recipe inputs must contain sell ERC20 Amount: 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    );

    // Too low balance for erc20 input
    const recipeInputTooLow: RecipeInput = {
      networkName: NetworkName.Ethereum,
      unshieldERC20Amounts: [
        {
          tokenAddress: sellTokenAddress,
          isBaseToken: false,
          amount: BigNumber.from('2000'),
        },
      ],
      unshieldNFTs: [],
    };
    await expect(recipe.getRecipeOutput(recipeInputTooLow)).to.be.rejectedWith(
      '0x Exchange Swap step failed. Specified amount 10000 exceeds balance 1995.',
    );
  });
});