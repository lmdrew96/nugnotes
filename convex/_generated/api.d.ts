/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as apiKeys from "../apiKeys.js";
import type * as authHelpers from "../authHelpers.js";
import type * as blocks from "../blocks.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as examBrain from "../examBrain.js";
import type * as examChat from "../examChat.js";
import type * as examGames from "../examGames.js";
import type * as examRooms from "../examRooms.js";
import type * as examSimulation from "../examSimulation.js";
import type * as examToolPrompts from "../examToolPrompts.js";
import type * as examTools from "../examTools.js";
import type * as friends from "../friends.js";
import type * as http from "../http.js";
import type * as mcpApi from "../mcpApi.js";
import type * as messaging from "../messaging.js";
import type * as messagingHelpers from "../messagingHelpers.js";
import type * as nuggetChat from "../nuggetChat.js";
import type * as nuggetNotes from "../nuggetNotes.js";
import type * as parseDocument from "../parseDocument.js";
import type * as productivity from "../productivity.js";
import type * as prompts from "../prompts.js";
import type * as r2 from "../r2.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reportBug from "../reportBug.js";
import type * as sessionSharing from "../sessionSharing.js";
import type * as sessions from "../sessions.js";
import type * as studyGames from "../studyGames.js";
import type * as studyMaterial from "../studyMaterial.js";
import type * as studyRooms from "../studyRooms.js";
import type * as studyToolPrompts from "../studyToolPrompts.js";
import type * as studyTools from "../studyTools.js";
import type * as userProfiles from "../userProfiles.js";
import type * as weakSpots from "../weakSpots.js";
import type * as ydoc from "../ydoc.js";
import type * as ydocKeys from "../ydocKeys.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  apiKeys: typeof apiKeys;
  authHelpers: typeof authHelpers;
  blocks: typeof blocks;
  config: typeof config;
  crons: typeof crons;
  examBrain: typeof examBrain;
  examChat: typeof examChat;
  examGames: typeof examGames;
  examRooms: typeof examRooms;
  examSimulation: typeof examSimulation;
  examToolPrompts: typeof examToolPrompts;
  examTools: typeof examTools;
  friends: typeof friends;
  http: typeof http;
  mcpApi: typeof mcpApi;
  messaging: typeof messaging;
  messagingHelpers: typeof messagingHelpers;
  nuggetChat: typeof nuggetChat;
  nuggetNotes: typeof nuggetNotes;
  parseDocument: typeof parseDocument;
  productivity: typeof productivity;
  prompts: typeof prompts;
  r2: typeof r2;
  rateLimits: typeof rateLimits;
  reportBug: typeof reportBug;
  sessionSharing: typeof sessionSharing;
  sessions: typeof sessions;
  studyGames: typeof studyGames;
  studyMaterial: typeof studyMaterial;
  studyRooms: typeof studyRooms;
  studyToolPrompts: typeof studyToolPrompts;
  studyTools: typeof studyTools;
  userProfiles: typeof userProfiles;
  weakSpots: typeof weakSpots;
  ydoc: typeof ydoc;
  ydocKeys: typeof ydocKeys;
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

export declare const components: {
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
