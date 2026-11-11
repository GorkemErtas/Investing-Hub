import { ApiError } from '@investing-hub/shared/client';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  candlesResponseSchema,
  marketsResponseSchema,
  predictionSchema,
  type Interval,
  type Symbol,
} from '@investing-hub/shared/contracts';

async function get<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = z.object({ error: z.object({ code: z.string() }) }).safeParse(body);
    throw new ApiError(
      response.status,
      code.success
        ? code.data.error.code
        : response.status === 429
          ? 'RATE_LIMITED'
          : 'SERVICE_ERROR',
      'Request failed',
    );
  }
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new ApiError(502, 'INVALID_RESPONSE', 'Invalid response');
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
export const usePrediction = (symbol: Symbol) =>
  useQuery({
    queryKey: ['prediction', symbol],
    queryFn: ({ signal }) => get(`/predictions/${symbol}`, predictionSchema, signal),
    staleTime: 300000,
    retry: 1,
  });
