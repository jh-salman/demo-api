export type RampPostStatus =
  | "care_sent"
  | "landing"
  | "selfie_received"
  | "processing"
  | "pending"
  | "pending_pick"
  | "generating"
  | "ready"
  | "posted"
  | "sent"
  | "failed";

export type RampDemoPostDto = {
  token: string;
  brandSlug: string;
  recipientPhone: string;
  recipientName: string;
  stylistName: string;
  products: string[];
  status: RampPostStatus;
  sourceType: string;
  careCardUrl: string | null;
  compositeUrl: string | null;
  caption: string | null;
  landingUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateRampRecipientRequest = {
  recipientPhone?: string;
  recipientName?: string;
};

export type StoreSharedSelfieRequest = {
  token: string;
  mediaUrl: string;
  phone?: string;
  source?: string;
  /** Optional AI edit note when re-queuing generation (regenerate / submit-capture). */
  note?: string;
};

export type StartStylistPostRequest = {
  postStyle?: string;
  recipientName?: string;
  recipientPhone?: string;
  appointmentId?: string | null;
  stylistName?: string;
  products?: string[];
  tags?: string[];
  links?: string[];
  captureType?: string;
  brandSlug?: string;
  capturePath?: string;
  visualDirection?: string;
  imageEdit?: string;
  brandLayer?: string;
  /** BEFORE BUILD poster — scene + text, no people; save once, reuse. */
  backgroundPosterUrl?: string;
  /** 2-person style reference (stylist path). Finish guide only — not face-swap. */
  stylistStyleReferenceUrl?: string;
  /** 1-person style reference (client path). Finish guide only — not face-swap. */
  clientStyleReferenceUrl?: string;
  /** @deprecated use background + style refs */
  referencePosterUrl?: string;
};

export type StartStylistPostResponse = {
  ok: true;
  token: string;
  landingUrl: string;
  status: "processing";
};

export type SubmitRampCaptureResponse = {
  ok: true;
  token: string;
  status: "generating" | "processing" | "pending";
};

export type RampStatusResponse = {
  ok: true;
  post: RampDemoPostDto;
};

export type SendRampSmsResponse = {
  ok: true;
  token: string;
  status: "sent";
  sms: {
    sent: boolean;
    mock: boolean;
    provider?: string;
    sid?: string;
  };
};

/**
 * Provider-agnostic inbound MMS / magic-link selfie. Map any SMS provider's
 * inbound webhook onto this shape: a media URL plus either the RAMP `token`
 * (when the magic link carried it) or the sender `phone`/`from` to resolve it.
 */
export type InboundMmsRequest = {
  token?: string;
  phone?: string;
  from?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  source?: string;
};

export type InboundMmsResponse = {
  ok: true;
  token: string;
  status: "generating";
  matchedBy: "token" | "phone";
};

export type RampLibraryItem = {
  token: string;
  title: string;
  caption: string | null;
  compositeUrl: string | null;
  status: RampPostStatus;
  landingUrl: string;
  createdAt: string;
};

export type RampLibraryResponse = {
  ok: true;
  items: RampLibraryItem[];
};

/** Park several candidate shots without committing a hero (S4 multi-shot review). */
export type ParkPickRequest = {
  mediaUrls?: string[];
  phone?: string;
};

export type ParkPickResponse = {
  ok: true;
  token: string;
  status: "pending_pick";
  count: number;
};

export type RampCandidatesResponse = {
  ok: true;
  token: string;
  candidates: Array<{ mediaUrl: string; createdAt: string }>;
};

export type FireClientCareCardRequest = {
  recipientPhone: string;
  recipientName?: string;
  stylistName?: string;
  products?: string[];
  appointmentId?: string | null;
  brandSlug?: string;
  /** Skip carrier SMS — return card URL for native composer (demo backup plan). */
  demoOnly?: boolean;
  /** Link cash checkout to an in-flight RAMP post (composite MMS when ready). */
  rampToken?: string;
};

export type FireClientCareCardResponse = {
  ok: true;
  token: string;
  status: "care_sent" | "card_ready";
  landingUrl: string;
  sms: {
    sent: boolean;
    mock: boolean;
    provider?: string;
    sid?: string;
  };
};
