import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../ui/ApiError.ts';

// The try page's queries. A refusal of the server (a bad link, an expired try)
// shows at once; a network or server error is asked once more. The page reads
// the try again when its tab comes back into view, which is how it learns that
// the try's 7 days ended while it was open.
export function tryQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
      },
    },
  });
}
