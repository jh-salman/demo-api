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

export type StoreSharedSelfieRequest = {
  token: string;
  mediaUrl: string;
  phone?: string;
  source?: string;
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
