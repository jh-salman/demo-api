export type CreateAppointmentInput = {
  clientName: string;
  service: string;
  start: Date;
  end: Date;
  color: string;
  price: number;
  notes: string;
  seriesId: string | null;
};
