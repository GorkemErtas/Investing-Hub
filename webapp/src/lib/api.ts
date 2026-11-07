import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  candlesResponseSchema,
  marketsResponseSchema,
  predictionSchema,
  type Interval,
  type Symbol,
} from '@investing-hub/shared/contracts';
import { futureAnalysisSchema } from '@investing-hub/shared/future-analysis';
import { analyticsResponseSchema } from '@investing-hub/shared/analytics';

async function get<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  service = 'Market',
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Request limit reached. Please wait a minute.'
        : `${service} service unavailable. Please try again shortly.`,
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
export const usePrediction = (symbol: Symbol) =>
  useQuery({
    queryKey: ['prediction', symbol],
    queryFn: ({ signal }) => get(`/predictions/${symbol}`, predictionSchema, signal),
    staleTime: 300000,
    retry: 1,
  });

export async function requestFutureReview(symbol: Symbol, signal: AbortSignal) {
  const response = await fetch(`/api/future-analysis/${symbol}/review`, {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowPaid: true, requestId: crypto.randomUUID() }),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Review request limit reached. Please wait before trying again.'
        : 'The review service is unavailable. Your ML forecast remains unchanged.',
    );
  const parsed = futureAnalysisSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.symbol !== symbol)
    throw new Error('The review did not pass validation. Your ML forecast remains unchanged.');
  return parsed.data;
}

export const useFutureAnalysis = (symbol: Symbol) =>
  useQuery({
    queryKey: ['future-analysis', symbol],
    queryFn: ({ signal }) =>
      get(
        `/future-analysis/${symbol}`,
        futureAnalysisSchema.refine(
          (value) => value.symbol === symbol && value.research.data === null,
        ),
        signal,
        'Future Analysis',
      ),
    staleTime: 60000,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

export const useAnalytics = (symbol: Symbol) =>
  useQuery({
    queryKey: ['analytics', symbol],
    queryFn: ({ signal }) =>
      get(
        `/analytics/${symbol}`,
        analyticsResponseSchema.refine((v) => v.symbol === symbol),
        signal,
        'Analytics Lab',
      ),
    staleTime: 60000,
    retry: 1,
  });
