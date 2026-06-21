import { SimplePool } from "nostr-tools/pool";
import type { Event, EventTemplate } from "nostr-tools/core";
import { finalizeEvent, getPublicKey, generateSecretKey } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";

export type { Event };

/** Hashtag that ties the whole community together. */
export const DRY_JULY_TAG = "dryjuly";

/** NIP-78 application identifier for our private app data (replaceable). */
export const APP_DATA_D = "dryjuly:v1";
export const APP_DATA_KIND = 30078;

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.primal.net",
  "wss://nostr.wine"
];

/** A NIP-07 capable browser extension, if installed. */
interface Nip07 {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate & { pubkey?: string }): Promise<Event>;
}

declare global {
  interface Window {
    nostr?: Nip07;
  }
}

export type Identity =
  | { kind: "nip07"; pubkey: string }
  | { kind: "local"; pubkey: string; secret: Uint8Array };

export function hasExtension(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

/** Generate a brand new local keypair. */
export function createLocalIdentity(): Identity {
  const secret = generateSecretKey();
  return { kind: "local", pubkey: getPublicKey(secret), secret };
}

/** Restore a local identity from an nsec (bech32) or 64-char hex string. */
export function identityFromSecret(input: string): Identity {
  const trimmed = input.trim();
  let secret: Uint8Array;
  if (trimmed.startsWith("nsec")) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "nsec") throw new Error("Not a valid nsec key");
    secret = decoded.data;
  } else if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    secret = hexToBytes(trimmed);
  } else {
    throw new Error("Enter a valid nsec… or 64-character hex key");
  }
  return { kind: "local", pubkey: getPublicKey(secret), secret };
}

export async function connectExtension(): Promise<Identity> {
  if (!window.nostr) throw new Error("No Nostr extension found");
  const pubkey = await window.nostr.getPublicKey();
  return { kind: "nip07", pubkey };
}

export function npub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function nsec(secret: Uint8Array): string {
  return nip19.nsecEncode(secret);
}

export function shortNpub(pubkey: string): string {
  const n = npub(pubkey);
  return `${n.slice(0, 12)}…${n.slice(-6)}`;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/** A single shared relay pool for the lifetime of the app. */
export const pool = new SimplePool();

/** Sign an event template with whichever identity we have. */
export async function sign(
  identity: Identity,
  template: EventTemplate
): Promise<Event> {
  if (identity.kind === "local") {
    return finalizeEvent(template, identity.secret);
  }
  if (!window.nostr) throw new Error("Extension disappeared");
  return window.nostr.signEvent(template);
}

/** Publish to all relays; resolves once at least one accepts (or all fail). */
export async function publish(
  identity: Identity,
  template: EventTemplate,
  relays = DEFAULT_RELAYS
): Promise<Event> {
  const event = await sign(identity, template);
  const results = pool.publish(relays, event);
  // Wait for the fastest success but don't hang on slow relays.
  await Promise.race([
    Promise.any(results).catch(() => undefined),
    new Promise((r) => setTimeout(r, 4000))
  ]);
  return event;
}

/** Fetch the newest event matching a filter, or null. */
export async function fetchLatest(
  filter: Parameters<typeof pool.get>[1],
  relays = DEFAULT_RELAYS
): Promise<Event | null> {
  try {
    return await pool.get(relays, filter);
  } catch {
    return null;
  }
}

export type FeedItem = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
};

/** Subscribe to the community feed (top-level posts only). */
export function subscribeFeed(
  onEvent: (item: FeedItem) => void,
  relays = DEFAULT_RELAYS
): () => void {
  const sub = pool.subscribeMany(
    relays,
    { kinds: [1], "#t": [DRY_JULY_TAG], limit: 50 },
    {
      onevent(e) {
        // Skip replies — they surface threaded under their parent instead.
        if (e.tags.some((t) => t[0] === "e")) return;
        onEvent({
          id: e.id,
          pubkey: e.pubkey,
          content: e.content,
          created_at: e.created_at
        });
      }
    }
  );
  return () => sub.close();
}

/** Like a post with a NIP-25 reaction (kind 7). */
export async function react(
  identity: Identity,
  target: { id: string; pubkey: string },
  relays = DEFAULT_RELAYS
): Promise<void> {
  await publish(
    identity,
    {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", target.id],
        ["p", target.pubkey]
      ],
      content: "+"
    },
    relays
  );
}

/** Reply to a post with a NIP-10 threaded note (kind 1). */
export async function reply(
  identity: Identity,
  target: { id: string; pubkey: string },
  content: string,
  relays = DEFAULT_RELAYS
): Promise<Event> {
  return publish(
    identity,
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", target.id, "", "root"],
        ["p", target.pubkey],
        ["t", DRY_JULY_TAG]
      ],
      content
    },
    relays
  );
}

/** Pick the e-tag of an event that points at one of the tracked posts. */
function targetIdFor(tags: string[][], known: Set<string>): string | null {
  const eTags = tags.filter((t) => t[0] === "e" && t[1]);
  const reply = eTags.find((t) => t[3] === "reply");
  const root = eTags.find((t) => t[3] === "root");
  const candidate = reply?.[1] ?? root?.[1] ?? eTags[eTags.length - 1]?.[1];
  return candidate && known.has(candidate) ? candidate : null;
}

/** Track likes & replies for a set of post ids. Returns an unsubscribe fn. */
export function subscribeInteractions(
  ids: string[],
  on: {
    like: (targetId: string, pubkey: string) => void;
    reply: (targetId: string, item: FeedItem) => void;
  },
  relays = DEFAULT_RELAYS
): () => void {
  if (ids.length === 0) return () => {};
  const known = new Set(ids);
  const sub = pool.subscribeMany(
    relays,
    { kinds: [1, 7], "#e": ids },
    {
      onevent(e) {
        const targetId = targetIdFor(e.tags, known);
        if (!targetId) return;
        if (e.kind === 7) {
          if (e.content === "-") return; // a downvote — ignore
          on.like(targetId, e.pubkey);
        } else {
          on.reply(targetId, {
            id: e.id,
            pubkey: e.pubkey,
            content: e.content,
            created_at: e.created_at
          });
        }
      }
    }
  );
  return () => sub.close();
}

/** Fetch kind:0 profile metadata for a set of pubkeys. */
export async function fetchProfiles(
  pubkeys: string[],
  relays = DEFAULT_RELAYS
): Promise<Map<string, { name?: string; picture?: string }>> {
  const out = new Map<string, { name?: string; picture?: string }>();
  if (pubkeys.length === 0) return out;
  return new Promise((resolve) => {
    const sub = pool.subscribeMany(
      relays,
      { kinds: [0], authors: pubkeys },
      {
        onevent(e) {
          try {
            const meta = JSON.parse(e.content);
            out.set(e.pubkey, {
              name: meta.name || meta.display_name,
              picture: meta.picture
            });
          } catch {
            /* ignore malformed metadata */
          }
        },
        oneose() {
          sub.close();
          resolve(out);
        }
      }
    );
    setTimeout(() => {
      sub.close();
      resolve(out);
    }, 4000);
  });
}
