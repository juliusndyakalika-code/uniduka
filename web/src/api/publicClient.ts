import axios from 'axios';
import { API_BASE } from '../config';

/**
 * Bare client for the public storefront endpoints.
 *
 * Deliberately NOT the shared `api` instance: that one attaches a JWT and, on
 * 401, tries a silent refresh and then logs the user out. A shopper has no
 * session, and an owner browsing their own storefront would have theirs wiped.
 * Public endpoints take no credentials, so this instance carries none.
 */
export const publicApi = axios.create({ baseURL: `${API_BASE}/public` });

export default publicApi;
