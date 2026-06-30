import { BlobRef, type Agent } from "@atproto/api";
import { debug } from "~/utils/logs";
import { BLUESKY_VIDEO_SERVICE_MAX_SIZE_BYTES } from "~/env";

type VideoUploadResponse = {
  jobId?: string;
  blob?: BlobRef;
  error?: string;
  message?: string;
};

type VideoJobStatusResponse = {
  blob?: BlobRef;
  error?: string;
  message?: string;
  jobStatus?: {
    state?: string;
    progress?: number;
    blob?: BlobRef;
    error?: string;
    message?: string;
  };
};

const BLUESKY_VIDEO_SERVICE_URL = "https://video.bsky.app";
type DispatchAgent = {
  sessionManager?: {
    dispatchUrl?: URL;
    pdsUrl?: URL;
    serviceUrl?: URL;
  };
  dispatchUrl?: URL;
};
const BLUESKY_VIDEO_UPLOAD_POLL_MAX_ATTEMPTS = 180;
const BLUESKY_VIDEO_UPLOAD_POLL_INTERVAL_MS = 1_000;

function getPdsAudience(agent: Agent): string {
  const dispatchAgent = agent as unknown as DispatchAgent;
  const dispatchUrl =
    dispatchAgent.dispatchUrl ??
    dispatchAgent.sessionManager?.dispatchUrl ??
    dispatchAgent.sessionManager?.pdsUrl ??
    dispatchAgent.sessionManager?.serviceUrl;

  if (!dispatchUrl || !(dispatchUrl instanceof URL)) {
    throw new Error(
      "Unable to upload video to Bluesky: could not determine PDS service URL for auth audience",
    );
  }

  const host = dispatchUrl.host;
  if (!host) {
    throw new Error(
      "Unable to upload video to Bluesky: dispatch URL does not contain a host",
    );
  }

  return `did:web:${host}`;
}

function getUploadedVideoFilename(mediaBlob: Blob): string {
  const fileName = ((mediaBlob as { name?: string }).name ?? "").trim();
  if (fileName) {
    return fileName;
  }

  return "upload.mp4";
}

async function pollVideoUploadJobStatus(args: {
  did: string;
  jobId: string;
  serviceAuthToken: string;
}): Promise<BlobRef> {
  const { did, jobId, serviceAuthToken } = args;

  for (let attempt = 0; attempt < BLUESKY_VIDEO_UPLOAD_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, BLUESKY_VIDEO_UPLOAD_POLL_INTERVAL_MS),
      );
    }

    const statusUrl = new URL(
      `${BLUESKY_VIDEO_SERVICE_URL}/xrpc/app.bsky.video.getJobStatus`,
    );
    statusUrl.searchParams.set("jobId", jobId);
    statusUrl.searchParams.set("did", did);

    const statusResponse = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${serviceAuthToken}`,
      },
    });

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text();
      throw new Error(
        `Failed to fetch Bluesky video upload job status: ${statusResponse.status} ${statusResponse.statusText} - ${errorBody}`,
      );
    }

    const statusPayload =
      (await statusResponse.json()) as VideoJobStatusResponse;

    const statusBlob = statusPayload.blob ?? statusPayload.jobStatus?.blob;
    if (statusBlob) {
      return statusBlob;
    }

    const statusError = statusPayload.jobStatus?.error ?? statusPayload.error;
    const statusMessage =
      statusPayload.jobStatus?.message ?? statusPayload.message;
    if (statusError) {
      throw new Error(
        `Bluesky video processing failed: ${statusError}${
          statusMessage ? ` - ${statusMessage}` : ""
        }`,
      );
    }

    debug("Bluesky video upload still processing", {
      jobId,
      state: statusPayload.jobStatus?.state,
      progress: statusPayload.jobStatus?.progress,
      attempt: attempt + 1,
    });
  }

  throw new Error(
    `Bluesky video upload job did not finish within ${BLUESKY_VIDEO_UPLOAD_POLL_MAX_ATTEMPTS} seconds`,
  );
}

export async function uploadLargeBlueskyVideo(mediaBlob: Blob, agent: Agent): Promise<BlobRef> {
  if (mediaBlob.size > BLUESKY_VIDEO_SERVICE_MAX_SIZE_BYTES) {
    throw new Error(
      `Video is too large for Bluesky video upload: ${mediaBlob.size} > ${BLUESKY_VIDEO_SERVICE_MAX_SIZE_BYTES} bytes`,
    );
  }

  const did = agent.did;
  if (!did) {
    throw new Error(
      "Unable to upload video to Bluesky: missing authenticated DID",
    );
  }

  const auth = await agent.com.atproto.server.getServiceAuth({
    aud: getPdsAudience(agent),
    lxm: "com.atproto.repo.uploadBlob",
    exp: Math.floor(Date.now() / 1000) + 60 * 30,
  });
  const serviceAuthToken = auth.data.token;

  const uploadUrl = new URL(
    `${BLUESKY_VIDEO_SERVICE_URL}/xrpc/app.bsky.video.uploadVideo`,
  );
  uploadUrl.searchParams.set("did", did);
  uploadUrl.searchParams.set("name", getUploadedVideoFilename(mediaBlob));

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceAuthToken}`,
      "Content-Type": mediaBlob.type || "video/mp4",
      "Content-Length": mediaBlob.size.toString(),
    },
    body: mediaBlob,
  });

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    throw new Error(
      `Failed to upload video to Bluesky video service: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorBody}`,
    );
  }

  const uploadPayload = (await uploadResponse.json()) as VideoUploadResponse;
  if (uploadPayload.blob) {
    return uploadPayload.blob;
  }

  if (!uploadPayload.jobId) {
    throw new Error(
      `Bluesky video service did not return a blob or jobId: ${
        uploadPayload.error ?? "unknown error"
      }${uploadPayload.message ? ` - ${uploadPayload.message}` : ""}`,
    );
  }

  return pollVideoUploadJobStatus({
    did,
    jobId: uploadPayload.jobId,
    serviceAuthToken,
  });
}
