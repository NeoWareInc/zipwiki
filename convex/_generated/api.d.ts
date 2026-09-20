/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as authRedirects from "../authRedirects.js";
import type * as deviceAuth from "../deviceAuth.js";
import type * as deviceAuthHttp from "../deviceAuthHttp.js";
import type * as http from "../http.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_adminEmails from "../lib/adminEmails.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as otp_ResendOTP from "../otp/ResendOTP.js";
import type * as plans from "../plans.js";
import type * as profiles from "../profiles.js";
import type * as settings from "../settings.js";
import type * as stripe from "../stripe.js";
import type * as stripeMutations from "../stripeMutations.js";
import type * as usage from "../usage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  authRedirects: typeof authRedirects;
  deviceAuth: typeof deviceAuth;
  deviceAuthHttp: typeof deviceAuthHttp;
  http: typeof http;
  "lib/admin": typeof lib_admin;
  "lib/adminEmails": typeof lib_adminEmails;
  "lib/crypto": typeof lib_crypto;
  "otp/ResendOTP": typeof otp_ResendOTP;
  plans: typeof plans;
  profiles: typeof profiles;
  settings: typeof settings;
  stripe: typeof stripe;
  stripeMutations: typeof stripeMutations;
  usage: typeof usage;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
