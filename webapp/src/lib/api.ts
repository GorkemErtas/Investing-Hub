import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  candlesResponseSchema,
  marketsResponseSchema,
  predictionSchema,
  type Interval,
  type Symbol,
} from '../../shared/contracts';

async function get<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Request limit reached. Please wait a minute.'
        : 'Market service unavailable. Please try again shortly.',
    );
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new Error('The service returned data we could not validate.');
  return result.data;
}
export const useMarkets = () =>
  useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => get('/markets', marketsResponseSchema, signal),
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 1,
  });
export const useCandles = (symbol: Symbol, interval: Interval) =>
  useQuery({
    queryKey: ['candles', symbol, interval],
    queryFn: ({ signal }) =>
      get(`/candles/${symbol}?interval=${interval}`, candlesResponseSchema, signal),
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 1,
  });
export const usePrediction = (symbol: 'BTCUSDT' | 'ETHUSDT') =>
  useQuery({
    queryKey: ['prediction', symbol],
    queryFn: ({ signal }) => get(`/predictions/${symbol}`, predictionSchema, signal),
    staleTime: 300000,
    retry: 1,
  });
