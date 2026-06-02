import {
  type Profile,
  type Scraper as XClient,
} from "@the-convocation/twitter-scraper";
import { type DBType } from "~/db";
import { type Ora } from "ora";
import { type MetaPost } from "~/types/post";
import z from "zod";

type SyncArgs = { log: Ora };
type ProfileArgs = SyncArgs & {
  readonly profile: Profile;
};

type CreateArgs<E extends z.ZodObject> = {
  readonly xClient: XClient;
  readonly env: z.output<E>;
  readonly db: DBType;
  readonly slot: number;
  readonly log: Ora;
};

export const envString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1),
);

export const envStringWithDefault = (defaultValue: string) =>
  z
    .preprocess(
      (value) =>
        typeof value === "string" ? value.trim() || undefined : value,
      z.string().default(defaultValue),
    )
    .pipe(z.string().trim().min(1));

function normalizeURLString(value: string) {
  const trimmed = value.trim();
  const urlString = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(urlString).href.replace(/\/$/, "");
  } catch {
    return urlString;
  }
}

const httpURLString = z.url().refine(
  (value) => {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  },
  { message: "must be an HTTP(S) URL" },
);

const httpURL = httpURLString.transform((value) => new URL(value));

export const envURL = z.preprocess((value) => {
  if (value instanceof URL) {
    return normalizeURLString(value.href);
  }

  return typeof value === "string" ? normalizeURLString(value) : value;
}, httpURL);

export const envURLWithDefault = (defaultValue: string) => {
  const normalizedDefault = envURL.parse(defaultValue);

  return z.preprocess((value) => {
    const defaultedValue = value === undefined ? normalizedDefault : value;
    if (defaultedValue instanceof URL) {
      return normalizeURLString(defaultedValue.href);
    }

    return typeof defaultedValue === "string"
      ? normalizeURLString(defaultedValue.trim() || normalizedDefault.href)
      : defaultedValue;
  }, httpURL);
};

export type SynchronizerFactory<
  E extends z.ZodObject,
  S extends z.ZodObject,
> = {
  DISPLAY_NAME: string;
  PLATFORM_ID: string;
  EMOJI: string;
  ENV_SCHEMA: E;
  STORE_SCHEMA: S;
  // Create a Synchronizer. May throw errors
  create(args: CreateArgs<E>): Promise<Synchronizer<S>>;
};

export type AnySynchronizerFactory = SynchronizerFactory<any, any>;

export type SynchronizerBase<S extends z.ZodObject> = {
  syncBio(
    args: ProfileArgs & {
      readonly bio: string;
      readonly formattedBio: string;
    },
  ): Promise<void>;

  syncUserName(args: ProfileArgs & { readonly name: string }): Promise<void>;

  syncProfilePic(args: ProfileArgs & { readonly pfpFile: File }): Promise<void>;

  syncBanner(args: ProfileArgs & { readonly bannerFile: File }): Promise<void>;

  syncPost(
    args: SyncArgs & {
      store: z.ZodSafeParseResult<z.infer<S>>;
      readonly tweet: MetaPost;
    },
  ): Promise<{
    store: z.infer<S> | undefined;
  } | void>;
};

export type Synchronizer<S extends z.ZodObject> = Partial<SynchronizerBase<S>>;
export type TaggedSynchronizer<S extends z.ZodObject = z.ZodObject> =
  Synchronizer<S> & {
    displayName: string;
    platformId: string;
    emoji: string;
    storeSchema: S;
  };

type SynchronizerFactoryDefinition<
  E extends z.ZodObject,
  S extends z.ZodObject,
> = Omit<SynchronizerFactory<E, S>, "create"> & {
  create(args: CreateArgs<E>): Promise<Synchronizer<S>>;
};

const OraSchema = z.custom<Ora>();
const ProfileSchema = z.custom<Profile>();
const XClientSchema = z.custom<XClient>();
const DBSchema = z.custom<DBType>();
const MetaPostSchema = z.custom<MetaPost>();
const FileSchema = z.custom<File>((value) => value instanceof File);

