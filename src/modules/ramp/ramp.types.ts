export type RampPostStatus =
  | "care_sent"
  | "landing"
  | "selfie_received"
  | "processing"
  | "pending"
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
  status: "pending";
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
