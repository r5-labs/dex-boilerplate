import { ChainId, Currency, currencyEquals, JSBI, Price, Token, WETH } from '@uniswap/sdk'
import { useMemo } from 'react'
import { FUSDC, NUSD } from '../constants'
import { PairState, usePairs } from '../data/Reserves'
import { useActiveWeb3React } from '../hooks'
import { wrappedCurrency } from './wrappedCurrency'

/**
 * Returns the price in NUSD of the input currency
 * @param currency currency to compute the USDC price of
 */

type USDCByChainType = {
  readonly [chainId in ChainId]: Token
}

export const USDCByChain: USDCByChainType = {
  [ChainId.R5]: NUSD,
  [ChainId.FANTOM]: FUSDC,
  [ChainId.NEBULA]: FUSDC
}

export default function useUSDCPrice(currency?: Currency): Price | undefined {
  const { chainId } = useActiveWeb3React()
  const wrapped = wrappedCurrency(currency, chainId)
  const tokenPairs: [Currency | undefined, Currency | undefined][] = useMemo(
    () => [
      [
        chainId && wrapped && currencyEquals(WETH[chainId], wrapped) ? undefined : currency,
        chainId ? WETH[chainId] : undefined
      ],
      [
        chainId && USDCByChain[chainId] && wrapped?.equals(USDCByChain[chainId]) ? undefined : wrapped,
        chainId ? USDCByChain[chainId] : undefined
      ],
      [chainId ? WETH[chainId] : undefined, chainId ? USDCByChain[chainId] : undefined]
    ],
    [chainId, currency, wrapped]
  )
  const [[ethPairState, ethPair], [usdcPairState, usdcPair], [usdcEthPairState, usdcEthPair]] = usePairs(tokenPairs)

  return useMemo(() => {
    if (!currency || !wrapped || !chainId) {
      return undefined
    }
    // handle weth/eth
    if (wrapped.equals(WETH[chainId])) {
      if (usdcPair) {
        const price = usdcPair.priceOf(WETH[chainId])
        return new Price(currency, USDCByChain[chainId], price.denominator, price.numerator)
      } else {
        return undefined
      }
    }
    // handle usdc
    if (wrapped.equals(USDCByChain[chainId])) {
      return new Price(USDCByChain[chainId], USDCByChain[chainId], '1', '1')
    }

    const ethPairETHAmount = ethPair?.reserveOf(WETH[chainId])
    const ethPairETHUSDCValue: JSBI =
      ethPairETHAmount && usdcEthPair ? usdcEthPair.priceOf(WETH[chainId]).quote(ethPairETHAmount).raw : JSBI.BigInt(0)

    // all other tokens
    // first try the usdc pair
    if (
      usdcPairState === PairState.EXISTS &&
      usdcPair &&
      usdcPair.reserveOf(USDCByChain[chainId]).greaterThan(ethPairETHUSDCValue)
    ) {
      const price = usdcPair.priceOf(wrapped)
      return new Price(currency, USDCByChain[chainId], price.denominator, price.numerator)
    }
    if (ethPairState === PairState.EXISTS && ethPair && usdcEthPairState === PairState.EXISTS && usdcEthPair) {
      if (
        usdcEthPair.reserveOf(USDCByChain[chainId]).greaterThan('0') &&
        ethPair.reserveOf(WETH[chainId]).greaterThan('0')
      ) {
        const ethUsdcPrice = usdcEthPair.priceOf(USDCByChain[chainId])
        const currencyEthPrice = ethPair.priceOf(WETH[chainId])
        const usdcPrice = ethUsdcPrice.multiply(currencyEthPrice).invert()
        return new Price(currency, USDCByChain[chainId], usdcPrice.denominator, usdcPrice.numerator)
      }
    }
    return undefined
  }, [chainId, currency, ethPair, ethPairState, usdcEthPair, usdcEthPairState, usdcPair, usdcPairState, wrapped])
}