const SyncArgsSchema = z.object({
  log: OraSchema,
});

const ProfileArgsSchema = SyncArgsSchema.extend({
  profile: ProfileSchema,
});

function syncPostStoreResultSchema<S extends z.ZodObject>(storeSchema: S) {
  return z.union([
    z.object({
      success: z.literal(true),
      data: storeSchema,
    }),
    z.object({
      success: z.literal(false),
      error: z.custom<z.ZodError<z.output<S>>>(),
    }),
  ]);
}

function synchronizerSchema<S extends z.ZodObject>(storeSchema: S) {
  const syncPostOutputSchema = z.union([
    z.void(),
    z.object({
      store: storeSchema.optional(),
    }),
  ]);

  return z.object({
    syncBio: z
      .function({
        input: [
          ProfileArgsSchema.extend({
            bio: z.string(),
            formattedBio: z.string(),
          }),
        ],
        output: z.promise(z.void()),
      })
      .optional(),
    syncUserName: z
      .function({
        input: [
          ProfileArgsSchema.extend({
            name: z.string(),
          }),
        ],
        output: z.promise(z.void()),
      })
      .optional(),
    syncProfilePic: z
      .function({
        input: [
          ProfileArgsSchema.extend({
            pfpFile: FileSchema,
          }),
        ],
        output: z.promise(z.void()),
      })
      .optional(),
    syncBanner: z
      .function({
        input: [
          ProfileArgsSchema.extend({
            bannerFile: FileSchema,
          }),
        ],
        output: z.promise(z.void()),
      })
      .optional(),
    syncPost: z
      .function({
        input: [
          SyncArgsSchema.extend({
            store: syncPostStoreResultSchema(storeSchema),
            tweet: MetaPostSchema,
          }),
        ],
        output: z.promise(syncPostOutputSchema),
      })
      .optional(),
  });
}

export function defineSynchronizerFactory<
  const E extends z.ZodObject,
  const S extends z.ZodObject,
>(definition: SynchronizerFactoryDefinition<E, S>): SynchronizerFactory<E, S> {
  const createArgsSchema = z.object({
    xClient: XClientSchema,
    env: definition.ENV_SCHEMA,
    db: DBSchema,
    slot: z.number().int().nonnegative(),
    log: OraSchema,
  });

  const create = z
    .function({
      input: [createArgsSchema],
      output: synchronizerSchema(definition.STORE_SCHEMA),
    })
    .implementAsync(
      async (args) => definition.create(args as CreateArgs<E>) as any,
    );

  return z
    .object({
      DISPLAY_NAME: z.string().min(1),
      PLATFORM_ID: z.string().min(1),
      EMOJI: z.string().min(1),
      ENV_SCHEMA: z.custom<E>(),
      STORE_SCHEMA: z.custom<S>(),
      create: z.custom<SynchronizerFactory<E, S>["create"]>(),
    })
    .parse({
      ...definition,
      create,
    });
}

export function parseFactoryEnv<F extends AnySynchronizerFactory>(
  factory: F,
  args: {
    readonly source: NodeJS.ProcessEnv;
    readonly postFix: string | number;
  },
):
  | { success: true; data: z.output<F["ENV_SCHEMA"]> }
  | { success: false; message: string } {
  const env: Record<string, string> = {};
  const keys = Object.keys(factory.ENV_SCHEMA.shape);

  for (const key of keys) {
    const osKey = `${key}${args.postFix}`;
    const value = args.source[osKey];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  const parsed = factory.ENV_SCHEMA.safeParse(env);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  const message = parsed.error.issues
    .map((issue: { path: readonly PropertyKey[]; message: string }) => {
      const key = issue.path[0];
      if (typeof key === "string") {
        return `"${key}${args.postFix}" ${issue.message}`;
      }

      return issue.message;
    })
    .join(", ");

  return {
    success: false,
    message,
  };
}
