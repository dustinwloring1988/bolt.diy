import type { LoaderFunction } from 'react-router';
import { getApiKeysFromCookie } from '~/lib/api/cookies';

export const loader: LoaderFunction = async ({ request }) => {
  /*
   * Only export credentials explicitly configured by this browser. Server environment
   * keys belong to the deployment owner and must never be returned by a public route.
   */
  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));

  return Response.json(apiKeys, {
    headers: { 'Cache-Control': 'no-store' },
  });
};
